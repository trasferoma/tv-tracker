export const TMDB_API_ORIGIN = 'https://api.themoviedb.org';
export const TMDB_PROXY_PATH = '/api/tmdb';

const TMDB_API_VERSION_SEGMENT = '3';
const TMDB_PATH_PARAM = 'path';
const ITALIAN_LANGUAGE = 'it-IT';

export interface TmdbRequestDescriptor {
    readonly path: string;
    readonly searchParams: Readonly<Record<string, string>>;
}

export function buildSearchShowsRequest(query: string): TmdbRequestDescriptor {
    return { path: 'search/tv', searchParams: { query, language: ITALIAN_LANGUAGE } };
}

export function buildShowDetailRequest(providerShowId: string): TmdbRequestDescriptor {
    return { path: `tv/${providerShowId}`, searchParams: { language: ITALIAN_LANGUAGE } };
}

export function buildSeasonDetailRequest(providerShowId: string, seasonNumber: number): TmdbRequestDescriptor {
    return { path: `tv/${providerShowId}/season/${seasonNumber}`, searchParams: { language: ITALIAN_LANGUAGE } };
}

export function buildWatchProvidersRequest(providerShowId: string): TmdbRequestDescriptor {
    return { path: `tv/${providerShowId}/watch/providers`, searchParams: {} };
}

export function buildProxyRequestUrl(descriptor: TmdbRequestDescriptor): string {
    const proxyParams = new URLSearchParams(descriptor.searchParams);
    proxyParams.set(TMDB_PATH_PARAM, descriptor.path);
    return `${TMDB_PROXY_PATH}?${proxyParams.toString()}`;
}

interface AllowedTmdbRoute {
    readonly pathPattern: RegExp;
    readonly allowedParamNames: readonly string[];
}

const ALLOWED_TMDB_ROUTES: readonly AllowedTmdbRoute[] = [
    { pathPattern: /^search\/tv$/, allowedParamNames: ['query', 'language'] },
    { pathPattern: /^tv\/\d+$/, allowedParamNames: ['language'] },
    { pathPattern: /^tv\/\d+\/season\/\d+$/, allowedParamNames: ['language'] },
    { pathPattern: /^tv\/\d+\/watch\/providers$/, allowedParamNames: [] }
];

export function resolveTmdbTargetPath(incomingSearchParams: URLSearchParams): string | undefined {
    const path = incomingSearchParams.get(TMDB_PATH_PARAM);
    if (path === null || path === '') {
        return undefined;
    }
    const forwardedParams = new URLSearchParams(incomingSearchParams);
    forwardedParams.delete(TMDB_PATH_PARAM);
    if (!isAllowedTmdbRequest(path, forwardedParams)) {
        return undefined;
    }
    const forwardedQuery = forwardedParams.toString();
    const queryPart = forwardedQuery === '' ? '' : `?${forwardedQuery}`;
    return `/${TMDB_API_VERSION_SEGMENT}/${path}${queryPart}`;
}

function isAllowedTmdbRequest(path: string, forwardedParams: URLSearchParams): boolean {
    return ALLOWED_TMDB_ROUTES.some((route) => matchesAllowedRoute(route, path, forwardedParams));
}

function matchesAllowedRoute(route: AllowedTmdbRoute, path: string, forwardedParams: URLSearchParams): boolean {
    if (!route.pathPattern.test(path)) {
        return false;
    }
    const forwardedParamNames = new Set(forwardedParams.keys());
    return forwardedParamNames.size === route.allowedParamNames.length
            && route.allowedParamNames.every((paramName) => forwardedParamNames.has(paramName));
}
