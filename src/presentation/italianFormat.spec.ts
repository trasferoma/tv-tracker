import { describe, expect, it } from 'vitest';

import {
    formatBacklogHeadline,
    formatCatalogDate,
    formatEpisodeCode,
    formatEpisodeHeadline,
    formatNewEpisodesSummary,
    formatProviderLabel,
    formatUnwatchedCountLabel,
    formatUpcomingEpisodeLabel
} from './italianFormat';

describe('formatCatalogDate', () => {
    it('formatta una data catalogo in italiano', () => {
        expect(formatCatalogDate('2026-02-28')).toBe('28 febbraio 2026');
    });

    it('formatta una data catalogo al confine dell anno', () => {
        expect(formatCatalogDate('2026-01-01')).toBe('1 gennaio 2026');
    });

    it('restituisce un etichetta esplicita quando la data e assente', () => {
        expect(formatCatalogDate(undefined)).toBe('Data non nota');
    });
});

describe('formatUnwatchedCountLabel', () => {
    it('usa il singolare per una sola puntata nuova', () => {
        expect(formatUnwatchedCountLabel(1)).toBe('1 nuova');
    });

    it('usa il plurale per piu puntate nuove', () => {
        expect(formatUnwatchedCountLabel(5)).toBe('5 nuove');
    });

    it('segnala che e in pari quando non ci sono puntate nuove', () => {
        expect(formatUnwatchedCountLabel(0)).toBe('In pari');
    });
});

describe('formatNewEpisodesSummary', () => {
    it('usa il singolare per una sola puntata nuova', () => {
        expect(formatNewEpisodesSummary(1, 1)).toBe('1 nuova puntata in 1 serie');
    });

    it('usa il plurale per piu puntate nuove, come nel mockup', () => {
        expect(formatNewEpisodesSummary(5, 3)).toBe('5 nuove puntate in 3 serie');
    });

    it('segnala che si e in pari con tutto quando non ci sono puntate nuove', () => {
        expect(formatNewEpisodesSummary(0, 0)).toBe('Siete in pari con tutto');
    });
});

describe('formatEpisodeCode', () => {
    it('riempie stagione ed episodio a due cifre', () => {
        expect(formatEpisodeCode(2, 7)).toBe('S02 E07');
    });

    it('non tronca i numeri a due cifre', () => {
        expect(formatEpisodeCode(12, 34)).toBe('S12 E34');
    });
});

describe('formatEpisodeHeadline', () => {
    it('compone codice e titolo separati da un punto medio', () => {
        expect(formatEpisodeHeadline(2, 7, 'Chikhai Bardo')).toBe('S02 E07 · Chikhai Bardo');
    });
});

describe('formatUpcomingEpisodeLabel', () => {
    it('compone etichetta, codice e data catalogo', () => {
        expect(formatUpcomingEpisodeLabel(2, 9, '2026-09-20')).toBe('Prossima puntata: S02 E09 · 20 settembre 2026');
    });

    it('usa l\'etichetta di data non nota quando la data manca', () => {
        expect(formatUpcomingEpisodeLabel(2, 9, undefined)).toBe('Prossima puntata: S02 E09 · Data non nota');
    });
});

describe('formatBacklogHeadline', () => {
    it('usa il singolare per una sola puntata pubblicata', () => {
        expect(formatBacklogHeadline(1)).toBe('1 puntata pubblicata da vedere.');
    });

    it('usa il plurale per piu puntate pubblicate', () => {
        expect(formatBacklogHeadline(4)).toBe('4 puntate pubblicate da vedere.');
    });

    it('segnala l\'assenza di arretrati quando il conteggio e zero', () => {
        expect(formatBacklogHeadline(0)).toBe('Nessuna puntata arretrata.');
    });
});

describe('formatProviderLabel', () => {
    it('aggiunge il suffisso Italia al nome della piattaforma', () => {
        expect(formatProviderLabel('Apple TV+')).toBe('Apple TV+ · Italia');
    });

    it('restituisce undefined quando non c\'e una piattaforma scelta', () => {
        expect(formatProviderLabel(undefined)).toBeUndefined();
    });
});
