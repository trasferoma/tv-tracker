import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserActiveProfileStorage } from './activeProfileStorage';

describe('browserActiveProfileStorage', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('non propaga eccezioni quando localStorage non è disponibile', () => {
        vi.stubGlobal('localStorage', undefined);

        expect(() => browserActiveProfileStorage.load()).not.toThrow();
        expect(browserActiveProfileStorage.load()).toBeUndefined();
        expect(() => browserActiveProfileStorage.save('fabio')).not.toThrow();
        expect(() => browserActiveProfileStorage.clear()).not.toThrow();
    });

    it('non propaga eccezioni quando localStorage lancia', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => {
                throw new Error('storage bloccato');
            },
            setItem: () => {
                throw new Error('storage bloccato');
            },
            removeItem: () => {
                throw new Error('storage bloccato');
            }
        });

        expect(() => browserActiveProfileStorage.load()).not.toThrow();
        expect(() => browserActiveProfileStorage.save('fabio')).not.toThrow();
        expect(() => browserActiveProfileStorage.clear()).not.toThrow();
    });
});
