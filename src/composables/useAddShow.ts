import { computed, onUnmounted, ref, type ComputedRef, type Ref } from 'vue';

import type {
    CatalogSearchResult,
    CatalogShow,
    CatalogSource,
    LoadShowOutcome,
    SearchShowsOutcome
} from '@/catalog/catalogSource';
import { tmdbCatalogSource } from '@/catalog/tmdbCatalogSource';
import { mergeAnnouncedEpisode } from '@/domain/catalogMerge';
import { buildEpisodeSequence } from '@/domain/episodeOrder';
import { generateId } from '@/domain/identity';
import type { Episode, ItalianProvider, TrackedShow } from '@/domain/trackedShow';
import { currentTrackedShowStore } from '@/persistence/currentTrackedShowStore';
import type { AddShowOutcome, TrackedShowStore } from '@/persistence/trackedShowStore';

const SEARCH_DEBOUNCE_MS = 500;
const SHOW_UNAVAILABLE_REASON = 'Questa serie non è più disponibile nel catalogo.';
const DUPLICATE_SHOW_REASON = 'Questa serie è già stata aggiunta.';

export type AddShowStep = 'search' | 'provider' | 'position';

export interface SearchResultItem {
    readonly providerShowId: string;
    readonly title: string;
    readonly originalTitle: string;
    readonly year: number | undefined;
    readonly posterUrl: string | undefined;
}

export type SearchStatus =
    | { readonly kind: 'idle' }
    | { readonly kind: 'searching' }
    | { readonly kind: 'results'; readonly results: readonly SearchResultItem[] }
    | { readonly kind: 'noResults' }
    | { readonly kind: 'unavailable'; readonly reason: string };

export type InitialPositionChoice =
    | { readonly kind: 'notStarted' }
    | { readonly kind: 'watchedThrough'; readonly episodeId: string };

export interface SelectedShowView {
    readonly title: string;
    readonly year: number | undefined;
    readonly posterUrl: string | undefined;
    readonly providers: readonly ItalianProvider[];
    readonly episodes: readonly Episode[];
}

export interface AddShowDeps {
    readonly store?: TrackedShowStore;
    readonly catalogSource?: CatalogSource;
    readonly resolveNow?: () => string;
    readonly debounceMs?: number;
    readonly trackedProviderShowIds?: { readonly value: ReadonlySet<string> };
}

export interface UseAddShow {
    readonly step: Ref<AddShowStep>;
    readonly query: Ref<string>;
    readonly searchStatus: Ref<SearchStatus>;
    readonly isLoadingSelection: Ref<boolean>;
    readonly selectedShow: ComputedRef<SelectedShowView | undefined>;
    readonly selectedProviderId: Ref<string | undefined>;
    readonly initialPosition: Ref<InitialPositionChoice>;
    readonly isSaving: Ref<boolean>;
    readonly saveError: Ref<string | undefined>;
    setQuery(value: string): void;
    chooseResult(result: SearchResultItem): Promise<void>;
    chooseProvider(providerId: string | undefined): void;
    setInitialPosition(position: InitialPositionChoice): void;
    backToSearch(): void;
    save(): Promise<AddShowOutcome | undefined>;
    reset(): void;
}

interface SelectedShowState {
    readonly catalogShow: CatalogShow;
    readonly searchResult: SearchResultItem;
    readonly providers: readonly ItalianProvider[];
    readonly episodes: readonly Episode[];
}

