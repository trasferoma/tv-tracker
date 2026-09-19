import { afterEach, describe, expect, it, vi } from 'vitest';

import { localTrackedShowStore } from './localTrackedShowStore';
import { tvTrackerDatabase } from './tvTrackerDatabase';
import type { Unsubscribe } from './trackedShowStore';
import type { Episode, ItalianProvider, Season, TrackedShow } from '@/domain/trackedShow';

const TODAY = '2026-02-01';

function buildEpisode(seasonNumber: number, episodeNumber: number, airDate = '2026-01-01'): Episode {
    return {
        providerEpisodeId: `s${seasonNumber}e${episodeNumber}`,
        seasonNumber,
        episodeNumber,
        title: `S${seasonNumber}E${episodeNumber}`,
        airDate
    };
}

function buildSeason(seasonNumber: number, episodeCount: number): Season {
    const episodes = Array.from({ length: episodeCount }, (_, index) => buildEpisode(seasonNumber, index + 1));
    return { providerSeasonId: `season-${seasonNumber}`, seasonNumber, posterUrl: `poster-${seasonNumber}.jpg`, episodes };
}

function buildShow(overrides: Partial<TrackedShow> = {}): TrackedShow {
    const providers: readonly ItalianProvider[] = [{ id: 'netflix', name: 'Netflix', logoUrl: 'netflix.png' }];
    return {
        id: `show-${Math.random().toString(36).slice(2)}`,
        catalogProvider: 'tmdb',
        providerShowId: 'tmdb-1',
        title: 'Serie di prova',
        seriesPosterUrl: 'series-poster.jpg',
        status: 'In corso',
        seasons: [buildSeason(1, 3)],
        italianProviders: providers,
        selectedStreamingProviderId: 'netflix',
        selectedStreamingProviderName: 'Netflix',
        lastWatchedEpisodeId: undefined,
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00.000Z',
        lastViewedAt: undefined,
        catalogUpdatedAt: undefined,
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides
    };
}

function waitForCondition<T>(
    subscribe: (listener: (value: T) => void) => Unsubscribe,
    predicate: (value: T) => boolean
): Promise<T> {
    return new Promise((resolve) => {
        const unsubscribe = subscribe((value) => {
            if (predicate(value)) {
                unsubscribe();
                resolve(value);
            }
        });
    });
}

afterEach(async () => {
    vi.restoreAllMocks();
    await tvTrackerDatabase.trackedShows.clear();
    await tvTrackerDatabase.progressEvents.clear();
});

describe('round-trip del documento annidato', () => {
    it('rilegge la serie con stagioni ed episodi identici a quelli salvati', async () => {
        const show = buildShow({ seasons: [buildSeason(1, 2), buildSeason(2, 2)] });

        await localTrackedShowStore.addShow(show);
        const reloaded = await tvTrackerDatabase.trackedShows.get(show.id);

        expect(reloaded).toEqual(show);
    });
});

describe('sottoscrizione', () => {
    it('la sottoscrizione riceve l\'avviso dopo una scrittura', async () => {
        const show = buildShow();
        const notified = waitForCondition(
            (listener) => localTrackedShowStore.subscribeToTrackedShows(listener),
            (shows: readonly TrackedShow[]) => shows.some((candidate) => candidate.id === show.id)
        );

        await localTrackedShowStore.addShow(show);
        const shows = await notified;

        expect(shows).toHaveLength(1);
    });

    it('una sottoscrizione annullata non riceve più avvisi', async () => {
        const receivedCounts: number[] = [];
        const unsubscribe = localTrackedShowStore.subscribeToTrackedShows((shows) => receivedCounts.push(shows.length));
        await localTrackedShowStore.addShow(buildShow());
        await vi.waitFor(() => expect(receivedCounts.length).toBeGreaterThan(0));

        unsubscribe();
        const countBeforeSecondWrite = receivedCounts.length;
        await localTrackedShowStore.addShow(buildShow({ providerShowId: 'tmdb-2' }));
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(receivedCounts.length).toBe(countBeforeSecondWrite);
    });
});

