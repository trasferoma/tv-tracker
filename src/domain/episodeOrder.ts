import { SPECIAL_SEASON_NUMBER, type Episode, type Season } from './trackedShow';

export interface EpisodeCatalog {
    readonly seasons: readonly Season[];
}

export function buildEpisodeSequence(catalog: EpisodeCatalog): readonly Episode[] {
    return catalog.seasons
            .flatMap((season) => season.episodes)
            .filter((episode) => episode.seasonNumber !== SPECIAL_SEASON_NUMBER)
            .sort(compareBroadcastOrder);
}

export function positionOfEpisode(sequence: readonly Episode[], episodeId: string): number {
    return sequence.findIndex((episode) => episode.providerEpisodeId === episodeId);
}

export function episodeAfterPosition(sequence: readonly Episode[], position: number): Episode | undefined {
    return sequence[position + 1];
}

function compareBroadcastOrder(a: Episode, b: Episode): number {
    if (a.seasonNumber !== b.seasonNumber) {
        return a.seasonNumber - b.seasonNumber;
    }
    return a.episodeNumber - b.episodeNumber;
}
