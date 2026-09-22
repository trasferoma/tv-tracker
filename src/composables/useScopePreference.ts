import { ref, watch, type Ref } from 'vue';

import type { ShowScope } from '@/domain/showVisibility';
import { runIgnoringStorageFailure } from '@/storageFailure';

const SCOPE_PREFERENCE_STORAGE_KEY = 'tv-tracker:show-scope';
const DEFAULT_SHOW_SCOPE: ShowScope = 'all';
const VALID_SHOW_SCOPES: readonly ShowScope[] = ['all', 'mine'];

export interface ScopePreference {
    readonly scope: Ref<ShowScope>;
}

export function useScopePreference(): ScopePreference {
    const scope = ref<ShowScope>(loadSavedScope());
    watch(scope, (newScope) => saveScope(newScope), { flush: 'sync' });
    return { scope };
}

function loadSavedScope(): ShowScope {
    return runIgnoringStorageFailure(() => {
        const savedValue = globalThis.localStorage.getItem(SCOPE_PREFERENCE_STORAGE_KEY);
        return savedValue !== null && isShowScope(savedValue) ? savedValue : DEFAULT_SHOW_SCOPE;
    }, DEFAULT_SHOW_SCOPE);
}

function saveScope(scope: ShowScope): void {
    runIgnoringStorageFailure(() => globalThis.localStorage.setItem(SCOPE_PREFERENCE_STORAGE_KEY, scope), undefined);
}

function isShowScope(value: string): value is ShowScope {
    return (VALID_SHOW_SCOPES as readonly string[]).includes(value);
}
