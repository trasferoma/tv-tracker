import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePwaUpdate } from './usePwaUpdate';

const { needRefreshRef, updateServiceWorkerMock } = vi.hoisted(() => ({
    needRefreshRef: { value: false },
    updateServiceWorkerMock: vi.fn(() => Promise.resolve())
}));

vi.mock('virtual:pwa-register/vue', () => ({
    useRegisterSW: () => ({
        needRefresh: needRefreshRef,
        offlineReady: { value: false },
        updateServiceWorker: updateServiceWorkerMock
    })
}));

beforeEach(() => {
    needRefreshRef.value = false;
    updateServiceWorkerMock.mockClear();
});

describe('usePwaUpdate', () => {
    it('non segnala nessun aggiornamento finché il service worker non lo comunica', () => {
        const pwaUpdate = usePwaUpdate();

        expect(pwaUpdate.updateAvailable.value).toBe(false);
    });

    it('espone l\'avviso di aggiornamento quando il service worker lo segnala', () => {
        needRefreshRef.value = true;

        const pwaUpdate = usePwaUpdate();

        expect(pwaUpdate.updateAvailable.value).toBe(true);
    });

    it('ignorare l\'avviso lo nasconde senza applicare l\'aggiornamento', () => {
        needRefreshRef.value = true;
        const pwaUpdate = usePwaUpdate();

        pwaUpdate.dismiss();

        expect(pwaUpdate.updateAvailable.value).toBe(false);
        expect(updateServiceWorkerMock).not.toHaveBeenCalled();
    });

    it('applyUpdate aggiorna il service worker in uso', async () => {
        needRefreshRef.value = true;
        const pwaUpdate = usePwaUpdate();

        await pwaUpdate.applyUpdate();

        expect(updateServiceWorkerMock).toHaveBeenCalledTimes(1);
    });
});
