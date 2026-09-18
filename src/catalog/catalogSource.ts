import type { CatalogProvider, Episode, ItalianProvider, Season } from '@/domain/trackedShow';

export interface CatalogSearchResult {
    readonly catalogProvider: CatalogProvider;
    readonly providerShowId: string;
    readonly title: string;
    readonly originalTitle: string;
    readonly year?: number | undefined;
    readonly status?: string | undefined;
    readonly posterUrl?: string | undefined;
}

export interface CatalogShow {
    readonly catalogProvider: CatalogProvider;
    readonly providerShowId: string;
    readonly title: string;
    readonly seriesPosterUrl?: string | undefined;
    readonly status: string;
    readonly seasons: readonly Season[];
    readonly nextEpisodeToAir?: Episode | undefined;
}

export type SearchShowsOutcome =
    | { readonly outcome: 'found'; readonly results: readonly CatalogSearchResult[] }
    | { readonly outcome: 'unavailable'; readonly reason: string };

export type LoadShowOutcome =
    | { readonly outcome: 'found'; readonly show: CatalogShow }
    | { readonly outcome: 'missing' }
    | { readonly outcome: 'unavailable'; readonly reason: string };

export type LoadItalianProvidersOutcome =
    | { readonly outcome: 'loaded'; readonly providers: readonly ItalianProvider[] }
    | { readonly outcome: 'unavailable'; readonly reason: string };

export interface CatalogSource {
    searchShows(query: string): Promise<SearchShowsOutcome>;
    loadShow(providerShowId: string): Promise<LoadShowOutcome>;
    loadItalianProviders(providerShowId: string): Promise<LoadItalianProvidersOutcome>;
}
