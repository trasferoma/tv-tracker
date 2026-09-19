import { ref, type Ref } from 'vue';

import {
    applyMergeImport,
    applyReplaceImport,
    planImport,
    type BackupImportPlan,
    type BackupImportSummary
} from '@/backup/backupImport';
import { backupFileName, buildBackupFile, collectProgressEvents, collectShowsSnapshot, downloadBackupFile } from '@/backup/backupExport';
import { validateBackupFile } from '@/backup/backupValidation';
import type { BackupFile } from '@/backup/backupFormat';
import { currentTrackedShowStore } from '@/persistence/currentTrackedShowStore';
import type { ReplaceAllShowsOutcome, TrackedShowStore } from '@/persistence/trackedShowStore';

const CLOCK_SKEW_WARNING =
    'Il confronto "più recenti" si basa sull\'orologio dei singoli dispositivi: se non sono sincronizzati, controlla a mano i dati prima di scegliere.';

export type ImportReadiness =
    | { readonly state: 'idle' }
    | { readonly state: 'invalid'; readonly reason: string }
    | { readonly state: 'ready'; readonly summary: BackupImportSummary; readonly clockSkewWarning: string };

export interface BackupDeps {
    readonly store?: TrackedShowStore;
    readonly resolveNow?: () => Date;
}

export interface UseBackup {
    readonly importReadiness: Ref<ImportReadiness>;
    exportBackup(): Promise<void>;
    prepareImport(fileContent: string): Promise<void>;
    confirmMerge(): Promise<ReplaceAllShowsOutcome | undefined>;
    confirmReplace(): Promise<ReplaceAllShowsOutcome | undefined>;
    cancelImport(): void;
}

interface PendingImport {
    readonly backup: BackupFile;
    readonly plan: BackupImportPlan;
}

export function useBackup(deps: BackupDeps = {}): UseBackup {
    const store = deps.store ?? currentTrackedShowStore;
    const resolveNow = deps.resolveNow ?? (() => new Date());

    const importReadiness = ref<ImportReadiness>({ state: 'idle' });
    let pendingImport: PendingImport | undefined;

    async function exportBackup(): Promise<void> {
        const shows = await collectShowsSnapshot(store);
        const progressEvents = await collectProgressEvents(store);
        const exportedAt = resolveNow();
        const backup = buildBackupFile(shows, progressEvents, exportedAt);
        const fileName = backupFileName(exportedAt);
        downloadBackupFile(backup, fileName);
    }

    async function prepareImport(fileContent: string): Promise<void> {
        const parsedJson = parseJson(fileContent);
        if (parsedJson === undefined) {
            importReadiness.value = { state: 'invalid', reason: 'Il file non contiene un JSON valido.' };
            return;
        }
        const validation = validateBackupFile(parsedJson);
        if (!validation.valid) {
            importReadiness.value = { state: 'invalid', reason: validation.reason };
            return;
        }
        const localShows = await collectShowsSnapshot(store);
        const localProgressEvents = await collectProgressEvents(store);
        const plan = planImport(validation.backup, localShows, localProgressEvents);
        pendingImport = { backup: validation.backup, plan };
        importReadiness.value = { state: 'ready', summary: plan.summary, clockSkewWarning: CLOCK_SKEW_WARNING };
    }

    async function confirmMerge(): Promise<ReplaceAllShowsOutcome | undefined> {
        if (pendingImport === undefined) {
            return undefined;
        }
        const outcome = await applyMergeImport(store, pendingImport.plan);
        resetImportState();
        return outcome;
    }

    async function confirmReplace(): Promise<ReplaceAllShowsOutcome | undefined> {
        if (pendingImport === undefined) {
            return undefined;
        }
        const outcome = await applyReplaceImport(store, pendingImport.backup);
        resetImportState();
        return outcome;
    }

    function cancelImport(): void {
        resetImportState();
    }

    function resetImportState(): void {
        pendingImport = undefined;
        importReadiness.value = { state: 'idle' };
    }

    return { importReadiness, exportBackup, prepareImport, confirmMerge, confirmReplace, cancelImport };
}

function parseJson(fileContent: string): unknown {
    try {
        return JSON.parse(fileContent) as unknown;
    } catch {
        return undefined;
    }
}
