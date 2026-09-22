<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
    showCompleted: boolean;
}>();

const emit = defineEmits<{ change: [showCompleted: boolean] }>();

const label = computed(() => props.showCompleted ? 'Nascondi completate' : 'Mostra completate');

function toggle(): void {
    emit('change', !props.showCompleted);
}
</script>

<template>
  <button
    type="button"
    class="completed-toggle"
    @click="toggle"
  >
    {{ label }}
  </button>
</template>

<style scoped>
.completed-toggle {
    min-height: var(--tap);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--accent);
    font-weight: 750;
    font-size: 13px;
    white-space: nowrap;
    padding: 0 10px;
}
</style>
