// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, ref, type PropType } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRouter, createWebHistory } from 'vue-router';

import { APP_VERSION } from '@/appVersion';
import type { BackupImportSummary } from '@/backup/backupImport';
import type { CatalogSource, LoadShowOutcome } from '@/catalog/catalogSource';
import type { AddShowDeps } from '@/composables/useAddShow';
import type { UseBackup } from '@/composables/useBackup';
import type { Episode, ProgressOutcome, Season, TrackedShow } from '@/domain/trackedShow';
import type {
    AddShowOutcome,
    TrackedShowListener,
    TrackedShowsListener,
    TrackedShowStore,
    Unsubscribe
} from '@/persistence/trackedShowStore';

const testRouter = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', name: 'home', component: { template: '<div />' } },
        { path: '/serie/:id', name: 'show-detail', component: { template: '<div />' } }
    ]
});

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
        seasons: [buildSeason(1, [buildEpisode(1, 1, 'Episodio 1', '2020-01-01')])],
        italianProviders: [],
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides
    };
}

function buildStubStore(initialShows: readonly TrackedShow[]): TrackedShowStore {
    const notImplemented = (): Promise<never> => Promise.reject(new Error('non usato in questo test'));
    return {
        subscribeToTrackedShows(listener: TrackedShowsListener): Unsubscribe {
            listener(initialShows);
            return () => {};
        },
        subscribeToShow(_id: string, listener: TrackedShowListener): Unsubscribe {
            listener(undefined);
            return () => {};
        },
        addShow: (): Promise<AddShowOutcome> => Promise.resolve({ outcome: 'added' }),
        updateCatalog: notImplemented,
        changeProvider: notImplemented,
        changeVisibility: notImplemented,
        changeListing: notImplemented,
        advanceProgress: notImplemented,
        undoLastProgress: notImplemented,
        resetProgress: notImplemented,
        removeShow: notImplemented,
        listAllProgressEvents: notImplemented,
        replaceAllShows: notImplemented
    };
}

function buildStoreWithAdvanceableProgress(show: TrackedShow): TrackedShowStore {
    const notImplemented = (): Promise<never> => Promise.reject(new Error('non usato in questo test'));
    return {
        ...buildStubStore([show]),
        advanceProgress: (): Promise<ProgressOutcome> => Promise.resolve({
            outcome: 'applied',
            show: { ...show, lastWatchedEpisodeId: 's1e1' },
            event: {
                id: 'event-1',
                trackedShowId: show.id,
                confirmedEpisodeId: 's1e1',
                seasonNumber: 1,
                episodeNumber: 1,
                episodeTitle: 'Episodio 1',
                confirmedAt: '2026-03-01T09:00:00.000Z',
                confirmedBy: 'fabio'
            }
        }),
        undoLastProgress: notImplemented
    };
}

function buildBackupStubReadyToMergePartially(reason: string): UseBackup {
    const notImplemented = (): Promise<never> => Promise.reject(new Error('non usato in questo test'));
    const summary: BackupImportSummary = { totalInFile: 1, newCount: 1, alreadyPresentCount: 0, newerThanLocalCount: 0 };
    return {
        importReadiness: ref({ state: 'ready', summary, clockSkewWarning: 'non usato in questo test' }),
        exportBackup: notImplemented,
        prepareImport: notImplemented,
        confirmMerge: () => Promise.resolve({ outcome: 'partial', reason }),
        confirmReplace: notImplemented,
        cancelImport: () => {}
    };
}

function buildStubCatalogSource(): CatalogSource {
    const notImplemented = (): Promise<never> => Promise.reject(new Error('non usato in questo test'));
    return {
        searchShows: notImplemented,
        loadShow: (): Promise<LoadShowOutcome> => Promise.resolve({ outcome: 'unavailable', reason: 'non usato in questo test' }),
        loadItalianProviders: notImplemented
    };
}

vi.mock('@/persistence/currentTrackedShowStore', () => ({ currentTrackedShowStore: buildStubStore([]) }));
vi.mock('@/catalog/tmdbCatalogSource', () => ({ tmdbCatalogSource: buildStubCatalogSource() }));

