import { describe, expect, it } from 'vitest';

import { advanceProgress } from './progressAdvance';
import { resetProgress } from './progressReset';
import { undoLastProgress } from './progressUndo';
import type { ShowSortMode, SortableShow } from './showSorting';
import { sortShows } from './showSorting';
import type { Episode, TrackedShow } from './trackedShow';
import type { WatchPosition } from './watchPosition';

const DEFAULT_ADDED_AT = '2026-01-01T00:00:00Z';
const CATALOG_TODAY = '2026-03-01';

interface EntryOptions {
    readonly addedAt?: string;
    readonly lastViewedAt?: string;
    readonly backlogCount?: number;
    readonly nextUpcomingAirDate?: string;
}

function buildShow(title: string, addedAt: string, lastViewedAt: string | undefined): TrackedShow {
    return {
        id: title,
        catalogProvider: 'tmdb',
        providerShowId: title,
        title,
        status: 'In corso',
        seasons: [],
        italianProviders: [],
        lastViewedAt,
        progressRevision: 0,
        addedAt,
        updatedAt: addedAt
    };
}

function buildEpisode(airDate: string): Episode {
    return {
        providerEpisodeId: `episode-${airDate}`,
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'Episodio',
        airDate
    };
}

function buildWatchPosition(backlogCount: number, nextUpcomingAirDate: string | undefined): WatchPosition {
    const nextUpcomingEpisode = nextUpcomingAirDate === undefined ? undefined : buildEpisode(nextUpcomingAirDate);
    return {
        nextUnwatchedEpisode: undefined,
        firstUnwatchedEpisode: undefined,
        backlogCount,
        isCaughtUp: backlogCount === 0,
        isCompleted: true,
        nextUpcomingEpisode
    };
}

function buildEntry(title: string, options: EntryOptions = {}): SortableShow {
    const addedAt = options.addedAt ?? DEFAULT_ADDED_AT;
    const show = buildShow(title, addedAt, options.lastViewedAt);
    const watchPosition = buildWatchPosition(options.backlogCount ?? 0, options.nextUpcomingAirDate);
    return { show, watchPosition };
}

function titlesOf(entries: readonly SortableShow[]): readonly string[] {
    return entries.map((entry) => entry.show.title);
}

function buildProgressEpisode(providerEpisodeId: string, episodeNumber: number): Episode {
    return {
        providerEpisodeId,
        seasonNumber: 1,
        episodeNumber,
        title: `Episodio ${episodeNumber}`,
        airDate: '2026-01-01'
    };
}

function buildShowWithEpisodes(title: string): TrackedShow {
    return {
        ...buildShow(title, DEFAULT_ADDED_AT, undefined),
        seasons: [
            {
                providerSeasonId: 'season-1',
                seasonNumber: 1,
                episodes: [buildProgressEpisode('e1', 1), buildProgressEpisode('e2', 2)]
            }
        ]
    };
}

function toSortableEntry(show: TrackedShow): SortableShow {
    return { show, watchPosition: buildWatchPosition(0, undefined) };
}

