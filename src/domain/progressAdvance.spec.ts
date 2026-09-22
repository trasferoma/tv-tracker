import { describe, expect, it } from 'vitest';

import { advanceProgress } from './progressAdvance';
import type { Episode, Season, TrackedShow } from './trackedShow';
import { calculateWatchPosition } from './watchPosition';

const TODAY = '2026-02-01';
const CONFIRMED_AT = '2026-02-01T10:00:00Z';
const CONFIRMED_BY = 'fabio';

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

function buildShow(seasons: readonly Season[], lastWatchedEpisodeId?: string): TrackedShow {
    return {
        id: 'show-1',
        catalogProvider: 'tmdb',
        providerShowId: 'tmdb-1',
        title: 'Serie di prova',
        status: 'In corso',
        seasons,
        italianProviders: [],
        lastWatchedEpisodeId,
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
    };
}

describe('advanceProgress', () => {
    it('segnando S2E4 come vista, S2E4 e tutte le precedenti spariscono da quelle da vedere (criterio 4)', () => {
        const show = buildShow([buildSeason(1, 4), buildSeason(2, 4)]);

        const outcome = advanceProgress(show, 's2e4', CONFIRMED_BY, CONFIRMED_AT, TODAY);

        if (outcome.outcome !== 'applied') {
            throw new Error('avanzamento inatteso rifiutato');
        }
        const position = calculateWatchPosition(outcome.show, TODAY);
        expect(position.isCaughtUp).toBe(true);
        expect(position.firstUnwatchedEpisode).toBeUndefined();
        expect(outcome.show.lastWatchedEpisodeId).toBe('s2e4');
    });

    it('avanzamento multiplo implicito che attraversa più stagioni (da S1E2 a S3E1)', () => {
        const show = buildShow([buildSeason(1, 3), buildSeason(2, 3), buildSeason(3, 2)], 's1e2');

        const outcome = advanceProgress(show, 's3e1', CONFIRMED_BY, CONFIRMED_AT, TODAY);

        if (outcome.outcome !== 'applied') {
            throw new Error('avanzamento inatteso rifiutato');
        }
        const position = calculateWatchPosition(outcome.show, TODAY);
        expect(position.firstUnwatchedEpisode?.providerEpisodeId).toBe('s3e2');
        expect(position.backlogCount).toBe(1);
        expect(outcome.show.lastWatchedEpisodeId).toBe('s3e1');
    });

    it('genera un ProgressEvent con gli snapshot corretti e incrementa la revisione', () => {
        const show = buildShow([buildSeason(1, 2)], 's1e1');

        const outcome = advanceProgress(show, 's1e2', CONFIRMED_BY, CONFIRMED_AT, TODAY);

        if (outcome.outcome !== 'applied') {
            throw new Error('avanzamento inatteso rifiutato');
        }
        expect(outcome.event.seasonNumber).toBe(1);
        expect(outcome.event.episodeNumber).toBe(2);
        expect(outcome.event.episodeTitle).toBe('S1E2');
        expect(outcome.event.confirmedBy).toBe(CONFIRMED_BY);
        expect(outcome.event.previousEpisodeId).toBe('s1e1');
        expect(outcome.event.confirmedEpisodeId).toBe('s1e2');
        expect(outcome.show.progressRevision).toBe(show.progressRevision + 1);
        expect(outcome.show.lastViewedAt).toBe(CONFIRMED_AT);
    });

    it('rifiuta un avanzamento verso un episodio precedente alla posizione corrente', () => {
        const show = buildShow([buildSeason(1, 3)], 's1e2');

        const outcome = advanceProgress(show, 's1e1', CONFIRMED_BY, CONFIRMED_AT, TODAY);

        expect(outcome.outcome).toBe('rejected');
    });

    it('rifiuta di riconfermare l\'episodio già raggiunto come posizione corrente', () => {
        const show = buildShow([buildSeason(1, 3)], 's1e2');

        const outcome = advanceProgress(show, 's1e2', CONFIRMED_BY, CONFIRMED_AT, TODAY);

        expect(outcome.outcome).toBe('rejected');
    });

    it('rifiuta un avanzamento verso un episodio futuro', () => {
        const futureSeason = buildSeason(1, 2, '2026-03-01');
        const show = buildShow([futureSeason]);

        const outcome = advanceProgress(show, 's1e1', CONFIRMED_BY, CONFIRMED_AT, TODAY);

        expect(outcome.outcome).toBe('rejected');
    });

    it('rifiuta un avanzamento verso un episodio senza data di uscita, perché non è considerato pubblicato', () => {
        const episodeWithoutAirDate: Episode = { ...buildEpisode(1, 1), airDate: undefined };
        const show = buildShow([{ providerSeasonId: 'season-1', seasonNumber: 1, episodes: [episodeWithoutAirDate] }]);

        const outcome = advanceProgress(show, 's1e1', CONFIRMED_BY, CONFIRMED_AT, TODAY);

        expect(outcome.outcome).toBe('rejected');
    });

    it('rifiuta un avanzamento verso un episodio che non esiste nella sequenza', () => {
        const show = buildShow([buildSeason(1, 2)]);

        const outcome = advanceProgress(show, 'episodio-inesistente', CONFIRMED_BY, CONFIRMED_AT, TODAY);

        expect(outcome.outcome).toBe('rejected');
    });

    it('rifiuta la conferma di uno speciale, escluso dalla sequenza', () => {
        const specials: Season = { providerSeasonId: 'season-0', seasonNumber: 0, episodes: [buildEpisode(0, 1)] };
        const show = buildShow([specials, buildSeason(1, 2)]);

        const outcome = advanceProgress(show, 's0e1', CONFIRMED_BY, CONFIRMED_AT, TODAY);

        expect(outcome.outcome).toBe('rejected');
    });

    it('non muta la serie ricevuta', () => {
        const show = buildShow([buildSeason(1, 3)], 's1e1');
        deepFreeze(show);
        const showSnapshot = JSON.parse(JSON.stringify(show)) as TrackedShow;

        const outcome = advanceProgress(show, 's1e3', CONFIRMED_BY, CONFIRMED_AT, TODAY);

        expect(outcome.outcome).toBe('applied');
        expect(show).toEqual(showSnapshot);
    });
});
