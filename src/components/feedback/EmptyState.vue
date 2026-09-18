<script setup lang="ts">
import { computed } from 'vue';

import AppIcon, { type IconName } from '@/components/icon/AppIcon.vue';

const props = defineProps<{
    title: string;
    description: string;
    icon?: IconName;
}>();

const icon = computed(() => props.icon ?? 'empty');
</script>

<template>
  <div class="empty-state">
    <AppIcon :name="icon" />
    <strong>{{ title }}</strong>
    <p>{{ description }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty-state {
    text-align: center;
    padding: 32px 20px;
    border: 1px dashed var(--border);
    border-radius: var(--radius-lg);
    color: var(--text-dim);
}

.empty-state svg {
    width: 30px;
    height: 30px;
    color: var(--text-dim);
    margin-bottom: 10px;
}

.empty-state strong {
    display: block;
    color: var(--text);
    font-size: 15px;
    margin-bottom: 4px;
}

.empty-state p {
    margin: 0;
    font-size: 13px;
}
</style>
