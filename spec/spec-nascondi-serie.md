# SPEC — Nascondere una serie dall'elenco

**Obiettivo:** poter togliere dalla lista della home una serie che si è smesso di seguire, senza perderla né cancellarne il tracciamento, e poterla rivedere e riattivare quando serve.

Il caso reale: «abbiamo mollato Chicago Fire a S6E3». La serie non deve più ingombrare la lista né i conteggi, ma la posizione, gli eventi e la piattaforma restano dove sono, pronti per il giorno in cui la si riprende.

## Contesto

Fatti verificati leggendo il codice, non ipotesi.

**Punti del codice interessati**

- `src/domain/trackedShow.ts` — `TrackedShow` ha già due campi facoltativi di visibilità (`visibility`, `privateFor`), `readonly` come tutti gli altri; `InitialPositionChoice` e `ResetProgressOutcome` vivono qui.
- `src/domain/showVisibility.ts` — il precedente esatto da imitare: tipo discriminato `ShowAudience`, `resolveShowAudience` che tratta il **campo assente** come `shared`, i due costruttori `withSharedVisibility` / `withPrivateVisibility` che sono l'unico punto che scrive quei campi, e i predicati `isVisibleToProfile` / `matchesScope`.
- `src/composables/useTrackedShows.ts` — catena di derivazioni oggi in vigore: `entries` (posizione calcolata, riga degradata inclusa) → `visibleEntries` (filtro di visibilità per profilo) → `scopedEntries` (lente «Tutto / Solo le mie») → `listItems` (ordinamento → filtro completate → mappatura). Da `visibleEntries` derivano `summaryText`, `trackedProviderShowIds` e `hasTrackedShows`; da `scopedEntries` derivano `completedCount` e `hasScopedShows`. La firma è `useTrackedShows(sortMode, showCompleted, scope, deps)`, **senza valori predefiniti** sui tre `Ref` (scelta presa nella feature precedente: un valore predefinito lascia una lente scollegata senza che nulla diventi rosso).
- `src/views/HomeView.vue` — i controlli stanno dentro `v-if="hasAnyTrackedShow"`; `SortSelect` su una riga propria, poi `.controls-row` con `ShowScopeToggle` e `CompletedVisibilityToggle`, quest'ultimo reso solo se `completedCount > 0`. Tre stati vuoti già distinti: `SCOPE_EMPTY_TITLE`, `COMPLETED_HIDDEN_TITLE` e «Nessuna serie ancora».
- `.controls-row` in `HomeView.vue` è già `display: flex` con `flex-wrap: wrap`, `justify-content: flex-end` e `gap: 4px`.
- `src/components/show/CompletedVisibilityToggle.vue` — un solo pulsante che cambia etichetta («Mostra completate» / «Nascondi completate»), senza `aria-pressed`; `min-height: var(--tap)`, `white-space: nowrap`.
- `src/composables/useCompletedVisibilityPreference.ts` e `useScopePreference.ts` — preferenza locale del dispositivo in `localStorage`, protetta da `runIgnoringStorageFailure`, con `watch(..., { flush: 'sync' })`. Chiavi in uso: `tv-tracker:show-completed`, `tv-tracker:show-scope`.
- `src/persistence/trackedShowStore.ts` — contratto a sottoscrizione; ogni comando ha un esito discriminato dedicato (`ChangeProviderOutcome`, `ChangeVisibilityOutcome`, `ResetProgressOutcome`…). `changeVisibility(id, targetAudience, updatedAt)` è la firma da imitare.
- `src/persistence/localTrackedShowStore.ts` — `changeVisibility` legge con `get`, compone con `applyAudience` e scrive con `put`, **fuori** da una transazione (come `changeProvider`); avanzamento, undo e reset stanno invece dentro `tvTrackerDatabase.transaction('rw', …)`.
- `src/persistence/firestoreTrackedShowStore.ts` — `changeVisibility` **rilegge il documento dentro `runTransaction`** prima di scrivere: correzione già pagata in questo file, perché `getDoc` + `setDoc` sovrascriveva in silenzio una conferma appena arrivata dall'altro telefono. `initializeFirestore` ha `ignoreUndefinedProperties: true`, e le scritture sono `set` piene (non `merge`): assegnare `undefined` a un campo **lo toglie dal documento**.
- `src/persistence/tvTrackerDatabase.ts` — schema Dexie versione 1, indici `id, providerShowId` su `trackedShows`. La lista arriva tutta da una sola sottoscrizione (`liveQuery` / `onSnapshot`): i filtri di lista sono già tutti in memoria.
- `src/composables/useAddShow.ts` — il blocco del duplicato in ricerca avviene in `chooseResult`, **prima** di caricare la serie, confrontando `result.providerShowId` con `trackedProviderShowIds` ricevuto da `AddShowDeps`; il messaggio è la costante locale `DUPLICATE_SHOW_REASON = 'Questa serie è già stata aggiunta.'`, ripetuta identica nelle due implementazioni dello store.
- `src/composables/useShowDetail.ts` — `ShowDetailContent` espone già `audience: ShowAudience`; `changeVisibility(targetKind)` compone l'`ShowAudience` bersaglio e delega allo store; il comando di azzeramento e quello di rimozione vivono qui.
- `src/views/ShowDetailView.vue` — i comandi di fine pagina sono due bottoni semplici («Azzera tracciamento», «Rimuovi dalla lista»); `ShowVisibilityControl` sta sotto la riga della piattaforma; i messaggi effimeri passano da `ToastMessage`. Con dati non allineati la vista mostra **solo** l'avviso, senza alcun comando.
- `src/composables/useCatalogRefresh.ts` — `listCurrentShows` prende **tutte** le serie dello store con una sottoscrizione usa-e-getta e ne aggiorna una per una il catalogo: nessun filtro di visibilità, di lente o di completamento è mai stato applicato qui.
- `src/backup/backupFormat.ts` — `BACKUP_FORMAT_VERSION = 2`; `requireExactFormatVersion` rifiuta ogni altra versione.
- `src/backup/backupValidation.ts` — validazione campo per campo con helper (`requireOptionalString`, `requireNonNegativeInteger`, …); `requireVisibility` e `requireConsistentVisibility` sono le due guardie aggiunte dalla feature precedente. **Non esiste ancora un helper per i booleani facoltativi.**
- `src/backup/backupExport.ts` — `buildBackupFile` normalizza la visibilità di ogni serie prima di scriverla, perché in produzione i documenti reali quel campo non ce l'hanno e senza normalizzazione l'app rifiutava il proprio backup.
- `src/components/show/ShowCard.vue` — la riga del titolo ospita già `PrivateShowDot`, reso solo quando `item.privateProfileId !== undefined`.