describe('sortShows', () => {
    it('ordina per ultima attività: prima la conferma «Vista» più recente, poi la data di inserimento per chi non ha conferme, pareggio risolto per titolo (criterio 11)', () => {
        const zeta = buildEntry('Zeta', { lastViewedAt: '2026-02-10T00:00:00Z' });
        const alfa = buildEntry('Alfa', { lastViewedAt: '2026-02-01T00:00:00Z' });
        const beta = buildEntry('Beta', { lastViewedAt: '2026-02-01T00:00:00Z' });
        const gamma = buildEntry('Gamma', { addedAt: '2026-01-15T00:00:00Z' });

        const sorted = sortShows([gamma, beta, zeta, alfa], 'activity');

        expect(titlesOf(sorted)).toEqual(['Zeta', 'Alfa', 'Beta', 'Gamma']);
    });

    it('con «Ultima attività», una serie appena aggiunta va in cima, sopra una confermata il giorno precedente', () => {
        const watchedYesterday = buildEntry('Guardata ieri', { lastViewedAt: '2026-03-09T20:00:00Z' });
        const justAdded = buildEntry('Appena aggiunta', { addedAt: '2026-03-10T08:00:00Z' });

        const sorted = sortShows([watchedYesterday, justAdded], 'activity');

        expect(titlesOf(sorted)).toEqual(['Appena aggiunta', 'Guardata ieri']);
    });

    it('con «Ultima attività», una serie aggiunta tempo fa e mai iniziata si colloca in base alla sua data di inserimento, non finisce sempre in fondo', () => {
        const addedLongAgo = buildEntry('Aggiunta tempo fa', { addedAt: '2026-01-01T00:00:00Z' });
        const watchedRecently = buildEntry('Guardata di recente', { lastViewedAt: '2026-02-01T00:00:00Z' });
        const addedRecently = buildEntry('Aggiunta di recente', { addedAt: '2026-02-15T00:00:00Z' });

        const sorted = sortShows([addedLongAgo, watchedRecently, addedRecently], 'activity');

        expect(titlesOf(sorted)).toEqual(['Aggiunta di recente', 'Guardata di recente', 'Aggiunta tempo fa']);
    });

    it('ordina alfabeticamente sul titolo, con pareggio risolto restando stabile sull\'ordine di partenza (criterio 11)', () => {
        const delta = buildEntry('Delta');
        const alfa = buildEntry('Alfa');
        const betaFirst = buildEntry('Beta', { addedAt: '2026-01-01T00:00:00Z' });
        const betaSecond = buildEntry('Beta', { addedAt: '2026-01-02T00:00:00Z' });

        const sorted = sortShows([delta, betaSecond, alfa, betaFirst], 'alphabetical');

        expect(titlesOf(sorted)).toEqual(['Alfa', 'Beta', 'Beta', 'Delta']);
        expect(sorted[1]).toBe(betaSecond);
        expect(sorted[2]).toBe(betaFirst);
    });

    it('ordina per arretrati decrescenti, con le serie in pari in fondo e pareggio risolto per titolo (criterio 11)', () => {
        const zeta = buildEntry('Zeta', { backlogCount: 5 });
        const alfa = buildEntry('Alfa', { backlogCount: 2 });
        const beta = buildEntry('Beta', { backlogCount: 2 });
        const gamma = buildEntry('Gamma', { backlogCount: 0 });

        const sorted = sortShows([gamma, beta, zeta, alfa], 'unwatched');

        expect(titlesOf(sorted)).toEqual(['Zeta', 'Alfa', 'Beta', 'Gamma']);
    });

    it('ordina per data di inserimento decrescente, con pareggio risolto per titolo (criterio 11)', () => {
        const zeta = buildEntry('Zeta', { addedAt: '2026-02-10T00:00:00Z' });
        const alfa = buildEntry('Alfa', { addedAt: '2026-02-01T00:00:00Z' });
        const beta = buildEntry('Beta', { addedAt: '2026-02-01T00:00:00Z' });
        const gamma = buildEntry('Gamma', { addedAt: '2026-01-01T00:00:00Z' });

        const sorted = sortShows([gamma, beta, zeta, alfa], 'added');

        expect(titlesOf(sorted)).toEqual(['Zeta', 'Alfa', 'Beta', 'Gamma']);
    });

    it('ordina per prossima uscita più vicina, con date ignote e serie senza prossima puntata in fondo, pareggio risolto per titolo (criterio 11)', () => {
        const zeta = buildEntry('Zeta', { nextUpcomingAirDate: '2026-02-05' });
        const alfa = buildEntry('Alfa', { nextUpcomingAirDate: '2026-02-20' });
        const beta = buildEntry('Beta', { nextUpcomingAirDate: '2026-02-20' });
        const gamma = buildEntry('Gamma');

        const sorted = sortShows([gamma, beta, zeta, alfa], 'nextEpisode');

        expect(titlesOf(sorted)).toEqual(['Zeta', 'Alfa', 'Beta', 'Gamma']);
    });

    it('con ordinamento «Ultima attività» la serie appena confermata sale in cima (criterio 12)', () => {
        const alfa = buildEntry('Alfa', { lastViewedAt: '2026-02-01T00:00:00Z' });

        const firstConfirmation = advanceProgress(
            buildShowWithEpisodes('Beta'),
            'e1',
            'fabio',
            '2026-01-01T09:00:00Z',
            CATALOG_TODAY
        );
        if (firstConfirmation.outcome !== 'applied') {
            throw new Error('avanzamento inatteso rifiutato');
        }

        const sortedBeforeConfirmation = sortShows([alfa, toSortableEntry(firstConfirmation.show)], 'activity');
        expect(titlesOf(sortedBeforeConfirmation)).toEqual(['Alfa', 'Beta']);

        const secondConfirmation = advanceProgress(
            firstConfirmation.show,
            'e2',
            'fabio',
            '2026-02-15T09:00:00Z',
            CATALOG_TODAY
        );
        if (secondConfirmation.outcome !== 'applied') {
            throw new Error('avanzamento inatteso rifiutato');
        }

        const sortedAfterConfirmation = sortShows([alfa, toSortableEntry(secondConfirmation.show)], 'activity');
        expect(titlesOf(sortedAfterConfirmation)).toEqual(['Beta', 'Alfa']);
    });

    it('ordina titoli italiani con accenti e articoli secondo il confronto per locale, non secondo l\'ordine dei code unit', () => {
        const angel = buildEntry('Ángel');
        const eSoloLInizio = buildEntry('È solo l\'inizio');
        const ilTrono = buildEntry('Il Trono di Spade');
        const lUltimo = buildEntry('L\'ultimo boyscout');

        const sorted = sortShows([ilTrono, lUltimo, angel, eSoloLInizio], 'alphabetical');

        expect(titlesOf(sorted)).toEqual(['Ángel', 'È solo l\'inizio', 'Il Trono di Spade', 'L\'ultimo boyscout']);
    });

    it('produce lo stesso ordine finale indipendentemente dall\'ordine di partenza quando i criteri sono in pareggio (stabilità)', () => {
        const alfa = buildEntry('Alfa', { lastViewedAt: '2026-01-01T00:00:00Z' });
        const beta = buildEntry('Beta', { lastViewedAt: '2026-01-01T00:00:00Z' });
        const gamma = buildEntry('Gamma', { lastViewedAt: '2026-01-01T00:00:00Z' });

        const sortedFromOneOrder = sortShows([gamma, alfa, beta], 'activity');
        const sortedFromAnotherOrder = sortShows([beta, gamma, alfa], 'activity');

        expect(titlesOf(sortedFromOneOrder)).toEqual(['Alfa', 'Beta', 'Gamma']);
        expect(titlesOf(sortedFromAnotherOrder)).toEqual(['Alfa', 'Beta', 'Gamma']);
    });

    it('non muta l\'array ricevuto', () => {
        const alfa = buildEntry('Alfa', { lastViewedAt: '2026-02-01T00:00:00Z' });
        const beta = buildEntry('Beta', { lastViewedAt: '2026-01-01T00:00:00Z' });
        const entries: readonly SortableShow[] = Object.freeze([beta, alfa]);

        expect(() => sortShows(entries, 'activity')).not.toThrow();
        expect(entries[0]).toBe(beta);
        expect(entries[1]).toBe(alfa);
    });

    it('ordina per arretrati decrescenti anche fra due serie entrambe in pari, senza caso speciale sul valore minimo (criterio 11)', () => {
        const zeta = buildEntry('Zeta', { backlogCount: 0 });
        const alfa = buildEntry('Alfa', { backlogCount: 0 });

        const sorted = sortShows([zeta, alfa], 'unwatched');

        expect(titlesOf(sorted)).toEqual(['Alfa', 'Zeta']);
    });

    it('con «Ultima attività», dopo l\'annullamento di una conferma la serie torna alla posizione precedente, senza restare in cima né precipitare come mai iniziata (Fase 5 + criterio 12)', () => {
        const reference = buildEntry('Riferimento', { lastViewedAt: '2026-02-01T00:00:00Z' });
        const neverStarted = buildEntry('MaiIniziata');

        const firstConfirmation = advanceProgress(
            buildShowWithEpisodes('Serie'),
            'e1',
            'fabio',
            '2026-01-05T09:00:00Z',
            CATALOG_TODAY
        );
        if (firstConfirmation.outcome !== 'applied') {
            throw new Error('avanzamento inatteso rifiutato');
        }
        const secondConfirmation = advanceProgress(
            firstConfirmation.show,
            'e2',
            'fabio',
            '2026-02-15T09:00:00Z',
            CATALOG_TODAY
        );
        if (secondConfirmation.outcome !== 'applied') {
            throw new Error('avanzamento inatteso rifiutato');
        }

        const afterSecondConfirmation = sortShows(
            [reference, neverStarted, toSortableEntry(secondConfirmation.show)],
            'activity'
        );
        expect(titlesOf(afterSecondConfirmation)).toEqual(['Serie', 'Riferimento', 'MaiIniziata']);

        const undoOutcome = undoLastProgress(
            secondConfirmation.show,
            [firstConfirmation.event, secondConfirmation.event],
            secondConfirmation.show.progressRevision,
            'irene',
            '2026-02-20T10:00:00Z'
        );
        if (undoOutcome.outcome !== 'applied') {
            throw new Error('undo inatteso rifiutato');
        }

        const afterUndo = sortShows([reference, neverStarted, toSortableEntry(undoOutcome.show)], 'activity');
        expect(titlesOf(afterUndo)).toEqual(['Riferimento', 'Serie', 'MaiIniziata']);
    });

    it('annullando l\'unica conferma di una serie, questa si ordina per la sua data di inserimento e non sparisce in fondo (Fase 5 + criterio 11)', () => {
        const reference = buildEntry('Riferimento', {
            addedAt: '2025-11-01T00:00:00Z',
            lastViewedAt: '2025-12-01T00:00:00Z'
        });

        const onlyConfirmation = advanceProgress(
            buildShowWithEpisodes('Serie'),
            'e1',
            'fabio',
            '2026-02-10T09:00:00Z',
            CATALOG_TODAY
        );
        if (onlyConfirmation.outcome !== 'applied') {
            throw new Error('avanzamento inatteso rifiutato');
        }

        const beforeUndo = sortShows([reference, toSortableEntry(onlyConfirmation.show)], 'activity');
        expect(titlesOf(beforeUndo)).toEqual(['Serie', 'Riferimento']);

        const undoOutcome = undoLastProgress(
            onlyConfirmation.show,
            [onlyConfirmation.event],
            onlyConfirmation.show.progressRevision,
            'irene',
            '2026-02-11T10:00:00Z'
        );
        if (undoOutcome.outcome !== 'applied') {
            throw new Error('undo inatteso rifiutato');
        }
        expect(undoOutcome.show.lastViewedAt).toBeUndefined();

        const afterUndo = sortShows([reference, toSortableEntry(undoOutcome.show)], 'activity');
        expect(titlesOf(afterUndo)).toEqual(['Serie', 'Riferimento']);
    });

    it('dopo un reset la serie sta in cima sia con «Ultima attività» sia con «Inserite di recente» (criterio 19)', () => {
        const reference = buildEntry('Riferimento', { lastViewedAt: '2026-02-20T00:00:00Z' });

        const confirmation = advanceProgress(
            buildShowWithEpisodes('Serie da azzerare'),
            'e1',
            'fabio',
            '2026-01-15T09:00:00Z',
            CATALOG_TODAY
        );
        if (confirmation.outcome !== 'applied') {
            throw new Error('avanzamento inatteso rifiutato');
        }

        const resetOutcome = resetProgress(
            confirmation.show,
            { kind: 'notStarted' },
            '2026-02-25T09:00:00Z',
            CATALOG_TODAY
        );
        if (resetOutcome.outcome !== 'applied') {
            throw new Error('reset inatteso rifiutato');
        }
        const resetEntry = toSortableEntry(resetOutcome.show);

        const sortedByActivity = sortShows([reference, resetEntry], 'activity');
        const sortedByAdded = sortShows([reference, resetEntry], 'added');

        expect(titlesOf(sortedByActivity)).toEqual(['Serie da azzerare', 'Riferimento']);
        expect(titlesOf(sortedByAdded)).toEqual(['Serie da azzerare', 'Riferimento']);
    });

    it('lancia un errore diagnostico per un criterio di ordinamento non riconosciuto', () => {
        const alfa = buildEntry('Alfa');
        const unknownMode = 'unknown' as ShowSortMode;

        expect(() => sortShows([alfa], unknownMode)).toThrow(/unknown/);
    });
});
