import { describe, expect, it } from 'vitest';

import { advanceProgress } from './progressAdvance';
import { undoLastProgress } from './progressUndo';
import { selectPosterUrl } from './seasonPoster';
import type { Episode, ProgressEvent, Season, TrackedShow } from './trackedShow';
import { calculateWatchPosition } from './watchPosition';

const TODAY = '2026-02-01';
const UNDONE_AT = '2026-02-01T12:00:00Z';
const UNDONE_BY = 'irene';

function buildEpisode(seasonNumber: number, episodeNumber: number, airDate = '2026-01-01'): Episode {
    return {
        providerEpisodeId: `s${seasonNumber}e${episodeNumber}`,
        seasonNumber,
        episodeNumber,
        title: `S${seasonNumber}E${episodeNumber}`,
        airDate
    };
}

function buildSeason(seasonNumber: number, episodeCount: number, posterUrl?: string): Season {
    const episodes = Array.from({ length: episodeCount }, (_, index) => buildEpisode(seasonNumber, index + 1));
    return {
        providerSeasonId: `season-${seasonNumber}`,
        seasonNumber,
        posterUrl,
        episodes
    };
}

function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === 'object') {
        const nestedValues = Object.values(value as object);
        nestedValues.forEach(deepFreeze);
        Object.freeze(value);
    }
    return value;
}

function buildShow(seasons: readonly Season[], lastWatchedEpisodeId?: string, progressRevision = 0): TrackedShow {
    return {
        id: 'show-1',
        catalogProvider: 'tmdb',
        providerShowId: 'tmdb-1',
        title: 'Serie di prova',
        status: 'In corso',
        seasons,
        italianProviders: [],
        lastWatchedEpisodeId,
        progressRevision,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
    };
}

function buildEvent(overrides: Partial<ProgressEvent> = {}): ProgressEvent {
    return {
        id: 'event-1',
        trackedShowId: 'show-1',
        previousEpisodeId: undefined,
        confirmedEpisodeId: 's1e1',
        seasonNumber: 1,
        episodeNumber: 1,
        episodeTitle: 'S1E1',
        confirmedAt: '2026-01-10T00:00:00Z',
        confirmedBy: 'fabio',
        ...overrides
    };
}

