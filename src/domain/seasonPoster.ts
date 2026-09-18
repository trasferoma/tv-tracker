import type { Episode, TrackedShow } from './trackedShow';

const FIRST_SEASON_NUMBER = 1;

export function selectPosterUrl(show: TrackedShow, nextUnwatchedEpisode: Episode | undefined): string | undefined {
    const seasonNumber = nextUnwatchedEpisode?.seasonNumber ?? FIRST_SEASON_NUMBER;
    const season = show.seasons.find((candidate) => candidate.seasonNumber === seasonNumber);
    return season?.posterUrl ?? show.seriesPosterUrl;
}
