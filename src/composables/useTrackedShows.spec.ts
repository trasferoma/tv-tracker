// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTrackedShows, type TrackedShowsDeps, type UseTrackedShows } from './useTrackedShows';
import { findProfileById } from '@/auth/profiles';
import { session } from '@/auth/session';
import type { CatalogSearchResult, CatalogShow, CatalogSource } from '@/catalog/catalogSource';
import type { ShowSortMode } from '@/domain/showSorting';
import type { Episode, ItalianProvider, ProgressOutcome, Season, TrackedShow } from '@/domain/trackedShow';
import { advanceProgress } from '@/domain/progressAdvance';
import type {
    AddShowOutcome,
    TrackedShowListener,
    TrackedShowsListener,
    TrackedShowStore,
    Unsubscribe
} from '@/persistence/trackedShowStore';

const TODAY = '2026-03-01';
const FABIO = 'fabio';

function buildEpisode(seasonNumber: number, episodeNumber: number, title: string, airDate: string): Episode {
    return { providerEpisodeId: `s${seasonNumber}e${episodeNumber}`, seasonNumber, episodeNumber, title, airDate };
}

function buildSeason(seasonNumber: number, episodes: readonly Episode[]): Season {
    return { providerSeasonId: `season-${seasonNumber}`, seasonNumber, episodes };
}

function buildShow(overrides: Partial<TrackedShow> = {}): TrackedShow {
    return {
        id: `show-${Math.random().toString(36).slice(2)}`,
        catalogProvider: 'tmdb',
        providerShowId: `provider-${Math.random().toString(36).slice(2)}`,
        title: 'Serie di prova',
        status: 'In corso',
        seasons: [buildSeason(1, [buildEpisode(1, 1, 'Episodio 1', '2026-01-01')])],
        italianProviders: [],
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides
    };
}

function buildMemoryStore(initialShows: readonly TrackedShow[] = []): {
    store: TrackedShowStore;
    getShows: () => readonly TrackedShow[];
} {
    let shows: readonly TrackedShow[] = [...initialShows];
    const listeners = new Set<TrackedShowsListener>();

    function notifyListeners(): void {
        for (const listener of listeners) {
            listener(shows);
        }
    }

    const store: TrackedShowStore = {
        subscribeToTrackedShows(listener: TrackedShowsListener): Unsubscribe {
            listeners.add(listener);
            listener(shows);
            return () => listeners.delete(listener);
        },
        subscribeToShow(id: string, listener: TrackedShowListener): Unsubscribe {
            listener(shows.find((show) => show.id === id));
            return () => {};
        },
        addShow(show: TrackedShow): Promise<AddShowOutcome> {
            if (shows.some((candidate) => candidate.providerShowId === show.providerShowId)) {
                return Promise.resolve({ outcome: 'rejected', reason: 'Questa serie è già stata aggiunta.' });
            }
            shows = [...shows, show];
            notifyListeners();
            return Promise.resolve({ outcome: 'added' });
        },
        updateCatalog: () => Promise.resolve({ outcome: 'rejected', reason: 'non implementato nel doppio di test' }),
        changeProvider: () => Promise.resolve({ outcome: 'rejected', reason: 'non implementato nel doppio di test' }),
        advanceProgress(id: string, targetEpisodeId: string, confirmedBy: string, today: string): Promise<ProgressOutcome> {
            const show = shows.find((candidate) => candidate.id === id);
            if (show === undefined) {
                return Promise.resolve({ outcome: 'rejected', reason: 'La serie non esiste più.' });
            }
            const outcome = advanceProgress(show, targetEpisodeId, confirmedBy, new Date().toISOString(), today);
            if (outcome.outcome === 'applied') {
                shows = shows.map((candidate) => (candidate.id === id ? outcome.show : candidate));
                notifyListeners();
            }
            return Promise.resolve(outcome);
        },
        undoLastProgress: () => Promise.resolve({ outcome: 'rejected', reason: 'non implementato nel doppio di test' }),
        removeShow: () => Promise.resolve({ outcome: 'rejected', reason: 'non implementato nel doppio di test' }),
        listAllProgressEvents: () => Promise.resolve([]),
        replaceAllShows: () => Promise.reject(new Error('non implementato nel doppio di test'))
    };

    return { store, getShows: () => shows };
}