describe('addShow', () => {
    it('rifiuta un duplicato per providerShowId', async () => {
        const first = buildShow({ providerShowId: 'tmdb-42' });
        const duplicate = buildShow({ providerShowId: 'tmdb-42' });
        await localTrackedShowStore.addShow(first);

        const outcome = await localTrackedShowStore.addShow(duplicate);

        expect(outcome.outcome).toBe('rejected');
        expect(await tvTrackerDatabase.trackedShows.count()).toBe(1);
    });
});

describe('updateCatalog', () => {
    it('rifiuta l\'aggiornamento di una serie non più presente', async () => {
        const outcome = await localTrackedShowStore.updateCatalog(buildShow());

        expect(outcome.outcome).toBe('rejected');
    });
});

describe('changeProvider', () => {
    it('aggiorna la piattaforma senza toccare episodi o posizione', async () => {
        const show = buildShow({ lastWatchedEpisodeId: 's1e1' });
        await localTrackedShowStore.addShow(show);
        const disneyPlus: ItalianProvider = { id: 'disney', name: 'Disney+' };

        const outcome = await localTrackedShowStore.changeProvider(show.id, disneyPlus, '2026-02-02T00:00:00.000Z');

        expect(outcome.outcome).toBe('changed');
        const reloaded = await tvTrackerDatabase.trackedShows.get(show.id);
        expect(reloaded?.selectedStreamingProviderId).toBe('disney');
        expect(reloaded?.selectedStreamingProviderName).toBe('Disney+');
        expect(reloaded?.lastWatchedEpisodeId).toBe('s1e1');
        expect(reloaded?.seasons).toEqual(show.seasons);
    });
});

describe('removeShow', () => {
    it('elimina la serie e i suoi eventi in un\'unica transazione', async () => {
        const show = buildShow();
        await localTrackedShowStore.addShow(show);
        await localTrackedShowStore.advanceProgress(show.id, 's1e1', 'fabio', TODAY);

        const outcome = await localTrackedShowStore.removeShow(show.id);

        expect(outcome.outcome).toBe('removed');
        expect(await tvTrackerDatabase.trackedShows.get(show.id)).toBeUndefined();
        expect(await tvTrackerDatabase.progressEvents.where('trackedShowId').equals(show.id).count()).toBe(0);
    });
});

describe('atomicità di avanzamento ed evento', () => {
    it('un fallimento a metà scrittura non lascia la serie avanzata senza il suo evento', async () => {
        const show = buildShow();
        await localTrackedShowStore.addShow(show);
        vi.spyOn(tvTrackerDatabase.progressEvents, 'add').mockRejectedValueOnce(new Error('errore simulato a metà scrittura'));

        await expect(localTrackedShowStore.advanceProgress(show.id, 's1e1', 'fabio', TODAY)).rejects.toThrow();

        const reloaded = await tvTrackerDatabase.trackedShows.get(show.id);
        expect(reloaded?.lastWatchedEpisodeId).toBeUndefined();
        expect(await tvTrackerDatabase.progressEvents.where('trackedShowId').equals(show.id).count()).toBe(0);
    });
});

describe('rilettura dello stato dentro la transazione', () => {
    it('due avanzamenti concorrenti non fanno regredire la posizione', async () => {
        const show = buildShow({ seasons: [buildSeason(1, 3)] });
        await localTrackedShowStore.addShow(show);

        const [advanceToLast, advanceToMiddle] = await Promise.all([
            localTrackedShowStore.advanceProgress(show.id, 's1e3', 'fabio', TODAY),
            localTrackedShowStore.advanceProgress(show.id, 's1e2', 'irene', TODAY)
        ]);

        expect(advanceToLast.outcome).toBe('applied');
        expect(advanceToMiddle.outcome).toBe('rejected');
        const reloaded = await tvTrackerDatabase.trackedShows.get(show.id);
        expect(reloaded?.lastWatchedEpisodeId).toBe('s1e3');
    });
});