**Pattern e meccanismi esistenti da riusare**

- L'intera meccanica del campo facoltativo con **assenza = valore predefinito**, senza migrazione sui dati di produzione, già collaudata dalla visibilità.
- Preferenza locale del dispositivo in `localStorage` con `runIgnoringStorageFailure` (due esempi identici già in `composables/`).
- Comando dello store con esito discriminato e `reason` italiana rivolta all'utente.
- `CompletedVisibilityToggle.vue` come modello letterale del pulsante nuovo.
- Stati vuoti dedicati con `EmptyState` che nominano il pulsante che li risolve.
- `ToastMessage` per i messaggi effimeri del dettaglio.

**File coinvolti** — dominio, contratto della persistenza e **entrambe** le implementazioni, backup (validazione ed esportazione), tre composable, `HomeView.vue`, `ShowDetailView.vue`, `ShowCard.vue`. Un componente nuovo e un composable nuovo, entrambi in cartelle esistenti. **Nessuna cartella nuova.**

## Comportamento atteso

### 1. Che cosa vuol dire «nascosta»

Una serie tracciata è **in elenco** oppure **nascosta**. È un dato del record condiviso, non una preferenza del dispositivo.

- **Nascondere è condiviso.** Se Fabio nasconde una serie condivisa, sparisce anche dalla lista di Irene. Non c'è una versione personale del «nascosto»: la lista è una sola, come la posizione di visione.
- **Il dato è un campo facoltativo `hidden?: boolean` su `TrackedShow`.** Presente e uguale a `true` significa nascosta; **assente significa in elenco**, esattamente come per la visibilità. Nessuna migrazione, nessuno script sui dati di produzione: il campo si materializza alla prima scrittura.
- **Non si scrive mai `hidden: false`.** «In elenco» ha una sola rappresentazione — il campo assente — garantita dai costruttori, che sono l'unico punto del codice a scrivere quel campo. Un `false` che arrivasse da un backup modificato a mano viene letto come «in elenco» e normalizzato alla prima scrittura.
- **Perché un booleano e non un istante (`hiddenAt`).** Niente in questa app usa il momento in cui una serie è stata nascosta: non c'è storico, non c'è ordinamento che lo guardi, e `updatedAt` registra già quando il record è cambiato l'ultima volta. Un istante sarebbe una seconda fonte di verità per un fatto binario, e inviterebbe a derivare «nascosta» da `hiddenAt !== undefined` in punti diversi del codice. Il fatto è binario, il campo è binario.

