// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useShowDetail, type ShowDetailContent, type ShowDetailDeps, type UseShowDetail } from './useShowDetail';
import { findProfileById } from '@/auth/profiles';
import { session } from '@/auth/session';
import type { Episode, ProgressEvent, ProgressOutcome, Season, TrackedShow } from '@/domain/trackedShow';
import { advanceProgress } from '@/domain/progressAdvance';
import { undoLastProgress } from '@/domain/progressUndo';
import type {
    AddShowOutcome,
    ChangeProviderOutcome,
    RemoveShowOutcome,
    TrackedShowListener,
    TrackedShowsListener,
    TrackedShowStore,
    Unsubscribe,
    UpdateCatalogOutcome
} from '@/persistence/trackedShowStore';

const TODAY = '2026-01-20';
const FABIO = 'fabio';
const SHOW_NOT_FOUND_REASON = 'La serie non esiste più.';

function buildEpisode(seasonNumber: number, episodeNumber: number, title: string, airDate: string): Episode {
    return { providerEpisodeId: `s${seasonNumber}e${episodeNumber}`, seasonNumber, episodeNumber, title, airDate };
}

function buildSeason(seasonNumber: number, episodes: readonly Episode[]): Season {
    return { providerSeasonId: `season-${seasonNumber}`, seasonNumber, episodes };
}

function buildTwoSeasonShow(overrides: Partial<TrackedShow> = {}): TrackedShow {
    return {
        id: 'show-1',
        catalogProvider: 'tmdb',
        providerShowId: 'provider-1',
        title: 'Serie di prova',
        status: 'In corso',
        seasons: [
            buildSeason(1, [
                buildEpisode(1, 1, 'S1E1', '2026-01-01'),
                buildEpisode(1, 2, 'S1E2', '2026-01-08')
            ]),
            buildSeason(2, [
                buildEpisode(2, 1, 'S2E1', '2026-01-15'),
                buildEpisode(2, 2, 'S2E2', '2026-02-01')
            ])
        ],
        italianProviders: [{ id: 'apple-tv', name: 'Apple TV+' }, { id: 'now', name: 'NOW' }],
        selectedStreamingProviderId: 'apple-tv',
        selectedStreamingProviderName: 'Apple TV+',
        lastWatchedEpisodeId: 's1e1',
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides
    };
}

function buildFakeStore(initialShow: TrackedShow | undefined, initialEvents: readonly ProgressEvent[] = []): {
    store: TrackedShowStore;
    getShow: () => TrackedShow | undefined;
    getEvents: () => readonly ProgressEvent[];
} {
    let show = initialShow;
    let events = initialEvents;
    const listeners = new Set<TrackedShowListener>();

    function notify(): void {
        for (const listener of listeners) {
            listener(show);
        }
    }

    const store: TrackedShowStore = {
        subscribeToTrackedShows: (listener: TrackedShowsListener): Unsubscribe => {
            listener(show === undefined ? [] : [show]);
            return () => {};
        },
        subscribeToShow(showId: string, listener: TrackedShowListener): Unsubscribe {
            listeners.add(listener);
            listener(show?.id === showId ? show : undefined);
            return () => listeners.delete(listener);
        },
        addShow: (): Promise<AddShowOutcome> => Promise.resolve({ outcome: 'rejected', reason: 'non implementato nel doppio di test' }),
        updateCatalog: (): Promise<UpdateCatalogOutcome> => Promise.resolve({ outcome: 'rejected', reason: 'non implementato nel doppio di test' }),
        changeProvider(showId: string, selectedProvider, updatedAt: string): Promise<ChangeProviderOutcome> {
            if (show === undefined || show.id !== showId) {
                return Promise.resolve({ outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON });
            }
            show = {
                ...show,
                selectedStreamingProviderId: selectedProvider?.id,
                selectedStreamingProviderName: selectedProvider?.name,
                updatedAt
            };
            notify();
            return Promise.resolve({ outcome: 'changed' });
        },
        advanceProgress(showId: string, targetEpisodeId: string, confirmedBy: string, today: string): Promise<ProgressOutcome> {
            if (show === undefined || show.id !== showId) {
                return Promise.resolve({ outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON });
            }
            const confirmedAt = new Date().toISOString();
            const outcome = advanceProgress(show, targetEpisodeId, confirmedBy, confirmedAt, today);
            if (outcome.outcome === 'applied') {
                show = outcome.show;
                events = [...events, outcome.event];
                notify();
            }
            return Promise.resolve(outcome);
        },
        undoLastProgress(showId: string, expectedRevision: number, undoneBy: string): Promise<ProgressOutcome> {
            if (show === undefined || show.id !== showId) {
                return Promise.resolve({ outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON });
            }
            const undoneAt = new Date().toISOString();
            const outcome = undoLastProgress(show, events, expectedRevision, undoneBy, undoneAt);
            if (outcome.outcome === 'applied') {
                show = outcome.show;
                events = events.map((event) => (event.id === outcome.event.id ? outcome.event : event));
                notify();
            }
            return Promise.resolve(outcome);
        },
        removeShow(showId: string): Promise<RemoveShowOutcome> {
            if (show === undefined || show.id !== showId) {
                return Promise.resolve({ outcome: 'rejected', reason: SHOW_NOT_FOUND_REASON });
            }
            show = undefined;
            events = [];
            notify();
            return Promise.resolve({ outcome: 'removed' });
        },
        listAllProgressEvents: (): Promise<readonly ProgressEvent[]> => Promise.resolve(events),
        replaceAllShows: () => Promise.reject(new Error('non implementato nel doppio di test'))
    };

    return { store, getShow: () => show, getEvents: () => events };
}

