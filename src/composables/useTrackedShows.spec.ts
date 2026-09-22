// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTrackedShows, type TrackedShowsDeps, type UseTrackedShows } from './useTrackedShows';
import { findProfileById } from '@/auth/profiles';
import { session } from '@/auth/session';
import type { CatalogSearchResult, CatalogShow, CatalogSource } from '@/catalog/catalogSource';
import type { ShowSortMode } from '@/domain/showSorting';
import type { ShowScope } from '@/domain/showVisibility';
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
        changeVisibility: () => Promise.resolve({ outcome: 'rejected', reason: 'non implementato nel doppio di test' }),
        changeListing: () => Promise.resolve({ outcome: 'rejected', reason: 'non implementato nel doppio di test' }),
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
        resetProgress: () => Promise.resolve({ outcome: 'rejected', reason: 'non implementato nel doppio di test' }),
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

function mountTrackedShows(
    sortMode: ShowSortMode,
    deps: TrackedShowsDeps,
    showCompleted = true,
    scope: ShowScope = 'all',
    showHidden = false
): {
    wrapper: VueWrapper;
    controller: UseTrackedShows;
} {
    let controller!: UseTrackedShows;
    const TestHost = defineComponent({
        setup() {
            controller = useTrackedShows(ref(sortMode), ref(showCompleted), ref(scope), ref(showHidden), deps);
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

describe('useTrackedShows — visibilità delle serie completate', () => {
    it('esclude le serie completate dalla lista quando la preferenza è nascondi', async () => {
        const completedShow = buildShow({
            id: 'completata',
            providerShowId: 'p-completata',
            title: 'Serie completata',
            lastWatchedEpisodeId: 's1e1'
        });
        const { store } = buildMemoryStore([completedShow]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }), false);
        await flushPromises();

        expect(controller.listItems.value).toEqual([]);
        expect(controller.completedCount.value).toBe(1);
    });

    it('mostra le serie completate quando la preferenza è mostra', async () => {
        const completedShow = buildShow({
            id: 'completata',
            providerShowId: 'p-completata',
            title: 'Serie completata',
            lastWatchedEpisodeId: 's1e1'
        });
        const { store } = buildMemoryStore([completedShow]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }), true);
        await flushPromises();

        expect(controller.listItems.value.map((item) => item.id)).toEqual(['completata']);
        expect(controller.completedCount.value).toBe(1);
    });

    it('non nasconde mai una riga degradata, anche con le completate nascoste', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const brokenShow = buildShow({
            id: 'rotta',
            providerShowId: 'p-rotta',
            title: 'Serie rotta',
            lastWatchedEpisodeId: 'episodio-inesistente'
        });
        const { store } = buildMemoryStore([brokenShow]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }), false);
        await flushPromises();

        expect(controller.listItems.value).toHaveLength(1);
        expect(controller.completedCount.value).toBe(0);

        consoleErrorSpy.mockRestore();
    });

    it('il sommario e gli id delle serie tracciate non cambiano per effetto del filtro sulle completate', async () => {
        const completedShow = buildShow({
            id: 'completata',
            providerShowId: 'p-completata',
            title: 'Serie completata',
            lastWatchedEpisodeId: 's1e1'
        });
        const showWithBacklog = buildShow({
            id: 'con-arretrati',
            providerShowId: 'p-con-arretrati',
            title: 'Con arretrati',
            seasons: [buildSeason(1, [
                buildEpisode(1, 1, 'E1', '2026-01-01'),
                buildEpisode(1, 2, 'E2', '2026-01-08')
            ])]
        });
        const { store } = buildMemoryStore([completedShow, showWithBacklog]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }), false);
        await flushPromises();

        expect(controller.summaryText.value).toBe('2 nuove puntate in 1 serie');
        expect(controller.trackedProviderShowIds.value).toEqual(new Set(['p-completata', 'p-con-arretrati']));
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
            changeVisibility: () => Promise.resolve({ outcome: 'changed' }),
            changeListing: () => Promise.resolve({ outcome: 'changed' }),
            advanceProgress: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato in questo test' }),
            undoLastProgress: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato in questo test' }),
            resetProgress: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato in questo test' }),
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

