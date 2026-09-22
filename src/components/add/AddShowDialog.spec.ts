// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AddShowDialog from './AddShowDialog.vue';
import type { AddShowDeps } from '@/composables/useAddShow';
import type { CatalogSearchResult, CatalogShow, CatalogSource } from '@/catalog/catalogSource';
import type { Episode, Season, TrackedShow } from '@/domain/trackedShow';
import type { AddShowOutcome, TrackedShowStore } from '@/persistence/trackedShowStore';

function buildEpisode(seasonNumber: number, episodeNumber: number, title: string, airDate: string): Episode {
    return { providerEpisodeId: `s${seasonNumber}e${episodeNumber}`, seasonNumber, episodeNumber, title, airDate };
}

function buildSeason(seasonNumber: number, episodes: readonly Episode[]): Season {
    return { providerSeasonId: `season-${seasonNumber}`, seasonNumber, episodes };
}

function buildCatalogShow(overrides: Partial<CatalogShow> = {}): CatalogShow {
    return {
        catalogProvider: 'tmdb',
        providerShowId: 'provider-1',
        title: 'Scissione',
        seriesPosterUrl: 'https://poster.example/serie.jpg',
        status: 'In corso',
        seasons: [buildSeason(1, [buildEpisode(1, 1, 'Buone notizie sull\'inferno', '2022-01-01')])],
        ...overrides
    };
}

function buildSearchResult(overrides: Partial<CatalogSearchResult> = {}): CatalogSearchResult {
    return {
        catalogProvider: 'tmdb',
        providerShowId: 'provider-1',
        title: 'Scissione',
        originalTitle: 'Severance',
        year: 2022,
        posterUrl: 'https://poster.example/serie.jpg',
        ...overrides
    };
}

function buildCatalogSource(overrides: Partial<CatalogSource> = {}): CatalogSource {
    return {
        searchShows: () => Promise.resolve({ outcome: 'found', results: [buildSearchResult()] }),
        loadShow: () => Promise.resolve({ outcome: 'found', show: buildCatalogShow() }),
        loadItalianProviders: () => Promise.resolve({ outcome: 'loaded', providers: [] }),
        ...overrides
    };
}

function buildStore(overrides: Partial<TrackedShowStore> = {}): TrackedShowStore {
    const notImplemented = (): Promise<never> => Promise.reject(new Error('non usato in questo test'));
    return {
        subscribeToTrackedShows: () => () => {},
        subscribeToShow: () => () => {},
        addShow: () => Promise.resolve({ outcome: 'added' }),
        updateCatalog: notImplemented,
        changeProvider: notImplemented,
        changeVisibility: notImplemented,
        changeListing: notImplemented,
        advanceProgress: notImplemented,
        undoLastProgress: notImplemented,
        resetProgress: notImplemented,
        removeShow: notImplemented,
        listAllProgressEvents: notImplemented,
        replaceAllShows: notImplemented,
        ...overrides
    };
}

function buildDeps(overrides: AddShowDeps = {}): AddShowDeps {
    return {
        debounceMs: 5,
        resolveNow: () => '2026-01-01T00:00:00.000Z',
        catalogSource: buildCatalogSource(),
        store: buildStore(),
        ...overrides
    };
}

function waitLongerThanDebounce(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 40));
}

const mountedWrappers: Array<VueWrapper> = [];

function mountDialog(deps: AddShowDeps, open = true): VueWrapper {
    const wrapper = mount(AddShowDialog, { attachTo: document.body, props: { open, deps } });
    mountedWrappers.push(wrapper);
    return wrapper;
}

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
    document.body.innerHTML = '';
});

describe('AddShowDialog — criterio 1, niente aggiunta come testo libero', () => {
    it('digitare un titolo e premere Invio non aggiunge nulla: serve scegliere un risultato', async () => {
        const addShowSpy = vi.fn<(show: TrackedShow) => Promise<AddShowOutcome>>().mockResolvedValue({ outcome: 'added' });
        const store = buildStore({ addShow: addShowSpy });
        const wrapper = mountDialog(buildDeps({ store }));

        await wrapper.find('.search').setValue('scissione');
        await wrapper.find('.search').trigger('keydown', { key: 'Enter' });
        await waitLongerThanDebounce();

        expect(addShowSpy).not.toHaveBeenCalled();
        expect(wrapper.find('.chosen-show').exists()).toBe(false);
    });

    it('scegliendo un risultato si passa al passo successivo', async () => {
        const wrapper = mountDialog(buildDeps());

        await wrapper.find('.search').setValue('scissione');
        await waitLongerThanDebounce();
        await nextTick();

        await wrapper.find('.result').trigger('click');
        await waitLongerThanDebounce();
        await nextTick();

        expect(wrapper.find('.chosen-show').exists()).toBe(true);
        expect(wrapper.text()).toContain('Scissione');
    });
});

