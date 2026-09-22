// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useHiddenShowsPreference } from './useHiddenShowsPreference';

const STORAGE_KEY = 'tv-tracker:show-hidden';

afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.localStorage.clear();
});

describe('useHiddenShowsPreference', () => {
    it('e spenta come impostazione predefinita quando non c\'e nessuna preferenza salvata (criterio 6)', () => {
        const preference = useHiddenShowsPreference();

        expect(preference.showHidden.value).toBe(false);
    });

    it('salva ogni cambio di preferenza, cosi sopravvive a una riapertura simulata sullo stesso dispositivo (criterio 6)', () => {
        const firstOpening = useHiddenShowsPreference();

        firstOpening.showHidden.value = true;

        const secondOpening = useHiddenShowsPreference();
        expect(secondOpening.showHidden.value).toBe(true);
    });

    it('non scrive nulla nei dati condivisi: la preferenza vive solo in localStorage (criterio 6)', () => {
        const preference = useHiddenShowsPreference();

        preference.showHidden.value = true;

        expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe('true');
    });

    it('ignora un valore salvato non riconosciuto e ripiega su spenta', () => {
        globalThis.localStorage.setItem(STORAGE_KEY, 'valore-inesistente');

        const preference = useHiddenShowsPreference();

        expect(preference.showHidden.value).toBe(false);
    });

    it('non lancia quando localStorage nega la lettura, e ripiega su spenta', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => {
                throw new Error('storage bloccato');
            },
            setItem: () => {
                throw new Error('storage bloccato');
            }
        });

        const preference = useHiddenShowsPreference();

        expect(preference.showHidden.value).toBe(false);
    });

    it('non lancia quando localStorage nega la scrittura della nuova preferenza', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => null,
            setItem: () => {
                throw new Error('storage bloccato');
            }
        });
        const preference = useHiddenShowsPreference();

        expect(() => {
            preference.showHidden.value = true;
        }).not.toThrow();
    });
});