describe('useTrackedShows — visibilità delle serie e lente (Fase 7)', () => {
    it('con la lente "Tutto" mostra le condivise e le mie private, mai le private dell\'altra persona (criterio 3)', async () => {
        const sharedShow = buildShow({ id: 'condivisa', providerShowId: 'p-condivisa', title: 'Condivisa' });
        const myPrivateShow = buildShow({
            id: 'mia-privata',
            providerShowId: 'p-mia-privata',
            title: 'Mia privata',
            visibility: 'private',
            privateFor: FABIO
        });
        const otherPrivateShow = buildShow({
            id: 'altrui-privata',
            providerShowId: 'p-altrui-privata',
            title: 'Privata di Irene',
            visibility: 'private',
            privateFor: 'irene'
        });
        const { store } = buildMemoryStore([sharedShow, myPrivateShow, otherPrivateShow]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }), true, 'all');
        await flushPromises();

        expect(controller.listItems.value.map((item) => item.id).sort()).toEqual(['condivisa', 'mia-privata']);
    });

    it('con la lente "Solo le mie" mostra solo le mie private, non le condivise (criterio 3)', async () => {
        const sharedShow = buildShow({ id: 'condivisa', providerShowId: 'p-condivisa', title: 'Condivisa' });
        const myPrivateShow = buildShow({
            id: 'mia-privata',
            providerShowId: 'p-mia-privata',
            title: 'Mia privata',
            visibility: 'private',
            privateFor: FABIO
        });
        const { store } = buildMemoryStore([sharedShow, myPrivateShow]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }), true, 'mine');
        await flushPromises();

        expect(controller.listItems.value.map((item) => item.id)).toEqual(['mia-privata']);
    });

    it('una serie privata dell\'altra persona non compare con nessuna posizione della lente (criterio 3)', async () => {
        const otherPrivateShow = buildShow({
            id: 'altrui-privata',
            providerShowId: 'p-altrui-privata',
            title: 'Privata di Irene',
            visibility: 'private',
            privateFor: 'irene'
        });
        const { store } = buildMemoryStore([otherPrivateShow]);

        const allScope = mountTrackedShows('activity', buildDeps({ store }), true, 'all');
        await flushPromises();
        expect(allScope.controller.listItems.value).toEqual([]);

        const mineScope = mountTrackedShows('activity', buildDeps({ store }), true, 'mine');
        await flushPromises();
        expect(mineScope.controller.listItems.value).toEqual([]);
    });

    it('il riepilogo resta invariato al cambio di lente perché è calcolato sul visibile (criterio 5)', async () => {
        const sharedShowWithBacklog = buildShow({
            id: 'condivisa',
            providerShowId: 'p-condivisa',
            title: 'Condivisa',
            seasons: [buildSeason(1, [
                buildEpisode(1, 1, 'E1', '2026-01-01'),
                buildEpisode(1, 2, 'E2', '2026-01-08')
            ])]
        });
        const myPrivateShowWithBacklog = buildShow({
            id: 'mia-privata',
            providerShowId: 'p-mia-privata',
            title: 'Mia privata',
            visibility: 'private',
            privateFor: FABIO,
            seasons: [buildSeason(1, [buildEpisode(1, 1, 'E1', '2026-01-01')])]
        });
        const { store } = buildMemoryStore([sharedShowWithBacklog, myPrivateShowWithBacklog]);

        const allScope = mountTrackedShows('activity', buildDeps({ store }), true, 'all');
        await flushPromises();
        const mineScope = mountTrackedShows('activity', buildDeps({ store }), true, 'mine');
        await flushPromises();

        expect(allScope.controller.summaryText.value).toBe('3 nuove puntate in 2 serie');
        expect(mineScope.controller.summaryText.value).toBe(allScope.controller.summaryText.value);
    });

    it('il riepilogo esclude gli arretrati di una serie privata dell\'altra persona (criterio 5)', async () => {
        const sharedShowWithBacklog = buildShow({
            id: 'condivisa',
            providerShowId: 'p-condivisa',
            title: 'Condivisa',
            seasons: [buildSeason(1, [buildEpisode(1, 1, 'E1', '2026-01-01')])]
        });
        const otherPrivateShowWithBacklog = buildShow({
            id: 'altrui-privata',
            providerShowId: 'p-altrui-privata',
            title: 'Privata di Irene',
            visibility: 'private',
            privateFor: 'irene',
            seasons: [buildSeason(1, [
                buildEpisode(1, 1, 'E1', '2026-01-01'),
                buildEpisode(1, 2, 'E2', '2026-01-08')
            ])]
        });
        const { store } = buildMemoryStore([sharedShowWithBacklog, otherPrivateShowWithBacklog]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }), true, 'all');
        await flushPromises();

        expect(controller.summaryText.value).toBe('1 nuova puntata in 1 serie');
    });

    it('hasTrackedShows è falso quando l\'unica serie presente è privata dell\'altra persona', async () => {
        const otherPrivateShow = buildShow({
            id: 'altrui-privata',
            providerShowId: 'p-altrui-privata',
            title: 'Privata di Irene',
            visibility: 'private',
            privateFor: 'irene'
        });
        const { store } = buildMemoryStore([otherPrivateShow]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }), true, 'all');
        await flushPromises();

        expect(controller.hasTrackedShows.value).toBe(false);
    });

    it('il conteggio delle completate è calcolato dopo la lente, non prima (criterio 6)', async () => {
        const sharedCompletedShow = buildShow({
            id: 'condivisa-completata',
            providerShowId: 'p-condivisa-completata',
            title: 'Condivisa completata',
            lastWatchedEpisodeId: 's1e1'
        });
        const myPrivateCompletedShow = buildShow({
            id: 'mia-privata-completata',
            providerShowId: 'p-mia-privata-completata',
            title: 'Mia privata completata',
            visibility: 'private',
            privateFor: FABIO,
            lastWatchedEpisodeId: 's1e1'
        });
        const { store } = buildMemoryStore([sharedCompletedShow, myPrivateCompletedShow]);

        const allScope = mountTrackedShows('activity', buildDeps({ store }), true, 'all');
        await flushPromises();
        const mineScope = mountTrackedShows('activity', buildDeps({ store }), true, 'mine');
        await flushPromises();

        expect(allScope.controller.completedCount.value).toBe(2);
        expect(mineScope.controller.completedCount.value).toBe(1);
    });

    it('il blocco dei duplicati considera il visibile: condivise e mie private sì, private altrui no (criterio 8)', async () => {
        const sharedShow = buildShow({ id: 'condivisa', providerShowId: 'p-condivisa', title: 'Condivisa' });
        const myPrivateShow = buildShow({
            id: 'mia-privata',
            providerShowId: 'p-mia-privata',
            title: 'Mia privata',
            visibility: 'private',
            privateFor: FABIO
        });
        const otherPrivateShow = buildShow({
            id: 'altrui-privata',
            providerShowId: 'p-altrui-privata',
            title: 'Privata di Irene',
            visibility: 'private',
            privateFor: 'irene'
        });
        const { store } = buildMemoryStore([sharedShow, myPrivateShow, otherPrivateShow]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }), true, 'all');
        await flushPromises();

        expect(controller.trackedProviderShowIds.value).toEqual(new Set(['p-condivisa', 'p-mia-privata']));
    });

    it('una riga disallineata privata dell\'altra persona resta nascosta dal filtro di visibilità', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const otherPrivateBrokenShow = buildShow({
            id: 'altrui-rotta',
            providerShowId: 'p-altrui-rotta',
            title: 'Rotta di Irene',
            visibility: 'private',
            privateFor: 'irene',
            lastWatchedEpisodeId: 'episodio-inesistente'
        });
        const sharedBrokenShow = buildShow({
            id: 'condivisa-rotta',
            providerShowId: 'p-condivisa-rotta',
            title: 'Rotta condivisa',
            lastWatchedEpisodeId: 'episodio-inesistente'
        });
        const { store } = buildMemoryStore([otherPrivateBrokenShow, sharedBrokenShow]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }), true, 'all');
        await flushPromises();

        expect(controller.listItems.value.map((item) => item.id)).toEqual(['condivisa-rotta']);
        expect(controller.trackedProviderShowIds.value).toEqual(new Set(['p-condivisa-rotta']));

        consoleErrorSpy.mockRestore();
    });

    it('marca l\'elemento di lista come privato con il profilo proprietario', async () => {
        const myPrivateShow = buildShow({
            id: 'mia-privata',
            providerShowId: 'p-mia-privata',
            title: 'Mia privata',
            visibility: 'private',
            privateFor: FABIO
        });
        const sharedShow = buildShow({ id: 'condivisa', providerShowId: 'p-condivisa', title: 'Condivisa' });
        const { store } = buildMemoryStore([myPrivateShow, sharedShow]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }), true, 'all');
        await flushPromises();

        const privateItem = controller.listItems.value.find((item) => item.id === 'mia-privata')!;
        const sharedItem = controller.listItems.value.find((item) => item.id === 'condivisa')!;
        expect(privateItem.privateProfileId).toBe(FABIO);
        expect(sharedItem.privateProfileId).toBeUndefined();
    });
});

