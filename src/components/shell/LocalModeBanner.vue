<script setup lang="ts">
import { isLocalMode } from '@/localMode';
</script>

<template>
  <p
    v-if="isLocalMode"
    class="local-mode-banner"
    role="status"
  >
    Modalità locale, dati non condivisi.
  </p>
</template>

<style scoped>
.local-mode-banner {
    margin: 0 0 12px;
    padding: 10px 14px;
    border-radius: var(--radius-md);
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 13px;
    font-weight: 700;
    text-align: center;
}
</style>
