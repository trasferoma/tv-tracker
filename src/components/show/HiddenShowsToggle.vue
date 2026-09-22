<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
    showHidden: boolean;
}>();

const emit = defineEmits<{ change: [showHidden: boolean] }>();

const label = computed(() => props.showHidden ? 'Mostra serie attive' : 'Mostra serie nascoste');

function toggle(): void {
    emit('change', !props.showHidden);
}
</script>

<template>
  <button
    type="button"
    class="hidden-toggle"
    @click="toggle"
  >
    {{ label }}
  </button>
</template>

<style scoped>
.hidden-toggle {
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
