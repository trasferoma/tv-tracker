// @vitest-environment jsdom
import { ref, type Ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionState } from '@/auth/session';

const sessionState = ref<SessionState>({ status: 'anonymous' });
const { watchStopHandles } = vi.hoisted(() => ({ watchStopHandles: [] as Array<{ stopCallCount: number }> }));

vi.mock('@/auth/session', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/auth/session')>();
    return {
        ...actual,
        session: { state: sessionState, login: vi.fn(), logout: vi.fn() }
    };
});

vi.mock('vue', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue')>();
    const wrappedWatch = (source: Ref<SessionState>, callback: (value: SessionState) => void) => {
        const realStop = actual.watch(source, callback);
        const handle = { stopCallCount: 0 };
        watchStopHandles.push(handle);
        return () => {
            handle.stopCallCount += 1;
            realStop();
        };
    };
    return { ...actual, watch: wrappedWatch as typeof actual.watch };
});

const fabioProfile = { id: 'fabio', displayName: 'Fabio', genderIcon: 'male' } as const;

function waitOneMacrotask(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('router — guardia di sessione', () => {
    beforeEach(async () => {
        watchStopHandles.length = 0;
        sessionState.value = { status: 'anonymous' };
        const { router } = await import('@/router');
        await router.push({ name: 'login' });
    });

    it('non tratta la sessione in ripristino come anonima: attende l esito prima di decidere', async () => {
        const { router } = await import('@/router');
        sessionState.value = { status: 'restoring' };

        const navigation = router.push({ name: 'home' });
        await waitOneMacrotask();

        sessionState.value = { status: 'authenticated', profile: fabioProfile };
        await navigation;

        expect(router.currentRoute.value.name).toBe('home');
    });

    it('respinge al login chi non ha identità attiva', async () => {
        const { router } = await import('@/router');
        sessionState.value = { status: 'anonymous' };

        await router.push({ name: 'home' });

        expect(router.currentRoute.value.name).toBe('login');
    });

    it('lascia sempre passare la rotta di login, senza attendere la sessione', async () => {
        const { router } = await import('@/router');
        sessionState.value = { status: 'restoring' };

        await router.push({ name: 'login' });

        expect(router.currentRoute.value.name).toBe('login');
    });

    it('non resta appesa per sempre se il ripristino non si conclude mai: dopo un timeout tratta la sessione come anonima', async () => {
        const { resolveSettledSessionState } = await import('@/router');
        sessionState.value = { status: 'restoring' };

        const settledState = await resolveSettledSessionState({ state: sessionState }, 15);

        expect(settledState).toEqual({ status: 'anonymous' });
    });

    it('ferma l osservazione dello stato quando il timeout scatta, senza lasciarla appesa', async () => {
        const { resolveSettledSessionState } = await import('@/router');
        sessionState.value = { status: 'restoring' };

        await resolveSettledSessionState({ state: sessionState }, 15);

        expect(watchStopHandles).toHaveLength(1);
        expect(watchStopHandles[0]?.stopCallCount).toBe(1);
    });

    it('ferma l osservazione dello stato quando il ripristino si conclude prima del timeout', async () => {
        const { resolveSettledSessionState } = await import('@/router');
        sessionState.value = { status: 'restoring' };

        const pending = resolveSettledSessionState({ state: sessionState }, 5000);
        sessionState.value = { status: 'authenticated', profile: fabioProfile };
        await pending;

        expect(watchStopHandles).toHaveLength(1);
        expect(watchStopHandles[0]?.stopCallCount).toBe(1);
    });

    it('non osserva affatto lo stato quando il ripristino si è già concluso prima di essere interrogata', async () => {
        const { resolveSettledSessionState } = await import('@/router');
        sessionState.value = { status: 'authenticated', profile: fabioProfile };

        const settledState = await resolveSettledSessionState({ state: sessionState });

        expect(settledState).toEqual({ status: 'authenticated', profile: fabioProfile });
        expect(watchStopHandles).toHaveLength(0);
    });
});
