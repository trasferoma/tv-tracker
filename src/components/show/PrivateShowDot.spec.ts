// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import PrivateShowDot from './PrivateShowDot.vue';

const mountedWrappers: Array<VueWrapper> = [];

function mountDot(profileId: string): VueWrapper {
    const wrapper = mount(PrivateShowDot, { props: { profileId } });
    mountedWrappers.push(wrapper);
    return wrapper;
}

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
});

describe('PrivateShowDot', () => {
    it('dichiara il testo alternativo «Solo per te»', () => {
        const wrapper = mountDot('fabio');

        expect(wrapper.find('.private-dot').attributes('aria-label')).toBe('Solo per te');
    });

    it('porta il colore del profilo di Fabio', () => {
        const wrapper = mountDot('fabio');

        expect(wrapper.find('.private-dot').classes()).toContain('private-dot--fabio');
    });

    it('porta il colore del profilo di Irene', () => {
        const wrapper = mountDot('irene');

        expect(wrapper.find('.private-dot').classes()).toContain('private-dot--irene');
    });
});