const mountedWrappers: Array<VueWrapper> = [];

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
    vi.resetModules();
    globalThis.localStorage.clear();
});

describe('HomeView — stato vuoto', () => {
    it('mostra lo stato vuoto e il comando per caricare dati di esempio quando non ci sono serie', async () => {
        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.text()).toContain('Nessuna serie ancora');
        expect(wrapper.find('.load-sample').exists()).toBe(true);
        expect(wrapper.findAll('.show')).toHaveLength(0);
    });
});

describe('HomeView — numero di versione', () => {
    it('mostra il numero di versione dell\'app in fondo alla pagina', async () => {
        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.find('.app-version').text()).toBe(APP_VERSION);
    });
});

describe('HomeView — pulsante Aggiorna del sommario', () => {
    it('richiede lo stesso avviso condiviso usato dal pulsante dell\'intestazione', async () => {
        const { default: HomeView } = await import('./HomeView.vue');
        const { refreshNotice } = await import('@/composables/useRefreshNotice');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        await wrapper.find('.refresh').trigger('click');
        await flushPromises();

        expect(refreshNotice.message.value).toBe('Nessuna serie da aggiornare.');
    });
});

describe('HomeView — elenco delle serie', () => {
    it('mostra una card per ogni serie seguita quando la lista non è vuota', async () => {
        vi.resetModules();
        vi.doMock('@/persistence/currentTrackedShowStore', () => ({
            currentTrackedShowStore: buildStubStore([buildShow()])
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.findAll('.show')).toHaveLength(1);
        expect(wrapper.text()).toContain('Serie di prova');
        expect(wrapper.find('.empty-state').exists()).toBe(false);

        vi.doUnmock('@/persistence/currentTrackedShowStore');
    });
});

describe('HomeView — pulsante Aggiorna disabilitato durante l\'aggiornamento', () => {
    it('disabilita il pulsante mentre l\'aggiornamento è in corso e lo riabilita al termine', async () => {
        vi.resetModules();
        let resolvePendingLoad: (outcome: LoadShowOutcome) => void = () => {};
        const pendingLoad = new Promise<LoadShowOutcome>((resolve) => {
            resolvePendingLoad = resolve;
        });
        vi.doMock('@/persistence/currentTrackedShowStore', () => ({
            currentTrackedShowStore: buildStubStore([buildShow()])
        }));
        vi.doMock('@/catalog/tmdbCatalogSource', () => ({
            tmdbCatalogSource: {
                searchShows: (): Promise<never> => Promise.reject(new Error('non usato in questo test')),
                loadShow: (): Promise<LoadShowOutcome> => pendingLoad,
                loadItalianProviders: (): Promise<never> => Promise.reject(new Error('non usato in questo test'))
            } satisfies CatalogSource
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        void wrapper.find('.refresh').trigger('click');
        await flushPromises();
        expect(wrapper.find('.refresh').attributes('disabled')).toBeDefined();

        resolvePendingLoad({ outcome: 'missing' });
        await flushPromises();
        expect(wrapper.find('.refresh').attributes('disabled')).toBeUndefined();

        vi.doUnmock('@/persistence/currentTrackedShowStore');
        vi.doUnmock('@/catalog/tmdbCatalogSource');
    });
});

describe('HomeView — senza rete (criterio 9)', () => {
    it('mostra la lista e permette di avanzare la posizione anche quando il catalogo remoto non è raggiungibile', async () => {
        vi.resetModules();
        const show = buildShow();
        vi.doMock('@/persistence/currentTrackedShowStore', () => ({
            currentTrackedShowStore: buildStoreWithAdvanceableProgress(show)
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.findAll('.show')).toHaveLength(1);

        await wrapper.find('.primary').trigger('click');
        await flushPromises();
        await wrapper.find('.accept-confirm').trigger('click');
        await flushPromises();

        expect(wrapper.text()).toContain('Puntata e precedenti segnate come viste.');

        vi.doUnmock('@/persistence/currentTrackedShowStore');
    });
});

describe('HomeView — visibilità delle serie completate', () => {
    it('mostra il pulsante con etichetta e conteggio corretti, e rivela le completate nascoste al click', async () => {
        vi.resetModules();
        const completedShow = buildShow({
            id: 'completata',
            providerShowId: 'p-completata',
            title: 'Serie completata',
            lastWatchedEpisodeId: 's1e1'
        });
        vi.doMock('@/persistence/currentTrackedShowStore', () => ({
            currentTrackedShowStore: buildStubStore([completedShow])
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.text()).toContain('In base ai filtri impostati la lista è vuota');
        expect(wrapper.find('.completed-toggle').text()).toBe('Mostra completate');
        expect(wrapper.findAll('.show')).toHaveLength(0);

        await wrapper.find('.completed-toggle').trigger('click');
        await flushPromises();

        expect(wrapper.find('.completed-toggle').text()).toBe('Nascondi completate');
        expect(wrapper.findAll('.show')).toHaveLength(1);

        vi.doUnmock('@/persistence/currentTrackedShowStore');
    });

    it('non mostra il pulsante quando non esiste alcuna serie completata', async () => {
        vi.resetModules();
        vi.doMock('@/persistence/currentTrackedShowStore', () => ({
            currentTrackedShowStore: buildStubStore([buildShow()])
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.find('.completed-toggle').exists()).toBe(false);

        vi.doUnmock('@/persistence/currentTrackedShowStore');
    });

    it('mantiene visibili i controlli anche quando il filtro nasconde tutte le serie', async () => {
        vi.resetModules();
        const completedShow = buildShow({
            id: 'completata',
            providerShowId: 'p-completata',
            title: 'Serie completata',
            lastWatchedEpisodeId: 's1e1'
        });
        vi.doMock('@/persistence/currentTrackedShowStore', () => ({
            currentTrackedShowStore: buildStubStore([completedShow])
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.text()).toContain('In base ai filtri impostati la lista è vuota');
        expect(wrapper.find('#sortMode').exists()).toBe(true);
        expect(wrapper.find('.completed-toggle').exists()).toBe(true);

        vi.doUnmock('@/persistence/currentTrackedShowStore');
    });
});

describe('HomeView — lente di visibilità (criteri 3, 6, 7, 21)', () => {
    it('mostra il controllo della lente accanto a «Mostra completate» quando ci sono serie', async () => {
        vi.resetModules();
        vi.doMock('@/persistence/currentTrackedShowStore', () => ({
            currentTrackedShowStore: buildStubStore([buildShow()])
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        const labels = wrapper.findAll('.scope-option').map((button) => button.text());
        expect(labels).toEqual(['Tutto', 'Solo le mie']);

        vi.doUnmock('@/persistence/currentTrackedShowStore');
    });

    it('mantiene il controllo della lente visibile e mostra lo stato vuoto unico quando la lente svuota la lista, recuperabile tornando a «Tutto»', async () => {
        vi.resetModules();
        globalThis.localStorage.setItem('tv-tracker:show-scope', 'mine');
        vi.doMock('@/persistence/currentTrackedShowStore', () => ({
            currentTrackedShowStore: buildStubStore([buildShow()])
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.findAll('.scope-option')).toHaveLength(2);
        expect(wrapper.text()).toContain('In base ai filtri impostati la lista è vuota');
        expect(wrapper.text()).not.toContain('Nessuna serie ancora');
        expect(wrapper.findAll('.show')).toHaveLength(0);

        await wrapper.findAll('.scope-option')[0]?.trigger('click');
        await flushPromises();

        expect(wrapper.findAll('.show')).toHaveLength(1);

        vi.doUnmock('@/persistence/currentTrackedShowStore');
    });

    it('mostra lo stesso stato vuoto sia quando la causa è la lente sia quando è il filtro delle completate', async () => {
        vi.resetModules();
        globalThis.localStorage.setItem('tv-tracker:show-scope', 'mine');
        const myCompletedPrivateShow = buildShow({
            id: 'mia-privata-completata',
            providerShowId: 'p-mia-privata-completata',
            title: 'Mia privata completata',
            visibility: 'private',
            privateFor: '',
            lastWatchedEpisodeId: 's1e1'
        });
        vi.doMock('@/persistence/currentTrackedShowStore', () => ({
            currentTrackedShowStore: buildStubStore([myCompletedPrivateShow])
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.text()).toContain('In base ai filtri impostati la lista è vuota');
        expect(wrapper.find('.completed-toggle').exists()).toBe(true);

        await wrapper.find('.completed-toggle').trigger('click');
        await flushPromises();

        expect(wrapper.findAll('.show')).toHaveLength(1);

        vi.doUnmock('@/persistence/currentTrackedShowStore');
    });
});

describe('HomeView — serie nascoste (criteri 7, 8, 10, 11)', () => {
    it('non mostra il pulsante «Mostra nascoste» quando non esiste alcuna serie nascosta', async () => {
        vi.resetModules();
        vi.doMock('@/persistence/currentTrackedShowStore', () => ({
            currentTrackedShowStore: buildStubStore([buildShow()])
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.find('.hidden-toggle').exists()).toBe(false);

        vi.doUnmock('@/persistence/currentTrackedShowStore');
    });

    it('mostra il pulsante quando esiste una nascosta in lente, e rivela la serie marcata «Nascosta» al click', async () => {
        vi.resetModules();
        const hiddenShow = buildShow({
            id: 'nascosta',
            providerShowId: 'p-nascosta',
            title: 'Serie nascosta',
            hidden: true
        });
        vi.doMock('@/persistence/currentTrackedShowStore', () => ({
            currentTrackedShowStore: buildStubStore([hiddenShow])
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.find('.hidden-toggle').text()).toBe('Mostra nascoste');
        expect(wrapper.findAll('.show')).toHaveLength(0);

        await wrapper.find('.hidden-toggle').trigger('click');
        await flushPromises();

        expect(wrapper.find('.hidden-toggle').text()).toBe('Nascondi di nuovo');
        expect(wrapper.findAll('.show')).toHaveLength(1);
        expect(wrapper.find('.hidden-marker').text()).toBe('Nascosta');

        vi.doUnmock('@/persistence/currentTrackedShowStore');
    });

    it('mostra lo stato vuoto unico quando è tutto nascosto, con i controlli premibili', async () => {
        vi.resetModules();
        const hiddenShow = buildShow({
            id: 'nascosta',
            providerShowId: 'p-nascosta',
            title: 'Serie nascosta',
            hidden: true
        });
        vi.doMock('@/persistence/currentTrackedShowStore', () => ({
            currentTrackedShowStore: buildStubStore([hiddenShow])
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.text()).toContain('In base ai filtri impostati la lista è vuota');
        expect(wrapper.text()).toContain('Mostra nascoste');
        expect(wrapper.find('#sortMode').exists()).toBe(true);
        expect(wrapper.find('.hidden-toggle').exists()).toBe(true);

        await wrapper.find('.hidden-toggle').trigger('click');
        await flushPromises();

        expect(wrapper.findAll('.show')).toHaveLength(1);

        vi.doUnmock('@/persistence/currentTrackedShowStore');
    });

    it('una serie nascosta e completata compare solo con entrambi i filtri accesi (§5)', async () => {
        vi.resetModules();
        const hiddenCompletedShow = buildShow({
            id: 'nascosta-completata',
            providerShowId: 'p-nascosta-completata',
            title: 'Serie nascosta e completata',
            hidden: true,
            lastWatchedEpisodeId: 's1e1'
        });
        vi.doMock('@/persistence/currentTrackedShowStore', () => ({
            currentTrackedShowStore: buildStubStore([hiddenCompletedShow])
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.find('.completed-toggle').exists()).toBe(false);
        expect(wrapper.find('.hidden-toggle').exists()).toBe(true);
        expect(wrapper.findAll('.show')).toHaveLength(0);

        await wrapper.find('.hidden-toggle').trigger('click');
        await flushPromises();

        expect(wrapper.find('.completed-toggle').exists()).toBe(true);
        expect(wrapper.findAll('.show')).toHaveLength(0);

        await wrapper.find('.completed-toggle').trigger('click');
        await flushPromises();

        expect(wrapper.findAll('.show')).toHaveLength(1);

        vi.doUnmock('@/persistence/currentTrackedShowStore');
    });

    it('mostra uno stato vuoto generico quando una nascosta e una completata diverse svuotano la lista insieme', async () => {
        vi.resetModules();
        const hiddenShow = buildShow({
            id: 'nascosta',
            providerShowId: 'p-nascosta',
            title: 'Serie nascosta',
            hidden: true
        });
        const completedShow = buildShow({
            id: 'completata',
            providerShowId: 'p-completata',
            title: 'Serie completata',
            lastWatchedEpisodeId: 's1e1'
        });
        vi.doMock('@/persistence/currentTrackedShowStore', () => ({
            currentTrackedShowStore: buildStubStore([hiddenShow, completedShow])
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.text()).toContain('In base ai filtri impostati la lista è vuota');
        expect(wrapper.find('.hidden-toggle').exists()).toBe(true);
        expect(wrapper.find('.completed-toggle').exists()).toBe(true);
        expect(wrapper.findAll('.show')).toHaveLength(0);

        await wrapper.find('.hidden-toggle').trigger('click');
        await flushPromises();

        expect(wrapper.findAll('.show')).toHaveLength(1);
        expect(wrapper.text()).toContain('Serie nascosta');

        await wrapper.find('.completed-toggle').trigger('click');
        await flushPromises();

        expect(wrapper.findAll('.show')).toHaveLength(2);

        vi.doUnmock('@/persistence/currentTrackedShowStore');
    });
});

describe('HomeView — cablaggio del duplicato nascosto nel dialogo di aggiunta (criterio 12)', () => {
    it('passa a AddShowDialog l\'insieme, calcolato da useTrackedShows, delle serie con tutte le schede nascoste', async () => {
        vi.resetModules();
        const hiddenShow = buildShow({
            id: 'nascosta',
            providerShowId: 'p-nascosta',
            title: 'Serie nascosta',
            hidden: true
        });
        vi.doMock('@/persistence/currentTrackedShowStore', () => ({
            currentTrackedShowStore: buildStubStore([hiddenShow])
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const AddShowDialogStub = defineComponent({
            props: { open: Boolean, deps: { type: Object as PropType<AddShowDeps | undefined>, default: undefined } },
            setup(props) {
                return () => {
                    const isFullyHiddenDuplicate = props.deps?.fullyHiddenProviderShowIds?.value.has('p-nascosta') ?? false;
                    return h('div', { class: 'add-dialog-stub' }, String(isFullyHiddenDuplicate));
                };
            }
        });
        const wrapper = mount(HomeView, {
            global: { plugins: [testRouter], stubs: { AddShowDialog: AddShowDialogStub } }
        });
        mountedWrappers.push(wrapper);
        await flushPromises();

        expect(wrapper.find('.add-dialog-stub').text()).toBe('true');

        vi.doUnmock('@/persistence/currentTrackedShowStore');
    });
});

describe('HomeView — importazione di backup con esito parziale', () => {
    it('mostra il motivo dell\'esito parziale invece del messaggio di riuscita piena', async () => {
        vi.resetModules();
        const partialReason = 'Sincronizzate 8 serie su 10: le altre verranno riprovate al prossimo tentativo.';
        vi.doMock('@/composables/useBackup', () => ({
            useBackup: (): UseBackup => buildBackupStubReadyToMergePartially(partialReason)
        }));

        const { default: HomeView } = await import('./HomeView.vue');
        const wrapper = mount(HomeView, { global: { plugins: [testRouter] } });
        mountedWrappers.push(wrapper);
        await flushPromises();

        await wrapper.find('.merge').trigger('click');
        await flushPromises();

        expect(wrapper.text()).toContain(partialReason);
        expect(wrapper.text()).not.toContain('Backup unito alle serie locali.');

        vi.doUnmock('@/composables/useBackup');
    });
});
