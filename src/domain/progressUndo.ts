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
    return findActiveConfirmationOf(progressEvents, show.id, show.lastWatchedEpisodeId);
}

function findActiveConfirmationOf(
    progressEvents: readonly ProgressEvent[],
    trackedShowId: string,
    confirmedEpisodeId: string | undefined
): ProgressEvent | undefined {
    return progressEvents.find(
        (event) => event.trackedShowId === trackedShowId
                && event.confirmedEpisodeId === confirmedEpisodeId
                && event.undoneAt === undefined
    );
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
    const restoredConfirmation = findActiveConfirmationOf(progressEvents, undoneEvent.trackedShowId, undoneEvent.previousEpisodeId);
    return restoredConfirmation?.confirmedAt;
}

function rejected(reason: string): ProgressOutcome {
    return { outcome: 'rejected', reason };
}
