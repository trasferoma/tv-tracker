export interface StorageStatus {
    readonly persisted: boolean;
    readonly usageBytes: number | undefined;
    readonly quotaBytes: number | undefined;
    readonly canRequestPersistence: boolean;
}

export type PersistenceRequestOutcome = 'granted' | 'denied' | 'unavailable';

export async function requestPersistentStorage(): Promise<PersistenceRequestOutcome> {
    if (!hasStorageManager()) {
        return 'unavailable';
    }
    const granted = await navigator.storage.persist();
    return granted ? 'granted' : 'denied';
}

export async function readStorageStatus(): Promise<StorageStatus> {
    if (!hasStorageManager()) {
        return { persisted: false, usageBytes: undefined, quotaBytes: undefined, canRequestPersistence: false };
    }
    const persisted = await navigator.storage.persisted();
    const estimate = await navigator.storage.estimate();
    return { persisted, usageBytes: estimate.usage, quotaBytes: estimate.quota, canRequestPersistence: true };
}

function hasStorageManager(): boolean {
    return typeof navigator !== 'undefined' && navigator.storage !== undefined;
}
