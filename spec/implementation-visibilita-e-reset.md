# IMPLEMENTATION — Visibilità delle serie e azzeramento del tracciamento

**Specifica di riferimento:** `spec-visibilita-e-reset.md` — nel resto del documento: «la SPEC».
**Stato:** `NOT_STARTED`  <!-- NOT_STARTED | IN_PROGRESS | BLOCKED | COMPLETED -->

Documento di lavoro: la SPEC (il "cosa") resta stabile; qui vivono stato, piano, decisioni e problemi (il "come").

> **Ordine di lavoro.** Le fasi salgono dal basso verso l'alto seguendo l'architettura a livelli del progetto: prima `domain/`, poi `persistence/` (contratto e **entrambe** le implementazioni), poi `backup/`, poi `composables/`, infine `components/` e `views/`. Nessuna fase lascia il progetto rosso: ogni fase chiude con typecheck, lint e test verdi.

## Regole per l'agente

- Leggere `CLAUDE.md` del repository e la SPEC prima di toccare codice; alla ripresa, ripartire dallo stato corrente di questo file.
- Prima di modificare, elencare i file che verranno toccati. Nessun refactoring fuori scope.
- Non modificare i requisiti della SPEC senza decisione esplicita. **La sezione *Da decidere* della SPEC è vuota**: le quattro domande della prima stesura sono chiuse e recepite come vincoli, compresa la correzione dichiarata sulla disponibilità dell'annullamento dopo un reset. Non riaprirle.
- Dopo ogni fase: eseguire i test pertinenti e aggiornare questo file. Spuntare una voce solo dopo verifica reale, mai a priori.
- Scelta che **non** cambia il comportamento osservabile → procedi e annotala in *Decisioni tecniche*.
- Scelta che **cambia** comportamento o criteri di accettazione, o ambiguità non risolvibile dalla SPEC → **fermati**, stato `BLOCKED`, registra in *Problemi aperti* / *Deviazioni*.
- Vincoli non negoziabili del progetto: `src/domain/` puro; Dexie e Firestore **solo** in `src/persistence/`; le viste non parlano mai con `persistence/` o `catalog/`; nessuna dipendenza nuova; nessun colore fuori da `src/styles/tokens.css`; nessuna icona nuova in `AppIcon.vue`; **il codice non si commenta**.
- **Nessun campo nuovo su `TrackedShow` per l'annullabilità** e nessun `ProgressEvent` consegnato al dettaglio: il confine dati non si allarga. Se un'implementazione sembra richiederlo, è la forma dell'evento di reset a essere sbagliata.
- Indentazione 4 spazi, punto e virgola sempre, apici singoli, import da `src/` con l'alias `@/`, tipi `readonly` in profondità, test `*.spec.ts` accanto al codice testato, `// @vitest-environment jsdom` solo nei test di componente.
- **L'app è pubblicata e in uso reale con dati veri.** Niente script sui dati di produzione, niente riscritture di documenti Firestore esistenti: il campo di visibilità si materializza alla prima scrittura.
- La pubblicazione richiede **Node 22 via fnm** (le tre righe di `CLAUDE.md`, la seconda non è facoltativa), l'incremento di `src/appVersion.ts` e `--branch master` su `wrangler pages deploy`. Nessun deploy prima della Fase 11.

## Contesto

Assunzioni verificate leggendo il codice, da riconfermare in Fase 1:

