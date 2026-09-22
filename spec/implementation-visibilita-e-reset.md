# IMPLEMENTATION — Visibilità delle serie e azzeramento del tracciamento

**Specifica di riferimento:** `spec-visibilita-e-reset.md` — nel resto del documento: «la SPEC».
**Stato:** `COMPLETED`  <!-- NOT_STARTED | IN_PROGRESS | BLOCKED | COMPLETED -->

Documento di lavoro: la SPEC (il "cosa") resta stabile; qui vivono stato, piano, decisioni e problemi (il "come").

> **Ordine di lavoro.** Le fasi salgono dal basso verso l'alto seguendo l'architettura a livelli del progetto: prima `domain/`, poi `persistence/` (contratto e **entrambe** le implementazioni), poi `backup/`, poi `composables/`, infine `components/` e `views/`. Nessuna fase lascia il progetto rosso: ogni fase chiude con typecheck, lint e test verdi.

## Regole per l'agente

- Leggere `CLAUDE.md` del repository e la SPEC prima di toccare codice; alla ripresa, ripartire dallo stato corrente di questo file.
- Prima di modificare, elencare i file che verranno toccati. Nessun refactoring fuori scope.
- Non modificare i requisiti della SPEC senza decisione esplicita. **La sezione *Da decidere* della SPEC è vuota**: le domande della stesura sono chiuse e recepite come vincoli, compresa la riconferma che **l'azzeramento non è annullabile**. Non riaprirle.
- Dopo ogni fase: eseguire i test pertinenti e aggiornare questo file. Spuntare una voce solo dopo verifica reale, mai a priori.
- Scelta che **non** cambia il comportamento osservabile → procedi e annotala in *Decisioni tecniche*.
- Scelta che **cambia** comportamento o criteri di accettazione, o ambiguità non risolvibile dalla SPEC → **fermati**, stato `BLOCKED`, registra in *Problemi aperti* / *Deviazioni*.
- Vincoli non negoziabili del progetto: `src/domain/` puro; Dexie e Firestore **solo** in `src/persistence/`; le viste non parlano mai con `persistence/` o `catalog/`; nessuna dipendenza nuova; nessun colore fuori da `src/styles/tokens.css`; nessuna icona nuova in `AppIcon.vue`; **il codice non si commenta**.
- **`ProgressEvent` non cambia forma e `progressUndo.ts` non si tocca.** Nessun campo nuovo su `TrackedShow` oltre ai due della visibilità, nessun `ProgressEvent` consegnato al dettaglio: il confine dati non si allarga. Se un'implementazione sembra richiedere un tipo di evento nuovo, un campo facoltativo o una modifica all'undo, è il modello del reset a essere stato frainteso: l'azzeramento **cancella** gli eventi e non ne scrive alcuno.
- Indentazione 4 spazi, punto e virgola sempre, apici singoli, import da `src/` con l'alias `@/`, tipi `readonly` in profondità, test `*.spec.ts` accanto al codice testato, `// @vitest-environment jsdom` solo nei test di componente.
- **L'app è pubblicata e in uso reale con dati veri.** Niente script sui dati di produzione, niente riscritture di documenti Firestore esistenti: il campo di visibilità si materializza alla prima scrittura.
- La pubblicazione richiede **Node 22 via fnm** (le tre righe di `CLAUDE.md`, la seconda non è facoltativa), l'incremento di `src/appVersion.ts` e `--branch master` su `wrangler pages deploy`. Nessun deploy prima della Fase 11.

## Contesto

Assunzioni verificate leggendo il codice, da riconfermare in Fase 1:

- **La cancellazione degli eventi di una serie è già scritta e collaudata in `removeShow`, in entrambe le implementazioni: è il codice da riusare, non da reinventare.**
  - Dexie (`localTrackedShowStore.ts`): dentro una transazione `'rw'` aperta su `trackedShows` **e** `progressEvents`, una sola riga — `progressEvents.where('trackedShowId').equals(id).delete()`. Il reset apre la stessa transazione sulle stesse due tabelle, cancella allo stesso modo e vi scrive la serie aggiornata.
  - Firestore (`firestoreTrackedShowStore.ts`): `getDocs(progressEventsCollectionRef(...))` e un `writeBatch` che elimina i documenti trovati. Esistono già i pezzi riusabili per la forma a lotti — `deleteOperation`, `setOperation`, `buildDeleteEventsOperations`, `commitInBatches` e `MAX_BATCH_WRITE_OPERATIONS` — usati da `replaceAllShows`: il reset compone le stesse operazioni (N cancellazioni più la scrittura della serie) invece di scrivere un percorso parallelo.
- **Il reset non produce alcun evento**, quindi non può riusare `ProgressOutcome`, che porta sempre un evento (`{ outcome: 'applied'; show; event }`). Serve un esito dedicato che porta la sola serie, nella forma discriminata già in uso: `{ outcome: 'applied'; show } | { outcome: 'rejected'; reason }`.
- **`ProgressEvent` resta esattamente com'è.** `confirmedEpisodeId` è obbligatorio nel dominio e nella validazione del backup, e tale rimane: nessuna unione discriminata sul tipo di evento, nessun campo facoltativo nuovo, nessun valore sentinella. Gli eventi già scritti in produzione restano validi senza alcuna normalizzazione in lettura.
- **`progressUndo.ts` non viene toccato.** `undoLastProgress` cerca la conferma attiva con `confirmedEpisodeId === show.lastWatchedEpisodeId` e `undoneAt === undefined`: dopo un reset non esiste più alcun evento per quella serie, quindi l'undo non trova nulla e rifiuta da sé, senza un ramo nuovo.
- `useShowDetail` riceve solo la serie, mai i suoi `ProgressEvent`, e deriva `canUndo` da `show.lastViewedAt !== undefined`. Poiché il reset lascia `lastViewedAt` **assente**, il comando di annullamento sparisce da solo **senza toccare né il composable né il confine dati**, e torna alla prima conferma «Vista» successiva, che rivalorizza `lastViewedAt`.
- `advanceProgress` e `undoLastProgress` producono entrambi `progressRevision: show.progressRevision + 1`: il reset fa lo stesso, perché la revisione è il gettone di controllo del conflitto e deve solo crescere (SPEC § 5, deroga 1).
- `showSorting.ts` calcola `lastActivityAt` come `lastViewedAt !== undefined && lastViewedAt > addedAt ? lastViewedAt : addedAt`, e `added` ordina per `addedAt` decrescente. Con `lastViewedAt` assente e `addedAt` portato all'istante del reset, **entrambi** gli ordinamenti mettono la serie in cima senza modificare una riga di `showSorting.ts`: è il criterio 19, che si dimostra con un test, non con una modifica.
- **Trappola Firestore da non ignorare.** Una query `where('visibility','==','shared')` **non restituisce** i documenti in cui il campo è assente, e i documenti esistenti in produzione non ce l'hanno: il controllo dei duplicati deve continuare a interrogare il solo `providerShowId` e applicare la regola di destinatario **in memoria** sui pochi documenti restituiti (al più tre per serie), normalizzando il campo assente a «condivisa». Non è un filtro in memoria su scoping di sicurezza — la SPEC § 6 dichiara che questo confine è di comodità — ed è l'unico modo per non perdere i duplicati storici.
- `initializeFirestore` ha `ignoreUndefinedProperties: true`: una serie condivisa non scrive affatto `privateFor`, che è esattamente l'invariante voluto.
- Lo schema Dexie **non cambia**: i campi nuovi non sono indicizzati, il duplicato si cerca già su `providerShowId`. Nessuna migrazione, nessuna versione 2 del database.
- `InitialPositionChoice` vive oggi in `src/composables/useAddShow.ts`. Riusarla dal dettaglio creerebbe una dipendenza composable → composable: va spostata in `src/domain/`, dove è vocabolario condiviso. È un refactoring **a supporto della modifica**, non una pulizia opportunistica.
- I token `--fabio` e `--irene` esistono già: il puntino non introduce colori nuovi.

