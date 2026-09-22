# IMPLEMENTATION — Nascondere una serie dall'elenco

**Specifica di riferimento:** `spec-nascondi-serie.md` — nel resto del documento: «la SPEC».
**Stato:** `COMPLETED`  <!-- NOT_STARTED | IN_PROGRESS | BLOCKED | COMPLETED -->

Documento di lavoro: la SPEC (il "cosa") resta stabile; qui vivono stato, piano, decisioni e problemi (il "come").

> **Ordine di lavoro.** Le fasi salgono dal basso verso l'alto seguendo l'architettura a livelli del progetto: prima `domain/`, poi `persistence/` (contratto ed **entrambe** le implementazioni), poi `backup/`, poi `composables/`, infine `components/` e `views/`. Nessuna fase lascia il progetto rosso: ogni fase che produce codice chiude con `npm test`, `npm run lint` e `npm run typecheck` verdi.

## Regole per l'agente

- Leggere `CLAUDE.md` del repository e la SPEC prima di toccare codice; alla ripresa, ripartire dallo stato corrente di questo file.
- All'apertura di ogni fase, annunciarla in una riga sola prima di qualunque altra cosa, copiando la riga **Annuncio:** della fase. Mai «faccio partire la fase N» senza obiettivo.
- Prima di modificare, elencare i file che verranno toccati. Nessun refactoring fuori scope.
- **Ogni fase che produce codice si chiude con una seconda invocazione distinta dell'implementer in modalità verifica**, con contesto pulito e mandato di controllo: obiettivo della fase, file toccati, vincoli. L'esito va annotato nella colonna dedicata della tabella di avanzamento: cosa ha confermato, cosa ha corretto, cosa ha solo proposto.
- L'avanzamento di questo file — stato, spunte, registro — lo aggiorna il processo principale, al termine di **ogni** fase, comprese quelle di sola analisi.
- Non modificare i requisiti della SPEC senza decisione esplicita. **La sezione *Da decidere* della SPEC è vuota**: le quattro decisioni dell'utente e le scelte chiuse in stesura non si riaprono.
- Scelta che **non** cambia il comportamento osservabile → procedi e annotala in *Decisioni tecniche*.
- Scelta che **cambia** comportamento o criteri di accettazione, o ambiguità non risolvibile dalla SPEC → **fermati**, stato `BLOCKED`, registra in *Problemi aperti* / *Deviazioni*.
- Vincoli non negoziabili del progetto: `src/domain/` puro; Dexie e Firestore **solo** in `src/persistence/`; le viste non parlano mai con `persistence/` o `catalog/`; nessuna dipendenza nuova; nessun colore fuori da `src/styles/tokens.css`; nessuna icona nuova in `AppIcon.vue`; **il codice non si commenta**.
- **Un solo campo nuovo su `TrackedShow`.** `ProgressEvent` non cambia forma; `progressAdvance.ts`, `progressUndo.ts`, `progressReset.ts`, `showSorting.ts` e `watchPosition.ts` non si toccano. Se un'implementazione sembra richiedere un campo in più, un tipo di evento nuovo o una modifica all'undo, il modello è stato frainteso: nascondere è un filtro di lista su un dato condiviso, non un'operazione sul tracciamento.
- **`progressRevision` non si incrementa mai in questa feature.** È il gettone di controllo del conflitto sugli avanzamenti: toccarlo farebbe fallire un annullamento legittimo in corso sull'altro telefono.
- **Il layout della riga dei controlli non si tocca** (SPEC § 3): niente contenitore nuovo, niente menu a tendina, niente riga dedicata, niente riorganizzazione dei tre filtri. Il pulsante nuovo va a capo se serve, ed è accettato.
- Indentazione 4 spazi, punto e virgola sempre, apici singoli, import da `src/` con l'alias `@/`, tipi `readonly` in profondità, test `*.spec.ts` accanto al codice testato, `// @vitest-environment jsdom` solo nei test di componente.
- **L'app è pubblicata e in uso reale con dati veri.** Niente script sui dati di produzione, niente riscritture di documenti Firestore esistenti: il campo si materializza alla prima scrittura.
- La pubblicazione richiede **Node 22 via fnm** (le tre righe di `CLAUDE.md`, la seconda non è facoltativa), l'incremento di `src/appVersion.ts` e `--branch master` su `wrangler pages deploy`. Nessun deploy prima della Fase 10.

## Contesto

Assunzioni verificate leggendo il codice, **da riconfermare in Fase 1**:

- **`showVisibility.ts` è lo stampo da copiare, non un'ispirazione vaga.** Tipo discriminato, funzione che risolve il campo assente al valore predefinito, due costruttori che sono l'unico punto di scrittura del campo, predicati usati dai filtri. La feature nuova ricalca la stessa forma su un campo binario.
- **Su Firestore assegnare `undefined` a un campo lo toglie dal documento**, perché `initializeFirestore` ha `ignoreUndefinedProperties: true` e le scritture sono `set` piene, non `merge`. È il meccanismo che già fa sparire `privateFor` quando una serie torna condivisa: `withListedShow` può fare la stessa cosa con `hidden`.
- **Su Firestore la scrittura deve rileggere dentro `runTransaction`.** `changeVisibility` in quel file lo fa già, e lo fa perché la prima stesura con `getDoc` + `setDoc` sovrascriveva in silenzio una conferma appena arrivata dall'altro telefono. Il comando nuovo ha lo stesso identico rischio.
- **Su Dexie `changeVisibility` e `changeProvider` non aprono una transazione**: `get` e `put`. Il comando nuovo segue il precedente del proprio file, non quello dell'altro: la coerenza da rispettare è per implementazione.
- Lo schema Dexie **non cambia**: il campo non è indicizzato, la lista arriva tutta da una sottoscrizione e i filtri di lista sono già tutti in memoria. Nessuna versione 2 del database.
- **Nessuna query Firestore filtra sul campo nuovo.** Una `where('hidden','==',false)` non restituirebbe i documenti che il campo non ce l'hanno — cioè tutti quelli oggi in produzione. È la stessa trappola già documentata per la visibilità: il filtro resta in memoria.
- `useTrackedShows` deriva oggi `summaryText`, `trackedProviderShowIds` e `hasTrackedShows` da `visibleEntries`, e `completedCount` e `hasScopedShows` da `scopedEntries`. La SPEC § 4 sposta **solo** `summaryText` (sulle attive) e `completedCount` (sulle elencabili), e aggiunge due derivazioni nuove: il conteggio delle nascoste in lente e l'insieme delle elencabili.
- `useCatalogRefresh` non filtra nulla: la decisione «nascoste incluse» (SPEC § 8) si realizza **non modificando quel file**. Va però dimostrata con un test, altrimenti nessuno si accorgerebbe di un'esclusione introdotta per sbaglio.
- Il blocco del duplicato in ricerca vive in `useAddShow.chooseResult` e usa il solo `trackedProviderShowIds`. Per il messaggio dedicato serve un secondo insieme — le serie tracciate le cui schede visibili sono **tutte** nascoste — che `useTrackedShows` può derivare come differenza fra le visibili e le attive.
- `ShowListItem.isPrivate` fu eliminato in verifica perché era un campo morto: il campo nuovo `isHidden` si aggiunge **solo** perché `ShowCard.vue` lo legge davvero per rendere il marcatore.
- Il dettaglio di una serie con dati non allineati non mostra alcun comando (`v-if="readyContent"`): il comando nuovo vive dentro quel ramo, e il limite che ne consegue è dichiarato e accettato dalla SPEC § 11.
- `backupValidation.ts` non ha ancora un helper per i booleani facoltativi: ne serve uno, nella stessa famiglia di `requireOptionalString`.
- `buildBackupFile` normalizza già la visibilità di ogni serie in uscita: la normalizzazione del campo nuovo si innesta lì, non in un secondo passaggio parallelo.