function buildDeps(overrides: TrackedShowsDeps = {}): TrackedShowsDeps {
    return { resolveToday: () => TODAY, resolveActiveProfileId: () => FABIO, ...overrides };
}

const mountedWrappers: Array<VueWrapper> = [];

function mountTrackedShows(sortMode: ShowSortMode, deps: TrackedShowsDeps): {
    wrapper: VueWrapper;
    controller: UseTrackedShows;
} {
    let controller!: UseTrackedShows;
    const TestHost = defineComponent({
        setup() {
            controller = useTrackedShows(ref(sortMode), deps);
            return () => h('div');
        }
    });
    const wrapper = mount(TestHost);
    mountedWrappers.push(wrapper);
    return { wrapper, controller };
}

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
});

describe('useTrackedShows — criterio 3, prima puntata da vedere e arretrati', () => {
    it('mostra la prima puntata pubblicata non vista e il numero di arretrati', async () => {
        const episodes = [
            buildEpisode(1, 1, 'Episodio 1', '2026-01-01'),
            buildEpisode(1, 2, 'Episodio 2', '2026-01-08'),
            buildEpisode(1, 3, 'Episodio 3', '2026-01-15')
        ];
        const show = buildShow({ id: 'show-1', seasons: [buildSeason(1, episodes)], lastWatchedEpisodeId: 's1e1' });
        const { store } = buildMemoryStore([show]);
        const { controller } = mountTrackedShows('activity', buildDeps({ store }));
        await flushPromises();

        const item = controller.listItems.value[0]!;
        expect(item.episodeHeadline).toBe('S01 E02 · Episodio 2');
        expect(item.badgeLabel).toBe('2 nuove');
        expect(item.episodeDateLabel).toContain('Data catalogo');
    });
});

describe('useTrackedShows — criterio 5, annullare la conferma non cambia lo stato', () => {
    it('lo stato del repository resta identico quando la conferma viene annullata', async () => {
        const show = buildShow({ id: 'show-1' });
        const { store, getShows } = buildMemoryStore([show]);
        const { controller } = mountTrackedShows('activity', buildDeps({ store }));
        await flushPromises();

        controller.requestWatch('show-1');
        expect(controller.pendingWatch.value).toBeDefined();

        controller.cancelPendingWatch();

        expect(controller.pendingWatch.value).toBeUndefined();
        expect(getShows()).toEqual([show]);
    });
});

describe('useTrackedShows — criterio 14, confirmedBy con l\'identità autenticata', () => {
    afterEach(() => {
        session.state.value = { status: 'anonymous' };
    });

    it('senza forzare l\'identità nei test, la conferma registra il profilo autenticato in sessione', async () => {
        const irene = findProfileById('irene');
        if (irene === undefined) {
            throw new Error('profilo di test mancante');
        }
        session.state.value = { status: 'authenticated', profile: irene };

        const show = buildShow({ id: 'show-1' });
        const { store } = buildMemoryStore([show]);
        const { controller } = mountTrackedShows('activity', { store, resolveToday: () => TODAY });
        await flushPromises();

        controller.requestWatch('show-1');
        const outcome = await controller.confirmPendingWatch();

        if (outcome?.outcome !== 'applied') {
            throw new Error('avanzamento inatteso rifiutato');
        }
        expect(outcome.event.confirmedBy).toBe('irene');
    });
});

