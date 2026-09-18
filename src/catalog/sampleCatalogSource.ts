import type {
    CatalogSearchResult,
    CatalogShow,
    CatalogSource,
    LoadItalianProvidersOutcome,
    LoadShowOutcome,
    SearchShowsOutcome
} from './catalogSource';
import type { Episode, ItalianProvider, Season } from '@/domain/trackedShow';

interface SampleShow {
    readonly providerShowId: string;
    readonly title: string;
    readonly originalTitle: string;
    readonly year: number;
    readonly status: string;
    readonly seriesPosterUrl: string;
    readonly seasons: readonly Season[];
    readonly nextEpisodeToAir?: Episode | undefined;
    readonly italianProviders: readonly ItalianProvider[];
}

const THE_BEAR: SampleShow = {
    providerShowId: '136315',
    title: 'The Bear',
    originalTitle: 'The Bear',
    year: 2022,
    status: 'In corso',
    seriesPosterUrl: 'https://image.tmdb.org/t/p/w342/eKfVzzEazSIjJMrw9ADa2x8ksLz.jpg',
    seasons: [
        {
            providerSeasonId: '136315-S1',
            seasonNumber: 1,
            posterUrl: 'https://poster.example/the-bear/stagione-1.jpg',
            episodes: [
                { providerEpisodeId: '136315-S1E1', seasonNumber: 1, episodeNumber: 1, title: 'Sistema', airDate: '2022-06-23' },
                { providerEpisodeId: '136315-S1E2', seasonNumber: 1, episodeNumber: 2, title: 'Mani', airDate: '2022-06-23' },
                { providerEpisodeId: '136315-S1E3', seasonNumber: 1, episodeNumber: 3, title: 'Brigata', airDate: '2022-06-23' }
            ]
        },
        {
            providerSeasonId: '136315-S2',
            seasonNumber: 2,
            posterUrl: 'https://poster.example/the-bear/stagione-2.jpg',
            episodes: [
                { providerEpisodeId: '136315-S2E1', seasonNumber: 2, episodeNumber: 1, title: 'Manzo', airDate: '2023-06-22' },
                { providerEpisodeId: '136315-S2E2', seasonNumber: 2, episodeNumber: 2, title: 'Pasta', airDate: '2023-06-22' }
            ]
        }
    ],
    italianProviders: [{ id: 'disney-plus', name: 'Disney+' }]
};

const THE_WHITE_LOTUS: SampleShow = {
    providerShowId: '111803',
    title: 'The White Lotus',
    originalTitle: 'The White Lotus',
    year: 2021,
    status: 'In corso',
    seriesPosterUrl: 'https://image.tmdb.org/t/p/w342/gbSaK9v1CbcYH1ISgbM7XObD2dW.jpg',
    seasons: [
        {
            providerSeasonId: '111803-S1',
            seasonNumber: 1,
            posterUrl: 'https://poster.example/the-white-lotus/stagione-1.jpg',
            episodes: [
                { providerEpisodeId: '111803-S1E1', seasonNumber: 1, episodeNumber: 1, title: 'Arrivi', airDate: '2021-07-11' },
                { providerEpisodeId: '111803-S1E2', seasonNumber: 1, episodeNumber: 2, title: 'Cinque stelle', airDate: '2021-07-18' }
            ]
        },
        {
            providerSeasonId: '111803-S2',
            seasonNumber: 2,
            posterUrl: 'https://poster.example/the-white-lotus/stagione-2.jpg',
            episodes: [
                { providerEpisodeId: '111803-S2E1', seasonNumber: 2, episodeNumber: 1, title: 'Ciao', airDate: '2022-10-30' },
                { providerEpisodeId: '111803-S2E2', seasonNumber: 2, episodeNumber: 2, title: 'Sogno italiano', airDate: '2022-11-06' }
            ]
        }
    ],
    italianProviders: [
        { id: 'now', name: 'NOW' },
        { id: 'sky-go', name: 'Sky Go' }
    ]
};

const SEVERANCE: SampleShow = {
    providerShowId: '95396',
    title: 'Scissione',
    originalTitle: 'Severance',
    year: 2022,
    status: 'In corso',
    seriesPosterUrl: 'https://image.tmdb.org/t/p/w342/jnwqpZpmwvEo0CFLjDwfnnAf4ow.jpg',
    seasons: [
        {
            providerSeasonId: '95396-S0',
            seasonNumber: 0,
            episodes: [
                { providerEpisodeId: '95396-S0E1', seasonNumber: 0, episodeNumber: 1, title: 'Dietro le quinte', airDate: '2022-04-01' }
            ]
        },
        {
            providerSeasonId: '95396-S1',
            seasonNumber: 1,
            posterUrl: 'https://poster.example/scissione/stagione-1.jpg',
            episodes: [
                { providerEpisodeId: '95396-S1E1', seasonNumber: 1, episodeNumber: 1, title: 'Buone notizie sull\'inferno', airDate: '2022-02-18' },
                { providerEpisodeId: '95396-S1E2', seasonNumber: 1, episodeNumber: 2, title: 'Mezzo giro', airDate: '2022-02-18' }
            ]
        }
    ],
    italianProviders: [{ id: 'apple-tv-plus', name: 'Apple TV+' }]
};

