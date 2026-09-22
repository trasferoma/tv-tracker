import pluginVue from 'eslint-plugin-vue';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';

export default defineConfigWithVueTs(
    {
        ignores: [
            'dist/**',
            'dev-dist/**',
            'node_modules/**',
            'mockup/**',
            'coverage/**',
            '.wrangler/**'
        ]
    },
    pluginVue.configs['flat/recommended'],
    vueTsConfigs.recommendedTypeChecked
);
