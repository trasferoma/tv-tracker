import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildBackupFile, collectProgressEvents, collectShowsSnapshot } from './backupExport';
import { applyMergeImport, applyReplaceImport, planImport } from './backupImport';
import { validateBackupFile } from './backupValidation';
import type { BackupFile } from './backupFormat';
import { localTrackedShowStore } from '@/persistence/localTrackedShowStore';
import { tvTrackerDatabase } from '@/persistence/tvTrackerDatabase';
import type { Episode, ProgressEvent, Season, TrackedShow } from '@/domain/trackedShow';

const TODAY = '2026-02-01';

function buildEpisode(seasonNumber: number, episodeNumber: number, airDate = '2026-01-01'): Episode {
    return {
        providerEpisodeId: `s${seasonNumber}e${episodeNumber}`,
        seasonNumber,
        episodeNumber,
        title: `S${seasonNumber}E${episodeNumber}`,
        airDate
    };
}

function buildSeason(seasonNumber: number, episodeCount: number): Season {
    const episodes = Array.from({ length: episodeCount }, (_, index) => buildEpisode(seasonNumber, index + 1));
    return { providerSeasonId: `season-${seasonNumber}`, seasonNumber, episodes };
}

function buildShow(overrides: Partial<TrackedShow> = {}): TrackedShow {
    return {
        id: `show-${Math.random().toString(36).slice(2)}`,
        catalogProvider: 'tmdb',
        providerShowId: 'tmdb-1',
        title: 'Serie di prova',
        status: 'In corso',
        seasons: [buildSeason(1, 3)],
        italianProviders: [{ id: 'netflix', name: 'Netflix' }],
        selectedStreamingProviderId: 'netflix',
        selectedStreamingProviderName: 'Netflix',
        visibility: 'shared',
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides
    };
}

function buildBackup(shows: readonly TrackedShow[], progressEvents: readonly ProgressEvent[] = []): BackupFile {
    return { formatVersion: 2, exportedAt: '2026-02-01T00:00:00.000Z', shows, progressEvents };
}

afterEach(async () => {
    vi.restoreAllMocks();
    await tvTrackerDatabase.trackedShows.clear();
    await tvTrackerDatabase.progressEvents.clear();
});

describe('planImport', () => {
    it('conta nuove, già presenti e più recenti nel file', () => {
        const stableLocal = buildShow({ providerShowId: 'stable' });
        const staleInFile = buildShow({ providerShowId: 'stale-local', updatedAt: '2026-01-01T00:00:00.000Z' });
        const staleUpdated = { ...staleInFile, updatedAt: '2026-03-01T00:00:00.000Z' };
        const brandNew = buildShow({ providerShowId: 'new-in-file' });
        const backup = buildBackup([stableLocal, staleUpdated, brandNew]);

        const plan = planImport(backup, [stableLocal, staleInFile], []);

        expect(plan.summary).toEqual({
            totalInFile: 3,
            newCount: 1,
            alreadyPresentCount: 2,
            newerThanLocalCount: 1
        });
    });

    it('conserva la copia più recente per id, unità di merge la serie intera', () => {
        const olderLocal = buildShow({ id: 'show-1', title: 'Titolo vecchio', updatedAt: '2026-01-01T00:00:00.000Z' });
        const newerInFile = { ...olderLocal, title: 'Titolo nuovo', updatedAt: '2026-03-01T00:00:00.000Z' };
        const backup = buildBackup([newerInFile]);

        const plan = planImport(backup, [olderLocal], []);

        expect(plan.mergedShows).toEqual([newerInFile]);
    });

    it('mantiene la copia locale quando è più recente di quella nel file', () => {
        const newerLocal = buildShow({ id: 'show-1', title: 'Titolo locale', updatedAt: '2026-03-01T00:00:00.000Z' });
        const olderInFile = { ...newerLocal, title: 'Titolo dal file', updatedAt: '2026-01-01T00:00:00.000Z' };
        const backup = buildBackup([olderInFile]);

        const plan = planImport(backup, [newerLocal], []);

        expect(plan.mergedShows).toEqual([newerLocal]);
    });

    it('porta con sé gli eventi della copia vincente, non li mescola con quelli della copia perdente', () => {
        const olderLocal = buildShow({ id: 'show-1', updatedAt: '2026-01-01T00:00:00.000Z' });
        const newerInFile = { ...olderLocal, updatedAt: '2026-03-01T00:00:00.000Z' };
        const localEvent: ProgressEvent = {
            id: 'local-event',
            trackedShowId: 'show-1',
            confirmedEpisodeId: 's1e1',
            seasonNumber: 1,
            episodeNumber: 1,
            episodeTitle: 'S1E1',
            confirmedAt: '2026-01-02T00:00:00.000Z',
            confirmedBy: 'fabio'
        };
        const fileEvent: ProgressEvent = { ...localEvent, id: 'file-event', confirmedBy: 'irene' };
        const backup = buildBackup([newerInFile], [fileEvent]);

        const plan = planImport(backup, [olderLocal], [localEvent]);

        expect(plan.mergedProgressEvents).toEqual([fileEvent]);
    });
});

