// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCompletedVisibilityPreference } from './useCompletedVisibilityPreference';

const STORAGE_KEY = 'tv-tracker:show-completed';

afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.localStorage.clear();
});

describe('useCompletedVisibilityPreference', () => {
    it('nasconde le serie completate come impostazione predefinita quando non c\'e nessuna preferenza salvata', () => {
        const preference = useCompletedVisibilityPreference();

        expect(preference.showCompleted.value).toBe(false);
    });

    it('salva ogni cambio di preferenza, cosi sopravvive a una riapertura simulata', () => {
        const firstOpening = useCompletedVisibilityPreference();

        firstOpening.showCompleted.value = true;

        const secondOpening = useCompletedVisibilityPreference();
        expect(secondOpening.showCompleted.value).toBe(true);
    });

    it('ignora un valore salvato non riconosciuto e ripiega sul nascondere le completate', () => {
        globalThis.localStorage.setItem(STORAGE_KEY, 'valore-inesistente');

        const preference = useCompletedVisibilityPreference();

        expect(preference.showCompleted.value).toBe(false);
    });

    it('non lancia quando localStorage nega la lettura, e ripiega sul nascondere le completate', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => {
                throw new Error('storage bloccato');
            },
            setItem: () => {
                throw new Error('storage bloccato');
            }
        });

        const preference = useCompletedVisibilityPreference();

        expect(preference.showCompleted.value).toBe(false);
    });

    it('non lancia quando localStorage nega la scrittura della nuova preferenza', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => null,
            setItem: () => {
                throw new Error('storage bloccato');
            }
        });
        const preference = useCompletedVisibilityPreference();

        expect(() => {
            preference.showCompleted.value = true;
        }).not.toThrow();
    });
});