describe('useTrackedShows — stato nascosta e filtro esclusivo "Mostra serie nascoste" (Fase 6)', () => {
    it('il riepilogo esclude le nascoste e non cambia ne con la lente ne con "Mostra serie nascoste" (criterio 5)', async () => {
        const hiddenShowWithBacklog = buildShow({
            id: 'nascosta',
            providerShowId: 'p-nascosta',
            title: 'Nascosta',
            hidden: true,
            seasons: [buildSeason(1, [
                buildEpisode(1, 1, 'E1', '2026-01-01'),
                buildEpisode(1, 2, 'E2', '2026-01-08')
            ])]
        });
        const activeShowWithBacklog = buildShow({
            id: 'attiva',
            providerShowId: 'p-attiva',
            title: 'Attiva',
            visibility: 'private',
            privateFor: FABIO,
            seasons: [buildSeason(1, [buildEpisode(1, 1, 'E1', '2026-01-01')])]
        });
        const { store } = buildMemoryStore([hiddenShowWithBacklog, activeShowWithBacklog]);

        const hiddenOff = mountTrackedShows('activity', buildDeps({ store }), true, 'all', false);
        await flushPromises();
        const hiddenOn = mountTrackedShows('activity', buildDeps({ store }), true, 'all', true);
        await flushPromises();
        const mineScope = mountTrackedShows('activity', buildDeps({ store }), true, 'mine', false);
        await flushPromises();

        expect(hiddenOff.controller.summaryText.value).toBe('1 nuova puntata in 1 serie');
        expect(hiddenOn.controller.summaryText.value).toBe(hiddenOff.controller.summaryText.value);
        expect(mineScope.controller.summaryText.value).toBe(hiddenOff.controller.summaryText.value);
    });

    it('con "Mostra serie nascoste" acceso l\'elenco contiene solo le nascoste; spento solo le attive (criterio 7)', async () => {
        const hiddenShow = buildShow({ id: 'nascosta', providerShowId: 'p-nascosta', title: 'Nascosta', hidden: true });
        const listedShow = buildShow({ id: 'elencata', providerShowId: 'p-elencata', title: 'Elencata' });
        const { store } = buildMemoryStore([hiddenShow, listedShow]);

        const hiddenOff = mountTrackedShows('activity', buildDeps({ store }), true, 'all', false);
        await flushPromises();
        expect(hiddenOff.controller.listItems.value.map((item) => item.id)).toEqual(['elencata']);

        const hiddenOn = mountTrackedShows('activity', buildDeps({ store }), true, 'all', true);
        await flushPromises();
        expect(hiddenOn.controller.listItems.value.map((item) => item.id)).toEqual(['nascosta']);
        const hiddenItem = hiddenOn.controller.listItems.value.find((item) => item.id === 'nascosta')!;
        expect(hiddenItem.isHidden).toBe(true);
    });

    it('con "Mostra serie nascoste" acceso e lente "Solo le mie" mostra solo le nascoste della lente corrente', async () => {
        const hiddenShared = buildShow({
            id: 'nascosta-condivisa', providerShowId: 'p1', title: 'Nascosta condivisa', hidden: true
        });
        const hiddenMine = buildShow({
            id: 'nascosta-mia',
            providerShowId: 'p2',
            title: 'Nascosta mia',
            hidden: true,
            visibility: 'private',
            privateFor: FABIO
        });
        const { store } = buildMemoryStore([hiddenShared, hiddenMine]);

        const allScope = mountTrackedShows('activity', buildDeps({ store }), true, 'all', true);
        await flushPromises();
        expect(allScope.controller.listItems.value.map((item) => item.id).sort())
            .toEqual(['nascosta-condivisa', 'nascosta-mia']);

        const mineScope = mountTrackedShows('activity', buildDeps({ store }), true, 'mine', true);
        await flushPromises();
        expect(mineScope.controller.listItems.value.map((item) => item.id)).toEqual(['nascosta-mia']);
    });

    it('completedCount e calcolato dopo il filtro delle nascoste (criterio 9)', async () => {
        const hiddenCompletedShow = buildShow({
            id: 'nascosta-completata',
            providerShowId: 'p-nascosta-completata',
            title: 'Nascosta completata',
            hidden: true,
            lastWatchedEpisodeId: 's1e1'
        });
        const { store } = buildMemoryStore([hiddenCompletedShow]);

        const hiddenOff = mountTrackedShows('activity', buildDeps({ store }), true, 'all', false);
        await flushPromises();
        expect(hiddenOff.controller.completedCount.value).toBe(0);

        const hiddenOn = mountTrackedShows('activity', buildDeps({ store }), true, 'all', true);
        await flushPromises();
        expect(hiddenOn.controller.completedCount.value).toBe(1);
    });

    it('"Mostra completate" filtra dentro il set scelto da "Mostra serie nascoste", indipendentemente', async () => {
        const hiddenCompleted = buildShow({
            id: 'nascosta-completata', providerShowId: 'p1', title: 'Nascosta completata',
            hidden: true, lastWatchedEpisodeId: 's1e1'
        });
        const hiddenNotCompleted = buildShow({
            id: 'nascosta-da-vedere', providerShowId: 'p2', title: 'Nascosta da vedere', hidden: true
        });
        const activeCompleted = buildShow({
            id: 'attiva-completata', providerShowId: 'p3', title: 'Attiva completata', lastWatchedEpisodeId: 's1e1'
        });
        const activeNotCompleted = buildShow({
            id: 'attiva-da-vedere', providerShowId: 'p4', title: 'Attiva da vedere'
        });
        const { store } = buildMemoryStore([hiddenCompleted, hiddenNotCompleted, activeCompleted, activeNotCompleted]);

        const activeOnlyDueToWatch = mountTrackedShows('activity', buildDeps({ store }), false, 'all', false);
        await flushPromises();
        expect(activeOnlyDueToWatch.controller.listItems.value.map((item) => item.id)).toEqual(['attiva-da-vedere']);

        const activeAll = mountTrackedShows('activity', buildDeps({ store }), true, 'all', false);
        await flushPromises();
        expect(activeAll.controller.listItems.value.map((item) => item.id).sort())
            .toEqual(['attiva-completata', 'attiva-da-vedere']);

        const hiddenOnlyDueToWatch = mountTrackedShows('activity', buildDeps({ store }), false, 'all', true);
        await flushPromises();
        expect(hiddenOnlyDueToWatch.controller.listItems.value.map((item) => item.id)).toEqual(['nascosta-da-vedere']);

        const hiddenAll = mountTrackedShows('activity', buildDeps({ store }), true, 'all', true);
        await flushPromises();
        expect(hiddenAll.controller.listItems.value.map((item) => item.id).sort())
            .toEqual(['nascosta-completata', 'nascosta-da-vedere']);
    });

    it('una serie nascosta e completata e raggiungibile in due passi, senza vicoli ciechi (criterio 10, SPEC §5)', async () => {
        const hiddenCompletedShow = buildShow({
            id: 'nascosta-completata',
            providerShowId: 'p-nascosta-completata',
            title: 'Nascosta completata',
            hidden: true,
            lastWatchedEpisodeId: 's1e1'
        });
        const { store } = buildMemoryStore([hiddenCompletedShow]);

        const bothOff = mountTrackedShows('activity', buildDeps({ store }), false, 'all', false);
        await flushPromises();
        expect(bothOff.controller.completedCount.value).toBe(0);
        expect(bothOff.controller.hiddenCount.value).toBe(1);
        expect(bothOff.controller.listItems.value).toEqual([]);

        const onlyHiddenOn = mountTrackedShows('activity', buildDeps({ store }), false, 'all', true);
        await flushPromises();
        expect(onlyHiddenOn.controller.completedCount.value).toBe(1);
        expect(onlyHiddenOn.controller.listItems.value).toEqual([]);

        const bothOn = mountTrackedShows('activity', buildDeps({ store }), true, 'all', true);
        await flushPromises();
        expect(bothOn.controller.listItems.value.map((item) => item.id)).toEqual(['nascosta-completata']);
    });

    it('hasTrackedShows resta vero anche con tutte le serie nascoste (criterio 11)', async () => {
        const hiddenShow = buildShow({ id: 'nascosta', providerShowId: 'p-nascosta', title: 'Nascosta', hidden: true });
        const { store } = buildMemoryStore([hiddenShow]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }), true, 'all', false);
        await flushPromises();

        expect(controller.hasTrackedShows.value).toBe(true);
    });

    it('hiddenCount conta le nascoste in lente, non le altre', async () => {
        const hiddenShared = buildShow({ id: 'nascosta-condivisa', providerShowId: 'p1', title: 'Nascosta condivisa', hidden: true });
        const hiddenMine = buildShow({
            id: 'nascosta-mia',
            providerShowId: 'p2',
            title: 'Nascosta mia',
            hidden: true,
            visibility: 'private',
            privateFor: FABIO
        });
        const listedShow = buildShow({ id: 'elencata', providerShowId: 'p3', title: 'Elencata' });
        const { store } = buildMemoryStore([hiddenShared, hiddenMine, listedShow]);

        const allScope = mountTrackedShows('activity', buildDeps({ store }), true, 'all', false);
        await flushPromises();
        expect(allScope.controller.hiddenCount.value).toBe(2);

        const mineScope = mountTrackedShows('activity', buildDeps({ store }), true, 'mine', false);
        await flushPromises();
        expect(mineScope.controller.hiddenCount.value).toBe(1);
    });

    it('trackedProviderShowIds include anche le nascoste, per continuare a bloccare il duplicato (criterio 12)', async () => {
        const hiddenShow = buildShow({ id: 'nascosta', providerShowId: 'p-nascosta', title: 'Nascosta', hidden: true });
        const { store } = buildMemoryStore([hiddenShow]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }), true, 'all', false);
        await flushPromises();

        expect(controller.trackedProviderShowIds.value).toEqual(new Set(['p-nascosta']));
    });

    it('fullyHiddenProviderShowIds contiene una serie solo quando tutte le sue schede visibili sono nascoste', async () => {
        const hiddenShow = buildShow({ id: 'nascosta', providerShowId: 'p-nascosta', title: 'Nascosta', hidden: true });
        const listedShow = buildShow({ id: 'elencata', providerShowId: 'p-elencata', title: 'Elencata' });
        const { store } = buildMemoryStore([hiddenShow, listedShow]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }), true, 'all', false);
        await flushPromises();

        expect(controller.fullyHiddenProviderShowIds.value).toEqual(new Set(['p-nascosta']));
    });

    it('fullyHiddenProviderShowIds esclude una serie che ha anche una sola scheda visibile non nascosta', async () => {
        const hiddenCard = buildShow({
            id: 'condivisa-nascosta',
            providerShowId: 'p-doppia',
            title: 'Doppia',
            hidden: true
        });
        const listedCard = buildShow({
            id: 'mia-in-elenco',
            providerShowId: 'p-doppia',
            title: 'Doppia',
            visibility: 'private',
            privateFor: FABIO
        });
        const { store } = buildMemoryStore([hiddenCard, listedCard]);

        const { controller } = mountTrackedShows('activity', buildDeps({ store }), true, 'all', false);
        await flushPromises();

        expect(controller.fullyHiddenProviderShowIds.value).toEqual(new Set());
    });

    it('una riga disallineata resta dentro il filtro delle nascoste', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const brokenHiddenShow = buildShow({
            id: 'rotta-nascosta',
            providerShowId: 'p-rotta-nascosta',
            title: 'Rotta nascosta',
            hidden: true,
            lastWatchedEpisodeId: 'episodio-inesistente'
        });
        const { store } = buildMemoryStore([brokenHiddenShow]);

        const hiddenOff = mountTrackedShows('activity', buildDeps({ store }), true, 'all', false);
        await flushPromises();
        expect(hiddenOff.controller.listItems.value).toEqual([]);

        const hiddenOn = mountTrackedShows('activity', buildDeps({ store }), true, 'all', true);
        await flushPromises();
        expect(hiddenOn.controller.listItems.value).toHaveLength(1);
        expect(hiddenOn.controller.listItems.value[0]?.errorMessage).toBeDefined();

        consoleErrorSpy.mockRestore();
    });
});