describe('applyReplaceImport', () => {
    it('sostituisce tutte le serie con quelle del file e restituisce l\'esito pieno, attraverso il contratto dello store', async () => {
        const existing = buildShow({ providerShowId: 'existing' });
        await localTrackedShowStore.addShow(existing);
        const replacement = buildShow({ providerShowId: 'replacement' });
        const backup = buildBackup([replacement]);

        const outcome = await applyReplaceImport(localTrackedShowStore, backup);

        expect(outcome).toEqual({ outcome: 'replaced' });
        const allShows = await tvTrackerDatabase.trackedShows.toArray();
        expect(allShows).toEqual([replacement]);
    });
});

describe('applyMergeImport', () => {
    it('scrive nel database il piano di unione, serie ed eventi, e restituisce l\'esito pieno', async () => {
        const local = buildShow({ providerShowId: 'local-only' });
        await localTrackedShowStore.addShow(local);
        const fromFile = buildShow({ providerShowId: 'from-file' });
        const plan = planImport(buildBackup([fromFile]), [local], []);

        const outcome = await applyMergeImport(localTrackedShowStore, plan);

        expect(outcome).toEqual({ outcome: 'replaced' });
        const allShows = await tvTrackerDatabase.trackedShows.toArray();
        expect(allShows.map((show) => show.providerShowId).sort()).toEqual(['from-file', 'local-only']);
    });
});

describe('un file troncato non tocca il database', () => {
    it('la validazione fallisce e nessuna serie viene scritta o rimossa', async () => {
        const existing = buildShow({ providerShowId: 'existing' });
        await localTrackedShowStore.addShow(existing);

        const validation = validateBackupFile({ formatVersion: 2, exportedAt: '2026-01-01T00:00:00.000Z' });

        expect(validation.valid).toBe(false);
        const allShows = await tvTrackerDatabase.trackedShows.toArray();
        expect(allShows).toEqual([existing]);
    });
});

describe('esportazione e reimportazione', () => {
    it('lasciano lo stato identico dopo un giro completo', async () => {
        const show = buildShow();
        await localTrackedShowStore.addShow(show);
        await localTrackedShowStore.advanceProgress(show.id, 's1e1', 'fabio', TODAY);

        const showsBefore = await tvTrackerDatabase.trackedShows.toArray();
        const eventsBefore = await tvTrackerDatabase.progressEvents.toArray();

        const shows = await collectShowsSnapshot(localTrackedShowStore);
        const progressEvents = await collectProgressEvents(localTrackedShowStore);
        const backup = buildBackupFile(shows, progressEvents, new Date('2026-02-01T00:00:00.000Z'));
        const fileContent = JSON.parse(JSON.stringify(backup)) as unknown;
        const validation = validateBackupFile(fileContent);
        expect(validation.valid).toBe(true);
        if (!validation.valid) {
            return;
        }

        await applyReplaceImport(localTrackedShowStore, validation.backup);

        const showsAfter = await tvTrackerDatabase.trackedShows.toArray();
        const eventsAfter = await tvTrackerDatabase.progressEvents.toArray();
        expect(showsAfter).toEqual(showsBefore);
        expect(eventsAfter).toEqual(eventsBefore);
    });
});