export function useAddShow(deps: AddShowDeps = {}): UseAddShow {
    const store = deps.store ?? currentTrackedShowStore;
    const catalogSource = deps.catalogSource ?? tmdbCatalogSource;
    const resolveNow = deps.resolveNow ?? (() => new Date().toISOString());
    const debounceMs = deps.debounceMs ?? SEARCH_DEBOUNCE_MS;
    const trackedProviderShowIds = deps.trackedProviderShowIds ?? { value: new Set<string>() };

    const step = ref<AddShowStep>('search');
    const query = ref('');
    const searchStatus = ref<SearchStatus>({ kind: 'idle' });
    const isLoadingSelection = ref(false);
    const selectedShowState = ref<SelectedShowState>();
    const selectedProviderId = ref<string>();
    const initialPosition = ref<InitialPositionChoice>({ kind: 'notStarted' });
    const isSaving = ref(false);
    const saveError = ref<string>();

    let debounceHandle: ReturnType<typeof setTimeout> | undefined;

    onUnmounted(() => {
        clearPendingSearch();
    });

    const selectedShow = computed<SelectedShowView | undefined>(() => toSelectedShowView(selectedShowState.value));

    function clearPendingSearch(): void {
        if (debounceHandle !== undefined) {
            clearTimeout(debounceHandle);
            debounceHandle = undefined;
        }
    }

    function setQuery(value: string): void {
        query.value = value;
        clearPendingSearch();
        const trimmedQuery = value.trim();
        if (trimmedQuery === '') {
            searchStatus.value = { kind: 'idle' };
            return;
        }
        debounceHandle = setTimeout(() => {
            void runSearch(trimmedQuery);
        }, debounceMs);
    }

    async function runSearch(trimmedQuery: string): Promise<void> {
        searchStatus.value = { kind: 'searching' };
        const outcome = await catalogSource.searchShows(trimmedQuery);
        searchStatus.value = toSearchStatus(outcome);
    }

    async function chooseResult(result: SearchResultItem): Promise<void> {
        clearPendingSearch();
        if (isAlreadyTracked(result.providerShowId)) {
            rejectSelection(DUPLICATE_SHOW_REASON);
            return;
        }
        step.value = 'provider';
        isLoadingSelection.value = true;
        selectedShowState.value = undefined;
        const loadShowPromise = catalogSource.loadShow(result.providerShowId);
        const loadProvidersPromise = loadProviders(result.providerShowId);
        const [loadShowOutcome, providers] = await Promise.all([loadShowPromise, loadProvidersPromise]);
        isLoadingSelection.value = false;
        if (loadShowOutcome.outcome !== 'found') {
            const reason = resolveLoadShowError(loadShowOutcome);
            rejectSelection(reason);
            return;
        }
        const episodes = buildEpisodeSequence(loadShowOutcome.show);
        selectedShowState.value = { catalogShow: loadShowOutcome.show, searchResult: result, providers, episodes };
        selectedProviderId.value = providers.length === 1 ? providers[0]?.id : undefined;
    }

    function isAlreadyTracked(providerShowId: string): boolean {
        return trackedProviderShowIds.value.has(providerShowId);
    }

    async function loadProviders(providerShowId: string): Promise<readonly ItalianProvider[]> {
        const outcome = await catalogSource.loadItalianProviders(providerShowId);
        return outcome.outcome === 'loaded' ? outcome.providers : [];
    }

    function rejectSelection(reason: string): void {
        step.value = 'search';
        searchStatus.value = { kind: 'unavailable', reason };
    }

    function chooseProvider(providerId: string | undefined): void {
        selectedProviderId.value = providerId;
        step.value = 'position';
    }

    function setInitialPosition(position: InitialPositionChoice): void {
        initialPosition.value = position;
    }

    function backToSearch(): void {
        step.value = 'search';
        selectedShowState.value = undefined;
        selectedProviderId.value = undefined;
        initialPosition.value = { kind: 'notStarted' };
        saveError.value = undefined;
    }

    async function save(): Promise<AddShowOutcome | undefined> {
        const current = selectedShowState.value;
        if (current === undefined) {
            return undefined;
        }
        isSaving.value = true;
        saveError.value = undefined;
        const selectedProvider = current.providers.find((provider) => provider.id === selectedProviderId.value);
        const now = resolveNow();
        const show = buildTrackedShow(current, selectedProvider, initialPosition.value, now);
        const outcome = await store.addShow(show);
        isSaving.value = false;
        if (outcome.outcome === 'rejected') {
            saveError.value = outcome.reason;
            return outcome;
        }
        reset();
        return outcome;
    }

    function reset(): void {
        clearPendingSearch();
        query.value = '';
        searchStatus.value = { kind: 'idle' };
        backToSearch();
    }

    return {
        step,
        query,
        searchStatus,
        isLoadingSelection,
        selectedShow,
        selectedProviderId,
        initialPosition,
        isSaving,
        saveError,
        setQuery,
        chooseResult,
        chooseProvider,
        setInitialPosition,
        backToSearch,
        save,
        reset
    };
}

function toSelectedShowView(state: SelectedShowState | undefined): SelectedShowView | undefined {
    if (state === undefined) {
        return undefined;
    }
    return {
        title: state.searchResult.title,
        year: state.searchResult.year,
        posterUrl: state.searchResult.posterUrl,
        providers: state.providers,
        episodes: state.episodes
    };
}

function toSearchResultItem(result: CatalogSearchResult): SearchResultItem {
    return {
        providerShowId: result.providerShowId,
        title: result.title,
        originalTitle: result.originalTitle,
        year: result.year,
        posterUrl: result.posterUrl
    };
}

function toSearchStatus(outcome: SearchShowsOutcome): SearchStatus {
    if (outcome.outcome === 'unavailable') {
        return { kind: 'unavailable', reason: outcome.reason };
    }
    if (outcome.results.length === 0) {
        return { kind: 'noResults' };
    }
    return { kind: 'results', results: outcome.results.map(toSearchResultItem) };
}

function resolveLoadShowError(outcome: LoadShowOutcome): string {
    return outcome.outcome === 'unavailable' ? outcome.reason : SHOW_UNAVAILABLE_REASON;
}

function buildTrackedShow(
    selection: SelectedShowState,
    selectedProvider: ItalianProvider | undefined,
    initialPosition: InitialPositionChoice,
    now: string
): TrackedShow {
    return {
        id: generateId(),
        catalogProvider: selection.catalogShow.catalogProvider,
        providerShowId: selection.catalogShow.providerShowId,
        title: selection.catalogShow.title,
        seriesPosterUrl: selection.catalogShow.seriesPosterUrl,
        status: selection.catalogShow.status,
        seasons: mergeAnnouncedEpisode(selection.catalogShow),
        italianProviders: selection.providers,
        selectedStreamingProviderId: selectedProvider?.id,
        selectedStreamingProviderName: selectedProvider?.name,
        lastWatchedEpisodeId: initialPosition.kind === 'watchedThrough' ? initialPosition.episodeId : undefined,
        progressRevision: 0,
        addedAt: now,
        catalogUpdatedAt: now,
        updatedAt: now
    };
}
