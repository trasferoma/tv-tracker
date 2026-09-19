import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from 'vite';

const distDirUrl = new URL('../dist', import.meta.url);
const DIST_DIR = fileURLToPath(distDirUrl);

// Duplica src/catalog/tmdbRequest.ts:TMDB_PROXY_PATH. Questo script gira con
// node puro, senza transpiler TypeScript, e non può importare moduli .ts.
// Se il percorso del proxy cambia, allineare anche questi segmenti.
const TMDB_PROXY_PATH_SEGMENTS = ['api', 'tmdb'];

// Variabili che inizializzano l'SDK web di Firebase lato client (vedi
// .env.local.example, sezione Firebase). FIREBASE_*_UID restano fuori:
// servono solo alla configurazione una tantum di Firestore (Fase 23) e
// l'app non li legge mai. Da rivedere quando la Fase 21 introduce
// src/auth/firebaseApp.ts, sede canonica di questa lista.
const FIREBASE_CONFIG_VARS = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_HOUSEHOLD_ID',
    'VITE_FIREBASE_FABIO_EMAIL',
    'VITE_FIREBASE_IRENE_EMAIL'
];

const BUNDLE_TEXT_EXTENSIONS = ['.js', '.html', '.webmanifest', '.css'];

function readDistFile(relativePath) {
    const fullPath = join(DIST_DIR, relativePath);
    return existsSync(fullPath) ? readFileSync(fullPath, 'utf8') : undefined;
}

function listDistFiles() {
    return readdirSync(DIST_DIR, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name));
}

