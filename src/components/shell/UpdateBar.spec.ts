// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import UpdateBar from './UpdateBar.vue';
import type { UsePwaUpdate } from '@/composables/usePwaUpdate';

const dismissMock = vi.fn();
const applyUpdateMock = vi.fn(() => Promise.resolve());
const updateAvailable = ref(false);

vi.mock('@/composables/usePwaUpdate', () => ({
    usePwaUpdate: (): UsePwaUpdate => ({
        updateAvailable,
        applyUpdate: applyUpdateMock,
        dismiss: dismissMock
    })
}));

const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
    updateAvailable.value = false;
    dismissMock.mockClear();
    applyUpdateMock.mockClear();
});

function mountUpdateBar(): VueWrapper {
    const wrapper = mount(UpdateBar);
    mountedWrappers.push(wrapper);
    return wrapper;
}

describe('UpdateBar', () => {
    it('non mostra nulla quando non c\'è un aggiornamento disponibile', () => {
        const wrapper = mountUpdateBar();

        expect(wrapper.find('.update-bar').exists()).toBe(false);
    });

    it('mostra l\'avviso quando un aggiornamento è disponibile', () => {
        updateAvailable.value = true;

        const wrapper = mountUpdateBar();

        expect(wrapper.text()).toContain('Nuova versione disponibile.');
    });

    it('si può ignorare senza applicare l\'aggiornamento', async () => {
        updateAvailable.value = true;
        const wrapper = mountUpdateBar();

        await wrapper.find('.dismiss-btn').trigger('click');

        expect(dismissMock).toHaveBeenCalledTimes(1);
        expect(applyUpdateMock).not.toHaveBeenCalled();
    });

    it('applica l\'aggiornamento quando si preme Aggiorna', async () => {
        updateAvailable.value = true;
        const wrapper = mountUpdateBar();

        await wrapper.find('.update-btn').trigger('click');

        expect(applyUpdateMock).toHaveBeenCalledTimes(1);
    });
});
