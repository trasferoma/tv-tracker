// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRouter, createWebHistory } from 'vue-router';

import ShowDetailView from './ShowDetailView.vue';
import type { ShowDetailDeps } from '@/composables/useShowDetail';
import { advanceProgress } from '@/domain/progressAdvance';
import { resetProgress } from '@/domain/progressReset';
import { withHiddenShow, withListedShow } from '@/domain/showListing';
import { withPrivateVisibility, withSharedVisibility } from '@/domain/showVisibility';
import type { Episode, ProgressEvent, ProgressOutcome, ResetProgressOutcome, Season, TrackedShow } from '@/domain/trackedShow';
import type {
    AddShowOutcome,
    ChangeListingOutcome,
    ChangeProviderOutcome,
    ChangeVisibilityOutcome,
    RemoveShowOutcome,
    TrackedShowListener,
    TrackedShowsListener,
    TrackedShowStore,
    Unsubscribe,
    UpdateCatalogOutcome
} from '@/persistence/trackedShowStore';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock('@/router', () => ({ router: { push: pushMock } }));

const TODAY = '2026-01-20';
const FABIO = 'fabio';

function buildEpisode(seasonNumber: number, episodeNumber: number, title: string, airDate: string): Episode {
    return { providerEpisodeId: `s${seasonNumber}e${episodeNumber}`, seasonNumber, episodeNumber, title, airDate };
}

function buildSeason(seasonNumber: number, episodes: readonly Episode[]): Season {
    return { providerSeasonId: `season-${seasonNumber}`, seasonNumber, episodes };
}

function buildShow(overrides: Partial<TrackedShow> = {}): TrackedShow {
    return {
        id: 'show-1',
        catalogProvider: 'tmdb',
        providerShowId: 'provider-1',
        title: 'Serie di prova',
        status: 'In corso',
        seasons: [buildSeason(1, [
            buildEpisode(1, 1, 'S1E1', '2026-01-01'),
            buildEpisode(1, 2, 'S1E2', '2026-01-08')
        ])],
        italianProviders: [],
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides
    };
}

function buildFakeStore(initialShow: TrackedShow | undefined): {
    store: TrackedShowStore;
    getShow: () => TrackedShow | undefined;
} {
    let show = initialShow;
    let events: readonly ProgressEvent[] = [];
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
        addShow: (): Promise<AddShowOutcome> => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
        updateCatalog: (): Promise<UpdateCatalogOutcome> => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
        changeProvider: (): Promise<ChangeProviderOutcome> => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
        changeVisibility(showId: string, targetAudience, updatedAt: string): Promise<ChangeVisibilityOutcome> {
            if (show === undefined || show.id !== showId) {
                return Promise.resolve({ outcome: 'rejected', reason: 'La serie non esiste più.' });
            }
            const visibleShow = targetAudience.kind === 'shared'
                ? withSharedVisibility(show)
                : withPrivateVisibility(show, targetAudience.profileId);
            show = { ...visibleShow, updatedAt };
            notify();
            return Promise.resolve({ outcome: 'changed' });
        },
        changeListing(showId: string, targetListing, updatedAt: string): Promise<ChangeListingOutcome> {
            if (show === undefined || show.id !== showId) {
                return Promise.resolve({ outcome: 'rejected', reason: 'La serie non esiste più.' });
            }
            const listedShow = targetListing === 'hidden' ? withHiddenShow(show) : withListedShow(show);
            show = { ...listedShow, updatedAt };
            notify();
            return Promise.resolve({ outcome: 'changed' });
        },
        advanceProgress(showId: string, targetEpisodeId: string, confirmedBy: string, today: string): Promise<ProgressOutcome> {
            if (show === undefined || show.id !== showId) {
                return Promise.resolve({ outcome: 'rejected', reason: 'La serie non esiste più.' });
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
        undoLastProgress: (): Promise<ProgressOutcome> => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
        resetProgress(showId: string, targetPosition, resetAt: string, today: string): Promise<ResetProgressOutcome> {
            if (show === undefined || show.id !== showId) {
                return Promise.resolve({ outcome: 'rejected', reason: 'La serie non esiste più.' });
            }
            const outcome = resetProgress(show, targetPosition, resetAt, today);
            if (outcome.outcome === 'applied') {
                show = outcome.show;
                events = [];
                notify();
            }
            return Promise.resolve(outcome);
        },
        removeShow(showId: string): Promise<RemoveShowOutcome> {
            if (show === undefined || show.id !== showId) {
                return Promise.resolve({ outcome: 'rejected', reason: 'La serie non esiste più.' });
            }
            show = undefined;
            events = [];
            notify();
            return Promise.resolve({ outcome: 'removed' });
        },
        listAllProgressEvents: (): Promise<readonly ProgressEvent[]> => Promise.resolve(events),
        replaceAllShows: () => Promise.reject(new Error('non usato'))
    };

    return { store, getShow: () => show };
}

function buildDeps(overrides: ShowDetailDeps = {}): ShowDetailDeps {
    return { resolveToday: () => TODAY, resolveActiveProfileId: () => FABIO, ...overrides };
}

const testRouter = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', name: 'home', component: { template: '<div />' } },
        { path: '/serie/:id', name: 'show-detail', component: { template: '<div />' } }
    ]
});