const ONLY_MURDERS: SampleShow = {
    providerShowId: '95403',
    title: 'Only Murders in the Building',
    originalTitle: 'Only Murders in the Building',
    year: 2021,
    status: 'In corso',
    seriesPosterUrl: 'https://image.tmdb.org/t/p/w342/dGzOXiVFZRfIWCPE82bYqfEOxb1.jpg',
    seasons: [
        {
            providerSeasonId: '95403-S4',
            seasonNumber: 4,
            posterUrl: 'https://poster.example/only-murders/stagione-4.jpg',
            episodes: [
                { providerEpisodeId: '95403-S4E1', seasonNumber: 4, episodeNumber: 1, title: 'Scialuppa di salvataggio', airDate: '2024-08-27' },
                { providerEpisodeId: '95403-S4E2', seasonNumber: 4, episodeNumber: 2, title: 'Compagni di sparring', airDate: '2024-09-03' }
            ]
        }
    ],
    nextEpisodeToAir: {
        providerEpisodeId: '95403-S4E9',
        seasonNumber: 4,
        episodeNumber: 9,
        title: 'Fuga dal pianeta Klongo',
        airDate: '2099-05-01'
    },
    italianProviders: [
        { id: 'disney-plus', name: 'Disney+' },
        { id: 'prime-video', name: 'Prime Video' }
    ]
};

const SLOW_HORSES: SampleShow = {
    providerShowId: '79093',
    title: 'Slow Horses',
    originalTitle: 'Slow Horses',
    year: 2022,
    status: 'In corso',
    seriesPosterUrl: 'https://image.tmdb.org/t/p/w342/9VCkgs1zefGI2qjJzr1gSwAmzmf.jpg',
    seasons: [
        {
            providerSeasonId: '79093-S4',
            seasonNumber: 4,
            episodes: [
                { providerEpisodeId: '79093-S4E1', seasonNumber: 4, episodeNumber: 1, title: 'Hello Sunshine', airDate: '2024-09-04' },
                { providerEpisodeId: '79093-S4E2', seasonNumber: 4, episodeNumber: 2, title: 'Warsaw Rules', airDate: '2024-09-04' }
            ]
        }
    ],
    italianProviders: []
};

const SAMPLE_SHOWS: readonly SampleShow[] = [THE_BEAR, THE_WHITE_LOTUS, SEVERANCE, ONLY_MURDERS, SLOW_HORSES];

function searchShows(query: string): Promise<SearchShowsOutcome> {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery === '') {
        return Promise.resolve({ outcome: 'found', results: [] });
    }
    const matchingShows = SAMPLE_SHOWS.filter((show) => matchesQuery(show, normalizedQuery));
    const results = matchingShows.map(toSearchResult);
    return Promise.resolve({ outcome: 'found', results });
}

function matchesQuery(show: SampleShow, normalizedQuery: string): boolean {
    return show.title.toLowerCase().includes(normalizedQuery)
            || show.originalTitle.toLowerCase().includes(normalizedQuery);
}

function toSearchResult(show: SampleShow): CatalogSearchResult {
    const posterUrl = findSeasonOnePoster(show.seasons);
    return {
        catalogProvider: 'tmdb',
        providerShowId: show.providerShowId,
        title: show.title,
        originalTitle: show.originalTitle,
        year: show.year,
        status: show.status,
        posterUrl
    };
}

function findSeasonOnePoster(seasons: readonly Season[]): string | undefined {
    return seasons.find((season) => season.seasonNumber === 1)?.posterUrl;
}

function loadShow(providerShowId: string): Promise<LoadShowOutcome> {
    const show = findSampleShow(providerShowId);
    if (show === undefined) {
        return Promise.resolve({ outcome: 'missing' });
    }
    const catalogShow = toCatalogShow(show);
    return Promise.resolve({ outcome: 'found', show: catalogShow });
}

function toCatalogShow(show: SampleShow): CatalogShow {
    return {
        catalogProvider: 'tmdb',
        providerShowId: show.providerShowId,
        title: show.title,
        seriesPosterUrl: show.seriesPosterUrl,
        status: show.status,
        seasons: show.seasons,
        nextEpisodeToAir: show.nextEpisodeToAir
    };
}

function loadItalianProviders(providerShowId: string): Promise<LoadItalianProvidersOutcome> {
    const show = findSampleShow(providerShowId);
    const providers = show?.italianProviders ?? [];
    return Promise.resolve({ outcome: 'loaded', providers });
}

function findSampleShow(providerShowId: string): SampleShow | undefined {
    return SAMPLE_SHOWS.find((show) => show.providerShowId === providerShowId);
}

export const sampleCatalogSource: CatalogSource = {
    searchShows,
    loadShow,
    loadItalianProviders
};
