import { isAlreadyPublished } from './catalogDate';
import { buildEpisodeSequence, positionOfEpisode } from './episodeOrder';
import { generateId } from './identity';
import type { Episode, ProgressEvent, ProgressOutcome, TrackedShow } from './trackedShow';
import { calculateWatchPosition } from './watchPosition';

export function advanceProgress(
    show: TrackedShow,
    targetEpisodeId: string,
    confirmedBy: string,
    confirmedAt: string,
    today: string
): ProgressOutcome {
    const sequence = buildEpisodeSequence(show);
    const targetPosition = positionOfEpisode(sequence, targetEpisodeId);
    const targetEpisode = sequence[targetPosition];

    if (targetEpisode === undefined) {
        return rejected('L\'episodio scelto non fa parte di questa serie.');
    }
    if (isFutureEpisode(targetEpisode, today)) {
        return rejected('Questa puntata non è ancora uscita.');
    }

    const watchPosition = calculateWatchPosition(show, today);
    const isForward = isForwardTarget(sequence, targetPosition, watchPosition.nextUnwatchedEpisode);
    if (!isForward) {
        return rejected('Questa puntata risulta già vista: la posizione non può tornare indietro.');
    }

    const event = buildAdvanceEvent(show, targetEpisode, confirmedBy, confirmedAt);
    const advancedShow = applyAdvance(show, targetEpisode, confirmedAt);

    return { outcome: 'applied', show: advancedShow, event };
}

function isForwardTarget(
    sequence: readonly Episode[],
    targetPosition: number,
    nextUnwatchedEpisode: Episode | undefined
): boolean {
    if (nextUnwatchedEpisode === undefined) {
        return false;
    }
    const nextPosition = positionOfEpisode(sequence, nextUnwatchedEpisode.providerEpisodeId);
    return targetPosition >= nextPosition;
}

function isFutureEpisode(episode: Episode, today: string): boolean {
    return !isAlreadyPublished(episode.airDate, today);
}

function buildAdvanceEvent(
    show: TrackedShow,
    episode: Episode,
    confirmedBy: string,
    confirmedAt: string
): ProgressEvent {
    const id = generateId();
    return {
        id,
        trackedShowId: show.id,
        previousEpisodeId: show.lastWatchedEpisodeId,
        confirmedEpisodeId: episode.providerEpisodeId,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        episodeTitle: episode.title,
        confirmedAt,
        confirmedBy
    };
}

function applyAdvance(show: TrackedShow, episode: Episode, confirmedAt: string): TrackedShow {
    return {
        ...show,
        lastWatchedEpisodeId: episode.providerEpisodeId,
        lastViewedAt: confirmedAt,
        progressRevision: show.progressRevision + 1,
        updatedAt: confirmedAt
    };
}

function rejected(reason: string): ProgressOutcome {
    return { outcome: 'rejected', reason };
}
