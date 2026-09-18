<script setup lang="ts">
import type { ShowSortMode } from '@/domain/showSorting';

defineProps<{
    sortMode: ShowSortMode;
}>();

const emit = defineEmits<{ change: [mode: ShowSortMode] }>();

const SORT_OPTIONS: ReadonlyArray<{ value: ShowSortMode; label: string }> = [
    { value: 'activity', label: 'Ultima attività' },
    { value: 'alphabetical', label: 'Titolo A–Z' },
    { value: 'unwatched', label: 'Più puntate da vedere' },
    { value: 'added', label: 'Inserite di recente' },
    { value: 'nextEpisode', label: 'Prossima uscita' }
];

function handleChange(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    emit('change', selectElement.value as ShowSortMode);
}
</script>

<template>
  <div class="sort-row">
    <label for="sortMode">Ordina per</label>
    <select
      id="sortMode"
      class="sort-select"
      :value="sortMode"
      @change="handleChange"
    >
      <option
        v-for="option in SORT_OPTIONS"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.sort-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 2px 14px;
}

.sort-row label {
    color: var(--text-dim);
    font-size: 14px;
    font-weight: 750;
}

.sort-select {
    min-height: var(--tap);
    max-width: 230px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    padding: 0 12px;
    font-weight: 750;
}
</style>
