<script setup lang="ts">
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue';

import InitialPositionPicker from './InitialPositionPicker.vue';
import ProviderChoice from './ProviderChoice.vue';
import SearchResultRow from './SearchResultRow.vue';
import { useAddShow, type AddShowDeps } from '@/composables/useAddShow';

const props = defineProps<{
    open: boolean;
    deps?: AddShowDeps;
}>();

const emit = defineEmits<{ close: []; added: [title: string] }>();

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const addShow = useAddShow(props.deps ?? {});

const dialogRef = useTemplateRef<HTMLDialogElement>('dialog');
let previouslyFocusedElement: HTMLElement | null = null;

const searchResults = computed(() => {
    const status = addShow.searchStatus.value;
    return status.kind === 'results' ? status.results : [];
});

const searchMessage = computed(() => {
    const status = addShow.searchStatus.value;
    if (status.kind === 'noResults') {
        return 'Nessun risultato.';
    }
    if (status.kind === 'unavailable') {
        return status.reason;
    }
    if (status.kind === 'searching') {
        return 'Ricerca in corso…';
    }
    return undefined;
});

const chosenPosterStyle = computed(() => {
    const posterUrl = addShow.selectedShow.value?.posterUrl;
    return posterUrl === undefined ? {} : { backgroundImage: `url(${posterUrl})` };
});

onMounted(() => {
    if (props.open) {
        openDialog();
    }
});

watch(() => props.open, (isOpen) => {
    if (isOpen) {
        openDialog();
    } else {
        closeDialog();
        addShow.reset();
    }
});

function openDialog(): void {
    const dialogElement = dialogRef.value;
    if (dialogElement === null) {
        return;
    }
    previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof dialogElement.showModal === 'function') {
        dialogElement.showModal();
    } else {
        dialogElement.setAttribute('open', '');
    }
    void nextTick(() => dialogElement.focus());
}

function closeDialog(): void {
    const dialogElement = dialogRef.value;
    if (dialogElement === null || !dialogElement.open) {
        return;
    }
    if (typeof dialogElement.close === 'function') {
        dialogElement.close();
    } else {
        dialogElement.removeAttribute('open');
    }
    restoreFocus();
}

function restoreFocus(): void {
    previouslyFocusedElement?.focus();
    previouslyFocusedElement = null;
}

function cancelNativeClose(event: Event): void {
    event.preventDefault();
}

function requestClose(): void {
    emit('close');
}

function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        requestClose();
        return;
    }
    if (event.key === 'Tab') {
        trapFocus(event);
    }
}

function trapFocus(event: KeyboardEvent): void {
    const dialogElement = dialogRef.value;
    if (dialogElement === null) {
        return;
    }
    const focusableNodes = dialogElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const focusableElements = Array.from(focusableNodes);
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements.at(-1);
    if (firstFocusable === undefined || lastFocusable === undefined) {
        return;
    }
    const activeElement = document.activeElement;
    const isFocusInsideDialog = focusableElements.some((element) => element === activeElement);
    if (event.shiftKey && (!isFocusInsideDialog || activeElement === firstFocusable)) {
        event.preventDefault();
        lastFocusable.focus();
        return;
    }
    if (!event.shiftKey && (!isFocusInsideDialog || activeElement === lastFocusable)) {
        event.preventDefault();
        firstFocusable.focus();
    }
}

function handleSearchInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    addShow.setQuery(inputElement.value);
}

