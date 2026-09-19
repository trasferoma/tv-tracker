import { describe, expect, it } from 'vitest';

import { backupFileName, buildBackupFile, collectProgressEvents, collectShowsSnapshot } from './backupExport';
import type { Episode, ProgressEvent, Season, TrackedShow } from '@/domain/trackedShow';
import type {
    ChangeProviderOutcome,
    TrackedShowListener,
    TrackedShowsListener,
    TrackedShowStore
} from '@/persistence/trackedShowStore';

function buildEpisode(seasonNumber: number, episodeNumber: number): Episode {
    return { providerEpisodeId: `s${seasonNumber}e${episodeNumber}`, seasonNumber, episodeNumber, title: 'Episodio' };
}

function buildSeason(seasonNumber: number): Season {
    return { providerSeasonId: `season-${seasonNumber}`, seasonNumber, episodes: [buildEpisode(seasonNumber, 1)] };
}

function buildShow(id: string): TrackedShow {
    return {
        id,
        catalogProvider: 'tmdb',
        providerShowId: `provider-${id}`,
        title: 'Serie di prova',
        status: 'In corso',
        seasons: [buildSeason(1)],
        italianProviders: [],
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
    };
}

function buildEvent(id: string, trackedShowId: string): ProgressEvent {
    return {
        id,
        trackedShowId,
        confirmedEpisodeId: 's1e1',
        seasonNumber: 1,
        episodeNumber: 1,
        episodeTitle: 'Episodio',
        confirmedAt: '2026-01-05T00:00:00.000Z',
        confirmedBy: 'fabio'
    };
}

function buildStoreWithSnapshot(
    shows: readonly TrackedShow[],
    allProgressEvents: readonly ProgressEvent[]
): TrackedShowStore {
    const notImplemented = (): Promise<never> => Promise.reject(new Error('non usato in questo test'));
    return {
        subscribeToTrackedShows: (listener: TrackedShowsListener) => {
            listener(shows);
            return () => {};
        },
        subscribeToShow: (_id: string, listener: TrackedShowListener) => {
            listener(undefined);
            return () => {};
        },
        addShow: notImplemented,
        updateCatalog: notImplemented,
        changeProvider: (): Promise<ChangeProviderOutcome> => Promise.reject(new Error('non usato in questo test')),
        advanceProgress: notImplemented,
        undoLastProgress: notImplemented,
        removeShow: notImplemented,
        listAllProgressEvents: () => Promise.resolve(allProgressEvents),
        replaceAllShows: () => Promise.reject(new Error('non usato in questo test'))
    };
}

describe('buildBackupFile', () => {
    it('produce formatVersion 1, l\'istante di esportazione e l\'elenco completo di serie ed eventi', () => {
        const shows = [buildShow('show-1')];
        const progressEvents = [buildEvent('event-1', 'show-1')];
        const exportedAt = new Date(2026, 0, 20, 10, 30);

        const backup = buildBackupFile(shows, progressEvents, exportedAt);

        expect(backup.formatVersion).toBe(1);
        expect(backup.exportedAt).toBe(exportedAt.toISOString());
        expect(backup.shows).toEqual(shows);
        expect(backup.progressEvents).toEqual(progressEvents);
    });
});

describe('backupFileName', () => {
    it('usa la data catalogo del giorno di esportazione', () => {
        const exportedAt = new Date(2026, 0, 20, 23, 45);

        expect(backupFileName(exportedAt)).toBe('tv-tracker-backup-2026-01-20.json');
    });
});

describe('collectShowsSnapshot', () => {
    it('legge lo stato corrente delle serie tramite la sottoscrizione, una sola volta', async () => {
        const shows = [buildShow('show-1'), buildShow('show-2')];
        const store = buildStoreWithSnapshot(shows, []);

        const snapshot = await collectShowsSnapshot(store);

        expect(snapshot).toEqual(shows);
    });
});

describe('collectProgressEvents', () => {
    it('raccoglie tutti gli eventi restituiti dallo store, di qualunque serie', async () => {
        const shows = [buildShow('show-1'), buildShow('show-2')];
        const allProgressEvents = [
            buildEvent('event-1', 'show-1'),
            buildEvent('event-2', 'show-2'),
            buildEvent('event-3', 'show-2')
        ];
        const store = buildStoreWithSnapshot(shows, allProgressEvents);

        const events = await collectProgressEvents(store);

        expect(events).toEqual(allProgressEvents);
    });
});
