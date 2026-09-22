<script setup lang="ts">
import type { ShowScope } from '@/domain/showVisibility';

defineProps<{
    scope: ShowScope;
}>();

const emit = defineEmits<{ change: [scope: ShowScope] }>();

function selectScope(scope: ShowScope): void {
    emit('change', scope);
}
</script>

<template>
  <div class="scope-toggle">
    <button
      type="button"
      class="scope-option"
      :aria-pressed="scope === 'all'"
      @click="selectScope('all')"
    >
      Tutto
    </button>
    <button
      type="button"
      class="scope-option"
      :aria-pressed="scope === 'mine'"
      @click="selectScope('mine')"
    >
      Solo le mie
    </button>
  </div>
</template>

<style scoped>
.scope-toggle {
    display: flex;
    gap: 3px;
}

.scope-option {
    min-height: var(--tap);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text-dim);
    font-weight: 750;
    font-size: 13px;
    white-space: nowrap;
    padding: 0 10px;
}

.scope-option[aria-pressed="true"] {
    background: var(--accent-soft);
    color: var(--accent);
}
</style>