- `ProgressOutcome` porta **un solo** evento (`{ outcome: 'applied'; show; event }`): il reset ne produce uno nuovo più N marcati annullati, quindi serve un esito dedicato invece di forzare quello esistente.
- `useShowDetail` riceve solo la serie, mai i suoi `ProgressEvent`, e deriva `canUndo` da `show.lastViewedAt !== undefined`. Poiché il reset **valorizza** `lastViewedAt` con il proprio istante, il comando di annullamento resta disponibile subito dopo un reset **senza toccare né il composable né il confine dati**: è il motivo per cui la decisione recepita non costa nulla qui.
- `undoLastProgress` cerca la conferma attiva con `confirmedEpisodeId === show.lastWatchedEpisodeId` e ripristina `previousEpisodeId`. Se l'evento di reset conserva la stessa forma di aggancio (punto di ripartenza nel campo che l'undo confronta, assente quando la ripartenza è «non ancora iniziata», e la posizione precedente in `previousEpisodeId`), **l'annullamento del reset ricade nel meccanismo esistente** invece di aprirne uno parallelo. Da verificare esplicitamente in Fase 3, compreso il caso `undefined === undefined`.
- `resolveLastViewedAt` ripristina `lastViewedAt` leggendo la conferma attiva della posizione ripristinata: dopo l'annullamento di un reset quelle conferme sono tutte annullate, quindi `lastViewedAt` torna assente e non resta altro da annullare. **È esattamente l'asimmetria dichiarata dalla SPEC § 5**, non un effetto collaterale da correggere: va verificata con un test, non subita.
- **Vincolo di modellazione da risolvere in Fase 3, prima della persistenza:** `ProgressEvent.confirmedEpisodeId` è oggi obbligatorio, e lo è anche nella validazione del backup, mentre un reset verso «non ancora iniziata» non ha puntata confermata. Nessun valore sentinella e nessuna stringa vuota: la forma prevista è un'**unione discriminata sul tipo di evento**, con il ramo di avanzamento che mantiene puntata e snapshot obbligatori e il ramo di reset che li porta facoltativi. Un evento privo del discriminante è un avanzamento, così gli eventi già scritti restano validi.
- **Trappola Firestore da non ignorare.** Una query `where('visibility','==','shared')` **non restituisce** i documenti in cui il campo è assente, e i documenti esistenti in produzione non ce l'hanno: il controllo dei duplicati deve continuare a interrogare il solo `providerShowId` e applicare la regola di destinatario **in memoria** sui pochi documenti restituiti (al più tre per serie), normalizzando il campo assente a «condivisa». Non è un filtro in memoria su scoping di sicurezza — la SPEC § 6 dichiara che questo confine è di comodità — ed è l'unico modo per non perdere i duplicati storici.
- `initializeFirestore` ha `ignoreUndefinedProperties: true`: una serie condivisa non scrive affatto `privateFor`, che è esattamente l'invariante voluto.
- Lo schema Dexie **non cambia**: i campi nuovi non sono indicizzati, il duplicato si cerca già su `providerShowId`. Nessuna migrazione, nessuna versione 2 del database.
- `InitialPositionChoice` vive oggi in `src/composables/useAddShow.ts`. Riusarla dal dettaglio creerebbe una dipendenza composable → composable: va spostata in `src/domain/`, dove è vocabolario condiviso. È un refactoring **a supporto della modifica**, non una pulizia opportunistica.
- I token `--fabio` e `--irene` esistono già: il puntino non introduce colori nuovi.

## Piano operativo

### Fase 1 — Analisi e conferma delle assunzioni

*Obiettivo: nessuna riga di codice scritta su un'assunzione non verificata.*

- [ ] Rileggere i file elencati nel *Contesto* della SPEC e confermare, uno per uno, i fatti dichiarati.
- [ ] Confermare che nessun file fuori da `src/persistence/` importa `dexie` o `firebase/firestore` (verifica per grep), così da misurare davvero il costo sul confine dati.
- [ ] Confermare sul codice le due assunzioni da cui dipende la Fase 3: che `undoLastProgress` possa agganciare l'evento di reset con il meccanismo esistente, e che `resolveLastViewedAt` produca l'asimmetria descritta dalla SPEC § 5.
- [ ] Rilevare lo stile dei test esistenti su dominio, persistenza (`fake-indexeddb`), composable e componenti (`jsdom` + `@vue/test-utils`).
- [ ] Aggiornare *File coinvolti (effettivi)* con l'elenco confermato.
- [ ] Criterio di completamento: elenco dei file confermato in questo documento e nessuna assunzione residua.
- **File letti:** tutti quelli elencati in *File coinvolti (effettivi)*.
- **File modificati:** questo file.
- **File da creare:** nessuno.

### Fase 2 — Dominio: visibilità e lente

*Obiettivo: il vocabolario della visibilità, con l'invariante garantito dal punto che costruisce il valore.*

- [ ] Aggiungere a `TrackedShow` i campi `visibility?: 'shared' | 'private'` e `privateFor?: string`, `readonly` come gli altri.
- [ ] Tipo discriminato `ShowAudience` (condivisa / privata di un profilo) e funzione che lo ricava dai due campi piatti, con **campo assente = condivisa**.
- [ ] Costruttori che garantiscono l'invariante: rendere condivisa azzera `privateFor`, rendere privata lo valorizza. Nessun altro punto del codice scrive quei due campi a mano.
- [ ] Tipo della lente (`ShowScope = 'all' | 'mine'`), predicato di visibilità per un profilo e predicato di lente.
- [ ] Test: campo assente trattato come condivisa; `privateFor` presente su una serie condivisa ignorato e normalizzato; privata dell'altra persona invisibile con entrambe le posizioni della lente; «Solo le mie» esclude le condivise; i costruttori non lasciano mai `privateFor` su una condivisa.
- [ ] Criterio di completamento: `npm test` verde; nessun import da Vue, browser, Dexie o Firebase in `src/domain/`.
- **File letti:** `src/domain/trackedShow.ts`, `src/domain/watchPosition.ts`, `src/auth/profiles.ts`.
- **File modificati:** `src/domain/trackedShow.ts`.
- **File da creare:**
  - `src/domain/showVisibility.ts` — la visibilità è una regola di dominio con una ragione di cambiare propria (chi vede cosa), distinta dalla posizione di visione; sta in `src/domain/`, che è piatta per scelta dichiarata, accanto a `watchPosition.ts` e `showSorting.ts`. **Cartella esistente.**
  - `src/domain/showVisibility.spec.ts` — test accanto al codice testato.

