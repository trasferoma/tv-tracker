<script setup lang="ts">
import { onUnmounted, watch } from 'vue';

const props = defineProps<{ message: string | undefined }>();
const emit = defineEmits<{ dismissed: [] }>();

const TOAST_DURATION_MS = 1900;
let dismissTimer: ReturnType<typeof setTimeout> | undefined;

watch(() => props.message, (message) => {
    clearDismissTimer();
    if (message !== undefined) {
        dismissTimer = setTimeout(() => emit('dismissed'), TOAST_DURATION_MS);
    }
});

onUnmounted(clearDismissTimer);

function clearDismissTimer(): void {
    if (dismissTimer !== undefined) {
        clearTimeout(dismissTimer);
        dismissTimer = undefined;
    }
}
</script>

<template>
  <p
    v-if="message"
    class="toast"
    role="status"
  >
    {{ message }}
  </p>
</template>

<style scoped>
.toast {
    position: fixed;
    left: 50%;
    bottom: calc(env(safe-area-inset-bottom) + 24px);
    transform: translateX(-50%);
    margin: 0;
    padding: 12px 16px;
    border-radius: var(--radius-md);
    background: var(--text);
    color: var(--text-inverse);
    font-weight: 800;
    white-space: nowrap;
    z-index: 20;
}
</style>