### 2. Il comando nel dettaglio

- Nel dettaglio di una serie in elenco compare **«Nascondi serie»**, accanto agli altri comandi di fine pagina.
- Nel dettaglio di una serie nascosta lo stesso posto ospita **«Riporta in elenco»**, e sopra il comando compare la nota «Questa serie è nascosta dall'elenco.» — senza la nota, chi arriva al dettaglio per indirizzo diretto non avrebbe modo di sapere in che stato si trova.
- **Nessun dialogo di conferma.** L'operazione è reversibile e non distrugge niente: è della stessa famiglia di «Chi vede questa serie» e del cambio di piattaforma, non di «Rimuovi dalla lista» o «Azzera tracciamento». La conferma si paga solo dove non si torna indietro.
- Dopo il comando la vista **resta sul dettaglio** e mostra un messaggio effimero:
  - nascosta: «“{titolo}” è nascosta dall'elenco. Puoi riportarla da qui o con «Mostra nascoste» nella home.»
  - riportata in elenco: «“{titolo}” è di nuovo in elenco.»
- Il messaggio non è decorazione: è l'unico punto in cui l'app dice dove ritrovare ciò che è appena sparito.

### 3. Il pulsante nella home

Accanto ai filtri già presenti compare **«Mostra nascoste»**; quando è acceso l'etichetta diventa **«Nascondi di nuovo»**. La coppia «Mostra nascoste» / «Nascondi nascoste» è scartata di proposito: è uno scioglilingua.

- La preferenza vive in `localStorage`, **per dispositivo**, con chiave dedicata e valore predefinito **spento**, con la stessa meccanica e la stessa protezione delle due preferenze già esistenti. Non tocca e non sincronizza i dati condivisi.
- Il pulsante compare **solo quando esiste almeno una serie nascosta dentro la lente corrente**, cioè fra le serie visibili a chi guarda e selezionate dalla lente «Tutto / Solo le mie». Regola analoga a quella di «Mostra completate», che compare solo con `completedCount > 0`.
- Il conteggio non compare nell'etichetta, come già deciso per le completate.
- **Il pulsante può andare a capo.** `.controls-row` è già `flex` con `flex-wrap: wrap` e `justify-content: flex-end`: l'andata a capo è il comportamento naturale del contenitore e l'utente l'ha dichiarata accettabile. **Non** si inventa un contenitore nuovo, un menu a tendina, una riga separata dedicata, né si riorganizzano i tre filtri per farli stare su una riga sola. Il layout della riga dei controlli non si tocca.

### 4. Su quale insieme si calcola che cosa

Non è un dettaglio implementativo: è il comportamento richiesto. Gli insiemi, nell'ordine in cui si derivano l'uno dall'altro:

| Insieme | Definizione |
| --- | --- |
| **visibili** | i record visibili al profilo attivo (mie private + condivise), nascoste comprese |
| **attive** | le visibili **non nascoste** |
| **in lente** | le visibili selezionate dalla lente «Tutto / Solo le mie», nascoste comprese |
| **elencabili** | le «in lente», meno le nascoste quando «Mostra nascoste» è spento |

