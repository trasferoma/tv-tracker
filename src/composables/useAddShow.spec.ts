// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAddShow, type AddShowDeps, type SearchResultItem, type UseAddShow } from './useAddShow';
import type { CatalogSearchResult, CatalogShow, CatalogSource } from '@/catalog/catalogSource';
import { sampleCatalogSource } from '@/catalog/sampleCatalogSource';
import type { Episode, ItalianProvider, Season, TrackedShow } from '@/domain/trackedShow';
import { calculateWatchPosition } from '@/domain/watchPosition';
import { localTrackedShowStore } from '@/persistence/localTrackedShowStore';
import type { AddShowOutcome, TrackedShowStore } from '@/persistence/trackedShowStore';
import { tvTrackerDatabase } from '@/persistence/tvTrackerDatabase';

const NOW = '2026-01-01T00:00:00.000Z';

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
        seasons: [buildSeason(1, [
            buildEpisode(1, 1, 'Buone notizie sull\'inferno', '2022-01-01'),
            buildEpisode(1, 2, 'Mezzo giro', '2022-01-08')
        ])],
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

function buildSearchResultItem(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
    return {
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
        advanceProgress: notImplemented,
        undoLastProgress: notImplemented,
        removeShow: notImplemented,
        listAllProgressEvents: notImplemented,
        replaceAllShows: notImplemented,
        ...overrides
    };
}

function buildDeps(overrides: AddShowDeps = {}): AddShowDeps {
    return { debounceMs: 5, resolveNow: () => NOW, catalogSource: buildCatalogSource(), store: buildStore(), ...overrides };
}

function waitLongerThanDebounce(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 40));
}

const mountedWrappers: Array<VueWrapper> = [];

function mountAddShow(deps: AddShowDeps): { wrapper: VueWrapper; controller: UseAddShow } {
    let controller!: UseAddShow;
    const TestHost = defineComponent({
        setup() {
            controller = useAddShow(deps);
            return () => h('div');
        }
    });
    const wrapper = mount(TestHost);
    mountedWrappers.push(wrapper);
    return { wrapper, controller };
}

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
});

describe('useAddShow — criterio 1, niente aggiunta come testo libero', () => {
    it('digitare un titolo non seleziona alcuna serie: serve scegliere un risultato', async () => {
        const { controller } = mountAddShow(buildDeps());

        controller.setQuery('scissione');
        await waitLongerThanDebounce();

        expect(controller.step.value).toBe('search');
        expect(controller.selectedShow.value).toBeUndefined();
    });

    it('i risultati portano titolo italiano, titolo originale e anno per disambiguare', async () => {
        const searchResult = buildSearchResult({ title: 'Scissione', originalTitle: 'Severance', year: 2022 });
        const catalogSource = buildCatalogSource({ searchShows: () => Promise.resolve({ outcome: 'found', results: [searchResult] }) });
        const { controller } = mountAddShow(buildDeps({ catalogSource }));

        controller.setQuery('sc');
        await waitLongerThanDebounce();

        const status = controller.searchStatus.value;
        expect(status.kind).toBe('results');
        if (status.kind === 'results') {
            expect(status.results).toEqual([
                { providerShowId: 'provider-1', title: 'Scissione', originalTitle: 'Severance', year: 2022, posterUrl: searchResult.posterUrl }
            ]);
        }
    });

    it('save() senza aver scelto un risultato non salva nulla nel repository', async () => {
        const addShowSpy = vi.fn<(show: TrackedShow) => Promise<AddShowOutcome>>().mockResolvedValue({ outcome: 'added' });
        const store = buildStore({ addShow: addShowSpy });
        const { controller } = mountAddShow(buildDeps({ store }));

        controller.setQuery('testo libero senza scegliere un risultato');
        const outcome = await controller.save();

        expect(outcome).toBeUndefined();
        expect(addShowSpy).not.toHaveBeenCalled();
    });
});

describe('useAddShow — criterio 2, importa locandina stagioni ed episodi', () => {
    it('salva nel repository la serie scelta con locandina, stagioni ed episodi del catalogo', async () => {
        const catalogShow = buildCatalogShow();
        const catalogSource = buildCatalogSource({ loadShow: () => Promise.resolve({ outcome: 'found', show: catalogShow }) });
        const addShowSpy = vi.fn<(show: TrackedShow) => Promise<AddShowOutcome>>().mockResolvedValue({ outcome: 'added' });
        const store = buildStore({ addShow: addShowSpy });
        const { controller } = mountAddShow(buildDeps({ store, catalogSource }));

        await controller.chooseResult(buildSearchResultItem());
        controller.chooseProvider(undefined);
        await controller.save();

        expect(addShowSpy).toHaveBeenCalledOnce();
        const savedShow = addShowSpy.mock.calls[0]![0];
        expect(savedShow.seriesPosterUrl).toBe(catalogShow.seriesPosterUrl);
        expect(savedShow.seasons).toEqual(catalogShow.seasons);
        expect(savedShow.title).toBe(catalogShow.title);
    });
});

