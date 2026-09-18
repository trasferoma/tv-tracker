import { compareCatalogDates, isAlreadyPublished } from './catalogDate';
import { buildEpisodeSequence, positionOfEpisode } from './episodeOrder';
import type { Episode, TrackedShow } from './trackedShow';

export interface WatchPosition {
    readonly nextUnwatchedEpisode: Episode | undefined;
    readonly firstUnwatchedEpisode: Episode | undefined;
    readonly backlogCount: number;
    readonly isCaughtUp: boolean;
    readonly nextUpcomingEpisode: Episode | undefined;
}

export function calculateWatchPosition(show: TrackedShow, today: string): WatchPosition {
    const sequence = buildEpisodeSequence(show);
    const position = resolveWatchedPosition(show, sequence);
    const unwatchedEpisodes = sequence.slice(position + 1);

    const nextUnwatchedEpisode = unwatchedEpisodes[0];
    const firstUnwatchedEpisode = findFirstPublishedEpisode(unwatchedEpisodes, today);
    const backlogCount = countPublishedEpisodes(unwatchedEpisodes, today);
    const nextUpcomingEpisode = findFirstFutureEpisode(unwatchedEpisodes, today);

    return {
        nextUnwatchedEpisode,
        firstUnwatchedEpisode,
        backlogCount,
        isCaughtUp: backlogCount === 0,
        nextUpcomingEpisode
    };
}

function resolveWatchedPosition(show: TrackedShow, sequence: readonly Episode[]): number {
    const lastWatchedEpisodeId = show.lastWatchedEpisodeId;
    if (lastWatchedEpisodeId === undefined) {
        return -1;
    }

    const position = positionOfEpisode(sequence, lastWatchedEpisodeId);
    if (position === -1) {
        throw new Error(
            `Disallineamento del catalogo per la serie "${show.title}" (id ${show.id}): ` +
            `l'episodio salvato come visto (${lastWatchedEpisodeId}) non è presente nella sequenza corrente.`
        );
    }

    return position;
}

function findFirstPublishedEpisode(episodes: readonly Episode[], today: string): Episode | undefined {
    return episodes.find((episode) => isAlreadyPublished(episode.airDate, today));
}

function countPublishedEpisodes(episodes: readonly Episode[], today: string): number {
    return episodes.filter((episode) => isAlreadyPublished(episode.airDate, today)).length;
}

function findFirstFutureEpisode(episodes: readonly Episode[], today: string): Episode | undefined {
    return episodes.find((episode) => isFutureEpisode(episode, today));
}

function isFutureEpisode(episode: Episode, today: string): boolean {
    return episode.airDate !== undefined && compareCatalogDates(episode.airDate, today) > 0;
}
