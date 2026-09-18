import { compareCatalogDates } from './catalogDate';
import type { TrackedShow } from './trackedShow';
import type { WatchPosition } from './watchPosition';

export type ShowSortMode = 'activity' | 'alphabetical' | 'unwatched' | 'added' | 'nextEpisode';

export interface SortableShow {
    readonly show: TrackedShow;
    readonly watchPosition: WatchPosition;
}

type ShowComparator = (a: SortableShow, b: SortableShow) => number;

export function sortShows(entries: readonly SortableShow[], mode: ShowSortMode): readonly SortableShow[] {
    const primaryComparator = comparatorForMode(mode);
    const comparator = withAlphabeticalTiebreak(primaryComparator);
    return [...entries].sort(comparator);
}

function comparatorForMode(mode: ShowSortMode): ShowComparator {
    switch (mode) {
        case 'activity':
            return compareByActivity;
        case 'alphabetical':
            return compareByTitle;
        case 'unwatched':
            return compareByUnwatchedCount;
        case 'added':
            return compareByAddedDate;
        case 'nextEpisode':
            return compareByNextEpisode;
        default:
            throw new Error(`Criterio di ordinamento non gestito: ${String(mode)}`);
    }
}

function withAlphabeticalTiebreak(primaryComparator: ShowComparator): ShowComparator {
    return (a, b) => {
        const primaryComparison = primaryComparator(a, b);
        return primaryComparison !== 0 ? primaryComparison : compareByTitle(a, b);
    };
}

function compareByActivity(a: SortableShow, b: SortableShow): number {
    return compareMissingLast(a.show.lastViewedAt, b.show.lastViewedAt, compareTimestampsDescending);
}

function compareByTitle(a: SortableShow, b: SortableShow): number {
    return a.show.title.localeCompare(b.show.title, 'it');
}

function compareByUnwatchedCount(a: SortableShow, b: SortableShow): number {
    return b.watchPosition.backlogCount - a.watchPosition.backlogCount;
}

function compareByAddedDate(a: SortableShow, b: SortableShow): number {
    return compareTimestampsDescending(a.show.addedAt, b.show.addedAt);
}

function compareByNextEpisode(a: SortableShow, b: SortableShow): number {
    const aAirDate = a.watchPosition.nextUpcomingEpisode?.airDate;
    const bAirDate = b.watchPosition.nextUpcomingEpisode?.airDate;
    return compareMissingLast(aAirDate, bAirDate, compareCatalogDates);
}

function compareMissingLast(
    a: string | undefined,
    b: string | undefined,
    compare: (a: string, b: string) => number
): number {
    if (a === undefined && b === undefined) {
        return 0;
    }
    if (a === undefined) {
        return 1;
    }
    if (b === undefined) {
        return -1;
    }
    return compare(a, b);
}

function compareTimestampsDescending(a: string, b: string): number {
    if (a === b) {
        return 0;
    }
    return a < b ? 1 : -1;
}
