import { ref, watch, type Ref } from 'vue';

import { runIgnoringStorageFailure } from '@/storageFailure';

const COMPLETED_VISIBILITY_STORAGE_KEY = 'tv-tracker:show-completed';
const DEFAULT_SHOW_COMPLETED = false;

export interface CompletedVisibilityPreference {
    readonly showCompleted: Ref<boolean>;
}

export function useCompletedVisibilityPreference(): CompletedVisibilityPreference {
    const showCompleted = ref<boolean>(loadSavedShowCompleted());
    watch(showCompleted, (newValue) => saveShowCompleted(newValue), { flush: 'sync' });
    return { showCompleted };
}

function loadSavedShowCompleted(): boolean {
    return runIgnoringStorageFailure(() => {
        const savedValue = globalThis.localStorage.getItem(COMPLETED_VISIBILITY_STORAGE_KEY);
        return savedValue !== null && isStoredBoolean(savedValue) ? savedValue === 'true' : DEFAULT_SHOW_COMPLETED;
    }, DEFAULT_SHOW_COMPLETED);
}

function saveShowCompleted(showCompleted: boolean): void {
    const storedValue = String(showCompleted);
    runIgnoringStorageFailure(
        () => globalThis.localStorage.setItem(COMPLETED_VISIBILITY_STORAGE_KEY, storedValue),
        undefined
    );
}

function isStoredBoolean(value: string): value is 'true' | 'false' {
    return value === 'true' || value === 'false';
}
