<script setup lang="ts">
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue';
import InitialPositionPicker from '@/components/add/InitialPositionPicker.vue';
import type { Episode, InitialPositionChoice } from '@/domain/trackedShow';

const RESET_TITLE = 'Azzerare il tracciamento?';
const RESET_CONFIRM_LABEL = 'Azzera tracciamento';

defineProps<{
    open: boolean;
    episodes: readonly Episode[];
    modelValue: InitialPositionChoice;
    confirmationMessage: string;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: InitialPositionChoice];
    confirm: [];
    cancel: [];
}>();

function updatePosition(position: InitialPositionChoice): void {
    emit('update:modelValue', position);
}

function requestConfirm(): void {
    emit('confirm');
}

function requestCancel(): void {
    emit('cancel');
}
</script>

<template>
  <ConfirmDialog
    :open="open"
    :title="RESET_TITLE"
    :message="confirmationMessage"
    :confirm-label="RESET_CONFIRM_LABEL"
    danger
    @confirm="requestConfirm"
    @cancel="requestCancel"
  >
    <InitialPositionPicker
      :episodes="episodes"
      :model-value="modelValue"
      @update:model-value="updatePosition"
    />
  </ConfirmDialog>
</template>
