// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import CompletedVisibilityToggle from './CompletedVisibilityToggle.vue';

const mountedWrappers: Array<VueWrapper> = [];

function mountToggle(showCompleted: boolean, completedCount: number): VueWrapper {
    const wrapper = mount(CompletedVisibilityToggle, { props: { showCompleted, completedCount } });
    mountedWrappers.push(wrapper);
    return wrapper;
}

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
});

describe('CompletedVisibilityToggle', () => {
    it('mostra "Mostra completate (N)" quando le completate sono nascoste', () => {
        const wrapper = mountToggle(false, 3);

        expect(wrapper.find('.completed-toggle').text()).toBe('Mostra completate (3)');
    });

    it('mostra "Nascondi completate (N)" quando le completate sono visibili', () => {
        const wrapper = mountToggle(true, 3);

        expect(wrapper.find('.completed-toggle').text()).toBe('Nascondi completate (3)');
    });

    it('emette il valore invertito al click', async () => {
        const wrapper = mountToggle(false, 2);

        await wrapper.find('.completed-toggle').trigger('click');

        expect(wrapper.emitted('change')).toEqual([[true]]);
    });
});
