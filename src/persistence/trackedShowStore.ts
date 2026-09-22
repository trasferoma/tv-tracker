import type { ShowListing } from '@/domain/showListing';
import type { ShowAudience } from '@/domain/showVisibility';
import type {
    InitialPositionChoice,
    ItalianProvider,
    ProgressEvent,
    ProgressOutcome,
    ResetProgressOutcome,
    TrackedShow
} from '@/domain/trackedShow';

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

export type ChangeVisibilityOutcome =
    | { readonly outcome: 'changed' }
    | { readonly outcome: 'rejected'; readonly reason: string };

export type ChangeListingOutcome =
    | { readonly outcome: 'changed' }
    | { readonly outcome: 'rejected'; readonly reason: string };

export type RemoveShowOutcome =
    | { readonly outcome: 'removed' }
    | { readonly outcome: 'rejected'; readonly reason: string };

export type ReplaceAllShowsOutcome =
    | { readonly outcome: 'replaced' }
    | { readonly outcome: 'partial'; readonly reason: string };

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
    changeVisibility(id: string, targetAudience: ShowAudience, updatedAt: string): Promise<ChangeVisibilityOutcome>;
    changeListing(id: string, targetListing: ShowListing, updatedAt: string): Promise<ChangeListingOutcome>;
    advanceProgress(id: string, targetEpisodeId: string, confirmedBy: string, today: string): Promise<ProgressOutcome>;
    undoLastProgress(id: string, expectedRevision: number, undoneBy: string): Promise<ProgressOutcome>;
    resetProgress(
        id: string,
        targetPosition: InitialPositionChoice,
        resetAt: string,
        today: string
    ): Promise<ResetProgressOutcome>;
    removeShow(id: string): Promise<RemoveShowOutcome>;
    listAllProgressEvents(): Promise<readonly ProgressEvent[]>;
    replaceAllShows(
        shows: readonly TrackedShow[],
        progressEvents: readonly ProgressEvent[]
    ): Promise<ReplaceAllShowsOutcome>;
}