### Fase 3 — Dominio: azzeramento annullabile

*Obiettivo: la terza operazione che sposta la posizione, annullabile come le altre, e la forma dell'evento che la rappresenta.*

- [ ] **Prima di tutto il resto della fase**, risolvere il vincolo di modellazione: `ProgressEvent` diventa un'**unione discriminata** sul tipo di evento; il ramo di avanzamento conserva puntata e snapshot obbligatori, il ramo di reset li porta facoltativi. Evento privo di discriminante = avanzamento, così gli eventi già scritti restano validi. Nessun valore sentinella, nessuna stringa vuota.
- [ ] Spostare `InitialPositionChoice` da `useAddShow.ts` a `src/domain/`, aggiornando i punti che la importano. Nessuna variante nuova: reset e inserimento usano lo stesso tipo.
- [ ] `resetProgress`: nuova posizione, eventi attivi marcati `undoneAt`/`undoneBy`, evento di reset nuovo con la posizione precedente e lo snapshot del punto di ripartenza quando esiste, `progressRevision` incrementata, **`lastViewedAt` all'istante del reset**, `addedAt` intatto, `updatedAt` all'istante del reset.
- [ ] Rifiuti come esito discriminato, mai eccezione: puntata futura, episodio non appartenente alla serie, **posizione richiesta coincidente con quella corrente** — e solo quest'ultima condizione, senza più guardare se esistano conferme annullabili.
- [ ] L'evento di reset è **annullabile**: verificare che `undoLastProgress` lo agganci con il meccanismo esistente, compreso il reset verso «non ancora iniziata», dove sia la posizione corrente sia la puntata dell'evento sono assenti.
- [ ] Annullare un reset ripristina la posizione e **non riattiva** gli eventi che il reset aveva marcato: `undoneAt`/`undoneBy` non si svuotano mai. Verificare che dopo l'annullamento non resti nulla da annullare e che `lastViewedAt` torni assente, come dichiara la SPEC § 5.
- [ ] Test: criteri 13, 14, 15, 16, 18, 19, 20 della *Definition of done*; reset su serie completata che la rimette in lista; reset che attraversa più stagioni; eventi già annullati non toccati due volte; immutabilità del dato ricevuto.
- [ ] Criterio di completamento: `npm test` verde; nessuna funzione della fase legge l'orologio da sé — l'istante è un parametro, come nelle Fasi 5 e 7 del piano originale.
- **File letti:** `src/domain/progressAdvance.ts`, `src/domain/progressUndo.ts`, `src/domain/episodeOrder.ts`, `src/domain/catalogDate.ts`.
- **File modificati:** `src/domain/trackedShow.ts` (unione degli eventi, `InitialPositionChoice`, esito del reset), `src/domain/progressUndo.ts` (+ spec), `src/domain/progressAdvance.ts` (+ spec, solo per il discriminante sull'evento prodotto), `src/composables/useAddShow.ts` e `src/components/add/InitialPositionPicker.vue` (solo l'import spostato).
- **File da creare:**
  - `src/domain/progressReset.ts` — l'azzeramento ha regole proprie (marcatura degli eventi, punto di ripartenza, revisione) e cambia per ragioni sue, come `progressAdvance.ts` e `progressUndo.ts`. **Cartella esistente.**
  - `src/domain/progressReset.spec.ts`.

### Fase 4 — Confine dati: contratto e implementazione Dexie

*Obiettivo: due comandi nuovi sul contratto, e il duplicato che smette di guardare il solo `providerShowId`.*

