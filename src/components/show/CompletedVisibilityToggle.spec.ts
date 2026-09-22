// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import CompletedVisibilityToggle from './CompletedVisibilityToggle.vue';

const mountedWrappers: Array<VueWrapper> = [];

function mountToggle(showCompleted: boolean): VueWrapper {
    const wrapper = mount(CompletedVisibilityToggle, { props: { showCompleted } });
    mountedWrappers.push(wrapper);
    return wrapper;
}

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
});

describe('CompletedVisibilityToggle', () => {
    it('mostra "Mostra completate" quando le completate sono nascoste', () => {
        const wrapper = mountToggle(false);

        expect(wrapper.find('.completed-toggle').text()).toBe('Mostra completate');
    });

    it('mostra "Nascondi completate" quando le completate sono visibili', () => {
        const wrapper = mountToggle(true);

        expect(wrapper.find('.completed-toggle').text()).toBe('Nascondi completate');
    });

    it('emette il valore invertito al click', async () => {
        const wrapper = mountToggle(false);

        await wrapper.find('.completed-toggle').trigger('click');

        expect(wrapper.emitted('change')).toEqual([[true]]);
    });
});
