import { liveQuery } from 'dexie';

import { tvTrackerDatabase } from './tvTrackerDatabase';
import type {
    AddShowOutcome,
    ChangeListingOutcome,
    ChangeProviderOutcome,
    ChangeVisibilityOutcome,
    RemoveShowOutcome,
    ReplaceAllShowsOutcome,
    TrackedShowListener,
    TrackedShowsListener,
    TrackedShowStore,
    Unsubscribe,
    UpdateCatalogOutcome
} from './trackedShowStore';
import { advanceProgress as computeAdvance } from '@/domain/progressAdvance';
import { resetProgress as computeReset } from '@/domain/progressReset';
import { undoLastProgress as computeUndo } from '@/domain/progressUndo';
import { isHiddenShow, withHiddenShow, withListedShow, type ShowListing } from '@/domain/showListing';
import { resolveShowAudience, withPrivateVisibility, withSharedVisibility, type ShowAudience } from '@/domain/showVisibility';
import type {
    InitialPositionChoice,
    ItalianProvider,
    ProgressEvent,
    ProgressOutcome,
    ResetProgressOutcome,
    TrackedShow
} from '@/domain/trackedShow';

const SHOW_NOT_FOUND_REASON = 'La serie non esiste più: potrebbe essere stata rimossa da un altro dispositivo.';
const DUPLICATE_SHOW_REASON = 'Questa serie è già stata aggiunta.';
const DUPLICATE_HIDDEN_SHOW_REASON =
    'Questa serie è già stata aggiunta ed è nascosta dall\'elenco: puoi riportarla in elenco dal suo dettaglio.';
const VISIBILITY_COLLISION_REASONS: Record<ShowAudience['kind'], string> = {
    shared: 'Questa serie è già condivisa in una scheda a parte: rimuovine una prima di renderla condivisa.',
    private: 'Hai già una scheda solo tua di questa serie: rimuovila prima di rendere privata anche questa.'
};

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

function audiencesCollide(first: ShowAudience, second: ShowAudience): boolean {
    if (first.kind === 'shared' && second.kind === 'shared') {
        return true;
    }
    return first.kind === 'private' && second.kind === 'private' && first.profileId === second.profileId;
}

async function findDuplicateForAudience(
    providerShowId: string,
    targetAudience: ShowAudience
): Promise<TrackedShow | undefined> {
    const candidates = await tvTrackerDatabase.trackedShows.where('providerShowId').equals(providerShowId).toArray();
    return candidates.find((candidate) => audiencesCollide(resolveShowAudience(candidate), targetAudience));
}

async function addShow(show: TrackedShow): Promise<AddShowOutcome> {
    const targetAudience = resolveShowAudience(show);
    const duplicate = await findDuplicateForAudience(show.providerShowId, targetAudience);
    if (duplicate !== undefined) {
        const reason = isHiddenShow(duplicate) ? DUPLICATE_HIDDEN_SHOW_REASON : DUPLICATE_SHOW_REASON;
        return { outcome: 'rejected', reason };
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

function applyAudience(show: TrackedShow, targetAudience: ShowAudience, updatedAt: string): TrackedShow {
    const showWithNewAudience = targetAudience.kind === 'shared'
        ? withSharedVisibility(show)
        : withPrivateVisibility(show, targetAudience.profileId);
    return { ...showWithNewAudience, updatedAt };
}

async function findVisibilityCollision(
    show: TrackedShow,
    targetAudience: ShowAudience
): Promise<TrackedShow | undefined> {
    const candidates = await tvTrackerDatabase.trackedShows.where('providerShowId').equals(show.providerShowId).toArray();
    return candidates.find(
        (candidate) => candidate.id !== show.id && audiencesCollide(resolveShowAudience(candidate), targetAudience)
    );
}

async function changeVisibility(
    id: string,
    targetAudience: ShowAudience,
    updatedAt: string
): Promise<ChangeVisibilityOutcome> {
    const show = await tvTrackerDatabase.trackedShows.get(id);
    if (show === undefined) {
        return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
    }
    const collision = await findVisibilityCollision(show, targetAudience);
    if (collision !== undefined) {
        return { outcome: 'rejected', reason: VISIBILITY_COLLISION_REASONS[targetAudience.kind] };
    }
    const updatedShow = applyAudience(show, targetAudience, updatedAt);
    await tvTrackerDatabase.trackedShows.put(updatedShow);
    return { outcome: 'changed' };
}

function applyListing(show: TrackedShow, targetListing: ShowListing, updatedAt: string): TrackedShow {
    const showWithNewListing = targetListing === 'hidden' ? withHiddenShow(show) : withListedShow(show);
    return { ...showWithNewListing, updatedAt };
}

async function changeListing(id: string, targetListing: ShowListing, updatedAt: string): Promise<ChangeListingOutcome> {
    const show = await tvTrackerDatabase.trackedShows.get(id);
    if (show === undefined) {
        return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
    }
    const updatedShow = applyListing(show, targetListing, updatedAt);
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

async function resetProgress(
    id: string,
    targetPosition: InitialPositionChoice,
    resetAt: string,
    today: string
): Promise<ResetProgressOutcome> {
    return tvTrackerDatabase.transaction(
        'rw',
        tvTrackerDatabase.trackedShows,
        tvTrackerDatabase.progressEvents,
        async (): Promise<ResetProgressOutcome> => {
            const show = await tvTrackerDatabase.trackedShows.get(id);
            if (show === undefined) {
                return { outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON };
            }
            const outcome = computeReset(show, targetPosition, resetAt, today);
            if (outcome.outcome === 'rejected') {
                return outcome;
            }
            await tvTrackerDatabase.trackedShows.put(outcome.show);
            await tvTrackerDatabase.progressEvents.where('trackedShowId').equals(id).delete();
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
    changeVisibility,
    changeListing,
    advanceProgress,
    undoLastProgress,
    resetProgress,
    removeShow,
    listAllProgressEvents,
    replaceAllShows
};
