import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCatalogRefresh, type CatalogRefreshDeps } from './useCatalogRefresh';
import type { CatalogShow, CatalogSource, LoadShowOutcome } from '@/catalog/catalogSource';
import type { Episode, Season, TrackedShow } from '@/domain/trackedShow';
import type { TrackedShowsListener, TrackedShowStore, UpdateCatalogOutcome } from '@/persistence/trackedShowStore';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const NETWORK_UNAVAILABLE_REASON = 'Impossibile contattare TMDB: verifica la connessione di rete.';

function buildEpisode(seasonNumber: number, episodeNumber: number): Episode {
    return {
        providerEpisodeId: `s${seasonNumber}e${episodeNumber}`,
        seasonNumber,
        episodeNumber,
        title: `S${seasonNumber}E${episodeNumber}`,
        airDate: '2026-01-01'
    };
}

function buildSeason(seasonNumber: number, episodes: readonly Episode[]): Season {
    return { providerSeasonId: `season-${seasonNumber}`, seasonNumber, episodes };
}

function buildShow(overrides: Partial<TrackedShow> = {}): TrackedShow {
    return {
        id: `show-${overrides.providerShowId ?? '1'}`,
        catalogProvider: 'tmdb',
        providerShowId: 'p1',
        title: 'Serie di prova',
        status: 'In corso',
        seasons: [buildSeason(1, [buildEpisode(1, 1)])],
        italianProviders: [],
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides
    };
}

function buildCatalogShow(providerShowId: string): CatalogShow {
    return {
        catalogProvider: 'tmdb',
        providerShowId,
        title: 'Serie di prova aggiornata',
        status: 'Conclusa',
        seasons: [buildSeason(1, [buildEpisode(1, 1)])]
    };
}

function buildCatalogShowWithSeasons(providerShowId: string, seasons: readonly Season[]): CatalogShow {
    return { ...buildCatalogShow(providerShowId), seasons };
}

function buildStore(initialShows: readonly TrackedShow[]): { store: TrackedShowStore; updateCatalogCalls: TrackedShow[] } {
    const updateCatalogCalls: TrackedShow[] = [];
    const notImplemented = (): Promise<never> => Promise.reject(new Error('non usato in questo test'));
    const store: TrackedShowStore = {
        subscribeToTrackedShows: (listener: TrackedShowsListener) => {
            listener(initialShows);
            return () => {};
        },
        subscribeToShow: () => () => {},
        addShow: notImplemented,
        updateCatalog: (show: TrackedShow): Promise<UpdateCatalogOutcome> => {
            updateCatalogCalls.push(show);
            return Promise.resolve({ outcome: 'updated' });
        },
        changeProvider: notImplemented,
        advanceProgress: notImplemented,
        undoLastProgress: notImplemented,
        removeShow: notImplemented,
        listAllProgressEvents: notImplemented,
        replaceAllShows: notImplemented
    };
    return { store, updateCatalogCalls };
}

function buildCatalogSource(
    outcomeByProviderShowId: Readonly<Record<string, LoadShowOutcome>>
): { catalogSource: CatalogSource; loadShowCalls: string[] } {
    const loadShowCalls: string[] = [];
    const catalogSource: CatalogSource = {
        searchShows: () => Promise.reject(new Error('non usato in questo test')),
        loadShow: (providerShowId: string): Promise<LoadShowOutcome> => {
            loadShowCalls.push(providerShowId);
            return Promise.resolve(outcomeByProviderShowId[providerShowId] ?? { outcome: 'missing' });
        },
        loadItalianProviders: () => Promise.reject(new Error('non usato in questo test'))
    };
    return { catalogSource, loadShowCalls };
}

function buildClock(initial: string): { now: () => string; advanceTo: (next: string) => void } {
    let current = initial;
    return { now: () => current, advanceTo: (next: string) => { current = next; } };
}

function buildDeps(overrides: CatalogRefreshDeps = {}): CatalogRefreshDeps {
    return { isOnline: () => true, resolveNow: () => '2026-03-01T09:00:00.000Z', ...overrides };
}

class FakeLocalStorage {
    private readonly entries: Map<string, string>;

    constructor(initialEntries: Readonly<Record<string, string>>) {
        this.entries = new Map(Object.entries(initialEntries));
    }

