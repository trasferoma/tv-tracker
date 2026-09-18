import { describe, expect, it } from 'vitest';

import providers22980Fixture from './fixtures/providers-22980.json';
import providers95396Fixture from './fixtures/providers-95396.json';
import providersNoItalyFixture from './fixtures/providers-no-italy.json';
import searchSeveranceFixture from './fixtures/search-severance.json';
import season95396Fixture0 from './fixtures/season-95396-0.json';
import season95396Fixture2 from './fixtures/season-95396-2.json';
import seasonDerivataSenzaDateFixture from './fixtures/season-derivata-senza-date.json';
import show22980NextEpisodeFixture from './fixtures/show-22980-nextepisode.json';
import show95396Fixture from './fixtures/show-95396.json';
import { extractSeasonNumbers, mapCatalogShow, mapItalianProviders, mapSearchResults, mapSeason } from './tmdbMapping';

describe('mapSearchResults', () => {
    it('mappa titolo italiano, titolo originale e anno dal risultato di ricerca', () => {
        const results = mapSearchResults(searchSeveranceFixture);

        expect(results).toEqual([
            expect.objectContaining({
                catalogProvider: 'tmdb',
                providerShowId: '95396',
                title: 'Scissione',
                originalTitle: 'Severance',
                year: 2022,
                posterUrl: 'https://image.tmdb.org/t/p/w500/jnwqpZpmwvEo0CFLjDwfnnAf4ow.jpg'
            })
        ]);
    });

    it('non valorizza status: search/tv non lo restituisce', () => {
        const [result] = mapSearchResults(searchSeveranceFixture);

        expect(result?.status).toBeUndefined();
    });
});

describe('mapCatalogShow', () => {
    it('mappa titolo, status e locandina della serie senza prossima puntata', () => {
        const show = mapCatalogShow(show95396Fixture, []);

        expect(show).toMatchObject({
            catalogProvider: 'tmdb',
            providerShowId: '95396',
            title: 'Scissione',
            status: 'Returning Series',
            seriesPosterUrl: 'https://image.tmdb.org/t/p/w500/jnwqpZpmwvEo0CFLjDwfnnAf4ow.jpg'
        });
        expect(show.nextEpisodeToAir).toBeUndefined();
    });

    it('mappa la prossima puntata quando next_episode_to_air è valorizzato', () => {
        const show = mapCatalogShow(show22980NextEpisodeFixture, []);

        expect(show.nextEpisodeToAir).toEqual({
            providerEpisodeId: '7812141',
            seasonNumber: 23,
            episodeNumber: 147,
            title: 'Episodio 147',
            airDate: '2026-09-20'
        });
    });
});

describe('extractSeasonNumbers', () => {
    it('include la stagione 0 senza filtrarla', () => {
        const seasonNumbers = extractSeasonNumbers(show95396Fixture);

        expect(seasonNumbers).toEqual([0, 1, 2, 3]);
    });
});

describe('mapSeason', () => {
    it('mappa una stagione completa con i suoi episodi', () => {
        const season = mapSeason(season95396Fixture2);

        expect(season.providerSeasonId).toBe('401674');
        expect(season.seasonNumber).toBe(2);
        expect(season.posterUrl).toBe('https://image.tmdb.org/t/p/w500/7GaivmIzvXq9p1kcXmHjMvjmMxA.jpg');
        expect(season.episodes).toHaveLength(10);
        expect(season.episodes[0]).toEqual({
            providerEpisodeId: '5469028',
            seasonNumber: 2,
            episodeNumber: 1,
            title: 'Salve, signora Cobel',
            airDate: '2025-01-16'
        });
    });

    it('mappa la stagione 0 degli speciali', () => {
        const season = mapSeason(season95396Fixture0);

        expect(season.seasonNumber).toBe(0);
        expect(season.episodes).toEqual([
            {
                providerEpisodeId: '5995805',
                seasonNumber: 0,
                episodeNumber: 1,
                title: 'Benvenuti alla Lumon',
                airDate: '2021-12-15'
            }
        ]);
    });

    it('lascia airDate assente quando l\'episodio non ha ancora una data (fixture derivata)', () => {
        const season = mapSeason(seasonDerivataSenzaDateFixture);
        const episodesWithoutDate = season.episodes.filter((episode) => episode.airDate === undefined);

        expect(season.episodes).toHaveLength(10);
        expect(episodesWithoutDate.map((episode) => episode.episodeNumber)).toEqual([5, 9]);
    });
});

describe('mapItalianProviders', () => {
    it('restituisce le piattaforme italiane quando results.IT è presente', () => {
        const providers = mapItalianProviders(providers95396Fixture);

        expect(providers).toEqual([
            { id: '350', name: 'Apple TV', logoUrl: 'https://image.tmdb.org/t/p/w92/9icYBfYFcwgCbky5VdGUIKJ4C5i.png' },
            {
                id: '2243',
                name: 'Apple TV Amazon Channel',
                logoUrl: 'https://image.tmdb.org/t/p/w92/rerVCu9auZrgxTTiZu1criqrQzg.png'
            }
        ]);
    });

    it('restituisce un elenco vuoto, non un errore, quando results.IT è assente', () => {
        const providers = mapItalianProviders(providersNoItalyFixture);

        expect(providers).toEqual([]);
    });

    it('legge results.IT e non un altro paese quando le piattaforme differiscono per paese', () => {
        const providers = mapItalianProviders(providers22980Fixture);

        expect(providers).toEqual([
            { id: '296', name: 'Hayu Amazon Channel', logoUrl: 'https://image.tmdb.org/t/p/w92/7j9bf0UmdxxmZtPsLggYLnGqrqS.png' }
        ]);
    });
});
