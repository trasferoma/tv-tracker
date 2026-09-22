import { isValidCatalogDate } from '@/domain/catalogDate';
import { resolveShowAudience, withPrivateVisibility, withSharedVisibility } from '@/domain/showVisibility';
import type { CatalogProvider, Episode, ItalianProvider, ProgressEvent, Season, TrackedShow } from '@/domain/trackedShow';
import { BACKUP_FORMAT_VERSION, type BackupFile } from './backupFormat';

export type BackupValidationResult =
    | { readonly valid: true; readonly backup: BackupFile }
    | { readonly valid: false; readonly reason: string };

export function validateBackupFile(input: unknown): BackupValidationResult {
    try {
        const backup = parseBackupFile(input);
        return { valid: true, backup };
    } catch (error) {
        if (error instanceof BackupValidationError) {
            return { valid: false, reason: error.message };
        }
        throw error;
    }
}

class BackupValidationError extends Error {}

function fail(reason: string): never {
    throw new BackupValidationError(reason);
}

function parseBackupFile(input: unknown): BackupFile {
    const file = requireRecord(input, 'Il file');
    requireExactFormatVersion(file.formatVersion);
    const exportedAt = requireNonEmptyString(file.exportedAt, 'La data di esportazione (exportedAt)');
    const rawShows = requireArray(file.shows, 'L\'elenco delle serie (shows)');
    const shows = rawShows.map((rawShow, index) => parseShow(rawShow, index));
    const rawProgressEvents = requireArray(file.progressEvents, 'L\'elenco degli eventi (progressEvents)');
    const progressEvents = rawProgressEvents.map((rawEvent, index) => parseProgressEvent(rawEvent, index));
    return { formatVersion: BACKUP_FORMAT_VERSION, exportedAt, shows, progressEvents };
}

function parseShow(rawShow: unknown, index: number): TrackedShow {
    const label = `La serie in posizione ${index}`;
    const show = requireRecord(rawShow, label);
    const id = requireNonEmptyString(show.id, `${label}: id`);
    const catalogProvider = requireCatalogProvider(show.catalogProvider, `${label}: catalogProvider`);
    const providerShowId = requireNonEmptyString(show.providerShowId, `${label}: providerShowId`);
    const title = requireNonEmptyString(show.title, `${label}: title`);
    const seriesPosterUrl = requireOptionalString(show.seriesPosterUrl, `${label}: seriesPosterUrl`);
    const status = requireNonEmptyString(show.status, `${label}: status`);
    const rawSeasons = requireArray(show.seasons, `${label}: seasons`);
    const seasons = rawSeasons.map((rawSeason, seasonIndex) => parseSeason(rawSeason, label, seasonIndex));
    const rawProviders = requireArray(show.italianProviders, `${label}: italianProviders`);
    const italianProviders = rawProviders.map((rawProvider, providerIndex) =>
        parseItalianProvider(rawProvider, label, providerIndex));
    const selectedStreamingProviderId = requireOptionalString(
        show.selectedStreamingProviderId, `${label}: selectedStreamingProviderId`);
    const selectedStreamingProviderName = requireOptionalString(
        show.selectedStreamingProviderName, `${label}: selectedStreamingProviderName`);
    const visibility = requireVisibility(show.visibility, `${label}: visibility`);
    const privateFor = requireOptionalString(show.privateFor, `${label}: privateFor`);
    const hidden = requireOptionalBoolean(show.hidden, `${label}: hidden`);
    const lastWatchedEpisodeId = requireOptionalString(show.lastWatchedEpisodeId, `${label}: lastWatchedEpisodeId`);
    requireKnownLastWatchedEpisode(lastWatchedEpisodeId, seasons, label);
    const progressRevision = requireNonNegativeInteger(show.progressRevision, `${label}: progressRevision`);
    const addedAt = requireNonEmptyString(show.addedAt, `${label}: addedAt`);
    const lastViewedAt = requireOptionalString(show.lastViewedAt, `${label}: lastViewedAt`);
    const catalogUpdatedAt = requireOptionalString(show.catalogUpdatedAt, `${label}: catalogUpdatedAt`);
    const updatedAt = requireNonEmptyString(show.updatedAt, `${label}: updatedAt`);
    const parsedShow: TrackedShow = {
        id,
        catalogProvider,
        providerShowId,
        title,
        seriesPosterUrl,
        status,
        seasons,
        italianProviders,
        selectedStreamingProviderId,
        selectedStreamingProviderName,
        visibility,
        privateFor,
        hidden,
        lastWatchedEpisodeId,
        progressRevision,
        addedAt,
        lastViewedAt,
        catalogUpdatedAt,
        updatedAt
    };
    requireConsistentVisibility(parsedShow, label);
    return parsedShow;
}

