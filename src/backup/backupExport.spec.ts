import { describe, expect, it } from 'vitest';

import { backupFileName, buildBackupFile, collectProgressEvents, collectShowsSnapshot } from './backupExport';
import { validateBackupFile } from './backupValidation';
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

function buildShow(id: string, overrides: Partial<TrackedShow> = {}): TrackedShow {
    return {
        id,
        catalogProvider: 'tmdb',
        providerShowId: `provider-${id}`,
        title: 'Serie di prova',
        status: 'In corso',
        seasons: [buildSeason(1)],
        italianProviders: [],
        visibility: 'shared',
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides
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
        changeVisibility: notImplemented,
        changeListing: notImplemented,
        advanceProgress: notImplemented,
        undoLastProgress: notImplemented,
        resetProgress: notImplemented,
        removeShow: notImplemented,
        listAllProgressEvents: () => Promise.resolve(allProgressEvents),
        replaceAllShows: () => Promise.reject(new Error('non usato in questo test'))
    };
}

describe('buildBackupFile', () => {
    it('produce formatVersion 2, l\'istante di esportazione e l\'elenco completo di serie ed eventi', () => {
        const shows = [buildShow('show-1')];
        const progressEvents = [buildEvent('event-1', 'show-1')];
        const exportedAt = new Date(2026, 0, 20, 10, 30);

        const backup = buildBackupFile(shows, progressEvents, exportedAt);

        expect(backup.formatVersion).toBe(2);
        expect(backup.exportedAt).toBe(exportedAt.toISOString());
        expect(backup.shows).toEqual(shows);
        expect(backup.progressEvents).toEqual(progressEvents);
    });

    it('normalizza a condivisa una serie priva del campo di visibilità, così il file supera la propria validazione', () => {
        const legacyShow = buildShow('show-1', { visibility: undefined });
        const exportedAt = new Date(2026, 0, 20, 10, 30);

        const backup = buildBackupFile([legacyShow], [], exportedAt);

        expect(backup.shows[0]?.visibility).toBe('shared');
        expect(backup.shows[0]?.privateFor).toBeUndefined();
        const fileContent = JSON.parse(JSON.stringify(backup)) as unknown;
        const validation = validateBackupFile(fileContent);
        expect(validation.valid).toBe(true);
    });

    it('conserva la serie privata con il suo proprietario nel file esportato', () => {
        const privateShow = buildShow('show-1', { visibility: 'private', privateFor: 'fabio' });
        const exportedAt = new Date(2026, 0, 20, 10, 30);

        const backup = buildBackupFile([privateShow], [], exportedAt);

        expect(backup.shows[0]?.visibility).toBe('private');
        expect(backup.shows[0]?.privateFor).toBe('fabio');
        const fileContent = JSON.parse(JSON.stringify(backup)) as unknown;
        const validation = validateBackupFile(fileContent);
        expect(validation.valid).toBe(true);
    });

    it('normalizza a in elenco una serie con hidden false, così il file esportato non porta mai false', () => {
        const listedShow = buildShow('show-1', { hidden: false });
        const exportedAt = new Date(2026, 0, 20, 10, 30);

        const backup = buildBackupFile([listedShow], [], exportedAt);

        expect(backup.shows[0]?.hidden).toBeUndefined();
    });

    it('conserva hidden true per una serie nascosta', () => {
        const hiddenShow = buildShow('show-1', { hidden: true });
        const exportedAt = new Date(2026, 0, 20, 10, 30);

        const backup = buildBackupFile([hiddenShow], [], exportedAt);

        expect(backup.shows[0]?.hidden).toBe(true);
    });

    it('il file esportato da una serie priva sia di visibility sia di hidden supera la validazione dell\'app, come i dati reali in produzione', () => {
        const productionLikeShow = buildShow('show-1', { visibility: undefined, hidden: undefined });
        const exportedAt = new Date(2026, 0, 20, 10, 30);

        const backup = buildBackupFile([productionLikeShow], [], exportedAt);

        const fileContent = JSON.parse(JSON.stringify(backup)) as unknown;
        const validation = validateBackupFile(fileContent);
        expect(validation.valid).toBe(true);
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
