<script setup lang="ts">
import type { UpcomingBoxView } from '@/composables/useShowDetail';

defineProps<{
    box: UpcomingBoxView;
}>();
</script>

<template>
  <div class="upcoming-episode">
    <span class="upcoming-label">Prossima puntata in arrivo</span>
    <strong>{{ box.headline }}</strong>
    <small>{{ box.dateLabel }}</small>
  </div>
</template>

<style scoped>
.upcoming-episode {
    margin: 12px 14px 14px;
    padding: 13px 14px;
    border: 1px solid var(--warn-border);
    border-radius: var(--radius-md);
    background: var(--warn-soft);
}

.upcoming-label {
    display: block;
    color: var(--warn);
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .04em;
}

.upcoming-episode strong {
    display: block;
    margin-top: 5px;
}

.upcoming-episode small {
    display: block;
    margin-top: 4px;
    color: var(--text-dim);
}
</style>
