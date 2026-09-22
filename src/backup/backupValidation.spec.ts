import { describe, expect, it } from 'vitest';

import { validateBackupFile } from './backupValidation';
import type { Episode, ItalianProvider, ProgressEvent, Season, TrackedShow } from '@/domain/trackedShow';

function buildEpisode(seasonNumber: number, episodeNumber: number, airDate = '2026-01-01'): Episode {
    return {
        providerEpisodeId: `s${seasonNumber}e${episodeNumber}`,
        seasonNumber,
        episodeNumber,
        title: `S${seasonNumber}E${episodeNumber}`,
        airDate
    };
}

function buildSeason(seasonNumber: number, episodes: readonly Episode[]): Season {
    return { providerSeasonId: `season-${seasonNumber}`, seasonNumber, episodes };
}

function buildShow(overrides: Partial<TrackedShow> = {}): TrackedShow {
    const providers: readonly ItalianProvider[] = [{ id: 'netflix', name: 'Netflix' }];
    return {
        id: 'show-1',
        catalogProvider: 'tmdb',
        providerShowId: 'tmdb-1',
        title: 'Serie di prova',
        status: 'In corso',
        seasons: [buildSeason(1, [buildEpisode(1, 1), buildEpisode(1, 2)])],
        italianProviders: providers,
        selectedStreamingProviderId: 'netflix',
        selectedStreamingProviderName: 'Netflix',
        visibility: 'shared',
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides
    };
}

function buildEvent(overrides: Partial<ProgressEvent> = {}): ProgressEvent {
    return {
        id: 'event-1',
        trackedShowId: 'show-1',
        confirmedEpisodeId: 's1e1',
        seasonNumber: 1,
        episodeNumber: 1,
        episodeTitle: 'S1E1',
        confirmedAt: '2026-01-05T00:00:00.000Z',
        confirmedBy: 'fabio',
        ...overrides
    };
}

function buildBackupFilePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        formatVersion: 2,
        exportedAt: '2026-01-20T10:00:00.000Z',
        shows: [buildShow()],
        progressEvents: [buildEvent()],
        ...overrides
    };
}