function parseSeason(rawSeason: unknown, showLabel: string, index: number): Season {
    const label = `${showLabel}, stagione in posizione ${index}`;
    const season = requireRecord(rawSeason, label);
    const providerSeasonId = requireNonEmptyString(season.providerSeasonId, `${label}: providerSeasonId`);
    const seasonNumber = requireNonNegativeInteger(season.seasonNumber, `${label}: seasonNumber`);
    const posterUrl = requireOptionalString(season.posterUrl, `${label}: posterUrl`);
    const rawEpisodes = requireArray(season.episodes, `${label}: episodes`);
    const episodes = rawEpisodes.map((rawEpisode, episodeIndex) => parseEpisode(rawEpisode, label, episodeIndex));
    return { providerSeasonId, seasonNumber, posterUrl, episodes };
}

function parseEpisode(rawEpisode: unknown, seasonLabel: string, index: number): Episode {
    const label = `${seasonLabel}, episodio in posizione ${index}`;
    const episode = requireRecord(rawEpisode, label);
    const providerEpisodeId = requireNonEmptyString(episode.providerEpisodeId, `${label}: providerEpisodeId`);
    const seasonNumber = requireNonNegativeInteger(episode.seasonNumber, `${label}: seasonNumber`);
    const episodeNumber = requirePositiveInteger(episode.episodeNumber, `${label}: episodeNumber`);
    const title = requireString(episode.title, `${label}: title`);
    const airDate = requireOptionalCatalogDate(episode.airDate, `${label}: airDate`);
    return { providerEpisodeId, seasonNumber, episodeNumber, title, airDate };
}

function parseItalianProvider(rawProvider: unknown, showLabel: string, index: number): ItalianProvider {
    const label = `${showLabel}, piattaforma in posizione ${index}`;
    const provider = requireRecord(rawProvider, label);
    const id = requireNonEmptyString(provider.id, `${label}: id`);
    const name = requireNonEmptyString(provider.name, `${label}: name`);
    const logoUrl = requireOptionalString(provider.logoUrl, `${label}: logoUrl`);
    return { id, name, logoUrl };
}

function parseProgressEvent(rawEvent: unknown, index: number): ProgressEvent {
    const label = `L'evento in posizione ${index}`;
    const event = requireRecord(rawEvent, label);
    const id = requireNonEmptyString(event.id, `${label}: id`);
    const trackedShowId = requireNonEmptyString(event.trackedShowId, `${label}: trackedShowId`);
    const previousEpisodeId = requireOptionalString(event.previousEpisodeId, `${label}: previousEpisodeId`);
    const confirmedEpisodeId = requireNonEmptyString(event.confirmedEpisodeId, `${label}: confirmedEpisodeId`);
    const seasonNumber = requireNonNegativeInteger(event.seasonNumber, `${label}: seasonNumber`);
    const episodeNumber = requirePositiveInteger(event.episodeNumber, `${label}: episodeNumber`);
    const episodeTitle = requireString(event.episodeTitle, `${label}: episodeTitle`);
    const confirmedAt = requireNonEmptyString(event.confirmedAt, `${label}: confirmedAt`);
    const confirmedBy = requireNonEmptyString(event.confirmedBy, `${label}: confirmedBy`);
    const undoneAt = requireOptionalString(event.undoneAt, `${label}: undoneAt`);
    const undoneBy = requireOptionalString(event.undoneBy, `${label}: undoneBy`);
    return {
        id,
        trackedShowId,
        previousEpisodeId,
        confirmedEpisodeId,
        seasonNumber,
        episodeNumber,
        episodeTitle,
        confirmedAt,
        confirmedBy,
        undoneAt,
        undoneBy
    };
}

