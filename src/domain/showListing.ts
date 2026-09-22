import type { TrackedShow } from './trackedShow';

export type ShowListing = 'listed' | 'hidden';

export function resolveShowListing(show: TrackedShow): ShowListing {
    return show.hidden === true ? 'hidden' : 'listed';
}

export function isHiddenShow(show: TrackedShow): boolean {
    return resolveShowListing(show) === 'hidden';
}

export function withHiddenShow(show: TrackedShow): TrackedShow {
    return { ...show, hidden: true };
}

export function withListedShow(show: TrackedShow): TrackedShow {
    return { ...show, hidden: undefined };
}
