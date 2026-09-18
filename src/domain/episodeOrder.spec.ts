import { describe, expect, it } from 'vitest';

import { buildEpisodeSequence, episodeAfterPosition, positionOfEpisode } from './episodeOrder';
import type { Episode, Season, TrackedShow } from './trackedShow';

function buildEpisode(seasonNumber: number, episodeNumber: number): Episode {
    return {
        providerEpisodeId: `s${seasonNumber}e${episodeNumber}`,
        seasonNumber,
        episodeNumber,
        title: `S${seasonNumber}E${episodeNumber}`,
        airDate: '2026-01-01'
    };
}

function buildSeason(seasonNumber: number, episodeNumbers: readonly number[]): Season {
    return {
        providerSeasonId: `season-${seasonNumber}`,
        seasonNumber,
        episodes: episodeNumbers.map((episodeNumber) => buildEpisode(seasonNumber, episodeNumber))
    };
}

function buildShow(seasons: readonly Season[]): TrackedShow {
    return {
        id: 'show-1',
        catalogProvider: 'tmdb',
        providerShowId: 'tmdb-1',
        title: 'Serie di prova',
        status: 'In corso',
        seasons,
        italianProviders: [],
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
    };
}

describe('buildEpisodeSequence', () => {
    it('ordina gli episodi per stagione ed episodio anche con le stagioni fuori sequenza nel dato', () => {
        const season2 = buildSeason(2, [2, 1]);
        const season1 = buildSeason(1, [2, 1]);
        const show = buildShow([season2, season1]);

        const sequence = buildEpisodeSequence(show);

        expect(sequence.map((episode) => [episode.seasonNumber, episode.episodeNumber])).toEqual([
            [1, 1], [1, 2], [2, 1], [2, 2]
        ]);
    });

    it('esclude gli speciali dalla sequenza ma li conserva nella serie', () => {
        const specials = buildSeason(0, [1, 2]);
        const season1 = buildSeason(1, [1]);
        const show = buildShow([specials, season1]);

        const sequence = buildEpisodeSequence(show);

        expect(sequence).toHaveLength(1);
        expect(sequence[0]?.seasonNumber).toBe(1);
        expect(show.seasons.find((season) => season.seasonNumber === 0)?.episodes).toHaveLength(2);
    });

    it('non muta gli array della serie ricevuta', () => {
        const season1 = buildSeason(1, [2, 1]);
        const originalOrder = season1.episodes.map((episode) => episode.episodeNumber);
        const show = buildShow([season1]);

        buildEpisodeSequence(show);

        expect(season1.episodes.map((episode) => episode.episodeNumber)).toEqual(originalOrder);
    });

    it('accetta un catalogo con le sole stagioni, senza gli altri campi di TrackedShow', () => {
        const catalog = { seasons: [buildSeason(1, [1, 2])] };

        const sequence = buildEpisodeSequence(catalog);

        expect(sequence.map((episode) => episode.episodeNumber)).toEqual([1, 2]);
    });
});

describe('positionOfEpisode', () => {
    it('restituisce la posizione dell\'episodio nella sequenza', () => {
        const show = buildShow([buildSeason(1, [1, 2, 3])]);
        const sequence = buildEpisodeSequence(show);

        expect(positionOfEpisode(sequence, 's1e2')).toBe(1);
    });

    it('restituisce -1 per un episodio non presente nella sequenza', () => {
        const show = buildShow([buildSeason(1, [1, 2])]);
        const sequence = buildEpisodeSequence(show);

        expect(positionOfEpisode(sequence, 'inesistente')).toBe(-1);
    });
});

describe('episodeAfterPosition', () => {
    it('restituisce l\'episodio successivo alla posizione data', () => {
        const show = buildShow([buildSeason(1, [1, 2, 3])]);
        const sequence = buildEpisodeSequence(show);

        expect(episodeAfterPosition(sequence, 0)?.episodeNumber).toBe(2);
    });

    it('restituisce undefined oltre l\'ultimo episodio della sequenza', () => {
        const show = buildShow([buildSeason(1, [1, 2])]);
        const sequence = buildEpisodeSequence(show);

        expect(episodeAfterPosition(sequence, 1)).toBeUndefined();
    });

    it('restituisce il primo episodio quando la serie non e mai stata iniziata (posizione -1)', () => {
        const show = buildShow([buildSeason(1, [1, 2])]);
        const sequence = buildEpisodeSequence(show);

        expect(episodeAfterPosition(sequence, -1)?.episodeNumber).toBe(1);
    });
});