## Piano operativo

### Fase 1 — Analisi e conferma delle assunzioni

**Annuncio:** `Fase 1 in corso: conferma sul codice delle assunzioni su cui poggia lo stato «nascosta»`

- [x] Rileggere i file elencati nel *Contesto* della SPEC e confermare, uno per uno, i fatti dichiarati.
- [x] Confermare che nessun file fuori da `src/persistence/` importa `dexie` o `firebase/firestore` (verifica per grep).
- [x] Leggere `changeVisibility` in **entrambe** le implementazioni e annotare qui la forma esatta di ciascuna (transazione sì/no, dove avviene la rilettura): è il codice che le Fasi 3 e 4 ricalcano.
- [x] Confermare che `useCatalogRefresh` non applica alcun filtro alle serie che aggiorna, e che quindi la decisione «nascoste incluse» non richiede modifiche a quel file.
- [x] Confermare che `.controls-row` è già `flex-wrap: wrap` e che il pulsante nuovo non richiede alcuna modifica di layout.
- [x] Rilevare lo stile dei test esistenti su dominio, persistenza (`fake-indexeddb` e runtime finto di Firestore), composable e componenti (`jsdom` + `@vue/test-utils`), e registrare il numero di test di partenza.
- [x] Aggiornare *File coinvolti (effettivi)* con l'elenco confermato.
- [x] Criterio di completamento: elenco dei file confermato in questo documento e nessuna assunzione residua.
- **File letti:** tutti quelli elencati in *File coinvolti (effettivi)*.
- **File modificati:** questo file.
- **File da creare:** nessuno.


**Esito della Fase 1** (2026-09-22) — tutte le assunzioni del *Contesto* confermate sul codice, con due precisazioni.

- Suite di partenza: **553 test su 55 file, tutti verdi** (`npm test` su Node 22, 30s).
- Nessun file fuori da `src/persistence/` importa `dexie` o `firebase/firestore` (grep su `src/`, `functions/`, `scripts/`).
- `changeVisibility` su Dexie (`localTrackedShowStore.ts:120`): `get` → controllo collisione → `applyAudience` → `put`, **senza transazione**. Su Firestore (`firestoreTrackedShowStore.ts:362`): `getDoc` per il rifiuto anticipato e il controllo di collisione, poi **`runTransaction` che rilegge `showRef` con `transaction.get`** prima di `transaction.set`. Le Fasi 3 e 4 ricalcano ciascuna il proprio precedente.
- `useCatalogRefresh.listCurrentShows` (riga 140) risolve la sottoscrizione e restituisce **tutte** le serie, senza alcun filtro: «nascoste incluse» si realizza non toccando quel file, e va dimostrato con un test.
- `.controls-row` in `HomeView.vue` è già `display: flex` con `flex-wrap: wrap`, `justify-content: flex-end`, `gap: 4px`: il pulsante nuovo va a capo da sé.
- I comandi del dettaglio («Azzera tracciamento» riga 211, «Rimuovi dalla lista» riga 219) stanno dentro `<template v-if="readyContent">` (riga 138): il limite della SPEC § 11 sulle serie disallineate è confermato.

**Precisazione sul criterio del duplicato nascosto (SPEC § 6), da applicare nelle Fasi 3, 4 e 7.** Nelle due implementazioni dello store il duplicato è cercato con `findDuplicateForAudience`, che restituisce **al più un candidato**: quello il cui destinatario collide con la scheda in arrivo. Lì la regola «tutte le schede visibili sono nascoste» si riduce quindi a «**la scheda in collisione è nascosta**», e non richiede di guardare le altre schede della stessa serie. La formulazione della SPEC resta esatta dove serve davvero, cioè in `useAddShow`, dove il confronto avviene su `providerShowId` senza conoscere il destinatario. Stesso comportamento osservabile, nessuna deviazione.

### Fase 2 — Dominio: lo stato «nascosta» di una serie

**Annuncio:** `Fase 2 delegata: il vocabolario di dominio dello stato nascosta, con una sola rappresentazione di «in elenco»`

- [x] Aggiungere a `TrackedShow` il campo `hidden?: boolean | undefined`, `readonly` come gli altri.
- [x] Tipo discriminato `ShowListing` (`'listed' | 'hidden'`) e funzione che lo ricava dal campo, con **campo assente = in elenco**.
- [x] Due costruttori che garantiscono l'invariante: nascondere scrive `true`, riportare in elenco scrive `undefined` — **mai `false`**. Nessun altro punto del codice scrive quel campo a mano.
- [x] Predicato usato dai filtri, derivato dal tipo discriminato e non da un confronto ripetuto sul campo grezzo.
- [x] Test: criterio 1; campo assente trattato come in elenco; `hidden: false` letto come in elenco e normalizzato dal costruttore; i costruttori non alterano posizione, revisione, visibilità e piattaforma; immutabilità del dato ricevuto.
- [x] Criterio di completamento: `npm test`, `lint`, `typecheck` verdi; nessun import da Vue, browser, Dexie o Firebase in `src/domain/`.
- **File letti:** `src/domain/trackedShow.ts`, `src/domain/showVisibility.ts`, `src/domain/showVisibility.spec.ts`.
- **File modificati:** `src/domain/trackedShow.ts`.
- **File da creare:**
  - `src/domain/showListing.ts` — lo stato «nascosta» è una regola di dominio con una ragione di cambiare propria (che cosa compare in elenco), distinta dalla visibilità per persona e dalla posizione di visione; sta in `src/domain/`, che è piatta per scelta dichiarata, accanto a `showVisibility.ts` e `showSorting.ts`. **Cartella esistente.**
  - `src/domain/showListing.spec.ts` — test accanto al codice testato.

