<script setup lang="ts">
import { usePwaUpdate } from '@/composables/usePwaUpdate';

const pwaUpdate = usePwaUpdate();
</script>

<template>
  <div
    v-if="pwaUpdate.updateAvailable.value"
    class="update-bar"
    role="status"
  >
    <span>Nuova versione disponibile.</span>
    <button
      type="button"
      class="update-btn"
      @click="pwaUpdate.applyUpdate"
    >
      Aggiorna
    </button>
    <button
      type="button"
      class="dismiss-btn"
      aria-label="Ignora l'aggiornamento"
      @click="pwaUpdate.dismiss"
    >
      Ignora
    </button>
  </div>
</template>

<style scoped>
.update-bar {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(env(safe-area-inset-bottom) + 24px);
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 10px 10px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: var(--shadow-dialog);
    font-size: 13px;
}

.update-bar span {
    flex: 1 1 auto;
    font-weight: 700;
}

.update-btn {
    min-height: var(--tap);
    border: 0;
    border-radius: var(--radius-md);
    background: var(--accent);
    color: var(--text-inverse);
    font-weight: 850;
    padding: 0 14px;
}

.dismiss-btn {
    min-height: var(--tap);
    border: 0;
    background: none;
    color: var(--text-dim);
    font-weight: 800;
    padding: 0 6px;
}
</style>