- [ ] Contratto: `changeVisibility` e `resetProgress`, ciascuno con esito discriminato, nella forma già usata da `changeProvider` e `advanceProgress`. Il contratto continua a non nominare Dexie né Firestore.
- [ ] `addShow`: duplicato valutato su `providerShowId` **più destinatario**; documento senza il campo trattato come condiviso.
- [ ] `changeVisibility`: rifiuto sulle due collisioni descritte nella SPEC § 3, con le `reason` italiane previste.
- [ ] `resetProgress` in **una sola transazione** che rilegge la serie al suo interno, come avanzamento e undo, e scrive serie, evento nuovo ed eventi marcati insieme.
- [ ] `undoLastProgress` continua a funzionare senza modifiche al proprio contratto quando l'ultimo evento attivo è un reset: verificarlo con un test, non dedurlo.
- [ ] Normalizzazione in lettura degli eventi privi di discriminante, così che il tipo in memoria sia sempre discriminato.
- [ ] Nessuna modifica allo schema Dexie: verificare che i campi nuovi non richiedano indici e annotarlo.
- [ ] Test su `fake-indexeddb`: criteri 9, 11, 12, 13, 14, 16; round-trip dei campi nuovi e dell'evento di reset senza puntata; reset atomico su fallimento a metà; evento legacy senza discriminante riletto come avanzamento; il cambio di visibilità **non** tocca posizione, revisione ed eventi.
- [ ] Criterio di completamento: `npm test` verde; `grep dexie src/` restituisce solo file di `src/persistence/`.
- **File letti:** `src/persistence/trackedShowStore.ts`, `localTrackedShowStore.ts`, `tvTrackerDatabase.ts`, `src/domain/showVisibility.ts`, `src/domain/progressReset.ts`.
- **File modificati:** `src/persistence/trackedShowStore.ts`, `src/persistence/localTrackedShowStore.ts` (+ spec).
- **File da creare:** nessuno.

### Fase 5 — Confine dati: implementazione Firestore e misura del costo

*Obiettivo: la seconda implementazione allineata, senza toccare regole né dati esistenti.*

- [ ] Riscrivere il controllo dei duplicati: interrogare il solo `providerShowId` — **senza** `limit(1)` e **senza** filtro di uguaglianza sul campo di visibilità, che escluderebbe i documenti storici in cui è assente — e applicare la regola di destinatario in memoria.
- [ ] `changeVisibility` e `resetProgress` con la stessa semantica della Fase 4; il reset in transazione, gli eventi marcati in batch se superano il limite di operazioni già gestito dal file.
- [ ] `readProgressEventSnapshot`: leggere il discriminante, normalizzare gli eventi storici che non ce l'hanno e reggere l'evento di reset **privo di puntata e di snapshot**, senza pretendere campi che non ci sono.
- [ ] Verificare che `privateFor` non venga scritto sulle serie condivise (`ignoreUndefinedProperties`).
- [ ] `firestore.rules` **non modificato**: verificarlo e dichiararlo qui.
- [ ] **Misurare e dichiarare il costo sul confine dati**: quanti file, quante funzioni e quante righe per comando, e quanti composable o viste sono stati toccati (attesi: zero). Il progetto ha già pagato caro un contratto che prometteva più di quanto garantisse: se la misura mostra che le due implementazioni divergono, fermarsi e segnalarlo.
- [ ] Test con il runtime finto già usato dal file: criteri 9, 11, 12, 13, 14, 16; duplicato riconosciuto anche quando il documento esistente è privo del campo; evento storico senza discriminante; evento di reset senza puntata scritto e riletto; il reset non lascia eventi attivi oltre al proprio.
- [ ] Criterio di completamento: `npm test`, `lint`, `typecheck` verdi; nessun accesso a Firestore fuori da `src/persistence/`.
- **File letti:** `src/persistence/firestoreTrackedShowStore.ts`, `firestore.rules`, `src/persistence/currentTrackedShowStore.ts`.
- **File modificati:** `src/persistence/firestoreTrackedShowStore.ts` (+ spec).
- **File da creare:** nessuno.

### Fase 6 — Backup in formato 2

*Obiettivo: il contratto con l'esterno cambia versione una volta sola, e lo dichiara.*

- [ ] Portare la versione del formato a 2.
- [ ] Validazione: visibilità obbligatoria e valida in ogni serie; `privateFor` presente **se e solo se** la serie è privata; discriminante obbligatorio in ogni evento.
- [ ] Validazione degli eventi **per tipo**: puntata e snapshot obbligatori sugli avanzamenti, ammessi assenti sui reset verso «non ancora iniziata». Oggi `confirmedEpisodeId` è preteso su tutti: è il punto che cambia.
- [ ] Rifiuto esplicito del formato 1, con un messaggio che ne nomina la versione.
- [ ] Verificare che unione e sostituzione continuino a funzionare sui campi nuovi, e che il file esportato superi la propria validazione (andata e ritorno).
- [ ] Test: criteri 16 e 21; file versione 1 rifiutato; serie privata senza `privateFor` rifiutata; serie condivisa con `privateFor` rifiutata; evento senza discriminante rifiutato; avanzamento senza puntata rifiutato; reset senza puntata accettato; round-trip export → validate → import.
- [ ] Criterio di completamento: `npm test` verde; nessuna modifica al contratto dello store in questa fase.
- **File letti:** `src/backup/backupFormat.ts`, `backupValidation.ts`, `backupExport.ts`, `backupImport.ts`.
- **File modificati:** `src/backup/backupFormat.ts`, `src/backup/backupValidation.ts` (+ spec), `src/backup/backupExport.spec.ts`, `src/backup/backupImport.spec.ts` (fixture aggiornate al formato 2).
- **File da creare:** nessuno.

