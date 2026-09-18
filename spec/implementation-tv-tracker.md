# IMPLEMENTATION — TV Tracker (PWA per le serie TV seguite da Fabio e Irene)

**Specifica di riferimento:** `tv-tracker-spec.md` — nel resto del documento: «la SPEC».
**Stato:** `IN_PROGRESS`  <!-- NOT_STARTED | IN_PROGRESS | BLOCKED | COMPLETED -->

Documento di lavoro: la SPEC (il "cosa") resta stabile; qui vivono stato, piano, decisioni e problemi (il "come").

> **Ordine di lavoro, è il vincolo che struttura tutto il piano.** Le Fasi 1–19 producono un'app **completa e usabile in modalità locale**: tutti i dati vivono in IndexedDB su un solo dispositivo. Firebase (Authentication + Cloud Firestore) è un **blocco unico in fondo** (Fasi 20–23), perché le regole di sicurezza di Firestore riconoscono l'utente autenticato: separarle significherebbe scrivere regole provvisorie e rifarle. L'export/import JSON (Fase 18) precede deliberatamente il blocco Firebase, così i dati inseriti in locale non si perdono nel passaggio all'online.

## Regole per l'agente

- Leggere la SPEC e questo file prima di toccare codice; alla ripresa, riprendere dallo stato corrente.
- Prima di modificare, elencare i file che verranno toccati. Nessun refactoring fuori scope.
- Non modificare i requisiti della SPEC senza decisione esplicita.
- Dopo ogni fase: eseguire i test pertinenti e aggiornare questo file. Spuntare una voce solo dopo verifica reale, mai a priori.
- Scelta che **non** cambia il comportamento osservabile → procedi e annotala in *Decisioni tecniche*.
- Scelta che **cambia** comportamento o criteri di accettazione, o ambiguità non risolvibile dalla SPEC → **fermati**, stato `BLOCKED`, registra in *Problemi aperti* / *Deviazioni*.
- `mockup/tv-tracker-mockup.html` è **riferimento visivo e comportamentale in sola lettura**: non importarlo, non rifattorizzarlo, non includerlo nel bundle. Contiene dati finti; definisce flussi, testi italiani, gerarchia e palette.
- **Il valore del token TMDB non entra mai in questo file, nel codice, nei log, nei messaggi di commit o nell'output degli agenti.** Sta in `spec/apikey/apikey.txt`, cartella già esclusa da git.
- Ogni fase lascia il progetto verde: niente fase che rompe typecheck, lint o test.
- Le cartelle sotto `src/` **non esistono**: vanno create insieme al primo file che le abita.

## Contesto

Il repository `C:\build\git\tv-tracker` contiene oggi **solo** `spec/`, `mockup/` e un `.gitignore`. Niente `package.json`, niente scaffold, **git non inizializzato**. Si parte da zero. Il contesto utile non viene quindi dal codice presente, ma dal progetto gemello e dalle decisioni già prese con l'utente.

### Progetto gemello di riferimento

`C:\build\git\gym-tracker` (stato `COMPLETED`) è il modello di convenzioni, stack e architettura. Letti in sola lettura: `CLAUDE.md`, `implementation-gym-tracker.md`, `package.json`, `vite.config.ts`, `tsconfig.app.json`, l'albero di `src/`. Da replicare: organizzazione **per livello** con sottocartelle **per concetto**, nessun contenitore generico, dipendenza che punta sempre verso il basso.

### Stack fissato (allineato a Gym Tracker, non alle ultime release)

| Ruolo | Tecnologia | Versione |
| --- | --- | --- |
| Runtime di sviluppo | Node.js via `fnm` | **22** (`.node-version` = 22, `engines: >=20.19`) |
| Framework | Vue 3, Composition API, `<script setup lang="ts">` | 3.5.x |
| Linguaggio | TypeScript `strict` | 5.7.x |
| Build | Vite | 6.4.x |
| Routing | Vue Router | 4.6.x |
| Persistenza locale | Dexie su IndexedDB | 4.x |
| PWA | `vite-plugin-pwa`, `registerType: 'prompt'` | 0.21.x |
| Test | Vitest | 3.2.x |
| Test di persistenza | `fake-indexeddb` | 6.x |
| Test di componente | `jsdom` + `@vue/test-utils` | 25.x · 2.4.x |
| Qualità | ESLint 9 flat config type-checked, `typescript-eslint`, `vue-tsc` | 9.x · 8.x · 2.2.x |
| Backend condiviso (fine piano) | Firebase Authentication + Cloud Firestore | da fissare in Fase 20 |
| Hosting | Cloudflare Pages + Pages Function | nessun deploy in questo giro |

Dipendenze di **runtime** previste: `vue`, `vue-router`, `dexie`, e più avanti `firebase`. Nessun framework CSS, nessuno store globale, nessuna libreria di icone o di componenti.

**Node 22 obbligatorio**: il Node di sistema è il 18.20.8 e su Node 18 il build PWA si rompe con `ReferenceError: crypto is not defined` dentro `serialize-javascript`. Prima di ogni build, in una shell nuova:

```powershell
$env:PATH = "$env:LOCALAPPDATA\fnm;$env:PATH"
fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression
fnm use 22
```

### Convenzioni ereditate

- Indentazione **4 spazi**, punto e virgola sempre, apici singoli.
- Import da `src/` con l'alias **`@/`**; percorsi relativi solo fra file della stessa cartella.
- `strict` più `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`/`noUnusedParameters`.
- Test `*.spec.ts` **accanto al codice testato**; ambiente `node` per default, `// @vitest-environment jsdom` nei soli test di componente.
- `styles/tokens.css` + `styles/base.css`, **nessun colore fuori dai token**.
- `appVersion.ts` mostrato in fondo alla home: è l'unico modo che l'utente ha, dal telefono, di sapere quale build sta guardando.
- **Esito discriminato invece di eccezione** per i fallimenti legittimi di dominio (undo rifiutato, conflitto di revisione, duplicato): `{ outcome: 'applied', ... } | { outcome: 'rejected', reason }` con `reason` italiana rivolta all'utente. Le eccezioni restano per gli errori di programmazione.
- Tipi di dominio `readonly` in profondità, nessuna mutazione in place: le trasformazioni restituiscono nuovi oggetti.
- Interfaccia e testi in **italiano**, identificatori del codice in **inglese**.

### Decisioni già prese con l'utente — vincolanti, non ridiscuterle

1. **Confine dati a sottoscrizione fin dalla prima fase.** Il contratto è «iscriviti e vieni avvisato quando cambia», non «chiedi e ricevi una volta». In modalità locale la notifica la genera il repository locale (`liveQuery` di Dexie); quando arriverà Firestore, che notifica da sé con `onSnapshot`, la sostituzione deve costare **un file di implementazione più una riga nel modulo che sceglie l'implementazione**, senza rimettere le mani su composable e viste.
2. **La modalità locale è dichiarata a schermo** («modalità locale, dati non condivisi»), non un degrado silenzioso.
3. **TMDB disponibile subito**, con il **token v4 e header `Authorization: Bearer`**, mai la chiave v3 in query string. In produzione la chiave sta in una Pages Function; in sviluppo la stessa cosa la fa un proxy di Vite che legge il token da `.env.local`. `npm run dev` resta **un comando solo**. La logica che costruisce la richiesta sta in **un modulo condiviso** fra i due percorsi, così non divergono.
4. **Catalogo finto locale** (quattro serie, sul modello del mockup) come **implementazione alternativa della stessa interfaccia di catalogo**: serve ai test automatici e a lavorare senza rete.
5. **Titolo in italiano**: si mostra ovunque il `name` restituito con `language=it-IT` (*Severance* → «Scissione»); l'`original_name` compare in piccolo **solo nei risultati di ricerca**, per disambiguare.
6. **Catalogo annidato nel documento della serie**: stagioni ed episodi stanno dentro `TrackedShow`, non in una collezione separata. Vale per il record Dexie e poi per il documento Firestore.
7. **Inserimento serie come `<dialog>` modale**, non come rotta. Le rotte sono tre: login, home, dettaglio serie.
8. **Aggiornamento solo con i pulsanti «Aggiorna»** (intestazione e sommario). **Niente pull-to-refresh** nell'MVP.
9. **Speciali (`seasonNumber = 0`)**: sezione in fondo al dettaglio, **in sola lettura, senza pulsante «Vista»**. Non entrano nella posizione né nel conteggio «nuove».
10. **Login in modalità locale**: schermata identica al mockup, ma password confrontata con un valore letto da `.env.local` (default `xxx`), con avviso di modalità locale a schermo. Con Firebase si sostituisce **solo il controllo**, non la schermata. L'identità scelta alimenta `confirmedBy` e `undoneBy` fin da subito.
11. **Nessun dato di esempio precaricato**: l'app parte vuota (lo stato vuoto va disegnato bene), con un comando «carica dati di esempio» disponibile nella **sola** modalità locale.
12. **Nessun deploy** in questo giro: ci si ferma a codice completo, `npm install` fatto, typecheck, lint e test verdi in locale. Il progetto Cloudflare Pages `tv-tracker` non esiste ancora.

Endpoint TMDB **verificati sul campo** (rispondono `200` con il token v4): `search/tv?query=…&language=it-IT`, `tv/{id}?language=it-IT` (contiene `next_episode_to_air`, `status`, `seasons`), `tv/{id}/season/{n}?language=it-IT`, `tv/{id}/watch/providers`.

### Scostamenti dalla SPEC già decisi dall'utente

- SPEC § *Aggiornamento automatico*: «aggiornamento forzabile con pull-to-refresh o pulsante» → **solo pulsante**, niente pull-to-refresh nell'MVP.
- SPEC § *Decisioni tecniche*: Firestore come sorgente autorevole → **vale dalla Fase 22**; fino a lì la sorgente è IndexedDB su un solo dispositivo, dichiarata a schermo.
- SPEC § *Accesso*: «la sessione resta valida fino alla scadenza stabilita da Firebase Authentication» → in modalità locale la scadenza la decide l'app (vedi *Domande aperte* 3).
- SPEC § *Decisioni tecniche*: «le versioni vanno fissate senza copiare quelle di Gym Tracker alla cieca» → **decisione contraria e consapevole dell'utente**: si copiano le linee di Gym Tracker perché sono già verificate su questa macchina e su Node 22.
- SPEC § *Regole di dominio*: «una puntata è presumibilmente disponibile quando `airDate <= oggi` **e** la serie ha almeno un provider italiano noto» → **la condizione sul provider cade**. Il conteggio degli arretrati dipende solo dalla data di uscita. La piattaforma serve a ricordare *dove* guardare, non a stabilire se una puntata esista: legarci il conteggio farebbe apparire «In pari» una serie indietro di dieci puntate. Decisione esplicita dell'utente (vedi *Domande aperte* 2).

- SPEC § *Regole di dominio*: «la locandina visualizzata deriva dalla stagione della **prima puntata non vista**» è ambigua fra «prima non vista **e pubblicata**» e «prima non vista in senso letterale». **Disambiguata dal mockup**, che è specifica visiva approvata: la card di Slow Horses è in pari (badge 0) e mostra comunque la locandina della stagione 4, quella della prossima puntata non ancora uscita — non quella della stagione 1. Quindi la locandina segue il **prossimo episodio grezzo** in sequenza, mentre badge e azione «Vista» seguono la prima puntata **pubblicata** non vista. Da qui i due campi distinti `nextUnwatchedEpisode` e `firstUnwatchedEpisode`.

- SPEC § *Inserimento*: «ogni risultato mostra copertina, titolo, anno e **stato**» e «nei risultati di ricerca viene mostrata la locandina della **stagione 1**» → **non ottenibili dall_endpoint di ricerca di TMDB**, verificato sulla risposta reale: `search/tv` restituisce `poster_path` (locandina generale) e **non** restituisce `status`. Ottenerli richiederebbe una chiamata `tv/{id}` **per ogni risultato**, cioè ~10 chiamate a ogni ricerca con debounce. Decisione: nei risultati si mostra la **locandina generale**, e lo **stato** si mostra al passo successivo, quando la serie è stata scelta e si caricano i dettagli per la piattaforma. La disambiguazione di remake e omonimi — scopo dichiarato dalla SPEC — resta garantita da **anno** e **titolo originale**, entrambi presenti nella risposta di ricerca.

