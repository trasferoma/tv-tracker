import { describe, expect, it } from 'vitest';

import { mergeAnnouncedEpisode, mergeCatalogUpdate, type AnnouncedEpisodeCatalog, type CatalogUpdate } from './catalogMerge';
import type { Episode, Season, TrackedShow } from './trackedShow';
import { calculateWatchPosition } from './watchPosition';

const UPDATED_AT = '2026-03-01T09:00:00.000Z';

function buildEpisode(seasonNumber: number, episodeNumber: number, providerEpisodeId?: string): Episode {
    return {
        providerEpisodeId: providerEpisodeId ?? `s${seasonNumber}e${episodeNumber}`,
        seasonNumber,
        episodeNumber,
        title: `S${seasonNumber}E${episodeNumber}`,
        airDate: '2026-01-01'
    };
}

function buildSeason(seasonNumber: number, episodes: readonly Episode[]): Season {
    return { providerSeasonId: `season-${seasonNumber}`, seasonNumber, episodes };
}

function buildShow(overrides: Partial<TrackedShow> = {}): TrackedShow {
    return {
        id: 'show-1',
        catalogProvider: 'tmdb',
        providerShowId: 'tmdb-1',
        title: 'Serie di prova',
        status: 'In corso',
        seasons: [buildSeason(1, [buildEpisode(1, 1), buildEpisode(1, 2)])],
        italianProviders: [],
        progressRevision: 0,
        addedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides
    };
}

function buildCatalogUpdate(overrides: Partial<CatalogUpdate> = {}): CatalogUpdate {
    return {
        title: 'Serie di prova',
        status: 'In corso',
        seasons: [buildSeason(1, [buildEpisode(1, 1), buildEpisode(1, 2)])],
        ...overrides
    };
}

function deepFreeze<T>(value: T): T {
    if (Array.isArray(value)) {
        value.forEach(deepFreeze);
        return Object.freeze(value) as T;
    }
    if (value !== null && typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach(deepFreeze);
        return Object.freeze(value);
    }
    return value;
}

describe('mergeAnnouncedEpisode — puntata assente dall\'elenco', () => {
    it('la aggiunge alla stagione giusta, nella posizione giusta', () => {
        const episode1 = buildEpisode(4, 1);
        const episode3 = buildEpisode(4, 3);
        const announcedEpisode2 = buildEpisode(4, 2);
        const catalog: AnnouncedEpisodeCatalog = {
            seasons: [buildSeason(4, [episode1, episode3])],
            nextEpisodeToAir: announcedEpisode2
        };

        const seasons = mergeAnnouncedEpisode(catalog);

        const expectedSeasons = [buildSeason(4, [episode1, announcedEpisode2, episode3])];
        expect(seasons).toEqual(expectedSeasons);
    });
});

describe('mergeAnnouncedEpisode — puntata già presente', () => {
    it('non la duplica', () => {
        const episode1 = buildEpisode(4, 1);
        const episode2 = buildEpisode(4, 2);
        const catalog: AnnouncedEpisodeCatalog = {
            seasons: [buildSeason(4, [episode1, episode2])],
            nextEpisodeToAir: buildEpisode(4, 2)
        };

        const seasons = mergeAnnouncedEpisode(catalog);

        const expectedSeasons = [buildSeason(4, [episode1, episode2])];
        expect(seasons).toEqual(expectedSeasons);
    });
});

describe('mergeAnnouncedEpisode — nessuna puntata annunciata', () => {
    it('restituisce il catalogo invariato', () => {
        const originalSeasons = [buildSeason(1, [buildEpisode(1, 1)])];
        const catalog: AnnouncedEpisodeCatalog = { seasons: originalSeasons };

        const seasons = mergeAnnouncedEpisode(catalog);

        expect(seasons).toBe(originalSeasons);
        expect(seasons).toEqual(originalSeasons);
    });
});

describe('mergeAnnouncedEpisode — nessuna mutazione degli oggetti in ingresso', () => {
    it('funziona anche con catalogo, stagioni ed episodi congelati', () => {
        const seasons = [buildSeason(4, [buildEpisode(4, 1)])];
        const nextEpisodeToAir = buildEpisode(4, 9);
        const catalog = deepFreeze<AnnouncedEpisodeCatalog>({ seasons, nextEpisodeToAir });

        const mergedSeasons = mergeAnnouncedEpisode(catalog);

        const expectedSeasons = [buildSeason(4, [buildEpisode(4, 1), buildEpisode(4, 9)])];
        expect(mergedSeasons).toEqual(expectedSeasons);
    });
});

describe('mergeAnnouncedEpisode — stagione della puntata annunciata non ancora nel catalogo', () => {
    it('crea la stagione con la sola puntata annunciata', () => {
        const catalog: AnnouncedEpisodeCatalog = {
            seasons: [buildSeason(1, [buildEpisode(1, 1)])],
            nextEpisodeToAir: buildEpisode(2, 1)
        };

        const seasons = mergeAnnouncedEpisode(catalog);

        const createdSeason: Season = { providerSeasonId: 'season-2', seasonNumber: 2, episodes: [buildEpisode(2, 1)] };
        const expectedSeasons = [buildSeason(1, [buildEpisode(1, 1)]), createdSeason];
        expect(seasons).toEqual(expectedSeasons);
    });
});

function mergeOrFail(show: TrackedShow, update: CatalogUpdate, updatedAt: string): TrackedShow {
    const outcome = mergeCatalogUpdate(show, update, updatedAt);
    if (outcome.outcome === 'rejected') {
        throw new Error(`mergeCatalogUpdate inaspettatamente rifiutato: ${outcome.reason}`);
    }
    return outcome.show;
}

