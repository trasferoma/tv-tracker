import { toCatalogDate } from '@/domain/catalogDate';
import { resolveShowAudience, withPrivateVisibility, withSharedVisibility } from '@/domain/showVisibility';
import type { ProgressEvent, TrackedShow } from '@/domain/trackedShow';
import type { TrackedShowStore, Unsubscribe } from '@/persistence/trackedShowStore';
import { BACKUP_FORMAT_VERSION, type BackupFile } from './backupFormat';

export async function collectShowsSnapshot(store: TrackedShowStore): Promise<readonly TrackedShow[]> {
    return new Promise((resolve) => {
        const unsubscribe: Unsubscribe = store.subscribeToTrackedShows((shows) => {
            resolve(shows);
            queueMicrotask(() => unsubscribe());
        });
    });
}

export async function collectProgressEvents(store: TrackedShowStore): Promise<readonly ProgressEvent[]> {
    return store.listAllProgressEvents();
}

function normalizeVisibility(show: TrackedShow): TrackedShow {
    const audience = resolveShowAudience(show);
    return audience.kind === 'private'
        ? withPrivateVisibility(show, audience.profileId)
        : withSharedVisibility(show);
}

export function buildBackupFile(
    shows: readonly TrackedShow[],
    progressEvents: readonly ProgressEvent[],
    exportedAt: Date
): BackupFile {
    return {
        formatVersion: BACKUP_FORMAT_VERSION,
        exportedAt: exportedAt.toISOString(),
        shows: shows.map(normalizeVisibility),
        progressEvents
    };
}

export function backupFileName(exportedAt: Date): string {
    return `tv-tracker-backup-${toCatalogDate(exportedAt)}.json`;
}

export function downloadBackupFile(backup: BackupFile, fileName: string): void {
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
}
