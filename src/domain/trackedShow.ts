export type CatalogProvider = 'tmdb';

export interface ItalianProvider {
    readonly id: string;
    readonly name: string;
    readonly logoUrl?: string | undefined;
}

export interface Episode {
    readonly providerEpisodeId: string;
    readonly seasonNumber: number;
    readonly episodeNumber: number;
    readonly title: string;
    readonly airDate?: string | undefined;
}

export interface Season {
    readonly providerSeasonId: string;
    readonly seasonNumber: number;
    readonly posterUrl?: string | undefined;
    readonly episodes: readonly Episode[];
}

export const SPECIAL_SEASON_NUMBER = 0;

export interface TrackedShow {
    readonly id: string;
    readonly catalogProvider: CatalogProvider;
    readonly providerShowId: string;
    readonly title: string;
    readonly seriesPosterUrl?: string | undefined;
    readonly status: string;
    readonly seasons: readonly Season[];
    readonly italianProviders: readonly ItalianProvider[];
    readonly selectedStreamingProviderId?: string | undefined;
    readonly selectedStreamingProviderName?: string | undefined;
    readonly visibility?: 'shared' | 'private' | undefined;
    readonly privateFor?: string | undefined;
    readonly lastWatchedEpisodeId?: string | undefined;
    readonly progressRevision: number;
    readonly addedAt: string;
    readonly lastViewedAt?: string | undefined;
    readonly catalogUpdatedAt?: string | undefined;
    readonly updatedAt: string;
}

export interface ProgressEvent {
    readonly id: string;
    readonly trackedShowId: string;
    readonly previousEpisodeId?: string | undefined;
    readonly confirmedEpisodeId: string;
    readonly seasonNumber: number;
    readonly episodeNumber: number;
    readonly episodeTitle: string;
    readonly confirmedAt: string;
    readonly confirmedBy: string;
    readonly undoneAt?: string | undefined;
    readonly undoneBy?: string | undefined;
}

export type ProgressOutcome =
    | { readonly outcome: 'applied'; readonly show: TrackedShow; readonly event: ProgressEvent }
    | { readonly outcome: 'rejected'; readonly reason: string };

export type InitialPositionChoice =
    | { readonly kind: 'notStarted' }
    | { readonly kind: 'watchedThrough'; readonly episodeId: string };

export type ResetProgressOutcome =
    | { readonly outcome: 'applied'; readonly show: TrackedShow }
    | { readonly outcome: 'rejected'; readonly reason: string };