describe('undoLastProgress', () => {
    it('viene respinto per conflitto di revisione anche quando il dominio riceve una revisione attesa non più valida', async () => {
        const show = buildShow();
        await localTrackedShowStore.addShow(show);
        await localTrackedShowStore.advanceProgress(show.id, 's1e1', 'fabio', TODAY);
        await localTrackedShowStore.advanceProgress(show.id, 's1e2', 'fabio', TODAY);
        const staleRevisionCapturedBeforeAdvancing = 0;

        const outcome = await localTrackedShowStore.undoLastProgress(
            show.id,
            staleRevisionCapturedBeforeAdvancing,
            'irene'
        );

        expect(outcome.outcome).toBe('rejected');
        const reloaded = await tvTrackerDatabase.trackedShows.get(show.id);
        expect(reloaded?.lastWatchedEpisodeId).toBe('s1e2');
        expect(reloaded?.progressRevision).toBe(2);
    });

    it('ripristina posizione ed evento in un\'unica transazione quando la revisione è corretta', async () => {
        const show = buildShow();
        await localTrackedShowStore.addShow(show);
        await localTrackedShowStore.advanceProgress(show.id, 's1e1', 'fabio', TODAY);

        const outcome = await localTrackedShowStore.undoLastProgress(show.id, 1, 'irene');

        expect(outcome.outcome).toBe('applied');
        const reloaded = await tvTrackerDatabase.trackedShows.get(show.id);
        expect(reloaded?.lastWatchedEpisodeId).toBeUndefined();
        expect(reloaded?.progressRevision).toBe(2);
        const events = await tvTrackerDatabase.progressEvents.where('trackedShowId').equals(show.id).toArray();
        expect(events).toHaveLength(1);
        expect(events[0]?.undoneBy).toBe('irene');
    });
});

describe('listAllProgressEvents', () => {
    it('restituisce gli eventi di tutte le serie, non solo di una', async () => {
        const first = buildShow({ providerShowId: 'tmdb-first' });
        const second = buildShow({ providerShowId: 'tmdb-second' });
        await localTrackedShowStore.addShow(first);
        await localTrackedShowStore.addShow(second);
        await localTrackedShowStore.advanceProgress(first.id, 's1e1', 'fabio', TODAY);
        await localTrackedShowStore.advanceProgress(second.id, 's1e1', 'irene', TODAY);

        const events = await localTrackedShowStore.listAllProgressEvents();

        expect(events.map((event) => event.trackedShowId).sort()).toEqual([first.id, second.id].sort());
    });
});

describe('replaceAllShows', () => {
    it('sostituisce tutte le serie e tutti gli eventi in una sola transazione, dichiarando l\'esito pieno', async () => {
        const previous = buildShow({ providerShowId: 'tmdb-previous' });
        await localTrackedShowStore.addShow(previous);
        const replacement = buildShow({ providerShowId: 'tmdb-replacement' });

        const outcome = await localTrackedShowStore.replaceAllShows([replacement], []);

        expect(outcome).toEqual({ outcome: 'replaced' });
        const allShows = await tvTrackerDatabase.trackedShows.toArray();
        expect(allShows).toEqual([replacement]);
    });

    it('lascia intatti i dati preesistenti se la sostituzione fallisce a metà', async () => {
        const existing = buildShow({ providerShowId: 'tmdb-existing' });
        await localTrackedShowStore.addShow(existing);
        vi.spyOn(tvTrackerDatabase.progressEvents, 'bulkPut').mockRejectedValueOnce(
            new Error('errore simulato a metà scrittura'));

        await expect(localTrackedShowStore.replaceAllShows([buildShow({ providerShowId: 'tmdb-new' })], []))
            .rejects.toThrow();

        const allShows = await tvTrackerDatabase.trackedShows.toArray();
        expect(allShows).toEqual([existing]);
    });
});
