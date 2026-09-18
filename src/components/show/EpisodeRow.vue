<script setup lang="ts">
import type { EpisodeRowView } from '@/composables/useShowDetail';

const props = defineProps<{
    episode: EpisodeRowView;
}>();

const emit = defineEmits<{ watch: [episodeId: string] }>();

function requestWatch(): void {
    emit('watch', props.episode.id);
}
</script>

<template>
  <div class="episode-row">
    <div>
      <strong>{{ episode.headline }}</strong>
      <small>{{ episode.dateLabel }}</small>
    </div>
    <button
      v-if="episode.canMarkWatched"
      type="button"
      class="mini"
      @click="requestWatch"
    >
      Vista
    </button>
  </div>
</template>

<style scoped>
.episode-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 13px 15px;
    border-top: 1px solid var(--border);
}

.episode-row small {
    display: block;
    color: var(--text-dim);
    margin-top: 3px;
}

.mini {
    min-height: var(--tap);
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: var(--text-inverse);
    font-weight: 850;
    padding: 0 12px;
}
</style>
