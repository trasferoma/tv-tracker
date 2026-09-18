// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { createRouter, createWebHistory } from 'vue-router';

import App from './App.vue';
import { refreshNotice } from '@/composables/useRefreshNotice';

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

        expect(wrapper.text()).toContain('Aggiornamento dalla rete non ancora disponibile.');
    });
});
