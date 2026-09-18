import { runIgnoringStorageFailure } from '@/storageFailure';

const ACTIVE_PROFILE_STORAGE_KEY = 'tv-tracker:active-profile-id';

export interface ActiveProfileStorage {
    load(): string | undefined;
    save(profileId: string): void;
    clear(): void;
}

function loadActiveProfileId(): string | undefined {
    return runIgnoringStorageFailure(() => globalThis.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) ?? undefined, undefined);
}

function saveActiveProfileId(profileId: string): void {
    runIgnoringStorageFailure(() => globalThis.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileId), undefined);
}

function clearActiveProfileId(): void {
    runIgnoringStorageFailure(() => globalThis.localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY), undefined);
}

export const browserActiveProfileStorage: ActiveProfileStorage = {
    load: loadActiveProfileId,
    save: saveActiveProfileId,
    clear: clearActiveProfileId
};
