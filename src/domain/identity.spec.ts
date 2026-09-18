import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateId } from './identity';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('generateId', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('genera un UUID valido tramite crypto.randomUUID quando disponibile', () => {
        expect(generateId()).toMatch(UUID_V4_PATTERN);
    });

    it('genera un UUID v4 valido con il ripiego su crypto.getRandomValues', () => {
        const cryptoWithoutRandomUuid = { getRandomValues: crypto.getRandomValues.bind(crypto) };
        vi.stubGlobal('crypto', cryptoWithoutRandomUuid);

        expect(generateId()).toMatch(UUID_V4_PATTERN);
    });

    it('genera identificatori distinti a ogni chiamata', () => {
        const ids = new Set(Array.from({ length: 20 }, () => generateId()));

        expect(ids.size).toBe(20);
    });
});
