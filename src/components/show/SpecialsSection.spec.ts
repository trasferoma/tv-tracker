// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import SpecialsSection from './SpecialsSection.vue';
import type { EpisodeRowView } from '@/composables/useShowDetail';

function buildEpisodeRow(overrides: Partial<EpisodeRowView> = {}): EpisodeRowView {
    return {
        id: 's0e1',
        headline: 'S00 E01 · Dietro le quinte',
        dateLabel: 'Data catalogo: 5 gennaio 2026',
        canMarkWatched: false,
        ...overrides
    };
}

const mountedWrappers: Array<VueWrapper> = [];

function mountSpecialsSection(episodes: readonly EpisodeRowView[]): VueWrapper {
    const wrapper = mount(SpecialsSection, { props: { episodes } });
    mountedWrappers.push(wrapper);
    return wrapper;
}

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
});

describe('SpecialsSection', () => {
    it('non è visualizzata quando non ci sono speciali', () => {
        const wrapper = mountSpecialsSection([]);

        expect(wrapper.find('details').exists()).toBe(false);
    });

    it('elenca gli speciali senza offrire mai l\'azione «Vista»', () => {
        const wrapper = mountSpecialsSection([buildEpisodeRow(), buildEpisodeRow({ id: 's0e2', headline: 'S00 E02 · Backstage' })]);

        expect(wrapper.find('summary').text()).toBe('Speciali · 2');
        expect(wrapper.findAll('.episode-row')).toHaveLength(2);
        expect(wrapper.find('button').exists()).toBe(false);
    });
});