function buildDeps(overrides: ShowDetailDeps = {}): ShowDetailDeps {
    return { resolveToday: () => TODAY, resolveNow: () => '2026-01-20T10:00:00Z', resolveActiveProfileId: () => FABIO, ...overrides };
}

const mountedWrappers: Array<VueWrapper> = [];

function mountShowDetail(showId: string, deps: ShowDetailDeps): { wrapper: VueWrapper; controller: UseShowDetail } {
    let controller!: UseShowDetail;
    const TestHost = defineComponent({
        setup() {
            controller = useShowDetail(ref(showId), deps);
            return () => h('div');
        }
    });
    const wrapper = mount(TestHost);
    mountedWrappers.push(wrapper);
    return { wrapper, controller };
}

function readyContent(controller: UseShowDetail): ShowDetailContent {
    const status = controller.status.value;
    if (status.kind !== 'ready') {
        throw new Error(`Stato inatteso nel test: ${status.kind}`);
    }
    return status.content;
}

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
});

describe('useShowDetail — criterio 4, avanzamento multiplo attraverso più stagioni', () => {
    it('confermando un episodio della stagione 2 fa sparire la stagione 1 e gli episodi precedenti della stagione 2', async () => {
        const { store } = buildFakeStore(buildTwoSeasonShow());
        const { controller } = mountShowDetail('show-1', buildDeps({ store }));
        await flushPromises();

        expect(readyContent(controller).seasons.map((season) => season.seasonNumber)).toEqual([1, 2]);

        controller.requestWatch('s2e1');
        await controller.confirmPendingWatch();
        await flushPromises();

        const content = readyContent(controller);
        expect(content.seasons.map((season) => season.seasonNumber)).toEqual([2]);
        expect(content.seasons[0]!.episodes).toHaveLength(0);
        expect(content.seasons[0]!.upcoming?.headline).toBe('S02 E02 · S2E2');
    });
});

describe('useShowDetail — criterio 5, annullare la conferma non cambia lo stato', () => {
    it('lo stato del repository resta identico quando la conferma di visualizzazione viene annullata', async () => {
        const { store, getShow } = buildFakeStore(buildTwoSeasonShow());
        const { controller } = mountShowDetail('show-1', buildDeps({ store }));
        await flushPromises();
        const showBefore = getShow();

        controller.requestWatch('s2e1');
        expect(controller.pendingWatch.value).toBeDefined();

        controller.cancelPendingWatch();

        expect(controller.pendingWatch.value).toBeUndefined();
        expect(getShow()).toEqual(showBefore);
    });
});