## Piano operativo

### Fase 1 — Analisi e conferma delle assunzioni

*Obiettivo: nessuna riga di codice scritta su un'assunzione non verificata.*

- [x] Rileggere i file elencati nel *Contesto* della SPEC e confermare, uno per uno, i fatti dichiarati.
- [x] Confermare che nessun file fuori da `src/persistence/` importa `dexie` o `firebase/firestore` (verifica per grep), così da misurare davvero il costo sul confine dati.
- [x] Leggere `removeShow` in **entrambe** le implementazioni e annotare qui, per ciascuna, le righe esatte che cancellano gli eventi e la forma della transazione o del lotto: è il codice che la Fase 4 e la Fase 5 riusano.
- [x] Confermare che dopo la cancellazione degli eventi e con `lastViewedAt` assente nulla resta da annullare, senza modifiche a `progressUndo.ts`.
- [x] Rilevare lo stile dei test esistenti su dominio, persistenza (`fake-indexeddb`), composable e componenti (`jsdom` + `@vue/test-utils`).
- [x] Aggiornare *File coinvolti (effettivi)* con l'elenco confermato.
- [x] Criterio di completamento: elenco dei file confermato in questo documento e nessuna assunzione residua.
- **File letti:** tutti quelli elencati in *File coinvolti (effettivi)*.
- **File modificati:** questo file.
- **File da creare:** nessuno.

### Fase 2 — Dominio: visibilità e lente

*Obiettivo: il vocabolario della visibilità, con l'invariante garantito dal punto che costruisce il valore.*

- [x] Aggiungere a `TrackedShow` i campi `visibility?: 'shared' | 'private'` e `privateFor?: string`, `readonly` come gli altri.
- [x] Tipo discriminato `ShowAudience` (condivisa / privata di un profilo) e funzione che lo ricava dai due campi piatti, con **campo assente = condivisa**.
- [x] Costruttori che garantiscono l'invariante: rendere condivisa azzera `privateFor`, rendere privata lo valorizza. Nessun altro punto del codice scrive quei due campi a mano.
- [x] Tipo della lente (`ShowScope = 'all' | 'mine'`), predicato di visibilità per un profilo e predicato di lente.
- [x] Test: criteri 2 e 3; campo assente trattato come condivisa; `privateFor` presente su una serie condivisa ignorato e normalizzato; privata dell'altra persona invisibile con entrambe le posizioni della lente; «Solo le mie» esclude le condivise; i costruttori non lasciano mai `privateFor` su una condivisa.
- [x] Criterio di completamento: `npm test` verde; nessun import da Vue, browser, Dexie o Firebase in `src/domain/`.
- **File letti:** `src/domain/trackedShow.ts`, `src/domain/watchPosition.ts`, `src/auth/profiles.ts`.
- **File modificati:** `src/domain/trackedShow.ts`.
- **File da creare:**
  - `src/domain/showVisibility.ts` — la visibilità è una regola di dominio con una ragione di cambiare propria (chi vede cosa), distinta dalla posizione di visione; sta in `src/domain/`, che è piatta per scelta dichiarata, accanto a `watchPosition.ts` e `showSorting.ts`. **Cartella esistente.**
  - `src/domain/showVisibility.spec.ts` — test accanto al codice testato.

### Fase 3 — Dominio: azzeramento definitivo del tracciamento

*Obiettivo: riportare la serie allo stato di una appena inserita, con la posizione scelta. Nessun evento scritto, nessun annullamento.*

