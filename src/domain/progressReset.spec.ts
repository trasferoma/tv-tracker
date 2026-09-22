import { describe, expect, it } from 'vitest';

import { advanceProgress } from './progressAdvance';
import { resetProgress } from './progressReset';
import { undoLastProgress } from './progressUndo';
import type { Episode, Season, TrackedShow } from './trackedShow';
import { calculateWatchPosition } from './watchPosition';

const TODAY = '2026-03-01';
const RESET_AT = '2026-03-01T10:00:00Z';

function buildEpisode(seasonNumber: number, episodeNumber: number, airDate = '2026-01-01'): Episode {
    return {
        providerEpisodeId: `s${seasonNumber}e${episodeNumber}`,
        seasonNumber,
        episodeNumber,
        title: `S${seasonNumber}E${episodeNumber}`,
        airDate
    };
}

function buildSeason(seasonNumber: number, episodeCount: number, airDate = '2026-01-01'): Season {
    const episodes = Array.from({ length: episodeCount }, (_, index) => buildEpisode(seasonNumber, index + 1, airDate));
    return {
        providerSeasonId: `season-${seasonNumber}`,
        seasonNumber,
        episodes
    };
}

function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === 'object') {
        const nestedValues = Object.values(value as object);
        nestedValues.forEach(deepFreeze);
        Object.freeze(value);
    }
    return value;
}

function buildShow(seasons: readonly Season[], overrides: Partial<TrackedShow> = {}): TrackedShow {
    return {
        id: 'show-1',
        catalogProvider: 'tmdb',
        providerShowId: 'tmdb-1',
        title: 'Serie di prova',
        status: 'In corso',
        seasons,
        italianProviders: [],
        selectedStreamingProviderId: 'netflix',
        selectedStreamingProviderName: 'Netflix',
        visibility: 'private',
        privateFor: 'fabio',
        catalogUpdatedAt: '2026-01-01T00:00:00Z',
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides
    };
}

