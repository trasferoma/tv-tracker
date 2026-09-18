// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRouter, createWebHistory } from 'vue-router';

import type { Episode, Season, TrackedShow } from '@/domain/trackedShow';
import type {
    AddShowOutcome,
    TrackedShowListener,
    TrackedShowsListener,
    TrackedShowStore,
    Unsubscribe
} from '@/persistence/trackedShowStore';

const testRouter = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', name: 'home', component: { template: '<div />' } },
        { path: '/serie/:id', name: 'show-detail', component: { template: '<div />' } }
    ]
});

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
        seasons: [buildSeason(1, [buildEpisode(1, 1, 'Episodio 1', '2020-01-01')])],
        italianProviders: [],
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides
    };
}

function buildStubStore(initialShows: readonly TrackedShow[]): TrackedShowStore {
    const notImplemented = (): Promise<never> => Promise.reject(new Error('non usato in questo test'));
    return {
        subscribeToTrackedShows(listener: TrackedShowsListener): Unsubscribe {
            listener(initialShows);
            return () => {};
        },
        subscribeToShow(_id: string, listener: TrackedShowListener): Unsubscribe {
            listener(undefined);
            return () => {};
        },
        addShow: (): Promise<AddShowOutcome> => Promise.resolve({ outcome: 'added' }),
        updateCatalog: notImplemented,
        changeProvider: notImplemented,
        advanceProgress: notImplemented,
        undoLastProgress: notImplemented,
        removeShow: notImplemented
    };
}

vi.mock('@/persistence/currentTrackedShowStore', () => ({ currentTrackedShowStore: buildStubStore([]) }));

const mountedWrappers: Array<VueWrapper> = [];

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
    vi.resetModules();
});

describe('HomeView — stato vuoto', () => {
    it('mostra lo stato vuoto e il comando per caricare dati di esempio quando non ci sono serie', async () => {
        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.text()).toContain('Nessuna serie ancora');
        expect(wrapper.find('.load-sample').exists()).toBe(true);
        expect(wrapper.findAll('.show')).toHaveLength(0);
    });
});

describe('HomeView — pulsante Aggiorna del sommario', () => {
    it('richiede lo stesso avviso condiviso usato dal pulsante dell\'intestazione', async () => {
        const { default: HomeView } = await import('./HomeView.vue');
        const { refreshNotice } = await import('@/composables/useRefreshNotice');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        await wrapper.find('.refresh').trigger('click');

        expect(refreshNotice.message.value).toBe('Aggiornamento dalla rete non ancora disponibile.');
    });
});

describe('HomeView — elenco delle serie', () => {
    it('mostra una card per ogni serie seguita quando la lista non è vuota', async () => {
        vi.resetModules();
        vi.doMock('@/persistence/currentTrackedShowStore', () => ({
            currentTrackedShowStore: buildStubStore([buildShow()])
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.findAll('.show')).toHaveLength(1);
        expect(wrapper.text()).toContain('Serie di prova');
        expect(wrapper.find('.empty-state').exists()).toBe(false);

        vi.doUnmock('@/persistence/currentTrackedShowStore');
    });
});
