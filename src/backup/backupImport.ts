import type { ProgressEvent, TrackedShow } from '@/domain/trackedShow';
import type { ReplaceAllShowsOutcome, TrackedShowStore } from '@/persistence/trackedShowStore';
import type { BackupFile } from './backupFormat';

export interface BackupImportSummary {
    readonly totalInFile: number;
    readonly newCount: number;
    readonly alreadyPresentCount: number;
    readonly newerThanLocalCount: number;
}

export interface BackupImportPlan {
    readonly summary: BackupImportSummary;
    readonly mergedShows: readonly TrackedShow[];
    readonly mergedProgressEvents: readonly ProgressEvent[];
}

interface MergedShowEntry {
    readonly show: TrackedShow;
    readonly source: 'file' | 'local';
}

export function planImport(
    fileBackup: BackupFile,
    localShows: readonly TrackedShow[],
    localProgressEvents: readonly ProgressEvent[]
): BackupImportPlan {
    const localShowsById = indexShowsById(localShows);
    const mergedShowsById = mergeShows(fileBackup.shows, localShowsById);
    const fileEventsByShow = groupProgressEventsByShow(fileBackup.progressEvents);
    const localEventsByShow = groupProgressEventsByShow(localProgressEvents);

    const summary = summarizeImport(fileBackup.shows, localShowsById);
    const mergedShows = extractShows(mergedShowsById);
    const mergedProgressEvents = collectMergedProgressEvents(mergedShowsById, fileEventsByShow, localEventsByShow);
    return { summary, mergedShows, mergedProgressEvents };
}

export async function applyMergeImport(store: TrackedShowStore, plan: BackupImportPlan): Promise<ReplaceAllShowsOutcome> {
    return store.replaceAllShows(plan.mergedShows, plan.mergedProgressEvents);
}

export async function applyReplaceImport(store: TrackedShowStore, fileBackup: BackupFile): Promise<ReplaceAllShowsOutcome> {
    return store.replaceAllShows(fileBackup.shows, fileBackup.progressEvents);
}

function summarizeImport(
    fileShows: readonly TrackedShow[],
    localShowsById: ReadonlyMap<string, TrackedShow>
): BackupImportSummary {
    const alreadyPresentShows = fileShows.filter((show) => localShowsById.has(show.id));
    const newerThanLocalCount = alreadyPresentShows.filter((show) => isNewerThanLocal(show, localShowsById)).length;
    return {
        totalInFile: fileShows.length,
        newCount: fileShows.length - alreadyPresentShows.length,
        alreadyPresentCount: alreadyPresentShows.length,
        newerThanLocalCount
    };
}

function isNewerThanLocal(fileShow: TrackedShow, localShowsById: ReadonlyMap<string, TrackedShow>): boolean {
    const localShow = localShowsById.get(fileShow.id);
    return localShow !== undefined && fileShow.updatedAt > localShow.updatedAt;
}

function indexShowsById(shows: readonly TrackedShow[]): ReadonlyMap<string, TrackedShow> {
    return new Map(shows.map((show) => [show.id, show] as const));
}

function extractShows(mergedShowsById: ReadonlyMap<string, MergedShowEntry>): readonly TrackedShow[] {
    return Array.from(mergedShowsById.values(), (entry) => entry.show);
}

function mergeShows(
    fileShows: readonly TrackedShow[],
    localShowsById: ReadonlyMap<string, TrackedShow>
): ReadonlyMap<string, MergedShowEntry> {
    const localEntries = Array.from(localShowsById, ([id, show]) => [id, { show, source: 'local' }] as const);
    const mergedById = new Map<string, MergedShowEntry>(localEntries);
    fileShows.forEach((fileShow) => {
        const localShow = localShowsById.get(fileShow.id);
        const winningEntry = pickMoreRecentEntry(fileShow, localShow);
        mergedById.set(fileShow.id, winningEntry);
    });
    return mergedById;
}

function pickMoreRecentEntry(fileShow: TrackedShow, localShow: TrackedShow | undefined): MergedShowEntry {
    if (localShow === undefined || fileShow.updatedAt > localShow.updatedAt) {
        return { show: fileShow, source: 'file' };
    }
    return { show: localShow, source: 'local' };
}

function collectMergedProgressEvents(
    mergedShowsById: ReadonlyMap<string, MergedShowEntry>,
    fileEventsByShow: ReadonlyMap<string, readonly ProgressEvent[]>,
    localEventsByShow: ReadonlyMap<string, readonly ProgressEvent[]>
): readonly ProgressEvent[] {
    return Array.from(mergedShowsById.values())
        .flatMap((entry) => resolveEventsForEntry(entry, fileEventsByShow, localEventsByShow));
}

function resolveEventsForEntry(
    entry: MergedShowEntry,
    fileEventsByShow: ReadonlyMap<string, readonly ProgressEvent[]>,
    localEventsByShow: ReadonlyMap<string, readonly ProgressEvent[]>
): readonly ProgressEvent[] {
    const eventsByShow = entry.source === 'file' ? fileEventsByShow : localEventsByShow;
    return eventsByShow.get(entry.show.id) ?? [];
}

function groupProgressEventsByShow(events: readonly ProgressEvent[]): ReadonlyMap<string, readonly ProgressEvent[]> {
    const grouped = new Map<string, ProgressEvent[]>();
    events.forEach((event) => {
        const eventsForShow = grouped.get(event.trackedShowId);
        if (eventsForShow === undefined) {
            grouped.set(event.trackedShowId, [event]);
        } else {
            eventsForShow.push(event);
        }
    });
    return grouped;
}
