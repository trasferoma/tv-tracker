import type { EpisodeCatalog } from './episodeOrder';
import type { Episode, Season } from './trackedShow';

export interface AnnouncedEpisodeCatalog extends EpisodeCatalog {
    readonly nextEpisodeToAir?: Episode | undefined;
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
