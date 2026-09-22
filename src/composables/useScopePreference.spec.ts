// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useScopePreference } from './useScopePreference';

const STORAGE_KEY = 'tv-tracker:show-scope';

afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.localStorage.clear();
});

describe('useScopePreference', () => {
    it('vale "Tutto" come impostazione predefinita quando non c\'e nessuna preferenza salvata (criterio 4)', () => {
        const preference = useScopePreference();

        expect(preference.scope.value).toBe('all');
    });

    it('salva ogni cambio di lente, cosi sopravvive a una riapertura simulata (criterio 4)', () => {
        const firstOpening = useScopePreference();

        firstOpening.scope.value = 'mine';

        const secondOpening = useScopePreference();
        expect(secondOpening.scope.value).toBe('mine');
    });

    it('ignora un valore salvato non riconosciuto e ripiega su "Tutto"', () => {
        globalThis.localStorage.setItem(STORAGE_KEY, 'lente-inesistente');

        const preference = useScopePreference();

        expect(preference.scope.value).toBe('all');
    });

    it('non lancia quando localStorage nega la lettura, e ripiega su "Tutto"', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => {
                throw new Error('storage bloccato');
            },
            setItem: () => {
                throw new Error('storage bloccato');
            }
        });

        const preference = useScopePreference();

        expect(preference.scope.value).toBe('all');
    });

    it('non lancia quando localStorage nega la scrittura della nuova lente', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => null,
            setItem: () => {
                throw new Error('storage bloccato');
            }
        });
        const preference = useScopePreference();

        expect(() => {
            preference.scope.value = 'mine';
        }).not.toThrow();
    });
});