describe('useShowDetail — visibilità di «Annulla ultima conferma»', () => {
    it('non è annullabile appena aperta la serie, lo diventa dopo una conferma e torna a non esserlo dopo l\'undo', async () => {
        const { store } = buildFakeStore(buildTwoSeasonShow());
        const { controller } = mountShowDetail('show-1', buildDeps({ store }));
        await flushPromises();

        expect(readyContent(controller).canUndo).toBe(false);

        controller.requestWatch('s2e1');
        await controller.confirmPendingWatch();
        await flushPromises();
        expect(readyContent(controller).canUndo).toBe(true);

        controller.requestUndo();
        await controller.confirmPendingUndo();
        await flushPromises();
        expect(readyContent(controller).canUndo).toBe(false);
    });

    it('resta annullabile dopo due conferme consecutive e un solo undo, perché la prima conferma è ancora annullabile', async () => {
        const showWithTwoPastEpisodesInSeason2 = buildTwoSeasonShow({
            seasons: [
                buildSeason(1, [
                    buildEpisode(1, 1, 'S1E1', '2026-01-01'),
                    buildEpisode(1, 2, 'S1E2', '2026-01-08')
                ]),
                buildSeason(2, [
                    buildEpisode(2, 1, 'S2E1', '2026-01-15'),
                    buildEpisode(2, 2, 'S2E2', '2026-01-18')
                ])
            ]
        });
        const { store } = buildFakeStore(showWithTwoPastEpisodesInSeason2);
        const { controller } = mountShowDetail('show-1', buildDeps({ store }));
        await flushPromises();

        controller.requestWatch('s2e1');
        await controller.confirmPendingWatch();
        await flushPromises();

        controller.requestWatch('s2e2');
        await controller.confirmPendingWatch();
        await flushPromises();
        expect(readyContent(controller).canUndo).toBe(true);

        controller.requestUndo();
        await controller.confirmPendingUndo();
        await flushPromises();
        expect(readyContent(controller).canUndo).toBe(true);
    });
});

describe('useShowDetail — criterio 6, l\'undo ripristina esattamente posizione, conteggi e locandina', () => {
    it('il contenuto dopo undo coincide con quello precedente alla conferma', async () => {
        const { store } = buildFakeStore(buildTwoSeasonShow());
        const { controller } = mountShowDetail('show-1', buildDeps({ store }));
        await flushPromises();

        const before = readyContent(controller);

        controller.requestWatch('s2e1');
        await controller.confirmPendingWatch();
        await flushPromises();
        expect(readyContent(controller)).not.toEqual(before);

        controller.requestUndo();
        await controller.confirmPendingUndo();
        await flushPromises();

        expect(readyContent(controller)).toEqual(before);
    });
});

describe('useShowDetail — criterio 14, confirmedBy e undoneBy con l\'identità autenticata', () => {
    afterEach(() => {
        session.state.value = { status: 'anonymous' };
    });

    it('senza forzare l\'identità nei test, la conferma e l\'undo registrano il profilo autenticato in sessione', async () => {
        const irene = findProfileById('irene');
        if (irene === undefined) {
            throw new Error('profilo di test mancante');
        }
        session.state.value = { status: 'authenticated', profile: irene };

        const { store } = buildFakeStore(buildTwoSeasonShow());
        const { controller } = mountShowDetail('show-1', { store, resolveToday: () => TODAY, resolveNow: () => '2026-01-20T10:00:00Z' });
        await flushPromises();

        controller.requestWatch('s2e1');
        const watchOutcome = await controller.confirmPendingWatch();
        await flushPromises();
        controller.requestUndo();
        const undoOutcome = await controller.confirmPendingUndo();

        if (watchOutcome?.outcome !== 'applied' || undoOutcome?.outcome !== 'applied') {
            throw new Error('avanzamento o undo inatteso rifiutato');
        }
        expect(watchOutcome.event.confirmedBy).toBe('irene');
        expect(undoOutcome.event.undoneBy).toBe('irene');
    });
});