### Fase 7 — Composable: preferenza della lente e lista della home

*Obiettivo: l'ordine di calcolo della SPEC § 2, che è comportamento e non dettaglio.*

- [ ] Preferenza della lente in `localStorage`, default «Tutto», stessa meccanica e stessa protezione di `useSortPreference` e `useCompletedVisibilityPreference`, con chiave dedicata.
- [ ] `useTrackedShows` riceve la lente e l'identità attiva; filtra prima sul **visibile** (mie private + condivise), poi sulla lente, poi sulle completate.
- [ ] `summaryText`, `trackedProviderShowIds` e `hasTrackedShows` calcolati sul visibile, **non** sulla lente; `completedCount` calcolato **dopo** la lente.
- [ ] Le righe con dati non allineati restano in testa e fuori dai filtri di completamento, come oggi, ma dentro il filtro di visibilità.
- [ ] Esporre nell'elemento di lista il segno di serie privata e il profilo che ne determina il colore.
- [ ] Test: criteri 3, 4, 5, 6, 8; una serie privata dell'altra persona invisibile in entrambe le posizioni della lente; riepilogo invariato al cambio di lente; conteggio completate che cambia con la lente; serie disallineata privata dell'altra persona non mostrata.
- [ ] Criterio di completamento: `npm test` verde; nessun accesso diretto alla persistenza aggiunto fuori dai composable.
- **File letti:** `src/composables/useTrackedShows.ts`, `useSortPreference.ts`, `useCompletedVisibilityPreference.ts`, `src/storageFailure.ts`, `src/auth/session.ts`.
- **File modificati:** `src/composables/useTrackedShows.ts` (+ spec).
- **File da creare:**
  - `src/composables/useScopePreference.ts` — preferenza locale del dispositivo, stesso concetto di `useSortPreference.ts` e `useCompletedVisibilityPreference.ts` e stessa sede: la ragione di cambiare è la stessa famiglia (come si guarda la lista), non i dati. **Cartella esistente.**
  - `src/composables/useScopePreference.spec.ts`.

### Fase 8 — Composable: dettaglio e inserimento

*Obiettivo: i due casi d'uso dell'utente, ancora senza pixel.*

