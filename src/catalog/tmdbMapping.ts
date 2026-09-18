import type { CatalogSearchResult, CatalogShow } from './catalogSource';
import type { Episode, ItalianProvider, Season } from '@/domain/trackedShow';

const TMDB_IMAGE_ORIGIN = 'https://image.tmdb.org/t/p';
const POSTER_SIZE_SEGMENT = 'w500';
const LOGO_SIZE_SEGMENT = 'w92';
const ITALY_COUNTRY_CODE = 'IT';

interface RawSearchResponse {
    readonly results: readonly RawSearchResult[];
}

interface RawSearchResult {
    readonly id: number;
    readonly name: string;
    readonly original_name: string;
    readonly first_air_date?: string | null;
    readonly poster_path?: string | null;
}

interface RawShowDetail {
    readonly id: number;
    readonly name: string;
    readonly status: string;
    readonly poster_path?: string | null;
    readonly seasons: readonly RawSeasonSummary[];
    readonly next_episode_to_air?: RawEpisode | null;
}

interface RawSeasonSummary {
    readonly season_number: number;
}

interface RawSeasonDetail {
    readonly id: number;
    readonly season_number: number;
    readonly poster_path?: string | null;
    readonly episodes: readonly RawEpisode[];
}

interface RawEpisode {
    readonly id: number;
    readonly season_number: number;
    readonly episode_number: number;
    readonly name: string;
    readonly air_date?: string | null;
}

interface RawWatchProvidersResponse {
    readonly results: Readonly<Record<string, RawCountryProviders | undefined>>;
}

interface RawCountryProviders {
    readonly flatrate?: readonly RawWatchProvider[];
}

interface RawWatchProvider {
    readonly provider_id: number;
    readonly provider_name: string;
    readonly logo_path?: string | null;
}

export function mapSearchResults(raw: unknown): readonly CatalogSearchResult[] {
    const response = raw as RawSearchResponse;
    return response.results.map(mapSearchResult);
}

function mapSearchResult(raw: RawSearchResult): CatalogSearchResult {
    const providerShowId = String(raw.id);
    const year = extractYear(raw.first_air_date);
    // TMDB search/tv non restituisce la locandina di stagione 1 né lo status della serie
    // (verificato sulla risposta reale, deviazione registrata in implementation-tv-tracker.md
    // § Fase 10): qui posterUrl è la locandina generale, status resta assente.
    const posterUrl = toPosterUrl(raw.poster_path);
    return {
        catalogProvider: 'tmdb',
        providerShowId,
        title: raw.name,
        originalTitle: raw.original_name,
        year,
        posterUrl
    };
}

export function extractSeasonNumbers(raw: unknown): readonly number[] {
    const detail = raw as RawShowDetail;
    return detail.seasons.map((season) => season.season_number);
}

export function mapCatalogShow(raw: unknown, seasons: readonly Season[]): CatalogShow {
    const detail = raw as RawShowDetail;
    const providerShowId = String(detail.id);
    const seriesPosterUrl = toPosterUrl(detail.poster_path);
    const nextEpisodeToAir = mapNextEpisode(detail.next_episode_to_air);
    return {
        catalogProvider: 'tmdb',
        providerShowId,
        title: detail.name,
        seriesPosterUrl,
        status: detail.status,
        seasons,
        nextEpisodeToAir
    };
}

function mapNextEpisode(raw: RawEpisode | null | undefined): Episode | undefined {
    if (raw === null || raw === undefined) {
        return undefined;
    }
    return mapEpisode(raw);
}

export function mapSeason(raw: unknown): Season {
    const rawSeason = raw as RawSeasonDetail;
    const providerSeasonId = String(rawSeason.id);
    const posterUrl = toPosterUrl(rawSeason.poster_path);
    const episodes = rawSeason.episodes.map(mapEpisode);
    return {
        providerSeasonId,
        seasonNumber: rawSeason.season_number,
        posterUrl,
        episodes
    };
}

function mapEpisode(raw: RawEpisode): Episode {
    const providerEpisodeId = String(raw.id);
    return {
        providerEpisodeId,
        seasonNumber: raw.season_number,
        episodeNumber: raw.episode_number,
        title: raw.name,
        airDate: raw.air_date ?? undefined
    };
}

export function mapItalianProviders(raw: unknown): readonly ItalianProvider[] {
    const response = raw as RawWatchProvidersResponse;
    const italianProviders = response.results[ITALY_COUNTRY_CODE];
    const flatrateProviders = italianProviders?.flatrate ?? [];
    return flatrateProviders.map(mapProvider);
}

function mapProvider(raw: RawWatchProvider): ItalianProvider {
    const id = String(raw.provider_id);
    const logoUrl = toLogoUrl(raw.logo_path);
    return { id, name: raw.provider_name, logoUrl };
}

function extractYear(firstAirDate: string | null | undefined): number | undefined {
    if (firstAirDate === null || firstAirDate === undefined || firstAirDate.length < 4) {
        return undefined;
    }
    return Number(firstAirDate.slice(0, 4));
}

function toPosterUrl(posterPath: string | null | undefined): string | undefined {
    return toImageUrl(posterPath, POSTER_SIZE_SEGMENT);
}

function toLogoUrl(logoPath: string | null | undefined): string | undefined {
    return toImageUrl(logoPath, LOGO_SIZE_SEGMENT);
}

function toImageUrl(imagePath: string | null | undefined, sizeSegment: string): string | undefined {
    if (imagePath === null || imagePath === undefined || imagePath === '') {
        return undefined;
    }
    return `${TMDB_IMAGE_ORIGIN}/${sizeSegment}${imagePath}`;
}