describe('useAddShow — duplicato bloccato', () => {
    it('mostra il messaggio del repository senza chiudere il flusso di aggiunta', async () => {
        const rejectedReason = 'Questa serie è già stata aggiunta.';
        const store = buildStore({ addShow: () => Promise.resolve({ outcome: 'rejected', reason: rejectedReason }) });
        const { controller } = mountAddShow(buildDeps({ store }));

        await controller.chooseResult(buildSearchResultItem());
        controller.chooseProvider(undefined);
        const outcome = await controller.save();

        expect(outcome).toEqual({ outcome: 'rejected', reason: rejectedReason });
        expect(controller.saveError.value).toBe(rejectedReason);
        expect(controller.step.value).toBe('position');
    });
});

describe('useAddShow — duplicato riconosciuto subito dopo la scelta del risultato', () => {
    it('non carica dettagli né piattaforme per una serie già seguita', async () => {
        const loadShowSpy = vi.fn(() => Promise.resolve({ outcome: 'found' as const, show: buildCatalogShow() }));
        const loadProvidersSpy = vi.fn(() => Promise.resolve({ outcome: 'loaded' as const, providers: [] }));
        const catalogSource = buildCatalogSource({ loadShow: loadShowSpy, loadItalianProviders: loadProvidersSpy });
        const trackedProviderShowIds = { value: new Set(['provider-1']) };
        const { controller } = mountAddShow(buildDeps({ catalogSource, trackedProviderShowIds }));

        await controller.chooseResult(buildSearchResultItem({ providerShowId: 'provider-1' }));

        expect(loadShowSpy).not.toHaveBeenCalled();
        expect(loadProvidersSpy).not.toHaveBeenCalled();
        expect(controller.step.value).toBe('search');
        expect(controller.searchStatus.value).toEqual({ kind: 'unavailable', reason: 'Questa serie è già stata aggiunta.' });
    });

    it('una serie non ancora seguita procede normalmente al passo della piattaforma', async () => {
        const trackedProviderShowIds = { value: new Set(['un-altro-provider']) };
        const { controller } = mountAddShow(buildDeps({ trackedProviderShowIds }));

        await controller.chooseResult(buildSearchResultItem({ providerShowId: 'provider-1' }));

        expect(controller.step.value).toBe('provider');
        expect(controller.selectedShow.value).toBeDefined();
    });
});

describe('useAddShow — posizione iniziale senza ProgressEvent', () => {
    it('imposta lastWatchedEpisodeId salvando direttamente la serie, senza passare da advanceProgress', async () => {
        const catalogShow = buildCatalogShow();
        const secondEpisodeId = catalogShow.seasons[0]!.episodes[1]!.providerEpisodeId;
        const advanceProgressSpy = vi.fn();
        const addShowSpy = vi.fn<(show: TrackedShow) => Promise<AddShowOutcome>>().mockResolvedValue({ outcome: 'added' });
        const catalogSource = buildCatalogSource({ loadShow: () => Promise.resolve({ outcome: 'found', show: catalogShow }) });
        const store = buildStore({ addShow: addShowSpy, advanceProgress: advanceProgressSpy });
        const { controller } = mountAddShow(buildDeps({ store, catalogSource }));

        await controller.chooseResult(buildSearchResultItem());
        controller.chooseProvider(undefined);
        controller.setInitialPosition({ kind: 'watchedThrough', episodeId: secondEpisodeId });
        await controller.save();

        expect(advanceProgressSpy).not.toHaveBeenCalled();
        const savedShow = addShowSpy.mock.calls[0]![0];
        expect(savedShow.lastWatchedEpisodeId).toBe(secondEpisodeId);
        expect(savedShow.progressRevision).toBe(0);
        expect(savedShow.lastViewedAt).toBeUndefined();
        expect(savedShow.addedAt).toBe(NOW);
    });

    it('«Da iniziare» non valorizza lastWatchedEpisodeId', async () => {
        const catalogShow = buildCatalogShow();
        const addShowSpy = vi.fn<(show: TrackedShow) => Promise<AddShowOutcome>>().mockResolvedValue({ outcome: 'added' });
        const catalogSource = buildCatalogSource({ loadShow: () => Promise.resolve({ outcome: 'found', show: catalogShow }) });
        const store = buildStore({ addShow: addShowSpy });
        const { controller } = mountAddShow(buildDeps({ store, catalogSource }));

        await controller.chooseResult(buildSearchResultItem());
        controller.chooseProvider(undefined);
        await controller.save();

        const savedShow = addShowSpy.mock.calls[0]![0];
        expect(savedShow.lastWatchedEpisodeId).toBeUndefined();
    });
});

