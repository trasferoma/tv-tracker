// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import ShowScopeToggle from './ShowScopeToggle.vue';
import type { ShowScope } from '@/domain/showVisibility';

const mountedWrappers: Array<VueWrapper> = [];

function mountToggle(scope: ShowScope): VueWrapper {
    const wrapper = mount(ShowScopeToggle, { props: { scope } });
    mountedWrappers.push(wrapper);
    return wrapper;
}

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
});

describe('ShowScopeToggle', () => {
    it('mostra le etichette «Tutto» e «Solo le mie»', () => {
        const wrapper = mountToggle('all');

        const labels = wrapper.findAll('.scope-option').map((button) => button.text());
        expect(labels).toEqual(['Tutto', 'Solo le mie']);
    });

    it('dichiara «Tutto» come stato corrente agli assistivi quando la lente vale «all»', () => {
        const wrapper = mountToggle('all');

        const buttons = wrapper.findAll('.scope-option');
        expect(buttons[0]?.attributes('aria-pressed')).toBe('true');
        expect(buttons[1]?.attributes('aria-pressed')).toBe('false');
    });

    it('dichiara «Solo le mie» come stato corrente agli assistivi quando la lente vale «mine»', () => {
        const wrapper = mountToggle('mine');

        const buttons = wrapper.findAll('.scope-option');
        expect(buttons[0]?.attributes('aria-pressed')).toBe('false');
        expect(buttons[1]?.attributes('aria-pressed')).toBe('true');
    });

    it('emette "all" quando si preme «Tutto»', async () => {
        const wrapper = mountToggle('mine');

        await wrapper.findAll('.scope-option')[0]?.trigger('click');

        expect(wrapper.emitted('change')).toEqual([['all']]);
    });

    it('emette "mine" quando si preme «Solo le mie»', async () => {
        const wrapper = mountToggle('all');

        await wrapper.findAll('.scope-option')[1]?.trigger('click');

        expect(wrapper.emitted('change')).toEqual([['mine']]);
    });
});