function findTmdbRouteStrategy(serviceWorkerSource) {
    const routeCalls = [...serviceWorkerSource.matchAll(/registerRoute\(([^,]+),\s*new\s+[A-Za-z_$][\w$]*\.(\w+)/g)];
    const tmdbRoute = routeCalls.find((match) => TMDB_PROXY_PATH_SEGMENTS.every((segment) => match[1].includes(segment)));
    return tmdbRoute?.[2];
}

function checkTmdbProxyNeverCached(serviceWorkerSource) {
    const strategyName = findTmdbRouteStrategy(serviceWorkerSource);

    if (strategyName === undefined) {
        return ['Il service worker non ha nessuna regola di caching per il proxy TMDB (/api/tmdb). Controlla che ' +
            '"runtimeCaching" in vite.config.ts includa ancora quella rotta.'];
    }
    if (strategyName !== 'NetworkOnly') {
        return [`Il proxy TMDB (/api/tmdb) è servito con la strategia "${strategyName}" invece di NetworkOnly: ` +
            'rischia di restituire dati vecchi spacciandoli per nuovi. In vite.config.ts, sotto "runtimeCaching", ' +
            'riporta quella rotta a { handler: \'NetworkOnly\' }.'];
    }
    return [];
}

// Il pattern del proxy contiene una character class, `[^/]`: la sua `]` di chiusura
// non è la fine dell'array "denylist". Bilanciare le parentesi quadre richiederebbe
// di replicare la sintassi delle regex letterali JS; è più semplice ed è comunque
// affidabile cercare i segmenti del percorso nei caratteri immediatamente successivi.
const DENYLIST_SEARCH_WINDOW_CHARS = 150;

function checkNavigationFallbackExcludesProxy(serviceWorkerSource) {
    const denylistIndex = serviceWorkerSource.indexOf('denylist:[');

    if (denylistIndex === -1) {
        return ['Il service worker non ha un elenco "denylist" per il ripiego di navigazione: aprire /api/tmdb ' +
            'offline restituirebbe index.html invece di un errore di rete. In vite.config.ts imposta ' +
            '"navigateFallbackDenylist" col percorso del proxy TMDB.'];
    }

    const denylistWindow = serviceWorkerSource.slice(denylistIndex, denylistIndex + DENYLIST_SEARCH_WINDOW_CHARS);
    const excludesProxy = TMDB_PROXY_PATH_SEGMENTS.every((segment) => denylistWindow.includes(segment));
    if (!excludesProxy) {
        return ['Il ripiego di navigazione del service worker non esclude il percorso del proxy TMDB (/api/tmdb): ' +
            'una richiesta offline a quel percorso riceverebbe index.html. In vite.config.ts aggiungi il pattern ' +
            'del proxy a "navigateFallbackDenylist".'];
    }
    return [];
}

function isIconFileMissing(icon) {
    const iconPath = join(DIST_DIR, icon.src);
    return !existsSync(iconPath);
}

function checkManifestIcons() {
    const manifestSource = readDistFile('manifest.webmanifest');
    if (manifestSource === undefined) {
        return ['dist/manifest.webmanifest non esiste. Esegui "vite build" prima di questo controllo.'];
    }

    const manifest = JSON.parse(manifestSource);
    const icons = manifest.icons ?? [];
    const missingIconFiles = icons
        .filter(isIconFileMissing)
        .map((icon) => `Il manifest dichiara l'icona "${icon.src}" ma il file non esiste in dist/. Verifica che ` +
            'sia presente in public/ prima del build.');

    const hasMaskableIcon = icons.some((icon) => icon.purpose?.includes('maskable'));
    const missingMaskableIcon = hasMaskableIcon ? [] : ['Il manifest non dichiara nessuna icona "maskable": su ' +
        'Android l\'app installata userebbe un\'icona ritagliata male. In vite.config.ts aggiungi un\'icona con ' +
        'purpose: \'maskable\' all\'elenco "icons".'];

    return [...missingIconFiles, ...missingMaskableIcon];
}

function checkTokenAbsentFromBundle(tmdbReadAccessToken) {
    if (tmdbReadAccessToken === undefined || tmdbReadAccessToken.length === 0) {
        return [];
    }

    const bundleFiles = listDistFiles().filter((path) => BUNDLE_TEXT_EXTENSIONS.includes(extname(path)));
    const tokenLeaked = bundleFiles.some((path) => {
        const fileContent = readFileSync(path, 'utf8');
        return fileContent.includes(tmdbReadAccessToken);
    });

    if (tokenLeaked) {
        return ['Il token TMDB compare nella build pubblicata (valore non riportato qui per non esporlo nei log). ' +
            'Solo il proxy di sviluppo e la Pages Function possono leggere TMDB_READ_ACCESS_TOKEN: nessun modulo ' +
            'che finisce in dist/ deve farlo.'];
    }
    return [];
}

function checkConfigurationConsistency(env) {
    const isFirebaseConfigComplete = FIREBASE_CONFIG_VARS.every((name) => (env[name] ?? '').length > 0);
    const isLocalModeExplicit = env.VITE_LOCAL_MODE === 'true';

    if (!isFirebaseConfigComplete && !isLocalModeExplicit) {
        return ['La build non ha né la configurazione Firebase completa né VITE_LOCAL_MODE=true: l\'app pubblicata ' +
            'non funzionerebbe. Imposta tutte le variabili VITE_FIREBASE_* in .env.local, oppure imposta ' +
            'VITE_LOCAL_MODE=true se questa build è destinata alla sola modalità locale.'];
    }
    return [];
}

function collectProblems(env) {
    const serviceWorkerSource = readDistFile('sw.js');
    const serviceWorkerProblems = serviceWorkerSource === undefined
        ? ['dist/sw.js non esiste. Esegui "vite build" prima di questo controllo: il plugin PWA lo genera lì.']
        : [...checkTmdbProxyNeverCached(serviceWorkerSource), ...checkNavigationFallbackExcludesProxy(serviceWorkerSource)];

    return [
        ...serviceWorkerProblems,
        ...checkManifestIcons(),
        ...checkTokenAbsentFromBundle(env.TMDB_READ_ACCESS_TOKEN),
        ...checkConfigurationConsistency(env)
    ];
}

function reportAndExit(problems) {
    if (problems.length === 0) {
        process.exit(0);
    }

    console.error('');
    console.error('  Controllo post-build fallito: la build non rispetta requisiti non negoziabili della PWA.');
    console.error('');
    for (const problem of problems) {
        console.error(`  - ${problem}`);
        console.error('');
    }
    process.exit(1);
}

const projectRoot = process.cwd();
const env = loadEnv('production', projectRoot, '');
reportAndExit(collectProblems(env));