describe('useShowDetail — conflitto di revisione sull\'undo', () => {
    it('mostra il motivo del rifiuto senza perdere lo stato locale della serie', async () => {
        const show = buildTwoSeasonShow({ lastWatchedEpisodeId: 's2e1', lastViewedAt: '2026-01-15T00:00:00Z', progressRevision: 3 });
        const conflictReason = 'La serie è stata aggiornata nel frattempo: ricarica lo stato prima di annullare.';
        const store: TrackedShowStore = {
            subscribeToTrackedShows: () => () => {},
            subscribeToShow: (showId, listener) => {
                listener(showId === show.id ? show : undefined);
                return () => {};
            },
            addShow: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            updateCatalog: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            changeProvider: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            advanceProgress: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            undoLastProgress: () => Promise.resolve({ outcome: 'rejected', reason: conflictReason }),
            removeShow: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            listAllProgressEvents: () => Promise.resolve([]),
            replaceAllShows: () => Promise.reject(new Error('non usato'))
        };
        const { controller } = mountShowDetail(show.id, buildDeps({ store }));
        await flushPromises();
        const before = readyContent(controller);

        controller.requestUndo();
        const outcome = await controller.confirmPendingUndo();
        await flushPromises();

        expect(outcome).toEqual({ outcome: 'rejected', reason: conflictReason });
        expect(readyContent(controller)).toEqual(before);
    });
});

describe('useShowDetail — episodi futuri e speciali', () => {
    it('un episodio futuro non è marcabile e non riporta la data catalogo', async () => {
        const { store } = buildFakeStore(buildTwoSeasonShow());
        const { controller } = mountShowDetail('show-1', buildDeps({ store }));
        await flushPromises();

        const upcoming = readyContent(controller).seasons.find((season) => season.seasonNumber === 2)!.upcoming;
        expect(upcoming?.headline).toBe('S02 E02 · S2E2');

        controller.requestWatch('s2e2');
        expect(controller.pendingWatch.value).toBeUndefined();
    });

    it('un episodio futuro oltre la prossima puntata resta una riga non marcabile, non il riquadro in arrivo', async () => {
        const showWithTwoFutureEpisodes = buildTwoSeasonShow({
            seasons: [
                buildSeason(1, [
                    buildEpisode(1, 1, 'S1E1', '2026-01-01'),
                    buildEpisode(1, 2, 'S1E2', '2026-01-08')
                ]),
                buildSeason(2, [
                    buildEpisode(2, 1, 'S2E1', '2026-01-15'),
                    buildEpisode(2, 2, 'S2E2', '2026-02-01'),
                    buildEpisode(2, 3, 'S2E3', '2026-02-08')
                ])
            ]
        });
        const { store } = buildFakeStore(showWithTwoFutureEpisodes);
        const { controller } = mountShowDetail('show-1', buildDeps({ store }));
        await flushPromises();

        const season2 = readyContent(controller).seasons.find((season) => season.seasonNumber === 2)!;
        expect(season2.upcoming?.headline).toBe('S02 E02 · S2E2');
        const laterFutureRow = season2.episodes.find((episode) => episode.id === 's2e3')!;
        expect(laterFutureRow.canMarkWatched).toBe(false);
        expect(laterFutureRow.dateLabel).toBe('Non ancora uscita');

        controller.requestWatch('s2e3');
        expect(controller.pendingWatch.value).toBeUndefined();
    });

    it('gli episodi della sezione speciali non sono mai marcabili', async () => {
        const baseSeasons = buildTwoSeasonShow().seasons;
        const specialsSeason = buildSeason(0, [buildEpisode(0, 1, 'Dietro le quinte', '2026-01-05')]);
        const showWithSpecials = buildTwoSeasonShow({ seasons: [...baseSeasons, specialsSeason] });
        const { store } = buildFakeStore(showWithSpecials);
        const { controller } = mountShowDetail('show-1', buildDeps({ store }));
        await flushPromises();

        const specials = readyContent(controller).specials;
        expect(specials).toHaveLength(1);
        expect(specials[0]!.canMarkWatched).toBe(false);
    });
});

