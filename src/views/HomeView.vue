<script setup lang="ts">
import { computed, ref } from 'vue';

import { APP_VERSION } from '@/appVersion';
import AddShowDialog from '@/components/add/AddShowDialog.vue';
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import ToastMessage from '@/components/feedback/ToastMessage.vue';
import ShowCard from '@/components/show/ShowCard.vue';
import SortSelect from '@/components/show/SortSelect.vue';
import type { AddShowDeps } from '@/composables/useAddShow';
import { useRefreshNotice } from '@/composables/useRefreshNotice';
import { useSortPreference } from '@/composables/useSortPreference';
import { useTrackedShows } from '@/composables/useTrackedShows';
import type { ShowSortMode } from '@/domain/showSorting';
import { isLocalMode } from '@/localMode';

const WATCH_CONFIRMED_MESSAGE = 'Puntata e precedenti segnate come viste.';
const SAMPLE_DATA_LOADED_MESSAGE = 'Dati di esempio caricati.';
const SHOW_ADDED_FALLBACK_MESSAGE = 'Serie aggiunta alla lista.';

const refreshNotice = useRefreshNotice();
const sortPreference = useSortPreference();
const trackedShows = useTrackedShows(sortPreference.mode);

const toastMessage = ref<string>();
const isAddDialogOpen = ref(false);

const addShowDeps: AddShowDeps = { trackedProviderShowIds: trackedShows.trackedProviderShowIds };

const hasTrackedShows = computed(() => trackedShows.listItems.value.length > 0);
const isConfirmDialogOpen = computed(() => trackedShows.pendingWatch.value !== undefined);
const confirmMessage = computed(() => {
    const target = trackedShows.pendingWatch.value;
    return target === undefined ? '' : `Segnare “${target.episodeHeadline}” e tutte le puntate precedenti come viste?`;
});

function changeSortMode(mode: ShowSortMode): void {
    sortPreference.mode.value = mode;
}

function openAddDialog(): void {
    isAddDialogOpen.value = true;
}

function closeAddDialog(): void {
    isAddDialogOpen.value = false;
}

function handleShowAdded(title: string): void {
    toastMessage.value = title === '' ? SHOW_ADDED_FALLBACK_MESSAGE : `“${title}” aggiunta alla lista.`;
}

function dismissToast(): void {
    toastMessage.value = undefined;
}

async function confirmPendingWatch(): Promise<void> {
    const outcome = await trackedShows.confirmPendingWatch();
    if (outcome === undefined) {
        return;
    }
    toastMessage.value = outcome.outcome === 'applied' ? WATCH_CONFIRMED_MESSAGE : outcome.reason;
}

async function loadSampleData(): Promise<void> {
    await trackedShows.loadSampleData();
    toastMessage.value = SAMPLE_DATA_LOADED_MESSAGE;
}
</script>

<template>
  <section class="home">
    <div class="summary">
      <div>
        <h2>Da vedere</h2>
        <p>{{ trackedShows.summaryText.value }}</p>
      </div>
      <button
        type="button"
        class="refresh"
        @click="refreshNotice.requestRefresh"
      >
        Aggiorna
      </button>
    </div>

    <SortSelect
      v-if="hasTrackedShows"
      :sort-mode="sortPreference.mode.value"
      @change="changeSortMode"
    />

    <div
      v-if="hasTrackedShows"
      class="list"
    >
      <ShowCard
        v-for="item in trackedShows.listItems.value"
        :key="item.id"
        :item="item"
        @watch="trackedShows.requestWatch"
      />
    </div>

    <EmptyState
      v-else
      title="Nessuna serie ancora"
      description="Aggiungete una serie dal pulsante ＋ per iniziare a tracciarla."
    >
      <button
        v-if="isLocalMode"
        type="button"
        class="load-sample"
        @click="loadSampleData"
      >
        Carica dati di esempio
      </button>
    </EmptyState>

    <button
      type="button"
      class="fab"
      aria-label="Aggiungi serie"
      @click="openAddDialog"
    >
      ＋
    </button>

    <AddShowDialog
      :open="isAddDialogOpen"
      :deps="addShowDeps"
      @close="closeAddDialog"
      @added="handleShowAdded"
    />

    <ConfirmDialog
      :open="isConfirmDialogOpen"
      title="Conferma visualizzazione"
      :message="confirmMessage"
      confirm-label="Segna come vista"
      @confirm="confirmPendingWatch"
      @cancel="trackedShows.cancelPendingWatch"
    />

    <ToastMessage
      :message="toastMessage"
      @dismissed="dismissToast"
    />

    <footer class="app-version">
      {{ APP_VERSION }}
    </footer>
  </section>
</template>

<style scoped>
.summary {
    display: flex;
    justify-content: space-between;
    align-items: end;
    margin: 12px 2px 18px;
}

.summary h2 {
    font-size: 27px;
    margin: 0 0 4px;
}

.summary p {
    margin: 0;
    color: var(--text-dim);
    font-size: 14px;
}

.refresh {
    border: 0;
    background: none;
    color: var(--accent);
    font-weight: 800;
    padding: 10px;
    min-height: var(--tap);
}

.list {
    display: grid;
    gap: 14px;
    margin-bottom: 24px;
}

.load-sample {
    margin-top: 16px;
    min-height: var(--tap);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--accent);
    font-weight: 800;
    padding: 0 16px;
}

.fab {
    position: fixed;
    z-index: 6;
    right: max(20px, calc((100vw - 860px) / 2 + 20px));
    bottom: calc(env(safe-area-inset-bottom) + 24px);
    width: 58px;
    height: 58px;
    border-radius: var(--radius-lg);
    border: 0;
    background: var(--accent);
    color: var(--text-inverse);
    font-size: 30px;
    box-shadow: var(--shadow-fab);
}

.app-version {
    margin-top: 40px;
    padding: 20px 0;
    text-align: center;
    color: var(--text-dim);
    font-size: 12px;
}
</style>
