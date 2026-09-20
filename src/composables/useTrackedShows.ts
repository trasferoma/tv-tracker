import { computed, onMounted, onUnmounted, ref, type ComputedRef, type Ref } from 'vue';

import type { CatalogShow, CatalogSource } from '@/catalog/catalogSource';
import { sampleCatalogSource } from '@/catalog/sampleCatalogSource';
import { matchSessionState, session } from '@/auth/session';
import { mergeAnnouncedEpisode } from '@/domain/catalogMerge';
import { toCatalogDate } from '@/domain/catalogDate';
import { generateId } from '@/domain/identity';
import { selectPosterUrl } from '@/domain/seasonPoster';
import { sortShows, type ShowSortMode } from '@/domain/showSorting';
import type { ItalianProvider, ProgressOutcome, TrackedShow } from '@/domain/trackedShow';
import { calculateWatchPosition, type WatchPosition } from '@/domain/watchPosition';
import { isLocalMode } from '@/localMode';
import { currentTrackedShowStore } from '@/persistence/currentTrackedShowStore';
import type { TrackedShowStore, Unsubscribe } from '@/persistence/trackedShowStore';
import {
    formatCatalogDate,
    formatEpisodeHeadline,
    formatNewEpisodesSummary,
    formatProviderLabel,
    formatUnwatchedCountLabel,
    formatUpcomingEpisodeLabel
} from '@/presentation/italianFormat';

const DEGRADED_ROW_MESSAGE = 'Dati non allineati: aggiorna il catalogo di questa serie per correggerla.';
const DEGRADED_BADGE_LABEL = 'Dati non allineati';
const CAUGHT_UP_HEADLINE = 'Siete in pari con questa serie';
const NEVER_STARTED_DATE_LABEL = 'Da iniziare';
const SAMPLE_SHOW_QUERIES: readonly string[] = ['The Bear', 'The White Lotus', 'Scissione', 'Only Murders', 'Slow Horses'];

export interface ShowListItem {
    readonly id: string;
    readonly title: string;
    readonly posterUrl: string | undefined;
    readonly providerLabel: string | undefined;
    readonly badgeLabel: string;
    readonly isCaughtUp: boolean;
    readonly episodeHeadline: string;
    readonly episodeDateLabel: string;
    readonly upcomingLabel: string | undefined;
    readonly canConfirmWatched: boolean;
    readonly firstUnwatchedEpisodeId: string | undefined;
    readonly errorMessage: string | undefined;
}

export interface PendingWatchConfirmation {
    readonly showId: string;
    readonly episodeId: string;
    readonly showTitle: string;
    readonly episodeHeadline: string;
}

export interface TrackedShowsDeps {
    readonly store?: TrackedShowStore;
    readonly catalogSource?: CatalogSource;
    readonly resolveToday?: () => string;
    readonly resolveActiveProfileId?: () => string;
}

export interface UseTrackedShows {
    readonly listItems: ComputedRef<readonly ShowListItem[]>;
    readonly summaryText: ComputedRef<string>;
    readonly trackedProviderShowIds: ComputedRef<ReadonlySet<string>>;
    readonly completedCount: ComputedRef<number>;
    readonly hasTrackedShows: ComputedRef<boolean>;
    readonly pendingWatch: Ref<PendingWatchConfirmation | undefined>;
    requestWatch(showId: string): void;
    cancelPendingWatch(): void;
    confirmPendingWatch(): Promise<ProgressOutcome | undefined>;
    loadSampleData(): Promise<void>;
}

type ShowComputation = ShowComputationOk | ShowComputationDegraded;

interface ShowComputationOk {
    readonly show: TrackedShow;
    readonly watchPosition: WatchPosition;
    readonly errorMessage: undefined;
}

interface ShowComputationDegraded {
    readonly show: TrackedShow;
    readonly watchPosition: undefined;
    readonly errorMessage: string;
}

