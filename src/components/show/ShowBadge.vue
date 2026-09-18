<script setup lang="ts">
defineProps<{
    label: string;
    isCaughtUp: boolean;
}>();
</script>

<template>
  <span
    class="show-badge"
    :class="{ 'show-badge--clear': isCaughtUp }"
  >{{ label }}</span>
</template>

<style scoped>
.show-badge {
    display: inline-flex;
    margin-top: 8px;
    border-radius: 999px;
    padding: 5px 9px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 12px;
    font-weight: 850;
}

.show-badge--clear {
    background: var(--success-soft);
    color: var(--success);
}
</style>
