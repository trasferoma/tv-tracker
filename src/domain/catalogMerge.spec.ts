import { describe, expect, it } from 'vitest';

import { mergeAnnouncedEpisode, type AnnouncedEpisodeCatalog } from './catalogMerge';
import type { Episode, Season } from './trackedShow';

function buildEpisode(seasonNumber: number, episodeNumber: number, providerEpisodeId?: string): Episode {
    return {
        providerEpisodeId: providerEpisodeId ?? `s${seasonNumber}e${episodeNumber}`,
        seasonNumber,
        episodeNumber,
        title: `S${seasonNumber}E${episodeNumber}`,
        airDate: '2026-01-01'
    };
}

function buildSeason(seasonNumber: number, episodes: readonly Episode[]): Season {
    return { providerSeasonId: `season-${seasonNumber}`, seasonNumber, episodes };
}

function deepFreeze<T>(value: T): T {
    if (Array.isArray(value)) {
        value.forEach(deepFreeze);
        return Object.freeze(value) as T;
    }
    if (value !== null && typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach(deepFreeze);
        return Object.freeze(value);
    }
    return value;
}

describe('mergeAnnouncedEpisode — puntata assente dall\'elenco', () => {
    it('la aggiunge alla stagione giusta, nella posizione giusta', () => {
        const episode1 = buildEpisode(4, 1);
        const episode3 = buildEpisode(4, 3);
        const announcedEpisode2 = buildEpisode(4, 2);
        const catalog: AnnouncedEpisodeCatalog = {
            seasons: [buildSeason(4, [episode1, episode3])],
            nextEpisodeToAir: announcedEpisode2
        };

        const seasons = mergeAnnouncedEpisode(catalog);

        const expectedSeasons = [buildSeason(4, [episode1, announcedEpisode2, episode3])];
        expect(seasons).toEqual(expectedSeasons);
    });
});

describe('mergeAnnouncedEpisode — puntata già presente', () => {
    it('non la duplica', () => {
        const episode1 = buildEpisode(4, 1);
        const episode2 = buildEpisode(4, 2);
        const catalog: AnnouncedEpisodeCatalog = {
            seasons: [buildSeason(4, [episode1, episode2])],
            nextEpisodeToAir: buildEpisode(4, 2)
        };

        const seasons = mergeAnnouncedEpisode(catalog);

        const expectedSeasons = [buildSeason(4, [episode1, episode2])];
        expect(seasons).toEqual(expectedSeasons);
    });
});

describe('mergeAnnouncedEpisode — nessuna puntata annunciata', () => {
    it('restituisce il catalogo invariato', () => {
        const originalSeasons = [buildSeason(1, [buildEpisode(1, 1)])];
        const catalog: AnnouncedEpisodeCatalog = { seasons: originalSeasons };

        const seasons = mergeAnnouncedEpisode(catalog);

        expect(seasons).toBe(originalSeasons);
        expect(seasons).toEqual(originalSeasons);
    });
});

describe('mergeAnnouncedEpisode — nessuna mutazione degli oggetti in ingresso', () => {
    it('funziona anche con catalogo, stagioni ed episodi congelati', () => {
        const seasons = [buildSeason(4, [buildEpisode(4, 1)])];
        const nextEpisodeToAir = buildEpisode(4, 9);
        const catalog = deepFreeze<AnnouncedEpisodeCatalog>({ seasons, nextEpisodeToAir });

        const mergedSeasons = mergeAnnouncedEpisode(catalog);

        const expectedSeasons = [buildSeason(4, [buildEpisode(4, 1), buildEpisode(4, 9)])];
        expect(mergedSeasons).toEqual(expectedSeasons);
    });
});

describe('mergeAnnouncedEpisode — stagione della puntata annunciata non ancora nel catalogo', () => {
    it('crea la stagione con la sola puntata annunciata', () => {
        const catalog: AnnouncedEpisodeCatalog = {
            seasons: [buildSeason(1, [buildEpisode(1, 1)])],
            nextEpisodeToAir: buildEpisode(2, 1)
        };

        const seasons = mergeAnnouncedEpisode(catalog);

        const createdSeason: Season = { providerSeasonId: 'season-2', seasonNumber: 2, episodes: [buildEpisode(2, 1)] };
        const expectedSeasons = [buildSeason(1, [buildEpisode(1, 1)]), createdSeason];
        expect(seasons).toEqual(expectedSeasons);
    });
});