describe('useTrackedShows — criterio 12, ordinamento per ultima attività', () => {
    it('dopo la conferma la serie sale immediatamente in cima', async () => {
        const alfa = buildShow({
            id: 'alfa',
            providerShowId: 'p-alfa',
            title: 'Alfa',
            lastViewedAt: '2026-02-20T00:00:00Z',
            seasons: [buildSeason(1, [buildEpisode(1, 1, 'E1', '2026-01-01')])]
        });
        const beta = buildShow({
            id: 'beta',
            providerShowId: 'p-beta',
            title: 'Beta',
            lastViewedAt: '2026-01-01T00:00:00Z',
            lastWatchedEpisodeId: 's1e1',
            seasons: [buildSeason(1, [
                buildEpisode(1, 1, 'E1', '2026-01-01'),
                buildEpisode(1, 2, 'E2', '2026-01-02')
            ])]
        });
        const { store } = buildMemoryStore([alfa, beta]);
        const { controller } = mountTrackedShows('activity', buildDeps({ store }));
        await flushPromises();
        expect(controller.listItems.value.map((item) => item.id)).toEqual(['alfa', 'beta']);

        controller.requestWatch('beta');
        await controller.confirmPendingWatch();
        await flushPromises();

        expect(controller.listItems.value.map((item) => item.id)).toEqual(['beta', 'alfa']);
    });
});

describe('useTrackedShows — isolamento per riga (Fase 4)', () => {
    it('una serie con posizione disallineata degrada da sola, le altre restano visibili', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const healthyShow = buildShow({ id: 'sana', providerShowId: 'p-sana', title: 'Serie sana' });
        const brokenShow = buildShow({
            id: 'rotta',
            providerShowId: 'p-rotta',
            title: 'Serie rotta',
            lastWatchedEpisodeId: 'episodio-inesistente'
        });
        const { store } = buildMemoryStore([healthyShow, brokenShow]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }));
        await flushPromises();

        expect(controller.listItems.value).toHaveLength(2);
        const brokenItem = controller.listItems.value.find((item) => item.id === 'rotta')!;
        expect(brokenItem.errorMessage).toBeDefined();
        expect(brokenItem.canConfirmWatched).toBe(false);
        const healthyItem = controller.listItems.value.find((item) => item.id === 'sana')!;
        expect(healthyItem.errorMessage).toBeUndefined();
        expect(consoleErrorSpy).toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
    });

    it('non presenta la riga degradata come "In pari"', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const brokenShow = buildShow({
            id: 'rotta',
            providerShowId: 'p-rotta',
            title: 'Serie rotta',
            lastWatchedEpisodeId: 'episodio-inesistente'
        });
        const { store } = buildMemoryStore([brokenShow]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }));
        await flushPromises();

        const brokenItem = controller.listItems.value[0]!;
        expect(brokenItem.isCaughtUp).toBe(false);
        expect(brokenItem.badgeLabel).toBe('Dati non allineati');
        expect(brokenItem.badgeLabel).not.toBe('In pari');

        consoleErrorSpy.mockRestore();
    });

    it('non conta la riga degradata nel sommario, ne come puntate ne come serie', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const showWithBacklog = buildShow({
            id: 'con-arretrati',
            providerShowId: 'p-con-arretrati',
            title: 'Con arretrati',
            seasons: [buildSeason(1, [
                buildEpisode(1, 1, 'E1', '2026-01-01'),
                buildEpisode(1, 2, 'E2', '2026-01-08')
            ])]
        });
        const brokenShow = buildShow({
            id: 'rotta',
            providerShowId: 'p-rotta',
            title: 'Serie rotta',
            lastWatchedEpisodeId: 'episodio-inesistente'
        });
        const { store } = buildMemoryStore([showWithBacklog, brokenShow]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }));
        await flushPromises();

        expect(controller.summaryText.value).toBe('2 nuove puntate in 1 serie');

        consoleErrorSpy.mockRestore();
    });

    it('non mescola la riga degradata con le serie sane in fondo all\'ordinamento «Più puntate da vedere»', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const caughtUpShow = buildShow({
            id: 'zeta-in-pari',
            providerShowId: 'p-zeta',
            title: 'Zeta in pari',
            lastWatchedEpisodeId: 's1e1'
        });
        const showWithBacklog = buildShow({
            id: 'alfa-arretrati',
            providerShowId: 'p-alfa',
            title: 'Alfa con arretrati',
            seasons: [buildSeason(1, [
                buildEpisode(1, 1, 'E1', '2026-01-01'),
                buildEpisode(1, 2, 'E2', '2026-01-08')
            ])]
        });
        const brokenShow = buildShow({
            id: 'mimi-rotta',
            providerShowId: 'p-mimi',
            title: 'Mimi rotta',
            lastWatchedEpisodeId: 'episodio-inesistente'
        });
        const { store } = buildMemoryStore([caughtUpShow, showWithBacklog, brokenShow]);

        const { controller } = mountTrackedShows('unwatched', buildDeps({ store }));
        await flushPromises();

        expect(controller.listItems.value.map((item) => item.id)).toEqual([
            'mimi-rotta',
            'alfa-arretrati',
            'zeta-in-pari'
        ]);

        consoleErrorSpy.mockRestore();
    });
});