describe('useTrackedShows — criterio 4, nascondere è condiviso non personale', () => {
    it('una serie condivisa nascosta resta fuori dall\'elenco per entrambi i profili', async () => {
        const hiddenSharedShow = buildShow({
            id: 'nascosta-condivisa',
            providerShowId: 'p-nascosta-condivisa',
            title: 'Nascosta condivisa',
            hidden: true
        });
        const { store } = buildMemoryStore([hiddenSharedShow]);

        const fabioView = mountTrackedShows(
            'activity', buildDeps({ store, resolveActiveProfileId: () => FABIO }), true, 'all', false);
        await flushPromises();
        const ireneView = mountTrackedShows(
            'activity', buildDeps({ store, resolveActiveProfileId: () => 'irene' }), true, 'all', false);
        await flushPromises();

        expect(fabioView.controller.listItems.value).toEqual([]);
        expect(ireneView.controller.listItems.value).toEqual([]);
    });

    it('con "Mostra serie nascoste" acceso la stessa serie condivisa nascosta ricompare per entrambi i profili', async () => {
        const hiddenSharedShow = buildShow({
            id: 'nascosta-condivisa',
            providerShowId: 'p-nascosta-condivisa',
            title: 'Nascosta condivisa',
            hidden: true
        });
        const { store } = buildMemoryStore([hiddenSharedShow]);

        const fabioView = mountTrackedShows(
            'activity', buildDeps({ store, resolveActiveProfileId: () => FABIO }), true, 'all', true);
        await flushPromises();
        const ireneView = mountTrackedShows(
            'activity', buildDeps({ store, resolveActiveProfileId: () => 'irene' }), true, 'all', true);
        await flushPromises();

        expect(fabioView.controller.listItems.value.map((item) => item.id)).toEqual(['nascosta-condivisa']);
        expect(ireneView.controller.listItems.value.map((item) => item.id)).toEqual(['nascosta-condivisa']);
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
