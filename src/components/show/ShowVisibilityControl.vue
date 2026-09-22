<script setup lang="ts">
import type { ShowAudience } from '@/domain/showVisibility';

defineProps<{
    kind: ShowAudience['kind'];
}>();

const emit = defineEmits<{ change: [kind: ShowAudience['kind']] }>();

function selectKind(kind: ShowAudience['kind']): void {
    emit('change', kind);
}
</script>

<template>
  <div class="visibility-control">
    <h3 class="visibility-heading">
      Chi vede questa serie
    </h3>
    <div class="visibility-options">
      <button
        type="button"
        class="visibility-choice"
        :aria-pressed="kind === 'shared'"
        @click="selectKind('shared')"
      >
        Per tutti
      </button>
      <button
        type="button"
        class="visibility-choice"
        :aria-pressed="kind === 'private'"
        @click="selectKind('private')"
      >
        Solo per me
      </button>
    </div>
  </div>
</template>

<style scoped>
.visibility-control {
    margin: 0 2px 16px;
}

.visibility-heading {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 750;
    color: var(--text-dim);
}

.visibility-options {
    display: flex;
    gap: 9px;
}

.visibility-choice {
    min-height: var(--tap);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text-dim);
    font-weight: 750;
    font-size: 13px;
    padding: 0 14px;
}

.visibility-choice[aria-pressed="true"] {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
}
</style>