describe('validateBackupFile', () => {
    it('accetta un file corretto e restituisce il contenuto tipizzato', () => {
        const show = buildShow();
        const event = buildEvent();

        const result = validateBackupFile(buildBackupFilePayload({ shows: [show], progressEvents: [event] }));

        expect(result.valid).toBe(true);
        if (result.valid) {
            expect(result.backup.formatVersion).toBe(2);
            expect(result.backup.shows).toEqual([show]);
            expect(result.backup.progressEvents).toEqual([event]);
        }
    });

    it('rifiuta un input che non è un oggetto', () => {
        expect(validateBackupFile('non un oggetto').valid).toBe(false);
    });

    it('rifiuta un file in formato versione 1, nominando la versione attesa e quella trovata', () => {
        const outcome = validateBackupFile(buildBackupFilePayload({ formatVersion: 1 }));

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
            expect(outcome.reason).toContain('attesa 2');
            expect(outcome.reason).toContain('trovata 1');
        }
    });

    it('rifiuta una versione del formato ignota', () => {
        const outcome = validateBackupFile(buildBackupFilePayload({ formatVersion: 3 }));

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
            expect(outcome.reason).toContain('Versione del formato');
        }
    });

    it('rifiuta un file troncato senza il campo shows', () => {
        const outcome = validateBackupFile({ formatVersion: 2, exportedAt: '2026-01-20T10:00:00.000Z' });

        expect(outcome.valid).toBe(false);
    });

    it('rifiuta una data episodio in un formato diverso da YYYY-MM-DD', () => {
        const invalidShow = buildShow({ seasons: [buildSeason(1, [buildEpisode(1, 1, '01/01/2026')])] });

        const outcome = validateBackupFile(buildBackupFilePayload({ shows: [invalidShow] }));

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
            expect(outcome.reason).toContain('YYYY-MM-DD');
        }
    });

    it('rifiuta un lastWatchedEpisodeId che non corrisponde a nessun episodio della serie', () => {
        const invalidShow = buildShow({ lastWatchedEpisodeId: 's9e9' });

        const outcome = validateBackupFile(buildBackupFilePayload({ shows: [invalidShow] }));

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
            expect(outcome.reason).toContain('lastWatchedEpisodeId');
        }
    });

    it('accetta un lastWatchedEpisodeId presente fra gli episodi della serie', () => {
        const validShow = buildShow({ lastWatchedEpisodeId: 's1e1' });

        const outcome = validateBackupFile(buildBackupFilePayload({ shows: [validShow] }));

        expect(outcome.valid).toBe(true);
    });

    it('rifiuta un progressRevision non intero', () => {
        const invalidShow = buildShow({ progressRevision: 1.5 });

        const outcome = validateBackupFile(buildBackupFilePayload({ shows: [invalidShow] }));

        expect(outcome.valid).toBe(false);
    });

    it('rifiuta un catalogProvider diverso da tmdb', () => {
        const invalidShow = { ...buildShow(), catalogProvider: 'altro' };

        const outcome = validateBackupFile(buildBackupFilePayload({ shows: [invalidShow] }));

        expect(outcome.valid).toBe(false);
    });

    it('accetta una serie privata con privateFor valorizzato', () => {
        const validShow = buildShow({ visibility: 'private', privateFor: 'fabio' });

        const outcome = validateBackupFile(buildBackupFilePayload({ shows: [validShow] }));

        expect(outcome.valid).toBe(true);
    });

    it('rifiuta una serie privata senza privateFor', () => {
        const invalidShow = buildShow({ visibility: 'private' });

        const outcome = validateBackupFile(buildBackupFilePayload({ shows: [invalidShow] }));

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
            expect(outcome.reason).toContain('privateFor');
        }
    });

    it('rifiuta una serie condivisa con privateFor valorizzato', () => {
        const invalidShow = buildShow({ visibility: 'shared', privateFor: 'fabio' });

        const outcome = validateBackupFile(buildBackupFilePayload({ shows: [invalidShow] }));

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
            expect(outcome.reason).toContain('privateFor');
        }
    });

    it('rifiuta una serie priva del campo visibility', () => {
        const rawShow: Record<string, unknown> = { ...buildShow() };
        delete rawShow.visibility;

        const outcome = validateBackupFile(buildBackupFilePayload({ shows: [rawShow] }));

        expect(outcome.valid).toBe(false);
    });

    it('accetta una serie priva del campo hidden e la rilegge come in elenco', () => {
        const rawShow: Record<string, unknown> = { ...buildShow() };
        delete rawShow.hidden;

        const outcome = validateBackupFile(buildBackupFilePayload({ shows: [rawShow] }));

        expect(outcome.valid).toBe(true);
        if (outcome.valid) {
            expect(outcome.backup.shows[0]?.hidden).toBeUndefined();
        }
    });

    it('accetta una serie con hidden true e la rilegge nascosta', () => {
        const hiddenShow = buildShow({ hidden: true });

        const outcome = validateBackupFile(buildBackupFilePayload({ shows: [hiddenShow] }));

        expect(outcome.valid).toBe(true);
        if (outcome.valid) {
            expect(outcome.backup.shows[0]?.hidden).toBe(true);
        }
    });

    it('accetta una serie con hidden false', () => {
        const listedShow = buildShow({ hidden: false });

        const outcome = validateBackupFile(buildBackupFilePayload({ shows: [listedShow] }));

        expect(outcome.valid).toBe(true);
    });

    it('rifiuta un hidden che non è un valore booleano', () => {
        const invalidShow = { ...buildShow(), hidden: 'sì' };

        const outcome = validateBackupFile(buildBackupFilePayload({ shows: [invalidShow] }));

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
            expect(outcome.reason).toContain('hidden');
        }
    });

    it('rifiuta un evento senza confirmedEpisodeId', () => {
        const rawEvent: Record<string, unknown> = { ...buildEvent() };
        delete rawEvent.confirmedEpisodeId;

        const outcome = validateBackupFile(buildBackupFilePayload({ progressEvents: [rawEvent] }));

        expect(outcome.valid).toBe(false);
        if (!outcome.valid) {
            expect(outcome.reason).toContain('confirmedEpisodeId');
        }
    });
});
