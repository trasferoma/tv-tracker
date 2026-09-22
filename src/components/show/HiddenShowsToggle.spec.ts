// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import HiddenShowsToggle from './HiddenShowsToggle.vue';

const mountedWrappers: Array<VueWrapper> = [];

function mountToggle(showHidden: boolean): VueWrapper {
    const wrapper = mount(HiddenShowsToggle, { props: { showHidden } });
    mountedWrappers.push(wrapper);
    return wrapper;
}

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
});

describe('HiddenShowsToggle', () => {
    it('mostra "Mostra nascoste" quando le nascoste sono nascoste', () => {
        const wrapper = mountToggle(false);

        expect(wrapper.find('.hidden-toggle').text()).toBe('Mostra nascoste');
    });

    it('mostra "Nascondi di nuovo" quando le nascoste sono visibili', () => {
        const wrapper = mountToggle(true);

        expect(wrapper.find('.hidden-toggle').text()).toBe('Nascondi di nuovo');
    });

    it('emette il valore invertito al click', async () => {
        const wrapper = mountToggle(false);

        await wrapper.find('.hidden-toggle').trigger('click');

        expect(wrapper.emitted('change')).toEqual([[true]]);
    });
});
