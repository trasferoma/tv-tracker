import type { TrackedShow } from './trackedShow';

export type ShowAudience =
    | { readonly kind: 'shared' }
    | { readonly kind: 'private'; readonly profileId: string };

export type ShowScope = 'all' | 'mine';

export function resolveShowAudience(show: TrackedShow): ShowAudience {
    if (show.visibility === 'private' && show.privateFor !== undefined) {
        return { kind: 'private', profileId: show.privateFor };
    }
    return { kind: 'shared' };
}

export function withSharedVisibility(show: TrackedShow): TrackedShow {
    return { ...show, visibility: 'shared', privateFor: undefined };
}

export function withPrivateVisibility(show: TrackedShow, profileId: string): TrackedShow {
    return { ...show, visibility: 'private', privateFor: profileId };
}

export function isVisibleToProfile(show: TrackedShow, viewerProfileId: string): boolean {
    const audience = resolveShowAudience(show);
    return audience.kind === 'shared' || audience.profileId === viewerProfileId;
}

export function matchesScope(show: TrackedShow, viewerProfileId: string, scope: ShowScope): boolean {
    if (!isVisibleToProfile(show, viewerProfileId)) {
        return false;
    }
    if (scope === 'all') {
        return true;
    }
    return resolveShowAudience(show).kind === 'private';
}
