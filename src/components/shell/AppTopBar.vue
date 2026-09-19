<script setup lang="ts">
import { computed } from 'vue';

import { matchSessionState, session } from '@/auth/session';
import AppIcon from '@/components/icon/AppIcon.vue';
import { useCatalogRefresh } from '@/composables/useCatalogRefresh';
import { router } from '@/router';

const emit = defineEmits<{ refresh: [] }>();

const catalogRefresh = useCatalogRefresh();

const activeUserName = computed(() => matchSessionState(session.state.value, {
    restoring: () => '',
    authenticated: (profile) => profile.displayName,
    anonymous: () => ''
}));

function requestRefresh(): void {
    emit('refresh');
}

function logout(): void {
    session.logout();
    void router.push({ name: 'login' });
}
</script>

<template>
  <header class="app-top-bar">
    <div class="brand">
      <div class="logo">
        <AppIcon name="play" />
      </div>
      <div>
        <h1>TV Tracker</h1>
        <p class="sync">
          Lista condivisa · {{ catalogRefresh.lastCheckedLabel.value }}
        </p>
      </div>
    </div>
    <div class="top-actions">
      <span class="user-chip">{{ activeUserName }}</span>
      <button
        type="button"
        class="icon-btn"
        aria-label="Aggiorna"
        :disabled="catalogRefresh.isRefreshing.value"
        @click="requestRefresh"
      >
        <AppIcon name="refresh" />
      </button>
      <button
        type="button"
        class="logout"
        @click="logout"
      >
        Esci
      </button>
    </div>
  </header>
</template>

<style scoped>
.app-top-bar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: calc(env(safe-area-inset-top) + 14px) var(--gutter) 12px;
    background: linear-gradient(var(--bg) 75%, transparent);
}

.brand {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
}

.brand > div {
    min-width: 0;
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

.app-top-bar h1 {
    font-size: 21px;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.sync {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.top-actions {
    display: flex;
    align-items: center;
    gap: 7px;
    flex: 0 0 auto;
}

.user-chip {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap);
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    font-weight: 800;
    white-space: nowrap;
}

.icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--tap);
    min-height: var(--tap);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--accent);
}

.icon-btn[disabled] {
    opacity: .6;
}

.icon-btn svg {
    width: 22px;
    height: 22px;
}

.logout {
    min-height: var(--tap);
    padding: 0 10px;
    border: 0;
    background: none;
    color: var(--text-dim);
    font-weight: 800;
}
</style>