export function useTrackedShows(
    sortMode: Ref<ShowSortMode>,
    showCompleted: Ref<boolean>,
    deps: TrackedShowsDeps = {}
): UseTrackedShows {
    const store = deps.store ?? currentTrackedShowStore;
    const catalogSource = deps.catalogSource ?? sampleCatalogSource;
    const resolveToday = deps.resolveToday ?? (() => toCatalogDate(new Date()));
    const resolveActiveProfileId = deps.resolveActiveProfileId ?? resolveActiveProfileIdFromSession;

    const rawShows = ref<readonly TrackedShow[]>([]);
    const pendingWatch = ref<PendingWatchConfirmation>();
    let unsubscribe: Unsubscribe | undefined;

    onMounted(() => {
        unsubscribe = store.subscribeToTrackedShows((shows) => {
            rawShows.value = shows;
        });
    });

    onUnmounted(() => {
        unsubscribe?.();
    });

    const entries = computed<readonly ShowComputation[]>(() => {
        const today = resolveToday();
        return rawShows.value.map((show) => computeShowEntry(show, today));
    });

    const listItems = computed<readonly ShowListItem[]>(() =>
        sortEntries(entries.value, sortMode.value)
            .filter((entry) => showCompleted.value || !isCompletedEntry(entry))
            .map(toListItem));

    const summaryText = computed(() => buildSummaryText(entries.value));

    const trackedProviderShowIds = computed<ReadonlySet<string>>(() => toProviderShowIdSet(rawShows.value));

    const completedCount = computed<number>(() => entries.value.filter(isCompletedEntry).length);

    const hasTrackedShows = computed<boolean>(() => rawShows.value.length > 0);

    function requestWatch(showId: string): void {
        const item = listItems.value.find((candidate) => candidate.id === showId);
        if (item === undefined || item.firstUnwatchedEpisodeId === undefined) {
            return;
        }
        pendingWatch.value = {
            showId: item.id,
            episodeId: item.firstUnwatchedEpisodeId,
            showTitle: item.title,
            episodeHeadline: item.episodeHeadline
        };
    }

    function cancelPendingWatch(): void {
        pendingWatch.value = undefined;
    }

    async function confirmPendingWatch(): Promise<ProgressOutcome | undefined> {
        const target = pendingWatch.value;
        if (target === undefined) {
            return undefined;
        }
        pendingWatch.value = undefined;
        return store.advanceProgress(target.showId, target.episodeId, resolveActiveProfileId(), resolveToday());
    }

    async function loadSampleData(): Promise<void> {
        if (!isLocalMode) {
            return;
        }
        for (const query of SAMPLE_SHOW_QUERIES) {
            await loadOneSampleShow(query);
        }
    }

    async function loadOneSampleShow(query: string): Promise<void> {
        const searchOutcome = await catalogSource.searchShows(query);
        const firstResult = searchOutcome.outcome === 'found' ? searchOutcome.results[0] : undefined;
        if (firstResult === undefined) {
            return;
        }
        const loadOutcome = await catalogSource.loadShow(firstResult.providerShowId);
        if (loadOutcome.outcome !== 'found') {
            return;
        }
        const providers = await loadSampleItalianProviders(firstResult.providerShowId);
        const show = buildSampleTrackedShow(loadOutcome.show, providers);
        await store.addShow(show);
    }

    async function loadSampleItalianProviders(providerShowId: string): Promise<readonly ItalianProvider[]> {
        const outcome = await catalogSource.loadItalianProviders(providerShowId);
        return outcome.outcome === 'loaded' ? outcome.providers : [];
    }

    return {
        listItems,
        summaryText,
        trackedProviderShowIds,
        completedCount,
        hasTrackedShows,
        pendingWatch,
        requestWatch,
        cancelPendingWatch,
        confirmPendingWatch,
        loadSampleData
    };
}

function resolveActiveProfileIdFromSession(): string {
    return matchSessionState(session.state.value, {
        restoring: () => '',
        authenticated: (profile) => profile.id,
        anonymous: () => ''
    });
}

function computeShowEntry(show: TrackedShow, today: string): ShowComputation {
    try {
        return { show, watchPosition: calculateWatchPosition(show, today), errorMessage: undefined };
    } catch (error) {
        logMisalignedShow(show, error);
        return { show, watchPosition: undefined, errorMessage: DEGRADED_ROW_MESSAGE };
    }
}

function logMisalignedShow(show: TrackedShow, error: unknown): void {
    console.error(`Impossibile calcolare la posizione di visione per "${show.title}".`, error);
}

function isHealthyEntry(entry: ShowComputation): entry is ShowComputationOk {
    return entry.watchPosition !== undefined;
}

function isCompletedEntry(entry: ShowComputation): boolean {
    return isHealthyEntry(entry) && entry.watchPosition.isCompleted;
}

function sortEntries(entries: readonly ShowComputation[], mode: ShowSortMode): readonly ShowComputation[] {
    const healthyEntries = entries.filter(isHealthyEntry);
    const degradedEntries = entries.filter((entry) => !isHealthyEntry(entry));
    return [...sortDegradedEntries(degradedEntries), ...sortHealthyEntries(healthyEntries, mode)];
}

function sortDegradedEntries(entries: readonly ShowComputation[]): readonly ShowComputation[] {
    return [...entries].sort((a, b) => a.show.title.localeCompare(b.show.title, 'it'));
}