function requireKnownLastWatchedEpisode(
    lastWatchedEpisodeId: string | undefined,
    seasons: readonly Season[],
    showLabel: string
): void {
    if (lastWatchedEpisodeId === undefined) {
        return;
    }
    const isKnownEpisode = seasons.some((season) =>
        season.episodes.some((episode) => episode.providerEpisodeId === lastWatchedEpisodeId));
    if (!isKnownEpisode) {
        fail(`${showLabel}: lastWatchedEpisodeId "${lastWatchedEpisodeId}" non corrisponde a nessun episodio della serie.`);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
    if (!isRecord(value)) {
        fail(`${label} deve essere un oggetto JSON valido.`);
    }
    return value;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) {
        fail(`${label} deve essere un elenco.`);
    }
    return value;
}

function requireString(value: unknown, label: string): string {
    if (typeof value !== 'string') {
        fail(`${label} deve essere un testo.`);
    }
    return value;
}

function requireNonEmptyString(value: unknown, label: string): string {
    const text = requireString(value, label);
    if (text.length === 0) {
        fail(`${label} non può essere vuoto.`);
    }
    return text;
}

function requireOptionalString(value: unknown, label: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    return requireString(value, label);
}

function requireOptionalBoolean(value: unknown, label: string): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'boolean') {
        fail(`${label} deve essere un valore booleano.`);
    }
    return value;
}

function requireOptionalCatalogDate(value: unknown, label: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    const text = requireString(value, label);
    if (!isValidCatalogDate(text)) {
        fail(`${label} deve essere una data catalogo valida in formato YYYY-MM-DD.`);
    }
    return text;
}

function requireFiniteNumber(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        fail(`${label} deve essere un numero.`);
    }
    return value;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
    const numericValue = requireFiniteNumber(value, label);
    if (!Number.isInteger(numericValue) || numericValue < 0) {
        fail(`${label} deve essere un numero intero non negativo.`);
    }
    return numericValue;
}

function requirePositiveInteger(value: unknown, label: string): number {
    const numericValue = requireFiniteNumber(value, label);
    if (!Number.isInteger(numericValue) || numericValue <= 0) {
        fail(`${label} deve essere un numero intero maggiore di zero.`);
    }
    return numericValue;
}

function requireExactFormatVersion(value: unknown): void {
    if (value === BACKUP_FORMAT_VERSION) {
        return;
    }
    fail(`Versione del formato non supportata: attesa ${BACKUP_FORMAT_VERSION}, trovata ${JSON.stringify(value)}.`);
}

function requireVisibility(value: unknown, label: string): 'shared' | 'private' {
    if (value !== 'shared' && value !== 'private') {
        fail(`${label} deve essere "shared" oppure "private".`);
    }
    return value;
}

function requireConsistentVisibility(show: TrackedShow, label: string): void {
    const audience = resolveShowAudience(show);
    const canonicalShow = audience.kind === 'private'
        ? withPrivateVisibility(show, audience.profileId)
        : withSharedVisibility(show);
    const isConsistent = canonicalShow.visibility === show.visibility && canonicalShow.privateFor === show.privateFor;
    if (!isConsistent) {
        fail(`${label}: privateFor deve essere presente se e solo se visibility è "private".`);
    }
}

function requireCatalogProvider(value: unknown, label: string): CatalogProvider {
    const text = requireNonEmptyString(value, label);
    if (text !== 'tmdb') {
        fail(`${label} deve essere "tmdb".`);
    }
    return text;
}
