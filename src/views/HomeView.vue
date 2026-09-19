<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue';

import { APP_VERSION } from '@/appVersion';
import AddShowDialog from '@/components/add/AddShowDialog.vue';
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue';
import EmptyState from '@/components/feedback/EmptyState.vue';
import ImportSummaryCard from '@/components/feedback/ImportSummaryCard.vue';
import ToastMessage from '@/components/feedback/ToastMessage.vue';
import ShowCard from '@/components/show/ShowCard.vue';
import SortSelect from '@/components/show/SortSelect.vue';
import type { AddShowDeps } from '@/composables/useAddShow';
import { useBackup } from '@/composables/useBackup';
import { useCatalogRefresh } from '@/composables/useCatalogRefresh';
import { useRefreshNotice } from '@/composables/useRefreshNotice';
import { useSortPreference } from '@/composables/useSortPreference';
import { useTrackedShows } from '@/composables/useTrackedShows';
import type { ShowSortMode } from '@/domain/showSorting';
import { isLocalMode } from '@/localMode';

const WATCH_CONFIRMED_MESSAGE = 'Puntata e precedenti segnate come viste.';
const SAMPLE_DATA_LOADED_MESSAGE = 'Dati di esempio caricati.';
const SHOW_ADDED_FALLBACK_MESSAGE = 'Serie aggiunta alla lista.';
const BACKUP_EXPORTED_MESSAGE = 'Backup esportato.';
const BACKUP_MERGED_MESSAGE = 'Backup unito alle serie locali.';
const BACKUP_REPLACED_MESSAGE = 'Serie locali sostituite con il contenuto del backup.';
const REPLACE_CONFIRM_MESSAGE = 'Le serie locali non presenti nel file verranno perdute. Continuare?';

const refreshNotice = useRefreshNotice();
const catalogRefresh = useCatalogRefresh();
const sortPreference = useSortPreference();
const trackedShows = useTrackedShows(sortPreference.mode);
const backup = useBackup();

const toastMessage = ref<string>();
const isAddDialogOpen = ref(false);
const isReplaceConfirmOpen = ref(false);
const importFileInput = useTemplateRef<HTMLInputElement>('import-file-input');

onMounted(() => {
    void catalogRefresh.checkBackgroundRefresh();
});

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

const importSummary = computed(() => {
    const readiness = backup.importReadiness.value;
    return readiness.state === 'ready' ? readiness : undefined;
});

async function exportBackupFile(): Promise<void> {
    await backup.exportBackup();
    toastMessage.value = BACKUP_EXPORTED_MESSAGE;
}

function openImportPicker(): void {
    importFileInput.value?.click();
}

async function handleImportFileSelected(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const selectedFile = inputElement.files?.[0];
    inputElement.value = '';
    if (selectedFile === undefined) {
        return;
    }
    const fileContent = await selectedFile.text();
    await backup.prepareImport(fileContent);
    const readiness = backup.importReadiness.value;
    if (readiness.state === 'invalid') {
        toastMessage.value = readiness.reason;
    }
}

async function confirmMergeImport(): Promise<void> {
    const outcome = await backup.confirmMerge();
    if (outcome === undefined) {
        return;
    }
    toastMessage.value = outcome.outcome === 'replaced' ? BACKUP_MERGED_MESSAGE : outcome.reason;
}

function requestReplaceImport(): void {
    isReplaceConfirmOpen.value = true;
}

function cancelReplaceImport(): void {
    isReplaceConfirmOpen.value = false;
}

async function confirmReplaceImport(): Promise<void> {
    isReplaceConfirmOpen.value = false;
    const outcome = await backup.confirmReplace();
    if (outcome === undefined) {
        return;
    }
    toastMessage.value = outcome.outcome === 'replaced' ? BACKUP_REPLACED_MESSAGE : outcome.reason;
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
        :disabled="catalogRefresh.isRefreshing.value"
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

    <ConfirmDialog
      :open="isReplaceConfirmOpen"
      title="Sostituire tutte le serie?"
      :message="REPLACE_CONFIRM_MESSAGE"
      confirm-label="Sostituisci tutto"
      danger
      @confirm="confirmReplaceImport"
      @cancel="cancelReplaceImport"
    />

    <ToastMessage
      :message="toastMessage"
      @dismissed="dismissToast"
    />

    <section class="backup">
      <h2>Backup</h2>
      <p>Esporta un file JSON di riserva oppure importane uno per unire o sostituire le serie locali.</p>
      <div class="backup-actions">
        <button
          type="button"
          class="backup-action"
          @click="exportBackupFile"
        >
          Esporta backup
        </button>
        <button
          type="button"
          class="backup-action"
          @click="openImportPicker"
        >
          Importa backup
        </button>
      </div>
      <input
        ref="import-file-input"
        type="file"
        accept="application/json"
        class="import-file-input"
        @change="handleImportFileSelected"
      >
      <ImportSummaryCard
        v-if="importSummary"
        :summary="importSummary.summary"
        :clock-skew-warning="importSummary.clockSkewWarning"
        @merge="confirmMergeImport"
        @replace="requestReplaceImport"
        @cancel="backup.cancelImport"
      />
    </section>

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

.refresh[disabled] {
    opacity: .6;
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

.backup {
    margin-top: 32px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
}

.backup h2 {
    font-size: 16px;
    margin: 0 0 4px;
}

.backup > p {
    margin: 0 0 12px;
    color: var(--text-dim);
    font-size: 13px;
}

.backup-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
}

.backup-action {
    min-height: var(--tap);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--accent);
    font-weight: 800;
    padding: 0 16px;
}

.import-file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}
</style>