### Fase 3 — Confine dati: il comando di nascondere sul contratto e su Dexie

**Annuncio:** `Fase 3 delegata: comando di nascondere e riportare in elenco sul contratto dello store e sull'implementazione Dexie`

- [x] Contratto: un comando nuovo con esito discriminato, nella forma già usata da `changeVisibility` — **niente parametro booleano**, il bersaglio è il tipo discriminato del dominio. Il contratto continua a non nominare Dexie né Firestore.
- [x] Il comando aggiorna `updatedAt` e lascia invariati posizione, `lastViewedAt`, `progressRevision`, eventi, visibilità, piattaforma, stagioni ed episodi. **Nessun incremento di revisione.**
- [x] Unico rifiuto: serie inesistente, con la `reason` già in uso nel file. Nascondere una serie già nascosta è idempotente e non è un rifiuto.
- [x] Implementazione Dexie con la **stessa forma di `changeVisibility` nello stesso file** (`get`, composizione, `put`), senza inventare una transazione che gli altri comandi gemelli non aprono.
- [x] `addShow`: quando il duplicato trovato è nascosto, rifiutare con il **messaggio dedicato** della SPEC § 6; altrimenti con quello di oggi.
- [x] Nessuna modifica allo schema Dexie: verificare che il campo nuovo non richieda indici e annotarlo.
- [x] Test su `fake-indexeddb`: criteri 3, 4, 12, 15; round-trip del campo; una serie riportata in elenco non conserva il campo; il comando non tocca gli eventi della serie né quelli delle altre; il duplicato nascosto produce il messaggio dedicato e quello in elenco il messaggio di oggi.
- [x] Criterio di completamento: `npm test`, `lint` verdi; `typecheck` verde **oppure** rosso solo sull'implementazione Firestore, che la Fase 4 chiude — in quel caso dichiararlo qui e verificare le due fasi insieme.
- **File letti:** `src/persistence/trackedShowStore.ts`, `localTrackedShowStore.ts`, `tvTrackerDatabase.ts`, `src/domain/showListing.ts`.
- **File modificati:** `src/persistence/trackedShowStore.ts`, `src/persistence/localTrackedShowStore.ts` (+ spec).
- **File da creare:** nessuno.

### Fase 4 — Confine dati: la stessa semantica su Firestore

**Annuncio:** `Fase 4 delegata: il comando di nascondere su Firestore, con la rilettura dentro la transazione`

- [x] Stessa semantica, stesso esito e stessi messaggi della Fase 3.
- [x] La scrittura **rilegge il documento dentro `runTransaction`**, come già fa `changeVisibility` in quel file: senza la rilettura, una conferma appena arrivata dall'altro telefono verrebbe sovrascritta in silenzio.
- [x] Verificare che riportare in elenco **tolga il campo dal documento** (`undefined` con `ignoreUndefinedProperties`) e che nessuna query filtri sul campo nuovo.
- [x] `addShow`: stesso criterio del duplicato nascosto della Fase 3, sugli stessi candidati già interrogati per `providerShowId`.
- [x] `firestore.rules` **non modificato**: verificarlo e dichiararlo qui.
- [x] **Misurare e dichiarare il costo sul confine dati**: quanti file, quante funzioni e quante righe per comando, e quanti composable o viste sono stati toccati (attesi: zero). Se la misura mostra che le due implementazioni divergono per semantica o per messaggi, fermarsi e segnalarlo.
- [x] Test con il runtime finto già usato dal file: criteri 3, 4, 12; il documento di una serie riportata in elenco non porta più il campo; il comando non scrive né cancella documenti nella sottocollezione degli eventi; duplicato nascosto riconosciuto anche quando gli altri documenti sono privi del campo.
- [x] Criterio di completamento: `npm test`, `lint`, `typecheck` verdi; nessun accesso a Firestore fuori da `src/persistence/`.
- **File letti:** `src/persistence/firestoreTrackedShowStore.ts`, `firestore.rules`, `src/persistence/currentTrackedShowStore.ts`.
- **File modificati:** `src/persistence/firestoreTrackedShowStore.ts` (+ spec).
- **File da creare:** nessuno.

### Fase 5 — Backup: campo facoltativo senza cambio di versione

**Annuncio:** `Fase 5 delegata: il campo nascosta nel backup, restando al formato 2`

- [x] La versione del formato **resta 2**: nessun bump, nessun rifiuto nuovo, i backup già esportati restano importabili.
- [x] Validazione: campo **facoltativo**, accettati `true`, `false` e l'assenza; assente significa «in elenco». Helper per il booleano facoltativo nella stessa famiglia degli altri.
- [x] Esportazione: normalizzare il campo nella stessa funzione che già normalizza la visibilità, così il file esportato non porta mai `false`.
- [x] Verificare che unione e sostituzione continuino a funzionare sul campo nuovo.
- [x] Test: criterio 13; serie senza campo accettata e riletta come in elenco; serie nascosta riletta nascosta; **andata e ritorno che parte dalla forma reale dei dati in produzione**, cioè da serie prive sia di `visibility` sia del campo nuovo; un file con `formatVersion` diverso da 2 resta rifiutato.
- [x] Criterio di completamento: `npm test`, `lint`, `typecheck` verdi; nessuna modifica al contratto dello store in questa fase.
- **File letti:** `src/backup/backupFormat.ts`, `backupValidation.ts`, `backupExport.ts`, `backupImport.ts`.
- **File modificati:** `src/backup/backupValidation.ts` (+ spec), `src/backup/backupExport.ts` (+ spec), fixture di `backupImport.spec.ts` se necessario.
- **File da creare:** nessuno.

### Fase 6 — Composable: preferenza «Mostra nascoste» e insiemi della home

**Annuncio:** `Fase 6 delegata: la preferenza «Mostra nascoste» e i quattro insiemi su cui la home calcola riepilogo, conteggi e stati vuoti`