const mountedWrappers: Array<VueWrapper> = [];

function mountShowDetailView(deps: ShowDetailDeps): VueWrapper {
    const wrapper = mount(ShowDetailView, { props: { id: 'show-1', deps }, global: { plugins: [testRouter] } });
    mountedWrappers.push(wrapper);
    return wrapper;
}

const WATCH_DIALOG_INDEX = 0;
const UNDO_DIALOG_INDEX = 1;
const REMOVE_DIALOG_INDEX = 2;
const RESET_DIALOG_INDEX = 3;

function findRemoveDialog(wrapper: VueWrapper) {
    return wrapper.findAll('.confirm-dialog')[REMOVE_DIALOG_INDEX]!;
}

function findWatchDialog(wrapper: VueWrapper) {
    return wrapper.findAll('.confirm-dialog')[WATCH_DIALOG_INDEX]!;
}

function findUndoDialog(wrapper: VueWrapper) {
    return wrapper.findAll('.confirm-dialog')[UNDO_DIALOG_INDEX]!;
}

function findResetDialog(wrapper: VueWrapper) {
    return wrapper.findAll('.confirm-dialog')[RESET_DIALOG_INDEX]!;
}

afterEach(() => {
    pushMock.mockReset();
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
});

describe('ShowDetailView — criterio 7, rimozione con conferma rossa', () => {
    it('la conferma di eliminazione è visivamente rossa', async () => {
        const { store } = buildFakeStore(buildShow());
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        await wrapper.find('.danger').trigger('click');

        expect(findRemoveDialog(wrapper).find('.accept-confirm--danger').exists()).toBe(true);
    });

    it('annullando la conferma la serie resta nella lista condivisa', async () => {
        const { store, getShow } = buildFakeStore(buildShow());
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        await wrapper.find('.danger').trigger('click');
        await findRemoveDialog(wrapper).find('.cancel-confirm').trigger('click');
        await flushPromises();

        expect(getShow()).toBeDefined();
        expect(pushMock).not.toHaveBeenCalled();
    });

    it('confermando l\'eliminazione la serie viene rimossa e la vista torna alla home', async () => {
        const { store, getShow } = buildFakeStore(buildShow());
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        await wrapper.find('.danger').trigger('click');
        await findRemoveDialog(wrapper).find('.accept-confirm').trigger('click');
        await flushPromises();

        expect(getShow()).toBeUndefined();
        expect(pushMock).toHaveBeenCalledWith({ name: 'home' });
    });
});

describe('ShowDetailView — visibilità di «Annulla ultima conferma»', () => {
    it('non compare finché non c\'è nulla da annullare, e appare dopo una conferma «Vista»', async () => {
        const { store } = buildFakeStore(buildShow());
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        expect(wrapper.find('.undo').exists()).toBe(false);

        await wrapper.find('.mini').trigger('click');
        await findWatchDialog(wrapper).find('.accept-confirm').trigger('click');
        await flushPromises();

        expect(wrapper.find('.undo').exists()).toBe(true);
    });
});

describe('ShowDetailView — conflitto di revisione sull\'undo', () => {
    it('mostra nel toast la reason del dominio, senza reinventare un messaggio', async () => {
        const conflictReason = 'La serie è stata aggiornata nel frattempo: ricarica lo stato prima di annullare.';
        const show = buildShow({ lastWatchedEpisodeId: 's1e1', lastViewedAt: '2026-01-15T00:00:00Z', progressRevision: 3 });
        const store: TrackedShowStore = {
            subscribeToTrackedShows: () => () => {},
            subscribeToShow: (showId, listener) => {
                listener(showId === show.id ? show : undefined);
                return () => {};
            },
            addShow: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            updateCatalog: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            changeProvider: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            changeVisibility: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            changeListing: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            advanceProgress: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            undoLastProgress: () => Promise.resolve({ outcome: 'rejected', reason: conflictReason }),
            resetProgress: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            removeShow: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            listAllProgressEvents: () => Promise.resolve([]),
            replaceAllShows: () => Promise.reject(new Error('non usato'))
        };
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        await wrapper.find('.undo').trigger('click');
        await findUndoDialog(wrapper).find('.accept-confirm').trigger('click');
        await flushPromises();

        expect(wrapper.find('.toast').text()).toBe(conflictReason);
    });
});

