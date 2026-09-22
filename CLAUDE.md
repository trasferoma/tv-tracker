# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Cos'è

PWA mobile-first per tracciare le serie TV seguite da Fabio e Irene: una sola lista condivisa, per sapere quali serie stanno seguendo, qual è la prima puntata ancora da vedere, quante puntate già uscite restano arretrate e quando arrivano le nuove. La lista è condivisa per impostazione predefinita, ma una serie può essere resa **privata** di una sola persona, **nascosta** quando si smette di seguirla, e il suo tracciamento può essere **azzerato** ripartendo da una puntata scelta. **Uso privato, due persone.**

**Interfaccia e testi in italiano, codice e identificatori in inglese.** Anche i messaggi di errore e di rifiuto restituiti dal dominio sono stringhe italiane rivolte all'utente.

Documenti di riferimento: `spec/tv-tracker-spec.md` è la fonte autorevole sul comportamento atteso dell'MVP; `spec/implementation-tv-tracker.md` contiene piano, decisioni prese e il registro fase per fase, comprese le correzioni trovate durante la verifica di ogni fase. Le due feature successive hanno una coppia di documenti propria, con lo stesso ruolo: `spec/spec-visibilita-e-reset.md` e `spec/implementation-visibilita-e-reset.md`; `spec/spec-nascondi-serie.md` e `spec/implementation-nascondi-serie.md`. Il lavoro rimandato di proposito — con il motivo e cosa sapere prima di affrontarlo — sta in `features.md`, alla radice: leggerlo prima di aprire un intervento «di pulizia», perché alcune voci sono già state valutate e respinte con una ragione.

**L'app è pubblicata e in uso reale** su [tv-tracker-ds1.pages.dev](https://tv-tracker-ds1.pages.dev), con Firestore attivo: non è un prototipo, i dati che ci sono dentro sono quelli veri di Fabio e Irene.

## Stack tecnologico

| Ruolo | Tecnologia | Versione |
| --- | --- | --- |
| Runtime di sviluppo | Node.js | **22.23.2** (minimo 20.19, dichiarato in `.node-version` e `engines`) · npm 10.8.x |
| Framework | Vue 3, Composition API con `<script setup>` | 3.5.43 |
| Linguaggio | TypeScript `strict` | 5.7.3 |
| Build | Vite | 6.4.3 |
| Routing | Vue Router | 4.6.4 |
| Persistenza locale | Dexie su IndexedDB | 4.4.6 |
| Backend condiviso | Firebase Authentication + Cloud Firestore | 12.19.0 (`firebase`) |
| PWA | `vite-plugin-pwa` (Workbox), `registerType: 'prompt'` | 0.21.2 |
| Test | Vitest | 3.2.7 |
| Test di persistenza | `fake-indexeddb` | 6.2.5 |
| Test di componente | `jsdom` + `@vue/test-utils` | 25.0.1 · 2.5.1 |
| Qualità | ESLint 9 flat config type-checked, `typescript-eslint`, `vue-tsc` | 9.39.5 · 8.70.0 · 2.2.12 |
| Hosting | Cloudflare Pages (sito statico) + Pages Function per TMDB | — |

Dipendenze di **runtime**: `vue`, `vue-router`, `dexie`, `firebase`. Nessun framework CSS, nessuno store globale, nessuna libreria di icone o di componenti.

## Comandi

```bash
npm run dev          # dev server su http://localhost:5173, proxy TMDB incluso
npm test             # Vitest, una passata
npm run test:watch   # Vitest in watch
npm run lint         # ESLint 9 flat config (lint:fix per correggere)
npm run typecheck    # vue-tsc su tsconfig.app.json + tsc su tsconfig.node.json
npm run build        # check-node + typecheck + vite build + check-build-artifacts
npm run preview      # serve dist/ con service worker attivo
```

Un singolo file o test: `npx vitest run src/domain/watchPosition.spec.ts`, `npx vitest run -t "nome del test"`.

Il service worker in `npm run dev` non è rappresentativo: per provare offline, installazione e aggiornamento serve `build` + `preview`.

## Node 22 obbligatorio

