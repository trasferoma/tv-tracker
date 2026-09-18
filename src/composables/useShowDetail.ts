import { computed, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue';

import { matchSessionState, session } from '@/auth/session';
import { compareCatalogDates, toCatalogDate } from '@/domain/catalogDate';
import { buildEpisodeSequence, positionOfEpisode } from '@/domain/episodeOrder';
import { selectPosterUrl } from '@/domain/seasonPoster';
import {
    SPECIAL_SEASON_NUMBER,
    type Episode,
    type ItalianProvider,
    type ProgressOutcome,
    type TrackedShow
} from '@/domain/trackedShow';
import { calculateWatchPosition, type WatchPosition } from '@/domain/watchPosition';
import { currentTrackedShowStore } from '@/persistence/currentTrackedShowStore';
import type {
    ChangeProviderOutcome,
    RemoveShowOutcome,
    TrackedShowStore,
    Unsubscribe
} from '@/persistence/trackedShowStore';
import { formatBacklogHeadline, formatCatalogDate, formatEpisodeHeadline, formatUpcomingEpisodeLabel } from '@/presentation/italianFormat';

const MISALIGNED_TITLE = 'Dati non allineati';
const MISALIGNED_MESSAGE = 'I dati di questa serie non sono allineati: aggiorna il catalogo per correggerla.';
const NOT_MARKABLE_LABEL = 'Non ancora uscita';

export interface EpisodeRowView {
    readonly id: string;
    readonly headline: string;
    readonly dateLabel: string;
    readonly canMarkWatched: boolean;
}

export interface UpcomingBoxView {
    readonly headline: string;
    readonly dateLabel: string;
}

export interface SeasonSectionView {
    readonly seasonNumber: number;
    readonly remainingCount: number;
    readonly defaultOpen: boolean;
    readonly episodes: readonly EpisodeRowView[];
    readonly upcoming: UpcomingBoxView | undefined;
}

export interface ShowDetailContent {
    readonly id: string;
    readonly title: string;
    readonly posterUrl: string | undefined;
    readonly backlogHeadline: string;
    readonly upcomingHeadline: string | undefined;
    readonly seasons: readonly SeasonSectionView[];
    readonly specials: readonly EpisodeRowView[];
    readonly providers: readonly ItalianProvider[];
    readonly selectedProviderId: string | undefined;
    readonly canUndo: boolean;
}

export type ShowDetailStatus =
    | { readonly kind: 'loading' }
    | { readonly kind: 'notFound' }
    | { readonly kind: 'misaligned'; readonly title: string; readonly message: string }
    | { readonly kind: 'ready'; readonly content: ShowDetailContent };

export interface PendingWatch {
    readonly episodeId: string;
    readonly headline: string;
}

export interface ShowDetailDeps {
    readonly store?: TrackedShowStore;
    readonly resolveToday?: () => string;
    readonly resolveNow?: () => string;
    readonly resolveActiveProfileId?: () => string;
}

export interface UseShowDetail {
    readonly status: ComputedRef<ShowDetailStatus>;
    readonly pendingWatch: Ref<PendingWatch | undefined>;
    readonly pendingUndo: Ref<boolean>;
    readonly pendingRemove: Ref<boolean>;
    requestWatch(episodeId: string): void;
    cancelPendingWatch(): void;
    confirmPendingWatch(): Promise<ProgressOutcome | undefined>;
    requestUndo(): void;
    cancelPendingUndo(): void;
    confirmPendingUndo(): Promise<ProgressOutcome | undefined>;
    requestRemove(): void;
    cancelPendingRemove(): void;
    confirmPendingRemove(): Promise<RemoveShowOutcome | undefined>;
    changeProvider(providerId: string | undefined): Promise<ChangeProviderOutcome | undefined>;
}

export function useShowDetail(id: Ref<string>, deps: ShowDetailDeps = {}): UseShowDetail {
    const store = deps.store ?? currentTrackedShowStore;
    const resolveToday = deps.resolveToday ?? (() => toCatalogDate(new Date()));
    const resolveNow = deps.resolveNow ?? (() => new Date().toISOString());
    const resolveActiveProfileId = deps.resolveActiveProfileId ?? resolveActiveProfileIdFromSession;

    const show = ref<TrackedShow>();
    const hasReceivedShow = ref(false);
    const pendingWatch = ref<PendingWatch>();
    const pendingUndo = ref(false);
    const pendingRemove = ref(false);

    let unsubscribe: Unsubscribe | undefined;

    watch(id, (showId) => {
        unsubscribe?.();
        hasReceivedShow.value = false;
        show.value = undefined;
        unsubscribe = store.subscribeToShow(showId, (nextShow) => {
            show.value = nextShow;
            hasReceivedShow.value = true;
        });
    }, { immediate: true });

    onUnmounted(() => {
        unsubscribe?.();
    });

    const status = computed<ShowDetailStatus>(() => resolveStatus(show.value, hasReceivedShow.value, resolveToday()));

    function requestWatch(episodeId: string): void {
        const headline = findMarkableEpisodeHeadline(status.value, episodeId);
        if (headline === undefined) {
            return;
        }
        pendingWatch.value = { episodeId, headline };
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
        return store.advanceProgress(id.value, target.episodeId, resolveActiveProfileId(), resolveToday());
    }

    function requestUndo(): void {
        pendingUndo.value = true;
    }

    function cancelPendingUndo(): void {
        pendingUndo.value = false;
    }

    async function confirmPendingUndo(): Promise<ProgressOutcome | undefined> {
        if (!pendingUndo.value) {
            return undefined;
        }
        pendingUndo.value = false;
        const currentShow = show.value;
        if (currentShow === undefined) {
            return undefined;
        }
        return store.undoLastProgress(currentShow.id, currentShow.progressRevision, resolveActiveProfileId());
    }

    function requestRemove(): void {
        pendingRemove.value = true;
    }

    function cancelPendingRemove(): void {
        pendingRemove.value = false;
    }

    async function confirmPendingRemove(): Promise<RemoveShowOutcome | undefined> {
        if (!pendingRemove.value) {
            return undefined;
        }
        pendingRemove.value = false;
        return store.removeShow(id.value);
    }

    async function changeProvider(providerId: string | undefined): Promise<ChangeProviderOutcome | undefined> {
        const currentShow = show.value;
        if (currentShow === undefined) {
            return undefined;
        }
        const selectedProvider = currentShow.italianProviders.find((provider) => provider.id === providerId);
        const updatedAt = resolveNow();
        return store.changeProvider(currentShow.id, selectedProvider, updatedAt);
    }

    return {
        status,
        pendingWatch,
        pendingUndo,
        pendingRemove,
        requestWatch,
        cancelPendingWatch,
        confirmPendingWatch,
        requestUndo,
        cancelPendingUndo,
        confirmPendingUndo,
        requestRemove,
        cancelPendingRemove,
        confirmPendingRemove,
        changeProvider
    };
}

function resolveActiveProfileIdFromSession(): string {
    return matchSessionState(session.state.value, {
        restoring: () => '',
        authenticated: (profile) => profile.id,
        anonymous: () => ''
    });
}

function resolveStatus(show: TrackedShow | undefined, hasReceivedShow: boolean, today: string): ShowDetailStatus {
    if (!hasReceivedShow) {
        return { kind: 'loading' };
    }
    if (show === undefined) {
        return { kind: 'notFound' };
    }
    try {
        const watchPosition = calculateWatchPosition(show, today);
        return { kind: 'ready', content: buildContent(show, watchPosition, today) };
    } catch (error) {
        logMisalignedShow(show, error);
        return { kind: 'misaligned', title: MISALIGNED_TITLE, message: MISALIGNED_MESSAGE };
    }
}

function logMisalignedShow(show: TrackedShow, error: unknown): void {
    console.error(`Impossibile calcolare la posizione di visione per "${show.title}".`, error);
}

function buildContent(show: TrackedShow, watchPosition: WatchPosition, today: string): ShowDetailContent {
    const unwatchedEpisodes = resolveUnwatchedEpisodes(show, watchPosition);
    const upcomingEpisodeId = watchPosition.nextUpcomingEpisode?.providerEpisodeId;
    const seasons = buildSeasons(unwatchedEpisodes, upcomingEpisodeId, today);
    const posterUrl = selectPosterUrl(show, watchPosition.nextUnwatchedEpisode);
    const backlogHeadline = formatBacklogHeadline(watchPosition.backlogCount);
    const upcomingHeadline = buildUpcomingHeadline(watchPosition.nextUpcomingEpisode);
    const specials = buildSpecials(show);
    return {
        id: show.id,
        title: show.title,
        posterUrl,
        backlogHeadline,
        upcomingHeadline,
        seasons,
        specials,
        providers: show.italianProviders,
        selectedProviderId: show.selectedStreamingProviderId,
        canUndo: show.lastViewedAt !== undefined
    };
}

function resolveUnwatchedEpisodes(show: TrackedShow, watchPosition: WatchPosition): readonly Episode[] {
    const anchorEpisodeId = watchPosition.nextUnwatchedEpisode?.providerEpisodeId;
    if (anchorEpisodeId === undefined) {
        return [];
    }
    const sequence = buildEpisodeSequence(show);
    const anchorPosition = positionOfEpisode(sequence, anchorEpisodeId);
    return sequence.slice(anchorPosition);
}

function buildSeasons(
    unwatchedEpisodes: readonly Episode[],
    upcomingEpisodeId: string | undefined,
    today: string
): readonly SeasonSectionView[] {
    const seasonNumbers = collectSeasonNumbersInOrder(unwatchedEpisodes);
    return seasonNumbers.map((seasonNumber, index) =>
        buildSeasonSection(seasonNumber, unwatchedEpisodes, upcomingEpisodeId, today, index === 0));
}

function collectSeasonNumbersInOrder(episodes: readonly Episode[]): readonly number[] {
    const seasonNumbers: number[] = [];
    for (const episode of episodes) {
        if (!seasonNumbers.includes(episode.seasonNumber)) {
            seasonNumbers.push(episode.seasonNumber);
        }
    }
    return seasonNumbers;
}

function buildSeasonSection(
    seasonNumber: number,
    unwatchedEpisodes: readonly Episode[],
    upcomingEpisodeId: string | undefined,
    today: string,
    defaultOpen: boolean
): SeasonSectionView {
    const seasonEpisodes = unwatchedEpisodes.filter((episode) => episode.seasonNumber === seasonNumber);
    const upcomingEpisode = seasonEpisodes.find((episode) => episode.providerEpisodeId === upcomingEpisodeId);
    const listedEpisodes = seasonEpisodes.filter((episode) => episode.providerEpisodeId !== upcomingEpisodeId);
    const upcoming = upcomingEpisode === undefined ? undefined : toUpcomingBox(upcomingEpisode);
    return {
        seasonNumber,
        remainingCount: seasonEpisodes.length,
        defaultOpen,
        episodes: listedEpisodes.map((episode) => toEpisodeRow(episode, today)),
        upcoming
    };
}

function toEpisodeRow(episode: Episode, today: string): EpisodeRowView {
    const canMarkWatched = !isFutureEpisode(episode, today);
    const headline = formatEpisodeHeadline(episode.seasonNumber, episode.episodeNumber, episode.title);
    const dateLabel = canMarkWatched ? formatCatalogDate(episode.airDate) : NOT_MARKABLE_LABEL;
    return {
        id: episode.providerEpisodeId,
        headline,
        dateLabel,
        canMarkWatched
    };
}

function toUpcomingBox(episode: Episode): UpcomingBoxView {
    const headline = formatEpisodeHeadline(episode.seasonNumber, episode.episodeNumber, episode.title);
    const dateLabel = formatCatalogDate(episode.airDate);
    return { headline, dateLabel };
}

function isFutureEpisode(episode: Episode, today: string): boolean {
    return episode.airDate !== undefined && compareCatalogDates(episode.airDate, today) > 0;
}

function buildSpecials(show: TrackedShow): readonly EpisodeRowView[] {
    const specialsSeason = show.seasons.find((season) => season.seasonNumber === SPECIAL_SEASON_NUMBER);
    if (specialsSeason === undefined) {
        return [];
    }
    return specialsSeason.episodes.map(toSpecialEpisodeRow);
}

function toSpecialEpisodeRow(episode: Episode): EpisodeRowView {
    const headline = formatEpisodeHeadline(episode.seasonNumber, episode.episodeNumber, episode.title);
    const dateLabel = formatCatalogDate(episode.airDate);
    return { id: episode.providerEpisodeId, headline, dateLabel, canMarkWatched: false };
}

function buildUpcomingHeadline(episode: Episode | undefined): string | undefined {
    if (episode === undefined) {
        return undefined;
    }
    return formatUpcomingEpisodeLabel(episode.seasonNumber, episode.episodeNumber, episode.airDate);
}

function findMarkableEpisodeHeadline(status: ShowDetailStatus, episodeId: string): string | undefined {
    if (status.kind !== 'ready') {
        return undefined;
    }
    const markableEpisode = status.content.seasons
        .flatMap((season) => season.episodes)
        .find((episode) => episode.id === episodeId && episode.canMarkWatched);
    return markableEpisode?.headline;
}
