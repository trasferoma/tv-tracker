// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSortPreference } from './useSortPreference';

const STORAGE_KEY = 'tv-tracker:sort-preference';

afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.localStorage.clear();
});

describe('useSortPreference', () => {
    it('usa "activity" come criterio predefinito quando non c\'e nessuna preferenza salvata', () => {
        const preference = useSortPreference();

        expect(preference.mode.value).toBe('activity');
    });

    it('salva ogni cambio di criterio, cosi sopravvive a una riapertura simulata', () => {
        const firstOpening = useSortPreference();

        firstOpening.mode.value = 'unwatched';

        const secondOpening = useSortPreference();
        expect(secondOpening.mode.value).toBe('unwatched');
    });

    it('ignora un valore salvato non riconosciuto e ripiega sul criterio predefinito', () => {
        globalThis.localStorage.setItem(STORAGE_KEY, 'criterio-inesistente');

        const preference = useSortPreference();

        expect(preference.mode.value).toBe('activity');
    });

    it('non lancia quando localStorage nega la lettura, e ripiega sul criterio predefinito', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => {
                throw new Error('storage bloccato');
            },
            setItem: () => {
                throw new Error('storage bloccato');
            }
        });

        const preference = useSortPreference();

        expect(preference.mode.value).toBe('activity');
    });

    it('non lancia quando localStorage nega la scrittura del nuovo criterio', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => null,
            setItem: () => {
                throw new Error('storage bloccato');
            }
        });
        const preference = useSortPreference();

        expect(() => {
            preference.mode.value = 'alphabetical';
        }).not.toThrow();
    });
});
