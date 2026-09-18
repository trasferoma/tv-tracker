// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRouter, createWebHistory } from 'vue-router';

import ShowDetailView from './ShowDetailView.vue';
import type { ShowDetailDeps } from '@/composables/useShowDetail';
import { advanceProgress } from '@/domain/progressAdvance';
import type { Episode, ProgressEvent, ProgressOutcome, Season, TrackedShow } from '@/domain/trackedShow';
import type {
    AddShowOutcome,
    ChangeProviderOutcome,
    RemoveShowOutcome,
    TrackedShowListener,
    TrackedShowsListener,
    TrackedShowStore,
    Unsubscribe,
    UpdateCatalogOutcome
} from '@/persistence/trackedShowStore';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock('@/router', () => ({ router: { push: pushMock } }));

const TODAY = '2026-01-20';
const FABIO = 'fabio';

function buildEpisode(seasonNumber: number, episodeNumber: number, title: string, airDate: string): Episode {
    return { providerEpisodeId: `s${seasonNumber}e${episodeNumber}`, seasonNumber, episodeNumber, title, airDate };
}

function buildSeason(seasonNumber: number, episodes: readonly Episode[]): Season {
    return { providerSeasonId: `season-${seasonNumber}`, seasonNumber, episodes };
}

function buildShow(overrides: Partial<TrackedShow> = {}): TrackedShow {
    return {
        id: 'show-1',
        catalogProvider: 'tmdb',
        providerShowId: 'provider-1',
        title: 'Serie di prova',
        status: 'In corso',
        seasons: [buildSeason(1, [
            buildEpisode(1, 1, 'S1E1', '2026-01-01'),
            buildEpisode(1, 2, 'S1E2', '2026-01-08')
        ])],
        italianProviders: [],
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides
    };
}

function buildFakeStore(initialShow: TrackedShow | undefined): {
    store: TrackedShowStore;
    getShow: () => TrackedShow | undefined;
} {
    let show = initialShow;
    let events: readonly ProgressEvent[] = [];
    const listeners = new Set<TrackedShowListener>();

    function notify(): void {
        for (const listener of listeners) {
            listener(show);
        }
    }

    const store: TrackedShowStore = {
        subscribeToTrackedShows: (listener: TrackedShowsListener): Unsubscribe => {
            listener(show === undefined ? [] : [show]);
            return () => {};
        },
        subscribeToShow(showId: string, listener: TrackedShowListener): Unsubscribe {
            listeners.add(listener);
            listener(show?.id === showId ? show : undefined);
            return () => listeners.delete(listener);
        },
        addShow: (): Promise<AddShowOutcome> => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
        updateCatalog: (): Promise<UpdateCatalogOutcome> => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
        changeProvider: (): Promise<ChangeProviderOutcome> => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
        advanceProgress(showId: string, targetEpisodeId: string, confirmedBy: string, today: string): Promise<ProgressOutcome> {
            if (show === undefined || show.id !== showId) {
                return Promise.resolve({ outcome: 'rejected', reason: 'La serie non esiste più.' });
            }
            const confirmedAt = new Date().toISOString();
            const outcome = advanceProgress(show, targetEpisodeId, confirmedBy, confirmedAt, today);
            if (outcome.outcome === 'applied') {
                show = outcome.show;
                events = [...events, outcome.event];
                notify();
            }
            return Promise.resolve(outcome);
        },
        undoLastProgress: (): Promise<ProgressOutcome> => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
        removeShow(showId: string): Promise<RemoveShowOutcome> {
            if (show === undefined || show.id !== showId) {
                return Promise.resolve({ outcome: 'rejected', reason: 'La serie non esiste più.' });
            }
            show = undefined;
            events = [];
            notify();
            return Promise.resolve({ outcome: 'removed' });
        }
    };

    return { store, getShow: () => show };
}

function buildDeps(overrides: ShowDetailDeps = {}): ShowDetailDeps {
    return { resolveToday: () => TODAY, resolveActiveProfileId: () => FABIO, ...overrides };
}