| Valore | Calcolato su | Perché |
| --- | --- | --- |
| Riepilogo «N nuove puntate su M serie» | **attive** | se nascondere non toglie la serie dal riepilogo, la feature non serve a niente |
| Blocco dei duplicati in ricerca (`trackedProviderShowIds`) | **visibili**, nascoste comprese | una serie nascosta è già tracciata: riaggiungerla creerebbe un doppione con una posizione persa (§ 6) |
| Presenza dei controlli (`hasTrackedShows`) | **visibili**, nascoste comprese | se nascondere tutto facesse sparire la riga dei controlli, «Mostra nascoste» sarebbe irraggiungibile e la scelta irreversibile |
| Comparsa del pulsante «Mostra nascoste» | numero di nascoste fra le **in lente** | il pulsante compare solo quando ha qualcosa da rivelare |
| Conteggio delle completate (`completedCount`) | **elencabili** | «Mostra completate» deve rivelare esattamente ciò che il filtro delle nascoste ha già lasciato passare |
| Stato vuoto dei filtri (unico e generico) | **in lente** non vuoto ed elenco mostrato vuoto | distingue «non ne hai» da «ce le hai ma un filtro le nasconde»; non distingue più *quale* filtro |
| Elenco mostrato | **elencabili**, meno le completate quando il loro filtro è spento | |

Il riepilogo è calcolato sulle **attive** indipendentemente sia dalla lente sia da «Mostra nascoste»: nascondere è un dato condiviso e cambia il riepilogo per entrambi, le lenti locali del dispositivo non lo toccano mai. È lo stesso principio già in vigore per la lente «Solo le mie».

### 5. I due filtri si sommano

«Mostra nascoste» e «Mostra completate» sono filtri **indipendenti**: una serie sia nascosta sia completata ricompare **solo con entrambi accesi**.

La conseguenza va detta, perché è l'unico punto in cui le due regole di comparsa dei pulsanti si intrecciano. Con una sola serie, nascosta e completata, ed entrambi i filtri spenti:

1. `completedCount` è **zero** — la serie è nascosta, quindi non è fra le elencabili — e il pulsante «Mostra completate» **non** compare;
2. il pulsante «Mostra nascoste» compare, perché esiste una nascosta in lente;
3. premendolo, la serie entra fra le elencabili, `completedCount` diventa uno e compare anche «Mostra completate»;
4. premendo anche quello, la serie appare.

Due passi, sempre raggiungibili, nessun vicolo cieco: è questo che va dimostrato con un test, non l'ordine in cui i due pulsanti compaiono.

### 6. Aggiunta di una serie già nascosta

Una serie nascosta **continua a bloccare il duplicato**: è già tracciata, e una seconda scheda perderebbe la posizione di quella nascosta. Cambia solo il messaggio.

- Messaggio dedicato: **«Questa serie è già stata aggiunta ed è nascosta dall'elenco: puoi riportarla in elenco dal suo dettaglio.»**
- Il messaggio dedicato compare quando **tutte** le schede di quella serie visibili a chi guarda sono nascoste. Se esiste anche una sola scheda in elenco, il messaggio resta quello di oggi: «Questa serie è già stata aggiunta.» — la scheda c'è, si vede, e parlare di nascoste confonderebbe.
- Lo stesso criterio vale **anche nello store**, in entrambe le implementazioni: il controllo in ricerca copre il caso normale, quello dello store copre la corsa fra due dispositivi, e due messaggi diversi per la stessa situazione a seconda del momento sarebbero un difetto, non una sfumatura.

### 7. Rapporti con le funzionalità già presenti

Da dichiarare esplicitamente, perché tre feature vicine si somigliano e vanno tenute separate.