describe('AddShowDialog — flusso completo di aggiunta', () => {
    it('completa ricerca, piattaforma e posizione ed emette added', async () => {
        const addShowSpy = vi.fn<(show: TrackedShow) => Promise<AddShowOutcome>>().mockResolvedValue({ outcome: 'added' });
        const store = buildStore({ addShow: addShowSpy });
        const wrapper = mountDialog(buildDeps({ store }));

        await wrapper.find('.search').setValue('scissione');
        await waitLongerThanDebounce();
        await nextTick();
        await wrapper.find('.result').trigger('click');
        await waitLongerThanDebounce();
        await nextTick();

        await wrapper.find('.provider-step .primary').trigger('click');
        await nextTick();

        await wrapper.find('.primary').trigger('click');
        await flushDialogSave();

        expect(addShowSpy).toHaveBeenCalledOnce();
        expect(wrapper.emitted('added')).toEqual([['Scissione']]);
        expect(wrapper.emitted('close')).toHaveLength(1);
    });
});

describe('AddShowDialog — duplicato bloccato', () => {
    it('mostra il messaggio di duplicato e non chiude il dialogo', async () => {
        const rejectedReason = 'Questa serie è già stata aggiunta.';
        const store = buildStore({ addShow: () => Promise.resolve({ outcome: 'rejected', reason: rejectedReason }) });
        const wrapper = mountDialog(buildDeps({ store }));

        await wrapper.find('.search').setValue('scissione');
        await waitLongerThanDebounce();
        await nextTick();
        await wrapper.find('.result').trigger('click');
        await waitLongerThanDebounce();
        await nextTick();

        await wrapper.find('.provider-step .primary').trigger('click');
        await nextTick();
        await wrapper.find('.primary').trigger('click');
        await flushDialogSave();

        expect(wrapper.text()).toContain(rejectedReason);
        expect(wrapper.emitted('close')).toBeUndefined();
        expect(wrapper.emitted('added')).toBeUndefined();
    });
});

describe('AddShowDialog — duplicato riconosciuto subito dopo la scelta del risultato', () => {
    it('mostra il messaggio di duplicato senza mostrare il caricamento dei dettagli', async () => {
        const loadShowSpy = vi.fn(() => Promise.resolve({ outcome: 'found' as const, show: buildCatalogShow() }));
        const catalogSource = buildCatalogSource({ loadShow: loadShowSpy });
        const deps = buildDeps({ catalogSource, trackedProviderShowIds: { value: new Set(['provider-1']) } });
        const wrapper = mountDialog(deps);

        await wrapper.find('.search').setValue('scissione');
        await waitLongerThanDebounce();
        await nextTick();
        await wrapper.find('.result').trigger('click');
        await nextTick();

        expect(loadShowSpy).not.toHaveBeenCalled();
        expect(wrapper.find('.loading').exists()).toBe(false);
        expect(wrapper.text()).toContain('Questa serie è già stata aggiunta.');
    });
});

describe('AddShowDialog — esiti distinti della ricerca', () => {
    it('«nessun risultato» e «rete non disponibile» mostrano testi diversi', async () => {
        const catalogSource = buildCatalogSource({ searchShows: () => Promise.resolve({ outcome: 'found', results: [] }) });
        const wrapper = mountDialog(buildDeps({ catalogSource }));

        await wrapper.find('.search').setValue('introvabile');
        await waitLongerThanDebounce();
        await nextTick();

        expect(wrapper.find('.empty').text()).toBe('Nessun risultato.');

        const unavailableReason = 'Impossibile contattare TMDB: verifica la connessione di rete.';
        const unavailableCatalogSource = buildCatalogSource({
            searchShows: () => Promise.resolve({ outcome: 'unavailable', reason: unavailableReason })
        });
        const secondWrapper = mountDialog(buildDeps({ catalogSource: unavailableCatalogSource }));

        await secondWrapper.find('.search').setValue('scissione');
        await waitLongerThanDebounce();
        await nextTick();

        expect(secondWrapper.find('.empty').text()).toBe(unavailableReason);
        expect(secondWrapper.find('.empty').text()).not.toBe(wrapper.find('.empty').text());
    });
});

