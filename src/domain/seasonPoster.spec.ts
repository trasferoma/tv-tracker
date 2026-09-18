import { describe, expect, it } from 'vitest';

import type { Episode, Season, TrackedShow } from './trackedShow';
import { selectPosterUrl } from './seasonPoster';

function buildEpisode(seasonNumber: number, episodeNumber: number): Episode {
    return {
        providerEpisodeId: `s${seasonNumber}e${episodeNumber}`,
        seasonNumber,
        episodeNumber,
        title: `S${seasonNumber}E${episodeNumber}`
    };
}

function buildSeason(seasonNumber: number, posterUrl?: string): Season {
    return {
        providerSeasonId: `season-${seasonNumber}`,
        seasonNumber,
        posterUrl,
        episodes: [buildEpisode(seasonNumber, 1)]
    };
}

function buildShow(seasons: readonly Season[], seriesPosterUrl?: string): TrackedShow {
    return {
        id: 'show-1',
        catalogProvider: 'tmdb',
        providerShowId: 'tmdb-1',
        title: 'Serie di prova',
        seriesPosterUrl,
        status: 'In corso',
        seasons,
        italianProviders: [],
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
    };
}

describe('selectPosterUrl', () => {
    it('usa la locandina della stagione della prima puntata non vista', () => {
        const season1 = buildSeason(1, 'poster-stagione-1.jpg');
        const season2 = buildSeason(2, 'poster-stagione-2.jpg');
        const show = buildShow([season1, season2]);
        const nextUnwatchedEpisode = buildEpisode(2, 1);

        expect(selectPosterUrl(show, nextUnwatchedEpisode)).toBe('poster-stagione-2.jpg');
    });

    it('usa la locandina della stagione 1 quando la serie non è mai stata iniziata', () => {
        const season1 = buildSeason(1, 'poster-stagione-1.jpg');
        const show = buildShow([season1]);

        expect(selectPosterUrl(show, undefined)).toBe('poster-stagione-1.jpg');
    });

    it('ripiega sulla locandina generale della serie quando la stagione non ne ha una', () => {
        const season1 = buildSeason(1);
        const show = buildShow([season1], 'poster-serie.jpg');
        const nextUnwatchedEpisode = buildEpisode(1, 1);

        expect(selectPosterUrl(show, nextUnwatchedEpisode)).toBe('poster-serie.jpg');
    });

    it('restituisce undefined, lasciando il segnaposto alla UI, quando non esiste alcuna locandina', () => {
        const season1 = buildSeason(1);
        const show = buildShow([season1]);
        const nextUnwatchedEpisode = buildEpisode(1, 1);

        expect(selectPosterUrl(show, nextUnwatchedEpisode)).toBeUndefined();
    });
});
