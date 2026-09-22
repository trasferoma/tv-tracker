import { ref, watch, type Ref } from 'vue';

import { runIgnoringStorageFailure } from '@/storageFailure';

const HIDDEN_SHOWS_STORAGE_KEY = 'tv-tracker:show-hidden';
const DEFAULT_SHOW_HIDDEN = false;

export interface HiddenShowsPreference {
    readonly showHidden: Ref<boolean>;
}

export function useHiddenShowsPreference(): HiddenShowsPreference {
    const showHidden = ref<boolean>(loadSavedShowHidden());
    watch(showHidden, (newValue) => saveShowHidden(newValue), { flush: 'sync' });
    return { showHidden };
}

function loadSavedShowHidden(): boolean {
    return runIgnoringStorageFailure(() => {
        const savedValue = globalThis.localStorage.getItem(HIDDEN_SHOWS_STORAGE_KEY);
        return savedValue !== null && isStoredBoolean(savedValue) ? savedValue === 'true' : DEFAULT_SHOW_HIDDEN;
    }, DEFAULT_SHOW_HIDDEN);
}

function saveShowHidden(showHidden: boolean): void {
    const storedValue = String(showHidden);
    runIgnoringStorageFailure(
        () => globalThis.localStorage.setItem(HIDDEN_SHOWS_STORAGE_KEY, storedValue),
        undefined
    );
}

function isStoredBoolean(value: string): value is 'true' | 'false' {
    return value === 'true' || value === 'false';
}