Il Node di sistema su questa macchina è il 18.20.8; su Node 18 il build della PWA si rompe con `ReferenceError: crypto is not defined` dentro `serialize-javascript` (usato da `terser` per minificare il service worker). Il Node 22 è gestito da [fnm](https://github.com/Schniz/fnm). In una shell dove `fnm` non è ancora attivo, **prima di ogni comando `npm`**:

```powershell
$env:PATH = "$env:LOCALAPPDATA\fnm;$env:PATH"
fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression
fnm use 22
```

**La seconda riga non è facoltativa**: senza di essa `fnm use` fallisce con *«We can't find the necessary environment variables»*. Mettendo le prime due nel profilo PowerShell, il file `.node-version` del progetto fa passare a Node 22 da sé entrando nella cartella.

Se ci si dimentica, `npm run build` non produce l'errore criptico su `crypto`: `check-node` lo intercetta prima e spiega cosa fare.

## Procedura di pubblicazione

**Regola permanente, da rispettare sempre — anche quando i comandi sono già scritti qui, e anche se li hai appena eseguiti tu**: ogni volta che si chiude una modifica che l'utente deve provare, si riporta a schermo la procedura di pubblicazione completa, testuale e copiabile, così l'utente può rileggerla ed eseguirla da sé senza aprire questo file. La procedura riportata deve comprendere **sempre**, in questo ordine:

1. le tre righe per attivare Node 22 con `fnm` (con la nota che la seconda non è facoltativa);
2. l'incremento di `src/appVersion.ts`;
3. `npm run build`;
4. `npx wrangler pages deploy dist --project-name tv-tracker --branch master --commit-dirty=true`.

Insieme ai comandi va sempre dichiarato: a quale versione è stato portato `APP_VERSION`, se il build è stato rifatto, e l'esito della verifica che il caricamento sia finito in **Production** e non in anteprima.

```bash
# 1. Attiva Node 22 (se la shell è nuova)
$env:PATH = "$env:LOCALAPPDATA\fnm;$env:PATH"
fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression
fnm use 22

# 2. Incrementa APP_VERSION in src/appVersion.ts (v1.0.001 -> v1.0.002 -> ...)

# 3. Ricostruisci
npm run build

# 4. Pubblica in produzione
npx wrangler pages deploy dist --project-name tv-tracker --branch master --commit-dirty=true
```

**`--branch master` è obbligatorio.** Il ramo di produzione del progetto Pages `tv-tracker` si chiama `master`. `wrangler` deduce il ramo da git se il parametro manca: un caricamento senza `--branch master` finisce in **anteprima**, su un sotto-dominio diverso, mentre l'indirizzo pubblico `tv-tracker-ds1.pages.dev` continua a servire la build precedente. **È già successo durante la prima pubblicazione.**

Il numero mostrato in fondo alla home è quello di `APP_VERSION`: è l'unico modo che l'utente ha, dal telefono, di sapere se sta guardando la build nuova o quella vecchia rimasta nel service worker. Sul telefono l'aggiornamento non è immediato: va chiusa l'app dalle app recenti, riaperta, e va accettata la barra «Nuova versione disponibile» (`registerType: 'prompt'`).

### Due segreti, due meccanismi diversi

- **Token TMDB (`TMDB_READ_ACCESS_TOKEN`).** È un secret di Cloudflare Pages, cifrato, impostato sull'ambiente **Production** nella dashboard del progetto. Non sta mai nel bundle: lo legge solo la Pages Function `functions/api/tmdb.ts` e, in sviluppo, il proxy di Vite da `.env.local`. **Le variabili d'ambiente di Cloudflare valgono dal caricamento successivo**: dopo averle impostate o cambiate, va ripubblicato.
- **Configurazione Firebase (`VITE_FIREBASE_*`).** Non è un segreto — a proteggere i dati sono le regole di Firestore, non la segretezza della configurazione — ma è **compilata dentro il bundle** da `.env.local` al momento del build. Significa che **chi esegue il build deve avere un proprio `.env.local`** compilato con quei valori, altrimenti la build fallisce (vedi sotto).

### Controllo automatico dopo il build

`npm run build` esegue `scripts/check-build-artifacts.mjs` dopo `vite build`, e **fa fallire il build** (non stampa solo un avviso) se manca uno di questi requisiti non negoziabili sugli artefatti generati in `dist/`:

- `/api/tmdb` è servito con strategia `NetworkOnly` nel service worker, mai dalla cache: altrimenti un aggiornamento visto una volta verrebbe rifiltrato all'utente come dato attuale anche giorni dopo.
- il ripiego di navigazione del service worker esclude il percorso del proxy TMDB.
- le icone dichiarate nel manifest esistono davvero in `dist/`, inclusa una con `purpose: 'maskable'`.
- il token TMDB non compare in nessun file testuale del bundle pubblicato.
- la build ha o la configurazione Firebase completa o `VITE_LOCAL_MODE=true`: mai nessuna delle due, perché produrrebbe un'app pubblicata che non funziona.

Esiste perché **due mutazioni reali sono sopravvissute con la suite di 394 test tutta verde**: mettere in cache `/api/tmdb` (dati vecchi serviti come nuovi) e togliere l'icona `maskable` dal manifest. La causa è strutturale, non una svista puntuale: `vite.config.ts` — dove vivono queste regole — **non è importato da alcun test**, quindi nessun test unitario può proteggerle. Solo un controllo che ispeziona l'output del build reale le copre.

## Architettura

Organizzazione **per livello**, con la dipendenza che punta sempre verso il basso. Nessun contenitore generico (`utils`, `common`, `helpers`).

```
domain/       funzioni pure e tipi. Zero import da Vue, Dexie, Firebase, browser API
catalog/      contratto CatalogSource, mapping TMDB, richiesta condivisa proxy/Function, catalogo finto
auth/         profili configurati, contratto CredentialCheck, sessione, le due implementazioni
persistence/  UNICO punto che conosce Dexie e Firestore
backup/       formato, validazione, esportazione e importazione JSON
composables/  stato reattivo, sottoscrizioni, casi d'uso; ponte fra viste e i livelli sotto
presentation/ formattazione italiana di date catalogo, plurali, nomi di piattaforma
components/   presentazionali, per concetto (shell, feedback, icon, show, add)
views/        una per rotta (login, home, dettaglio), thin
router/       tre rotte + guardia che attende il ripristino della sessione
styles/       tokens.css (variabili) + base.css
functions/api/ Pages Function, unico altro punto che conosce il token TMDB
appVersion.ts numero di versione mostrato in fondo alla home, da incrementare a ogni deploy
```

Regole architetturali da non violare — sono state verificate e vanno mantenute:

- **Dexie e Firestore solo in `persistence/`.** Nessun altro file importa `dexie`, `firebase/firestore` o i moduli che li usano direttamente.
- **Nessuna logica di dominio nei componenti e nelle viste.** Le viste chiamano composable e funzioni di `presentation/`; il calcolo sta in `domain/`. Le viste **non parlano mai** con `persistence/` o `catalog/` direttamente: passano sempre da un composable.
- **Nessun colore fuori dai token CSS** in `styles/tokens.css`. Niente framework CSS, niente libreria di icone: le icone sono SVG inline in `AppIcon.vue`.
- **`src/domain/` è puro**: zero import da Vue, da API del browser, da Dexie o da Firebase. È il livello testato senza infrastruttura.
- **Nessuno store globale** (niente Pinia): lo stato condiviso vive nei composable.
- **Nessuna dipendenza nuova** senza motivo forte.

`mockup/tv-tracker-mockup.html` è **riferimento visivo e comportamentale in sola lettura**: dati finti, non importato, non rifattorizzato, escluso dal bundle. Definisce flussi, testi italiani, gerarchia e palette; eliminabile senza conseguenze funzionali.

## Il doppio confine: locale e online, mai dedotto

Due contratti, ciascuno con **due implementazioni intercambiabili**, scelte da un **solo segnale**:

- `TrackedShowStore` (`src/persistence/trackedShowStore.ts`) — `localTrackedShowStore.ts` su Dexie/`liveQuery`, `firestoreTrackedShowStore.ts` su Firestore/`onSnapshot`. La scelta è **una riga sola** in `src/persistence/currentTrackedShowStore.ts`.
- `CredentialCheck` (`src/auth/credentialCheck.ts`) — `localCredentialCheck.ts` (password unica da `.env.local`), `firebaseCredentialCheck.ts` (`signInWithEmailAndPassword`). La scelta è in `src/auth/session.ts`.

Il segnale unico è `isLocalMode`, esportato da `src/localMode.ts`:

```ts
export const isLocalMode = import.meta.env.VITE_LOCAL_MODE === 'true';
```

**La modalità locale si conserva di proposito**, non è un residuo da rimuovere: resta nel progetto come modalità alternativa (sviluppo senza rete, lavoro offline dai dati, eventuali usi futuri). I due meccanismi non sono mai attivi insieme — la scelta passa sempre dallo stesso segnale — ma coesistere come alternative è una scelta legittima, non un debito.

**L'attivazione è solo esplicita.** `isLocalMode` è vero **solo** se `VITE_LOCAL_MODE` vale esattamente `"true"`, mai dedotto dall'assenza della configurazione Firebase. Una build senza configurazione Firebase completa **e** senza `VITE_LOCAL_MODE=true` non parte: `check-build-artifacts.mjs` la blocca prima ancora che arrivi all'utente, invece di lasciarla ripiegare in silenzio su un comportamento indesiderato. Quando la modalità locale è spenta non ne compare traccia a schermo; quando è accesa, il banner «modalità locale, dati non condivisi» è sempre visibile.

Il costo reale di questo confine, misurato due volte. Attivare Firestore (Fase 22 del piano originale) è costato **due file nuovi dentro `src/persistence/` più una riga** in `currentTrackedShowStore.ts` — nessuna vista, nessun composable. Aggiungere un **comando** al confine (`changeListing`, feature «nascondere una serie») è costato due file di produzione sul lato Dexie (contratto più implementazione, +29 righe) e uno solo sul lato Firestore (+37 righe, il contratto era già pronto): di nuovo **zero composable e zero viste**. La promessa regge, e regge perché viene rimisurata invece che ripetuta.

## Modello dei dati

`TrackedShow` porta stagioni ed episodi **annidati** (non una collezione separata): rispecchia com'è modellato sia il record Dexie sia il documento Firestore (`households/{householdId}/trackedShows/{id}/progressEvents/{eventId}`).

Scelte del modello e perché:

- **Un solo segnalibro (`lastWatchedEpisodeId`), non una spunta per episodio.** «Vista fino a S2E4» è un valore atomico più l'ordine degli episodi (`src/domain/episodeOrder.ts`): le puntate precedenti spariscono dall'elenco operativo senza mantenere un flag booleano per ciascuna. Un avanzamento marca implicitamente tutte le precedenti.
- **Posizione unica e condivisa, non una per persona.** Non esistono progressi separati per Fabio e Irene: è lo stesso motivo per cui l'app esiste, «cosa possiamo guardare insieme».
- **Visibilità: `visibility` + `privateFor`, due campi piatti con un invariante.** Una serie è condivisa («Per tutti») o privata di una persona («Solo per me»); `privateFor` è valorizzato **se e solo se** la visibilità è privata. L'invariante non è sperato: `src/domain/showVisibility.ts` ricava dai due campi un tipo discriminato (`ShowAudience`) e i suoi due costruttori sono l'**unico** punto che scrive quei campi. **Il campo assente vale «condivisa»**, così i documenti già in produzione non hanno richiesto migrazione. Con la visibilità cambia anche l'unicità: la chiave è `providerShowId` **+ destinatario**, quindi una scheda condivisa e una privata della stessa serie possono coesistere. Il confine è **di comodità, non di sicurezza**: filtra nel client, non nelle regole Firestore, perché serve a non ingombrare la lista dell'altro, non a difendersi da lui.
- **Nascondere: `hidden`, un campo condiviso e binario.** `hidden === true` significa nascosta, **l'assenza del campo significa in elenco** — stesso stampo della visibilità, nessuna migrazione, e «in elenco» ha **una sola** rappresentazione perché `src/domain/showListing.ts` scrive `undefined` e mai `false`. È un dato del record, non una preferenza di dispositivo: se Fabio nasconde una serie condivisa, sparisce anche a Irene. Nascondere non tocca posizione, eventi, revisione, visibilità, e **non** incrementa `progressRevision`, che è il gettone del conflitto sugli avanzamenti. È l'opposto di «Rimuovi dalla lista», che cancella record ed eventi ed è definitiva. La preferenza «Mostra nascoste» vive in `localStorage`, per dispositivo.
- **Azzerare il tracciamento riporta la serie allo stato di una serie appena inserita**, con la posizione scelta dall'utente, in una sola transazione e **senza possibilità di annullare**: gli eventi si **cancellano** (non si marcano), `lastViewedAt` sparisce e `addedAt` diventa l'istante del reset. Tre deroghe volute alla metafora: `progressRevision` **si incrementa** invece di azzerarsi, perché deve solo crescere per fare il suo mestiere; l'**identificativo non cambia**, altrimenti morirebbe l'indirizzo della pagina di dettaglio aperta in quel momento sui due telefoni; catalogo, piattaforma e visibilità **non** si riscelgono. Da qui una conseguenza cercata: `addedAt` non significa più «quando la serie è entrata in lista» ma «quando è cominciato il tracciamento attuale», quindi dopo un reset la serie sta in cima a entrambi gli ordinamenti.
- **Gli eventi (`ProgressEvent`) conservano copie leggibili** (`seasonNumber`, `episodeNumber`, `episodeTitle` al momento della conferma) invece di rimandare sempre a `confirmedEpisodeId`: se TMDB in seguito rinomina o rinumera una puntata, l'evento resta comprensibile così com'era quando è stato confermato.
- **L'annullamento (`undo`) marca invece di cancellare.** Valorizza `undoneAt`/`undoneBy` e genera una nuova `progressRevision`; l'evento resta. Questo mantiene sincronizzabili gli avanzamenti di due dispositivi senza uno storico visibile in interfaccia, e permette il controllo di conflitto: un undo che porta una revisione diversa da quella corrente viene **rifiutato**, non eseguito silenziosamente.
- **Esito discriminato invece di eccezione** per i fallimenti legittimi di dominio: avanzamento all'indietro, conflitto di revisione, duplicato, sostituzione parziale del backup. La forma è sempre `{ outcome: 'applied' | 'added' | ...; ... } | { outcome: 'rejected' | 'partial'; reason }`, con `reason` italiana rivolta all'utente. Le eccezioni restano per gli errori di programmazione.
- **Speciali (`seasonNumber = 0`)** sono conservati nel dato ma esclusi dalla sequenza lineare, dalla posizione e dal conteggio arretrati: sezione a sé, in sola lettura.
- **Locandina e badge seguono due criteri distinti** (`nextUnwatchedEpisode` vs `firstUnwatchedEpisode`): la locandina segue il prossimo episodio in sequenza anche se non ancora uscito, badge e azione «Vista» seguono la prima puntata **pubblicata** non vista. Disambiguato dal mockup, dove una serie «in pari» mostra comunque la locandina della stagione successiva, non quella della stagione 1.
- **Il conteggio arretrati non dipende dalla piattaforma di streaming nota.** Dipende solo da `airDate <= oggi`. Subordinarlo alla presenza di un provider italiano — come chiedeva la lettera della SPEC — avrebbe potuto mostrare «In pari» una serie indietro di dieci puntate: la piattaforma è un promemoria di dove guardare, non un permesso perché la puntata esista.
- **«Completata» è uno stato derivato, non un dato salvato.** Una serie senza alcun episodio non visto — né già pubblicato né annunciato — sparisce dalla home per impostazione predefinita (`WatchPosition.isCompleted`, da non confondere con `isCaughtUp`, vero anche con una puntata futura in arrivo). Nessun campo persistito la marca: è questo che la fa ricomparire da sola appena TMDB annuncia una puntata nuova. La preferenza mostra/nascondi sta in `localStorage`, non nei dati condivisi.

## Convenzioni di codice

- **Indentazione a 4 spazi**, punto e virgola sempre, apici singoli in TS.
- Import da `src/` con l'alias **`@/`**; percorsi relativi solo fra file della stessa cartella. Eccezione imposta dal deploy: `functions/api/tmdb.ts` importa `src/catalog/tmdbRequest.ts` con un percorso **relativo**, perché wrangler non conosce l'alias `@/`.
- TypeScript `strict` più `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`/`noUnusedParameters`.
- Tipi di dominio `readonly` in profondità; le trasformazioni restituiscono nuovi oggetti, mai mutazione in place.
- Vue 3 con `<script setup lang="ts">`; interfacce `UseXxx` esplicite come tipo di ritorno dei composable.
- **Il codice non si commenta.** Il progetto ne ha **tre in tutto**, tutti in `src/`, tutti giustificati da un vincolo esterno non deducibile dal codice: la suite che deve forzare la modalità locale per non dipendere da `.env.local` (`vitest.setup.ts`), il comportamento reale e verificato di `search/tv` di TMDB che non restituisce mai locandina di stagione né stato (`tmdbMapping.ts`), il controllo password come cortesia e non come prova di identità (`localCredentialCheck.ts`). Prima di aggiungerne un quarto, cercare se un nome migliore o un metodo estratto rende il commento superfluo.
- Testi utente in **italiano**, identificatori del codice in **inglese**.
- `tsconfig.app.json` copre `src/**` **senza i tipi di Node**: dentro `src/` non esistono `process` né `node:*`. `tsconfig.node.json` copre `vite.config.ts`, `vitest.setup.ts`, `functions/**`, `scripts/**`.

## Test

Vitest, file `*.spec.ts` **accanto al codice che testano**. L'ambiente di default è `node`; i test che montano componenti Vue aprono con il docblock:

```ts
// @vitest-environment jsdom
```

`vitest.setup.ts` installa `fake-indexeddb/auto` e il polyfill di `crypto`, quindi i test di `persistence/` girano su un IndexedDB vero in memoria.

**La suite forza la modalità locale** con `vi.stubEnv('VITE_LOCAL_MODE', 'true')` in `vitest.setup.ts`, e **non deve dipendere da `.env.local`**, che non è versionato. È stato un difetto reale: senza quello stub, su una macchina priva del file, `@/auth/session` avrebbe risolto al ramo Firebase fallendo già all'import per configurazione mancante, e i composable che risolvono `currentTrackedShowStore` avrebbero tentato connessioni Firestore vere — 30 test coinvolti su 10 file, cinque dei quali avrebbero aperto connessioni di rete reali. Un singolo test può ancora sostituire `@/localMode` con `vi.doMock` per esercitare il ramo non locale di un componente.

Il numero esatto di test va letto dall'ultima esecuzione di `npm test`: è cresciuto nel corso dello sviluppo (394 alla chiusura della Fase 23, **634** alla chiusura di «nascondere una serie») e non è opportuno fissarlo come cifra statica in un documento che invecchia col codice.

**Due file di test hanno timeout intermittenti noti**, `src/views/HomeView.spec.ts` e `src/router/index.spec.ts`: cadono sempre sul primo test del file a suite piena e sono verdi se rilanciati da soli. È debito preesistente con una diagnosi scritta in `features.md` § 3 e il rimedio proposto alla § 5 — **non** un guasto del codice in lavorazione. Prima di inseguire un fallimento lì, rilancia il file in isolamento.

## Lezioni pagate

Regole pratiche che discendono da difetti reali trovati durante lo sviluppo, non aneddoti da rileggere per curiosità:

1. **Un test verde non è una prova finché non fallisce quando dovrebbe.** Il modo più affidabile per fidarsi di un test è romperlo di proposito: durante il progetto, mutation testing manuale ha trovato più volte mutazioni sopravvissute (confine `airDate === oggi`, provider `US` invece di `IT` per coincidenza identici nella fixture, debounce della ricerca mai verificato) che la sola lettura del codice non avrebbe mai fatto notare.
2. **Un valore che descrive uno stato non deve mai mentire per comodità di visualizzazione.** Una serie con dati disallineati si presentava come «In pari» — l'esatto opposto della realtà — perché il calcolo falliva e il ramo di errore ripiegava su un valore placeholder qualunque. La correzione non è stata una toppa sul messaggio, ma un tipo distinto per «non calcolabile» che il compilatore obbliga a gestire ovunque compaia.
3. **Una firma non promette più di quanto l'implementazione garantisca.** Due parametri opzionali dello stesso tipo, adiacenti e invertibili per sbaglio (`changeProvider`); un contratto che lasciava `confirmedAt`/`undoneAt` al chiamante mentre Firestore li assegna dal server — corretto **prima** che diventasse necessario cambiare quella firma alla Fase 22, rompendo la promessa che sostituire lo store costasse «un file più una riga».
4. **Un contratto testato in isolamento non basta se il chiamante può ancora romperlo.** La garanzia «fra due avanzamenti prevale la posizione più avanzata» regge solo se la transazione rilegge lo stato **dentro** di sé: un test dedicato dimostra questo, non la sola serializzazione di IndexedDB. Allo stesso modo, `positionOfEpisode` restituisce `-1` sia per «mai iniziata» sia per «episodio sparito dal catalogo»: due esiti opposti nascosti nello stesso valore di ritorno, che ogni chiamante deve distinguere a monte guardando `lastWatchedEpisodeId`, non il valore stesso.

5. **Una riga di cablaggio non testata è una funzionalità che non esiste, con la suite tutta verde.** Nella feature «nascondere una serie», l'insieme che distingue il messaggio «questa serie è nascosta» da quello generico era calcolato dal composable, consumato correttamente da chi lo riceveva, e coperto da test su entrambi i lati — ma **nessuno passava quel valore dalla home al dialogo di aggiunta**, e nessun test guardava quel passaggio. Il messaggio non sarebbe mai comparso nell'app reale. Vale anche al contrario: un doppio di test più gentile dell'originale (che scrive `false` dove lo store vero toglie il campo, o che allinea lo stato prima di quanto farebbe la sottoscrizione vera) rende verdi test che non proteggono niente. Quando una feature attraversa più livelli, **il test più prezioso è quello sulla giuntura**, non quello sui pezzi.

## Stato del repository

Fasi 1–23 del piano originale chiuse: MVP locale completo (Fasi 1–19), Firebase Authentication e Cloud Firestore attivi come implementazioni del confine dati (Fasi 20–22), regole di sicurezza Firestore pubblicate e travaso dei dati locali eseguito (Fase 23). Dopo di esse, due feature chiuse con lo stesso metodo — spec approvata, fasi piccole, ciascuna scritta e poi verificata da un passaggio separato:

- **Visibilità e azzeramento** (`spec/spec-visibilita-e-reset.md`, 11 fasi): una serie può essere condivisa o privata di una persona, la home ha una lente «Tutto / Solo le mie», e dal dettaglio si azzera il tracciamento scegliendo da che puntata ripartire.
- **Nascondere una serie** (`spec/spec-nascondi-serie.md`, 10 fasi): una serie che si è smesso di seguire esce dalla lista e dai conteggi senza perdere niente, e si ritrova con «Mostra nascoste» in home o si riporta in elenco dal suo dettaglio.

L'app è pubblicata e in uso su [tv-tracker-ds1.pages.dev](https://tv-tracker-ds1.pages.dev). **La versione pubblicata non comprende ancora «nascondere una serie»**: il codice è completo e verde, la pubblicazione è l'ultimo passo rimasto.

Fuori dall'MVP, per scelta esplicita registrata in `spec/tv-tracker-spec.md`: statistiche e storico, voti e recensioni, consigli personalizzati, notifiche push, profili separati (la posizione resta unica e condivisa), import automatico da servizi terzi, film. Niente pull-to-refresh: l'aggiornamento del catalogo passa solo dai pulsanti «Aggiorna».