- [x] Preferenza in `localStorage`, valore predefinito **spento**, chiave dedicata, stessa meccanica e stessa protezione di `useCompletedVisibilityPreference`.
- [x] `useTrackedShows` riceve un quarto `Ref`, **senza valore predefinito**; nessuna aggregazione dei parametri in un oggetto.
- [x] Realizzare i quattro insiemi della SPEC § 4 — visibili, attive, in lente, elencabili — e agganciare ciascun valore all'insieme dichiarato: riepilogo sulle attive, blocco dei duplicati e presenza dei controlli sulle visibili, conteggio delle nascoste in lente, conteggio delle completate sulle elencabili, elenco sulle elencabili meno le completate.
- [x] Esporre l'insieme delle serie tracciate le cui schede visibili sono **tutte** nascoste, per il messaggio dedicato del duplicato (Fase 7).
- [x] Esporre nell'elemento di lista lo stato di nascosta, **solo perché la card lo rende** (Fase 8): nessun campo morto.
- [x] Le righe con dati non allineati restano in testa e fuori dal filtro delle completate, come oggi, ma dentro il filtro delle nascoste.
- [x] Test: criteri 5, 6, 7, 9, 10, 14; il riepilogo non cambia al variare di lente e filtro; il conteggio delle completate cambia con il filtro delle nascoste; la serie nascosta e completata raggiungibile in due passi; `hasTrackedShows` vero anche con tutte le serie nascoste; l'aggiornamento del catalogo aggiorna anche le nascoste.
- [x] Criterio di completamento: `npm test`, `lint`, `typecheck` verdi; nessun accesso diretto alla persistenza aggiunto fuori dai composable.
- **File letti:** `src/composables/useTrackedShows.ts`, `useCompletedVisibilityPreference.ts`, `useScopePreference.ts`, `useCatalogRefresh.ts`, `src/storageFailure.ts`.
- **File modificati:** `src/composables/useTrackedShows.ts` (+ spec), `src/composables/useCatalogRefresh.spec.ts` (**solo il test** del criterio 14: `useCatalogRefresh.ts` non cambia).
- **File da creare:**
  - `src/composables/useHiddenShowsPreference.ts` — preferenza locale del dispositivo, stesso concetto e stessa sede di `useCompletedVisibilityPreference.ts` e `useScopePreference.ts`: la ragione di cambiare è la stessa famiglia (come si guarda la lista), non i dati. **Cartella esistente.**
  - `src/composables/useHiddenShowsPreference.spec.ts`.

### Fase 7 — Composable: comando dal dettaglio e messaggio del duplicato nascosto

**Annuncio:** `Fase 7 delegata: il comando di nascondere nel dettaglio e il messaggio dedicato del duplicato nascosto`

- [x] `useShowDetail`: esporre lo stato corrente della serie (in elenco / nascosta) accanto alla visibilità già esposta, e il comando che lo cambia delegando allo store.
- [x] Il comando non produce dialoghi di conferma e non tocca posizione, revisione, eventi e visibilità: verificarlo con un test, non dichiararlo.
- [x] `useAddShow`: scegliere fra il messaggio di oggi e quello dedicato in base all'insieme esposto in Fase 6; il blocco del duplicato resta invariato nella sostanza.
- [x] Test: criteri 2, 12, 15; il comando inverte lo stato; cambiare visibilità non cambia lo stato di nascosta; azzerare una serie nascosta non la riporta in elenco; il messaggio dedicato compare solo quando **tutte** le schede visibili di quella serie sono nascoste.
- [x] Criterio di completamento: `npm test`, `lint`, `typecheck` verdi; nessuna regola di dominio riscritta nei composable.
- **File letti:** `src/composables/useShowDetail.ts`, `useAddShow.ts`, `src/domain/showListing.ts`.
- **File modificati:** `src/composables/useShowDetail.ts` (+ spec), `src/composables/useAddShow.ts` (+ spec).
- **File da creare:** nessuno.

### Fase 8 — Home: pulsante, marcatore e stato vuoto delle nascoste

**Annuncio:** `Fase 8 delegata: il pulsante «Mostra nascoste», il marcatore in lista e lo stato vuoto dedicato`

- [x] Pulsante nella riga dei controlli esistente, con le due etichette della SPEC § 3, `min-height: var(--tap)`, reso **solo** quando esiste almeno una nascosta in lente.
- [x] **Nessuna modifica al layout della riga dei controlli**: il pulsante va a capo da sé quando manca spazio, e va bene così.
- [x] Marcatore testuale «Nascosta» nella riga del titolo della card, accanto all'eventuale puntino di serie privata; nessuna icona nuova, nessun colore fuori dai token.
- [x] Stato vuoto dedicato quando il filtro non lascia nulla perché è tutto nascosto, distinto da quello della lente e da quello delle completate, con il testo che **nomina il pulsante** che lo risolve. Verificare che i tre stati vuoti restino mutuamente esclusivi per costruzione.
- [x] Cablare la preferenza nella vista e passarla al composable.
- [x] Test di componente: criteri 7, 8, 10, 11; i controlli restano visibili e premibili a lista svuotata dal filtro; nessun marcatore sulle serie in elenco; il pulsante non compare quando non esistono nascoste in lente.
- [x] Criterio di completamento: `npm test`, `lint`, `typecheck` verdi; grep dei colori: nessun valore cromatico fuori dai token.
- **File letti:** `src/views/HomeView.vue`, `src/components/show/CompletedVisibilityToggle.vue`, `ShowScopeToggle.vue`, `ShowCard.vue`, `PrivateShowDot.vue`, `src/components/feedback/EmptyState.vue`, `src/styles/tokens.css`.
- **File modificati:** `src/views/HomeView.vue` (+ spec), `src/components/show/ShowCard.vue` (+ spec).
- **File da creare:**
  - `src/components/show/HiddenShowsToggle.vue` — controllo della lista, stesso concetto e stessa sede di `CompletedVisibilityToggle.vue` e `ShowScopeToggle.vue`; il nome evita la parola «visibility», che in questo progetto è già presa dal «Per tutti / Solo per me». **Cartella esistente.**
  - `src/components/show/HiddenShowsToggle.spec.ts`.
- **Nessun componente nuovo per il marcatore «Nascosta»**: un solo punto d'uso, dentro `ShowCard.vue`. `PrivateShowDot.vue` è un componente perché i punti d'uso erano due.

### Fase 9 — Dettaglio: comando «Nascondi serie» e nota della serie nascosta

**Annuncio:** `Fase 9 delegata: il comando «Nascondi serie» nel dettaglio, con la nota e il messaggio che dicono dove ritrovarla`

- [x] Comando fra quelli di fine pagina, con le due etichette della SPEC § 2; nessun dialogo di conferma.
- [x] Nota «Questa serie è nascosta dall'elenco.» resa **se e solo se** la serie è nascosta.
- [x] Messaggio effimero dopo il comando, con i due testi della SPEC § 2: dopo aver nascosto, il messaggio è l'unico punto in cui l'app dice dove ritrovare ciò che è appena sparito.
- [x] Accessibilità: comando da almeno 46 px, focus visibile, stato leggibile dagli assistivi.
- [x] Test di vista: criteri 2, 15; la nota compare solo sulle nascoste; il comando si inverte; premerlo non apre alcun dialogo; il dettaglio di una serie nascosta aperto per indirizzo diretto si vede normalmente.
- [x] Criterio di completamento: `npm test`, `lint`, `typecheck` verdi; grep dei colori pulito.
- **File letti:** `src/views/ShowDetailView.vue`, `src/components/show/ShowVisibilityControl.vue`, `src/components/feedback/ToastMessage.vue`.
- **File modificati:** `src/views/ShowDetailView.vue` (+ spec).
- **File da creare:** nessuno — il comando è un bottone come «Azzera tracciamento» e «Rimuovi dalla lista», che vivono già inline nella vista.