- **Indipendente dalla visibilità «Per tutti / Solo per me».** Sono due assi ortogonali: una serie può essere condivisa e nascosta, privata e in elenco, e ogni combinazione. Nascondere non cambia `visibility` né `privateFor`; cambiare visibilità non cambia `hidden`.
- **Indipendente dall'azzeramento.** Azzerare il tracciamento di una serie nascosta **non** la riporta in elenco, e nascondere **non** azzera niente.
- **Diverso dalla rimozione.** «Rimuovi dalla lista» cancella il record e i suoi eventi ed è definitiva; nascondere non cancella nulla ed è reversibile con un tocco.
- **Nascondere non tocca il tracciamento**: `lastWatchedEpisodeId`, `lastViewedAt`, i `ProgressEvent` e `progressRevision` restano identici. In particolare **`progressRevision` non si incrementa**: è il gettone di controllo del conflitto sugli avanzamenti, e nascondere non è un avanzamento. Toccarlo farebbe fallire un annullamento legittimo in corso sull'altro telefono.
- **`updatedAt` sì**: il record condiviso è cambiato ed è giusto che lo dica, come per il cambio di piattaforma e per il cambio di visibilità.
- **Nascondere la serie privata dell'altra persona.** Dalla home non è possibile: quella serie non compare in nessuna lente. Aprendone il dettaglio **per indirizzo diretto** — cosa che la SPEC precedente dichiara possibile e voluta, perché il confine di visibilità è di comodità e non di sicurezza — il comando c'è e funziona, e la nasconderebbe al suo titolare. Non si aggiunge alcun controllo per impedirlo: sarebbe un secondo confine sulla rotta, che quella SPEC ha deciso di non alzare. L'operazione è reversibile dal dettaglio del titolare.

### 8. Aggiornamento del catalogo

**Le serie nascoste continuano a essere aggiornate**, come tutte le altre.

- `useCatalogRefresh` opera oggi su **tutte** le serie dello store, senza alcun filtro di visibilità, di lente o di completamento: escludere le nascoste introdurrebbe in quel componente il primo filtro di contenuto della sua storia, e con esso una seconda definizione di «serie che contano» da tenere allineata a quella della home.
- Riportando in elenco una serie lasciata da parte per mesi, i dati sono già freschi: niente attesa, niente «Aggiorna» da premere per scoprire che nel frattempo è uscita una stagione intera.
- **Costo osservabile, dichiarato:** una richiesta TMDB in più per ogni serie nascosta, al più una volta ogni dodici ore per dispositivo (soglia del refresh di sfondo), più le richieste dell'«Aggiorna» manuale. Su una lista privata di due persone sono manciate di chiamate, ampiamente dentro i limiti d'uso del catalogo. Se un giorno la lista delle nascoste crescesse al punto da rendere lento l'aggiornamento, la decisione si riapre; oggi non è il caso.

### 9. Backup

**Il formato resta 2.** Nessun bump di versione: i backup già esportati restano importabili.

- Il campo è **facoltativo** nella validazione: assente significa «non nascosta», esattamente come si è fatto per le serie prive di `visibility`.
- Sono accettati `true`, `false` e l'assenza; l'app in uscita scrive solo `true` oppure niente, perché l'esportazione normalizza ogni serie prima di scriverla, come già fa per la visibilità.
- Il file esportato deve superare la validazione della stessa app **partendo dalla forma reale dei dati in produzione**, dove il campo non esiste. È il difetto già pagato una volta: un test di andata e ritorno che parte da serie che il campo ce l'hanno passa senza provare niente.

### 10. Segni a schermo e testi italiani

