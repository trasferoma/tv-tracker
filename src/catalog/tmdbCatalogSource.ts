import type {
    CatalogSource,
    LoadItalianProvidersOutcome,
    LoadShowOutcome,
    SearchShowsOutcome
} from './catalogSource';
import { extractSeasonNumbers, mapCatalogShow, mapItalianProviders, mapSearchResults, mapSeason } from './tmdbMapping';
import {
    buildProxyRequestUrl,
    buildSearchShowsRequest,
    buildSeasonDetailRequest,
    buildShowDetailRequest,
    buildWatchProvidersRequest,
    type TmdbRequestDescriptor
} from './tmdbRequest';
import type { Season } from '@/domain/trackedShow';

const NETWORK_UNAVAILABLE_REASON = 'Impossibile contattare TMDB: verifica la connessione di rete.';
const RATE_LIMITED_REASON = 'TMDB ha raggiunto il limite di richieste: riprova fra qualche minuto.';
const SERVER_ERROR_REASON = 'TMDB non è al momento raggiungibile: riprova più tardi.';
const GENERIC_ERROR_REASON = 'TMDB ha risposto con un errore imprevisto.';

type TmdbFetchOutcome =
    | { readonly kind: 'success'; readonly data: unknown }
    | { readonly kind: 'notFound' }
    | { readonly kind: 'unavailable'; readonly reason: string };

type SeasonListOutcome =
    | { readonly outcome: 'loaded'; readonly seasons: readonly Season[] }
    | { readonly outcome: 'unavailable'; readonly reason: string };

type TmdbSeasonFetchOutcome =
    | { readonly kind: 'success'; readonly data: unknown }
    | { readonly kind: 'unavailable'; readonly reason: string };

async function fetchTmdb(descriptor: TmdbRequestDescriptor): Promise<TmdbFetchOutcome> {
    const requestUrl = buildProxyRequestUrl(descriptor);
    let response: Response;
    try {
        response = await fetch(requestUrl);
    } catch {
        return { kind: 'unavailable', reason: NETWORK_UNAVAILABLE_REASON };
    }
    return interpretResponse(response);
}

async function interpretResponse(response: Response): Promise<TmdbFetchOutcome> {
    if (response.status === 404) {
        return { kind: 'notFound' };
    }
    if (response.status === 429) {
        return { kind: 'unavailable', reason: RATE_LIMITED_REASON };
    }
    if (response.status >= 500) {
        return { kind: 'unavailable', reason: SERVER_ERROR_REASON };
    }
    if (!response.ok) {
        return { kind: 'unavailable', reason: GENERIC_ERROR_REASON };
    }
    const data: unknown = await response.json();
    return { kind: 'success', data };
}

async function searchShows(query: string): Promise<SearchShowsOutcome> {
    const request = buildSearchShowsRequest(query);
    const result = await fetchTmdb(request);
    if (result.kind === 'unavailable') {
        return { outcome: 'unavailable', reason: result.reason };
    }
    if (result.kind === 'notFound') {
        return { outcome: 'found', results: [] };
    }
    const results = mapSearchResults(result.data);
    return { outcome: 'found', results };
}

async function loadShow(providerShowId: string): Promise<LoadShowOutcome> {
    const showDetailRequest = buildShowDetailRequest(providerShowId);
    const detailFetch = await fetchTmdb(showDetailRequest);
    if (detailFetch.kind === 'notFound') {
        return { outcome: 'missing' };
    }
    if (detailFetch.kind === 'unavailable') {
        return { outcome: 'unavailable', reason: detailFetch.reason };
    }
    const seasonNumbers = extractSeasonNumbers(detailFetch.data);
    const seasonsFetch = await loadAllSeasons(providerShowId, seasonNumbers);
    if (seasonsFetch.outcome === 'unavailable') {
        return seasonsFetch;
    }
    const show = mapCatalogShow(detailFetch.data, seasonsFetch.seasons);
    return { outcome: 'found', show };
}

async function loadAllSeasons(providerShowId: string, seasonNumbers: readonly number[]): Promise<SeasonListOutcome> {
    const seasons: Season[] = [];
    for (const seasonNumber of seasonNumbers) {
        const fetchOutcome = await loadSeasonEpisodes(providerShowId, seasonNumber);
        if (fetchOutcome.kind === 'unavailable') {
            return { outcome: 'unavailable', reason: fetchOutcome.reason };
        }
        const season = mapSeason(fetchOutcome.data);
        seasons.push(season);
    }
    return { outcome: 'loaded', seasons };
}

async function loadSeasonEpisodes(providerShowId: string, seasonNumber: number): Promise<TmdbSeasonFetchOutcome> {
    const seasonDetailRequest = buildSeasonDetailRequest(providerShowId, seasonNumber);
    const result = await fetchTmdb(seasonDetailRequest);
    if (result.kind === 'notFound') {
        return { kind: 'unavailable', reason: `TMDB non ha la stagione ${seasonNumber} attesa per questa serie.` };
    }
    if (result.kind === 'unavailable') {
        return result;
    }
    return { kind: 'success', data: result.data };
}

async function loadItalianProviders(providerShowId: string): Promise<LoadItalianProvidersOutcome> {
    const watchProvidersRequest = buildWatchProvidersRequest(providerShowId);
    const result = await fetchTmdb(watchProvidersRequest);
    if (result.kind === 'unavailable') {
        return { outcome: 'unavailable', reason: result.reason };
    }
    if (result.kind === 'notFound') {
        return { outcome: 'loaded', providers: [] };
    }
    const providers = mapItalianProviders(result.data);
    return { outcome: 'loaded', providers };
}

export const tmdbCatalogSource: CatalogSource = {
    searchShows,
    loadShow,
    loadItalianProviders
};