describe('useShowDetail — cambio piattaforma', () => {
    it('aggiorna la piattaforma senza toccare episodi o posizione', async () => {
        const { store, getShow } = buildFakeStore(buildTwoSeasonShow());
        const { controller } = mountShowDetail('show-1', buildDeps({ store }));
        await flushPromises();
        const before = readyContent(controller);

        await controller.changeProvider('now');
        await flushPromises();

        expect(getShow()?.selectedStreamingProviderId).toBe('now');
        const after = readyContent(controller);
        expect(after.selectedProviderId).toBe('now');
        expect(after.seasons).toEqual(before.seasons);
        expect(after.backlogHeadline).toBe(before.backlogHeadline);
    });
});

describe('useShowDetail — rimozione', () => {
    it('annullando la rimozione la serie e i suoi eventi restano intatti', async () => {
        const events: readonly ProgressEvent[] = [{
            id: 'event-1',
            trackedShowId: 'show-1',
            confirmedEpisodeId: 's1e1',
            seasonNumber: 1,
            episodeNumber: 1,
            episodeTitle: 'S1E1',
            confirmedAt: '2026-01-01T00:00:00Z',
            confirmedBy: FABIO
        }];
        const { store, getShow, getEvents } = buildFakeStore(buildTwoSeasonShow(), events);
        const { controller } = mountShowDetail('show-1', buildDeps({ store }));
        await flushPromises();

        controller.requestRemove();
        controller.cancelPendingRemove();
        const outcome = await controller.confirmPendingRemove();

        expect(outcome).toBeUndefined();
        expect(getShow()).toBeDefined();
        expect(getEvents()).toEqual(events);
    });

    it('confermando la rimozione la serie viene eliminata dal repository', async () => {
        const { store, getShow } = buildFakeStore(buildTwoSeasonShow());
        const { controller } = mountShowDetail('show-1', buildDeps({ store }));
        await flushPromises();

        controller.requestRemove();
        const outcome = await controller.confirmPendingRemove();
        await flushPromises();

        expect(outcome).toEqual({ outcome: 'removed' });
        expect(getShow()).toBeUndefined();
    });
});

describe('useShowDetail — sottoscrizione', () => {
    it('annulla la sottoscrizione quando il componente viene smontato', async () => {
        const unsubscribeSpy = vi.fn();
        const store: TrackedShowStore = {
            subscribeToTrackedShows: () => () => {},
            subscribeToShow: (_showId: string, listener: TrackedShowListener) => {
                listener(undefined);
                return unsubscribeSpy;
            },
            addShow: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            updateCatalog: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            changeProvider: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            advanceProgress: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            undoLastProgress: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            removeShow: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            listAllProgressEvents: () => Promise.resolve([]),
            replaceAllShows: () => Promise.reject(new Error('non usato'))
        };
        const { wrapper } = mountShowDetail('show-1', buildDeps({ store }));
        await flushPromises();

        wrapper.unmount();

        expect(unsubscribeSpy).toHaveBeenCalledOnce();
    });
});

describe('useShowDetail — serie non trovata', () => {
    it('espone lo stato notFound quando la serie non esiste nel repository', async () => {
        const { store } = buildFakeStore(undefined);
        const { controller } = mountShowDetail('show-inesistente', buildDeps({ store }));
        await flushPromises();

        expect(controller.status.value.kind).toBe('notFound');
    });
});

describe('useShowDetail — dati non allineati', () => {
    it('espone lo stato misaligned invece di lanciare quando la posizione salvata non esiste più', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const brokenShow = buildTwoSeasonShow({ lastWatchedEpisodeId: 'episodio-inesistente' });
        const { store } = buildFakeStore(brokenShow);
        const { controller } = mountShowDetail('show-1', buildDeps({ store }));
        await flushPromises();

        expect(controller.status.value.kind).toBe('misaligned');

        consoleErrorSpy.mockRestore();
    });
});
