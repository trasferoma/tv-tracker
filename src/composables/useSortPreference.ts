import { ref, watch, type Ref } from 'vue';

import type { ShowSortMode } from '@/domain/showSorting';
import { runIgnoringStorageFailure } from '@/storageFailure';

const SORT_PREFERENCE_STORAGE_KEY = 'tv-tracker:sort-preference';
const DEFAULT_SORT_MODE: ShowSortMode = 'activity';
const VALID_SORT_MODES: readonly ShowSortMode[] = ['activity', 'alphabetical', 'unwatched', 'added', 'nextEpisode'];

export interface SortPreference {
    readonly mode: Ref<ShowSortMode>;
}

export function useSortPreference(): SortPreference {
    const mode = ref<ShowSortMode>(loadSavedSortMode());
    watch(mode, (newMode) => saveSortMode(newMode), { flush: 'sync' });
    return { mode };
}

function loadSavedSortMode(): ShowSortMode {
    return runIgnoringStorageFailure(() => {
        const savedValue = globalThis.localStorage.getItem(SORT_PREFERENCE_STORAGE_KEY);
        return savedValue !== null && isShowSortMode(savedValue) ? savedValue : DEFAULT_SORT_MODE;
    }, DEFAULT_SORT_MODE);
}

function saveSortMode(mode: ShowSortMode): void {
    runIgnoringStorageFailure(() => globalThis.localStorage.setItem(SORT_PREFERENCE_STORAGE_KEY, mode), undefined);
}

function isShowSortMode(value: string): value is ShowSortMode {
    return (VALID_SORT_MODES as readonly string[]).includes(value);
}