describe('useAddShow — passo delle piattaforme italiane', () => {
    it('con più piattaforme nessuna e preselezionata: la scelta resta obbligatoria', async () => {
        const providers: readonly ItalianProvider[] = [{ id: 'now', name: 'NOW' }, { id: 'sky-go', name: 'Sky Go' }];
        const catalogSource = buildCatalogSource({ loadItalianProviders: () => Promise.resolve({ outcome: 'loaded', providers }) });
        const { controller } = mountAddShow(buildDeps({ catalogSource }));

        await controller.chooseResult(buildSearchResultItem());

        expect(controller.selectedProviderId.value).toBeUndefined();
        expect(controller.selectedShow.value?.providers).toEqual(providers);
    });

    it('con una sola piattaforma questa e gia selezionata', async () => {
        const providers: readonly ItalianProvider[] = [{ id: 'apple-tv-plus', name: 'Apple TV+' }];
        const catalogSource = buildCatalogSource({ loadItalianProviders: () => Promise.resolve({ outcome: 'loaded', providers }) });
        const { controller } = mountAddShow(buildDeps({ catalogSource }));

        await controller.chooseResult(buildSearchResultItem());

        expect(controller.selectedProviderId.value).toBe('apple-tv-plus');
    });

    it('senza piattaforme italiane la serie si aggiunge comunque', async () => {
        const catalogSource = buildCatalogSource({ loadItalianProviders: () => Promise.resolve({ outcome: 'loaded', providers: [] }) });
        const addShowSpy = vi.fn<(show: TrackedShow) => Promise<AddShowOutcome>>().mockResolvedValue({ outcome: 'added' });
        const store = buildStore({ addShow: addShowSpy });
        const { controller } = mountAddShow(buildDeps({ store, catalogSource }));

        await controller.chooseResult(buildSearchResultItem());
        controller.chooseProvider(undefined);
        const outcome = await controller.save();

        expect(outcome?.outcome).toBe('added');
        const savedShow = addShowSpy.mock.calls[0]![0];
        expect(savedShow.selectedStreamingProviderId).toBeUndefined();
        expect(savedShow.italianProviders).toEqual([]);
    });
});

describe('useAddShow — debounce della ricerca', () => {
    it('digitando più caratteri prima dello scadere del debounce cerca una sola volta, con l\'ultimo valore', async () => {
        const searchShowsSpy = vi.fn(() => Promise.resolve({ outcome: 'found' as const, results: [] }));
        const catalogSource = buildCatalogSource({ searchShows: searchShowsSpy });
        const { controller } = mountAddShow(buildDeps({ catalogSource }));

        controller.setQuery('s');
        controller.setQuery('sc');
        controller.setQuery('sci');
        await waitLongerThanDebounce();

        expect(searchShowsSpy).toHaveBeenCalledOnce();
        expect(searchShowsSpy).toHaveBeenCalledWith('sci');
    });
});

describe('useAddShow — esiti distinti della ricerca', () => {
    it('nessun risultato produce un messaggio dedicato', async () => {
        const catalogSource = buildCatalogSource({ searchShows: () => Promise.resolve({ outcome: 'found', results: [] }) });
        const { controller } = mountAddShow(buildDeps({ catalogSource }));

        controller.setQuery('introvabile');
        await waitLongerThanDebounce();

        expect(controller.searchStatus.value).toEqual({ kind: 'noResults' });
    });

    it('la rete non disponibile produce un messaggio diverso da quello per nessun risultato', async () => {
        const unavailableReason = 'Impossibile contattare TMDB: verifica la connessione di rete.';
        const catalogSource = buildCatalogSource({
            searchShows: () => Promise.resolve({ outcome: 'unavailable', reason: unavailableReason })
        });
        const { controller } = mountAddShow(buildDeps({ catalogSource }));

        controller.setQuery('scissione');
        await waitLongerThanDebounce();

        expect(controller.searchStatus.value).toEqual({ kind: 'unavailable', reason: unavailableReason });
        expect(controller.searchStatus.value).not.toEqual({ kind: 'noResults' });
    });
});

describe('useAddShow — prossima puntata annunciata assente dalla stagione', () => {
    it('la serie salvata la include, e l\'evidenza compare nella posizione di visione', async () => {
        const onlyMurdersProviderShowId = '95403';
        const addShowSpy = vi.fn<(show: TrackedShow) => Promise<AddShowOutcome>>().mockResolvedValue({ outcome: 'added' });
        const store = buildStore({ addShow: addShowSpy });
        const { controller } = mountAddShow(buildDeps({ store, catalogSource: sampleCatalogSource }));

        await controller.chooseResult(buildSearchResultItem({ providerShowId: onlyMurdersProviderShowId }));
        controller.chooseProvider(undefined);
        await controller.save();

        const savedShow = addShowSpy.mock.calls[0]![0];
        const season4 = savedShow.seasons.find((season) => season.seasonNumber === 4);
        expect(season4?.episodes.map((episode) => episode.providerEpisodeId)).toContain('95403-S4E9');

        const watchPosition = calculateWatchPosition(savedShow, '2026-01-01');
        expect(watchPosition.nextUpcomingEpisode?.providerEpisodeId).toBe('95403-S4E9');
    });
});