### Fase 10 — Verifica finale e pubblicazione

**Annuncio:** `Fase 10 in corso: verifica dei diciassette criteri e pubblicazione della versione nuova`

- [x] `npm test` — suite intera verde, con il numero di test riportato nel registro.
- [x] `npm run lint` — pulito.
- [x] `npm run typecheck` — pulito su entrambi i progetti TypeScript.
- [x] `npm run build` su **Node 22** — verde, compreso `check-build-artifacts.mjs`.
- [x] Rileggere la *Definition of done* della SPEC voce per voce — **sono 17** — e indicare per ciascuna il test che la copre; i criteri non coperti da un test unitario (come il 17, sul layout) si verificano in revisione e si dichiarano.
- [x] Mutation testing manuale: campo assente trattato come nascosta; filtro invertito; riepilogo calcolato sulle visibili invece che sulle attive; conteggio completate calcolato prima del filtro delle nascoste; `hasTrackedShows` calcolato sulle attive; comando che incrementa `progressRevision`; comando che scrive `hidden: false`; duplicato nascosto che non blocca l'inserimento. **Ogni mutazione deve far fallire almeno un test**: se una sopravvive, manca un test, non un commento.
- [x] Verificare per diff che `ProgressEvent`, `progressAdvance.ts`, `progressUndo.ts`, `progressReset.ts`, `showSorting.ts`, `watchPosition.ts`, `firestore.rules`, lo schema Dexie e `BACKUP_FORMAT_VERSION` siano rimasti identici, che `TrackedShow` abbia guadagnato **un solo** campo, che nessuna vista importi `persistence/` o `catalog/` e che `package.json` non abbia dipendenze nuove.
- [ ] Compilare *Esito finale* e portare lo stato a `COMPLETED`.
- [ ] **Pubblicazione, solo su richiesta dell'utente e mai in silenzio:** attivare Node 22 con le tre righe di `fnm` (la seconda non è facoltativa), incrementare `src/appVersion.ts`, rifare `npm run build`, pubblicare con `npx wrangler pages deploy dist --project-name tv-tracker --branch master --commit-dirty=true` e verificare che il caricamento sia finito in **Production** e non in anteprima. Riportare a schermo la procedura completa e copiabile, la versione raggiunta e l'esito della verifica.
- **File letti:** la SPEC, questo file.
- **File modificati:** questo file; `src/appVersion.ts` solo se si pubblica.
- **File da creare:** nessuno.

## File coinvolti (effettivi)

**Confermato in Fase 1** (2026-09-22): l'elenco regge, nessuna correzione necessaria. Formato: `` `path` — motivo``.

**Dominio** (`src/domain/`, puro)
- `trackedShow.ts` — il campo facoltativo `hidden`
- `showListing.ts` *(nuovo)* — tipo discriminato, risoluzione del campo assente, due costruttori, predicato
- `showVisibility.ts`, `progressAdvance.ts`, `progressUndo.ts`, `progressReset.ts`, `showSorting.ts`, `watchPosition.ts` — **solo lettura**: nessuna modifica

**Persistenza** (`src/persistence/`)
- `trackedShowStore.ts` — il comando nuovo e il suo esito
- `localTrackedShowStore.ts` — comando con la forma di `changeVisibility` del proprio file, più il messaggio del duplicato nascosto
- `firestoreTrackedShowStore.ts` — le stesse cose, con la rilettura dentro `runTransaction`
- `tvTrackerDatabase.ts` — **solo lettura**: si conferma che lo schema non cambia

**Backup** (`src/backup/`) — `backupValidation.ts` (campo facoltativo), `backupExport.ts` (normalizzazione in uscita); `backupFormat.ts` **non cambia**

**Composable** (`src/composables/`) — `useHiddenShowsPreference.ts` *(nuovo)*, `useTrackedShows.ts`, `useShowDetail.ts`, `useAddShow.ts`; `useCatalogRefresh.ts` **solo lettura**, con un test nuovo nel suo spec

**Componenti** (`src/components/`) — `show/HiddenShowsToggle.vue` *(nuovo)*, `show/ShowCard.vue`

**Viste** (`src/views/`) — `HomeView.vue`, `ShowDetailView.vue`

**Non modificati, ma letti** — `firestore.rules`, `src/styles/tokens.css`, `src/components/show/PrivateShowDot.vue`, `src/components/feedback/EmptyState.vue`, `ToastMessage.vue`

**Cartelle nuove: nessuna.** Tutti i file nuovi nascono in cartelle esistenti, secondo l'asse di organizzazione già adottato — **per livello**, con sottocartelle **per concetto** dentro `components/`. Nessun contenitore generico.

## Registro

Voci datate (`YYYY-MM-DD`), append-only.