describe('ShowDetailView — visibilità della serie', () => {
    it('mostra «Per tutti» come scelta corrente su una serie condivisa', async () => {
        const { store } = buildFakeStore(buildShow());
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        const buttons = wrapper.findAll('.visibility-choice');
        expect(buttons[0]?.attributes('aria-pressed')).toBe('true');
        expect(buttons[1]?.attributes('aria-pressed')).toBe('false');
    });

    it('passando a «Solo per me» la serie diventa privata del profilo attivo', async () => {
        const { store, getShow } = buildFakeStore(buildShow());
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        await wrapper.findAll('.visibility-choice')[1]?.trigger('click');
        await flushPromises();

        expect(getShow()?.visibility).toBe('private');
        expect(getShow()?.privateFor).toBe(FABIO);
    });

    it('passando a «Per tutti» mostra il suggerimento come messaggio effimero, senza eseguire alcun reset', async () => {
        const privateShow = withPrivateVisibility(buildShow(), FABIO);
        const { store, getShow } = buildFakeStore(privateShow);
        const resetProgressSpy = vi.spyOn(store, 'resetProgress');
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        await wrapper.findAll('.visibility-choice')[0]?.trigger('click');
        await flushPromises();

        expect(wrapper.find('.toast').text()).toBe(
            'Ora “Serie di prova” è visibile a entrambi. Se volete ripartire da una puntata vista insieme, usate «Azzera tracciamento».'
        );
        expect(resetProgressSpy).not.toHaveBeenCalled();
        expect(getShow()?.visibility).toBe('shared');
    });
});

describe('ShowDetailView — azzeramento del tracciamento', () => {
    it('apre il dialogo con il picker e la conferma nella variante rossa', async () => {
        const { store } = buildFakeStore(buildShow());
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        await wrapper.find('.reset').trigger('click');

        const dialog = findResetDialog(wrapper);
        expect(dialog.find('.position-picker').exists()).toBe(true);
        expect(dialog.find('.accept-confirm--danger').exists()).toBe(true);
    });

    it('annullando il dialogo di reset nulla cambia', async () => {
        const show = buildShow({ lastWatchedEpisodeId: 's1e1', lastViewedAt: '2026-01-15T00:00:00Z', progressRevision: 1 });
        const { store, getShow } = buildFakeStore(show);
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();
        const before = getShow();

        await wrapper.find('.reset').trigger('click');
        await findResetDialog(wrapper).find('.cancel-confirm').trigger('click');
        await flushPromises();

        expect(getShow()).toEqual(before);
    });

    it('confermando il reset azzera la posizione e fa sparire «Annulla ultima conferma»', async () => {
        const show = buildShow({ lastWatchedEpisodeId: 's1e1', lastViewedAt: '2026-01-15T00:00:00Z', progressRevision: 1 });
        const { store, getShow } = buildFakeStore(show);
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();
        expect(wrapper.find('.undo').exists()).toBe(true);

        await wrapper.find('.reset').trigger('click');
        await findResetDialog(wrapper).find('.accept-confirm').trigger('click');
        await flushPromises();

        expect(getShow()?.lastWatchedEpisodeId).toBeUndefined();
        expect(getShow()?.lastViewedAt).toBeUndefined();
        expect(getShow()?.progressRevision).toBe(2);
        expect(wrapper.find('.undo').exists()).toBe(false);
    });
});

describe('ShowDetailView — serie privata dell\'altra persona aperta per indirizzo diretto', () => {
    it('la serie si vede normalmente', async () => {
        const privateShow = withPrivateVisibility(buildShow(), 'irene');
        const { store } = buildFakeStore(privateShow);
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        expect(wrapper.text()).toContain('Serie di prova');
        expect(wrapper.find('.visibility-choice[aria-pressed="true"]').text()).toBe('Solo per me');
    });
});

