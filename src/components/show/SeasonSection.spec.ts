// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import SeasonSection from './SeasonSection.vue';
import type { EpisodeRowView, SeasonSectionView } from '@/composables/useShowDetail';

function buildEpisodeRow(overrides: Partial<EpisodeRowView> = {}): EpisodeRowView {
    return {
        id: 's1e1',
        headline: 'S01 E01 · Episodio 1',
        dateLabel: 'Data catalogo: 1 gennaio 2026',
        canMarkWatched: true,
        ...overrides
    };
}

function buildSeason(overrides: Partial<SeasonSectionView> = {}): SeasonSectionView {
    return {
        seasonNumber: 1,
        remainingCount: 1,
        defaultOpen: true,
        episodes: [buildEpisodeRow()],
        upcoming: undefined,
        ...overrides
    };
}

const mountedWrappers: Array<VueWrapper> = [];

function mountSeasonSection(season: SeasonSectionView): VueWrapper {
    const wrapper = mount(SeasonSection, { props: { season } });
    mountedWrappers.push(wrapper);
    return wrapper;
}

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
});

describe('SeasonSection', () => {
    it('mostra il numero di stagione e il conteggio delle puntate da vedere', () => {
        const wrapper = mountSeasonSection(buildSeason({ seasonNumber: 2, remainingCount: 3 }));

        expect(wrapper.find('summary').text()).toBe('Stagione 2 · 3 da vedere');
    });

    it('emette watch con l\'id dell\'episodio quando si preme «Vista»', async () => {
        const wrapper = mountSeasonSection(buildSeason({ episodes: [buildEpisodeRow({ id: 's1e5' })] }));

        await wrapper.find('.mini').trigger('click');

        expect(wrapper.emitted('watch')).toEqual([['s1e5']]);
    });

    it('non offre «Vista» su un episodio futuro non marcabile', () => {
        const wrapper = mountSeasonSection(buildSeason({
            episodes: [buildEpisodeRow({ canMarkWatched: false, dateLabel: 'Non ancora uscita' })]
        }));

        expect(wrapper.find('.mini').exists()).toBe(false);
        expect(wrapper.find('.episode-row small').text()).toBe('Non ancora uscita');
    });

    it('mostra il riquadro della prossima puntata in arrivo senza azione «Vista»', () => {
        const wrapper = mountSeasonSection(buildSeason({
            episodes: [],
            upcoming: { headline: 'S01 E02 · Episodio 2', dateLabel: '8 gennaio 2026' }
        }));

        expect(wrapper.find('.upcoming-label').text()).toBe('Prossima puntata in arrivo');
        expect(wrapper.text()).toContain('S01 E02 · Episodio 2');
        expect(wrapper.find('.mini').exists()).toBe(false);
    });

    it('riflette il flag defaultOpen sull\'attributo open del dettaglio', () => {
        const closedWrapper = mountSeasonSection(buildSeason({ defaultOpen: false }));

        expect(closedWrapper.find('details').attributes('open')).toBeUndefined();
    });
});