describe('useAddShow — scrittura reale nel repository (fake-indexeddb)', () => {
    afterEach(async () => {
        await tvTrackerDatabase.trackedShows.clear();
    });

    it('salva la serie scelta nel repository reale e la rilegge con gli stessi dati', async () => {
        const catalogShow = buildCatalogShow();
        const catalogSource = buildCatalogSource({ loadShow: () => Promise.resolve({ outcome: 'found', show: catalogShow }) });
        const { controller } = mountAddShow(buildDeps({ store: localTrackedShowStore, catalogSource }));

        await controller.chooseResult(buildSearchResultItem());
        controller.chooseProvider(undefined);
        const outcome = await controller.save();

        expect(outcome).toEqual({ outcome: 'added' });
        expect(controller.saveError.value).toBeUndefined();
        expect(controller.isSaving.value).toBe(false);
        const savedShows = await tvTrackerDatabase.trackedShows.toArray();
        expect(savedShows).toHaveLength(1);
        expect(savedShows[0]?.title).toBe(catalogShow.title);
        expect(savedShows[0]?.seasons).toEqual(catalogShow.seasons);
    });
});

describe('useAddShow — errore imprevisto durante il salvataggio', () => {
    it('libera isSaving e mostra un messaggio invece di lasciare il pulsante bloccato', async () => {
        const store = buildStore({ addShow: () => Promise.reject(new Error('errore di salvataggio simulato')) });
        const { controller } = mountAddShow(buildDeps({ store }));

        await controller.chooseResult(buildSearchResultItem());
        controller.chooseProvider(undefined);
        const outcome = await controller.save();

        expect(outcome).toBeUndefined();
        expect(controller.isSaving.value).toBe(false);
        expect(controller.saveError.value).toBe('Si è verificato un errore imprevisto. Riprova.');
    });
});

describe('useAddShow — posizione iniziale limitata agli episodi già usciti', () => {
    it('esclude gli episodi non ancora usciti dalle scelte per la posizione iniziale', async () => {
        const catalogShow = buildCatalogShow({
            seasons: [buildSeason(1, [
                buildEpisode(1, 1, 'Episodio 1', '2022-01-01'),
                buildEpisode(1, 2, 'Episodio 2', '2022-01-08'),
                buildEpisode(1, 3, 'Episodio 3', '2099-01-01')
            ])]
        });
        const catalogSource = buildCatalogSource({ loadShow: () => Promise.resolve({ outcome: 'found', show: catalogShow }) });
        const { controller } = mountAddShow(buildDeps({ catalogSource, resolveToday: () => '2026-01-01' }));

        await controller.chooseResult(buildSearchResultItem());

        const publishedEpisodeIds = controller.selectedShow.value?.publishedEpisodes.map((episode) => episode.providerEpisodeId);
        expect(publishedEpisodeIds).toEqual(['s1e1', 's1e2']);
    });

    it('una stagione interamente futura non compare fra gli episodi proponibili', async () => {
        const catalogShow = buildCatalogShow({
            seasons: [
                buildSeason(1, [buildEpisode(1, 1, 'Episodio 1', '2022-01-01')]),
                buildSeason(4, [
                    buildEpisode(4, 1, 'Episodio futuro 1', '2099-01-01'),
                    buildEpisode(4, 2, 'Episodio futuro 2', '2099-01-08')
                ])
            ]
        });
        const catalogSource = buildCatalogSource({ loadShow: () => Promise.resolve({ outcome: 'found', show: catalogShow }) });
        const { controller } = mountAddShow(buildDeps({ catalogSource, resolveToday: () => '2026-01-01' }));

        await controller.chooseResult(buildSearchResultItem());

        const publishedSeasonNumbers = controller.selectedShow.value?.publishedEpisodes.map((episode) => episode.seasonNumber);
        expect(publishedSeasonNumbers).toEqual([1]);
    });
});

describe('useAddShow — reset del flusso', () => {
    it('backToSearch torna al passo di ricerca e dimentica la selezione', async () => {
        const { controller } = mountAddShow(buildDeps());

        await controller.chooseResult(buildSearchResultItem());
        expect(controller.step.value).toBe('provider');

        controller.backToSearch();

        expect(controller.step.value).toBe('search');
        expect(controller.selectedShow.value).toBeUndefined();
    });
});
