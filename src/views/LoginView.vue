<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { userProfiles, type GenderIcon } from '@/auth/profiles';
import AppIcon from '@/components/icon/AppIcon.vue';
import LocalModeBanner from '@/components/shell/LocalModeBanner.vue';
import { matchSessionState, useAuthSession } from '@/composables/useAuthSession';
import { router } from '@/router';

type ViewMode = 'restoring' | 'redirecting' | 'form';

const RESTORING_MESSAGE = 'Verifica della sessione in corso…';
const REDIRECTING_MESSAGE = 'Accesso effettuato, un momento…';
const GENDER_SYMBOLS: Record<GenderIcon, string> = { male: '♂', female: '♀' };

const authSession = useAuthSession();

const viewMode = computed<ViewMode>(() => matchSessionState(authSession.state.value, {
    restoring: () => 'restoring',
    authenticated: () => 'redirecting',
    anonymous: () => 'form'
}));

const loadingMessage = computed(() => (viewMode.value === 'restoring' ? RESTORING_MESSAGE : REDIRECTING_MESSAGE));

const selectedProfileId = ref('');
const password = ref('');
const errorMessage = ref('');
const isSubmitting = ref(false);

function selectProfile(profileId: string): void {
    selectedProfileId.value = profileId;
    errorMessage.value = '';
}

function genderSymbol(genderIcon: GenderIcon): string {
    return GENDER_SYMBOLS[genderIcon];
}

async function submitLogin(): Promise<void> {
    isSubmitting.value = true;
    const outcome = await authSession.login(selectedProfileId.value, password.value);
    isSubmitting.value = false;
    if (outcome.outcome === 'rejected') {
        errorMessage.value = outcome.reason;
    }
}

watch(authSession.state, (state) => {
    if (state.status === 'authenticated') {
        void router.push({ name: 'home' });
    }
}, { immediate: true });
</script>

<template>
  <section class="login-screen">
    <div class="login-card">
      <div class="login-brand">
        <div class="logo">
          <AppIcon name="play" />
        </div>
        <h1>TV Tracker</h1>
      </div>
      <LocalModeBanner />
      <p
        v-if="viewMode !== 'form'"
        class="login-loading"
        role="status"
      >
        {{ loadingMessage }}
      </p>
      <template v-else>
        <h2>Chi sta guardando?</h2>
        <p class="login-hint">
          Scegli il tuo profilo e inserisci la password.
        </p>
        <div class="profiles">
          <button
            v-for="profile in userProfiles"
            :key="profile.id"
            type="button"
            class="profile-choice"
            :class="[`profile-choice--${profile.id}`, { selected: profile.id === selectedProfileId }]"
            :aria-pressed="profile.id === selectedProfileId"
            @click="selectProfile(profile.id)"
          >
            <span
              class="profile-icon"
              :class="`profile-icon--${profile.id}`"
              aria-hidden="true"
            >{{ genderSymbol(profile.genderIcon) }}</span>
            <span>{{ profile.displayName }}</span>
          </button>
        </div>
        <label
          class="password-label"
          for="loginPassword"
        >
          Password
        </label>
        <input
          id="loginPassword"
          v-model="password"
          class="login-password"
          type="password"
          autocomplete="current-password"
          placeholder="Inserisci la password"
          aria-describedby="loginPasswordNotice"
          :disabled="isSubmitting"
          @keydown.enter="submitLogin"
        >
        <p
          id="loginPasswordNotice"
          class="login-notice"
        >
          La password è la stessa per entrambi: conferma che siete voi due, non quale dei due sta scegliendo. Scegliete con attenzione il profilo giusto.
        </p>
        <button
          type="button"
          class="login-button"
          :disabled="isSubmitting"
          @click="submitLogin"
        >
          Accedi
        </button>
        <p
          class="login-error"
          role="alert"
        >
          {{ errorMessage }}
        </p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.login-screen {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 20px;
}

.login-card {
    width: min(100%, 420px);
    padding: 28px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--surface);
    box-shadow: var(--shadow-login);
}

.login-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 11px;
    margin-bottom: 20px;
}

.logo {
    width: 42px;
    height: 42px;
    flex: 0 0 auto;
    border-radius: var(--radius-md);
    background: var(--accent);
    color: var(--text-inverse);
    display: grid;
    place-items: center;
    box-shadow: var(--shadow-fab);
}

.logo svg {
    width: 20px;
    height: 20px;
}

.login-brand h1 {
    font-size: 25px;
}

.login-loading {
    text-align: center;
    color: var(--text-dim);
    padding: 12px 0;
}

.login-card h2 {
    text-align: center;
    font-size: 19px;
}

.login-hint {
    text-align: center;
    color: var(--text-dim);
    margin: 7px 0 18px;
}

.profiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}

.profile-choice {
    min-height: 112px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--text);
    font-weight: 850;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 7px;
}

.profile-choice:hover,
.profile-choice.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
}

.profile-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 30px;
    font-weight: 900;
}

.profile-icon--fabio {
    background: var(--fabio-soft);
    color: var(--fabio);
}

.profile-icon--irene {
    background: var(--irene-soft);
    color: var(--irene);
}

.password-label {
    display: block;
    margin: 19px 0 7px;
    font-size: 14px;
    font-weight: 800;
}

.login-password {
    width: 100%;
    min-height: var(--tap);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text);
    padding: 0 14px;
    outline: none;
}

.login-password:focus-visible {
    border-color: var(--accent);
}

.login-notice {
    margin: 10px 2px 0;
    color: var(--text-dim);
    font-size: 12px;
    line-height: 1.5;
}

.login-button {
    width: 100%;
    min-height: var(--tap);
    margin-top: 14px;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--accent);
    color: var(--text-inverse);
    font-weight: 900;
}

.login-error {
    min-height: 20px;
    margin: 9px 0 0;
    color: var(--danger);
    font-size: 13px;
    text-align: center;
}
</style>
