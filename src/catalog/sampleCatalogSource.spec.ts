import { describe, expect, it } from 'vitest';

import type { CatalogShow } from './catalogSource';
import { sampleCatalogSource } from './sampleCatalogSource';
import { buildEpisodeSequence } from '@/domain/episodeOrder';
import { SPECIAL_SEASON_NUMBER, type ItalianProvider, type TrackedShow } from '@/domain/trackedShow';

function buildTrackedShowFromCatalog(catalogShow: CatalogShow): TrackedShow {
    return {
        id: 'tracked-1',
        catalogProvider: catalogShow.catalogProvider,
        providerShowId: catalogShow.providerShowId,
        title: catalogShow.title,
        status: catalogShow.status,
        seasons: catalogShow.seasons,
        italianProviders: [],
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
    };
}

async function loadSingleResult(query: string) {
    const outcome = await sampleCatalogSource.searchShows(query);
    if (outcome.outcome !== 'found') {
        throw new Error('la ricerca deve riuscire nei test sul catalogo finto');
    }
    return outcome.results[0];
}

async function loadFoundShow(providerShowId: string): Promise<CatalogShow> {
    const outcome = await sampleCatalogSource.loadShow(providerShowId);
    if (outcome.outcome !== 'found') {
        throw new Error('la serie deve essere trovata nei test sul catalogo finto');
    }
    return outcome.show;
}

async function loadProviders(providerShowId: string): Promise<readonly ItalianProvider[]> {
    const outcome = await sampleCatalogSource.loadItalianProviders(providerShowId);
    if (outcome.outcome !== 'loaded') {
        throw new Error('le piattaforme devono essere caricate nei test sul catalogo finto');
    }
    return outcome.providers;
}

describe('sampleCatalogSource.searchShows', () => {
    it('restituisce un elenco vuoto per una ricerca senza testo', async () => {
        const outcome = await sampleCatalogSource.searchShows('   ');

        expect(outcome).toEqual({ outcome: 'found', results: [] });
    });

    it('disambigua i risultati per anno e titolo originale', async () => {
        const result = await loadSingleResult('severance');

        expect(result).toMatchObject({
            title: 'Scissione',
            originalTitle: 'Severance',
            year: 2022
        });
    });

    it('trova lo stesso risultato cercando il titolo italiano', async () => {
        const result = await loadSingleResult('scissione');

        expect(result?.providerShowId).toBe('95396');
    });

    it('trova un risultato indipendentemente dalle maiuscole della ricerca', async () => {
        const result = await loadSingleResult('SEVERANCE');

        expect(result?.providerShowId).toBe('95396');
    });

    it('mostra nei risultati di ricerca la locandina generale della serie, come TMDB (deviazione dalla SPEC)', async () => {
        const result = await loadSingleResult('the bear');
        const show = await loadFoundShow(result!.providerShowId);
        const seasonOnePoster = show.seasons.find((season) => season.seasonNumber === 1)?.posterUrl;

        expect(result?.posterUrl).toBe(show.seriesPosterUrl);
        expect(result?.posterUrl).not.toBe(seasonOnePoster);
    });
});

describe('sampleCatalogSource.loadShow', () => {
    it('restituisce l\'esito "missing" per un providerShowId sconosciuto', async () => {
        const outcome = await sampleCatalogSource.loadShow('id-inesistente');

        expect(outcome).toEqual({ outcome: 'missing' });
    });

    it('include gli speciali nel dato del catalogo ma non nella sequenza degli episodi', async () => {
        const result = await loadSingleResult('scissione');
        const show = await loadFoundShow(result!.providerShowId);
        const specialsSeason = show.seasons.find((season) => season.seasonNumber === SPECIAL_SEASON_NUMBER);

        expect(specialsSeason?.episodes.length).toBeGreaterThan(0);

        const trackedShow = buildTrackedShowFromCatalog(show);
        const sequence = buildEpisodeSequence(trackedShow);

        expect(sequence.some((episode) => episode.seasonNumber === SPECIAL_SEASON_NUMBER)).toBe(false);
    });

    it('espone la prossima puntata futura quando nota', async () => {
        const result = await loadSingleResult('only murders');
        const show = await loadFoundShow(result!.providerShowId);

        expect(show.nextEpisodeToAir).toMatchObject({ seasonNumber: 4, episodeNumber: 9 });
    });
});

describe('sampleCatalogSource — locandine', () => {
    it('le locandine di serie sono URL reali di TMDB, non il dominio fittizio', async () => {
        const queries = ['the bear', 'the white lotus', 'scissione', 'only murders', 'slow horses'];

        for (const query of queries) {
            const result = await loadSingleResult(query);
            const show = await loadFoundShow(result!.providerShowId);

            expect(show.seriesPosterUrl).toMatch(/^https:\/\/image\.tmdb\.org\//);
        }
    });

    it('una serie priva di locandine di stagione ricade sulla locandina generale', async () => {
        const result = await loadSingleResult('slow horses');
        const show = await loadFoundShow(result!.providerShowId);

        expect(show.seasons.every((season) => season.posterUrl === undefined)).toBe(true);
        expect(show.seriesPosterUrl).toBeDefined();
    });
});

describe('sampleCatalogSource.loadItalianProviders', () => {
    it('una serie con più piattaforme italiane le restituisce tutte', async () => {
        const result = await loadSingleResult('the white lotus');
        const providers = await loadProviders(result!.providerShowId);

        expect(providers.map((provider) => provider.name)).toEqual(['NOW', 'Sky Go']);
    });

    it('una serie con una sola piattaforma la restituisce da sola', async () => {
        const result = await loadSingleResult('the bear');
        const providers = await loadProviders(result!.providerShowId);

        expect(providers.map((provider) => provider.name)).toEqual(['Disney+']);
    });

    it('una serie con speciali ma con piattaforma nota restituisce la sua piattaforma, non un elenco vuoto', async () => {
        const result = await loadSingleResult('scissione');
        const providers = await loadProviders(result!.providerShowId);

        expect(providers.map((provider) => provider.name)).toEqual(['Apple TV+']);
    });

    it('una serie senza piattaforme italiane restituisce un elenco vuoto, non un errore', async () => {
        const result = await loadSingleResult('slow horses');
        const providers = await loadProviders(result!.providerShowId);

        expect(providers).toEqual([]);
    });
});