- [x] Spostare `InitialPositionChoice` da `useAddShow.ts` a `src/domain/`, aggiornando i punti che la importano. Nessuna variante nuova: reset e inserimento usano lo stesso tipo.
- [x] `resetProgress`: nuova posizione (assente per «non ancora iniziata»), `progressRevision` **incrementata**, **`lastViewedAt` assente**, **`addedAt` all'istante del reset**, `updatedAt` all'istante del reset. Invariati identificativo, stagioni ed episodi, `catalogUpdatedAt`, piattaforma selezionata e visibilità.
- [x] L'esito è discriminato e porta la **sola serie**: nessun evento prodotto, nessun evento marcato. La cancellazione degli eventi è responsabilità dello store (Fasi 4 e 5), non del dominio, che resta puro e non conosce gli eventi esistenti.
- [x] Rifiuti come esito discriminato, mai eccezione: puntata futura («Non è possibile ripartire da una puntata non ancora uscita.»), episodio non appartenente alla serie, **posizione richiesta coincidente con quella corrente** («Non c'è niente da azzerare per questa serie.»). Quest'ultima condizione dipende **solo** dal confronto fra posizione richiesta e posizione corrente, senza guardare eventi né `lastViewedAt`.
- [x] `ProgressEvent` **non viene toccato** e `progressUndo.ts` **non viene modificato**: verificare con un test che l'undo, senza eventi, rifiuti come già fa oggi.
- [x] Test: criteri 13, 15, 17, 18, 19 della *Definition of done*; reset su serie completata che la rimette in lista; reset su serie mai iniziata verso una puntata, e rifiuto verso «non ancora iniziata»; reset che attraversa più stagioni; speciali fuori dal picker e fuori dal reset; immutabilità del dato ricevuto.
- [x] Criterio di completamento: `npm test` verde; nessuna funzione della fase legge l'orologio da sé — l'istante è un parametro, come nelle Fasi 5 e 7 del piano originale.
- **File letti:** `src/domain/progressAdvance.ts`, `src/domain/progressUndo.ts`, `src/domain/episodeOrder.ts`, `src/domain/catalogDate.ts`, `src/domain/showSorting.ts`.
- **File modificati:** `src/domain/trackedShow.ts` (`InitialPositionChoice`, esito del reset), `src/domain/showSorting.spec.ts` (criterio 19, senza modifiche a `showSorting.ts`), `src/composables/useAddShow.ts` e `src/components/add/InitialPositionPicker.vue` (solo l'import spostato).
- **File da creare:**
  - `src/domain/progressReset.ts` — l'azzeramento ha regole proprie (punto di ripartenza, revisione, ripartenza del tracciamento) e cambia per ragioni sue, come `progressAdvance.ts` e `progressUndo.ts`. **Cartella esistente.**
  - `src/domain/progressReset.spec.ts`.

### Fase 4 — Confine dati: contratto e implementazione Dexie

*Obiettivo: due comandi nuovi sul contratto, e il duplicato che smette di guardare il solo `providerShowId`.*

- [x] Contratto: `changeVisibility` e `resetProgress`, ciascuno con esito discriminato, nella forma già usata da `changeProvider` e `advanceProgress`. Il contratto continua a non nominare Dexie né Firestore.
- [x] `addShow`: duplicato valutato su `providerShowId` **più destinatario**; documento senza il campo trattato come condiviso.
- [x] `changeVisibility`: rifiuto sulle due collisioni descritte nella SPEC § 3, con le `reason` italiane previste.
- [x] `resetProgress` in **una sola transazione** che rilegge la serie al suo interno, come avanzamento e undo, e che scrive la serie azzerata **e cancella tutti i suoi `ProgressEvent`**, riusando la stessa cancellazione di `removeShow` (`progressEvents.where('trackedShowId').equals(id).delete()` dentro la transazione aperta sulle due tabelle). Nessun evento scritto.
- [x] Nessuna modifica allo schema Dexie: verificare che i campi nuovi non richiedano indici e annotarlo.
- [x] Test su `fake-indexeddb`: criteri 9, 11, 12, 13, 14, 15; round-trip dei campi nuovi; dopo un reset la tabella degli eventi non contiene più alcuna riga per quella serie e ne conserva per le altre; reset atomico su fallimento a metà (né serie azzerata né eventi cancellati); il cambio di visibilità **non** tocca posizione, revisione ed eventi.
- [x] Criterio di completamento: `npm test` verde; `grep dexie src/` restituisce solo file di `src/persistence/`.
- **File letti:** `src/persistence/trackedShowStore.ts`, `localTrackedShowStore.ts`, `tvTrackerDatabase.ts`, `src/domain/showVisibility.ts`, `src/domain/progressReset.ts`.
- **File modificati:** `src/persistence/trackedShowStore.ts`, `src/persistence/localTrackedShowStore.ts` (+ spec).
- **File da creare:** nessuno.

### Fase 5 — Confine dati: implementazione Firestore e misura del costo

*Obiettivo: la seconda implementazione allineata, senza toccare regole né dati esistenti.*

- [x] Riscrivere il controllo dei duplicati: interrogare il solo `providerShowId` — **senza** `limit(1)` e **senza** filtro di uguaglianza sul campo di visibilità, che escluderebbe i documenti storici in cui è assente — e applicare la regola di destinatario in memoria.
- [x] `changeVisibility` e `resetProgress` con la stessa semantica della Fase 4. Il reset riusa i pezzi già presenti nel file: `buildDeleteEventsOperations` per le cancellazioni della sottocollezione, `setOperation` per la serie azzerata, `commitInBatches` per rispettare `MAX_BATCH_WRITE_OPERATIONS` quando gli eventi sono molti.
- [x] `readProgressEventSnapshot` **non cambia**: la forma dell'evento è quella di oggi e nessun evento nuovo viene scritto.
- [x] Verificare che `privateFor` non venga scritto sulle serie condivise (`ignoreUndefinedProperties`).
- [x] `firestore.rules` **non modificato**: verificarlo e dichiararlo qui.
- [x] **Misurare e dichiarare il costo sul confine dati**: quanti file, quante funzioni e quante righe per comando, e quanti composable o viste sono stati toccati (attesi: zero). Il progetto ha già pagato caro un contratto che prometteva più di quanto garantisse: se la misura mostra che le due implementazioni divergono, fermarsi e segnalarlo.
- [x] Test con il runtime finto già usato dal file: criteri 9, 11, 12, 13, 14, 15; duplicato riconosciuto anche quando il documento esistente è privo del campo; dopo un reset la sottocollezione degli eventi è vuota e la serie porta posizione, revisione e `addedAt` nuovi; il reset non scrive alcun documento nella sottocollezione.
- [x] Criterio di completamento: `npm test`, `lint`, `typecheck` verdi; nessun accesso a Firestore fuori da `src/persistence/`.
- **File letti:** `src/persistence/firestoreTrackedShowStore.ts`, `firestore.rules`, `src/persistence/currentTrackedShowStore.ts`.
- **File modificati:** `src/persistence/firestoreTrackedShowStore.ts` (+ spec).
- **File da creare:** nessuno.

### Fase 6 — Backup in formato 2

*Obiettivo: il contratto con l'esterno cambia versione una volta sola, e solo per la visibilità.*

- [x] Portare la versione del formato a 2. **Il passaggio serve solo per i due campi di visibilità**: gli eventi non cambiano forma.
- [x] Validazione: visibilità obbligatoria e valida in ogni serie; `privateFor` presente **se e solo se** la serie è privata.
- [x] La validazione degli eventi **resta invariata**: `confirmedEpisodeId` obbligatorio su tutti, nessuna validazione per tipo di evento, nessun campo facoltativo nuovo. È il punto che il piano precedente sbagliava: qui non si tocca nulla.
- [x] Rifiuto esplicito del formato 1, con un messaggio che ne nomina la versione.
- [x] Verificare che unione e sostituzione continuino a funzionare sui campi nuovi, e che il file esportato superi la propria validazione (andata e ritorno).
- [x] Test: criterio 20, più il 23 per la parte «forma di `ProgressEvent` invariata»; file versione 1 rifiutato nominando la versione; serie privata senza `privateFor` rifiutata; serie condivisa con `privateFor` rifiutata; evento senza `confirmedEpisodeId` ancora rifiutato; round-trip export → validate → import.
- [x] Criterio di completamento: `npm test` verde; nessuna modifica al contratto dello store in questa fase.
- **File letti:** `src/backup/backupFormat.ts`, `backupValidation.ts`, `backupExport.ts`, `backupImport.ts`.
- **File modificati:** `src/backup/backupFormat.ts`, `src/backup/backupValidation.ts` (+ spec), `src/backup/backupExport.spec.ts`, `src/backup/backupImport.spec.ts` (fixture aggiornate al formato 2).
- **File da creare:** nessuno.

### Fase 7 — Composable: preferenza della lente e lista della home

*Obiettivo: l'ordine di calcolo della SPEC § 2, che è comportamento e non dettaglio.*

- [x] Preferenza della lente in `localStorage`, default «Tutto», stessa meccanica e stessa protezione di `useSortPreference` e `useCompletedVisibilityPreference`, con chiave dedicata.
- [x] `useTrackedShows` riceve la lente e l'identità attiva; filtra prima sul **visibile** (mie private + condivise), poi sulla lente, poi sulle completate.
- [x] `summaryText`, `trackedProviderShowIds` e `hasTrackedShows` calcolati sul visibile, **non** sulla lente; `completedCount` calcolato **dopo** la lente.
- [x] Le righe con dati non allineati restano in testa e fuori dai filtri di completamento, come oggi, ma dentro il filtro di visibilità.
- [x] Esporre nell'elemento di lista il segno di serie privata e il profilo che ne determina il colore.
- [x] Test: criteri 3, 4, 5, 6, 8; una serie privata dell'altra persona invisibile in entrambe le posizioni della lente; riepilogo invariato al cambio di lente; conteggio completate che cambia con la lente; serie disallineata privata dell'altra persona non mostrata.
- [x] Criterio di completamento: `npm test` verde; nessun accesso diretto alla persistenza aggiunto fuori dai composable.
- **File letti:** `src/composables/useTrackedShows.ts`, `useSortPreference.ts`, `useCompletedVisibilityPreference.ts`, `src/storageFailure.ts`, `src/auth/session.ts`.
- **File modificati:** `src/composables/useTrackedShows.ts` (+ spec).
- **File da creare:**
  - `src/composables/useScopePreference.ts` — preferenza locale del dispositivo, stesso concetto di `useSortPreference.ts` e `useCompletedVisibilityPreference.ts` e stessa sede: la ragione di cambiare è la stessa famiglia (come si guarda la lista), non i dati. **Cartella esistente.**
  - `src/composables/useScopePreference.spec.ts`.

### Fase 8 — Composable: dettaglio e inserimento

*Obiettivo: i due casi d'uso dell'utente, ancora senza pixel.*

- [x] `useShowDetail`: esporre la visibilità corrente, il comando di cambio con i suoi rifiuti, il comando di azzeramento in tre tempi (richiesta, annullamento, conferma) e l'elenco delle puntate **già uscite** selezionabili come punto di ripartenza.
- [x] `canUndo` resta derivato da `lastViewedAt`: **nessuna modifica** alla sua derivazione e nessun `ProgressEvent` consegnato al composable. Verificare che dopo un reset il comando **non sia disponibile**, perché `lastViewedAt` è assente, e che torni disponibile dopo la prima conferma «Vista» successiva.
- [x] Il comando di azzeramento non è disponibile sulle serie con dati non allineati.
- [x] Il testo di conferma del reset distingue serie condivisa e serie privata, e dichiara in entrambi i casi che l'operazione non si può annullare.
- [x] `useAddShow`: scelta della visibilità iniziale, default «Per tutti», e costruzione del record nuovo con i due campi coerenti.
- [x] Verificare che il blocco dei duplicati in ricerca usi l'insieme del visibile prodotto in Fase 7.
- [x] Test: criteri 1, 10, 14, 16, 17, 18; il cambio di visibilità non altera posizione né revisione; il passaggio a «Per tutti» suggerisce il reset senza eseguirlo.
- [x] Criterio di completamento: `npm test` verde; nessuna regola di dominio riscritta nei composable (la Fase 14 del piano originale ha già pagato quell'errore).
- **File letti:** `src/composables/useShowDetail.ts`, `useAddShow.ts`, `src/domain/progressReset.ts`, `src/domain/showVisibility.ts`.
- **File modificati:** `src/composables/useShowDetail.ts` (+ spec), `src/composables/useAddShow.ts` (+ spec).
- **File da creare:** nessuno.

### Fase 9 — Home: lente, segno di serie privata, stato vuoto

*Obiettivo: la lista dice chi vede cosa, e la scelta resta sempre reversibile.*

- [x] Controllo della lente accanto a «Mostra completate», con le due etichette della SPEC, stato corrente dichiarato agli assistivi e altezza minima `var(--tap)`.
- [x] Il controllo resta visibile finché esiste almeno una serie visibile, anche quando la lente svuota la lista.
- [x] Puntino sulle sole serie private, nel colore del profilo attivo (`--fabio` / `--irene`), con testo alternativo «Solo per te». Nessuna icona nuova, nessun colore nuovo.
- [x] Stato vuoto dedicato quando la lente non lascia nulla, distinto da «Nessuna serie ancora».
- [x] Test di componente: criteri 3, 6, 7, 21; controlli presenti a lista vuota per lente; nessun segno sulle serie condivise.
- [x] Criterio di completamento: `npm test`, `lint`, `typecheck` verdi; grep dei colori: nessun valore cromatico fuori dai token.
- **File letti:** `src/views/HomeView.vue`, `src/components/show/CompletedVisibilityToggle.vue`, `SortSelect.vue`, `ShowCard.vue`, `src/components/feedback/EmptyState.vue`, `src/styles/tokens.css`.
- **File modificati:** `src/views/HomeView.vue` (+ spec), `src/components/show/ShowCard.vue` (+ spec).
- **File da creare:**
  - `src/components/show/ShowScopeToggle.vue` — controllo della lista, stesso concetto e stessa sede di `CompletedVisibilityToggle.vue` e `SortSelect.vue`. **Cartella esistente.**
  - `src/components/show/PrivateShowDot.vue` — il segno compare sulla card e nel dettaglio: due punti d'uso, quindi un componente e non un frammento duplicato. Sede: `show/`, concetto «serie». **Cartella esistente.**
  - `src/components/show/ShowScopeToggle.spec.ts`, `src/components/show/PrivateShowDot.spec.ts`.

### Fase 10 — Dettaglio e inserimento: visibilità e azzeramento

*Obiettivo: i due comandi nuovi, con le conferme che il progetto già impone.*

- [x] Nel dettaglio: blocco «Chi vede questa serie» con le due scelte, accanto alla riga della piattaforma; suggerimento non vincolante dopo il passaggio a «Per tutti», come messaggio effimero e non come dialogo.
- [x] Comando «Azzera tracciamento» che apre un dialogo con il picker esistente e una conferma nella **variante rossa** già usata per la rimozione; testo distinto per serie condivisa e privata, con la dichiarazione che l'operazione non si può annullare.
- [x] Il dialogo riusa `InitialPositionPicker.vue` **senza crearne una variante**; se la sua sede in `components/add/` risultasse un ostacolo, segnalare la proposta di spostamento invece di duplicare il componente.
- [x] Nell'inserimento: scelta «Per tutti» / «Solo per me» nel passo della posizione iniziale, default «Per tutti».
- [x] Accessibilità: comandi da almeno 46 px, focus visibile, dialogo utilizzabile da tastiera come gli altri.
- [x] Test di componente e di vista: criteri 1, 10, 16, 17, 18, 22; il dettaglio di una serie privata dell'altra persona aperto per indirizzo diretto si vede normalmente; annullando il dialogo di reset nulla cambia; **dopo un reset il comando «Annulla ultima conferma» non compare più a schermo**.
- [x] Criterio di completamento: `npm test`, `lint`, `typecheck` verdi; grep dei colori pulito.
- **File letti:** `src/views/ShowDetailView.vue`, `src/components/feedback/ConfirmDialog.vue`, `src/components/add/AddShowDialog.vue`, `InitialPositionPicker.vue`.
- **File modificati:** `src/views/ShowDetailView.vue` (+ spec), `src/components/add/AddShowDialog.vue` (+ spec).
- **File da creare:**
  - `src/components/show/ShowVisibilityControl.vue` — comando della singola serie, concetto «serie», accanto agli altri componenti di `show/`. **Cartella esistente.**
  - `src/components/show/ResetProgressDialog.vue` — dialogo del comando di azzeramento, che compone il picker esistente con la conferma; stessa sede e stessa ragione di cambiare del comando che serve. **Cartella esistente.**
  - `src/components/show/ShowVisibilityControl.spec.ts`, `src/components/show/ResetProgressDialog.spec.ts`.

### Fase 11 — Verifica finale e chiusura

*Obiettivo: i quattro comandi verdi e i ventitré criteri dimostrati, non dichiarati.*

- [x] `npm test` — suite intera verde, con il numero di test riportato nel registro.
- [x] `npm run lint` — pulito.
- [x] `npm run typecheck` — pulito su entrambi i progetti TypeScript.
- [x] `npm run build` su **Node 22** — verde, compreso `check-build-artifacts.mjs`.
- [x] Rileggere la *Definition of done* della SPEC voce per voce — **sono 23** — e indicare per ciascuna il test che la copre; i criteri non coperti da un test unitario (come «`firestore.rules` non modificato») si verificano in revisione e si dichiarano.
- [x] Provare a rompere di proposito almeno le regole che il progetto ha già visto sopravvivere a suite verdi: campo di visibilità assente trattato come privato, lente invertita, conteggio completate calcolato prima della lente, **reset che non cancella gli eventi**, **reset che non aggiorna `addedAt`**, reset che non incrementa `progressRevision`, reset che lascia valorizzato `lastViewedAt`. Ogni mutazione deve far fallire almeno un test.
- [x] Verificare che nessuna vista importi `persistence/` o `catalog/`, che `src/domain/` resti puro, che `TrackedShow` non abbia guadagnato campi oltre ai due previsti, che `ProgressEvent` e `progressUndo.ts` siano rimasti identici e che non siano comparse dipendenze nuove in `package.json`.
- [x] Compilare *Esito finale* e portare lo stato a `COMPLETED`.
- [x] **Pubblicazione, solo su richiesta dell'utente e mai in silenzio:** attivare Node 22 con le tre righe di `fnm` (la seconda non è facoltativa), incrementare `src/appVersion.ts`, rifare `npm run build`, pubblicare con `npx wrangler pages deploy dist --project-name tv-tracker --branch master --commit-dirty=true` e verificare che il caricamento sia finito in **Production** e non in anteprima.
- **File letti:** la SPEC, questo file.
- **File modificati:** questo file; `src/appVersion.ts` solo se si pubblica.
- **File da creare:** nessuno.

## File coinvolti (effettivi)

Pre-compilati in via **provvisoria** dall'analisi del codice; **da confermare e correggere in Fase 1**. Formato: `` `path` — motivo``.

**Dominio** (`src/domain/`, puro)
- `trackedShow.ts` — campi di visibilità, `InitialPositionChoice`, esito del reset
- `showVisibility.ts` *(nuovo)* — tipo discriminato della visibilità, invariante, lente
- `progressReset.ts` *(nuovo)* — l'operazione di azzeramento, definitiva e senza eventi
- `showSorting.spec.ts` — **solo il test** del criterio 19: `showSorting.ts` non cambia
- `progressUndo.ts`, `progressAdvance.ts` — **solo lettura**: nessuna modifica, la forma degli eventi e l'undo restano identici

**Persistenza** (`src/persistence/`)
- `trackedShowStore.ts` — due comandi nuovi e i rispettivi esiti
- `localTrackedShowStore.ts` — duplicato per destinatario, cambio visibilità, reset in transazione con cancellazione degli eventi riusata da `removeShow`
- `firestoreTrackedShowStore.ts` — le stesse cose, più la query dei duplicati che non può filtrare su un campo assente e la cancellazione a lotti degli eventi (`buildDeleteEventsOperations`, `commitInBatches`)
- `tvTrackerDatabase.ts` — **solo lettura**: si conferma che lo schema non cambia

**Backup** (`src/backup/`) — `backupFormat.ts`, `backupValidation.ts` (solo i due campi di visibilità); fixture di `backupExport.spec.ts` e `backupImport.spec.ts`

**Composable** (`src/composables/`) — `useScopePreference.ts` *(nuovo)*, `useTrackedShows.ts`, `useShowDetail.ts`, `useAddShow.ts`

**Componenti** (`src/components/`) — `show/ShowScopeToggle.vue` *(nuovo)*, `show/PrivateShowDot.vue` *(nuovo)*, `show/ShowVisibilityControl.vue` *(nuovo)*, `show/ResetProgressDialog.vue` *(nuovo)*, `show/ShowCard.vue`, `add/AddShowDialog.vue`, `add/InitialPositionPicker.vue` (solo import)

**Viste** (`src/views/`) — `HomeView.vue`, `ShowDetailView.vue`

**Non modificati, ma letti** — `firestore.rules`, `src/styles/tokens.css`, `src/auth/profiles.ts`, `src/auth/session.ts`, `src/components/icon/AppIcon.vue`

**Cartelle nuove: nessuna.** Tutti i file nuovi nascono in cartelle esistenti, secondo l'asse di organizzazione già adottato — **per livello**, con sottocartelle **per concetto** dentro `components/`. Nessun contenitore generico.

## Registro

Voci datate (`YYYY-MM-DD`), append-only.

- **Costo misurato sul confine dati** (obbligo della Fase 5): due comandi nuovi per ciascuna delle due implementazioni, quattro funzioni ausiliarie per implementazione, **zero composable e zero viste toccati**. Unica asimmetria dichiarata e non eliminabile: Firestore non ammette query dentro una transazione, quindi la cancellazione degli eventi resta un lotto separato eseguito **dopo** il commit della transazione sulla serie. Il residuo è una finestra di pochi millisecondi in cui una conferma appena scritta può essere cancellata; nel caso peggiore produce un rifiuto esplicito dell'annullamento, mai una corruzione silenziosa.
- **Decisioni tecniche** (non cambiano il comportamento) — `Decisione · Motivazione · Impatto`:
  - 2026-09-21 · Tolto il ramo dedicato al rifiuto del formato 1 in `backupValidation.ts` · l'utente ha confermato che non esistono backup in formato 1 con cui restare compatibili, e il messaggio generico nomina già la versione attesa e quella trovata: il ramo speciale era codice irraggiungibile che diceva la stessa cosa · rimossi una costante, un messaggio e un ramo; il rifiuto della versione 1 resta, verificato dal test.
  - 2026-09-22 · **Da applicare come primo passo della Fase 9**: togliere il valore predefinito al parametro `scope` di `useTrackedShows` e cablare `useScopePreference()` in `HomeView.vue` · finché il parametro ha un valore predefinito, dimenticare di cablarlo lascia la lente bloccata su «Tutto» senza che nulla diventi rosso: è una firma che promette più di quanto l'implementazione garantisca · una riga nel composable, due nella vista, cioè il lavoro che la Fase 9 deve comunque fare.
  - 2026-09-21 · `.wrangler/**` aggiunto alle esclusioni di `eslint.config.js` · `npm run lint` analizzava i file generati da wrangler in `.wrangler/tmp/`, producendo 132 errori su albero pulito e rendendo illeggibile il criterio «lint verde» di ogni fase · una riga di configurazione, nessun file sorgente toccato.
  - 2026-09-21 · Il reset in Firestore riusa `buildDeleteEventsOperations` + `commitInBatches`, **non** la forma di `removeShow` · `removeShow` costruisce un solo `writeBatch` e supererebbe il limite di operazioni su una serie con molte conferme, mentre `commitInBatches` spezza a `MAX_BATCH_WRITE_OPERATIONS` · nessun effetto sul comportamento, previene un limite latente.
  - 2026-09-21 · Correzione di un difetto **preesistente e fuori dal perimetro della feature**, autorizzata esplicitamente dall'utente · `progressAdvance.ts` e `useShowDetail.ts` usano la stessa forma debole corretta in `progressReset.ts`: una puntata senza data di uscita risulta marcabile come vista, e siccome il segnalibro marca implicitamente tutte le precedenti, un tocco può dare per viste intere stagioni non ancora uscite · due guardie allineate a `isAlreadyPublished`, più i test; nessun cambio di firma.
- **Deviazioni dalla SPEC** (da motivare) — `Descrizione · Motivazione · Impatto · Aggiorna la SPEC? sì/no`: nessuna.
- ~~**Autorizzato dall'utente il 2026-09-22** — correggere il difetto **preesistente** dello stato vuoto generico~~ **FATTO il 2026-09-22**, vedi registro: con la lente su «Tutto» e tutte le serie completate e nascoste, la home annuncia «Nessuna serie ancora» a chi ha una lista piena di serie finite. È lo stesso difetto corretto in Fase 9 per lo stato vuoto della lente, e la correzione è la stessa: calcolare la condizione **prima** del filtro delle completate. Attenzione: esiste un test che congela il comportamento sbagliato e va aggiornato, non aggirato.
- **Pulizia da valutare prima della Fase 11** — `resolveActiveProfileIdFromSession` è ora identica in tre composable (`useTrackedShows`, `useShowDetail`, `useAddShow`): due copie erano preesistenti, la terza l'ha aggiunta la Fase 8. Estrarla in `src/auth/session.ts`, che già esporta `matchSessionState`, eliminerebbe la duplicazione; tocca però file di fasi già verificate, quindi va fatta come intervento dichiarato e non di straforo.
- **Problemi aperti** (bloccano l'avanzamento) — `Descrizione · Impatto · Opzioni · Decisione richiesta`: nessuno. Le domande della stesura sono state chiuse dall'utente e recepite nella SPEC; la sezione *Da decidere* della SPEC è vuota.

### Avanzamento delle fasi

| Data | Fase | Comando / verifica | Esito | Esito della fase di verifica |
| --- | --- | --- | --- | --- |
| 2026-09-21 | 1 — Analisi e conferma delle assunzioni | grep del confine dati, lettura di `removeShow` in entrambe le implementazioni, lettura di `progressUndo.ts`, campionamento dello stile dei test | tutte le assunzioni confermate; baseline 417 test su 48 file, `lint` e `typecheck` verdi | non applicabile: fase di sola analisi, nessun codice prodotto |
| 2026-09-21 | 2 — Dominio: visibilità e lente | `npm test`, `lint`, `typecheck` | verde, 433 test su 49 file (baseline 417) | **corretto**: `matchesScope` non riceveva il profilo di chi guarda e, usata da sola con lente «Solo le mie», avrebbe mostrato le private altrui; ora rifiuta prima di applicare la lente. **Aggiunto** il test mancante sull'invariante violata (`visibility: 'private'` con `privateFor` assente), che sopravviveva alla mutazione. **Confermato** il resto; nessuna proposta fuori perimetro. |
| 2026-09-21 | 3 — Dominio: azzeramento definitivo | `npm test`, `lint`, `typecheck`, mutation testing manuale | verde, 449 test su 50 file | **corretto**: `isFutureEpisode` accettava una puntata senza data, che il picker dell'inserimento esclude — dominio più permissivo dell'interfaccia, contro il criterio 17; `findTargetEpisode` si appoggiava a `sequence[-1]`, resa esplicita con una ricerca diretta; densità in `resetToPosition`. **Confermato** per diff: `ProgressEvent`, `progressUndo.ts` e `showSorting.ts` invariati. **Proposto** fuori perimetro: stesso difetto di `isFutureEpisode` in `progressAdvance.ts`; instabilità intermittente di `HomeView.spec.ts`. |
| 2026-09-21 | 4 — Confine dati: contratto e Dexie | `npm test`, `lint`, mutation testing manuale | verde, 465 test; typecheck rosso **di proposito** sul solo `firestoreTrackedShowStore.ts`, chiuso dalla Fase 5 | verificata insieme alla Fase 5: le due metà della stessa modifica, e verificare la 4 con il typecheck rosso sarebbe stata una verifica finta |
| 2026-09-21 | 5 — Confine dati: Firestore e misura del costo | `npm test`, `lint`, `typecheck`, mutation testing manuale | verde, 479 test su 50 file, typecheck tornato verde | **corretto**: `changeVisibility` e `resetProgress` leggevano con `getDoc` e scrivevano fuori da ogni transazione, mentre `advanceProgress` e `undoLastProgress` nello stesso file rileggono dentro `runTransaction`; una conferma concorrente dall'altro telefono veniva sovrascritta in silenzio. Ora la scrittura della serie rilegge lo stato fresco in transazione. **Confermato**: parità fra le due implementazioni, duplicati senza filtro sul campo assente, `privateFor` mai sulle condivise, `ProgressEvent`/`progressUndo.ts`/`readProgressEventSnapshot`/`firestore.rules` invariati per diff, zero composable e zero viste toccati. **Proposto**: un test di fallimento a metà per il reset Firestore, non applicato perché coprirebbe un limite già accettato altrove. |
| 2026-09-21 | (fuori piano) Correzione autorizzata: puntata senza data | `npm test`, `lint`, `typecheck`, mutazione provata | verde, 481 test; nessun test preesistente scosso | verifica chiusa senza seconda invocazione: diff di due righe più uno scambio di import, letto per intero (soglia di banalità dichiarata) |
| 2026-09-21 | 6 — Backup in formato 2 | `npm test`, `lint`, `typecheck`, mutation testing manuale | verde, 489 test su 50 file | **corretto in corsa**: l'esportazione non normalizzava la visibilità, quindi un backup delle serie reali — che in produzione non hanno ancora il campo — sarebbe stato rifiutato dalla validazione della stessa app. Il test di andata e ritorno esisteva già ma partiva da serie che il campo ce l'avevano: verde senza provare ciò che dichiarava. Aggiunta la normalizzazione in uscita e il test che parte dalla forma reale dei dati. **Confermato**: validazione degli eventi invariata, `confirmedEpisodeId` ancora obbligatorio, invariante di visibilità non duplicata (il validatore chiede al dominio e confronta). |
| 2026-09-21 | 7 — Composable: lente e lista della home | `npm test`, `lint`, `typecheck`, mutation testing manuale | verde, 504 test su 51 file | verifica eseguita il 2026-09-22. **Corretto**: `summaryText` e `hasTrackedShows` derivano dal visibile senza alcun controllo a valle, ma nessun test li metteva alla prova con una serie privata dell'altra persona — la mutazione sul filtro di visibilità vi sarebbe sopravvissuta. Aggiunti due test. **Confermato**: i tre insiemi distinti e nell'ordine giusto, riepilogo prima della lente e conteggio completate dopo, preferenza che ricalca le due esistenti, righe disallineate dentro il filtro di visibilità, nessuna vista toccata. **Proposto**: togliere il valore predefinito al parametro `scope`, da applicare come **primo passo della Fase 9**. |
| 2026-09-22 | 8 — Composable: dettaglio e inserimento | `npm test`, `lint`, `typecheck`, mutation testing manuale | verde, 519 test su 51 file | **Confermato**: l'elenco delle puntate offerte come ripartenza coincide guardia per guardia con quelle che il dominio accetta, puntate senza data e speciali esclusi da entrambi i lati; `canUndo` invariato per diff e testato in **entrambe** le direzioni; azzeramento indisponibile sulle serie disallineate; il cambio di visibilità non tocca posizione né revisione e il passaggio a «Per tutti» suggerisce senza eseguire; nessuna regola di dominio riscritta. **Corretto**: una densità in `resolveResetTargetLabel`. **Proposto e respinto dal processo principale**: spostare l'assemblaggio del testo di conferma nella vista — l'implementazione attuale è corretta e testata, lo split costerebbe un cambio di firma pubblica e tre test riscritti per allinearsi a un precedente che tratta casi più semplici, mentre la regola di progetto vuole che le viste ricevano dati già pronti. La Fase 10 lega il messaggio, non lo ricostruisce. |
| 2026-09-22 | 9 — Home: lente, segno privato, stato vuoto | `npm test`, `lint`, `typecheck`, mutation testing manuale | verde, 534 test su 53 file | **Corretto** due difetti: lo stato vuoto della lente si calcolava sulla lista già filtrata per completate, quindi con le serie private tutte finite la home annunciava «Nessuna serie solo tua» a chi ce le aveva, suggerendo per giunta la mossa sbagliata per uscirne; e `ShowListItem.isPrivate` era un campo morto che nessuna vista leggeva, con un invariante duplicato rispetto a `privateProfileId`. **Confermato**: parametro `scope` senza valore predefinito e cablato, controllo della lente visibile anche a lista svuotata, nessun colore fuori dai token, nessuna icona nuova. **Proposto**: lo stesso difetto dello stato vuoto esiste, **preesistente alla feature**, nel caso con lente «Tutto» e tutte le serie completate. |
| 2026-09-22 | 10 — Dettaglio e inserimento a schermo | `npm test`, `lint`, `typecheck`, mutation testing manuale | verde, 553 test su 55 file | **Corretto**: il test «annullando il dialogo di azzeramento nulla cambia» passava per il motivo sbagliato — la serie di prova non aveva posizione, quindi un azzeramento eseguito per errore sarebbe stato comunque rifiutato dal dominio a valle. Rafforzata la fixture: ora il test fallisce davvero se l'annullamento esegue. **Confermato**: la trappola del focus copre il contenuto dello slot (verificato sul codice: interroga il nodo reale del dialogo, e il contenuto proiettato ne è discendente); le tre istanze preesistenti di `ConfirmDialog` invariate; picker riusato senza varianti; testo di conferma legato e non ricostruito; suggerimento effimero che non esegue nulla; nessun colore fuori dai token. **Deviazione dal piano accettata**: uno slot aggiunto a `ConfirmDialog.vue`, additivo, per non duplicare novanta righe di meccanica modale. |
| 2026-09-22 | 11 — Verifica finale e chiusura | `npm test`, `lint`, `typecheck`, `npm run build` su Node 22, sette mutazioni deliberate, controlli architetturali per diff | verde: 553 test su 55 file, build e `check-build-artifacts.mjs` superati | tutti e 23 i criteri coperti da un test che cade davvero togliendo ciò che protegge; sette mutazioni su sette uccise, nessuna sopravvissuta; nessuna correzione necessaria. |
| 2026-09-22 | (fuori piano) Correzione autorizzata: stato vuoto generico | `npm test`, `lint`, `typecheck`, mutazione provata | verde, 553 test su 55 file | difetto **preesistente**: la home diceva «Nessuna serie ancora» a chi aveva una lista piena di serie completate e nascoste dal filtro. Aggiunto un terzo stato vuoto, «Le tue serie sono tutte completate», che nomina il pulsante che risolve. I due test che congelavano il comportamento sbagliato sono stati **aggiornati insieme al codice, non aggirati**. Verifica chiusa senza seconda invocazione: diff letto per intero, stati mutuamente esclusivi per costruzione (soglia di banalità dichiarata). |

La colonna *Esito della fase di verifica* riporta cosa la seconda invocazione dell'implementer ha **confermato**, cosa ha **corretto** e cosa ha solo **proposto**. Va compilata anche quando la verifica è stata saltata, dichiarando il perché.

## Esito finale

**Chiusa il 2026-09-22.** Undici fasi, tutte scritte e verificate con una seconda invocazione distinta.

**Suite:** da **417** test su 48 file a **553** su 55 file. `lint`, `typecheck` e `npm run build` su Node 22 verdi, controlli sugli artefatti compresi.

**Cosa è stato realizzato.** Una serie tracciata è condivisa o privata di una persona; la home ha la lente «Tutto / Solo le mie» accanto a «Mostra completate», con il puntino sulle serie private e uno stato vuoto che distingue «non ne hai» da «ce le hai ma sono completate»; dal dettaglio si cambia la visibilità e si azzera il tracciamento scegliendo da dove ripartire. Il backup è passato al formato 2. `firestore.rules` non è stato toccato: il confine è di comodità e vive nel client, come deciso.

**Costo sul confine dati:** zero composable e zero viste toccati dalle Fasi 4 e 5 — la promessa che sostituire lo store costi «un file più una riga» ha retto anche a questa feature.

**I difetti trovati durante il lavoro, che sono il vero guadagno di queste fasi.** Sette, di cui **tre preesistenti e indipendenti dalla feature**:

1. Un backup che l'app stessa avrebbe rifiutato di rileggere: l'esportazione non normalizzava la visibilità, e nessuna serie in produzione ha ancora quel campo. Il test di andata e ritorno esisteva e passava, perché partiva da serie che il campo ce l'avevano.
2. L'azzeramento su Firestore poteva sovrascrivere in silenzio una conferma appena arrivata dall'altro telefono: leggeva e scriveva fuori da ogni transazione, a differenza dei due comandi gemelli nello stesso file.
3. `matchesScope` era usabile male: da sola, con la lente «Solo le mie», avrebbe mostrato le serie private dell'altra persona.
4. Lo stato vuoto della lente mentiva a chi aveva serie private tutte completate, suggerendo per giunta la mossa sbagliata per uscirne.
5. `ShowListItem.isPrivate` era un campo morto con un invariante duplicato che nulla imponeva.
6. **(preesistente)** Una puntata senza data di uscita risultava confermabile come vista, e siccome il segnalibro marca implicitamente tutte le precedenti, un tocco poteva dare per viste intere stagioni non ancora uscite. Corretto su autorizzazione esplicita dell'utente.
7. **(preesistente)** `npm run lint` restituiva 132 errori su albero pulito, perché analizzava i file generati da wrangler.

**La forma di difetto ricorrente.** Cinque delle sette scoperte hanno la stessa struttura: una grandezza risulta corretta *per caso*, perché un secondo controllo più a valle rifà il lavoro di uno mancante a monte — fino al caso limite di un **test** che passava per il motivo sbagliato, perché la sua serie di prova rendeva indistinguibili il comportamento giusto e quello sbagliato. È il criterio con cui vanno letti i test di questo progetto: non «passa?», ma «fallirebbe togliendo ciò che protegge?».

**Note residue**, entrambe registrate fra i problemi aperti: il difetto preesistente dello stato vuoto generico (autorizzato, da correggere a feature chiusa) e la duplicazione di `resolveActiveProfileIdFromSession` in tre composable.

## Esempio

```text
File previsti, per livello:
  Fase 2-3   src/domain/showVisibility.ts, progressReset.ts, trackedShow.ts
             (progressUndo.ts e progressAdvance.ts NON si toccano)
  Fase 4-5   src/persistence/trackedShowStore.ts + le DUE implementazioni
  Fase 6     src/backup/backupFormat.ts, backupValidation.ts
  Fase 7-8   src/composables/useScopePreference.ts, useTrackedShows.ts,
             useShowDetail.ts, useAddShow.ts
  Fase 9-10  src/components/show/ShowScopeToggle.vue, PrivateShowDot.vue,
             ShowVisibilityControl.vue, ResetProgressDialog.vue
             src/views/HomeView.vue, ShowDetailView.vue
```

```ts
// Test previsti: uno per criterio della Definition of done della SPEC (23 criteri).

// showVisibility.spec.ts — criteri 2, 3
it('una serie senza campo di visibilita e trattata come condivisa');
it('la lente Tutto mostra le mie private e le condivise');
it('la lente Solo le mie mostra soltanto le mie private');
it('la serie privata dell altra persona non compare con nessuna lente');

// progressReset.spec.ts — criteri 13, 15, 17, 18
it('porta la posizione alla scelta, incrementa la revisione e lascia lastViewedAt assente');
it('porta addedAt all istante del reset');
it('non produce alcun evento');
it('lascia invariati identificativo, stagioni, catalogUpdatedAt, piattaforma e visibilita');
it('offre non ancora iniziata e le sole puntate gia uscite, speciali esclusi');
it('rifiuta una puntata non ancora uscita');
it('rifiuta il reset verso la posizione gia corrente');

// showSorting.spec.ts — criterio 19
it('dopo un reset la serie sta in cima con Ultima attivita');
it('dopo un reset la serie sta in cima con Inserite di recente');

// localTrackedShowStore.spec.ts / firestoreTrackedShowStore.spec.ts — criteri 9, 11, 12, 13, 14, 15
it('accetta la stessa serie per l altra persona come record distinto');
it('rifiuta la seconda scheda con lo stesso destinatario');
it('riconosce come condiviso il documento privo del campo');
it('il reset cancella tutti i ProgressEvent della serie e non ne scrive alcuno');
it('il reset non tocca gli eventi delle altre serie');
it('il reset e atomico: un fallimento a meta non lascia serie azzerata senza eventi cancellati');
it('rendere privata una serie condivisa conserva posizione revisione e storico');
it('rimettere Per tutti restituisce la stessa posizione e lo stesso storico');

// backupValidation.spec.ts — criteri 20, 23
it('rifiuta un backup in formato 1 nominando la versione');
it('esige privateFor se e solo se la serie e privata');
it('esige ancora confirmedEpisodeId su ogni evento');

// useScopePreference.spec.ts — criterio 4
it('la lente vale Tutto al primo avvio ed e ricordata per dispositivo');

// useTrackedShows.spec.ts — criteri 5, 6, 8
it('il riepilogo resta sul visibile al cambio di lente');
it('il conteggio delle completate e calcolato dopo la lente');
it('la serie privata dell altra persona non blocca l inserimento');

// useShowDetail.spec.ts — criteri 1, 10, 14, 16
it('il passaggio a Per tutti suggerisce il reset senza eseguirlo');
it('dopo un reset il comando di annullamento non e disponibile');
it('il comando di annullamento torna disponibile dopo la prima conferma Vista');
it('la conferma del reset dichiara che non si puo annullare e, se condivisa, che vale per entrambi');

// HomeView.spec.ts / ShowCard.spec.ts — criteri 7, 21
it('mostra lo stato vuoto dedicato quando la lente svuota la lista');
it('i controlli restano visibili a lista vuota per lente');
it('marca con il puntino solo le serie private, con testo alternativo Solo per te');

// ShowDetailView.spec.ts — criteri 16, 22
it('mostra normalmente la serie privata dell altra persona aperta per indirizzo');
it('annullando il dialogo di reset nulla cambia');
it('dopo un reset il comando Annulla ultima conferma non compare piu');

// Criterio 23: forma di ProgressEvent e progressUndo.ts invariati (verificati per diff),
// piu la suite preesistente ancora verde su avanzamento, undo, conflitto di revisione,
// cinque ordinamenti, filtro delle completate, cambio piattaforma e rimozione;
// firestore.rules non modificato, verificato in revisione.
```