- Pulsante della home: «Mostra nascoste» quando è spento, «Nascondi di nuovo» quando è acceso.
- Nella lista, con il filtro acceso, ogni serie nascosta porta un marcatore testuale discreto **«Nascosta»** nella riga del titolo, accanto all'eventuale puntino di serie privata. Senza marcatore non si distinguerebbero le nascoste dalle altre. Nessuna icona nuova, nessun colore fuori dai token di `src/styles/tokens.css`.
- Le serie nascoste, quando sono mostrate, partecipano all'ordinamento corrente come tutte le altre: nessun raggruppamento in fondo, nessuna sezione a parte.
- Dettaglio: comando «Nascondi serie» / «Riporta in elenco»; nota «Questa serie è nascosta dall'elenco.» solo quando lo è.
- Stato vuoto dei filtri, **unico e generico** (modifica del 2026-09-22, decisa a schermo): quando la lista mostrata è vuota ma esistono serie, qualunque sia la causa — lente, nascoste, completate o più cause insieme — compare sempre il titolo «In base ai filtri impostati la lista è vuota», con la descrizione «Usa i pulsanti qui sopra per rivedere le serie nascoste o completate.» Sostituisce i tre stati vuoti specifici, **compresi i due preesistenti** della lente e delle completate. «Nessuna serie ancora» resta distinto: lì la lista è vuota perché non è stata aggiunta alcuna serie, non perché un filtro ne nasconde qualcuna.
- Messaggio di duplicato nascosto: § 6.

### 11. Casi limite

- **Tutto nascosto.** I controlli restano visibili (`hasTrackedShows` guarda anche le nascoste), il pulsante «Mostra nascoste» compare e la lista mostra lo stato vuoto dedicato. La scelta è sempre reversibile.
- **Lente «Solo le mie» e unica serie privata nascosta.** La lista è vuota e compare lo stato vuoto generico dei filtri, con entrambi i pulsanti a portata di mano. Dopo la modifica del 2026-09-22 la home non distingue più quale filtro abbia svuotato la lista: dichiara che sono i filtri e mostra i comandi per disfarli.
- **Serie nascosta con dati non allineati.** La riga compare in lista con «Mostra nascoste» acceso, marcata come oggi; il suo dettaglio però mostra **solo** l'avviso, senza comandi, quindi da lì non si può riportarla in elenco. Limite accettato e non aggirato: il dettaglio di una serie disallineata è deliberatamente privo di comandi, la serie non è perduta, e per riavere il comando basta un «Aggiorna» che riallinei il catalogo.
- **Serie nascosta mentre l'altra persona ne ha il dettaglio aperto.** Il dettaglio è alimentato da `subscribeToShow`: la nota compare, il comando si inverte, nessuna espulsione e nessun messaggio.
- **Serie nascosta aperta per indirizzo diretto.** Si vede normalmente: nascondere è un filtro della lista, non un confine di accesso.
- **Nascondere una serie già nascosta** (due dispositivi, stesso comando): l'operazione è idempotente, non produce un rifiuto e non incrementa niente.

### 12. Invarianti

- La posizione di visione resta **unica e condivisa per record**; nascondere non la tocca.
- **`ProgressEvent` non cambia forma**, `progressAdvance.ts`, `progressUndo.ts`, `progressReset.ts`, `showSorting.ts` e `watchPosition.ts` **non cambiano**.
- `firestore.rules`, lo schema Dexie e la versione del formato di backup **non cambiano**.
- Avanzamento, undo, conflitto di revisione, conteggio arretrati, locandina, cinque ordinamenti, lente «Tutto / Solo le mie», filtro delle completate, cambio piattaforma, cambio visibilità, azzeramento e rimozione si comportano esattamente come oggi.
- `src/domain/` resta puro; Dexie e Firestore restano confinati in `src/persistence/`; le viste continuano a non parlare con la persistenza.

## Vincoli

- Nessuna dipendenza nuova, nessun framework CSS, nessuno store globale, nessuna icona nuova, nessun colore fuori da `src/styles/tokens.css`.
- Un solo campo nuovo su `TrackedShow`; nessun campo nuovo su `ProgressEvent`.
- Nessuna modifica a `firestore.rules`, allo schema Dexie, alla versione del formato di backup, al layout della riga dei controlli.
- Nessuna migrazione e nessuno script sui dati di produzione: l'app è pubblicata e in uso reale con dati veri.
- Le due implementazioni dello store restano allineate: stesso esito, stessi messaggi, stessa semantica; su Firestore la scrittura **rilegge dentro `runTransaction`**, come già fa `changeVisibility`.
- `useTrackedShows` riceve un quarto `Ref`, **senza valore predefinito**. Non si aggregano i quattro parametri in un oggetto: costerebbe la riscrittura dei test esistenti senza guadagno per questa feature. Se un giorno arrivasse una quinta lente, l'aggregazione va rivista.
- Il messaggio del duplicato nascosto segue il precedente del progetto — costante locale nel file che la usa — come già avviene per `DUPLICATE_SHOW_REASON`. La duplicazione fra i tre file è preesistente e resta fuori dal perimetro di questa modifica.
- Testi utente in italiano, identificatori in inglese; indentazione a 4 spazi; import da `src/` con l'alias `@/`; tipi `readonly` in profondità; **il codice non si commenta**.
- Controlli touch di almeno 46 px (`var(--tap)`), stato dei comandi leggibile dagli assistivi.

