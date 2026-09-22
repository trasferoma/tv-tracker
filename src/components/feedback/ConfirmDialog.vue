<script setup lang="ts">
import { nextTick, onMounted, useTemplateRef, watch } from 'vue';

const props = withDefaults(defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
}>(), {
    confirmLabel: 'Conferma',
    danger: false
});

const emit = defineEmits<{ confirm: []; cancel: [] }>();

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const dialogRef = useTemplateRef<HTMLDialogElement>('dialog');
let previouslyFocusedElement: HTMLElement | null = null;

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

function requestCancel(): void {
    emit('cancel');
}

function requestConfirm(): void {
    emit('confirm');
}

function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        requestCancel();
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
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm-dialog"
    tabindex="-1"
    @cancel="cancelNativeClose"
    @keydown="handleKeydown"
  >
    <div class="confirm-body">
      <h2>{{ title }}</h2>
      <p>{{ message }}</p>
      <slot />
      <div class="confirm-actions">
        <button
          type="button"
          class="cancel-confirm"
          @click="requestCancel"
        >
          Annulla
        </button>
        <button
          type="button"
          class="accept-confirm"
          :class="{ 'accept-confirm--danger': danger }"
          @click="requestConfirm"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.confirm-dialog {
    width: min(calc(100% - 24px), 480px);
    max-height: 90vh;
    margin: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--surface);
    color: var(--text);
    padding: 0;
    box-shadow: var(--shadow-dialog);
}

.confirm-dialog::backdrop {
    background: var(--backdrop);
}

.confirm-body {
    padding: 18px 20px 20px;
}

.confirm-body h2 {
    margin: 0 0 8px;
    font-size: 21px;
}

.confirm-body p {
    margin: 0;
    color: var(--text-dim);
    line-height: 1.5;
}

.confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 9px;
    margin-top: 22px;
}

.confirm-actions button {
    min-height: var(--tap);
    border-radius: var(--radius-md);
    padding: 0 16px;
    font-weight: 850;
}

.cancel-confirm {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
}

.accept-confirm {
    border: 0;
    background: var(--accent);
    color: var(--text-inverse);
}

.accept-confirm--danger {
    background: var(--danger);
}
</style>