- **Costo misurato sul confine dati** (obbligo della Fase 4) — aggiungere un comando al confine dati è costato: **Dexie** 2 file di produzione (contratto + implementazione), +29 righe; **Firestore** 1 file di produzione (il contratto era già pronto), +37 righe; test 8 e 9 casi nuovi rispettivamente. **Composable e viste toccati: zero in entrambe le implementazioni.** Le due implementazioni non divergono per semantica né per messaggi (`reason` confrontate carattere per carattere in verifica). Il costo più alto lato Firestore sta quasi tutto nei test, per il runtime finto e per il caso della rilettura in transazione, non nella produzione.
- **Decisioni tecniche** (non cambiano il comportamento) — `Decisione · Motivazione · Impatto`: nessuna.
- **Deviazioni dalla SPEC** (seconda voce, 2026-09-22, decisa a schermo dall'utente): **un solo stato vuoto generico per i filtri**, «In base ai filtri impostati la lista è vuota», al posto dei tre specifici — compresi i due **preesistenti** della lente e delle completate, nati con la feature precedente. Motivazione: semplificazione chiesta dall'utente; elimina quattro stati, le condizioni che li tenevano mutuamente esclusivi e la modifica a `isCompletedHiddenState`, che era l'unico punto in cui questa feature cambiava comportamento preesistente per far quadrare i casi nuovi. Costo accettato: il messaggio non dice più quale filtro ha svuotato la lista. Contropartita obbligatoria: i pulsanti che risolvono la situazione diventano l'unica via d'uscita e vanno coperti da test in ogni combinazione. «Nessuna serie ancora» resta distinto. **SPEC aggiornata**: § 4 (tabella), § 10, § 11 e criterio 11.
- **Deviazioni dalla SPEC** (prima voce) — `Descrizione · Motivazione · Impatto · Aggiorna la SPEC? sì/no`: **una**, decisa dal processo principale il 2026-09-22. La Fase 6 lasciava la suite rossa (8 test in `HomeView.spec.ts` più due errori di tipo), perché il vincolo di fase vietava di toccare viste e componenti mentre la firma di `useTrackedShows` era già cambiata. Ho anticipato dalla Fase 8 la sola spunta «cablare la preferenza nella vista», cablando `useHiddenShowsPreference()` in `HomeView.vue` e aggiungendo `isHidden: false` alla fixture di `ShowCard.spec.ts`. Scartato il segnaposto `ref(false)` proposto in consegna: un valore finto che la Fase 8 potrebbe dimenticare di sostituire, spegnendo il filtro per sempre in produzione. Impatto: nessun comportamento cambia finché il pulsante non esiste. Aggiorna la SPEC? **no** — riguarda l’ordine dei lavori, non il comportamento atteso.
- **Problemi aperti** (bloccano l'avanzamento) — `Descrizione · Impatto · Opzioni · Decisione richiesta`: nessuno. La sezione *Da decidere* della SPEC è vuota.
- **Note ereditate dalla feature precedente**, da non confondere con problemi di questa: `resolveActiveProfileIdFromSession` è duplicata in tre composable; la duplicazione dei messaggi di rifiuto fra `useAddShow` e le due implementazioni dello store è preesistente e resta fuori perimetro.

### Avanzamento delle fasi

| Data | Fase | Comando / verifica | Esito | Esito della fase di verifica |
| --- | --- | --- | --- | --- |
| 2026-09-22 | 1 — Analisi e conferma delle assunzioni | `npm test` (553 test, 55 file, verdi) | completata: assunzioni confermate, due precisazioni annotate | fase senza codice: nessuna verifica delegata |
| 2026-09-22 | 2 — Dominio: lo stato «nascosta» | `npm test` 562/56 verdi, `lint` e `typecheck` puliti | completata: `showListing.ts` + 9 test, campo `hidden` su `TrackedShow` | confermata senza correzioni; tre mutazioni provate (campo assente letto come nascosta, `withListedShow` che scrive `false`, `resolveShowListing` su `!== undefined`) e tutte e tre uccise dai test |
| 2026-09-22 | 3 — Confine dati: contratto e Dexie | `npm test` 570/56 verdi, `lint` pulito, `typecheck` rosso col solo `TS2741` atteso su Firestore | completata: `changeListing` sul contratto e su Dexie, messaggio dedicato del duplicato nascosto, 8 test nuovi; ripple di un solo stub in 9 doppi di test | confermata senza correzioni; quattro mutazioni provate (revisione incrementata, `hidden: false` al posto di `undefined`, `updatedAt` dimenticato, messaggio del duplicato sempre quello di oggi) e tutte uccise |
| 2026-09-22 | 4 — Confine dati: Firestore | `npm test` 579/56 verdi, `lint` e `typecheck` puliti (`TS2741` della Fase 3 chiuso) | completata: `changeListing` con rilettura in `runTransaction`, messaggio dedicato del duplicato nascosto, 9 test nuovi | confermata senza correzioni; quattro mutazioni provate (scrittura dello stato letto da `getDoc` invece di quello riletto in transazione, `hidden: false`, `updatedAt` dimenticato, duplicato nascosto ignorato) e tutte uccise |
| 2026-09-22 | 5 — Backup: campo facoltativo | `npm test` 588/56 verdi, `lint` e `typecheck` puliti | completata: `requireOptionalBoolean` in validazione, normalizzazione in uscita innestata in `buildBackupFile`, formato invariato a 2; `backupFormat.ts` e `backupImport.ts` non toccati | **una correzione**: il transito del campo era dimostrato solo per l`Nione e non per la sostituzione. Buco provato con una mutazione (`applyReplaceImport` che spoglia il campo) che nessun test intercettava; aggiunto `conserva lo stato nascosta di una serie sostituita`. Altre quattro mutazioni provate e tutte uccise |
| 2026-09-22 | 6 — Composable: preferenza e insiemi | `npm test` 605/57 verdi, `lint` e `typecheck` puliti | completata: `useHiddenShowsPreference.ts` nuovo, i quattro insiemi in `useTrackedShows.ts`, `hiddenCount` e `fullyHiddenProviderShowIds`, campo `isHidden`, 16 test nuovi | **due correzioni**: una densità (`new Set(...)` su una `map` non nominata) e il test mancante su `fullyHiddenProviderShowIds`, il cui buco è stato provato con la mutazione `every`→`some`, sopravvissuta all`intera suite. Le altre quattro mutazioni uccise al primo colpo |
| 2026-09-22 | 7 — Composable: dettaglio e duplicato | `npm test` 613/57 verdi, `lint` e `typecheck` puliti | completata: `listing` e comando `changeListing` in `useShowDetail`, scelta del messaggio via `fullyHiddenProviderShowIds` in `useAddShow`, 8 test nuovi | **una correzione** di densità (`resolveDuplicateShowReason(...)` annidata dentro l`rgomento di `rejectSelection`); quattro mutazioni provate e tutte uccise. **La verifica dichiarata dall`utore nella stessa invocazione non è stata considerata valida**: rifatta da un`invocazione separata, come prevede la pipeline |
| 2026-09-22 | 8 — Home: pulsante, marcatore, stato vuoto | `npm test` 626/58 verdi, `lint` e `typecheck` puliti, grep colori pulito | completata: `HiddenShowsToggle.vue` nuovo, marcatore inline in `ShowCard.vue`, cablaggio di `fullyHiddenProviderShowIds`, stato vuoto **unico** dei filtri (deviazione decisa a schermo) | **due buchi di test chiusi**: il marcatore non era coperto per le combinazioni «privata non nascosta» e «nascosta e privata», e una mutazione sopravviveva; il cablaggio di `fullyHiddenProviderShowIds` non aveva alcun test a livello di vista. Più una densità in un test. Quattro stati vuoto ridotti a uno: 13 punti di decisione su 4 `computed` → 1 su 1 |
| 2026-09-22 | 9 — Dettaglio: comando e nota | `npm test` 634/58 verdi, `lint`, `typecheck` e grep colori puliti | completata: comando «Nascondi serie» / «Riporta in elenco» fra quelli di fine pagina, nota condizionata, due messaggi effimeri, 6 test | **due buchi di test chiusi**: nessun test dimostrava che il messaggio è scelto dal bersaglio e non da uno stato riletto dopo la scrittura (il doppio dello store allineava lo stato troppo presto, quindi la versione bacata sarebbe passata lo stesso), e nessuno copriva «con dati non allineati non compare alcun comando». Cinque mutazioni provate, tutte uccise |
| 2026-09-22 | 10 — Verifica finale e pubblicazione | `npm test` 632/58 verdi, `lint` e `typecheck` puliti, **`npm run build` verde** compreso `check-build-artifacts.mjs` | verifica chiusa: 17 criteri mappati sui test che li coprono, 8 mutazioni provate e **tutte uccise**, invarianti confermati per diff (`ProgressEvent`, i tre moduli di progresso, `showSorting`, `watchPosition`, `firestore.rules`, schema Dexie e `BACKUP_FORMAT_VERSION` con diff vuoto; `TrackedShow` con **un solo** campo in più; nessuna dipendenza nuova). Pubblicazione **non** eseguita: la decide l`Tente | fase di verifica essa stessa; residui chiusi qui: `hasScopedShows` rimosso perché orfano e spaziatura del marcatore corretta |

La colonna *Esito della fase di verifica* riporta cosa la seconda invocazione dell'implementer ha **confermato**, cosa ha **corretto** e cosa ha solo **proposto**. Va compilata anche quando la verifica è stata saltata, dichiarando il perché.

## Esito finale

**Chiusa il 2026-09-22.** Suite finale: **634 test su 58 file, tutti verdi**; `npm run lint` e `npm run typecheck` puliti; **`npm run build` verde**, `check-build-artifacts.mjs` compreso. **Pubblicazione non ancora eseguita**: la decide l'utente.

**Cosa è stato fatto.** Un campo condiviso `hidden` su `TrackedShow` (assente = in elenco, nessuna migrazione sui dati veri), il vocabolario di dominio in `showListing.ts`, il comando `changeListing` sul contratto e su entrambe le implementazioni dello store, il campo nel backup **restando al formato 2**, i quattro insiemi della home, la preferenza locale «Mostra nascoste», il pulsante e il marcatore in lista, il comando con nota e messaggi effimeri nel dettaglio. File nuovi: `src/domain/showListing.ts`, `src/composables/useHiddenShowsPreference.ts`, `src/components/show/HiddenShowsToggle.vue`, più i rispettivi spec. Nessuna cartella nuova, nessuna dipendenza nuova.

**Difetti trovati durante il lavoro: sette buchi di test, tutti dalla fase di verifica, nessuno dalla sola lettura del codice.** Il campo di cui non si dimostrava il transito nella **sostituzione** da backup (solo nell'unione); `fullyHiddenProviderShowIds` che avrebbe accettato «almeno una nascosta» invece di «tutte»; il marcatore «Nascosta» non coperto nelle combinazioni con il puntino privato; il cablaggio di `fullyHiddenProviderShowIds` privo di qualunque test a livello di vista — senza il quale il messaggio dedicato non sarebbe **mai** comparso nell'app reale, pur restando tutto verde; la scelta del messaggio effimero non distinguibile da una rilettura dello stato, perché il doppio dello store allineava lo stato troppo presto; l'assenza di un test su «con dati non allineati non compare alcun comando»; e il criterio 4, «nascondere è condiviso non personale», coperto solo da una garanzia architetturale. Più tre densità corrette in tre fasi diverse.

**Nota residua.** La flakiness di `HomeView.spec.ts` resta aperta, ora con una diagnosi motivata (vedi *Registro*): è debito preesistente di `features.md` § 3, non di questa feature.

## Esempio

```text
File previsti, per livello:
  Fase 2     src/domain/showListing.ts (+ spec), trackedShow.ts
             (showVisibility.ts, progressAdvance/Undo/Reset.ts, showSorting.ts NON si toccano)
  Fase 3-4   src/persistence/trackedShowStore.ts + le DUE implementazioni
             (tvTrackerDatabase.ts e firestore.rules NON si toccano)
  Fase 5     src/backup/backupValidation.ts, backupExport.ts
             (backupFormat.ts NON cambia: il formato resta 2)
  Fase 6-7   src/composables/useHiddenShowsPreference.ts (+ spec), useTrackedShows.ts,
             useShowDetail.ts, useAddShow.ts
             (useCatalogRefresh.ts NON cambia: solo un test nuovo nel suo spec)
  Fase 8-9   src/components/show/HiddenShowsToggle.vue (+ spec), ShowCard.vue
             src/views/HomeView.vue, ShowDetailView.vue
```

```ts
// Test previsti: uno per criterio della Definition of done della SPEC (17 criteri).

// showListing.spec.ts — criterio 1
it('una serie senza il campo e in elenco');
it('hidden false e letto come in elenco e normalizzato dal costruttore');
it('riportare in elenco toglie il campo invece di scrivere false');
it('i costruttori non toccano posizione, revisione, visibilita e piattaforma');

// localTrackedShowStore.spec.ts / firestoreTrackedShowStore.spec.ts — criteri 3, 4, 12, 15
it('nascondere aggiorna updatedAt e lascia invariati posizione, revisione ed eventi');
it('riportare in elenco non conserva il campo sul record');
it('nascondere una serie gia nascosta non produce un rifiuto');
it('il duplicato nascosto e rifiutato con il messaggio dedicato');
it('il duplicato in elenco e rifiutato con il messaggio di oggi');
it('nascondere non tocca la visibilita della serie');

// backupValidation.spec.ts / backupExport.spec.ts — criterio 13
it('accetta una serie priva del campo e la rilegge come in elenco');
it('accetta una serie nascosta e la rilegge nascosta');
it('il file esportato da serie prive del campo supera la validazione dell app');
it('il formato resta 2 e un file con versione diversa e rifiutato');

// useHiddenShowsPreference.spec.ts — criterio 6
it('il filtro e spento al primo avvio ed e ricordato per dispositivo');

// useTrackedShows.spec.ts — criteri 5, 7, 9, 10, 11, 14
it('il riepilogo esclude le nascoste e non cambia accendendo Mostra nascoste');
it('il conteggio delle completate e calcolato dopo il filtro delle nascoste');
it('la serie nascosta e completata compare solo con entrambi i filtri accesi');
it('con tutte le serie nascoste i controlli restano presenti');
it('l aggiornamento del catalogo aggiorna anche le serie nascoste');

// useShowDetail.spec.ts / useAddShow.spec.ts — criteri 2, 12, 15
it('il comando inverte lo stato della serie');
it('cambiare visibilita non cambia lo stato di nascosta');
it('azzerare una serie nascosta non la riporta in elenco');
it('il messaggio dedicato compare solo se tutte le schede visibili sono nascoste');

// HomeView.spec.ts / ShowCard.spec.ts / HiddenShowsToggle.spec.ts — criteri 7, 8, 10, 11
it('mostra lo stato vuoto dedicato quando e tutto nascosto e nomina il pulsante che lo risolve');
it('il pulsante compare solo quando esiste una nascosta in lente');
it('marca con Nascosta solo le serie nascoste');
it('i controlli restano premibili a lista svuotata dal filtro');

// ShowDetailView.spec.ts — criteri 2, 15
it('mostra la nota solo sulle serie nascoste');
it('il comando non apre alcun dialogo di conferma');

// Criterio 16: comportamento preesistente invariato, con la suite preesistente ancora verde
// su avanzamento, undo, conflitto di revisione, cinque ordinamenti, lente, filtro completate,
// cambio piattaforma e rimozione; firestore.rules, schema Dexie e formato 2 verificati per diff.
// Criterio 17: layout della riga dei controlli invariato, verificato in revisione.
```

### Note del registro

- **2026-09-22 — seconda comparsa della flakiness di `HomeView.spec.ts`.** Durante la verifica della Fase 3 il file è fallito una volta a suite piena e si è rivelato verde in isolamento e nella riesecuzione successiva. È il difetto **preesistente** già registrato in `features.md` § 3 (timeout intermittenti su `HomeView.spec.ts` e `router/index.spec.ts`), non un effetto di questa feature. Le Fasi 8 e 9 toccano proprio `HomeView.spec.ts`: se in quelle fasi la frequenza cresce, va affrontato prima di proseguire, perché un rosso che si ignora per abitudine nasconde il primo rosso vero.
- **2026-09-22 — da non dimenticare alla Fase 8.** `fullyHiddenProviderShowIds` esiste (Fase 6) ed è consumato da `useAddShow` (Fase 7), ma **non è ancora cablato** in `HomeView.vue` dentro `addShowDeps`, che oggi passa il solo `trackedProviderShowIds`. Finché quel cablaggio manca, il messaggio dedicato del duplicato nascosto **non comparirà mai nell'app reale**, pur essendo verde nei test dei composable. È una spunta della Fase 8.
- **2026-09-22 — terza comparsa della flakiness di `HomeView.spec.ts`.** Un timeout a suite piena durante la scrittura della Fase 8, sul **primo** test del file (`stato vuoto`), verde in isolamento (17/17) e alla riesecuzione completa. Resta il difetto preesistente di `features.md` § 3, non un effetto della feature. Tre comparse in una sola giornata di lavoro su questo file sono però più di quanto la nota originale registrasse: se si ripresenta alla Fase 9 o alla verifica finale, va affrontato prima della pubblicazione.
- **2026-09-22 — quarta comparsa della flakiness di `HomeView.spec.ts`.** Di nuovo un timeout a suite piena sul primo test del file, verde in isolamento subito dopo ma a 4535 ms su una soglia di 5000, cioè **vicinissimo al limite**: non è un caso raro, è un test lento che a suite piena supera il tempo. Resta il difetto preesistente di `features.md` § 3. Da decidere alla Fase 10 se affrontarlo prima della pubblicazione.
- **2026-09-22 — `hasScopedShows` è rimasto orfano.** La semplificazione a stato vuoto unico ha eliminato i tre `computed` di `HomeView.vue` che lo consumavano: oggi è esposto da `UseTrackedShows`, testato in `useTrackedShows.spec.ts` e **letto da nessuno** (verificato per grep). Non è stato rimosso nella Fase 8 perché appartiene a un file della Fase 6, già chiusa. **Da decidere alla Fase 10**: rimuoverlo è coerente con il precedente di `ShowListItem.isPrivate`, eliminato in verifica proprio perché nessuno lo leggeva. Costo: `useTrackedShows.ts` più il suo spec, nessun altro chiamante.
- **2026-09-22 — ridondanza cosmetica in `ShowCard.vue`.** Quando il marcatore «Nascosta» e il puntino di serie privata compaiono insieme, la distanza fra loro somma il `gap: 6px` di `.title-badges` al `margin-left: 8px` di `.private-dot`, per 14 px invece dei 6 px uniformi usati altrove. Non toccata: `PrivateShowDot.vue` non è un file di questa feature e quel margine preesiste. Da guardare a schermo alla Fase 10, prima della pubblicazione.
- **2026-09-22 — le due note precedenti sono chiuse.** `hasScopedShows` è stato rimosso (interfaccia, `computed`, `return` e i due test che esistevano solo per lui; grep pulito). La spaziatura del marcatore è stata corretta con una regola locale in `ShowCard.vue` che annulla il margine del puntino dentro `.title-badges`, senza toccare `PrivateShowDot.vue`.
- **2026-09-22 — diagnosi della flakiness di `HomeView.spec.ts`, da decidere fuori da questa feature.** Riprodotta una volta su tre a suite piena, sempre sul **primo** test del file. Causa più probabile: quel test paga da solo il costo di primo avvio del worker — trasformazione Vite dell'intero grafo di `HomeView.vue` più l'istanziazione di un ambiente **jsdom** dedicato — mentre 57 file girano in parallelo su una macchina a corto di memoria. Le esecuzioni successive dello stesso file sono 5-10 volte più veloci (350-450 ms contro 2400-4535 ms) perché riusano cache e ambiente. Non è un timer applicativo: `HomeView.spec.ts` usa un router locale e **non** attraversa la guardia di sessione da 5000 ms di `src/router/index.ts` — che resta invece il sospetto per la flakiness gemella di `router/index.spec.ts`. Tre rimedi possibili, in ordine di costo: alzare il timeout del solo file (maschera il sintomo); separare i file `jsdom` dai `node` in due gruppi Vitest (**26 file su 58** sovrascrivono l'ambiente di default, e un worker paga il cambio); ridurre la concorrenza dei worker, scambiando velocità per meno contesa di memoria. **Nessuno applicato**: è debito preesistente di `features.md` § 3, non di questa feature.
- **2026-09-22 — criterio 4 ora coperto da un test diretto.** Era l'unico dei diciassette a poggiare su una garanzia architetturale invece che su un test, ed è quello che incarna la prima decisione dell'utente: nascondere è **condiviso**, non personale. Aggiunti due test in `useTrackedShows.spec.ts` che montano il composable due volte sullo stesso store, con profilo attivo `fabio` e poi `irene`: la serie condivisa nascosta resta fuori dall'elenco per entrambi, e riappare per entrambi accendendo «Mostra nascoste». Provato con una mutazione che fa dipendere il filtro dal profilo attivo: il primo test muore. Suite a **634**.