## Fuori scope

- Un cestino, un archivio con schermata propria, o un elenco separato delle nascoste.
- Nascondere per persona: il campo è condiviso, come la posizione.
- Nascondere automaticamente le serie completate, concluse o inattive da N mesi.
- Ordinamento, raggruppamento o sezione dedicata per le serie nascoste.
- Esclusione delle nascoste dall'aggiornamento del catalogo (decisione motivata al § 8).
- Bump del formato di backup, conversione di file, migrazione dei dati esistenti.
- Notifiche o segnalazioni all'altra persona quando una serie viene nascosta.
- Regole Firestore per documento o query per stato.

## Definition of done

Criteri verificabili, ognuno coperto da almeno un test.

1. Un record privo del campo è trattato come **in elenco**; i costruttori del dominio non lasciano mai `hidden: false`, e «in elenco» ha una sola rappresentazione.
2. Il comando del dettaglio nasconde la serie e il comando inverso la riporta in elenco; la nota «Questa serie è nascosta dall'elenco.» compare **se e solo se** la serie è nascosta.
3. Nascondere e riportare in elenco aggiornano `updatedAt` e lasciano invariati posizione, `lastViewedAt`, `progressRevision`, `ProgressEvent`, visibilità, piattaforma, stagioni ed episodi — in **entrambe** le implementazioni dello store.
4. Nascondere una serie condivisa la toglie dall'elenco di entrambi: il dato sta sul record, non in `localStorage`.
5. Il riepilogo «N nuove puntate su M serie» è calcolato sulle serie **attive**, e non cambia né al variare della lente né al variare di «Mostra nascoste».
6. La preferenza «Mostra nascoste» è ricordata per dispositivo, vale **spento** al primo avvio e non scrive nulla nei dati condivisi.
7. Con «Mostra nascoste» acceso le serie nascoste ricompaiono nell'ordinamento corrente, marcate con «Nascosta»; spento, non compaiono.
8. Il pulsante «Mostra nascoste» compare **solo** quando esiste almeno una serie nascosta dentro la lente corrente, e cambia etichetta in «Nascondi di nuovo» quando è acceso.
9. `completedCount` è calcolato **dopo** il filtro delle nascoste, e il pulsante «Mostra completate» compare solo quando è maggiore di zero.
10. Una serie nascosta e completata ricompare solo con **entrambi** i filtri accesi, ed è raggiungibile in due passi partendo da entrambi spenti (§ 5).
11. Quando i filtri svuotano la lista — per la lente, per le nascoste, per le completate o per più cause insieme — la home mostra l'unico stato vuoto generico «In base ai filtri impostati la lista è vuota», i controlli restano visibili e **tutti** i pulsanti che possono risolvere la situazione restano premibili. Con un messaggio che non nomina più la causa, quei pulsanti sono l'unica via d'uscita: vanno coperti da test in ogni combinazione, non solo per le nascoste. «Nessuna serie ancora» resta uno stato distinto.
12. In fase di aggiunta una serie nascosta blocca comunque il duplicato, con il messaggio dedicato che dice che è nascosta e come riportarla; una serie in elenco produce il messaggio di oggi. Vale sia per il controllo in ricerca sia per quello dello store, in entrambe le implementazioni.
13. Il backup resta al **formato 2**: una serie priva del campo si rilegge come in elenco, una nascosta si rilegge nascosta, e il file esportato partendo dalla forma reale dei dati in produzione supera la validazione dell'app stessa.
14. L'aggiornamento del catalogo aggiorna anche le serie nascoste.
15. Nascondere è indipendente da visibilità e azzeramento: cambiare visibilità non cambia lo stato di nascosta, azzerare una serie nascosta non la riporta in elenco, nascondere non tocca visibilità né posizione.
16. Comportamento preesistente invariato: avanzamento, undo, conflitto di revisione, cinque ordinamenti, lente, filtro delle completate, cambio piattaforma, rimozione, forma di `ProgressEvent`; `firestore.rules`, schema Dexie e versione del formato di backup non modificati.
17. Verificato in revisione, non con un test: la riga dei controlli non è stata riorganizzata — nessun contenitore nuovo, nessun menu a tendina, nessuna riga dedicata — e il terzo pulsante si limita ad andare a capo quando manca spazio.