### Asse di organizzazione proposto

L'organizzazione suggerita dalla SPEC (`domain`, `catalog`, `auth`, `persistence`, `composables`, `components`, `views`, `router`, `styles`, `functions/api`) **regge** ed è quella di Gym Tracker. Aggiunte proposte, con motivazione:

- `src/presentation/` — resa testuale italiana (date catalogo, plurali «nuova/nuove»): è presentazione, tenuta fuori dal dominio e fuori dai componenti. Stessa scelta di Gym Tracker.
- `src/backup/` — formato, validazione ed esecuzione di export/import JSON: contratto con l'esterno, con una ragione di cambiare propria.
- `src/components/` con sottocartelle **per concetto**: `shell/`, `feedback/`, `icon/`, `show/`, `add/`.
- `src/domain/` piatta: i concetti (ordine episodi, posizione, avanzamento, undo, ordinamenti, locandina) sono pochi e tutti di primo livello; nessun sottopacchetto finché non emerge un gruppo coeso.

Nessun contenitore generico (`utils`, `common`, `helpers`, `models`, `services`).

## Piano operativo

### Fase 1 — Messa in sicurezza della chiave TMDB e del repository

*Obiettivo: nessuna credenziale può finire in git, prima che esista un solo file di codice.*

- [x] Verificare il `.gitignore` già presente: copre `spec/apikey/`, `.env`, `.env.local`, `.env.*.local`, `node_modules/`, `dist/`, `*.tsbuildinfo`, `.wrangler/`. Completare con `.node-version`? **No**: va versionato.
- [x] Inizializzare git e verificare con `git status --porcelain` che **né `spec/apikey/` né alcun file `.env*` compaiano** fra i file non tracciati.
- [x] Creare `.env.local.example` (versionato, **senza valori**) con i nomi delle variabili attese: token TMDB e password di modalità locale.
- [x] Creare `.env.local` (non versionato) leggendo il token v4 da `spec/apikey/apikey.txt`, riga 8. Il valore non viene mai stampato a schermo né riportato in questo file.
- [x] Criterio di completamento osservabile: `git status` pulito rispetto ai segreti; `git check-ignore -v .env.local spec/apikey/apikey.txt` conferma entrambe le esclusioni.
- **File letti:** `.gitignore`, `spec/apikey/Readme.txt`.
- **File modificati:** `.gitignore` (solo se risulta incompleto).
- **File da creare:**
  - `.env.local.example` (radice) — i nomi delle variabili sono documentazione d'ingresso del progetto, non un segreto; sede canonica accanto al `.env.local` che descrive.
  - `.env.local` (radice, **non versionato**) — sede prevista da Vite per i segreti di sviluppo.

### Fase 2 — Scaffold, toolchain e Node 22

*Obiettivo: quattro comandi verdi su un progetto vuoto.*

- [x] `package.json` con le versioni della tabella dello stack, `engines: >=20.19.0`, script `dev`, `check-node`, `build`, `preview`, `test`, `test:watch`, `typecheck`, `lint`, `lint:fix`.
- [x] `.node-version` = `22` e `scripts/check-node-version.mjs` che ferma il build con un messaggio comprensibile invece dell'errore criptico su `crypto`.
- [x] `npm install` su Node 22; `npm audit` riportato nel registro. Se un `audit fix` alza `serialize-javascript` alla 7, **non** serve l'`overrides` di Gym Tracker: quello era il rimedio per Node 18.
- [x] `tsconfig.json` (solution file), `tsconfig.app.json` (scope `src/**`, `types: vite/client` + `vite-plugin-pwa/client`, **nessun tipo Node**) e `tsconfig.node.json` (scope `vite.config.ts`, `vitest.setup.ts`, `functions/**`, `scripts/**`). Alias `@/*` → `src/*`.
- [x] **Trappola nota, da non ripetere**: `vue-tsc --noEmit` sul solo solution file esce `0` **senza controllare nulla**. Lo script `typecheck` deve puntare i due progetti esplicitamente e va verificato con un errore volontario per scope.
- [x] `eslint.config.js` flat config con `recommendedTypeChecked`, `eslint-plugin-vue`, esclusione di `mockup/` e `dist/`.
- [x] `vite.config.ts` minimo (plugin Vue, alias, blocco `test` di Vitest), `vitest.setup.ts` con `fake-indexeddb/auto` e il polyfill di `crypto`, `index.html` con `lang="it"` e `viewport-fit=cover`, `src/main.ts`, `src/App.vue`, `src/appVersion.ts` a `v1.0.000`.
- [x] Criterio di completamento osservabile: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` tutti verdi su un progetto ancora privo di funzionalità.
- **File letti:** `gym-tracker/package.json`, `gym-tracker/vite.config.ts`, `gym-tracker/tsconfig.app.json`, `gym-tracker/eslint.config.js`, `gym-tracker/scripts/check-node-version.mjs`.
- **File modificati:** nessuno.
- **File da creare** — radice del progetto, sede canonica della configurazione: `package.json`, `.node-version`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`, `vite.config.ts`, `vitest.setup.ts`, `index.html`; cartella `scripts/` **nuova** per `check-node-version.mjs` (script di manutenzione, non codice applicativo, quindi fuori da `src/`); `src/main.ts`, `src/App.vue`, `src/appVersion.ts`.

### Fase 3 — Tipi di dominio e ordine degli episodi

*Obiettivo: il vocabolario da cui dipende tutto il resto, e la sequenza lineare delle puntate.*

- [x] Tipi `TrackedShow`, `Season`, `Episode`, `ProgressEvent`, `ItalianProvider` con i campi della SPEC, `readonly` in profondità. Stagioni ed episodi **annidati** in `TrackedShow`.
- [x] Generazione UUID isolata in un solo punto, con ripiego su `crypto.getRandomValues` fuori da contesto sicuro.
- [x] Sequenza lineare degli episodi di una serie: ordinamento per `(seasonNumber, episodeNumber)`, **esclusione degli speciali** (`seasonNumber = 0`), posizione di un episodio nella sequenza, episodio successivo a una posizione.
- [x] Data catalogo `YYYY-MM-DD`: confronto con la data odierna **locale** senza conversioni UTC, predicato «già pubblicato».
- [x] Test: ordine con stagioni fuori sequenza; speciali esclusi dalla sequenza ma conservati nel dato; confronto di data al confine di mezzanotte in fuso non UTC.
- [x] Criterio di completamento osservabile: `npm test` verde, nessun import di Vue, Dexie o API del browser da `src/domain/`.
- **File letti:** `tv-tracker-spec.md` § *Modello dati definitivo*, § *Regole di dominio*.
- **File modificati:** nessuno.
- **File da creare** — cartella `src/domain/` **nuova**:
  - `src/domain/trackedShow.ts` — i tipi della gerarchia stanno nel concetto «serie seguita», che è il vocabolario condiviso; non in un contenitore `models`.
  - `src/domain/identity.ts` — unico punto di generazione degli UUID: isola `crypto.randomUUID` e il ripiego.
  - `src/domain/catalogDate.ts` — algebra della data catalogo `YYYY-MM-DD`: concetto a sé, richiamato da dominio, presentazione e ordinamenti.
  - `src/domain/episodeOrder.ts` — sequenza lineare e trattamento degli speciali: è la regola su cui poggiano posizione, conteggi e avanzamento.
  - `src/domain/episodeOrder.spec.ts`, `src/domain/catalogDate.spec.ts` — test accanto al codice testato.

### Fase 4 — Posizione di visione: prima puntata non vista, arretrati, locandina

*Obiettivo: le tre domande della home, calcolate da funzioni pure.*