describe('ShowDetailView — comando di nascondere', () => {
    it('la nota compare solo sulle serie nascoste', async () => {
        const { store: listedStore } = buildFakeStore(buildShow());
        const listedWrapper = mountShowDetailView(buildDeps({ store: listedStore }));
        await flushPromises();

        expect(listedWrapper.find('.hidden-note').exists()).toBe(false);

        const { store: hiddenStore } = buildFakeStore(withHiddenShow(buildShow()));
        const hiddenWrapper = mountShowDetailView(buildDeps({ store: hiddenStore }));
        await flushPromises();

        expect(hiddenWrapper.find('.hidden-note').text()).toBe('Questa serie è nascosta dall\'elenco.');
    });

    it('il comando si inverte fra i due stati e chiama il composable col bersaglio giusto', async () => {
        const { store, getShow } = buildFakeStore(buildShow());
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        expect(wrapper.find('.listing').text()).toBe('Nascondi serie');

        await wrapper.find('.listing').trigger('click');
        await flushPromises();

        expect(getShow()?.hidden).toBe(true);
        expect(wrapper.find('.listing').text()).toBe('Riporta in elenco');

        await wrapper.find('.listing').trigger('click');
        await flushPromises();

        expect(getShow()?.hidden).toBeUndefined();
        expect(wrapper.find('.listing').text()).toBe('Nascondi serie');
    });

    it('premerlo non apre alcun dialogo di conferma', async () => {
        const { store } = buildFakeStore(buildShow());
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        await wrapper.find('.listing').trigger('click');
        await flushPromises();

        for (const dialog of wrapper.findAll('.confirm-dialog')) {
            expect((dialog.element as HTMLDialogElement).open).toBe(false);
        }
    });

    it('mostra il messaggio effimero corretto dopo aver nascosto la serie', async () => {
        const { store } = buildFakeStore(buildShow());
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        await wrapper.find('.listing').trigger('click');
        await flushPromises();

        expect(wrapper.find('.toast').text()).toBe(
            '“Serie di prova” è nascosta dall\'elenco. Puoi riportarla da qui o con «Mostra serie nascoste» nella home.'
        );
    });

    it('mostra il messaggio effimero corretto dopo aver riportato la serie in elenco', async () => {
        const { store } = buildFakeStore(withHiddenShow(buildShow()));
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        await wrapper.find('.listing').trigger('click');
        await flushPromises();

        expect(wrapper.find('.toast').text()).toBe('“Serie di prova” è di nuovo in elenco.');
    });

    it('il dettaglio di una serie nascosta aperto per indirizzo diretto si vede normalmente', async () => {
        const { store } = buildFakeStore(withHiddenShow(buildShow()));
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        expect(wrapper.text()).toContain('Serie di prova');
        expect(wrapper.find('.listing').text()).toBe('Riporta in elenco');
    });

    it('sceglie il messaggio in base al bersaglio del comando, non a uno stato riletto dopo l\'aggiornamento', async () => {
        let currentShow = buildShow();
        let subscriptionListener: TrackedShowListener | undefined;
        let resolveChangeListing: (outcome: ChangeListingOutcome) => void = () => {};
        const changeListingPromise = new Promise<ChangeListingOutcome>((resolve) => {
            resolveChangeListing = resolve;
        });
        const store: TrackedShowStore = {
            subscribeToTrackedShows: () => () => {},
            subscribeToShow: (showId, listener) => {
                subscriptionListener = listener;
                listener(currentShow.id === showId ? currentShow : undefined);
                return () => {};
            },
            addShow: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            updateCatalog: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            changeProvider: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            changeVisibility: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            changeListing: () => changeListingPromise,
            advanceProgress: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            undoLastProgress: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            resetProgress: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            removeShow: () => Promise.resolve({ outcome: 'rejected', reason: 'non usato' }),
            listAllProgressEvents: () => Promise.resolve([]),
            replaceAllShows: () => Promise.reject(new Error('non usato'))
        };
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        await wrapper.find('.listing').trigger('click');
        await flushPromises();

        resolveChangeListing({ outcome: 'changed' });
        await flushPromises();

        expect(wrapper.find('.toast').text()).toBe(
            '“Serie di prova” è nascosta dall\'elenco. Puoi riportarla da qui o con «Mostra serie nascoste» nella home.'
        );
        expect(wrapper.find('.listing').text()).toBe('Nascondi serie');

        currentShow = withHiddenShow(currentShow);
        subscriptionListener?.(currentShow);
        await flushPromises();

        expect(wrapper.find('.listing').text()).toBe('Riporta in elenco');
    });

    it('con dati non allineati non compare alcun comando di nascondere', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const brokenShow = buildShow({ lastWatchedEpisodeId: 'episodio-inesistente' });
        const { store } = buildFakeStore(brokenShow);
        const wrapper = mountShowDetailView(buildDeps({ store }));
        await flushPromises();

        expect(wrapper.find('.listing').exists()).toBe(false);
        expect(wrapper.find('.hidden-note').exists()).toBe(false);
        expect(wrapper.find('.reset').exists()).toBe(false);
        expect(wrapper.find('.danger').exists()).toBe(false);

        consoleErrorSpy.mockRestore();
    });
});
