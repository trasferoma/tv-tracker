import { liveQuery } from 'dexie';

import { tvTrackerDatabase } from './tvTrackerDatabase';
import type {
    AddShowOutcome,
    ChangeProviderOutcome,
    RemoveShowOutcome,
    ReplaceAllShowsOutcome,
    TrackedShowListener,
    TrackedShowsListener,
    TrackedShowStore,
    Unsubscribe,
    UpdateCatalogOutcome
} from './trackedShowStore';
import { advanceProgress as computeAdvance } from '@/domain/progressAdvance';
import { undoLastProgress as computeUndo } from '@/domain/progressUndo';
import type { ItalianProvider, ProgressEvent, ProgressOutcome, TrackedShow } from '@/domain/trackedShow';

const SHOW_NOT_FOUND_REASON = 'La serie non esiste più: potrebbe essere stata rimossa da un altro dispositivo.';

function readDeviceInstant(): string {
    return new Date().toISOString();
}

function subscribeToTrackedShows(listener: TrackedShowsListener): Unsubscribe {
    const subscription = liveQuery(() => tvTrackerDatabase.trackedShows.toArray()).subscribe(listener);
    return () => subscription.unsubscribe();
}

function subscribeToShow(id: string, listener: TrackedShowListener): Unsubscribe {
    const subscription = liveQuery(() => tvTrackerDatabase.trackedShows.get(id)).subscribe(listener);
    return () => subscription.unsubscribe();
}

async function addShow(show: TrackedShow): Promise<AddShowOutcome> {
    const duplicate = await tvTrackerDatabase.trackedShows.where('providerShowId').equals(show.providerShowId).first();
    if (duplicate !== undefined) {
        return { outcome: 'rejected', reason: 'Questa serie è già stata aggiunta.' };
    }
    await tvTrackerDatabase.trackedShows.add(show);
    return { outcome: 'added' };
}

async function updateCatalog(show: TrackedShow): Promise<UpdateCatalogOutcome> {
    const existing = await tvTrackerDatabase.trackedShows.get(show.id);
    if (existing === undefined) {
        return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
    }
    await tvTrackerDatabase.trackedShows.put(show);
    return { outcome: 'updated' };
}

async function changeProvider(
    id: string,
    selectedProvider: ItalianProvider | undefined,
    updatedAt: string
): Promise<ChangeProviderOutcome> {
    const show = await tvTrackerDatabase.trackedShows.get(id);
    if (show === undefined) {
        return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
    }
    const updatedShow: TrackedShow = {
        ...show,
        selectedStreamingProviderId: selectedProvider?.id,
        selectedStreamingProviderName: selectedProvider?.name,
        updatedAt
    };
    await tvTrackerDatabase.trackedShows.put(updatedShow);
    return { outcome: 'changed' };
}

async function advanceProgress(
    id: string,
    targetEpisodeId: string,
    confirmedBy: string,
    today: string
): Promise<ProgressOutcome> {
    return tvTrackerDatabase.transaction(
        'rw',
        tvTrackerDatabase.trackedShows,
        tvTrackerDatabase.progressEvents,
        async (): Promise<ProgressOutcome> => {
            const show = await tvTrackerDatabase.trackedShows.get(id);
            if (show === undefined) {
                return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
            }
            const confirmedAt = readDeviceInstant();
            const outcome = computeAdvance(show, targetEpisodeId, confirmedBy, confirmedAt, today);
            if (outcome.outcome === 'rejected') {
                return outcome;
            }
            await tvTrackerDatabase.trackedShows.put(outcome.show);
            await tvTrackerDatabase.progressEvents.add(outcome.event);
            return outcome;
        }
    );
}

async function undoLastProgress(id: string, expectedRevision: number, undoneBy: string): Promise<ProgressOutcome> {
    return tvTrackerDatabase.transaction(
        'rw',
        tvTrackerDatabase.trackedShows,
        tvTrackerDatabase.progressEvents,
        async (): Promise<ProgressOutcome> => {
            const show = await tvTrackerDatabase.trackedShows.get(id);
            if (show === undefined) {
                return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
            }
            const events = await tvTrackerDatabase.progressEvents.where('trackedShowId').equals(id).toArray();
            const undoneAt = readDeviceInstant();
            const outcome = computeUndo(show, events, expectedRevision, undoneBy, undoneAt);
            if (outcome.outcome === 'rejected') {
                return outcome;
            }
            await tvTrackerDatabase.trackedShows.put(outcome.show);
            await tvTrackerDatabase.progressEvents.put(outcome.event);
            return outcome;
        }
    );
}

async function removeShow(id: string): Promise<RemoveShowOutcome> {
    return tvTrackerDatabase.transaction(
        'rw',
        tvTrackerDatabase.trackedShows,
        tvTrackerDatabase.progressEvents,
        async (): Promise<RemoveShowOutcome> => {
            const show = await tvTrackerDatabase.trackedShows.get(id);
            if (show === undefined) {
                return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
            }
            await tvTrackerDatabase.trackedShows.delete(id);
            await tvTrackerDatabase.progressEvents.where('trackedShowId').equals(id).delete();
            return { outcome: 'removed' };
        }
    );
}

async function listAllProgressEvents(): Promise<readonly ProgressEvent[]> {
    return tvTrackerDatabase.progressEvents.toArray();
}

async function replaceAllShows(
    shows: readonly TrackedShow[],
    progressEvents: readonly ProgressEvent[]
): Promise<ReplaceAllShowsOutcome> {
    await tvTrackerDatabase.transaction(
        'rw',
        tvTrackerDatabase.trackedShows,
        tvTrackerDatabase.progressEvents,
        async () => {
            await tvTrackerDatabase.trackedShows.clear();
            await tvTrackerDatabase.progressEvents.clear();
            await tvTrackerDatabase.trackedShows.bulkPut(shows);
            await tvTrackerDatabase.progressEvents.bulkPut(progressEvents);
        }
    );
    return { outcome: 'replaced' };
}

export const localTrackedShowStore: TrackedShowStore = {
    subscribeToTrackedShows,
    subscribeToShow,
    addShow,
    updateCatalog,
    changeProvider,
    advanceProgress,
    undoLastProgress,
    removeShow,
    listAllProgressEvents,
    replaceAllShows
};