const testRouter = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', name: 'home', component: { template: '<div />' } },
        { path: '/serie/:id', name: 'show-detail', component: { template: '<div />' } }
    ]
});

const mountedWrappers: Array<VueWrapper> = [];

function mountShowDetailView(deps: ShowDetailDeps): VueWrapper {
    const wrapper = mount(ShowDetailView, { props: { id: 'show-1', deps }, global: { plugins: [testRouter] } });
    mountedWrappers.push(wrapper);
    return wrapper;
}

const WATCH_DIALOG_INDEX = 0;
const UNDO_DIALOG_INDEX = 1;
const REMOVE_DIALOG_INDEX = 2;

function findRemoveDialog(wrapper: VueWrapper) {
    return wrapper.findAll('.confirm-dialog')[REMOVE_DIALOG_INDEX]!;
}

function findWatchDialog(wrapper: VueWrapper) {
    return wrapper.findAll('.confirm-dialog')[WATCH_DIALOG_INDEX]!;
}

function findUndoDialog(wrapper: VueWrapper) {
    return wrapper.findAll('.confirm-dialog')[UNDO_DIALOG_INDEX]!;
}

afterEach(() => {
    pushMock.mockReset();
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
});

describe('ShowDetailView — criterio 7, rimozione con conferma rossa', () => {
    it('la conferma di eliminazione è visivamente rossa', async () => {
        const { store } = buildFakeStore(buildShow());
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        await wrapper.find('.danger').trigger('click');

        expect(findRemoveDialog(wrapper).find('.accept-confirm--danger').exists()).toBe(true);
    });

    it('annullando la conferma la serie resta nella lista condivisa', async () => {
        const { store, getShow } = buildFakeStore(buildShow());
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        await wrapper.find('.danger').trigger('click');
        await findRemoveDialog(wrapper).find('.cancel-confirm').trigger('click');
        await flushPromises();

        expect(getShow()).toBeDefined();
        expect(pushMock).not.toHaveBeenCalled();
    });

    it('confermando l\'eliminazione la serie viene rimossa e la vista torna alla home', async () => {
        const { store, getShow } = buildFakeStore(buildShow());
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        await wrapper.find('.danger').trigger('click');
        await findRemoveDialog(wrapper).find('.accept-confirm').trigger('click');
        await flushPromises();

        expect(getShow()).toBeUndefined();
        expect(pushMock).toHaveBeenCalledWith({ name: 'home' });
    });
});

describe('ShowDetailView — visibilità di «Annulla ultima conferma»', () => {
    it('non compare finché non c\'è nulla da annullare, e appare dopo una conferma «Vista»', async () => {
        const { store } = buildFakeStore(buildShow());
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        expect(wrapper.find('.undo').exists()).toBe(false);

        await wrapper.find('.mini').trigger('click');
        await findWatchDialog(wrapper).find('.accept-confirm').trigger('click');
        await flushPromises();

        expect(wrapper.find('.undo').exists()).toBe(true);
    });
});

describe('ShowDetailView — conflitto di revisione sull\'undo', () => {
    it('mostra nel toast la reason del dominio, senza reinventare un messaggio', async () => {
        const conflictReason = 'La serie è stata aggiornata nel frattempo: ricarica lo stato prima di annullare.';
        const show = buildShow({ lastWatchedEpisodeId: 's1e1', lastViewedAt: '2026-01-15T00:00:00Z', progressRevision: 3 });
        const store: TrackedShowStore = {
            subscribeToTrackedShows: () => () => {},
            subscribeToShow: (showId, listener) => {
                listener(showId === show.id ? show : undefined);
                return () => {};
            },
            addShow: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            updateCatalog: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            changeProvider: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            advanceProgress: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            undoLastProgress: () => Promise.resolve({ outcome: 'rejected', reason: conflictReason }),
            removeShow: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' })
        };
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        await wrapper.find('.undo').trigger('click');
        await findUndoDialog(wrapper).find('.accept-confirm').trigger('click');
        await flushPromises();

        expect(wrapper.find('.toast').text()).toBe(conflictReason);
    });
});
