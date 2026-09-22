import { isAlreadyPublished } from './catalogDate';
import { buildEpisodeSequence } from './episodeOrder';
import type { Episode, InitialPositionChoice, ResetProgressOutcome, TrackedShow } from './trackedShow';

export function resetProgress(
    show: TrackedShow,
    targetPosition: InitialPositionChoice,
    resetAt: string,
    today: string
): ResetProgressOutcome {
    if (targetPosition.kind === 'notStarted') {
        return resetToPosition(show, undefined, resetAt);
    }

    const targetEpisode = findTargetEpisode(show, targetPosition.episodeId);
    if (targetEpisode === undefined) {
        return rejected('L\'episodio scelto non fa parte di questa serie.');
    }
    if (isFutureEpisode(targetEpisode, today)) {
        return rejected('Non è possibile ripartire da una puntata non ancora uscita.');
    }

    return resetToPosition(show, targetEpisode.providerEpisodeId, resetAt);
}

function findTargetEpisode(show: TrackedShow, episodeId: string): Episode | undefined {
    const sequence = buildEpisodeSequence(show);
    return sequence.find((episode) => episode.providerEpisodeId === episodeId);
}

function resetToPosition(
    show: TrackedShow,
    targetEpisodeId: string | undefined,
    resetAt: string
): ResetProgressOutcome {
    const isAlreadyAtTargetPosition = targetEpisodeId === show.lastWatchedEpisodeId;
    if (isAlreadyAtTargetPosition) {
        return rejected('Non c\'è niente da azzerare per questa serie.');
    }

    const resetShow = applyReset(show, targetEpisodeId, resetAt);
    return { outcome: 'applied', show: resetShow };
}

function applyReset(show: TrackedShow, lastWatchedEpisodeId: string | undefined, resetAt: string): TrackedShow {
    return {
        ...show,
        lastWatchedEpisodeId,
        lastViewedAt: undefined,
        progressRevision: show.progressRevision + 1,
        addedAt: resetAt,
        updatedAt: resetAt
    };
}

function isFutureEpisode(episode: Episode, today: string): boolean {
    return !isAlreadyPublished(episode.airDate, today);
}

function rejected(reason: string): ResetProgressOutcome {
    return { outcome: 'rejected', reason };
}
