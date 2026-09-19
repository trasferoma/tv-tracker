import { buildEpisodeSequence, positionOfEpisode, type EpisodeCatalog } from './episodeOrder';
import type { Episode, Season, TrackedShow } from './trackedShow';

export interface AnnouncedEpisodeCatalog extends EpisodeCatalog {
    readonly nextEpisodeToAir?: Episode | undefined;
}

export interface CatalogUpdate extends AnnouncedEpisodeCatalog {
    readonly title: string;
    readonly seriesPosterUrl?: string | undefined;
    readonly status: string;
}

export function mergeAnnouncedEpisode(catalog: AnnouncedEpisodeCatalog): readonly Season[] {
    const announcedEpisode = catalog.nextEpisodeToAir;
    if (announcedEpisode === undefined) {
        return catalog.seasons;
    }
    if (isEpisodeListed(catalog.seasons, announcedEpisode)) {
        return catalog.seasons;
    }
    return insertAnnouncedEpisode(catalog.seasons, announcedEpisode);
}

export type CatalogMergeOutcome =
    | { readonly outcome: 'merged'; readonly show: TrackedShow }
    | { readonly outcome: 'rejected'; readonly reason: string };

export function mergeCatalogUpdate(show: TrackedShow, update: CatalogUpdate, updatedAt: string): CatalogMergeOutcome {
    const seasons = mergeAnnouncedEpisode(update);
    const positionRepair = repairWatchedPosition(show, seasons);
    if (positionRepair.outcome === 'orphaned') {
        const reason = buildOrphanedPositionReason(show.title);
        return { outcome: 'rejected', reason };
    }
    return {
        outcome: 'merged',
        show: {
            ...show,
            title: update.title,
            seriesPosterUrl: update.seriesPosterUrl,
            status: update.status,
            seasons,
            lastWatchedEpisodeId: positionRepair.episodeId,
            catalogUpdatedAt: updatedAt,
            updatedAt
        }
    };
}

function buildOrphanedPositionReason(showTitle: string): string {
    return `Impossibile aggiornare "${showTitle}": nel nuovo catalogo non è rimasta nessuna puntata già vista.`;
}

type WatchedPositionRepair =
    | { readonly outcome: 'resolved'; readonly episodeId: string | undefined }
    | { readonly outcome: 'orphaned' };

function repairWatchedPosition(show: TrackedShow, newSeasons: readonly Season[]): WatchedPositionRepair {
    const previousEpisodeId = show.lastWatchedEpisodeId;
    if (previousEpisodeId === undefined) {
        return { outcome: 'resolved', episodeId: undefined };
    }
    const newSequence = buildEpisodeSequence({ seasons: newSeasons });
    if (positionOfEpisode(newSequence, previousEpisodeId) !== -1) {
        return { outcome: 'resolved', episodeId: previousEpisodeId };
    }
    return findSurvivingPreviousEpisodeId(show, previousEpisodeId, newSequence);
}

function findSurvivingPreviousEpisodeId(
    show: TrackedShow,
    orphanedEpisodeId: string,
    newSequence: readonly Episode[]
): WatchedPositionRepair {
    const oldSequence = buildEpisodeSequence(show);
    const orphanedPosition = positionOfEpisode(oldSequence, orphanedEpisodeId);
    const predecessorsCount = orphanedPosition === -1 ? 0 : orphanedPosition;
    const survivingPredecessors = oldSequence.slice(0, predecessorsCount).reverse();
    const newEpisodeIds = new Set(newSequence.map((episode) => episode.providerEpisodeId));
    const survivingEpisode = survivingPredecessors.find((episode) => newEpisodeIds.has(episode.providerEpisodeId));
    if (survivingEpisode === undefined) {
        return { outcome: 'orphaned' };
    }
    return { outcome: 'resolved', episodeId: survivingEpisode.providerEpisodeId };
}

function isEpisodeListed(seasons: readonly Season[], episode: Episode): boolean {
    const season = findSeasonByNumber(seasons, episode.seasonNumber);
    return season !== undefined && containsEpisode(season, episode.providerEpisodeId);
}

function containsEpisode(season: Season, providerEpisodeId: string): boolean {
    return season.episodes.some((candidate) => candidate.providerEpisodeId === providerEpisodeId);
}

function findSeasonByNumber(seasons: readonly Season[], seasonNumber: number): Season | undefined {
    return seasons.find((season) => season.seasonNumber === seasonNumber);
}

function insertAnnouncedEpisode(seasons: readonly Season[], episode: Episode): readonly Season[] {
    const seasonIndex = seasons.findIndex((season) => season.seasonNumber === episode.seasonNumber);
    if (seasonIndex === -1) {
        const newSeason = createSeasonFor(episode);
        return [...seasons, newSeason];
    }
    return seasons.map((season, index) => (index === seasonIndex ? withInsertedEpisode(season, episode) : season));
}

function createSeasonFor(episode: Episode): Season {
    return {
        providerSeasonId: `season-${episode.seasonNumber}`,
        seasonNumber: episode.seasonNumber,
        episodes: [episode]
    };
}

function withInsertedEpisode(season: Season, episode: Episode): Season {
    const episodes = [...season.episodes, episode].sort(byEpisodeNumber);
    return { ...season, episodes };
}

function byEpisodeNumber(a: Episode, b: Episode): number {
    return a.episodeNumber - b.episodeNumber;
}
