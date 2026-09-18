import type { IncomingMessage } from 'node:http';
import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { loadEnv, type HttpProxy, type ProxyOptions } from 'vite';
import { defineConfig } from 'vitest/config';

import { resolveTmdbTargetPath, TMDB_API_ORIGIN, TMDB_PROXY_PATH } from './src/catalog/tmdbRequest';

const srcDirUrl = new URL('./src', import.meta.url);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const tmdbProxyOptions = buildTmdbProxyOptions(env.TMDB_READ_ACCESS_TOKEN);

    return {
        plugins: [vue()],
        resolve: {
            alias: {
                '@': fileURLToPath(srcDirUrl)
            }
        },
        server: {
            proxy: {
                [TMDB_PROXY_PATH]: tmdbProxyOptions
            }
        },
        test: {
            environment: 'node',
            include: ['src/**/*.spec.ts'],
            setupFiles: ['./vitest.setup.ts']
        }
    };
});

function buildTmdbProxyOptions(tmdbReadAccessToken: string | undefined): ProxyOptions {
    return {
        target: TMDB_API_ORIGIN,
        changeOrigin: true,
        bypass: bypassDisallowedTmdbRequest,
        rewrite: rewriteToTmdbPath,
        configure: (proxy) => registerTmdbAuthorization(proxy, tmdbReadAccessToken)
    };
}

function bypassDisallowedTmdbRequest(req: IncomingMessage): false | undefined {
    const incomingUrl = new URL(req.url ?? '', 'http://localhost');
    const targetPath = resolveTmdbTargetPath(incomingUrl.searchParams);
    return targetPath === undefined ? false : undefined;
}

function rewriteToTmdbPath(incomingPath: string): string {
    const incomingUrl = new URL(incomingPath, 'http://localhost');
    const targetPath = resolveTmdbTargetPath(incomingUrl.searchParams);
    if (targetPath === undefined) {
        throw new Error('Richiesta TMDB non valida oltre il controllo di bypass.');
    }
    return targetPath;
}

function registerTmdbAuthorization(proxy: HttpProxy.Server, tmdbReadAccessToken: string | undefined): void {
    proxy.on('proxyReq', (proxyReq) => {
        if (tmdbReadAccessToken !== undefined) {
            proxyReq.setHeader('Authorization', `Bearer ${tmdbReadAccessToken}`);
        }
    });
}