describe('AddShowDialog — posizione iniziale limitata agli episodi già usciti', () => {
    it('con una sola stagione futura propone solo «Da iniziare»', async () => {
        const catalogShow = buildCatalogShow({
            seasons: [buildSeason(4, [
                buildEpisode(4, 1, 'Episodio futuro 1', '2099-01-01'),
                buildEpisode(4, 2, 'Episodio futuro 2', '2099-01-08')
            ])]
        });
        const catalogSource = buildCatalogSource({ loadShow: () => Promise.resolve({ outcome: 'found', show: catalogShow }) });
        const wrapper = mountDialog(buildDeps({ catalogSource, resolveToday: () => '2026-01-01' }));

        await wrapper.find('.search').setValue('scissione');
        await waitLongerThanDebounce();
        await nextTick();
        await wrapper.find('.result').trigger('click');
        await waitLongerThanDebounce();
        await nextTick();
        await wrapper.find('.provider-step .primary').trigger('click');
        await nextTick();

        const positionChoices = wrapper.findAll('.position-choice');
        expect(positionChoices).toHaveLength(1);
        expect(positionChoices[0]?.text()).toBe('Da iniziare');
    });
});

describe('AddShowDialog — visibilità della serie all\'inserimento', () => {
    it('di default la scelta è «Per tutti»', async () => {
        const wrapper = mountDialog(buildDeps());

        await wrapper.find('.search').setValue('scissione');
        await waitLongerThanDebounce();
        await nextTick();
        await wrapper.find('.result').trigger('click');
        await waitLongerThanDebounce();
        await nextTick();
        await wrapper.find('.provider-step .primary').trigger('click');
        await nextTick();

        const buttons = wrapper.findAll('.visibility-choice');
        expect(buttons[0]?.attributes('aria-pressed')).toBe('true');
        expect(buttons[1]?.attributes('aria-pressed')).toBe('false');
    });

    it('scegliendo «Solo per me» la serie viene salvata privata del profilo attivo', async () => {
        const addShowSpy = vi.fn<(show: TrackedShow) => Promise<AddShowOutcome>>().mockResolvedValue({ outcome: 'added' });
        const store = buildStore({ addShow: addShowSpy });
        const wrapper = mountDialog(buildDeps({ store, resolveActiveProfileId: () => 'irene' }));

        await wrapper.find('.search').setValue('scissione');
        await waitLongerThanDebounce();
        await nextTick();
        await wrapper.find('.result').trigger('click');
        await waitLongerThanDebounce();
        await nextTick();
        await wrapper.find('.provider-step .primary').trigger('click');
        await nextTick();

        await wrapper.findAll('.visibility-choice')[1]?.trigger('click');
        await wrapper.find('.primary').trigger('click');
        await flushDialogSave();

        const savedShow = addShowSpy.mock.calls[0]?.[0];
        expect(savedShow?.visibility).toBe('private');
        expect(savedShow?.privateFor).toBe('irene');
    });
});

describe('AddShowDialog — utilizzabilità da tastiera', () => {
    it('sposta il focus nel dialogo quando si apre', async () => {
        const wrapper = mountDialog(buildDeps(), false);
        await wrapper.setProps({ open: true });
        await nextTick();

        expect(document.activeElement).toBe(wrapper.find('dialog').element);
    });

    it('Escape emette close', async () => {
        const wrapper = mountDialog(buildDeps());

        await wrapper.find('dialog').trigger('keydown', { key: 'Escape' });

        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('restituisce il focus al pulsante che ha aperto il dialogo', async () => {
        const triggerButton = document.createElement('button');
        document.body.appendChild(triggerButton);
        triggerButton.focus();

        const wrapper = mountDialog(buildDeps(), false);
        await wrapper.setProps({ open: true });
        await nextTick();
        expect(document.activeElement).toBe(wrapper.find('dialog').element);

        await wrapper.setProps({ open: false });

        expect(document.activeElement).toBe(triggerButton);
    });
});

async function flushDialogSave(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
}