describe('useTrackedShows — sottoscrizione', () => {
    it('annulla la sottoscrizione quando il componente viene smontato', async () => {
        const unsubscribeSpy = vi.fn();
        const store: TrackedShowStore = {
            subscribeToTrackedShows: (listener: TrackedShowsListener) => {
                listener([]);
                return unsubscribeSpy;
            },
            subscribeToShow: () => () => {},
            addShow: () => Promise.resolve({ outcome: 'added' }),
            updateCatalog: () => Promise.resolve({ outcome: 'updated' }),
            changeProvider: () => Promise.resolve({ outcome: 'changed' }),
            advanceProgress: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato in questo test' }),
            undoLastProgress: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato in questo test' }),
            removeShow: () => Promise.resolve({ outcome: 'removed' }),
            listAllProgressEvents: () => Promise.resolve([]),
            replaceAllShows: () => Promise.reject(new Error('non usato in questo test'))
        };
        const { wrapper } = mountTrackedShows('activity', buildDeps({ store }));
        await flushPromises();

        wrapper.unmount();

        expect(unsubscribeSpy).toHaveBeenCalledOnce();
    });
});

describe('useTrackedShows — stato vuoto', () => {
    it('espone una lista vuota quando il repository non ha serie', async () => {
        const { store } = buildMemoryStore([]);
        const { controller } = mountTrackedShows('activity', buildDeps({ store }));
        await flushPromises();

        expect(controller.listItems.value).toEqual([]);
        expect(controller.summaryText.value).toBe('Siete in pari con tutto');
    });
});

describe('useTrackedShows — carica dati di esempio', () => {
    it('importa le serie trovate nel catalogo tramite il contratto CatalogSource', async () => {
        const providerShowId = 'p-1';
        const searchResult: CatalogSearchResult = {
            catalogProvider: 'tmdb',
            providerShowId,
            title: 'The Bear',
            originalTitle: 'The Bear',
            year: 2022,
            status: 'In corso',
            posterUrl: undefined
        };
        const catalogShow: CatalogShow = {
            catalogProvider: 'tmdb',
            providerShowId,
            title: 'The Bear',
            status: 'In corso',
            seasons: [buildSeason(1, [buildEpisode(1, 1, 'Sistema', '2022-06-23')])]
        };
        const providers: readonly ItalianProvider[] = [{ id: 'disney-plus', name: 'Disney+' }];
        const catalogSource: CatalogSource = {
            searchShows: (query: string) => Promise.resolve(
                query === 'The Bear'
                    ? { outcome: 'found', results: [searchResult] }
                    : { outcome: 'found', results: [] }
            ),
            loadShow: () => Promise.resolve({ outcome: 'found', show: catalogShow }),
            loadItalianProviders: () => Promise.resolve({ outcome: 'loaded', providers })
        };
        const { store, getShows } = buildMemoryStore([]);
        const { controller } = mountTrackedShows('activity', buildDeps({ store, catalogSource }));
        await flushPromises();

        await controller.loadSampleData();

        expect(getShows().some((show) => show.providerShowId === providerShowId)).toBe(true);
    });
});