describe('mergeCatalogUpdate — dati editoriali aggiornati', () => {
    it('aggiorna titolo, locandina e stato senza spostare la posizione vista', () => {
        const show = buildShow({ lastWatchedEpisodeId: 's1e1', title: 'Titolo vecchio', status: 'In corso' });
        const update = buildCatalogUpdate({ title: 'Titolo nuovo', status: 'Conclusa', seriesPosterUrl: 'nuova-locandina.jpg' });

        const updatedShow = mergeOrFail(show, update, UPDATED_AT);

        expect(updatedShow.title).toBe('Titolo nuovo');
        expect(updatedShow.status).toBe('Conclusa');
        expect(updatedShow.seriesPosterUrl).toBe('nuova-locandina.jpg');
        expect(updatedShow.lastWatchedEpisodeId).toBe('s1e1');
    });

    it('valorizza catalogUpdatedAt e updatedAt con l\'istante ricevuto', () => {
        const show = buildShow();
        const update = buildCatalogUpdate();

        const updatedShow = mergeOrFail(show, update, UPDATED_AT);

        expect(updatedShow.catalogUpdatedAt).toBe(UPDATED_AT);
        expect(updatedShow.updatedAt).toBe(UPDATED_AT);
    });

    it('una serie mai iniziata resta mai iniziata dopo l\'aggiornamento', () => {
        const show = buildShow({ lastWatchedEpisodeId: undefined });
        const update = buildCatalogUpdate();

        const updatedShow = mergeOrFail(show, update, UPDATED_AT);

        expect(updatedShow.lastWatchedEpisodeId).toBeUndefined();
    });

    it('una nuova puntata annunciata alza gli arretrati senza spostare la posizione (criterio 8)', () => {
        const show = buildShow({
            lastWatchedEpisodeId: 's1e1',
            seasons: [buildSeason(1, [buildEpisode(1, 1), buildEpisode(1, 2)])]
        });
        const positionBefore = calculateWatchPosition(show, '2026-04-01');

        const update = buildCatalogUpdate({
            seasons: show.seasons,
            nextEpisodeToAir: buildEpisode(1, 3)
        });
        const updatedShow = mergeOrFail(show, update, UPDATED_AT);
        const positionAfter = calculateWatchPosition(updatedShow, '2026-04-01');

        expect(updatedShow.lastWatchedEpisodeId).toBe(show.lastWatchedEpisodeId);
        expect(positionAfter.backlogCount).toBeGreaterThan(positionBefore.backlogCount);
    });

    it('un episodio rinominato che non è la posizione vista non la sposta', () => {
        const show = buildShow({
            lastWatchedEpisodeId: 's1e1',
            seasons: [buildSeason(1, [buildEpisode(1, 1), buildEpisode(1, 2, 's1e2')])]
        });
        const renamedEpisode: Episode = { ...buildEpisode(1, 2, 's1e2-rinominato'), title: 'Titolo rinominato' };
        const update = buildCatalogUpdate({ seasons: [buildSeason(1, [buildEpisode(1, 1), renamedEpisode])] });

        const updatedShow = mergeOrFail(show, update, UPDATED_AT);

        expect(updatedShow.lastWatchedEpisodeId).toBe('s1e1');
    });

    it('ripiega sull\'episodio precedente ancora esistente quando quello visto sparisce, mai su "Da iniziare" (decisione 4)', () => {
        const show = buildShow({
            lastWatchedEpisodeId: 's1e2',
            seasons: [buildSeason(1, [buildEpisode(1, 1), buildEpisode(1, 2), buildEpisode(1, 3)])]
        });
        const update = buildCatalogUpdate({
            seasons: [buildSeason(1, [buildEpisode(1, 1), buildEpisode(1, 3)])]
        });

        const updatedShow = mergeOrFail(show, update, UPDATED_AT);

        expect(updatedShow.lastWatchedEpisodeId).toBe('s1e1');
        expect(updatedShow.lastWatchedEpisodeId).not.toBeUndefined();
    });

    it('ripiega ricorsivamente su un episodio ancora precedente se anche il primo tentativo è sparito', () => {
        const show = buildShow({
            lastWatchedEpisodeId: 's1e3',
            seasons: [buildSeason(1, [buildEpisode(1, 1), buildEpisode(1, 2), buildEpisode(1, 3), buildEpisode(1, 4)])]
        });
        const update = buildCatalogUpdate({
            seasons: [buildSeason(1, [buildEpisode(1, 1), buildEpisode(1, 4)])]
        });

        const updatedShow = mergeOrFail(show, update, UPDATED_AT);

        expect(updatedShow.lastWatchedEpisodeId).toBe('s1e1');
    });

    it('rifiuta l\'aggiornamento quando nessun episodio già visto sopravvive, senza scrivere mai la posizione orfana', () => {
        const show = buildShow({
            lastWatchedEpisodeId: 's1e1',
            title: 'Titolo vecchio',
            seasons: [buildSeason(1, [buildEpisode(1, 1)])]
        });
        const update = buildCatalogUpdate({ title: 'Titolo nuovo', seasons: [buildSeason(2, [buildEpisode(2, 1)])] });

        const outcome = mergeCatalogUpdate(show, update, UPDATED_AT);

        expect(outcome.outcome).toBe('rejected');
        if (outcome.outcome === 'rejected') {
            expect(outcome.reason.length).toBeGreaterThan(0);
        }
        expect(() => calculateWatchPosition(show, '2026-04-01')).not.toThrow();
    });
});
