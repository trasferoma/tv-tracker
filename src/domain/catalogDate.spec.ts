import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { compareCatalogDates, isAlreadyPublished, toCatalogDate } from './catalogDate';

describe('toCatalogDate', () => {
    beforeEach(() => {
        vi.stubEnv('TZ', 'Pacific/Honolulu');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('non sposta il giorno di calendario a un\'ora limite in un fuso diverso da UTC', () => {
        const lateEveningLocal = new Date(2026, 0, 15, 23, 30);

        expect(lateEveningLocal.getUTCDate()).not.toBe(lateEveningLocal.getDate());
        expect(toCatalogDate(lateEveningLocal)).toBe('2026-01-15');
    });

    it('riempie mese e giorno a due cifre', () => {
        expect(toCatalogDate(new Date(2026, 2, 5, 8, 0))).toBe('2026-03-05');
    });
});

describe('compareCatalogDates', () => {
    it('ordina cronologicamente due date catalogo', () => {
        expect(compareCatalogDates('2026-01-15', '2026-02-01')).toBeLessThan(0);
        expect(compareCatalogDates('2026-02-01', '2026-01-15')).toBeGreaterThan(0);
    });

    it('restituisce zero per due date catalogo uguali', () => {
        expect(compareCatalogDates('2026-01-15', '2026-01-15')).toBe(0);
    });
});

describe('isAlreadyPublished', () => {
    beforeEach(() => {
        vi.stubEnv('TZ', 'Pacific/Kiritimati');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('considera pubblicata una puntata con data catalogo uguale a oggi, al confine di mezzanotte in fuso non UTC', () => {
        const midnightLocal = new Date(2026, 0, 15, 0, 0);
        const today = toCatalogDate(midnightLocal);

        expect(midnightLocal.getUTCDate()).not.toBe(midnightLocal.getDate());
        expect(today).toBe('2026-01-15');
        expect(isAlreadyPublished('2026-01-15', today)).toBe(true);
    });

    it('considera pubblicata una puntata con data catalogo precedente a oggi', () => {
        expect(isAlreadyPublished('2026-01-10', '2026-01-15')).toBe(true);
    });

    it('non considera pubblicata una puntata con data catalogo futura', () => {
        expect(isAlreadyPublished('2026-02-01', '2026-01-15')).toBe(false);
    });

    it('non considera già pubblicato un episodio senza airDate', () => {
        expect(isAlreadyPublished(undefined, '2026-01-15')).toBe(false);
    });
});