describe('undoLastProgress', () => {
    it('ripristina esattamente posizione, conteggi e locandina (criterio 6)', () => {
        const originalShow = buildShow([buildSeason(1, 3, 'poster-s1.jpg'), buildSeason(2, 2, 'poster-s2.jpg')]);
        const positionBefore = calculateWatchPosition(originalShow, TODAY);
        const posterBefore = selectPosterUrl(originalShow, positionBefore.nextUnwatchedEpisode);

        const advanceOutcome = advanceProgress(originalShow, 's2e1', 'fabio', '2026-01-20T00:00:00Z', TODAY);
        if (advanceOutcome.outcome !== 'applied') {
            throw new Error('avanzamento inatteso rifiutato');
        }

        const undoOutcome = undoLastProgress(
            advanceOutcome.show,
            [advanceOutcome.event],
            advanceOutcome.show.progressRevision,
            UNDONE_BY,
            UNDONE_AT
        );
        if (undoOutcome.outcome !== 'applied') {
            throw new Error('undo inatteso rifiutato');
        }

        const positionAfter = calculateWatchPosition(undoOutcome.show, TODAY);
        const posterAfter = selectPosterUrl(undoOutcome.show, positionAfter.nextUnwatchedEpisode);

        expect(undoOutcome.show.lastWatchedEpisodeId).toBe(originalShow.lastWatchedEpisodeId);
        expect(positionAfter).toEqual(positionBefore);
        expect(posterAfter).toBe(posterBefore);
        expect(undoOutcome.event.undoneAt).toBe(UNDONE_AT);
        expect(undoOutcome.event.undoneBy).toBe(UNDONE_BY);
    });

    it('rifiuta l\'undo quando non esiste alcuna conferma annullabile', () => {
        const show = buildShow([buildSeason(1, 2)]);

        const outcome = undoLastProgress(show, [], show.progressRevision, UNDONE_BY, UNDONE_AT);

        expect(outcome.outcome).toBe('rejected');
    });

    it('agisce sulla conferma precedente non annullata quando l\'ultima è già stata annullata', () => {
        const alreadyUndoneEvent = buildEvent({
            id: 'event-1',
            previousEpisodeId: undefined,
            confirmedEpisodeId: 's1e1',
            confirmedAt: '2026-01-10T00:00:00Z',
            undoneAt: '2026-01-15T00:00:00Z',
            undoneBy: 'fabio'
        });
        const stillActiveEvent = buildEvent({
            id: 'event-2',
            previousEpisodeId: 's1e1',
            confirmedEpisodeId: 's1e2',
            confirmedAt: '2026-01-20T00:00:00Z'
        });
        const show = buildShow([buildSeason(1, 3)], 's1e2', 2);

        const outcome = undoLastProgress(
            show,
            [alreadyUndoneEvent, stillActiveEvent],
            show.progressRevision,
            UNDONE_BY,
            UNDONE_AT
        );

        if (outcome.outcome !== 'applied') {
            throw new Error('undo inatteso rifiutato');
        }
        expect(outcome.show.lastWatchedEpisodeId).toBe('s1e1');
        expect(outcome.event.id).toBe('event-2');
    });

    it('rifiuta l\'undo quando anche la conferma precedente risulta già annullata', () => {
        const firstEvent = buildEvent({
            id: 'event-1',
            previousEpisodeId: undefined,
            confirmedEpisodeId: 's1e1',
            undoneAt: '2026-01-15T00:00:00Z',
            undoneBy: 'fabio'
        });
        const secondEvent = buildEvent({
            id: 'event-2',
            previousEpisodeId: 's1e1',
            confirmedEpisodeId: 's1e2',
            undoneAt: '2026-01-25T00:00:00Z',
            undoneBy: 'irene'
        });
        const show = buildShow([buildSeason(1, 3)], 's1e1', 3);

        const outcome = undoLastProgress(show, [firstEvent, secondEvent], show.progressRevision, UNDONE_BY, UNDONE_AT);

        expect(outcome.outcome).toBe('rejected');
    });

    it('rifiuta l\'undo per conflitto di revisione, invitando a ricaricare lo stato', () => {
        const event = buildEvent({ previousEpisodeId: undefined, confirmedEpisodeId: 's1e1' });
        const show = buildShow([buildSeason(1, 2)], 's1e1', 3);

        const outcome = undoLastProgress(show, [event], 2, UNDONE_BY, UNDONE_AT);

        expect(outcome.outcome).toBe('rejected');
        if (outcome.outcome === 'rejected') {
            expect(outcome.reason).toMatch(/ricaric/i);
        }
    });

    it('non muta la serie né gli eventi ricevuti', () => {
        const event = buildEvent({ previousEpisodeId: undefined, confirmedEpisodeId: 's1e1' });
        const show = buildShow([buildSeason(1, 2)], 's1e1', 0);
        deepFreeze(show);
        const progressEvents = [event];
        deepFreeze(progressEvents);
        const showSnapshot = JSON.parse(JSON.stringify(show)) as TrackedShow;
        const eventSnapshot = JSON.parse(JSON.stringify(event)) as ProgressEvent;

        const outcome = undoLastProgress(show, progressEvents, show.progressRevision, UNDONE_BY, UNDONE_AT);

        expect(outcome.outcome).toBe('applied');
        expect(show).toEqual(showSnapshot);
        expect(event).toEqual(eventSnapshot);
    });

    it('dopo l\'undo di una seconda conferma, lastViewedAt torna all\'istante della conferma ripristinata', () => {
        const show = buildShow([buildSeason(1, 3)]);

        const firstConfirm = advanceProgress(show, 's1e1', 'fabio', '2026-01-05T09:00:00Z', TODAY);
        if (firstConfirm.outcome !== 'applied') {
            throw new Error('avanzamento inatteso rifiutato');
        }
        const secondConfirm = advanceProgress(firstConfirm.show, 's1e2', 'fabio', '2026-01-20T09:00:00Z', TODAY);
        if (secondConfirm.outcome !== 'applied') {
            throw new Error('avanzamento inatteso rifiutato');
        }

        const outcome = undoLastProgress(
            secondConfirm.show,
            [firstConfirm.event, secondConfirm.event],
            secondConfirm.show.progressRevision,
            UNDONE_BY,
            UNDONE_AT
        );

        if (outcome.outcome !== 'applied') {
            throw new Error('undo inatteso rifiutato');
        }
        expect(outcome.show.lastWatchedEpisodeId).toBe('s1e1');
        expect(outcome.show.lastViewedAt).toBe(firstConfirm.event.confirmedAt);
    });

    it('a parità di confirmedAt, sceglie la conferma da annullare in modo indipendente dall\'ordine degli eventi', () => {
        const eventWithLowerId = buildEvent({
            id: 'event-a',
            previousEpisodeId: undefined,
            confirmedEpisodeId: 's1e1',
            confirmedAt: '2026-01-20T09:00:00.000Z'
        });
        const eventWithHigherId = buildEvent({
            id: 'event-b',
            previousEpisodeId: 's1e1',
            confirmedEpisodeId: 's1e2',
            confirmedAt: '2026-01-20T09:00:00.000Z'
        });
        const show = buildShow([buildSeason(1, 3)], 's1e2', 2);

        const outcomeInOrder = undoLastProgress(
            show,
            [eventWithLowerId, eventWithHigherId],
            show.progressRevision,
            UNDONE_BY,
            UNDONE_AT
        );
        const outcomeReversed = undoLastProgress(
            show,
            [eventWithHigherId, eventWithLowerId],
            show.progressRevision,
            UNDONE_BY,
            UNDONE_AT
        );

        if (outcomeInOrder.outcome !== 'applied' || outcomeReversed.outcome !== 'applied') {
            throw new Error('undo inatteso rifiutato');
        }
        expect(outcomeInOrder.event.id).toBe('event-b');
        expect(outcomeReversed.event.id).toBe('event-b');
        expect(outcomeInOrder.show.lastWatchedEpisodeId).toBe('s1e1');
    });
});
