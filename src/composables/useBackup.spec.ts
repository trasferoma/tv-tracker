import { afterEach, describe, expect, it, vi } from 'vitest';

import * as backupExport from '@/backup/backupExport';
import { useBackup } from './useBackup';
import { localTrackedShowStore } from '@/persistence/localTrackedShowStore';
import { tvTrackerDatabase } from '@/persistence/tvTrackerDatabase';
import type { Episode, Season, TrackedShow } from '@/domain/trackedShow';
import type { TrackedShowStore } from '@/persistence/trackedShowStore';

function buildEpisode(seasonNumber: number, episodeNumber: number): Episode {
    return { providerEpisodeId: `s${seasonNumber}e${episodeNumber}`, seasonNumber, episodeNumber, title: 'Episodio' };
}

function buildSeason(seasonNumber: number): Season {
    return { providerSeasonId: `season-${seasonNumber}`, seasonNumber, episodes: [buildEpisode(seasonNumber, 1)] };
}

function buildShow(overrides: Partial<TrackedShow> = {}): TrackedShow {
    return {
        id: `show-${Math.random().toString(36).slice(2)}`,
        catalogProvider: 'tmdb',
        providerShowId: 'tmdb-1',
        title: 'Serie di prova',
        status: 'In corso',
        seasons: [buildSeason(1)],
        italianProviders: [],
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides
    };
}

function buildBackupContent(shows: readonly TrackedShow[]): string {
    return JSON.stringify({
        formatVersion: 1,
        exportedAt: '2026-02-01T00:00:00.000Z',
        shows,
        progressEvents: []
    });
}

function buildStoreWithPartialReplace(reason: string): TrackedShowStore {
    return {
        ...localTrackedShowStore,
        replaceAllShows: () => Promise.resolve({ outcome: 'partial', reason })
    };
}

afterEach(async () => {
    vi.restoreAllMocks();
    await tvTrackerDatabase.trackedShows.clear();
    await tvTrackerDatabase.progressEvents.clear();
});

describe('exportBackup', () => {
    it('scarica il file con il nome basato sulla data di esportazione', async () => {
        const downloadSpy = vi.spyOn(backupExport, 'downloadBackupFile').mockImplementation(() => {});
        await localTrackedShowStore.addShow(buildShow());
        const backup = useBackup({ store: localTrackedShowStore, resolveNow: () => new Date('2026-02-01T10:00:00.000Z') });

        await backup.exportBackup();

        expect(downloadSpy).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ formatVersion: 1 }), 'tv-tracker-backup-2026-02-01.json');
    });
});

describe('prepareImport', () => {
    it('rifiuta un testo che non è JSON valido, senza toccare il database', async () => {
        const existing = buildShow();
        await localTrackedShowStore.addShow(existing);
        const backup = useBackup({ store: localTrackedShowStore });

        await backup.prepareImport('non è json');

        expect(backup.importReadiness.value).toEqual({
            state: 'invalid',
            reason: 'Il file non contiene un JSON valido.'
        });
        expect(await tvTrackerDatabase.trackedShows.toArray()).toEqual([existing]);
    });

    it('rifiuta un file con versione ignota, senza toccare il database', async () => {
        const existing = buildShow();
        await localTrackedShowStore.addShow(existing);
        const backup = useBackup({ store: localTrackedShowStore });

        await backup.prepareImport(JSON.stringify({ formatVersion: 2, exportedAt: '2026-01-01', shows: [], progressEvents: [] }));

        expect(backup.importReadiness.value.state).toBe('invalid');
        expect(await tvTrackerDatabase.trackedShows.toArray()).toEqual([existing]);
    });

    it('rifiuta un file troncato, senza toccare il database', async () => {
        const existing = buildShow();
        await localTrackedShowStore.addShow(existing);
        const backup = useBackup({ store: localTrackedShowStore });

        await backup.prepareImport(JSON.stringify({ formatVersion: 1 }));

        expect(backup.importReadiness.value.state).toBe('invalid');
        expect(await tvTrackerDatabase.trackedShows.toArray()).toEqual([existing]);
    });

    it('rifiuta un lastWatchedEpisodeId che non corrisponde a nessun episodio, senza toccare il database', async () => {
        const existing = buildShow();
        await localTrackedShowStore.addShow(existing);
        const invalidShow = buildShow({ providerShowId: 'from-file', lastWatchedEpisodeId: 'sconosciuto' });
        const backup = useBackup({ store: localTrackedShowStore });

        await backup.prepareImport(buildBackupContent([invalidShow]));

        expect(backup.importReadiness.value.state).toBe('invalid');
        expect(await tvTrackerDatabase.trackedShows.toArray()).toEqual([existing]);
    });

    it('produce il riepilogo di un file valido senza scrivere nel database', async () => {
        const local = buildShow({ providerShowId: 'local' });
        await localTrackedShowStore.addShow(local);
        const fromFile = buildShow({ providerShowId: 'from-file' });
        const backup = useBackup({ store: localTrackedShowStore });

        await backup.prepareImport(buildBackupContent([local, fromFile]));

        expect(backup.importReadiness.value).toEqual({
            state: 'ready',
            summary: { totalInFile: 2, newCount: 1, alreadyPresentCount: 1, newerThanLocalCount: 0 },
            clockSkewWarning: expect.any(String)
        });
        expect(await tvTrackerDatabase.trackedShows.toArray()).toEqual([local]);
    });
});