- [ ] `useShowDetail`: esporre la visibilità corrente, il comando di cambio con i suoi rifiuti, il comando di azzeramento in tre tempi (richiesta, annullamento, conferma) e l'elenco delle puntate **già uscite** selezionabili come punto di ripartenza.
- [ ] `canUndo` resta derivato da `lastViewedAt`: **nessuna modifica** alla sua derivazione e nessun `ProgressEvent` consegnato al composable. Verificare che dopo un reset il comando resti disponibile e che, annullato il reset, sparisca.
- [ ] Il comando di azzeramento non è disponibile sulle serie con dati non allineati.
- [ ] Il testo di conferma del reset distingue serie condivisa e serie privata.
- [ ] `useAddShow`: scelta della visibilità iniziale, default «Per tutti», e costruzione del record nuovo con i due campi coerenti.
- [ ] Verificare che il blocco dei duplicati in ricerca usi l'insieme del visibile prodotto in Fase 7.
- [ ] Test: criteri 1, 10, 14, 17, 18, 19; il cambio di visibilità non altera posizione né revisione; dopo un reset il comando di annullamento è presente e annulla l'azzeramento.
- [ ] Criterio di completamento: `npm test` verde; nessuna regola di dominio riscritta nei composable (la Fase 14 del piano originale ha già pagato quell'errore).
- **File letti:** `src/composables/useShowDetail.ts`, `useAddShow.ts`, `src/domain/progressReset.ts`, `src/domain/showVisibility.ts`.
- **File modificati:** `src/composables/useShowDetail.ts` (+ spec), `src/composables/useAddShow.ts` (+ spec).
- **File da creare:** nessuno.

### Fase 9 — Home: lente, segno di serie privata, stato vuoto

*Obiettivo: la lista dice chi vede cosa, e la scelta resta sempre reversibile.*

- [ ] Controllo della lente accanto a «Mostra completate», con le due etichette della SPEC, stato corrente dichiarato agli assistivi e altezza minima `var(--tap)`.
- [ ] Il controllo resta visibile finché esiste almeno una serie visibile, anche quando la lente svuota la lista.
- [ ] Puntino sulle sole serie private, nel colore del profilo attivo (`--fabio` / `--irene`), con testo alternativo «Solo per te». Nessuna icona nuova, nessun colore nuovo.
- [ ] Stato vuoto dedicato quando la lente non lascia nulla, distinto da «Nessuna serie ancora».
- [ ] Test di componente: criteri 3, 6, 7, 22; controlli presenti a lista vuota per lente; nessun segno sulle serie condivise.
- [ ] Criterio di completamento: `npm test`, `lint`, `typecheck` verdi; grep dei colori: nessun valore cromatico fuori dai token.
- **File letti:** `src/views/HomeView.vue`, `src/components/show/CompletedVisibilityToggle.vue`, `SortSelect.vue`, `ShowCard.vue`, `src/components/feedback/EmptyState.vue`, `src/styles/tokens.css`.
- **File modificati:** `src/views/HomeView.vue` (+ spec), `src/components/show/ShowCard.vue` (+ spec).
- **File da creare:**
  - `src/components/show/ShowScopeToggle.vue` — controllo della lista, stesso concetto e stessa sede di `CompletedVisibilityToggle.vue` e `SortSelect.vue`. **Cartella esistente.**
  - `src/components/show/PrivateShowDot.vue` — il segno compare sulla card e nel dettaglio: due punti d'uso, quindi un componente e non un frammento duplicato. Sede: `show/`, concetto «serie». **Cartella esistente.**
  - `src/components/show/ShowScopeToggle.spec.ts`, `src/components/show/PrivateShowDot.spec.ts`.

### Fase 10 — Dettaglio e inserimento: visibilità e azzeramento

*Obiettivo: i due comandi nuovi, con le conferme che il progetto già impone.*

- [ ] Nel dettaglio: blocco «Chi vede questa serie» con le due scelte, accanto alla riga della piattaforma; suggerimento non vincolante dopo il passaggio a «Per tutti», come messaggio effimero e non come dialogo.
- [ ] Comando «Azzera tracciamento» che apre un dialogo con il picker esistente e una conferma; testo distinto per serie condivisa e privata.
- [ ] Il dialogo riusa `InitialPositionPicker.vue` **senza crearne una variante**; se la sua sede in `components/add/` risultasse un ostacolo, segnalare la proposta di spostamento invece di duplicare il componente.
- [ ] Nell'inserimento: scelta «Per tutti» / «Solo per me» nel passo della posizione iniziale, default «Per tutti».
- [ ] Accessibilità: comandi da almeno 46 px, focus visibile, dialogo utilizzabile da tastiera come gli altri.
- [ ] Test di componente e di vista: criteri 1, 10, 17, 18, 23; il dettaglio di una serie privata dell'altra persona aperto per indirizzo diretto si vede normalmente; annullando il dialogo di reset nulla cambia; il pulsante di annullamento è ancora a schermo dopo un reset.
- [ ] Criterio di completamento: `npm test`, `lint`, `typecheck` verdi; grep dei colori pulito.
- **File letti:** `src/views/ShowDetailView.vue`, `src/components/feedback/ConfirmDialog.vue`, `src/components/add/AddShowDialog.vue`, `InitialPositionPicker.vue`.
- **File modificati:** `src/views/ShowDetailView.vue` (+ spec), `src/components/add/AddShowDialog.vue` (+ spec).
- **File da creare:**
  - `src/components/show/ShowVisibilityControl.vue` — comando della singola serie, concetto «serie», accanto agli altri componenti di `show/`. **Cartella esistente.**
  - `src/components/show/ResetProgressDialog.vue` — dialogo del comando di azzeramento, che compone il picker esistente con la conferma; stessa sede e stessa ragione di cambiare del comando che serve. **Cartella esistente.**
  - `src/components/show/ShowVisibilityControl.spec.ts`, `src/components/show/ResetProgressDialog.spec.ts`.

### Fase 11 — Verifica finale e chiusura

*Obiettivo: i quattro comandi verdi e i ventiquattro criteri dimostrati, non dichiarati.*

- [ ] `npm test` — suite intera verde, con il numero di test riportato nel registro.
- [ ] `npm run lint` — pulito.
- [ ] `npm run typecheck` — pulito su entrambi i progetti TypeScript.
- [ ] `npm run build` su **Node 22** — verde, compreso `check-build-artifacts.mjs`.
- [ ] Rileggere la *Definition of done* della SPEC voce per voce e indicare per ciascuna il test che la copre; i criteri non coperti da un test unitario (come «`firestore.rules` non modificato») si verificano in revisione e si dichiarano.
- [ ] Provare a rompere di proposito almeno le regole che il progetto ha già visto sopravvivere a suite verdi: campo di visibilità assente trattato come privato, lente invertita, conteggio completate calcolato prima della lente, reset che non rinfresca `lastViewedAt`, reset che lascia attivo un evento precedente, annullamento del reset che riattiva gli eventi marcati. Ogni mutazione deve far fallire almeno un test.
- [ ] Verificare che nessuna vista importi `persistence/` o `catalog/`, che `src/domain/` resti puro, che `TrackedShow` non abbia guadagnato campi oltre ai due previsti e che non siano comparse dipendenze nuove in `package.json`.
- [ ] Compilare *Esito finale* e portare lo stato a `COMPLETED`.
- [ ] **Pubblicazione, solo su richiesta dell'utente e mai in silenzio:** attivare Node 22 con le tre righe di `fnm` (la seconda non è facoltativa), incrementare `src/appVersion.ts`, rifare `npm run build`, pubblicare con `npx wrangler pages deploy dist --project-name tv-tracker --branch master --commit-dirty=true` e verificare che il caricamento sia finito in **Production** e non in anteprima.
- **File letti:** la SPEC, questo file.
- **File modificati:** questo file; `src/appVersion.ts` solo se si pubblica.
- **File da creare:** nessuno.

## File coinvolti (effettivi)

Pre-compilati in via **provvisoria** dall'analisi del codice; **da confermare e correggere in Fase 1**. Formato: `` `path` — motivo``.

**Dominio** (`src/domain/`, puro)
- `trackedShow.ts` — campi di visibilità, unione discriminata degli eventi, `InitialPositionChoice`, esito del reset
- `showVisibility.ts` *(nuovo)* — tipo discriminato della visibilità, invariante, lente
- `progressReset.ts` *(nuovo)* — l'operazione di azzeramento, annullabile
- `progressUndo.ts` — aggancio dell'evento di reset, asimmetria sugli eventi già annullati
- `progressAdvance.ts` — discriminante sull'evento prodotto

**Persistenza** (`src/persistence/`)
- `trackedShowStore.ts` — due comandi nuovi e i rispettivi esiti
- `localTrackedShowStore.ts` — duplicato per destinatario, cambio visibilità, reset in transazione, normalizzazione degli eventi storici
- `firestoreTrackedShowStore.ts` — le stesse cose, più la query dei duplicati che non può filtrare su un campo assente e la rilettura dell'evento di reset privo di puntata
- `tvTrackerDatabase.ts` — **solo lettura**: si conferma che lo schema non cambia

**Backup** (`src/backup/`) — `backupFormat.ts`, `backupValidation.ts`; fixture di `backupExport.spec.ts` e `backupImport.spec.ts`

**Composable** (`src/composables/`) — `useScopePreference.ts` *(nuovo)*, `useTrackedShows.ts`, `useShowDetail.ts`, `useAddShow.ts`

**Componenti** (`src/components/`) — `show/ShowScopeToggle.vue` *(nuovo)*, `show/PrivateShowDot.vue` *(nuovo)*, `show/ShowVisibilityControl.vue` *(nuovo)*, `show/ResetProgressDialog.vue` *(nuovo)*, `show/ShowCard.vue`, `add/AddShowDialog.vue`, `add/InitialPositionPicker.vue` (solo import)

**Viste** (`src/views/`) — `HomeView.vue`, `ShowDetailView.vue`

**Non modificati, ma letti** — `firestore.rules`, `src/styles/tokens.css`, `src/auth/profiles.ts`, `src/auth/session.ts`, `src/components/icon/AppIcon.vue`

**Cartelle nuove: nessuna.** Tutti i file nuovi nascono in cartelle esistenti, secondo l'asse di organizzazione già adottato — **per livello**, con sottocartelle **per concetto** dentro `components/`. Nessun contenitore generico.

## Registro

Voci datate (`YYYY-MM-DD`), append-only.

- **Decisioni tecniche** (non cambiano il comportamento) — `Decisione · Motivazione · Impatto`: nessuna.
- **Deviazioni dalla SPEC** (da motivare) — `Descrizione · Motivazione · Impatto · Aggiorna la SPEC? sì/no`: nessuna.
- **Problemi aperti** (bloccano l'avanzamento) — `Descrizione · Impatto · Opzioni · Decisione richiesta`: nessuno. Le quattro domande della prima stesura sono state chiuse dall'utente e recepite nella SPEC; la sezione *Da decidere* della SPEC è vuota.

### Avanzamento delle fasi

| Data | Fase | Comando / verifica | Esito | Esito della fase di verifica |
| --- | --- | --- | --- | --- |
| — | — | — | da compilare | da compilare |

La colonna *Esito della fase di verifica* riporta cosa la seconda invocazione dell'implementer ha **confermato**, cosa ha **corretto** e cosa ha solo **proposto**. Va compilata anche quando la verifica è stata saltata, dichiarando il perché.

## Esito finale

Da compilare a fine lavoro: stato finale, modifiche effettuate, test eseguiti, note residue.

## Esempio

```text
File previsti, per livello:
  Fase 2-3   src/domain/showVisibility.ts, progressReset.ts, trackedShow.ts,
             progressUndo.ts, progressAdvance.ts
  Fase 4-5   src/persistence/trackedShowStore.ts + le DUE implementazioni
  Fase 6     src/backup/backupFormat.ts, backupValidation.ts
  Fase 7-8   src/composables/useScopePreference.ts, useTrackedShows.ts,
             useShowDetail.ts, useAddShow.ts
  Fase 9-10  src/components/show/ShowScopeToggle.vue, PrivateShowDot.vue,
             ShowVisibilityControl.vue, ResetProgressDialog.vue
             src/views/HomeView.vue, ShowDetailView.vue
```

```ts
// Test previsti: uno per criterio della Definition of done della SPEC.

// showVisibility.spec.ts — criteri 2, 3
it('una serie senza campo di visibilita e trattata come condivisa');
it('la lente Tutto mostra le mie private e le condivise');
it('la lente Solo le mie mostra soltanto le mie private');
it('la serie privata dell altra persona non compare con nessuna lente');

// progressReset.spec.ts — criteri 13, 16, 18, 19
it('porta la posizione alla scelta, incrementa la revisione e rinfresca lastViewedAt');
it('non tocca addedAt');
it('marca annullati gli eventi attivi e ne registra uno di reset');
it('registra un reset verso non ancora iniziata senza puntata confermata');
it('rifiuta una puntata non ancora uscita');
it('rifiuta il reset verso la posizione gia corrente');

// progressUndo.spec.ts — criteri 14, 15
it('annulla un reset e riporta la posizione a quella precedente');
it('annulla un reset verso non ancora iniziata');
it('non riattiva gli eventi che il reset aveva marcato annullati');
it('dopo l annullamento del reset non resta nulla da annullare');

// localTrackedShowStore.spec.ts / firestoreTrackedShowStore.spec.ts — criteri 9, 11, 12, 13, 14, 16
it('accetta la stessa serie per l altra persona come record distinto');
it('rifiuta la seconda scheda con lo stesso destinatario');
it('riconosce come condiviso il documento privo del campo');
it('scrive e rilegge un evento di reset privo di puntata confermata');
it('annulla un reset appena scritto');
it('rendere privata una serie condivisa conserva posizione revisione e storico');
it('rimettere Per tutti restituisce la stessa posizione e lo stesso storico');

// backupValidation.spec.ts — criteri 16, 21
it('rifiuta un backup in formato 1 nominando la versione');
it('esige privateFor se e solo se la serie e privata');
it('esige la puntata sugli avanzamenti e la ammette assente sui reset');

// useScopePreference.spec.ts — criterio 4
it('la lente vale Tutto al primo avvio ed e ricordata per dispositivo');

// useTrackedShows.spec.ts — criteri 5, 6, 8
it('il riepilogo resta sul visibile al cambio di lente');
it('il conteggio delle completate e calcolato dopo la lente');
it('la serie privata dell altra persona non blocca l inserimento');

// useShowDetail.spec.ts — criteri 10, 14, 17
it('il passaggio a Per tutti suggerisce il reset senza eseguirlo');
it('dopo un reset il comando di annullamento resta disponibile');
it('la conferma del reset dichiara che vale per entrambi se la serie e condivisa');

// HomeView.spec.ts / ShowCard.spec.ts — criteri 7, 22
it('mostra lo stato vuoto dedicato quando la lente svuota la lista');
it('i controlli restano visibili a lista vuota per lente');
it('marca con il puntino solo le serie private');

// ShowDetailView.spec.ts — criterio 23
it('mostra normalmente la serie privata dell altra persona aperta per indirizzo');

// showSorting.spec.ts — criterio 20
it('dopo un reset la serie risale in cima con Ultima attivita');
it('dopo un reset Inserite di recente non cambia');

// Criterio 24: verificato in revisione (firestore.rules invariato,
// nessun campo nuovo su TrackedShow oltre ai due previsti,
// nessuna dipendenza nuova, suite preesistente ancora verde).
```
