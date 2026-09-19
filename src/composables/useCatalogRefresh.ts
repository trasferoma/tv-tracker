import { computed, ref, type ComputedRef, type Ref } from 'vue';

import type { CatalogSource } from '@/catalog/catalogSource';
import { tmdbCatalogSource } from '@/catalog/tmdbCatalogSource';
import { mergeCatalogUpdate } from '@/domain/catalogMerge';
import type { TrackedShow } from '@/domain/trackedShow';
import { currentTrackedShowStore } from '@/persistence/currentTrackedShowStore';
import type { TrackedShowStore, Unsubscribe } from '@/persistence/trackedShowStore';
import { formatLastRefreshLabel } from '@/presentation/italianFormat';
import { runIgnoringStorageFailure } from '@/storageFailure';

const BACKGROUND_REFRESH_THRESHOLD_MS = 12 * 60 * 60 * 1000;
const LAST_CHECKED_STORAGE_KEY = 'tv-tracker:catalog-last-checked-at';
const LAST_SUCCESSFUL_UPDATE_STORAGE_KEY = 'tv-tracker:catalog-last-successful-update-at';

export type CatalogRefreshOutcome =
    | { readonly outcome: 'updated' }
    | { readonly outcome: 'noShows' }
    | { readonly outcome: 'unavailable'; readonly reason: string };

type ShowRefreshResult =
    | { readonly kind: 'updated' }
    | { readonly kind: 'missing' }
    | { readonly kind: 'failed'; readonly reason: string };

export interface CatalogRefreshDeps {
    readonly store?: TrackedShowStore;
    readonly catalogSource?: CatalogSource;
    readonly resolveNow?: () => string;
    readonly isOnline?: () => boolean;
    readonly backgroundThresholdMs?: number;
}

export interface UseCatalogRefresh {
    readonly isRefreshing: Ref<boolean>;
    readonly lastCheckedLabel: ComputedRef<string>;
    refreshManually(): Promise<CatalogRefreshOutcome>;
    checkBackgroundRefresh(): Promise<void>;
}

export function createCatalogRefresh(deps: CatalogRefreshDeps = {}): UseCatalogRefresh {
    const store = deps.store ?? currentTrackedShowStore;
    const catalogSource = deps.catalogSource ?? tmdbCatalogSource;
    const resolveNow = deps.resolveNow ?? (() => new Date().toISOString());
    const isOnline = deps.isOnline ?? (() => navigator.onLine);
    const backgroundThresholdMs = deps.backgroundThresholdMs ?? BACKGROUND_REFRESH_THRESHOLD_MS;

    const isRefreshing = ref(false);
    const lastCheckedAt = ref<string>();
    lastCheckedAt.value = loadTimestamp(LAST_CHECKED_STORAGE_KEY);
    const lastSuccessfulUpdateAt = ref<string>();
    lastSuccessfulUpdateAt.value = loadTimestamp(LAST_SUCCESSFUL_UPDATE_STORAGE_KEY);

    const lastCheckedLabel = computed(() => formatLastRefreshLabel(lastSuccessfulUpdateAt.value, resolveNow()));

    async function refreshManually(): Promise<CatalogRefreshOutcome> {
        return performRefresh();
    }

    async function checkBackgroundRefresh(): Promise<void> {
        if (!isOnline() || !isCheckDue(lastCheckedAt.value, backgroundThresholdMs, resolveNow())) {
            return;
        }
        await performRefresh();
    }

    async function performRefresh(): Promise<CatalogRefreshOutcome> {
        isRefreshing.value = true;
        try {
            const shows = await listCurrentShows(store);
            recordCheckAttempt();
            const outcome = await refreshShows(shows);
            if (outcome.outcome !== 'unavailable') {
                recordSuccessfulUpdate();
            }
            return outcome;
        } finally {
            isRefreshing.value = false;
        }
    }

    async function refreshShows(shows: readonly TrackedShow[]): Promise<CatalogRefreshOutcome> {
        if (shows.length === 0) {
            return { outcome: 'noShows' };
        }
        const results = await Promise.all(shows.map((show) => refreshOneShow(show)));
        return summarizeResults(results);
    }

    async function refreshOneShow(show: TrackedShow): Promise<ShowRefreshResult> {
        const loadOutcome = await catalogSource.loadShow(show.providerShowId);
        if (loadOutcome.outcome === 'unavailable') {
            return { kind: 'failed', reason: loadOutcome.reason };
        }
        if (loadOutcome.outcome === 'missing') {
            return { kind: 'missing' };
        }
        const mergeOutcome = mergeCatalogUpdate(show, loadOutcome.show, resolveNow());
        if (mergeOutcome.outcome === 'rejected') {
            return { kind: 'failed', reason: mergeOutcome.reason };
        }
        const updateOutcome = await store.updateCatalog(mergeOutcome.show);
        if (updateOutcome.outcome === 'rejected') {
            return { kind: 'failed', reason: updateOutcome.reason };
        }
        return { kind: 'updated' };
    }

    function recordCheckAttempt(): void {
        lastCheckedAt.value = resolveNow();
        saveTimestamp(LAST_CHECKED_STORAGE_KEY, lastCheckedAt.value);
    }

    function recordSuccessfulUpdate(): void {
        lastSuccessfulUpdateAt.value = resolveNow();
        saveTimestamp(LAST_SUCCESSFUL_UPDATE_STORAGE_KEY, lastSuccessfulUpdateAt.value);
    }

    return { isRefreshing, lastCheckedLabel, refreshManually, checkBackgroundRefresh };
}

function summarizeResults(results: readonly ShowRefreshResult[]): CatalogRefreshOutcome {
    const failures = results.filter((result): result is Extract<ShowRefreshResult, { kind: 'failed' }> =>
        result.kind === 'failed');
    const allFailed = failures.length === results.length;
    if (allFailed) {
        return { outcome: 'unavailable', reason: failures[0]!.reason };
    }
    return { outcome: 'updated' };
}

function isCheckDue(lastCheckedAt: string | undefined, thresholdMs: number, now: string): boolean {
    if (lastCheckedAt === undefined) {
        return true;
    }
    const elapsedMs = new Date(now).getTime() - new Date(lastCheckedAt).getTime();
    return elapsedMs >= thresholdMs;
}

function listCurrentShows(store: TrackedShowStore): Promise<readonly TrackedShow[]> {
    return new Promise((resolve) => {
        const unsubscribe: Unsubscribe = store.subscribeToTrackedShows((shows) => {
            resolve(shows);
            queueMicrotask(() => unsubscribe());
        });
    });
}

function loadTimestamp(storageKey: string): string | undefined {
    return runIgnoringStorageFailure(() => globalThis.localStorage.getItem(storageKey) ?? undefined, undefined);
}

function saveTimestamp(storageKey: string, value: string): void {
    runIgnoringStorageFailure(() => globalThis.localStorage.setItem(storageKey, value), undefined);
}

export const catalogRefresh = createCatalogRefresh();

export function useCatalogRefresh(): UseCatalogRefresh {
    return catalogRefresh;
}
