<script setup lang="ts">
import { computed } from 'vue';

import type { SearchResultItem } from '@/composables/useAddShow';

const props = defineProps<{
    result: SearchResultItem;
}>();

defineEmits<{ choose: [] }>();

const posterStyle = computed(() => (
    props.result.posterUrl === undefined ? {} : { backgroundImage: `url(${props.result.posterUrl})` }
));

const metaLabel = computed(() => (
    props.result.year === undefined ? props.result.originalTitle : `${props.result.originalTitle} · ${props.result.year}`
));
</script>

<template>
  <button
    type="button"
    class="result"
    @click="$emit('choose')"
  >
    <span
      class="thumb"
      :style="posterStyle"
    />
    <span class="result-info">
      <strong>{{ result.title }}</strong>
      <small>{{ metaLabel }}</small>
    </span>
    <span
      class="plus"
      aria-hidden="true"
    >＋</span>
  </button>
</template>

<style scoped>
.result {
    display: grid;
    grid-template-columns: 45px 1fr auto;
    align-items: center;
    gap: 11px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    border-radius: var(--radius-md);
    padding: 8px;
    text-align: left;
    color: var(--text);
    min-height: var(--tap);
    width: 100%;
}

.thumb {
    width: 45px;
    height: 58px;
    border-radius: 8px;
    background: var(--surface-3) center / cover;
}

.result-info {
    display: block;
    min-width: 0;
}

.result-info strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.result-info small {
    display: block;
    color: var(--text-dim);
    margin-top: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.plus {
    color: var(--accent);
    font-size: 24px;
    padding-right: 7px;
}
</style>
