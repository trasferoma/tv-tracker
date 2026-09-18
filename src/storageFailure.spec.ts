import { describe, expect, it } from 'vitest';

import { runIgnoringStorageFailure } from './storageFailure';

describe('runIgnoringStorageFailure', () => {
    it('restituisce il risultato dell\'operazione quando questa non lancia', () => {
        const result = runIgnoringStorageFailure(() => 'valore', 'fallback');

        expect(result).toBe('valore');
    });

    it('restituisce il fallback quando l\'operazione lancia', () => {
        const result = runIgnoringStorageFailure(() => {
            throw new Error('storage bloccato');
        }, 'fallback');

        expect(result).toBe('fallback');
    });
});
