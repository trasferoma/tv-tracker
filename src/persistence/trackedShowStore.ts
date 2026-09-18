import type { ItalianProvider, ProgressOutcome, TrackedShow } from '@/domain/trackedShow';

export type Unsubscribe = () => void;

export type TrackedShowsListener = (shows: readonly TrackedShow[]) => void;
export type TrackedShowListener = (show: TrackedShow | undefined) => void;

export type AddShowOutcome =
    | { readonly outcome: 'added' }
    | { readonly outcome: 'rejected'; readonly reason: string };

export type UpdateCatalogOutcome =
    | { readonly outcome: 'updated' }
    | { readonly outcome: 'rejected'; readonly reason: string };

export type ChangeProviderOutcome =
    | { readonly outcome: 'changed' }
    | { readonly outcome: 'rejected'; readonly reason: string };

export type RemoveShowOutcome =
    | { readonly outcome: 'removed' }
    | { readonly outcome: 'rejected'; readonly reason: string };

export interface TrackedShowStore {
    subscribeToTrackedShows(listener: TrackedShowsListener): Unsubscribe;
    subscribeToShow(id: string, listener: TrackedShowListener): Unsubscribe;
    addShow(show: TrackedShow): Promise<AddShowOutcome>;
    updateCatalog(show: TrackedShow): Promise<UpdateCatalogOutcome>;
    changeProvider(
        id: string,
        selectedProvider: ItalianProvider | undefined,
        updatedAt: string
    ): Promise<ChangeProviderOutcome>;
    advanceProgress(id: string, targetEpisodeId: string, confirmedBy: string, today: string): Promise<ProgressOutcome>;
    undoLastProgress(id: string, expectedRevision: number, undoneBy: string): Promise<ProgressOutcome>;
    removeShow(id: string): Promise<RemoveShowOutcome>;
}
