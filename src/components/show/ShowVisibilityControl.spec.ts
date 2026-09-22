// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import ShowVisibilityControl from './ShowVisibilityControl.vue';
import type { ShowAudience } from '@/domain/showVisibility';

const mountedWrappers: Array<VueWrapper> = [];

function mountControl(kind: ShowAudience['kind']): VueWrapper {
    const wrapper = mount(ShowVisibilityControl, { props: { kind } });
    mountedWrappers.push(wrapper);
    return wrapper;
}

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
});

describe('ShowVisibilityControl', () => {
    it('mostra l\'intestazione e le etichette «Per tutti» e «Solo per me»', () => {
        const wrapper = mountControl('shared');

        expect(wrapper.find('.visibility-heading').text()).toBe('Chi vede questa serie');
        const labels = wrapper.findAll('.visibility-choice').map((button) => button.text());
        expect(labels).toEqual(['Per tutti', 'Solo per me']);
    });

    it('dichiara «Per tutti» come stato corrente agli assistivi quando la serie è condivisa', () => {
        const wrapper = mountControl('shared');

        const buttons = wrapper.findAll('.visibility-choice');
        expect(buttons[0]?.attributes('aria-pressed')).toBe('true');
        expect(buttons[1]?.attributes('aria-pressed')).toBe('false');
    });

    it('dichiara «Solo per me» come stato corrente agli assistivi quando la serie è privata', () => {
        const wrapper = mountControl('private');

        const buttons = wrapper.findAll('.visibility-choice');
        expect(buttons[0]?.attributes('aria-pressed')).toBe('false');
        expect(buttons[1]?.attributes('aria-pressed')).toBe('true');
    });

    it('emette "private" quando si preme «Solo per me»', async () => {
        const wrapper = mountControl('shared');

        await wrapper.findAll('.visibility-choice')[1]?.trigger('click');

        expect(wrapper.emitted('change')).toEqual([['private']]);
    });

    it('emette "shared" quando si preme «Per tutti»', async () => {
        const wrapper = mountControl('private');

        await wrapper.findAll('.visibility-choice')[0]?.trigger('click');

        expect(wrapper.emitted('change')).toEqual([['shared']]);
    });
});
