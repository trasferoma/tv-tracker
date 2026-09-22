// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRouter, createWebHistory } from 'vue-router';

import App from './App.vue';
import { refreshNotice } from '@/composables/useRefreshNotice';
import type {
    AddShowOutcome,
    TrackedShowListener,
    TrackedShowsListener,
    TrackedShowStore
} from '@/persistence/trackedShowStore';

function buildEmptyStore(): TrackedShowStore {
    const notImplemented = (): Promise<never> => Promise.reject(new Error('non usato in questo test'));
    return {
        subscribeToTrackedShows: (listener: TrackedShowsListener) => {
            listener([]);
            return () => {};
        },
        subscribeToShow: (_id: string, listener: TrackedShowListener) => {
            listener(undefined);
            return () => {};
        },
        addShow: (): Promise<AddShowOutcome> => Promise.resolve({ outcome: 'added' }),
        updateCatalog: notImplemented,
        changeProvider: notImplemented,
        changeVisibility: notImplemented,
        changeListing: notImplemented,
        advanceProgress: notImplemented,
        undoLastProgress: notImplemented,
        resetProgress: notImplemented,
        removeShow: notImplemented,
        listAllProgressEvents: notImplemented,
        replaceAllShows: notImplemented
    };
}

vi.mock('@/persistence/currentTrackedShowStore', () => ({ currentTrackedShowStore: buildEmptyStore() }));

const testRouter = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/', name: 'home', component: { template: '<div />' } }]
});

const mountedWrappers: Array<VueWrapper> = [];

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
    refreshNotice.dismiss();
});

describe('App — pulsante Aggiorna dell\'intestazione', () => {
    it('mostra l\'avviso di aggiornamento non disponibile quando viene premuto', async () => {
        await testRouter.push('/');
        await testRouter.isReady();
        const wrapper = mount(App, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);

        await wrapper.find('[aria-label="Aggiorna"]').trigger('click');
        await flushPromises();

        expect(wrapper.text()).toContain('Nessuna serie da aggiornare.');
    });
});
