import type { ProgressEvent, ProgressOutcome, TrackedShow } from './trackedShow';

export function undoLastProgress(
    show: TrackedShow,
    progressEvents: readonly ProgressEvent[],
    expectedRevision: number,
    undoneBy: string,
    undoneAt: string
): ProgressOutcome {
    if (expectedRevision !== show.progressRevision) {
        return rejected('La serie è stata aggiornata nel frattempo: ricarica lo stato prima di annullare.');
    }

    const eventToUndo = findLastUndoableEvent(show, progressEvents);
    if (eventToUndo === undefined) {
        return rejected('Non c\'è nessuna conferma da annullare per questa serie.');
    }

    const undoneEvent = applyUndo(eventToUndo, undoneBy, undoneAt);
    const revertedShow = revertShow(show, eventToUndo, progressEvents, undoneAt);

    return { outcome: 'applied', show: revertedShow, event: undoneEvent };
}

function findLastUndoableEvent(show: TrackedShow, progressEvents: readonly ProgressEvent[]): ProgressEvent | undefined {
    return progressEvents
            .filter((event) => isUndoableEventForShow(event, show))
            .reduce<ProgressEvent | undefined>(keepMostRecent, undefined);
}

function isUndoableEventForShow(event: ProgressEvent, show: TrackedShow): boolean {
    return event.trackedShowId === show.id && event.undoneAt === undefined;
}

function keepMostRecent(latest: ProgressEvent | undefined, candidate: ProgressEvent): ProgressEvent {
    if (latest === undefined) {
        return candidate;
    }
    if (candidate.confirmedAt !== latest.confirmedAt) {
        return candidate.confirmedAt > latest.confirmedAt ? candidate : latest;
    }
    return candidate.id > latest.id ? candidate : latest;
}

function applyUndo(event: ProgressEvent, undoneBy: string, undoneAt: string): ProgressEvent {
    return { ...event, undoneAt, undoneBy };
}

function revertShow(
    show: TrackedShow,
    undoneEvent: ProgressEvent,
    progressEvents: readonly ProgressEvent[],
    undoneAt: string
): TrackedShow {
    const lastViewedAt = resolveLastViewedAt(progressEvents, undoneEvent);
    return {
        ...show,
        lastWatchedEpisodeId: undoneEvent.previousEpisodeId,
        lastViewedAt,
        progressRevision: show.progressRevision + 1,
        updatedAt: undoneAt
    };
}

function resolveLastViewedAt(progressEvents: readonly ProgressEvent[], undoneEvent: ProgressEvent): string | undefined {
    if (undoneEvent.previousEpisodeId === undefined) {
        return undefined;
    }
    const restoredConfirmation = findConfirmationOf(progressEvents, undoneEvent.trackedShowId, undoneEvent.previousEpisodeId);
    return restoredConfirmation?.confirmedAt;
}

function findConfirmationOf(
    progressEvents: readonly ProgressEvent[],
    trackedShowId: string,
    confirmedEpisodeId: string
): ProgressEvent | undefined {
    return progressEvents
            .filter((event) => event.trackedShowId === trackedShowId && event.confirmedEpisodeId === confirmedEpisodeId)
            .reduce<ProgressEvent | undefined>(keepMostRecent, undefined);
}

function rejected(reason: string): ProgressOutcome {
    return { outcome: 'rejected', reason };
}