async function submitAdd(): Promise<void> {
    const chosenTitle = addShow.selectedShow.value?.title ?? '';
    const outcome = await addShow.save();
    if (outcome?.outcome === 'added') {
        emit('added', chosenTitle);
        emit('close');
    }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="add-dialog"
    tabindex="-1"
    @cancel="cancelNativeClose"
    @keydown="handleKeydown"
  >
    <div class="modal-head">
      <h2>Aggiungi una serie</h2>
      <button
        type="button"
        class="icon-btn"
        aria-label="Chiudi"
        @click="requestClose"
      >
        ×
      </button>
    </div>
    <div class="modal-body">
      <template v-if="addShow.step.value === 'search'">
        <input
          class="search"
          placeholder="Cerca per titolo…"
          autocomplete="off"
          :value="addShow.query.value"
          @input="handleSearchInput"
        >
        <p class="hint">
          Il titolo originale e l'anno aiutano a distinguere remake e serie omonime.
        </p>
        <div class="results">
          <SearchResultRow
            v-for="result in searchResults"
            :key="result.providerShowId"
            :result="result"
            @choose="addShow.chooseResult(result)"
          />
          <p
            v-if="searchMessage"
            class="empty"
          >
            {{ searchMessage }}
          </p>
        </div>
      </template>
      <template v-else>
        <div
          v-if="addShow.selectedShow.value"
          class="chosen-show"
        >
          <span
            class="thumb"
            :style="chosenPosterStyle"
          />
          <span>
            <strong>{{ addShow.selectedShow.value.title }}</strong>
            <small v-if="addShow.selectedShow.value.year">{{ addShow.selectedShow.value.year }}</small>
          </span>
        </div>
        <p
          v-if="addShow.isLoadingSelection.value"
          class="loading"
        >
          Caricamento dei dettagli…
        </p>
        <template v-else>
          <ProviderChoice
            v-if="addShow.step.value === 'provider'"
            :providers="addShow.selectedShow.value?.providers ?? []"
            @choose="addShow.chooseProvider"
          />
          <template v-if="addShow.step.value === 'position'">
            <InitialPositionPicker
              :episodes="addShow.selectedShow.value?.episodes ?? []"
              :model-value="addShow.initialPosition.value"
              @update:model-value="addShow.setInitialPosition"
            />
            <p
              v-if="addShow.saveError.value"
              class="error-message"
            >
              {{ addShow.saveError.value }}
            </p>
            <button
              type="button"
              class="primary"
              :disabled="addShow.isSaving.value"
              @click="submitAdd"
            >
              Aggiungi alla lista
            </button>
          </template>
          <button
            type="button"
            class="change-show"
            @click="addShow.backToSearch"
          >
            ← Cambia serie
          </button>
        </template>
      </template>
    </div>
  </dialog>
</template>

<style scoped>
.add-dialog {
    width: min(calc(100% - 24px), 580px);
    max-height: 90vh;
    margin: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--surface);
    color: var(--text);
    padding: 0;
    box-shadow: var(--shadow-dialog);
    overflow-y: auto;
}

.add-dialog::backdrop {
    background: var(--backdrop);
}

.modal-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px 18px 12px;
    position: sticky;
    top: 0;
    background: var(--surface);
}

.modal-head h2 {
    margin: 0;
    font-size: 21px;
}

.icon-btn {
    border: 1px solid var(--border);
    min-width: var(--tap);
    min-height: var(--tap);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--accent);
    font-size: 24px;
}

.modal-body {
    padding: 6px 18px 20px;
}

.search {
    width: 100%;
    min-height: var(--tap);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text);
    padding: 0 14px;
    outline: none;
}

.search:focus-visible {
    border-color: var(--accent);
}

.hint {
    font-size: 12px;
    color: var(--text-dim);
    margin: 8px 2px 14px;
}

.results {
    display: grid;
    gap: 8px;
}

.empty {
    padding: 24px;
    text-align: center;
    color: var(--text-dim);
}

.loading {
    padding: 16px 2px;
    color: var(--text-dim);
}

.chosen-show {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 10px;
    margin-bottom: 16px;
    border-radius: var(--radius-md);
    background: var(--surface-2);
}

.chosen-show .thumb {
    flex: none;
    width: 45px;
    height: 58px;
    border-radius: 8px;
    background: var(--surface-3) center / cover;
}

.primary {
    min-height: var(--tap);
    border: 0;
    border-radius: var(--radius-md);
    background: var(--accent);
    color: var(--text-inverse);
    font-weight: 850;
    padding: 0 16px;
    width: 100%;
    margin-top: 4px;
}

.primary[disabled] {
    opacity: .6;
}

.error-message {
    margin: 10px 2px 0;
    color: var(--danger);
    font-size: 13px;
    text-align: center;
}

.change-show {
    margin-top: 14px;
    border: 0;
    background: none;
    color: var(--accent);
    font-weight: 800;
    padding: 8px 0;
    min-height: var(--tap);
}
</style>