## Da decidere

Nessun punto aperto. Le quattro decisioni prese dall'utente sono recepite come vincoli (§ 1, § 5, § 6, § 9), e le scelte lasciate alla stesura sono state chiuse qui, tutte motivate nel testo:

- forma del dato: booleano facoltativo, assenza = in elenco (§ 1);
- contratto dello store: un comando nuovo con esito discriminato, che aggiorna `updatedAt` e **non** tocca `progressRevision` (§ 7);
- aggiornamento del catalogo: nascoste **incluse**, con il costo dichiarato (§ 8);
- nessun dialogo di conferma sul comando, perché l'operazione è reversibile (§ 2);
- serie nascosta e disallineata: comando non raggiungibile dal dettaglio, limite accettato e recuperabile con «Aggiorna» (§ 11);
- layout della riga dei controlli: il pulsante va a capo, il layout non si tocca (§ 3).

## Esempio

Istanza concreta, solo illustrativa.

```ts
// src/domain/showListing.ts — stesso stampo di showVisibility.ts:
// un tipo discriminato per i calcoli, due costruttori come unico punto di scrittura.
export type ShowListing = 'listed' | 'hidden';

// Campo assente = in elenco: nessuna migrazione sui dati gia in produzione.
export function resolveShowListing(show: TrackedShow): ShowListing {
    return show.hidden === true ? 'hidden' : 'listed';
}

export function isHiddenShow(show: TrackedShow): boolean {
    return resolveShowListing(show) === 'hidden';
}

export function withHiddenShow(show: TrackedShow): TrackedShow {
    return { ...show, hidden: true };
}

// Si scrive undefined, mai false: "in elenco" ha una sola rappresentazione.
// Su Firestore la set piena con ignoreUndefinedProperties toglie il campo dal documento.
export function withListedShow(show: TrackedShow): TrackedShow {
    return { ...show, hidden: undefined };
}

// Contratto dello store: stessa forma di changeVisibility, niente parametro booleano.
export type ChangeListingOutcome =
    | { readonly outcome: 'changed' }
    | { readonly outcome: 'rejected'; readonly reason: string };

changeListing(id: string, targetListing: ShowListing, updatedAt: string): Promise<ChangeListingOutcome>;
```

```ts
// useTrackedShows: i quattro insiemi del § 4, ciascuno usato dove la SPEC dice.
const visibleEntries = /* filtro di visibilita per profilo, nascoste comprese */;
const activeEntries = computed(() => visibleEntries.value.filter((entry) => !isHiddenShow(entry.show)));
const scopedEntries = /* lente Tutto / Solo le mie, nascoste comprese */;
const listedEntries = computed(() =>
    scopedEntries.value.filter((entry) => showHidden.value || !isHiddenShow(entry.show)));

const summaryText = computed(() => buildSummaryText(activeEntries.value));      // attive
const trackedProviderShowIds = /* visibili, nascoste comprese: blocca il duplicato */;
const hiddenCount = computed(() => scopedEntries.value.filter((e) => isHiddenShow(e.show)).length);
const completedCount = computed(() => listedEntries.value.filter(isCompletedEntry).length);
```
