// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { createRouter, createWebHistory } from 'vue-router';

import ShowCard from './ShowCard.vue';
import type { ShowListItem } from '@/composables/useTrackedShows';

const testRouter = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', name: 'home', component: { template: '<div />' } },
        { path: '/serie/:id', name: 'show-detail', component: { template: '<div />' } }
    ]
});

function buildItem(overrides: Partial<ShowListItem> = {}): ShowListItem {
    return {
        id: 'show-1',
        title: 'Scissione',
        posterUrl: 'https://poster.example/stagione-2.jpg',
        providerLabel: 'Apple TV+ · Italia',
        badgeLabel: '2 nuove',
        isCaughtUp: false,
        episodeHeadline: 'S02 E07 · Chikhai Bardo',
        episodeDateLabel: 'Data catalogo: 28 febbraio 2026',
        upcomingLabel: 'Prossima puntata: S02 E09 · 20 settembre 2026',
        canConfirmWatched: true,
        firstUnwatchedEpisodeId: 'episode-s02e07',
        errorMessage: undefined,
        privateProfileId: undefined,
        ...overrides
    };
}

const mountedWrappers: Array<VueWrapper> = [];

function mountShowCard(item: ShowListItem): VueWrapper {
    const wrapper = mount(ShowCard, { props: { item }, global: { plugins: [testRouter] } });
    mountedWrappers.push(wrapper);
    return wrapper;
}

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
});

describe('ShowCard', () => {
    it('mostra titolo, badge, piattaforma, puntata da vedere e prossima puntata', () => {
        const wrapper = mountShowCard(buildItem());

        expect(wrapper.find('.title').text()).toBe('Scissione');
        expect(wrapper.text()).toContain('2 nuove');
        expect(wrapper.text()).toContain('Apple TV+ · Italia');
        expect(wrapper.find('.episode strong').text()).toBe('S02 E07 · Chikhai Bardo');
        expect(wrapper.find('.episode small').text()).toBe('Data catalogo: 28 febbraio 2026');
        expect(wrapper.find('.future').text()).toBe('Prossima puntata: S02 E09 · 20 settembre 2026');
    });

    it('emette watch con l\'id della serie quando si preme «Vista»', async () => {
        const wrapper = mountShowCard(buildItem());

        await wrapper.find('.primary').trigger('click');

        expect(wrapper.emitted('watch')).toEqual([['show-1']]);
    });

    it('non mostra il pulsante «Vista» quando la serie è in pari', () => {
        const wrapper = mountShowCard(buildItem({ canConfirmWatched: false, isCaughtUp: true, badgeLabel: 'In pari' }));

        expect(wrapper.find('.primary').exists()).toBe(false);
    });

    it('collega il pulsante «Dettaglio» alla rotta della serie', () => {
        const wrapper = mountShowCard(buildItem());

        const detailLink = wrapper.find('.secondary');
        expect(detailLink.attributes('href')).toBe('/serie/show-1');
    });

    it('mostra il messaggio di degrado al posto della puntata quando la riga è disallineata', () => {
        const wrapper = mountShowCard(buildItem({
            canConfirmWatched: false,
            isCaughtUp: false,
            badgeLabel: 'Dati non allineati',
            errorMessage: 'Dati non allineati: aggiorna il catalogo di questa serie per correggerla.'
        }));

        expect(wrapper.find('.show-error').text()).toBe('Dati non allineati: aggiorna il catalogo di questa serie per correggerla.');
        expect(wrapper.find('.episode').exists()).toBe(false);
        expect(wrapper.find('.primary').exists()).toBe(false);
    });

    it('non mostra il badge nello stile «In pari» quando la riga è disallineata', () => {
        const wrapper = mountShowCard(buildItem({
            canConfirmWatched: false,
            isCaughtUp: false,
            badgeLabel: 'Dati non allineati',
            errorMessage: 'Dati non allineati: aggiorna il catalogo di questa serie per correggerla.'
        }));

        expect(wrapper.text()).toContain('Dati non allineati');
        expect(wrapper.find('.show-badge--clear').exists()).toBe(false);
    });

    it('non mostra la fascia della prossima puntata quando non è nota', () => {
        const wrapper = mountShowCard(buildItem({ upcomingLabel: undefined }));

        expect(wrapper.find('.show-foot').exists()).toBe(false);
    });

    it('mostra il puntino nel colore del profilo sulle serie private', () => {
        const wrapper = mountShowCard(buildItem({ privateProfileId: 'fabio' }));

        const dot = wrapper.find('.private-dot');
        expect(dot.exists()).toBe(true);
        expect(dot.classes()).toContain('private-dot--fabio');
        expect(dot.attributes('aria-label')).toBe('Solo per te');
    });

    it('non mostra alcun puntino sulle serie condivise', () => {
        const wrapper = mountShowCard(buildItem({ privateProfileId: undefined }));

        expect(wrapper.find('.private-dot').exists()).toBe(false);
    });
});