    getItem(key: string): string | null {
        return this.entries.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.entries.set(key, value);
    }
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('refreshManually', () => {
    it('aggiorna ogni serie tracciata e restituisce "updated" quando tutte riescono', async () => {
        const { store, updateCatalogCalls } = buildStore([buildShow({ providerShowId: 'p1' })]);
        const { catalogSource, loadShowCalls } = buildCatalogSource({ p1: { outcome: 'found', show: buildCatalogShow('p1') } });
        const catalogRefresh = createCatalogRefresh(buildDeps({ store, catalogSource }));

        const outcome = await catalogRefresh.refreshManually();

        expect(outcome).toEqual({ outcome: 'updated' });
        expect(loadShowCalls).toEqual(['p1']);
        expect(updateCatalogCalls).toHaveLength(1);
        expect(updateCatalogCalls[0]?.title).toBe('Serie di prova aggiornata');
    });

    it('restituisce "noShows" senza contattare il catalogo quando non ci sono serie da aggiornare', async () => {
        const { store } = buildStore([]);
        const { catalogSource, loadShowCalls } = buildCatalogSource({});
        const catalogRefresh = createCatalogRefresh(buildDeps({ store, catalogSource }));

        const outcome = await catalogRefresh.refreshManually();

        expect(outcome).toEqual({ outcome: 'noShows' });
        expect(loadShowCalls).toEqual([]);
    });

    it('restituisce "unavailable" con il motivo quando il catalogo non è raggiungibile', async () => {
        const { store, updateCatalogCalls } = buildStore([buildShow({ providerShowId: 'p1' })]);
        const { catalogSource } = buildCatalogSource({
            p1: { outcome: 'unavailable', reason: NETWORK_UNAVAILABLE_REASON }
        });
        const catalogRefresh = createCatalogRefresh(buildDeps({ store, catalogSource }));

        const outcome = await catalogRefresh.refreshManually();

        expect(outcome).toEqual({ outcome: 'unavailable', reason: NETWORK_UNAVAILABLE_REASON });
        expect(updateCatalogCalls).toEqual([]);
    });

    it('una serie rimossa dal catalogo (missing) resta invariata e non impedisce l\'aggiornamento delle altre', async () => {
        const { store, updateCatalogCalls } = buildStore([
            buildShow({ id: 'show-p1', providerShowId: 'p1' }),
            buildShow({ id: 'show-p2', providerShowId: 'p2' })
        ]);
        const { catalogSource, loadShowCalls } = buildCatalogSource({
            p1: { outcome: 'found', show: buildCatalogShow('p1') },
            p2: { outcome: 'missing' }
        });
        const catalogRefresh = createCatalogRefresh(buildDeps({ store, catalogSource }));

        const outcome = await catalogRefresh.refreshManually();

        expect(outcome).toEqual({ outcome: 'updated' });
        expect(loadShowCalls.sort()).toEqual(['p1', 'p2']);
        expect(updateCatalogCalls).toHaveLength(1);
        expect(updateCatalogCalls[0]?.providerShowId).toBe('p1');
    });

    it('restituisce "unavailable" quando anche il salvataggio locale viene rifiutato', async () => {
        const { catalogSource } = buildCatalogSource({ p1: { outcome: 'found', show: buildCatalogShow('p1') } });
        const rejectingStore: TrackedShowStore = {
            ...buildStore([buildShow({ providerShowId: 'p1' })]).store,
            updateCatalog: () => Promise.resolve({ outcome: 'rejected', reason: 'La serie non esiste più.' })
        };
        const catalogRefresh = createCatalogRefresh(buildDeps({ store: rejectingStore, catalogSource }));

        const outcome = await catalogRefresh.refreshManually();

        expect(outcome).toEqual({ outcome: 'unavailable', reason: 'La serie non esiste più.' });
    });

    it('non persiste mai una posizione orfana: la serie il cui episodio visto sparisce del tutto non viene aggiornata', async () => {
        const orphaningShow = buildShow({
            providerShowId: 'p1',
            lastWatchedEpisodeId: 's1e1',
            seasons: [buildSeason(1, [buildEpisode(1, 1)])]
        });
        const { store, updateCatalogCalls } = buildStore([orphaningShow]);
        const replacementCatalog = buildCatalogShowWithSeasons('p1', [buildSeason(2, [buildEpisode(2, 1)])]);
        const { catalogSource } = buildCatalogSource({ p1: { outcome: 'found', show: replacementCatalog } });
        const catalogRefresh = createCatalogRefresh(buildDeps({ store, catalogSource }));

        const outcome = await catalogRefresh.refreshManually();

        expect(outcome.outcome).toBe('unavailable');
        expect(updateCatalogCalls).toEqual([]);
    });
});

describe('checkBackgroundRefresh — soglia delle 12 ore', () => {
    it('non contatta la rete se l\'ultimo controllo è più recente della soglia', async () => {
        vi.stubGlobal('localStorage', new FakeLocalStorage({ 'tv-tracker:catalog-last-checked-at': '2026-03-01T08:00:00.000Z' }));
        const { store } = buildStore([buildShow({ providerShowId: 'p1' })]);
        const { catalogSource, loadShowCalls } = buildCatalogSource({ p1: { outcome: 'found', show: buildCatalogShow('p1') } });
        const catalogRefresh = createCatalogRefresh(buildDeps({
            store,
            catalogSource,
            resolveNow: () => '2026-03-01T09:00:00.000Z',
            backgroundThresholdMs: TWELVE_HOURS_MS
        }));

        await catalogRefresh.checkBackgroundRefresh();

        expect(loadShowCalls).toEqual([]);
    });

    it('contatta la rete se l\'ultimo controllo supera la soglia', async () => {
        vi.stubGlobal('localStorage', new FakeLocalStorage({ 'tv-tracker:catalog-last-checked-at': '2026-02-28T20:00:00.000Z' }));
        const { store } = buildStore([buildShow({ providerShowId: 'p1' })]);
        const { catalogSource, loadShowCalls } = buildCatalogSource({ p1: { outcome: 'found', show: buildCatalogShow('p1') } });
        const catalogRefresh = createCatalogRefresh(buildDeps({
            store,
            catalogSource,
            resolveNow: () => '2026-03-01T09:00:00.000Z',
            backgroundThresholdMs: TWELVE_HOURS_MS
        }));

        await catalogRefresh.checkBackgroundRefresh();

        expect(loadShowCalls).toEqual(['p1']);
    });

    it('non contatta la rete un istante prima di raggiungere esattamente la soglia', async () => {
        vi.stubGlobal('localStorage', new FakeLocalStorage({ 'tv-tracker:catalog-last-checked-at': '2026-02-28T21:00:00.001Z' }));
        const { store } = buildStore([buildShow({ providerShowId: 'p1' })]);
        const { catalogSource, loadShowCalls } = buildCatalogSource({ p1: { outcome: 'found', show: buildCatalogShow('p1') } });
        const catalogRefresh = createCatalogRefresh(buildDeps({
            store,
            catalogSource,
            resolveNow: () => '2026-03-01T09:00:00.000Z',
            backgroundThresholdMs: TWELVE_HOURS_MS
        }));

        await catalogRefresh.checkBackgroundRefresh();

        expect(loadShowCalls).toEqual([]);
    });

    it('contatta la rete esattamente al raggiungimento della soglia', async () => {
        vi.stubGlobal('localStorage', new FakeLocalStorage({ 'tv-tracker:catalog-last-checked-at': '2026-02-28T21:00:00.000Z' }));
        const { store } = buildStore([buildShow({ providerShowId: 'p1' })]);
        const { catalogSource, loadShowCalls } = buildCatalogSource({ p1: { outcome: 'found', show: buildCatalogShow('p1') } });
        const catalogRefresh = createCatalogRefresh(buildDeps({
            store,
            catalogSource,
            resolveNow: () => '2026-03-01T09:00:00.000Z',
            backgroundThresholdMs: TWELVE_HOURS_MS
        }));

        await catalogRefresh.checkBackgroundRefresh();

        expect(loadShowCalls).toEqual(['p1']);
    });

    it('non contatta mai la rete quando manca la connessione, anche oltre soglia', async () => {
        vi.stubGlobal('localStorage', new FakeLocalStorage({}));
        const { store } = buildStore([buildShow({ providerShowId: 'p1' })]);
        const { catalogSource, loadShowCalls } = buildCatalogSource({ p1: { outcome: 'found', show: buildCatalogShow('p1') } });
        const catalogRefresh = createCatalogRefresh(buildDeps({ store, catalogSource, isOnline: () => false }));

        await catalogRefresh.checkBackgroundRefresh();

        expect(loadShowCalls).toEqual([]);
    });

    it('registra comunque il tentativo quando il controllo automatico fallisce, per rispettare la soglia successiva', async () => {
        const fakeStorage = new FakeLocalStorage({});
        vi.stubGlobal('localStorage', fakeStorage);
        const { store } = buildStore([buildShow({ providerShowId: 'p1' })]);
        const { catalogSource } = buildCatalogSource({ p1: { outcome: 'unavailable', reason: NETWORK_UNAVAILABLE_REASON } });
        const catalogRefresh = createCatalogRefresh(buildDeps({ store, catalogSource, resolveNow: () => '2026-03-01T09:00:00.000Z' }));

        await catalogRefresh.checkBackgroundRefresh();

        expect(fakeStorage.getItem('tv-tracker:catalog-last-checked-at')).toBe('2026-03-01T09:00:00.000Z');
    });
});

describe('lastCheckedLabel', () => {
    it('riflette il tempo trascorso dall\'ultimo controllo registrato', async () => {
        vi.stubGlobal('localStorage', new FakeLocalStorage({}));
        const clock = buildClock('2026-03-01T09:00:00.000Z');
        const { store } = buildStore([buildShow({ providerShowId: 'p1' })]);
        const { catalogSource } = buildCatalogSource({ p1: { outcome: 'found', show: buildCatalogShow('p1') } });
        const catalogRefresh = createCatalogRefresh(buildDeps({ store, catalogSource, resolveNow: clock.now }));

        expect(catalogRefresh.lastCheckedLabel.value).toBe('non ancora aggiornata');

        await catalogRefresh.refreshManually();
        clock.advanceTo('2026-03-01T09:05:00.000Z');

        expect(catalogRefresh.lastCheckedLabel.value).toBe('aggiornata 5 minuti fa');
    });

    it('non dichiara un aggiornamento riuscito quando il tentativo fallisce del tutto', async () => {
        vi.stubGlobal('localStorage', new FakeLocalStorage({}));
        const { store } = buildStore([buildShow({ providerShowId: 'p1' })]);
        const { catalogSource } = buildCatalogSource({ p1: { outcome: 'unavailable', reason: NETWORK_UNAVAILABLE_REASON } });
        const catalogRefresh = createCatalogRefresh(buildDeps({ store, catalogSource, resolveNow: () => '2026-03-01T09:00:00.000Z' }));

        const outcome = await catalogRefresh.refreshManually();

        expect(outcome.outcome).toBe('unavailable');
        expect(catalogRefresh.lastCheckedLabel.value).toBe('non ancora aggiornata');
    });

    it('torna a dichiarare un aggiornamento riuscito quando un tentativo successivo va a buon fine', async () => {
        vi.stubGlobal('localStorage', new FakeLocalStorage({}));
        const clock = buildClock('2026-03-01T09:00:00.000Z');
        const { store } = buildStore([buildShow({ providerShowId: 'p1' })]);
        const failingSource = buildCatalogSource({ p1: { outcome: 'unavailable', reason: NETWORK_UNAVAILABLE_REASON } }).catalogSource;
        const catalogRefresh = createCatalogRefresh(buildDeps({ store, catalogSource: failingSource, resolveNow: clock.now }));
        await catalogRefresh.refreshManually();
        expect(catalogRefresh.lastCheckedLabel.value).toBe('non ancora aggiornata');

        const succeedingSource = buildCatalogSource({ p1: { outcome: 'found', show: buildCatalogShow('p1') } }).catalogSource;
        const recoveredRefresh = createCatalogRefresh(buildDeps({ store, catalogSource: succeedingSource, resolveNow: clock.now }));
        await recoveredRefresh.refreshManually();

        expect(recoveredRefresh.lastCheckedLabel.value).toBe('aggiornata ora');
    });
});
