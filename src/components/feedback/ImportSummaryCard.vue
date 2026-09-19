<script setup lang="ts">
import type { BackupImportSummary } from '@/backup/backupImport';

defineProps<{
    summary: BackupImportSummary;
    clockSkewWarning: string;
}>();

const emit = defineEmits<{ merge: []; replace: []; cancel: [] }>();
</script>

<template>
  <div class="import-summary">
    <h2>Importa backup</h2>
    <dl>
      <dt>Serie nel file</dt>
      <dd>{{ summary.totalInFile }}</dd>
      <dt>Nuove</dt>
      <dd>{{ summary.newCount }}</dd>
      <dt>Già presenti</dt>
      <dd>{{ summary.alreadyPresentCount }}</dd>
      <dt>Più recenti nel file</dt>
      <dd>{{ summary.newerThanLocalCount }}</dd>
    </dl>
    <p class="warning">
      {{ clockSkewWarning }}
    </p>
    <div class="actions">
      <button
        type="button"
        class="cancel"
        @click="emit('cancel')"
      >
        Annulla
      </button>
      <button
        type="button"
        class="merge"
        @click="emit('merge')"
      >
        Unisci alle serie locali
      </button>
      <button
        type="button"
        class="replace"
        @click="emit('replace')"
      >
        Sostituisci tutto
      </button>
    </div>
  </div>
</template>

<style scoped>
.import-summary {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    padding: 16px;
    margin-bottom: 18px;
}

.import-summary h2 {
    margin: 0 0 10px;
    font-size: 17px;
}

dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    margin: 0;
}

dt {
    color: var(--text-dim);
    font-size: 13px;
}

dd {
    margin: 0;
    font-weight: 800;
    text-align: right;
}

.warning {
    margin: 12px 0 0;
    color: var(--text-dim);
    font-size: 12px;
    line-height: 1.5;
}

.actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 9px;
    margin-top: 16px;
}

.actions button {
    min-height: var(--tap);
    border-radius: var(--radius-md);
    padding: 0 16px;
    font-weight: 850;
}

.cancel {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
}

.merge {
    border: 0;
    background: var(--accent);
    color: var(--text-inverse);
}

.replace {
    border: 0;
    background: var(--danger);
    color: var(--text-inverse);
}
</style>
