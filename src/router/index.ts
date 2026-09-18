import { watch } from 'vue';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

import { matchSessionState, session, type Session, type SessionState } from '@/auth/session';

const SESSION_RESTORE_TIMEOUT_MS = 5000;

const routes: RouteRecordRaw[] = [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/serie/:id', name: 'show-detail', component: () => import('@/views/ShowDetailView.vue'), props: true }
];

export const router = createRouter({
    history: createWebHistory(),
    routes
});

export function hasActiveIdentity(state: SessionState): boolean {
    return matchSessionState(state, {
        restoring: () => false,
        authenticated: () => true,
        anonymous: () => false
    });
}

export function resolveSettledSessionState(
    activeSession: Pick<Session, 'state'>,
    restoreTimeoutMs: number = SESSION_RESTORE_TIMEOUT_MS
): Promise<SessionState> {
    if (activeSession.state.value.status !== 'restoring') {
        return Promise.resolve(activeSession.state.value);
    }
    return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
            stopWatching();
            resolve({ status: 'anonymous' });
        }, restoreTimeoutMs);
        const stopWatching = watch(activeSession.state, (settledState) => {
            if (settledState.status === 'restoring') {
                return;
            }
            clearTimeout(timeoutId);
            stopWatching();
            resolve(settledState);
        });
    });
}

router.beforeEach(async (to) => {
    if (to.name === 'login') {
        return true;
    }
    const state = await resolveSettledSessionState(session);
    return hasActiveIdentity(state) ? true : { name: 'login' };
});