describe('resetProgress', () => {
    it('porta la posizione alla scelta, azzera lastViewedAt e incrementa la revisione (criterio 13)', () => {
        const show = buildShow([buildSeason(1, 3)], {
            lastWatchedEpisodeId: 's1e1',
            lastViewedAt: '2026-01-10T00:00:00Z',
            progressRevision: 4
        });

        const outcome = resetProgress(show, { kind: 'watchedThrough', episodeId: 's1e2' }, RESET_AT, TODAY);

        if (outcome.outcome !== 'applied') {
            throw new Error('reset inatteso rifiutato');
        }
        expect(outcome.show.lastWatchedEpisodeId).toBe('s1e2');
        expect(outcome.show.lastViewedAt).toBeUndefined();
        expect(outcome.show.progressRevision).toBe(5);
    });

    it('porta addedAt e updatedAt all\'istante del reset (criterio 13)', () => {
        const show = buildShow([buildSeason(1, 3)], { lastWatchedEpisodeId: 's1e1' });

        const outcome = resetProgress(show, { kind: 'notStarted' }, RESET_AT, TODAY);

        if (outcome.outcome !== 'applied') {
            throw new Error('reset inatteso rifiutato');
        }
        expect(outcome.show.addedAt).toBe(RESET_AT);
        expect(outcome.show.updatedAt).toBe(RESET_AT);
    });

    it('non produce alcun evento: l\'esito porta la sola serie', () => {
        const show = buildShow([buildSeason(1, 3)], { lastWatchedEpisodeId: 's1e1' });

        const outcome = resetProgress(show, { kind: 'watchedThrough', episodeId: 's1e2' }, RESET_AT, TODAY);

        if (outcome.outcome !== 'applied') {
            throw new Error('reset inatteso rifiutato');
        }
        expect('event' in outcome).toBe(false);
    });

    it('lascia invariati identificativo, stagioni, catalogUpdatedAt, piattaforma e visibilità (criterio 15)', () => {
        const seasons = [buildSeason(1, 3)];
        const show = buildShow(seasons, { lastWatchedEpisodeId: 's1e1' });

        const outcome = resetProgress(show, { kind: 'watchedThrough', episodeId: 's1e2' }, RESET_AT, TODAY);

        if (outcome.outcome !== 'applied') {
            throw new Error('reset inatteso rifiutato');
        }
        expect(outcome.show.id).toBe(show.id);
        expect(outcome.show.seasons).toBe(show.seasons);
        expect(outcome.show.catalogUpdatedAt).toBe(show.catalogUpdatedAt);
        expect(outcome.show.selectedStreamingProviderId).toBe(show.selectedStreamingProviderId);
        expect(outcome.show.selectedStreamingProviderName).toBe(show.selectedStreamingProviderName);
        expect(outcome.show.visibility).toBe(show.visibility);
        expect(outcome.show.privateFor).toBe(show.privateFor);
    });

    it('rimette in lista una serie completata, azzerando la posizione (Fabio rivede una serie che ha finito)', () => {
        const show = buildShow([buildSeason(1, 2)], { lastWatchedEpisodeId: 's1e2' });
        const positionBeforeReset = calculateWatchPosition(show, TODAY);
        expect(positionBeforeReset.isCompleted).toBe(true);

        const outcome = resetProgress(show, { kind: 'notStarted' }, RESET_AT, TODAY);

        if (outcome.outcome !== 'applied') {
            throw new Error('reset inatteso rifiutato');
        }
        const positionAfterReset = calculateWatchPosition(outcome.show, TODAY);
        expect(positionAfterReset.isCompleted).toBe(false);
    });

    it('consente il reset di una serie mai iniziata verso una puntata', () => {
        const show = buildShow([buildSeason(1, 3)]);

        const outcome = resetProgress(show, { kind: 'watchedThrough', episodeId: 's1e2' }, RESET_AT, TODAY);

        if (outcome.outcome !== 'applied') {
            throw new Error('reset inatteso rifiutato');
        }
        expect(outcome.show.lastWatchedEpisodeId).toBe('s1e2');
    });

    it('rifiuta il reset di una serie mai iniziata verso "non ancora iniziata", perché coincide con la posizione corrente', () => {
        const show = buildShow([buildSeason(1, 3)]);

        const outcome = resetProgress(show, { kind: 'notStarted' }, RESET_AT, TODAY);

        expect(outcome.outcome).toBe('rejected');
    });

    it('consente un reset che attraversa più stagioni', () => {
        const seasons = [buildSeason(1, 3), buildSeason(2, 3), buildSeason(3, 2)];
        const show = buildShow(seasons, { lastWatchedEpisodeId: 's1e1' });

        const outcome = resetProgress(show, { kind: 'watchedThrough', episodeId: 's3e1' }, RESET_AT, TODAY);

        if (outcome.outcome !== 'applied') {
            throw new Error('reset inatteso rifiutato');
        }
        expect(outcome.show.lastWatchedEpisodeId).toBe('s3e1');
    });

    it('rifiuta il reset verso uno speciale, escluso dalla sequenza', () => {
        const specials: Season = { providerSeasonId: 'season-0', seasonNumber: 0, episodes: [buildEpisode(0, 1)] };
        const show = buildShow([specials, buildSeason(1, 2)]);

        const outcome = resetProgress(show, { kind: 'watchedThrough', episodeId: 's0e1' }, RESET_AT, TODAY);

        expect(outcome.outcome).toBe('rejected');
    });

    it('rifiuta il reset verso una puntata non ancora uscita', () => {
        const futureSeason = buildSeason(1, 2, '2026-06-01');
        const show = buildShow([futureSeason]);

        const outcome = resetProgress(show, { kind: 'watchedThrough', episodeId: 's1e1' }, RESET_AT, TODAY);

        expect(outcome.outcome).toBe('rejected');
    });

    it('rifiuta il reset verso una puntata senza data di uscita, perché non è considerata pubblicata', () => {
        const episodeWithoutAirDate: Episode = { ...buildEpisode(1, 1), airDate: undefined };
        const show = buildShow([{ providerSeasonId: 'season-1', seasonNumber: 1, episodes: [episodeWithoutAirDate] }]);

        const outcome = resetProgress(show, { kind: 'watchedThrough', episodeId: 's1e1' }, RESET_AT, TODAY);

        expect(outcome.outcome).toBe('rejected');
    });

    it('rifiuta il reset verso un episodio che non appartiene alla serie', () => {
        const show = buildShow([buildSeason(1, 2)]);
        const targetPosition = { kind: 'watchedThrough' as const, episodeId: 'episodio-inesistente' };

        const outcome = resetProgress(show, targetPosition, RESET_AT, TODAY);

        expect(outcome.outcome).toBe('rejected');
    });

    it('rifiuta il reset quando la posizione richiesta coincide con quella corrente', () => {
        const show = buildShow([buildSeason(1, 3)], { lastWatchedEpisodeId: 's1e2' });

        const outcome = resetProgress(show, { kind: 'watchedThrough', episodeId: 's1e2' }, RESET_AT, TODAY);

        expect(outcome.outcome).toBe('rejected');
    });

    it('non muta la serie ricevuta', () => {
        const show = buildShow([buildSeason(1, 3)], { lastWatchedEpisodeId: 's1e1' });
        deepFreeze(show);
        const showSnapshot = JSON.parse(JSON.stringify(show)) as TrackedShow;

        const outcome = resetProgress(show, { kind: 'watchedThrough', episodeId: 's1e3' }, RESET_AT, TODAY);

        expect(outcome.outcome).toBe('applied');
        expect(show).toEqual(showSnapshot);
    });

    it('dopo un reset non resta nulla da annullare: senza eventi, undoLastProgress rifiuta come già fa oggi (criterio 14)', () => {
        const show = buildShow([buildSeason(1, 3)]);
        const confirmed = advanceProgress(show, 's1e2', 'fabio', '2026-01-15T09:00:00Z', TODAY);
        if (confirmed.outcome !== 'applied') {
            throw new Error('avanzamento inatteso rifiutato');
        }

        const resetOutcome = resetProgress(confirmed.show, { kind: 'notStarted' }, RESET_AT, TODAY);
        if (resetOutcome.outcome !== 'applied') {
            throw new Error('reset inatteso rifiutato');
        }

        const undoOutcome = undoLastProgress(
            resetOutcome.show,
            [],
            resetOutcome.show.progressRevision,
            'irene',
            '2026-03-02T10:00:00Z'
        );

        expect(undoOutcome.outcome).toBe('rejected');
    });
});
