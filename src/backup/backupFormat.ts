import type { ProgressEvent, TrackedShow } from '@/domain/trackedShow';

export const BACKUP_FORMAT_VERSION = 2 as const;

export interface BackupFile {
    readonly formatVersion: typeof BACKUP_FORMAT_VERSION;
    readonly exportedAt: string;
    readonly shows: readonly TrackedShow[];
    readonly progressEvents: readonly ProgressEvent[];
}
