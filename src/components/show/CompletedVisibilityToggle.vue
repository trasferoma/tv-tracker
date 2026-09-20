<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
    showCompleted: boolean;
    completedCount: number;
}>();

const emit = defineEmits<{ change: [showCompleted: boolean] }>();

const label = computed(() => props.showCompleted
    ? `Nascondi completate (${props.completedCount})`
    : `Mostra completate (${props.completedCount})`);

function toggle(): void {
    emit('change', !props.showCompleted);
}
</script>

<template>
  <div class="completed-toggle-row">
    <button
      type="button"
      class="completed-toggle"
      @click="toggle"
    >
      {{ label }}
    </button>
  </div>
</template>

<style scoped>
.completed-toggle-row {
    display: flex;
    justify-content: flex-end;
    margin: 0 2px 14px;
}

.completed-toggle {
    min-height: var(--tap);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--accent);
    font-weight: 750;
    font-size: 13px;
    padding: 0 14px;
}
</style>
