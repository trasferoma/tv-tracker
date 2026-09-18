// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import LocalModeBanner from './LocalModeBanner.vue';

describe('LocalModeBanner', () => {
    it('mostra l\'avviso di modalità locale quando la modalità locale è attiva', () => {
        const wrapper = mount(LocalModeBanner);

        expect(wrapper.text()).toBe('Modalità locale, dati non condivisi.');
    });

    it('non mostra nulla quando la modalità locale non è attiva', async () => {
        vi.resetModules();
        vi.doMock('@/localMode', () => ({ isLocalMode: false }));

        const { default: LocalModeBannerWithRemoteMode } = await import('./LocalModeBanner.vue');
        const wrapper = mount(LocalModeBannerWithRemoteMode);

        expect(wrapper.find('.local-mode-banner').exists()).toBe(false);

        vi.doUnmock('@/localMode');
        vi.resetModules();
    });
});