function sortHealthyEntries(entries: readonly ShowComputationOk[], mode: ShowSortMode): readonly ShowComputation[] {
    const entryByShowId = new Map(entries.map((entry) => [entry.show.id, entry]));
    const sortedShows = sortShows(entries, mode);
    return sortedShows.map((sortable) => entryByShowId.get(sortable.show.id)!);
}

function toProviderShowIdSet(shows: readonly TrackedShow[]): ReadonlySet<string> {
    const providerShowIds = shows.map((show) => show.providerShowId);
    return new Set(providerShowIds);
}

function buildSummaryText(entries: readonly ShowComputation[]): string {
    const healthyEntries = entries.filter(isHealthyEntry);
    const newEpisodesCount = healthyEntries.reduce((total, entry) => total + entry.watchPosition.backlogCount, 0);
    const showsWithNewEpisodesCount = healthyEntries.filter((entry) => entry.watchPosition.backlogCount > 0).length;
    return formatNewEpisodesSummary(newEpisodesCount, showsWithNewEpisodesCount);
}

function toListItem(entry: ShowComputation): ShowListItem {
    return isHealthyEntry(entry)
        ? buildHealthyListItem(entry.show, entry.watchPosition)
        : buildDegradedListItem(entry.show, entry.errorMessage);
}

function buildDegradedListItem(show: TrackedShow, errorMessage: string): ShowListItem {
    return {
        id: show.id,
        title: show.title,
        posterUrl: selectPosterUrl(show, undefined),
        providerLabel: formatProviderLabel(show.selectedStreamingProviderName),
        badgeLabel: DEGRADED_BADGE_LABEL,
        isCaughtUp: false,
        episodeHeadline: errorMessage,
        episodeDateLabel: '',
        upcomingLabel: undefined,
        canConfirmWatched: false,
        firstUnwatchedEpisodeId: undefined,
        errorMessage
    };
}

function buildHealthyListItem(show: TrackedShow, watchPosition: WatchPosition): ShowListItem {
    const episodeSection = buildEpisodeSection(show, watchPosition);
    return {
        id: show.id,
        title: show.title,
        posterUrl: selectPosterUrl(show, watchPosition.nextUnwatchedEpisode),
        providerLabel: formatProviderLabel(show.selectedStreamingProviderName),
        badgeLabel: formatUnwatchedCountLabel(watchPosition.backlogCount),
        isCaughtUp: watchPosition.isCaughtUp,
        episodeHeadline: episodeSection.headline,
        episodeDateLabel: episodeSection.dateLabel,
        upcomingLabel: buildUpcomingLabel(watchPosition),
        canConfirmWatched: watchPosition.firstUnwatchedEpisode !== undefined,
        firstUnwatchedEpisodeId: watchPosition.firstUnwatchedEpisode?.providerEpisodeId,
        errorMessage: undefined
    };
}

function buildEpisodeSection(show: TrackedShow, watchPosition: WatchPosition): { headline: string; dateLabel: string } {
    const episode = watchPosition.firstUnwatchedEpisode;
    if (episode === undefined) {
        return { headline: CAUGHT_UP_HEADLINE, dateLabel: '' };
    }
    const dateLabel = show.lastWatchedEpisodeId === undefined
        ? NEVER_STARTED_DATE_LABEL
        : `Data catalogo: ${formatCatalogDate(episode.airDate)}`;
    return { headline: formatEpisodeHeadline(episode.seasonNumber, episode.episodeNumber, episode.title), dateLabel };
}

function buildUpcomingLabel(watchPosition: WatchPosition): string | undefined {
    const episode = watchPosition.nextUpcomingEpisode;
    if (episode === undefined) {
        return undefined;
    }
    return formatUpcomingEpisodeLabel(episode.seasonNumber, episode.episodeNumber, episode.airDate);
}

function buildSampleTrackedShow(catalogShow: CatalogShow, providers: readonly ItalianProvider[]): TrackedShow {
    const selectedProvider = providers[0];
    const addedAt = new Date().toISOString();
    return {
        id: generateId(),
        catalogProvider: catalogShow.catalogProvider,
        providerShowId: catalogShow.providerShowId,
        title: catalogShow.title,
        seriesPosterUrl: catalogShow.seriesPosterUrl,
        status: catalogShow.status,
        seasons: mergeAnnouncedEpisode(catalogShow),
        italianProviders: providers,
        selectedStreamingProviderId: selectedProvider?.id,
        selectedStreamingProviderName: selectedProvider?.name,
        progressRevision: 0,
        addedAt,
        updatedAt: addedAt
    };
}