describe('confirmMerge', () => {
    it('unisce il piano preparato, torna allo stato inattivo e dichiara l\'esito pieno', async () => {
        const local = buildShow({ providerShowId: 'local' });
        await localTrackedShowStore.addShow(local);
        const fromFile = buildShow({ providerShowId: 'from-file' });
        const backup = useBackup({ store: localTrackedShowStore });
        await backup.prepareImport(buildBackupContent([fromFile]));

        const outcome = await backup.confirmMerge();

        expect(outcome).toEqual({ outcome: 'replaced' });
        expect(backup.importReadiness.value).toEqual({ state: 'idle' });
        const allShows = await tvTrackerDatabase.trackedShows.toArray();
        expect(allShows.map((show) => show.providerShowId).sort()).toEqual(['from-file', 'local']);
    });

    it('propaga l\'esito parziale dichiarato dallo store, senza presentarlo come riuscita piena', async () => {
        const reason = 'Sincronizzate 8 serie su 10: le altre verranno riprovate al prossimo tentativo.';
        const fromFile = buildShow({ providerShowId: 'from-file' });
        const backup = useBackup({ store: buildStoreWithPartialReplace(reason) });
        await backup.prepareImport(buildBackupContent([fromFile]));

        const outcome = await backup.confirmMerge();

        expect(outcome).toEqual({ outcome: 'partial', reason });
    });
});

describe('confirmReplace', () => {
    it('sostituisce tutto con le serie del file, torna allo stato inattivo e dichiara l\'esito pieno', async () => {
        await localTrackedShowStore.addShow(buildShow({ providerShowId: 'existing' }));
        const fromFile = buildShow({ providerShowId: 'from-file' });
        const backup = useBackup({ store: localTrackedShowStore });
        await backup.prepareImport(buildBackupContent([fromFile]));

        const outcome = await backup.confirmReplace();

        expect(outcome).toEqual({ outcome: 'replaced' });
        expect(backup.importReadiness.value).toEqual({ state: 'idle' });
        expect(await tvTrackerDatabase.trackedShows.toArray()).toEqual([fromFile]);
    });

    it('propaga l\'esito parziale dichiarato dallo store, senza presentarlo come riuscita piena', async () => {
        const reason = 'Sincronizzate 8 serie su 10: le altre verranno riprovate al prossimo tentativo.';
        const fromFile = buildShow({ providerShowId: 'from-file' });
        const backup = useBackup({ store: buildStoreWithPartialReplace(reason) });
        await backup.prepareImport(buildBackupContent([fromFile]));

        const outcome = await backup.confirmReplace();

        expect(outcome).toEqual({ outcome: 'partial', reason });
    });
});

describe('cancelImport', () => {
    it('torna allo stato inattivo senza scrivere nel database', async () => {
        const existing = buildShow();
        await localTrackedShowStore.addShow(existing);
        const backup = useBackup({ store: localTrackedShowStore });
        await backup.prepareImport(buildBackupContent([buildShow({ providerShowId: 'from-file' })]));

        backup.cancelImport();

        expect(backup.importReadiness.value).toEqual({ state: 'idle' });
        expect(await tvTrackerDatabase.trackedShows.toArray()).toEqual([existing]);
    });
});
