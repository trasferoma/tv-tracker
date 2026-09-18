// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CredentialCheckOutcome } from '@/auth/credentialCheck';
import { userProfiles } from '@/auth/profiles';
import type { SessionState } from '@/auth/session';

const sessionState = ref<SessionState>({ status: 'restoring' });
const loginMock = vi.fn<(profileId: string, password: string) => Promise<CredentialCheckOutcome>>();
const logoutMock = vi.fn();
const pushMock = vi.fn();

vi.mock('@/auth/session', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/auth/session')>();
    return {
        ...actual,
        session: { state: sessionState, login: loginMock, logout: logoutMock }
    };
});

vi.mock('@/router', () => ({ router: { push: pushMock } }));

const FABIO = userProfiles[0]!;
const IRENE = userProfiles[1]!;
const VALID_PASSWORD = 'password-di-test';
const NO_PROFILE_REASON = 'Scegli Fabio oppure Irene.';
const WRONG_PASSWORD_REASON = 'Password non corretta.';

function mockLoginBehaviour(): void {
    loginMock.mockImplementation((profileId, password) => {
        if (profileId === '') {
            return Promise.resolve({ outcome: 'rejected', reason: NO_PROFILE_REASON });
        }
        if (password !== VALID_PASSWORD) {
            return Promise.resolve({ outcome: 'rejected', reason: WRONG_PASSWORD_REASON });
        }
        const profile = profileId === FABIO.id ? FABIO : IRENE;
        sessionState.value = { status: 'authenticated', profile };
        return Promise.resolve({ outcome: 'authenticated', profile });
    });
}

function mockLogoutBehaviour(): void {
    logoutMock.mockImplementation(() => {
        sessionState.value = { status: 'anonymous' };
    });
}

const mountedWrappers: Array<VueWrapper> = [];

async function loadLoginView() {
    const { default: LoginView } = await import('./LoginView.vue');
    const wrapper = mount(LoginView);
    mountedWrappers.push(wrapper);
    return wrapper;
}

async function loadAuthSession() {
    const { useAuthSession } = await import('@/composables/useAuthSession');
    return useAuthSession();
}

beforeEach(() => {
    sessionState.value = { status: 'anonymous' };
    loginMock.mockReset();
    logoutMock.mockReset();
    pushMock.mockReset();
    mockLoginBehaviour();
    mockLogoutBehaviour();
});

afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
        wrapper.unmount();
    }
});

describe('LoginView — stato di ripristino della sessione', () => {
    it('mentre la sessione è "restoring" non mostra il modulo di accesso', async () => {
        sessionState.value = { status: 'restoring' };

        const wrapper = await loadLoginView();

        expect(wrapper.find('.profiles').exists()).toBe(false);
        expect(wrapper.find('.login-password').exists()).toBe(false);
        expect(wrapper.find('.login-loading').text()).toContain('Verifica della sessione');
    });
});

describe('LoginView — criterio 13, accesso alla lista condivisa', () => {
    it('senza identità attiva mostra i due profili e il modulo di accesso', async () => {
        const wrapper = await loadLoginView();

        const profileButtons = wrapper.findAll('.profile-choice');
        expect(profileButtons).toHaveLength(2);
        expect(wrapper.text()).toContain('Fabio');
        expect(wrapper.text()).toContain('Irene');
        expect(wrapper.find('.login-password').exists()).toBe(true);
    });

    it('scegliendo un profilo e inserendo credenziali valide accede e apre la lista condivisa', async () => {
        const wrapper = await loadLoginView();

        await wrapper.find('[aria-pressed]').trigger('click');
        await wrapper.find('.login-password').setValue(VALID_PASSWORD);
        await wrapper.find('.login-button').trigger('click');
        await flushPromises();

        expect(loginMock).toHaveBeenCalledWith(FABIO.id, VALID_PASSWORD);
        expect(pushMock).toHaveBeenCalledWith({ name: 'home' });
    });
});

describe('LoginView — Invio nel campo password', () => {
    it('equivale a premere «Accedi»', async () => {
        const wrapper = await loadLoginView();

        await wrapper.findAll('.profile-choice')[1]!.trigger('click');
        const passwordField = wrapper.find('.login-password');
        await passwordField.setValue(VALID_PASSWORD);
        await passwordField.trigger('keydown', { key: 'Enter' });
        await flushPromises();

        expect(loginMock).toHaveBeenCalledWith(IRENE.id, VALID_PASSWORD);
        expect(pushMock).toHaveBeenCalledWith({ name: 'home' });
    });
});

describe('LoginView — validazioni', () => {
    it('profilo non scelto blocca l\'accesso con il messaggio giusto', async () => {
        const wrapper = await loadLoginView();

        await wrapper.find('.login-password').setValue(VALID_PASSWORD);
        await wrapper.find('.login-button').trigger('click');
        await flushPromises();

        expect(wrapper.find('.login-error').text()).toBe(NO_PROFILE_REASON);
        expect(pushMock).not.toHaveBeenCalled();
    });

    it('password errata mostra il messaggio giusto e lo stato resta invariato', async () => {
        const wrapper = await loadLoginView();

        await wrapper.find('.profile-choice').trigger('click');
        await wrapper.find('.login-password').setValue('password-sbagliata');
        await wrapper.find('.login-button').trigger('click');
        await flushPromises();

        expect(wrapper.find('.login-error').text()).toBe(WRONG_PASSWORD_REASON);
        expect(sessionState.value).toEqual({ status: 'anonymous' });
        expect(pushMock).not.toHaveBeenCalled();
    });

    it('cambiare profilo pulisce il messaggio di errore, come nel mockup', async () => {
        const wrapper = await loadLoginView();
        await wrapper.find('.login-button').trigger('click');
        await flushPromises();
        expect(wrapper.find('.login-error').text()).toBe(NO_PROFILE_REASON);

        await wrapper.find('.profile-choice').trigger('click');

        expect(wrapper.find('.login-error').text()).toBe('');
    });
});

describe('LoginView — criterio 14, serve autenticarsi di nuovo dopo «Esci»', () => {
    it('quando il logout reale azzera la sessione, il modulo di accesso ricompare', async () => {
        sessionState.value = { status: 'authenticated', profile: FABIO };
        const wrapper = await loadLoginView();
        await flushPromises();
        expect(pushMock).toHaveBeenCalledWith({ name: 'home' });

        const authSession = await loadAuthSession();
        authSession.logout();
        await flushPromises();

        expect(logoutMock).toHaveBeenCalledOnce();
        expect(sessionState.value).toEqual({ status: 'anonymous' });
        expect(wrapper.find('.profiles').exists()).toBe(true);
        expect(wrapper.find('.login-password').exists()).toBe(true);
    });

    it('riaprendo l\'app dopo il logout, senza sessione salvata, mostra il modulo di accesso invece di saltare a home', async () => {
        sessionState.value = { status: 'restoring' };
        const wrapper = await loadLoginView();

        sessionState.value = { status: 'anonymous' };
        await flushPromises();

        expect(wrapper.find('.profiles').exists()).toBe(true);
        expect(wrapper.find('.login-password').exists()).toBe(true);
        expect(pushMock).not.toHaveBeenCalled();
    });
});

describe('LoginView — apertura diretta con sessione già attiva', () => {
    it('avvia una sola navigazione verso home, senza duplicati', async () => {
        sessionState.value = { status: 'authenticated', profile: FABIO };

        await loadLoginView();
        await flushPromises();

        expect(pushMock).toHaveBeenCalledOnce();
        expect(pushMock).toHaveBeenCalledWith({ name: 'home' });
    });
});