- [x] **Rischio ereditato dalla Fase 3, da non ignorare:** `positionOfEpisode` restituisce `-1` sia per «serie mai iniziata» sia per «episodio non presente nella sequenza». Il chiamante deve distinguere i due casi **a monte**, guardando se `lastWatchedEpisodeId` è assente o è presente ma non trovato: sono rami con esiti opposti. Trattarli come lo stesso valore fa ricomparire tutte le puntate già viste.
- [x] Prima puntata **pubblicata** non vista, a partire da `lastWatchedEpisodeId`; serie mai iniziata → primo episodio della sequenza.
- [x] Conteggio arretrati: episodi successivi alla posizione con `airDate <= oggi`; episodi senza data catalogati ma **non** contati; speciali esclusi. Stato «In pari» quando il conteggio è zero.
- [x] Prossima puntata futura, quando nota: la prima con `airDate > oggi`.
- [x] Selezione della locandina: stagione della **prima puntata non vista**; serie mai iniziata → stagione 1; stagione senza locandina → locandina generale della serie; in sua assenza → segnaposto.
- [x] Test: criterio 3 (prima puntata + arretrati), criterio 8 (una puntata pubblicata dopo l'ultimo aggiornamento alza il conteggio senza spostare la posizione), selezione della locandina nei quattro rami, arretrati con episodi privi di `airDate`, serie in pari con prossima puntata futura nota.
- [x] Criterio di completamento osservabile: `npm test` verde; nessuna funzione di questa fase legge l'orologio da sé — la data odierna è un parametro.
- **File letti:** `src/domain/*`, SPEC § *Regole di dominio*.
- **File modificati:** nessuno.
- **File da creare:**
  - `src/domain/watchPosition.ts` — prima puntata non vista, arretrati, «in pari», prossima futura: è il cuore della home e cambia quando cambiano le regole di visione.
  - `src/domain/seasonPoster.ts` — la catena di ripiego della locandina ha una ragione di cambiare propria (cosa mostra il catalogo), separata dal calcolo della posizione.
  - `src/domain/watchPosition.spec.ts`, `src/domain/seasonPoster.spec.ts`.

### Fase 5 — Avanzamento e undo con esito discriminato

*Obiettivo: l'operazione che sposta la posizione, e la sola operazione che la riporta indietro.*

- [x] Avanzamento: dato un episodio confermato, nuova posizione, `lastViewedAt`, `progressRevision` incrementata e `ProgressEvent` con gli snapshot (`seasonNumber`, `episodeNumber`, `episodeTitle`, `confirmedBy`). Tutti i precedenti risultano visti **implicitamente**, senza flag per episodio.
- [x] Monotonia: un avanzamento che punta a un episodio **precedente** alla posizione corrente viene **rifiutato** con `reason` italiana, non eseguito.
- [x] Undo: agisce sull'**ultima conferma non già annullata** della serie; valorizza `undoneAt`/`undoneBy`, ripristina `previousEpisodeId`, genera una nuova revisione. L'evento **non** viene cancellato.
- [x] Conflitto di revisione: un undo che porta una revisione diversa da quella corrente viene **rifiutato** con l'invito a ricaricare lo stato.
- [x] Un avanzamento non produce mai un salto su un episodio futuro (`airDate > oggi`): rifiutato.
- [x] Test: criterio 4 (S2E4 e precedenti spariscono), avanzamento multiplo implicito che attraversa più stagioni, criterio 6 (undo ripristina **esattamente** posizione, conteggi e locandina), undo senza eventi annullabili, conflitto di revisione, rifiuto dell'avanzamento all'indietro.
- [x] Criterio di completamento osservabile: `npm test` verde; nessuna funzione della fase scrive su database o lancia eccezioni per fallimenti legittimi.
- **File letti:** `src/domain/watchPosition.ts`, `episodeOrder.ts`, SPEC § *ProgressEvent*, § *Regole di dominio*.
- **File modificati:** `src/domain/trackedShow.ts` (tipo di esito condiviso `ProgressOutcome`, accanto ai tipi che descrive).
- **File da creare:**
  - `src/domain/progressAdvance.ts` — l'avanzamento ha regole proprie (monotonia, snapshot, revisione) e cambia per ragioni sue.
  - `src/domain/progressUndo.ts` — l'undo è l'unica operazione che va all'indietro e porta il controllo di revisione: responsabilità distinta dall'avanzamento.
  - `src/domain/progressAdvance.spec.ts`, `src/domain/progressUndo.spec.ts`.

### Fase 6 — I cinque ordinamenti della home

*Obiettivo: la lista non cambia mai ordine a caso.*

- [x] `activity` (predefinito) — `lastViewedAt` decrescente, **mai iniziate in fondo**.
- [x] `alphabetical` — `localeCompare` in locale **italiano** sul titolo italiano.
- [x] `unwatched` — arretrati decrescenti, **serie in pari in fondo**.
- [x] `added` — `addedAt` decrescente.
- [x] `nextEpisode` — prossima uscita più vicina, **date ignote e serie senza prossima uscita in fondo**.
- [x] A parità di valore, **sempre** il titolo alfabetico. La scelta è una preferenza locale del dispositivo e non tocca i dati condivisi.
- [x] Test: criterio 11 su tutti e cinque (valori mancanti in fondo, pareggi risolti alfabeticamente), criterio 12 (dopo una conferma «Vista», con `activity` la serie sale in cima), ordinamento alfabetico su titoli con accenti e articoli.
- [x] Criterio di completamento osservabile: `npm test` verde; le funzioni non mutano l'array ricevuto.
- **File letti:** `src/domain/watchPosition.ts`, mockup (`sortedShows`, per i testi delle opzioni).
- **File modificati:** nessuno.
- **File da creare:**
  - `src/domain/showSorting.ts` — i cinque criteri e la regola di pareggio: un solo posto dove cambia l'ordine della lista.
  - `src/domain/showSorting.spec.ts`.

### Fase 7 — Confine dati a sottoscrizione e repository locale Dexie

*Obiettivo: il contratto che rende quasi indolore il passaggio all'online.*

- [x] Contratto `TrackedShowStore`: `subscribeToTrackedShows(listener): Unsubscribe` e `subscribeToShow(id, listener): Unsubscribe` — **sottoscrizione, non interrogazione una tantum**; più i comandi `addShow`, `updateCatalog`, `changeProvider`, `advanceProgress`, `undoLastProgress`, `removeShow`, ciascuno con esito discriminato.
- [x] Il contratto **non** nomina Dexie né Firestore e non espone tipi di libreria: parla solo di tipi di `src/domain/`.
- [x] Implementazione locale su Dexie: schema versione 1, **unica tabella `trackedShows`** con il documento intero annidato, più `progressEvents` come collezione figlia indicizzata su `trackedShowId` (rispecchia la struttura Firestore della SPEC e tiene il documento serie sotto controllo).
- [x] Notifica dei cambiamenti con `liveQuery` di Dexie: in modalità locale è il repository stesso a generare l'avviso.
- [x] Avanzamento e undo scrivono serie ed evento in **una sola transazione**, come richiede la SPEC («un'unica operazione logica»).
- [x] Modulo che espone **l'implementazione in uso**: è la riga che cambierà in Fase 22, e l'unica.
- [x] Nessun accesso a Dexie fuori da `src/persistence/` (verifica per grep alla fine della fase).
- [x] Test su `fake-indexeddb`: round-trip del documento annidato, sottoscrizione che **riceve l'avviso** dopo una scrittura, atomicità di avanzamento + evento su fallimento a metà, undo con conflitto di revisione respinto **anche a livello di transazione**.
- [x] Criterio di completamento osservabile: `npm test` verde; `grep dexie src/` restituisce solo file di `src/persistence/`.
- [x] **Vincolo ereditato dalla Fase 5:** `advanceProgress` non ha protezione di revisione perché il controllo di monotonia contro lo stato **fresco** realizza già «fra due avanzamenti prevale la posizione più avanzata». La garanzia regge **solo** se la transazione rilegge lo `show` corrente **dentro** la transazione, subito prima di invocare `advanceProgress`. Passare uno `show` catturato all_apertura della schermata romperebbe la garanzia in silenzio. Test dedicato.
- **File letti:** `src/domain/*`, SPEC § *Persistenza e condivisione*, § *Struttura Firestore*.
- **File modificati:** `vite.config.ts` (solo se `setupFiles` non basta).
- **File da creare** — cartella `src/persistence/` **nuova**:
  - `src/persistence/trackedShowStore.ts` — **il contratto**: è il confine fra applicazione e dati, e vive nel livello che quel confine definisce. Non in `domain/`, perché descrive un'astrazione di accesso, non una regola di visione.
  - `src/persistence/tvTrackerDatabase.ts` — schema e versioni Dexie: unico punto che conosce la libreria e le migrazioni.
  - `src/persistence/localTrackedShowStore.ts` — implementazione locale del contratto, con `liveQuery` e transazioni.
  - `src/persistence/currentTrackedShowStore.ts` — **la riga da cambiare in Fase 22**: sceglie l'implementazione attiva e la espone ai composable.
  - `src/persistence/storagePersistence.ts` — `navigator.storage.persist()`/`estimate()`: capacità del browser, non del dominio.
  - `src/persistence/localTrackedShowStore.spec.ts`.

### Fase 8 — Identità e sessione in modalità locale

*Obiettivo: sapere chi sta operando, con un controllo sostituibile in un file solo.*

- [x] I due profili configurati (`fabio`, `irene`) con `displayName` e icona di genere, nell'ordine del mockup.
- [x] Contratto della verifica delle credenziali, con la stessa forma che avrà quella Firebase: esito discriminato, mai eccezione su password errata.
- [x] Implementazione locale: confronto con il valore letto da `.env.local` (default `xxx`). **Va dichiarato nel codice e a schermo** che è un controllo di cortesia, non una prova di identità: chi conosce la password può scegliere indifferentemente Fabio o Irene.
- [x] Sessione: identità attiva esposta come stato reattivo, `confirmedBy`/`undoneBy` alimentati da essa fin da subito, comando «Esci».
- [x] Segnalatore di **modalità locale**, consumato dalla UI.
- [x] Test: profilo sconosciuto rifiutato, password errata rifiutata con messaggio italiano, password corretta restituisce l'identità, `confirmedBy` valorizzato con l'identità attiva.
- [x] Criterio di completamento osservabile: `npm test` verde; il valore della password **non compare** in nessun file versionato.
- [x] **Segnalazione dalla verifica della Fase 7:** il segnale «sto usando lo store locale» deve essere **uno solo**, esposto da questa fase, e letto sia da `currentTrackedShowStore.ts` sia dal banner di modalità locale. Se nascono due segnali separati, la Fase 22 dovrà toccare tre punti invece di due.
- **File letti:** mockup (`login`, `logout`, testi della schermata), SPEC § *Accesso*.
- **File modificati:** nessuno.
- **File da creare** — cartella `src/auth/` **nuova**:
  - `src/auth/profiles.ts` — i due profili sono dati di configurazione del dominio, con una ragione di cambiare propria; separati da chi li interroga.
  - `src/auth/credentialCheck.ts` — **il contratto** della verifica: è ciò che la Fase 21 sostituisce.
  - `src/auth/localCredentialCheck.ts` — implementazione di modalità locale.
  - `src/auth/session.ts` — identità attiva, ingresso e uscita.
  - `src/auth/localCredentialCheck.spec.ts`, `src/auth/session.spec.ts`.

### Fase 9 — Sorgente catalogo: contratto e catalogo finto

*Obiettivo: poter lavorare e testare senza rete, prima ancora di parlare con TMDB.*

- [x] Contratto `CatalogSource`: `searchShows(query)`, `loadShow(providerShowId)` (serie + stagioni + episodi + prossima puntata), `loadItalianProviders(providerShowId)`. Parla solo di tipi di `src/domain/`, non di JSON di TMDB.
- [x] Il risultato di ricerca porta titolo **italiano**, `original_name`, anno, stato e locandina della **stagione 1**.
- [x] Catalogo finto locale con **quattro serie** sul modello del mockup (The Bear, The White Lotus, Severance/«Scissione», Only Murders in the Building), una con più piattaforme, una con una sola, una con speciali, una con prossima puntata futura.
- [x] Il catalogo finto è **implementazione della stessa interfaccia**, non un ramo `if` dentro il client TMDB.
- [x] Test: la ricerca sul catalogo finto disambigua per anno e `original_name`; una serie con più piattaforme le restituisce tutte; gli speciali arrivano nel dato ma non nella sequenza.
- [x] Criterio di completamento osservabile: `npm test` verde; nessuna chiamata di rete nei test.
- **File letti:** mockup (`catalog`, `renderSearch`, `chooseShow`), SPEC § *Fonte dati proposta*.
- **File modificati:** nessuno.
- **File da creare** — cartella `src/catalog/` **nuova**:
  - `src/catalog/catalogSource.ts` — il contratto della sorgente editoriale: confine verso l'esterno, indipendente dal fornitore.
  - `src/catalog/sampleCatalogSource.ts` — catalogo finto: seconda implementazione del contratto, non un doppio da test, perché serve anche a lavorare senza rete.
  - `src/catalog/sampleCatalogSource.spec.ts`.

### Fase 10 — TMDB: modulo di richiesta condiviso, proxy di sviluppo e Pages Function

*Obiettivo: il token non entra mai nel browser, e sviluppo e produzione non divergono.*

- [x] Modulo condiviso che costruisce percorso e query delle quattro chiamate verificate, **senza conoscere il token** e senza API specifiche di browser o di Node: è importato sia dal proxy di Vite sia dalla Pages Function.
- [x] **Trappola da gestire**: quel modulo finisce in due scope di type-check e in due bundler diversi (Vite e wrangler). Import **relativo** dalla Function, niente alias `@/`; nessun uso di `process`, `Buffer`, `window` o `document`.
- [x] Mapping delle risposte TMDB ai tipi di dominio: titolo italiano da `name`, `original_name` conservato, `seasons` ed episodi da `tv/{id}/season/{n}`, `next_episode_to_air` come prossima puntata, provider italiani da `watch/providers` → `results.IT`.
- [x] Implementazione del contratto `CatalogSource` che chiama **il proxy**, non TMDB: il browser non vede mai il token.
- [x] Proxy di Vite in `vite.config.ts`: intercetta `/api/tmdb/*`, legge il token con `loadEnv` e aggiunge `Authorization: Bearer`. `npm run dev` resta **un comando solo**.
- [x] Pages Function equivalente, che legge il token dai secret di Cloudflare.
- [x] Errori di rete e risposte non `200` tradotti in messaggi italiani comprensibili, **senza** perdere lo stato locale e **senza** far trapelare l'URL con la credenziale nei log.
- [x] Test: il mapping su risposte TMDB registrate come fixture (nessuna chiamata reale nei test); serie senza provider italiani; stagione con episodi privi di `air_date`; speciali in `season/0`.
- [x] Verifica manuale, **una volta**: `npm run dev` più una ricerca reale dalla UI provvisoria o dalla console; e `wrangler pages dev` come controllo del percorso di produzione, **solo** prima di un eventuale deploy futuro.
- [x] Criterio di completamento osservabile: `npm test` verde; ricerca reale funzionante in `npm run dev`; `grep` del token nell'intero albero versionato senza risultati.
- **File letti:** `.env.local`, SPEC § *Fonte dati proposta*, `src/catalog/catalogSource.ts`.
- **File modificati:** `vite.config.ts` (blocco `server.proxy`), `tsconfig.node.json` (scope `functions/**`).
- **File da creare:**
  - `src/catalog/tmdbRequest.ts` — costruzione delle richieste, **condivisa fra proxy e Function**: è l'unico modo per impedire che i due percorsi divergano.
  - `src/catalog/tmdbMapping.ts` — traduzione dal JSON di TMDB ai tipi di dominio: cambia quando cambia il fornitore, non quando cambia il dominio.
  - `src/catalog/tmdbCatalogSource.ts` — implementazione del contratto sopra al proxy.
  - `src/catalog/tmdbMapping.spec.ts`, e `src/catalog/fixtures/` **nuova** — risposte TMDB registrate: dati di test accanto ai test che li usano, non nel codice di produzione.
  - `functions/api/tmdb.ts` — cartella `functions/api/` **nuova**, percorso **imposto da Cloudflare Pages**: `functions/api/tmdb` serve la rotta `/api/tmdb`.

### Fase 11 — Fondazioni UI: token, stili di base, router e shell

*Obiettivo: la palette del mockup e le tre rotte, senza ancora contenuto.*

- [x] `tokens.css` con la palette del mockup: fondo azzurro ghiaccio, superfici bianche, bordi blu-grigio, blu petrolio come colore principale, accento azzurro, verde per «In pari», ambra per le puntate in attesa, rosso per le azioni distruttive. **Tema solo chiaro.**
- [x] `base.css`: reset minimo, tipografia scura ad alto contrasto, controlli touch ≥ **46 px**, focus visibile, nessuno scorrimento orizzontale, aree sicure.
- [x] **Nessun colore fuori dai token**: verifica per grep di `#` e `rgb(` nei componenti alla fine di ogni fase di UI.
- [x] Router con **tre rotte**: login, home, dettaglio serie. Guardia che rimanda al login senza identità attiva.
- [x] Shell: intestazione appiccicata con logo, titolo, utente attivo, «Aggiorna» e «Esci»; area di contenuto scrollabile; `appVersion` in fondo alla home.
- [x] Banner di **modalità locale** («modalità locale, dati non condivisi»), sempre visibile finché Firestore non è attivo.
- [x] Componenti trasversali: icona SVG inline (niente libreria di icone), dialogo di conferma generico **utilizzabile da tastiera** con `<dialog>`, messaggio temporaneo, stato vuoto.
- [x] Test di componente (`jsdom`): il dialogo di conferma restituisce `false` su Escape e su «Annulla», `true` solo su conferma; la variante distruttiva è riconoscibile.
- [x] Criterio di completamento osservabile: l'app si avvia, le tre rotte navigano, la guardia respinge chi non ha identità attiva.
- **File letti:** mockup (`:root`, `.shell`, `.top`, `dialog`, `.confirm-body`, `.toast`).
- **File modificati:** `src/main.ts`, `src/App.vue`, `index.html`.
- **File da creare** — cartelle `src/styles/`, `src/router/`, `src/components/shell/`, `src/components/feedback/`, `src/components/icon/` **tutte nuove**:
  - `src/styles/tokens.css` — sede unica dei token: cambia quando cambia l'identità visiva, non quando cambia un componente.
  - `src/styles/base.css` — reset, tipografia e accessibilità globali.
  - `src/router/index.ts` — la navigazione è un concetto a sé, non un dettaglio di `App.vue`.
  - `src/components/shell/AppTopBar.vue`, `LocalModeBanner.vue` — struttura fissa dell'app.
  - `src/components/icon/AppIcon.vue` — icone SVG inline, in luogo di una libreria vietata.
  - `src/components/feedback/ConfirmDialog.vue`, `ToastMessage.vue`, `EmptyState.vue` — riscontri all'utente, condivisi da tutte le viste; cambiano per la loro ragione (il linguaggio dei messaggi), non per quella delle viste.
  - `src/components/feedback/ConfirmDialog.spec.ts`.
  - `src/presentation/italianFormat.ts` — cartella `src/presentation/` **nuova**: date catalogo in italiano, plurali «nuova/nuove», nomi delle piattaforme. È presentazione, fuori dal dominio e fuori dai componenti.
  - `src/presentation/italianFormat.spec.ts`.

### Fase 12 — Vista di accesso

*Obiettivo: la schermata del mockup, con il controllo sostituibile già dietro il contratto.*

- [x] Due pulsanti profilo con icona maschile e femminile e nome visibile; selezione evidenziata.
- [x] Campo password e «Accedi»; **Invio nel campo esegue il login**.
- [x] Messaggi di errore italiani: «Scegli Fabio oppure Irene.», «Password non corretta.»
- [x] Avviso di modalità locale visibile nella schermata.
- [x] Dopo l'accesso: utente attivo ed «Esci» sempre visibili nell'intestazione.
- [x] Test di componente: criterio 13 (senza autenticazione la lista non è accessibile; con credenziali valide si apre la stessa lista mostrando l'identità attiva), Invio equivale ad «Accedi», profilo non scelto blocca l'accesso.
- [x] Criterio di completamento osservabile: login e logout funzionanti end-to-end in `npm run dev`; suite verde.
- **File letti:** mockup (`.login-screen`, `login`, `logout`), `src/auth/*`.
- **File modificati:** `src/router/index.ts` (guardia definitiva), `src/App.vue`.
- **File da creare** — cartella `src/views/` **nuova**:
  - `src/views/LoginView.vue` — una vista per rotta, thin: compone componenti e composable senza logica di dominio.
  - `src/composables/useAuthSession.ts` — cartella `src/composables/` **nuova**: stato reattivo dell'identità attiva e cablaggio col contratto di verifica.
  - `src/views/LoginView.spec.ts`.

### Fase 13 — Home: elenco, ordinamento, conferma «Vista»

*Obiettivo: rispondere subito a «cosa possiamo guardare?».*

- [x] Elenco delle serie attive **alimentato dalla sottoscrizione**, non da una lettura una tantum: una scrittura da qualunque punto aggiorna la lista da sé.
- [x] Card: locandina della stagione della prima puntata da vedere, titolo italiano, badge «N nuove» oppure «In pari», piattaforma italiana, prima puntata da vedere con data catalogo, evidenza separata della prossima puntata futura.
- [x] Sommario in testa («5 nuove puntate in 3 serie» / «Siete in pari con tutto») e i due pulsanti «Aggiorna» del mockup.
- [x] Selettore di ordinamento con le cinque voci; la scelta è una **preferenza locale del dispositivo**, ricordata fra due aperture e **non** sincronizzata.
- [x] Azione rapida «Vista» sulla prima puntata da vedere, **sempre** preceduta dal popup di conferma; annullando, lo stato resta identico.
- [x] Stato vuoto disegnato bene: l'app parte senza dati e deve dire cosa fare.
- [x] Comando «carica dati di esempio», visibile **solo** in modalità locale.
- [x] Test di componente: criterio 5 (annullando la conferma lo stato non cambia), criterio 12 (con «Ultima attività» la serie confermata sale in cima), lo stato vuoto compare su lista vuota.
- [x] Criterio di completamento osservabile: criteri 3, 5 e 12 verificabili a mano in `npm run dev` sul catalogo finto; suite verde.
- [x] **Vincolo ereditato dalla Fase 4:** il calcolo della posizione è per serie e **può lanciare** su dati disallineati. Una singola serie rotta non deve svuotare la home: il composable isola il calcolo per serie e degrada quella riga con un messaggio, lasciando visibili le altre. Test dedicato.
- **File letti:** mockup (`render`, `updateSummary`, `.show`, `.summary`, `.sort-row`), `src/domain/showSorting.ts`, `src/domain/watchPosition.ts`.
- **File modificati:** `src/router/index.ts`.
- **File da creare** — cartella `src/components/show/` **nuova**:
  - `src/views/HomeView.vue` — la rotta principale, thin.
  - `src/composables/useTrackedShows.ts` — sottoscrizione, modelli di vista già pronti, conferma di avanzamento; **le viste non parlano mai col repository**.
  - `src/composables/useSortPreference.ts` — preferenza locale di ordinamento: cambia per ragioni sue, non insieme alla lista.
  - `src/components/show/ShowCard.vue`, `ShowBadge.vue`, `SortSelect.vue` — sottocartella per **coesione lessicale**: nascono e cambiano col concetto «serie seguita» e non servono altrove.
  - `src/composables/useTrackedShows.spec.ts`, `src/components/show/ShowCard.spec.ts`.

### Fase 14 — Dialogo di inserimento serie

*Obiettivo: si aggiunge solo una serie reale del catalogo, con la piattaforma giusta.*

- [x] `<dialog>` modale (non una rotta), apribile dal pulsante flottante, chiudibile da tastiera.
- [x] Campo titolo con autocomplete remoto e **debounce**; ogni risultato mostra locandina di stagione 1, titolo italiano, `original_name` in piccolo, anno e stato.
- [x] Una serie si aggiunge **solo** scegliendo un risultato, mai come testo libero.
- [x] **Duplicati bloccati** per `providerShowId`, con messaggio comprensibile.
- [x] Secondo passo: piattaforme italiane; più di una → scelta obbligatoria; una sola → già selezionata; «← Cambia serie» torna indietro.
- [x] Al salvataggio vengono importati stagioni, episodi, titoli e date disponibili nel documento della serie.
- [x] Scelta iniziale opzionale della posizione: «Da iniziare» oppure stagione/episodio già visto.
- [x] Test: criterio 1 (risultati disambiguati, niente testo libero), criterio 2 (l'aggiunta salva locandina, stagioni ed episodi), duplicato rifiutato, posizione iniziale applicata senza generare un `ProgressEvent` spurio.
- [x] Criterio di completamento osservabile: aggiunta reale da TMDB funzionante in `npm run dev`; suite verde sul catalogo finto.
- [x] **Segnalazione dalla verifica della Fase 10:** `sampleCatalogSource` valorizza sempre `status` nei risultati di ricerca, mentre TMDB non lo restituisce mai. In modalità demo lo stato comparirebbe nell_elenco, con TMDB reale no. Allinea la UI di ricerca al comportamento reale, non a quello del catalogo finto.
- **File letti:** mockup (`#addDialog`, `renderSearch`, `chooseShow`, `.provider-step`), `src/catalog/catalogSource.ts`.
- **File modificati:** `src/views/HomeView.vue` (pulsante di apertura).
- **File da creare** — cartella `src/components/add/` **nuova**:
  - `src/composables/useAddShow.ts` — ricerca con debounce, passo della piattaforma, salvataggio: caso d'uso completo, tenuto fuori dai componenti.
  - `src/components/add/AddShowDialog.vue`, `SearchResultRow.vue`, `ProviderChoice.vue`, `InitialPositionPicker.vue` — sottocartella dedicata: questi componenti servono solo all'inserimento e cambiano con esso.
  - `src/composables/useAddShow.spec.ts`, `src/components/add/AddShowDialog.spec.ts`.

### Fase 15 — Dettaglio serie: stagioni, avanzamento, undo, rimozione, speciali

*Obiettivo: correggere la posizione, in avanti con la conferma e all'indietro solo con l'undo.*

- [x] Intestazione con locandina, titolo italiano, arretrati e prossima puntata; ritorno alla home.
- [x] Stagioni espandibili; **solo** gli episodi successivi alla posizione raggiunta; la prima stagione utile aperta.
- [x] Episodi futuri riconoscibili e **non** marcabili; nella loro stagione, il riquadro ambra «Prossima puntata in arrivo» con data, numero e titolo, **senza** azione «Vista».
- [x] «Segna come vista» su un episodio qualsiasi → popup di conferma → avanzamento multiplo implicito: stagioni ed episodi precedenti spariscono **immediatamente**.
- [x] «Annulla ultima conferma» visibile **solo** se esiste un avanzamento annullabile; richiede conferma; ripristina esattamente posizione, conteggi e locandina.
- [x] Undo rifiutato per conflitto di revisione → messaggio che invita a ricaricare, **senza** perdere lo stato locale.
- [x] **Speciali** (`seasonNumber = 0`): sezione in fondo, **sola lettura, senza «Vista»**, esclusi da posizione e conteggi.
- [x] Modifica della piattaforma senza toccare episodi o posizione.
- [x] Rimozione della serie con popup **rosso**: elimina `TrackedShow` e tutti i suoi eventi; annullando, tutto resta intatto.
- [x] Test di componente: criterio 6 (undo con seconda conferma), criterio 7 (conferma rossa; annullando serie ed eventi restano), un episodio futuro non offre «Vista», la sezione speciali non offre «Vista».
- [x] Criterio di completamento osservabile: criteri 4, 6 e 7 verificabili a mano; suite verde.
- **File letti:** mockup (`showDetail`, `seasonMarkup`, `.upcoming-episode`, `.undo`, `.danger`).
- **File modificati:** `src/router/index.ts` (rotta di dettaglio con parametro).
- **File da creare:**
  - `src/views/ShowDetailView.vue` — una vista per rotta, thin.
  - `src/composables/useShowDetail.ts` — sottoscrizione alla singola serie, avanzamento, undo, rimozione, cambio piattaforma.
  - `src/components/show/SeasonSection.vue`, `EpisodeRow.vue`, `UpcomingEpisodeBox.vue`, `SpecialsSection.vue` — stessa famiglia lessicale della Fase 13, stessa sottocartella.
  - `src/composables/useShowDetail.spec.ts`, `src/components/show/SeasonSection.spec.ts`.

### Fase 16 — Aggiornamento del catalogo dalla rete

*Obiettivo: le nuove uscite arrivano, la posizione non si muove.*

- [ ] I due pulsanti «Aggiorna» del mockup (intestazione e sommario) ricaricano le serie seguite da TMDB. **Niente pull-to-refresh.**
- [ ] All'apertura, se l'ultimo controllo è più vecchio della soglia e c'è rete, aggiornamento in background. **Soglia: 12 ore** (vedi *Domande aperte* 1).
- [ ] Un cambio di titolo, locandina, stato o elenco episodi **aggiorna i dati editoriali senza toccare la posizione**; `catalogUpdatedAt` valorizzato solo sugli aggiornamenti riusciti.
- [ ] Senza rete: l'app mostra l'ultimo catalogo scaricato e **permette comunque di avanzare la posizione**; il fallimento è dichiarato con un messaggio, non con una schermata bianca.
- [ ] Indicazione «aggiornata ora / N minuti fa» nell'intestazione, come nel mockup.
- [ ] Test: criterio 8 (una puntata pubblicata dopo l'ultimo aggiornamento alza il badge senza spostare la posizione), criterio 9 (senza rete lista e dettaglio restano, l'avanzamento è possibile), un episodio rinominato non sposta la posizione, un aggiornamento fallito lascia `catalogUpdatedAt` invariato.
- [ ] Criterio di completamento osservabile: criteri 8 e 9 verificabili spegnendo la rete dagli strumenti del browser; suite verde.
- [ ] **Rischio ereditato dalla Fase 3 e segnalata dalla verifica, da non ignorare:** `positionOfEpisode` restituisce `-1` sia per «serie mai iniziata» sia per «episodio non presente nella sequenza». Il chiamante deve distinguere i due casi **a monte**, guardando se `lastWatchedEpisodeId` è assente o è presente ma non trovato: sono rami con esiti opposti. Trattarli come lo stesso valore fa ricomparire tutte le puntate già viste.
- [ ] **Vincolo ereditato dalla Fase 4:** `calculateWatchPosition` **lancia** se `lastWatchedEpisodeId` è presente ma non compare nella sequenza. La riparazione decisa dall_utente (ripiego sull_episodio precedente ancora esistente, § *Domande aperte* 4) va quindi applicata **nel merge, prima di persistere**: è il merge il garante dell_invariante, non il dominio. Un catalogo aggiornato non deve mai essere scritto lasciando la posizione orfana.
- [ ] **Punto di cablaggio già pronto:** `src/composables/useRefreshNotice.ts` è il punto unico dove oggi vive il messaggio «aggiornamento non ancora disponibile», condiviso dai due pulsanti «Aggiorna». Qui va sostituito con la chiamata di rete vera. Non aggiungerne un secondo.
- [ ] **Già fatto in anticipo, alla chiusura della Fase 14:** `src/domain/catalogMerge.ts` esiste e ospita `mergeAnnouncedEpisode`, condivisa da inserimento reale e dati di esempio. Qui va **aggiunta** la fusione del catalogo aggiornato con quello locale, nello stesso file. Non duplicare la funzione già presente.
- **File letti:** `src/catalog/tmdbCatalogSource.ts`, `src/persistence/trackedShowStore.ts`.
- **File modificati:** `src/components/shell/AppTopBar.vue`, `src/views/HomeView.vue`.
- **File da creare:**
  - `src/composables/useCatalogRefresh.ts` — politica di aggiornamento (soglia, stato in corso, esiti): ha una ragione di cambiare propria, distinta dall'elenco.
  - `src/domain/catalogMerge.ts` — fusione dei dati editoriali nuovi con lo stato personale esistente: funzione pura, **è qui che si garantisce che la posizione non si muova**.
  - `src/domain/catalogMerge.spec.ts`, `src/composables/useCatalogRefresh.spec.ts`.

### Fase 17 — PWA: manifest, icone, service worker, aggiornamento

*Obiettivo: installabile e utilizzabile offline dopo un accesso riuscito.*

- [ ] Manifest con nome, nome breve, descrizione, `lang: 'it'`, `display: standalone`, colori coerenti con i token.
- [ ] Icone 192, 512 e maskable 512, più `apple-touch-icon` e favicon, generate senza aggiungere dipendenze.
- [ ] Service worker con precache degli asset applicativi; **nessuna cache manuale di IndexedDB**.
- [ ] `registerType: 'prompt'` con barra di aggiornamento **discreta e ignorabile**.
- [ ] `/api/tmdb/*` **escluso** dal precache e mai servito dalla cache: è rete, non asset.
- [ ] Verifica su `npm run build` + `npm run preview`: manifest corretto, precache popolato, avvio offline, aggiornamento proposto e non imposto. Installazione reale su telefono resta all'utente.
- [ ] Criterio di completamento osservabile: `dist/manifest.webmanifest` e `dist/sw.js` presenti e ispezionati; app avviabile offline dopo un primo caricamento.
- **File letti:** `gym-tracker/vite.config.ts`, SPEC § *Requisiti non funzionali*.
- **File modificati:** `vite.config.ts`, `index.html`, `src/App.vue`.
- **File da creare** — cartella `public/` **nuova**: `public/pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png`, `apple-touch-icon.png`, `favicon.png` — asset statici serviti così come sono, `public/` è la sede prevista da Vite; `src/composables/usePwaUpdate.ts` — stato dell'aggiornamento, isolato dal componente che lo mostra; `src/components/shell/UpdateBar.vue` — la barra è parte della shell.

### Fase 18 — Export/import JSON

*Obiettivo: i dati inseriti in modalità locale non si perdono nel passaggio all'online.*

- [ ] Formato con `formatVersion: 1`, istante di esportazione, elenco delle serie **con stagioni, episodi ed eventi**; nome file `tv-tracker-backup-YYYY-MM-DD.json`.
- [ ] Validazione **integrale prima di qualunque scrittura**: versione, struttura, tipi, date `YYYY-MM-DD`, coerenza fra `lastWatchedEpisodeId` e gli episodi presenti.
- [ ] Riepilogo dell'importazione: totale nel file, nuove, già presenti, più recenti del locale.
- [ ] Unione per `id` con `updatedAt` più recente, **unità di merge la serie intera**; sostituzione completa in **una transazione**, previa conferma.
- [ ] L'import passa dal **contratto** `TrackedShowStore`, non da Dexie: così in Fase 23 lo stesso file si riversa su Firestore senza riscrivere nulla.
- [ ] Test: file valido importato, file con versione ignota respinto, file troncato respinto **senza toccare il database**, merge che conserva la copia più recente, sostituzione completa atomica su fallimento a metà.
- [ ] Criterio di completamento osservabile: esportazione e reimportazione dello stesso file lasciano lo stato identico; suite verde.
- [ ] **Segnalazione dalla verifica della Fase 7:** il merge dei backup sceglie quale copia tenere confrontando `updatedAt`, che oggi è assegnato dal **dispositivo**. Due telefoni con orologi sfasati possono quindi far vincere la copia sbagliata. Decidere qui se `updatedAt` vada assegnato dallo store come `confirmedAt`, o se il merge debba usare un criterio meno fragile dell_orologio.
- **File letti:** `src/persistence/trackedShowStore.ts`, `src/domain/trackedShow.ts`.
- **File modificati:** `src/views/HomeView.vue` (accesso ai comandi di backup).
- **File da creare** — cartella `src/backup/` **nuova**:
  - `src/backup/backupFormat.ts` — il formato è un contratto con l'esterno, con una ragione di cambiare propria.
  - `src/backup/backupValidation.ts` — validazione integrale: funzione pura, nessun accesso al database.
  - `src/backup/backupExport.ts`, `src/backup/backupImport.ts` — costruzione del file e applicazione del piano via contratto.
  - `src/composables/useBackup.ts` — cablaggio con la UI; accetta **il testo** del file, non un `File` del DOM, così resta testabile senza browser.
  - `src/components/feedback/ImportSummaryCard.vue` — riepilogo con le due strade.
  - `src/backup/backupValidation.spec.ts`, `backupExport.spec.ts`, `backupImport.spec.ts`.

### Fase 19 — Suite di test e verifica dei criteri di accettazione in modalità locale

*Obiettivo: chiudere l'MVP locale con la matrice criterio → test compilata.*

- [ ] Matrice criterio → test per i criteri **1–12** della SPEC; i criteri **13–14** sono coperti in modalità locale e **ricontrollati** dopo la Fase 21.
- [ ] Il criterio **10** (due aggiornamenti da dispositivi diversi non vengono persi) è verificabile in modalità locale **solo** a livello di revisione ed eventi, non di sincronizzazione reale: la verifica completa è in Fase 22. Dichiararlo, non spuntarlo a metà.
- [ ] Nessun test dipendente dall'ora o dal fuso della macchina: la data odierna entra sempre come parametro.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` tutti verdi.
- [ ] Verifiche architetturali per grep: zero `dexie` fuori da `src/persistence/`, zero colori fuori dai token, zero import di `src/catalog/` o `src/persistence/` dentro `src/components/` e `src/views/`, `mockup/` intatto e assente da `dist/`.
- [ ] Criterio di completamento osservabile: matrice compilata e quattro comandi verdi; l'app è usabile a mano dall'inizio alla fine sul telefono, in locale.
- **File letti:** tutti i `*.spec.ts` creati, `tv-tracker-spec.md`.
- **File modificati:** i `*.spec.ts` scoperti rispetto alla matrice.
- **File da creare:** eventuali `src/**/*.spec.ts` mancanti.

### Fase 20 — Firebase: preparazione del progetto e degli account (nessun codice)

*Obiettivo: esistere su Firebase prima di scriverne il codice.*

- [ ] **Passo dell'utente**: creare il progetto Firebase, abilitare Authentication Email/Password, creare i due account (Fabio e Irene) e annotare le password **fuori dal repository**.
- [ ] **Passo dell'utente**: creare il database Cloud Firestore e scegliere la regione.
- [ ] Fissare l'unico `householdId` condiviso e i due `uid`; registrarli in `.env.local`, mai in un file versionato.
- [ ] Fissare la versione dell'SDK `firebase` e verificare i limiti correnti del piano gratuito.
- [ ] Criterio di completamento osservabile: due account che accedono davvero dalla console Firebase; nessun file di progetto modificato.
- **File letti:** SPEC § *Soluzione: Firebase Cloud Firestore*.
- **File modificati:** `.env.local.example` (nomi delle nuove variabili, senza valori).
- **File da creare:** nessuno. **Questa fase non produce codice.**

### Fase 21 — Firebase Authentication al posto del controllo locale

*Obiettivo: sostituire il controllo, non la schermata.*

- [ ] Implementazione Firebase del contratto `credentialCheck`: `signInWithEmailAndPassword` sull'identificativo tecnico associato al profilo scelto.
- [ ] La schermata di login **non cambia**: cambiano il modulo di verifica e la riga che lo sceglie.
- [ ] Sessione persistente sul dispositivo fino al logout o alla scadenza di Firebase; `confirmedBy`/`undoneBy` passano dall'`uid` autenticato mantenendo `fabio`/`irene` come identificativi leggibili.
- [ ] Errori di autenticazione tradotti in messaggi italiani comprensibili, senza esporre i codici di Firebase.
- [ ] Il banner di modalità locale sparisce **solo** quando entrambe le implementazioni online sono attive.
- [ ] Test: mappatura degli errori di Firebase sui messaggi italiani, con l'SDK sostituito da un doppio; criteri **13** e **14** rieseguiti.
- [ ] Criterio di completamento osservabile: login reale con gli account veri; `src/views/LoginView.vue` **non compare** fra i file modificati della fase. Se compare, il contratto della Fase 8 era sbagliato e va detto.
- [ ] **Vincolo ereditato dalla Fase 8:** questa fase **rimuove** `ActiveProfileStorage` e la persistenza del profilo su `localStorage`, sostituita dalla persistenza nativa di Firebase Authentication. Non devono restare due meccanismi in parallelo. Il ripristino della sessione è già a forma asincrona con tre stati (`restoring` | `authenticated` | `anonymous`) dalla Fase 8, quindi `LoginView.vue` e la navigazione **non** vanno toccate: se lo fossero, la fase si ferma e lo dichiara.
- **File letti:** `src/auth/*`.
- **File modificati:** `src/auth/session.ts` (sola scelta dell'implementazione), `package.json` (dipendenza `firebase`).
- **File da creare:**
  - `src/auth/firebaseApp.ts` — inizializzazione dell'SDK, unico punto che la conosce.
  - `src/auth/firebaseCredentialCheck.ts` — implementazione online del contratto.
  - `src/auth/firebaseCredentialCheck.spec.ts`.

### Fase 22 — Cloud Firestore come implementazione del confine dati

*Obiettivo: la prova che il confine della Fase 7 era progettato bene.*

- [ ] Implementazione Firestore del contratto `TrackedShowStore`: `onSnapshot` al posto di `liveQuery`, struttura `households/{householdId}/trackedShows/{id}/progressEvents/{eventId}` come da SPEC.
- [ ] Cache persistente web abilitata: letture e scritture offline, riallineamento al ritorno della rete.
- [ ] Avanzamento e undo in **transazione**, con controllo della revisione: fra due avanzamenti concorrenti prevale la posizione **più avanzata**; l'undo è l'unica operazione autorizzata ad andare indietro e prevale solo se annulla l'ultima conferma ancora attiva.
- [ ] `confirmedAt` assegnato dal server, come richiede la SPEC.
- [ ] Attivazione con **la sola riga** di `currentTrackedShowStore.ts`. **Se per farlo funzionare serve toccare composable o viste, fermarsi e registrarlo**: è il requisito esplicito dell'utente e il metro di questa fase.
- [ ] Test: criterio **10** con l'emulatore Firestore o con un doppio del contratto — due avanzamenti concorrenti, il più avanzato vince; un undo obsoleto viene rifiutato.
- [ ] Criterio di completamento osservabile: la lista è condivisa fra due browser diversi. Fuori da `src/persistence/` l'unica modifica ammessa è il **valore** di `src/localMode.ts` (da costante a valore derivato dalla configurazione Firebase presente): il banner e ogni altro lettore continuano a leggere lo stesso booleano senza cambiare forma. **Nessun composable e nessuna vista fra i file modificati** — inclusa `LocalModeBanner.vue`, che non va toccata perché la sua condizione di visibilità legge già `isLocalMode`. Se una vista o un composable compare fra i modificati, la fase si ferma e lo dichiara.
- **File letti:** `src/persistence/trackedShowStore.ts`, `localTrackedShowStore.ts`, SPEC § *Struttura Firestore*.
- **File modificati:** `src/persistence/currentTrackedShowStore.ts` (la riga di scelta), `src/localMode.ts` (il valore del segnale, non la sua forma). **Non** `LocalModeBanner.vue`: legge già il segnale.
- **File da creare:**
  - `src/persistence/firestoreTrackedShowStore.ts` — implementazione online del contratto: **è il file che sostituisce quello locale**.
  - `src/persistence/firestoreTrackedShowStore.spec.ts`.

### Fase 23 — Regole di sicurezza Firestore e travaso dei dati locali

*Obiettivo: accesso ai soli membri del nucleo, e nessun dato perso nel passaggio.*

- [ ] Regole Firestore: accesso consentito **solo** se `request.auth.uid` esiste in `households/{householdId}/members`; nessuna scrittura anonima; eventi scrivibili solo insieme alla serie a cui appartengono.
- [ ] Documento `members/{uid}` creato per i due account; `appMeta/config` inizializzato.
- [ ] Prova **negativa**: un utente autenticato ma non membro riceve un rifiuto; un utente non autenticato riceve un rifiuto.
- [ ] Travaso: export JSON dei dati locali (Fase 18) e reimportazione con l'implementazione Firestore attiva. Il file è lo stesso, l'import passa dal contratto.
- [ ] Verifica che i dati travasati siano visibili da entrambi i dispositivi e che le posizioni siano identiche.
- [ ] Criterio di completamento osservabile: regole pubblicate, prove negative superate, dati locali presenti online.
- **File letti:** `src/backup/*`, SPEC § *Struttura Firestore*.
- **File modificati:** nessuno sotto `src/`.
- **File da creare:**
  - `firestore.rules` (radice) — percorso **imposto** dagli strumenti Firebase; è configurazione di infrastruttura, non codice applicativo.
  - `firestore.indexes.json` (radice) — solo se una query lo richiede.

### Fase 24 — Documentazione e chiusura

*Obiettivo: il progetto si riprende in mano senza di noi.*

- [ ] `README.md`: cosa fa l'app, Node 22 e `fnm`, avvio, test, lint, build, variabili di `.env.local`, formato di backup versione 1, nota che `mockup/` è un riferimento eliminabile.
- [ ] `CLAUDE.md` sul modello di quello di Gym Tracker: stack, comandi, architettura, **regole architetturali da non violare**, modello dei dati, convenzioni, stato del repository.
- [ ] Registro di questo file completo: decisioni, deviazioni, esiti dei test, esito di ogni fase di verifica.
- [ ] Esito finale compilato e stato portato a `COMPLETED`.
- **File letti:** `tv-tracker-spec.md`, `package.json`, `gym-tracker/CLAUDE.md`.
- **File modificati:** `spec/implementation-tv-tracker.md`.
- **File da creare:** `README.md`, `CLAUDE.md` (radice del progetto, sedi canoniche).

## File coinvolti (effettivi)

Pre-compilati in via **provvisoria** dall'analisi della SPEC, del mockup e del progetto gemello; **da confermare e correggere in Fase 2**, che è la prima fase che tocca `src/`. Formato: `` `path` — motivo``.

**Dominio** (`src/domain/`, funzioni pure, zero import da Vue, Dexie, browser)
- `trackedShow.ts` — tipi della gerarchia ed esiti discriminati
- `identity.ts` — generazione UUID
- `catalogDate.ts` — algebra della data catalogo
- `episodeOrder.ts` — sequenza lineare, speciali esclusi
- `watchPosition.ts` — prima puntata non vista, arretrati, prossima futura
- `seasonPoster.ts` — locandina stagionale con ripiego
- `progressAdvance.ts` — avanzamento e `ProgressEvent`
- `progressUndo.ts` — undo e conflitto di revisione
- `showSorting.ts` — i cinque ordinamenti
- `catalogMerge.ts` — dati editoriali nuovi senza toccare la posizione

**Catalogo** (`src/catalog/`) — `catalogSource.ts`, `tmdbRequest.ts`, `tmdbMapping.ts`, `tmdbCatalogSource.ts`, `sampleCatalogSource.ts`, `fixtures/`
**Identità** (`src/auth/`) — `profiles.ts`, `credentialCheck.ts`, `localCredentialCheck.ts`, `firebaseCredentialCheck.ts`, `firebaseApp.ts`, `session.ts`
**Persistenza** (`src/persistence/`) — `trackedShowStore.ts` (contratto), `tvTrackerDatabase.ts`, `localTrackedShowStore.ts`, `firestoreTrackedShowStore.ts`, `currentTrackedShowStore.ts`, `storagePersistence.ts`
**Backup** (`src/backup/`) — `backupFormat.ts`, `backupValidation.ts`, `backupExport.ts`, `backupImport.ts`
**Composable** (`src/composables/`) — `useAuthSession.ts`, `useTrackedShows.ts`, `useSortPreference.ts`, `useAddShow.ts`, `useShowDetail.ts`, `useCatalogRefresh.ts`, `useBackup.ts`, `usePwaUpdate.ts`
**Presentazione** (`src/presentation/`) — `italianFormat.ts`
**Componenti** (`src/components/`) — `shell/AppTopBar.vue`, `LocalModeBanner.vue`, `UpdateBar.vue`; `icon/AppIcon.vue`; `feedback/ConfirmDialog.vue`, `ToastMessage.vue`, `EmptyState.vue`, `ImportSummaryCard.vue`; `show/ShowCard.vue`, `ShowBadge.vue`, `SortSelect.vue`, `SeasonSection.vue`, `EpisodeRow.vue`, `UpcomingEpisodeBox.vue`, `SpecialsSection.vue`; `add/AddShowDialog.vue`, `SearchResultRow.vue`, `ProviderChoice.vue`, `InitialPositionPicker.vue`
**Viste** (`src/views/`) — `LoginView.vue`, `HomeView.vue`, `ShowDetailView.vue`
**Resto di `src/`** — `router/index.ts`, `styles/tokens.css`, `styles/base.css`, `main.ts`, `App.vue`, `appVersion.ts`
**Fuori da `src/`** — `functions/api/tmdb.ts`, `public/` (icone PWA), `scripts/check-node-version.mjs`, `firestore.rules`, e in radice `package.json`, `.node-version`, `tsconfig*.json`, `eslint.config.js`, `vite.config.ts`, `vitest.setup.ts`, `index.html`, `.env.local.example`, `README.md`, `CLAUDE.md`

**Cartelle che non esistono ancora:** tutte quelle elencate sopra. L'asse di organizzazione è il **livello** (dominio, catalogo, identità, persistenza, backup, composable, presentazione, componenti, viste), con sottocartelle **per concetto** dove i file sono coesi (`show`, `add`, `shell`, `feedback`, `icon`). Nessun contenitore generico. `functions/api/` e `public/` hanno percorsi **imposti** rispettivamente da Cloudflare Pages e da Vite.

## Registro

Voci datate (`YYYY-MM-DD`), append-only.

- **Decisioni tecniche** (non cambiano il comportamento) — `Decisione · Motivazione · Impatto`:
  - *2026-09-18, Fase 11* — **Limite di 5 secondi all_attesa del ripristino della sessione** · La guardia del router attende che la sessione esca da `restoring` prima di decidere, per non rimandare al login chi è già autenticato; senza un limite, un ripristino che non si conclude lascerebbe la navigazione appesa e l_utente davanti a una pagina bianca · Scaduto il limite si procede come utente anonimo, cioè si va al login. Il numero **non viene dalla SPEC**, è una scelta nostra: da rivedere alla Fase 21, quando il ripristino passerà a Firebase e dipenderà dalla rete.
- **Deviazioni dalla SPEC** (da motivare) — `Descrizione · Motivazione · Impatto · Aggiorna la SPEC? sì/no`: nessuna oltre a quelle già elencate in *Scostamenti dalla SPEC già decisi dall'utente*, che sono decisioni dell'utente e non vanno rinegoziate.
- **Problemi aperti** (bloccano l'avanzamento) — `Descrizione · Impatto · Opzioni · Decisione richiesta`: nessuno.

### Avanzamento delle fasi

| Data | Fase | Comando / verifica | Esito | Esito della fase di verifica |
| --- | --- | --- | --- | --- |
| 2026-09-18 | 1 — Sicurezza chiave e repository | `git status --porcelain -uall`, `git check-ignore -v` | **Fatto.** `.gitignore` verificato e già completo; `git init` eseguito; `.env.local.example` versionato senza valori; `.env.local` creato dal token v4. Nessun file `.env` con valori e nessun file sotto `spec/apikey/` visibile a git. | Saltata: fase senza codice applicativo, esito verificato da comando. |
| 2026-09-18 | 2 — Scaffold, toolchain e Node 22 | `npm run lint/typecheck/test/build` su Node 22.23.2 | **Fatto.** 14 file creati, 593 pacchetti, versioni allineate a Gym Tracker. Quattro comandi verdi, rieseguiti in autonomia dal processo principale. Trappola `vue-tsc` verificata con errore volontario per scope: fallisce in entrambi. `npm audit`: 2 moderate su `@vitest/mocker` via Vitest 3.2, non risolte perché il fix impone Vitest 5 — riguardano il mocking in test, non il runtime. | Seconda invocazione **saltata e dichiarata**: fase di sola configurazione, nessun codice applicativo; verificata dal processo principale con i quattro comandi e la lettura dei file. |
| 2026-09-18 | 3 — Tipi di dominio e ordine episodi | `npm test` (20 test), `lint`, `typecheck` | **Fatto.** 7 file in `src/domain/`: tipi readonly con stagioni ed episodi annidati, generazione id isolata, algebra della data catalogo, sequenza lineare con speciali esclusi ma conservati. Grep confermato: nessun import di Vue o Dexie, `crypto` solo in `identity.ts`. | **Eseguita.** Ha *corretto* un test compiacente sul confine di mezzanotte (fuso Honolulu UTC-10: a mezzanotte locale la data UTC coincide, quindi il test passava anche con l_implementazione rotta a getUTC*; sostituito con Kiritimati UTC+14 e verificato per rottura deliberata). Ha *scritto* `identity.spec.ts`, mancante. Ha *confermato* forma di `ItalianProvider` e assenza di orologio letto internamente. Ha *proposto*, senza applicare, di distinguere a monte la sentinella `-1`: annotato nelle Fasi 4 e 16. |
| 2026-09-18 | 4 — Posizione, arretrati, locandina | `npm test` (32 test), `lint`, `typecheck` | **Fatto.** `watchPosition.ts` e `seasonPoster.ts` con i rispettivi test. Distinzione fra prima puntata **pubblicata** non vista (badge, azione «Vista») e prossimo episodio grezzo (locandina). Anomalia «posizione orfana» resa esplicita con fail-fast invece di degradare in silenzio a «mai iniziata». | **Eseguita.** Mutation testing indipendente: una mutazione **sopravvissuta** — confine `airDate === oggi` trattato come futuro anziché pubblicato, non coperto da alcun test; *corretto* con test dedicato. *Corretto* il messaggio dell_eccezione, che non identificava la serie. *Rafforzati* due test. *Confermata* contro il mockup la distinzione fra i due campi episodio. *Proposto* senza applicare un micro-refactor di `isFutureEpisode` su `isAlreadyPublished`: rimandato. |
| 2026-09-18 | 5 — Avanzamento e undo | `npm test` (49 test), `lint`, `typecheck` | **Fatto.** `progressAdvance.ts`, `progressUndo.ts`, `ProgressOutcome` discriminato in `trackedShow.ts`. Rifiuti come esito, mai eccezione: indietro, futuro, episodio inesistente, nessun evento annullabile, conflitto di revisione. Autore: 4 mutazioni provate, tutte catturate. | **Eseguita, due difetti trovati e corretti.** (1) `lastViewedAt` restava fermo sulla conferma annullata invece di tornare a quella ripristinata: con l_ordinamento predefinito la serie sarebbe rimasta in cima subito dopo averne disfatto la visione. (2) La scelta della conferma da annullare dipendeva dall_ordine dell_array a parità di `confirmedAt`: annullamento non deterministico con due dispositivi. Aggiunti due test di regressione, verificati per rottura. *Rafforzati* i test di immutabilità con `deepFreeze`. 3 mutazioni indipendenti, tutte catturate. *Confermata* l_asimmetria di revisione fra avanzamento e undo, con vincolo girato alla Fase 7. |
| 2026-09-18 | 6 — I cinque ordinamenti | `npm test` (62 test), `lint`, `typecheck` | **Fatto.** `showSorting.ts`: cinque criteri con gli stessi identificatori del mockup, pareggio sempre risolto per titolo in locale italiano, valori mancanti in fondo. `sortShows` **riceve** la posizione già calcolata invece di calcolarla: una serie disallineata non fa fallire l_ordinamento dell_intera lista, e la posizione si calcola una volta per serie anziché dentro il comparatore. 4 mutazioni provate dall_autore, tutte catturate. | **Eseguita.** *Aggiunti* tre test mancanti, fra cui i due **cross-fase** che nessuno copriva: dopo un annullamento la serie torna alla posizione precedente, e annullando l_unica conferma finisce in fondo come mai iniziata. *Confermati* senza modifica la forma di `SortableShow`, l_assenza di caso speciale per «in pari», la protezione dell_array con `Object.freeze`, la copertura dichiarata parziale. 2 mutazioni indipendenti catturate, una terza riconosciuta come mutante equivalente. **La mutazione di regressione che il sandbox aveva bloccato all_agente è stata eseguita dal processo principale**: reintrodotto il difetto della Fase 5, falliscono 3 test — quello di regressione e entrambi i cross-fase; file ripristinato, suite verde. |
| 2026-09-18 | 7 — Confine dati e repository locale | `npm test` (73 test), `lint`, `typecheck`, `build`, grep Dexie | **Fatto.** Contratto a sottoscrizione che non nomina Dexie né Firestore; implementazione locale su Dexie con `liveQuery`; avanzamento e undo in **una sola transazione** che **rilegge la serie al suo interno**. `advanceProgress` accetta solo l_id, non la serie: la firma stessa impedisce di passare uno stato stantio. 4 mutazioni dell_autore, tutte catturate. | **Eseguita, una crepa contrattuale trovata e chiusa.** `confirmedAt` e `undoneAt` erano forniti dal chiamante, ma la SPEC li vuole assegnati dal server e Firestore li assegna con `serverTimestamp()`: la firma sarebbe andata cambiata alla Fase 22, rompendo la promessa «un file più una riga». *Corretto* spostando la generazione dell_istante dentro lo store. *Corretto* anche `changeProvider`, che aveva due parametri opzionali adiacenti dello stesso tipo, invertibili per sbaglio: ora riceve un `ItalianProvider`. *Verificata con mutazione indipendente* la rilettura in transazione: il test dimostra la garanzia, non passa per la sola serializzazione di IndexedDB. 3 mutazioni indipendenti catturate. *Proposte* girate alle Fasi 8 e 18. |
| 2026-09-18 | 8 — Identità e sessione locale | `npm test` (90 test), `lint`, `typecheck`, `build` | **Fatto.** `src/auth/` con i due profili, contratto delle credenziali a esito discriminato e asincrono per contratto, sessione che sopravvive alla chiusura. Segnale unico di modalità locale in `src/localMode.ts`, fuori da `auth/` e da `persistence/` per non creare un verso di dipendenza improprio. 3 mutazioni dell_autore, tutte catturate. | **Eseguita, più una correzione strutturale successiva.** La verifica ha *rimosso* un commento non ammissibile, *aggiunto* due test (id che differisce per maiuscole — mutazione sopravvissuta; `localStorage` che lancia su scrittura e cancellazione, non solo lettura) e *segnalato due crepe di piano*: (a) il ripristino della sessione era **sincrono** mentre Firebase è asincrono, quindi la Fase 21 avrebbe dovuto toccare schermata e navigazione; (b) il criterio osservabile della Fase 22 era autocontraddittorio. **Entrambe chiuse:** piano corretto alle Fasi 21 e 22; stato della sessione portato a tre valori (`restoring`/`authenticated`/`anonymous`) con matcher esaustivo che **obbliga il compilatore** a far gestire il terzo caso; adattatore di `localStorage` estratto in `activeProfileStorage.ts` perché la Fase 21 lo rimuove per intero. Seconda verifica della correzione saltata e dichiarata: intervento piccolo, letto per intero dal processo principale, 3 mutazioni provate. |
| 2026-09-18 | 9 — Contratto catalogo e catalogo finto | `npm test` (102 test), `lint`, `typecheck`, `build` | **Fatto.** `src/catalog/` con il contratto che parla solo tipi di dominio, mai JSON di TMDB, e il catalogo finto come **seconda implementazione** e non come ramo condizionale. Nessun istante fra i parametri: la crepa delle Fasi 7 e 8 non si è ripetuta. 3 mutazioni dell_autore, tutte catturate. | **Eseguita, una crepa contrattuale trovata e chiusa.** «Nessun risultato» e «rete assente» erano indistinguibili per chi chiama, mentre la SPEC chiede messaggi comprensibili sugli errori di rete: *corretto* con tre esiti discriminati (trovato / non trovato / non raggiungibile), lasciando al chiamante la scelta fra messaggio esplicito (ricerca, Fase 14) e silenzio (aggiornamento in background, Fase 16). *Trovato* che mettere speciali e zero-piattaforme sulla **stessa** serie faceva sopravvivere un mutante: il catalogo finto passa da quattro a **cinque** serie (scostamento dal testo della fase, registrato qui). *Trovata sopravvissuta* la mutazione sulla ricerca case-sensitive, non coperta perché tutti gli esempi erano minuscoli: test aggiunto. |
| 2026-09-18 | 10 — TMDB, proxy e Pages Function | `npm test` (135 test), `lint`, `typecheck`, `build`, ricerca reale via proxy, grep token su `dist/` | **Fatto.** Modulo di richiesta condiviso fra proxy e Function, mapping scritto su **sette fixture reali** catturate dal processo principale dall_API vera, implementazione del contratto sopra al proxy. Token assente dal bundle, verificato dal processo principale. 4 mutazioni dell_autore, tutte catturate. | **Eseguita, tre difetti trovati.** (1) **Sicurezza:** il percorso da inoltrare a TMDB non era validato, e soprattutto **il proxy di sviluppo non rifiutava nulla** — ripiegava sul percorso grezzo e inoltrava comunque con la chiave agganciata, mentre solo la Function rifiutava. *Corretto* con un **elenco chiuso** delle quattro rotte ammesse, applicato a **entrambi** i percorsi. Verificato dal processo principale contro il proxy in esecuzione: rotta legittima 200 con dati italiani, endpoint non previsto e risalita di percorso entrambi 404 senza uscire verso TMDB. (2) **Mutazione sopravvissuta:** leggere le piattaforme di `US` invece di `IT` non faceva fallire nulla, perché nella fixture usata le due liste erano per coincidenza identiche; *corretto* con la seconda fixture reale, dove differiscono. (3) *Corretto* il caricamento delle stagioni da parallelo a sequenziale con interruzione al primo fallimento, per non far scattare il limite di richieste di TMDB su serie con molte stagioni. *Proposte non applicate:* fallimento parziale di una stagione (cambia il contratto, decisione di prodotto), tipi ufficiali di Cloudflare, incoerenza di `status` nel catalogo finto (girata alla Fase 14). |
| 2026-09-18 | 11 — Fondazioni UI: token, stili, router, shell | `npm test` (158 test), `lint`, `typecheck`, `build`, grep colori | **Fatto.** Palette del mockup nei token, tre rotte con guardia che **attende** il ripristino della sessione invece di trattarlo come «non autenticato», guscio con intestazione e banner di modalità locale, dialogo di conferma nativo, formattazione italiana. Nessun colore fuori dai token, nessun blocco per tema scuro. L_autore ha scoperto da sé che un proprio test **non catturava** la mutazione sulla guardia, per falso negativo, e l_ha corretto. | **Eseguita, due difetti reali corretti.** (1) **Rischio di blocco:** l_attesa del ripristino non aveva limite di tempo e l_osservatore non veniva liberato sul percorso di guasto — navigazione appesa e pagina bianca sul telefono. *Corretto* con un limite di 5 secondi e liberazione dell_osservatore su **entrambi** i percorsi, con test dedicato che conta le liberazioni. (2) **Accessibilità da tastiera assente:** il dialogo si affidava al comportamento nativo, che jsdom non implementa e che manca su browser senza supporto `<dialog>`. *Aggiunti* cattura e ripristino del focus e trappola del Tab, indipendenti dal nativo, con quattro test. *Aggiunto* il test del banner di modalità locale, che non ne aveva **nessuno** — la mutazione relativa passava indisturbata. 3 mutazioni indipendenti. *Confermati* senza modifica `index.html`, i controlli da 46 px e la scelta di `route.name` in `App.vue`. |
| 2026-09-18 | 12 — Vista di accesso | `npm test` (168 test), `lint`, `typecheck`, `build`, grep colori | **Fatto.** Schermata del mockup: due profili con icona, campo password con Invio che esegue il login, messaggi italiani che nascono **nel contratto** e non duplicati nella vista, banner di modalità locale. Lo stato `restoring` mostra un_attesa sobria, mai il modulo di accesso. La vista parla solo col composable: non importa mai l_implementazione locale delle credenziali. **Testo a schermo sulla password** (decisione dell_agente, approvata): «La password è la stessa per entrambi: conferma che siete voi due, non quale dei due sta scegliendo. Scegliete con attenzione il profilo giusto.» 3 mutazioni dell_autore, tutte catturate. | **Eseguita, due difetti trovati.** (1) **L_impalcatura dei test non isolava i test fra loro:** i componenti montati non venivano mai smontati, i loro osservatori restavano attivi e si riattivavano nei test successivi — un nuovo test contava dieci navigazioni invece di una. *Corretto* con smontaggio sistematico; i risultati precedenti di quel file erano inaffidabili. (2) **Il test del criterio 14 non passava dal logout vero**, azzerava lo stato a mano: *riscritto* per esercitare il logout reale, più un test sulla riapertura dopo il logout. *Aggiunto* `aria-describedby` che lega l_avviso sulla password al campo. *Verificato infondato* il sospetto sulla doppia navigazione: guardia e vista coprono direzioni distinte. 3 mutazioni indipendenti. **Verifica visiva non eseguita:** l_estensione browser non è connessa; nessuno ha ancora guardato l_app. Rimandata al punto di controllo dopo la Fase 15. |
| 2026-09-18 | 13 — Home: elenco, ordinamento, conferma «Vista» | `npm test` (209 test), `lint`, `typecheck`, `build`, grep colori | **Fatto.** Elenco alimentato dalla **sottoscrizione** e annullato allo smontaggio, card del mockup, sommario, cinque ordinamenti con preferenza locale ricordata, «Vista» sempre preceduta da conferma, stato vuoto e comando «carica dati di esempio» in sola modalità locale. Calcolo della posizione isolato per serie. 4 mutazioni dell_autore, tutte catturate. | **Eseguita, due difetti trovati più due correzioni successive.** (1) **La riga degradata mentiva:** una serie con dati disallineati si presentava come «In pari», cioè esattamente la bugia che l_utente aveva rifiutato scegliendo di contare sempre gli arretrati. *Corretta alla radice*, non con una toppa: eliminato il valore finto e introdotto un **tipo distinto** per «non calcolabile», così badge, sommario e ordinamenti non compilavano più finché non venivano sistemati. La riga ora dice «Dati non allineati» e sta in testa alla lista, non mescolata alle serie sane. (2) Selettore di ordinamento a 42 px, sotto la soglia di 46. *Corretto*. **Correzioni successive su due rilievi fuori perimetro:** il pulsante «Aggiorna» dell_intestazione **non faceva nulla** — evento emesso e mai ascoltato — ora condivide con quello del sommario un unico punto, `useRefreshNotice.ts`, che alla Fase 16 diventerà la chiamata di rete vera; e la protezione di `localStorage`, duplicata in due punti, è stata estratta in `src/storageFailure.ts` — togliendone il try/catch falliscono i test di **entrambi** i punti originari, prova che la duplicazione era esatta. |
| 2026-09-18 | 14 — Dialogo di inserimento serie | `npm test` (241 test), `lint`, `typecheck`, `build`, grep colori, ricerca reale via proxy | **Fatto.** `<dialog>` modale come nel mockup, ricerca con debounce, disambiguazione per anno e titolo originale, scelta della piattaforma con i tre casi, posizione di partenza opzionale **senza generare un evento di conferma**, esiti del catalogo distinti fra «nessun risultato» e «rete assente». 4 mutazioni dell_autore, tutte catturate. L_autore ha **dichiarato** tre scelte discutibili invece di nasconderle. | **Eseguita, tre difetti trovati, tutti corretti.** (1) **Regola di dominio duplicata:** ordinamento episodi ed esclusione speciali riscritti nel composable perché la funzione di dominio pretendeva una serie intera. *Corretto* allargando la firma a `EpisodeCatalog` ed eliminando la copia — autorizzato dal processo principale, che aveva creato il vincolo di perimetro all_origine del problema. (2) **Il duplicato si scopriva dopo due passi sprecati:** ora l_avviso arriva subito dopo la scelta del risultato, riusando la sottoscrizione già aperta senza aprirne una seconda; il controllo finale resta come rete fra due dispositivi. (3) **Mutazione sopravvissuta sul debounce:** nessun test verificava che più tasti producessero una sola ricerca — senza quella protezione l_app interrogherebbe TMDB a ogni tasto. Test aggiunto. **Più una correzione decisa dal processo principale:** la prossima puntata annunciata non compariva sulle serie appena aggiunte, perché TMDB la espone in un campo separato dall_elenco della stagione; la verifica ha dimostrato con i dati che **non è un caso raro** ma la norma per le serie settimanali in corso. *Anticipato dalla Fase 16* `src/domain/catalogMerge.ts`, ora condiviso da inserimento reale e dati di esempio, con la terza copia evitata. |
| 2026-09-18 | 15 — Dettaglio serie | `npm test` (271 test), `lint`, `typecheck`, `build`, grep colori | **Fatto.** Stagioni espandibili con i soli episodi residui, episodi futuri non marcabili, riquadro ambra della prossima puntata, avanzamento multiplo implicito con conferma, «Annulla ultima conferma» con seconda conferma, conflitto di revisione che invita a ricaricare senza perdere lo stato, speciali in sola lettura, cambio piattaforma, rimozione con conferma rossa. Serie con dati non allineati gestita con stato discriminato, mai pagina bianca. L_autore ha scoperto **da sé** che una sua mutazione sopravviveva — il test sull_episodio futuro non lo esercitava mai — e l_ha corretta. | **Eseguita, due buchi di copertura trovati.** L_invariante dietro la visibilità di «Annulla ultima conferma» era **dedotta e non verificata**: il pulsante compare in base all_istante dell_ultima visione, assumendo che equivalga a «esiste un avanzamento annullabile». *Verificata costruendo i quattro scenari* invece di rileggere il codice: **regge**, e ora ci sono i test che la inchiodano, compreso quello mancante su due conferme più un annullamento. **Due mutazioni sopravvissute**, entrambe reali: si poteva aggiungere un pulsante «Vista» agli **speciali** senza che nulla fallisse — quel componente non aveva alcun test — e si poteva far sparire dalla schermata il messaggio del **conflitto di revisione**. Entrambe colmate. *Proposta non applicata:* estrarre la lettura dell_identità attiva, oggi duplicata in due composable. |

La colonna *Esito della fase di verifica* riporta cosa la seconda invocazione dell'implementer ha **confermato**, cosa ha **corretto** e cosa ha solo **proposto**. Va compilata anche quando la verifica è stata saltata, dichiarando il perché.

## Esito finale

Da compilare a fine lavoro: stato finale, modifiche effettuate, test eseguiti, note residue.

## Domande aperte — CHIUSE dall'utente

Tutte e quattro decise prima dell'inizio della Fase 1. Nessuna resta aperta.

1. **Soglia dell'aggiornamento automatico all'apertura: 12 ore.** Sotto quella soglia l'apertura non contatta TMDB; il pulsante «Aggiorna» forza comunque il controllo in qualunque momento. Vale in Fase 16.
2. **Serie senza alcun provider italiano noto: inserimento consentito.** La serie si aggiunge normalmente, con l'etichetta «Nessuna piattaforma» al posto del nome del provider, e **gli arretrati si contano lo stesso**. La piattaforma è un promemoria di dove guardare, non un permesso di esistere: subordinarle il conteggio mostrerebbe «In pari» una serie indietro di dieci puntate. La scelta della piattaforma resta obbligatoria quando il catalogo ne espone più di una, e resta modificabile in seguito. Comporta uno scostamento dalla regola letterale della SPEC, registrato in *Scostamenti dalla SPEC*. Vale in Fase 14 (inserimento) e in Fase 4 (conteggio arretrati).
3. **Durata della sessione in modalità locale: la sessione sopravvive alla chiusura dell'app** e resta valida finché non si preme «Esci». L'utente ha chiesto esplicitamente la massima comodità d'uso: è un'app privata su due telefoni personali, e il login non deve ripresentarsi a ogni apertura. L'identità attiva è l'unico dato di sessione memorizzato sul dispositivo. Quando arriva Firebase (Fase 21) la durata torna sotto il controllo di Firebase Authentication e questo meccanismo sparisce. Vale in Fase 12.
4. **Episodio salvato che sparisce o viene rinumerato nel catalogo: si ripiega sull'episodio precedente ancora esistente** nella sequenza, con avviso discreto all'utente. Mai riportare la serie a «Da iniziare»: farebbe ricomparire tutte le puntate già viste. Nel caso peggiore si rivede una puntata sola. Vale in Fase 16.

## Esempio

```text
File previsti per fase (estratto):
  Fase 3-6   src/domain/*.ts                       regole pure, nessun import da Vue/Dexie/browser
  Fase 7     src/persistence/trackedShowStore.ts   il contratto a sottoscrizione
  Fase 9-10  src/catalog/*.ts + functions/api/tmdb.ts
  Fase 11-15 src/styles, src/router, src/components, src/views
  Fase 18    src/backup/*.ts
  Fase 22    src/persistence/firestoreTrackedShowStore.ts   la sostituzione da un file solo
```

```ts
// Test previsti: uno per criterio di accettazione della SPEC.
// I criteri 13-14 si verificano in modalità locale (Fase 12) e si RIeseguono dopo la Fase 21.

// showSorting.spec.ts — criteri 11 e 12
it('ultima attivita: le serie mai iniziate finiscono in fondo');
it('titolo A-Z: confronto in locale italiano');
it('piu puntate da vedere: le serie in pari finiscono in fondo');
it('inserite di recente: addedAt decrescente');
it('prossima uscita: date ignote in fondo');
it('a parita di valore vince sempre il titolo alfabetico');
it('dopo una conferma Vista la serie sale in cima con ultima attivita');

// watchPosition.spec.ts — criterio 3
it('restituisce la prima puntata pubblicata non vista');
it('conta gli arretrati escludendo futuri, speciali ed episodi senza data');

// seasonPoster.spec.ts — regola di dominio sulla locandina
it('usa la locandina della stagione della prima puntata non vista');
it('ripiega sulla locandina della serie e poi sul segnaposto');

// progressAdvance.spec.ts — criteri 4 e 5
it('segnando S2E4 spariscono S2E4 e tutte le precedenti');
it('avanzamento multiplo implicito attraverso piu stagioni');
it('rifiuta un avanzamento verso una posizione precedente');

// progressUndo.spec.ts — criteri 6 e 10
it('undo ripristina esattamente posizione, conteggi e locandina');
it('undo rifiutato se la revisione corrente e cambiata');

// catalogMerge.spec.ts — criterio 8
it('una nuova puntata alza il conteggio senza spostare la posizione');

// localTrackedShowStore.spec.ts — criteri 9 e 10 (parte locale)
it('la sottoscrizione avvisa dopo una scrittura');
it('avanzamento ed evento sono scritti in una sola transazione');

// AddShowDialog.spec.ts — criteri 1 e 2
it('non permette di aggiungere una serie come testo libero');
it('blocca il duplicato per identificativo del catalogo');

// ShowDetailView.spec.ts — criterio 7
it('la conferma di eliminazione e rossa e annullandola nulla cambia');

// LoginView.spec.ts — criteri 13 e 14
it('senza identita attiva la lista non e accessibile');
it('la conferma registra confirmedBy con l utente attivo');
```
