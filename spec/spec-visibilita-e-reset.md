# SPEC — Visibilità delle serie e azzeramento del tracciamento

**Obiettivo:** permettere che una serie seguita sia condivisa fra Fabio e Irene oppure privata di una sola persona, dare alla home una lente «Tutto / Solo le mie» e consentire dal dettaglio di azzerare il tracciamento scegliendo da che stagione e puntata ripartire.

## Contesto

Fatti verificati leggendo il codice, non ipotesi.

**Punti del codice interessati**

- `src/domain/trackedShow.ts` — `TrackedShow` e `ProgressEvent`, `readonly` in profondità; `ProgressOutcome` discriminato (`applied` / `rejected`).
- `src/domain/watchPosition.ts` — `calculateWatchPosition` produce `firstUnwatchedEpisode`, `nextUnwatchedEpisode`, `backlogCount`, `isCaughtUp`, `isCompleted`; lancia un'eccezione sulla posizione orfana.
- `src/domain/progressAdvance.ts` e `src/domain/progressUndo.ts` — le due sole operazioni che oggi spostano la posizione; l'undo cerca la conferma attiva con `confirmedEpisodeId === show.lastWatchedEpisodeId` e `undoneAt === undefined`.
- `src/domain/episodeOrder.ts` — `buildEpisodeSequence` esclude gli speciali (`seasonNumber = 0`) e ordina per `(seasonNumber, episodeNumber)`.
- `src/domain/showSorting.ts` — `lastActivityAt(show)` vale `lastViewedAt` se successivo ad `addedAt`, altrimenti `addedAt`; `added` ordina per `addedAt` decrescente.
- `src/persistence/trackedShowStore.ts` — contratto a sottoscrizione con comandi a esito discriminato; non nomina Dexie né Firestore.
- `src/persistence/localTrackedShowStore.ts` — duplicato cercato con `where('providerShowId').equals(...)`; avanzamento e undo in una sola transazione che rilegge la serie al suo interno; `removeShow` cancella gli eventi della serie con `progressEvents.where('trackedShowId').equals(id).delete()`.
- `src/persistence/firestoreTrackedShowStore.ts` — duplicato cercato con `where('providerShowId','==',…)` più `limit(1)`; `initializeFirestore` con `ignoreUndefinedProperties: true`; `removeShow` cancella la sottocollezione degli eventi a lotti con `writeBatch`.
- `src/persistence/tvTrackerDatabase.ts` — schema Dexie versione 1, indici `id, providerShowId` su `trackedShows`.
- `src/composables/useTrackedShows.ts` — da `rawShows` derivano `listItems` (ordinamento → filtro completate → mappatura), `summaryText`, `trackedProviderShowIds`, `completedCount`, `hasTrackedShows`.
- `src/composables/useShowDetail.ts` — `canUndo` è derivato da `show.lastViewedAt !== undefined`; il composable riceve solo la serie, **non** i suoi `ProgressEvent`.
- `src/composables/useAddShow.ts` — `InitialPositionChoice` (`notStarted` / `watchedThrough`), `publishedEpisodes` filtrate con `isAlreadyPublished`, `buildTrackedShow` costruisce il record nuovo.
- `src/views/HomeView.vue` — `CompletedVisibilityToggle` compare solo con `completedCount > 0`; i controlli sono dentro `v-if="hasAnyTrackedShow"`.
- `src/backup/backupFormat.ts` e `backupValidation.ts` — `BACKUP_FORMAT_VERSION = 1`, `requireExactFormatVersion` rifiuta qualunque altra versione.
- `firestore.rules` — ogni membro dell'household legge e scrive tutta la collezione `trackedShows`; nessuna regola per documento.

**Pattern e meccanismi esistenti da riusare**

- Preferenza locale del dispositivo in `localStorage` protetta da `runIgnoringStorageFailure`: `useSortPreference.ts`, `useCompletedVisibilityPreference.ts`.
- Esito discriminato con `reason` italiana rivolta all'utente per i rifiuti legittimi di dominio; eccezioni solo per errori di programmazione.
- `ConfirmDialog.vue` per ogni operazione che modifica lo stato condiviso, con variante rossa (`danger`) per le operazioni definitive.
- La cancellazione degli eventi di una serie, già scritta e collaudata in `removeShow` di **entrambe** le implementazioni.
- `InitialPositionPicker.vue` e `InitialPositionChoice` per la scelta «Da iniziare / vista fino a SxE».
- Token colore `--fabio` (`#176c86`) e `--irene` (`#a04c7c`) già presenti in `src/styles/tokens.css`.
- Profili cablati in `src/auth/profiles.ts` (`fabio`, `irene`); identità attiva da `session.state`.

**File coinvolti** — dominio, persistenza (entrambe le implementazioni), backup, composable, componenti di `show/` e `add/`, `HomeView.vue`, `ShowDetailView.vue`. Nessuna cartella nuova.

## Comportamento atteso

### 1. Stati della visibilità

Una serie seguita è **condivisa** («Per tutti») oppure **privata** di una sola persona («Solo per me»).

- Il dato porta due campi piatti: `visibility: 'shared' | 'private'` e `privateFor: string | undefined`, quest'ultimo valorizzato **solo** quando la visibilità è `private` e contenente l'id di profilo (`fabio` / `irene`).
- L'invariante «`privateFor` valorizzato se e solo se la serie è privata» è garantito nel punto che costruisce il valore, non sperato: una funzione di dominio ricava dai due campi un **tipo discriminato** (condivisa / privata di un profilo) e i calcoli passano da lì, così il compilatore obbliga a gestire entrambi i casi.
- **Dato esistente senza il campo: serie condivisa.** Nessuno script di migrazione sui dati di produzione; il campo si materializza alla prima scrittura del documento.
- La visibilità **si sceglie all'inserimento**, nel passo della posizione iniziale, con default **«Per tutti»**, e si cambia in qualunque momento dal dettaglio.

### 2. Lente della home

Accanto al pulsante «Mostra completate» compare una lente a due posizioni.

- **«Tutto»** — le mie serie private **e** quelle condivise.
- **«Solo le mie»** — **solo le mie serie private**. Non «tutto ciò che ho inserito io»: la paternità non conta da nessuna parte in questa feature.
- Le serie private dell'altra persona non compaiono in nessuna delle due posizioni della lente.
- La lente persiste in `localStorage`, per dispositivo, con default «Tutto», come le altre preferenze locali; non modifica né sincronizza i dati condivisi.
- La lente resta visibile finché esiste almeno una serie visibile, anche quando svuota la lista: altrimenti la scelta non sarebbe reversibile.

Ordine di calcolo, che non è un dettaglio implementativo ma il comportamento richiesto:

| Valore | Calcolato su |
| --- | --- |
| Riepilogo «N nuove puntate su M serie» | tutto il **visibile** (mie private + condivise), indipendentemente dalla lente |
| Blocco dei duplicati in ricerca | tutto il **visibile** |
| Presenza dei controlli (`hasTrackedShows`) | tutto il **visibile** |
| Conteggio delle completate | **dopo** la lente |
| Elenco mostrato | dopo la lente e dopo il filtro delle completate |

Il riepilogo e il conteggio delle completate sono calcolati su insiemi diversi **di proposito**: il riepilogo è una statistica di ciò che resta da guardare, mentre il conteggio delle completate decide se il comando «Mostra completate» compare. Un pulsante che non rivela nulla, perché le serie completate sono fuori dalla lente, sarebbe una bugia.

> **Modifica del 2026-09-22, decisa a schermo.** Il conteggio **non compare più nell'etichetta** del pulsante, che ora è «Mostra completate» / «Nascondi completate». Il motivo è di forma: col numero il pulsante cambiava larghezza a ogni serie completata in più, e non permetteva di affiancarlo alla lente su una riga sola. Il conteggio resta e continua a decidere se il pulsante compare: la regola di calcolarlo **dopo** la lente vale ancora, per la metà di ragione che sopravvive.

### 3. Unicità: niente più una serie per `providerShowId`

La chiave di unicità diventa **`providerShowId` + destinatario della visibilità**: al più una scheda condivisa per serie, e al più una scheda privata per ciascuna persona.

- Se una serie è privata di Fabio, Irene può aggiungere la stessa serie per sé, come **record distinto** con la propria posizione.
- Il blocco in ricerca considera solo i record che riguardano chi sta guardando (le proprie private più le condivise): la serie privata dell'altra persona non blocca nulla.
- Lo store rifiuta l'inserimento di una seconda scheda **con lo stesso destinatario**: «Questa serie è già stata aggiunta.»
- **Conseguenza accettata:** una scheda condivisa e una scheda privata della stessa serie possono coesistere (per esempio se Irene condivide la serie che aveva reso privata mentre Fabio ne ha già una sua). In quel caso in home compaiono due righe con lo stesso titolo, con posizioni indipendenti. È il prezzo della chiave scelta, non un difetto.
- **Le due schede si accettano senza avviso.** Nessun messaggio in fase di aggiunta, nessuna richiesta di conferma, nessuna segnalazione a posteriori: le due righe sono già distinguibili in lista, perché la scheda privata porta il puntino e quella condivisa no.
- Il cambio di visibilità è rifiutato quando produrrebbe una collisione:
  - verso «Per tutti» con una condivisa già presente → «Questa serie è già condivisa in una scheda a parte: rimuovine una prima di renderla condivisa.»
  - verso «Solo per me» con una mia privata già presente → «Hai già una scheda solo tua di questa serie: rimuovila prima di rendere privata anche questa.»

### 4. Cambio di visibilità

- Passare a «Solo per me» una serie condivisa **è permesso senza avviso particolare**, anche se l'ha aggiunta l'altra persona: copre il caso in cui Irene vuole continuare da sola una serie che Fabio ha abbandonato.
- **Nessuno sdoppiamento.** Il record resta uno solo: quando Irene rende privata una serie condivisa, quella serie e i progressi comuni diventano suoi e Fabio la perde interamente. Se la rivuole, la riaggiunge da zero come serie sua scegliendo la puntata di partenza.
- **Il ritorno è simmetrico e senza perdita.** Rimettendo «Per tutti» una serie resa privata, la stessa posizione, la stessa revisione e lo stesso storico tornano visibili a entrambi. Il record conserva tutto mentre cambia visibilità.
- Reset e cambio di visibilità sono **indipendenti**. Passando a «Per tutti» l'app mostra un **suggerimento non vincolante** che ricorda la possibilità di ripartire da una puntata scelta: nessun obbligo, nessun dialogo incatenato.

### 5. Azzeramento del tracciamento

**Azzerare il tracciamento riporta la serie allo stato di una serie appena inserita**, con la posizione scelta dall'utente: l'equivalente di una rimozione seguita da un reinserimento, senza però passare da catalogo, piattaforma e visibilità. **Non è annullabile.**

Dal dettaglio: comando «Azzera tracciamento» → scelta di stagione e puntata con il picker esistente → **dialogo di conferma** che dichiara che l'operazione non si può annullare e, sulle serie condivise, che vale per entrambi. Solo dopo la conferma, in **una sola transazione**:

| Cosa succede | Valore dopo il reset |
| --- | --- |
| `lastWatchedEpisodeId` | la posizione scelta, **assente** per «non ancora iniziata» |
| `ProgressEvent` della serie | **cancellati**, non marcati: si riusa la cancellazione già eseguita da «Rimuovi dalla lista» |
| Evento di reset | **nessuno**: non viene scritto niente |
| `lastViewedAt` | **assente**, come in una serie appena inserita |
| `addedAt` | **l'istante del reset** |
| `updatedAt` | l'istante del reset |
| `progressRevision` | **incrementata**, non riportata a zero |
| Identificativo, stagioni ed episodi, `catalogUpdatedAt`, piattaforma selezionata, visibilità | **invariati** |

Per la sincronizzazione fra i due dispositivi basta il documento della serie, che porta posizione e revisione: uno storico visibile in interfaccia non esiste per scelta di progetto, quindi gli eventi non servono a niente dopo l'azzeramento.

**Le tre deroghe alla metafora «come appena inserita»**, ciascuna con la sua ragione:

1. **`progressRevision` si incrementa** invece di ripartire da zero, perché è il gettone di controllo del conflitto fra i due dispositivi: deve solo crescere, altrimenti smette di fare il suo mestiere. Non fa parte dell'aspetto «appena inserita».
2. **L'identificativo non cambia.** Una rimozione vera ne creerebbe uno nuovo, e l'indirizzo della pagina di dettaglio — quella aperta in quel momento da chi resetta, e quella eventualmente aperta sull'altro telefono — diventerebbe morto.
3. **Non si ricarica il catalogo e non si riscelgono piattaforma e visibilità.** Si azzera il tracciamento, non si riaggiunge la serie. Sulla visibilità vale anche l'indipendenza dichiarata al § 4.

**`addedAt` cambia significato, e questo è voluto.** Non vuol più dire «quando la serie è entrata in lista» ma **«quando è cominciato il tracciamento attuale»**. Conseguenza cercata: dopo un reset la serie sta in cima **sia** con «Ultima attività» **sia** con «Inserite di recente», perché il tracciamento è appena ricominciato.

**Niente da annullare.** Cancellati gli eventi e azzerato `lastViewedAt`, dopo un reset «Annulla ultima conferma» non è disponibile, e torna disponibile alla prima conferma «Vista» successiva. Non serve alcun campo nuovo su `TrackedShow`: la disponibilità del comando resta derivata da `lastViewedAt`, e il dettaglio continua a **non** ricevere i `ProgressEvent`. Il confine dati non si allarga.

> **Nota sulla decisione 3.** La regola «dopo un reset non c'è niente da annullare» è stata riaperta in corso di specifica e poi **riconfermata nella sua forma originale**. Rendere annullabile l'azzeramento costava un'unione discriminata su `ProgressEvent`, che si sarebbe propagata a entrambe le implementazioni dello store e alla validazione del backup, e comprava poco: **un reset sbagliato si corregge con un altro reset**, perché la posizione è recuperabile per intero scegliendola di nuovo.

Scelta del punto di ripartenza:

- si riusa il picker esistente, con **entrambe** le voci: «non ancora iniziata» e «vista fino a SxE»;
- sono selezionabili solo le puntate **già uscite** e non gli speciali, come all'inserimento; una puntata futura è rifiutata: «Non è possibile ripartire da una puntata non ancora uscita.»
- il reset è rifiutato quando **la posizione richiesta coincide con quella corrente**: l'azzeramento è definitivo e non ha senso eseguirlo per restare dove si è già. «Non c'è niente da azzerare per questa serie.»

Chi può azzerare:

- una serie privata, il suo titolare;
- una serie condivisa, **chiunque dei due**, con il dialogo di conferma che dichiara che l'azzeramento vale per entrambi, stesso pattern di «Rimuovi dalla lista».

### 6. Confine di comodità, non di sicurezza — decisione consapevole

Il filtro di visibilità vive **nel client**. `firestore.rules` resta com'è: ogni membro dell'household continua a leggere e scrivere tutta la collezione. Nessuna query doppia, nessuna regola per documento, nessun campo usato come vincolo di accesso.

È una scelta, non una dimenticanza, e va letta così: l'app è privata, i due utenti sono una coppia che condivide un household, e «Solo per me» serve a non ingombrare la lista dell'altro — non a difendersi da lui. Alzare il confine a livello di regole costerebbe query separate per destinatario, regole per documento e un percorso di migrazione sui dati esistenti, per proteggere da un avversario che qui non esiste. Coerente con questa scelta: **aprendo per indirizzo diretto il dettaglio di una serie privata dell'altra persona, la serie si vede normalmente**; nessun secondo confine sulla rotta, nessun «Serie non trovata» per una serie che esiste.

### 7. Backup

Il formato passa a **`formatVersion: 2`**, e cambia **solo** per la visibilità.

- I campi nuovi sono **obbligatori** in ogni serie esportata: `visibility` sempre presente e valido, `privateFor` presente **se e solo se** la serie è privata.
- Gli eventi **non cambiano forma**: `ProgressEvent` resta quello di oggi e la puntata confermata resta obbligatoria su tutti.
- Un file in **versione 1 viene rifiutato** con un messaggio italiano che ne nomina la versione: «Questo backup è in formato versione 1 e non è più supportato: questa versione dell'app legge solo i backup in formato 2.» Non esistono backup da salvaguardare.
- **Conseguenza accettata dell'azzeramento:** gli eventi precedenti a un reset non esistono più, quindi non compaiono nei backup successivi. Va bene così: uno storico visibile in interfaccia non esiste per scelta di progetto.

### 8. Segni a schermo e testi italiani

- **In lista si marcano solo le serie private**, lasciando pulite le condivise: un **puntino nel colore personale di chi guarda** (`--fabio` / `--irene`), con testo alternativo accessibile «Solo per te». Nella lista di una persona una serie privata è sempre sua, quindi il segno non dice di chi è. Nessuna icona nuova in `AppIcon.vue`, nessun colore fuori dai token.
- Lente: «Tutto» e «Solo le mie», con lo stato corrente dichiarato agli assistivi.
- Dettaglio, comando di visibilità: intestazione «Chi vede questa serie», scelte «Per tutti» e «Solo per me».
- Suggerimento dopo il passaggio a «Per tutti»: «Ora “{titolo}” è visibile a entrambi. Se volete ripartire da una puntata vista insieme, usate «Azzera tracciamento».»
- Comando: «Azzera tracciamento». Dialogo di conferma, **nella variante rossa già usata per la rimozione**, perché l'operazione è definitiva:
  - titolo «Azzerare il tracciamento?»;
  - serie condivisa: «“{titolo}” è condivisa: l'azzeramento vale per entrambi. Il tracciamento riparte da {punto} e le conferme registrate finora vengono cancellate. L'operazione non si può annullare.»;
  - serie privata: cade la prima frase;
  - `{punto}` è «S2E4 · {titolo puntata}» oppure «l'inizio della serie»;
  - conferma: «Azzera tracciamento».
- Stato vuoto della lente: titolo «Nessuna serie solo tua», descrizione «Con la lente «Solo le mie» vedi solo le serie private. Torna a «Tutto» per rivedere anche quelle condivise.»

### 9. Casi limite

- **Serie resa condivisa o privata, oppure azzerata, mentre l'altra persona ha il dettaglio aperto.** Il dettaglio è alimentato da `subscribeToShow` e riceve l'aggiornamento: la schermata resta aperta e funzionante, con la posizione nuova, senza espulsioni né messaggi. L'identificativo non cambia mai, quindi l'indirizzo aperto resta valido anche dopo un azzeramento.
- **Lente che svuota la lista.** Stato vuoto dedicato (§ 8), controlli sempre visibili. Distinto dallo stato vuoto «Nessuna serie ancora», che resta per il caso in cui non esiste alcuna serie visibile.
- **Reset su serie mai iniziata.** Consentito verso una puntata; rifiutato quando la scelta è «non ancora iniziata», perché la posizione richiesta coincide con quella corrente.
- **Reset su serie con dati non allineati.** Il comando non è disponibile: il dettaglio di una serie disallineata mostra già il solo avviso, senza comandi. Invariato rispetto a oggi.
- **Reset su serie in pari o completata.** Consentito: è il caso «Fabio rivede una serie che ha finito». Azzerando la posizione la serie ricompare nella lista, perché «completata» è uno stato derivato.
- **Speciali.** Fuori dal picker e fuori dal reset, come da regola di dominio già in vigore.

### 10. Invarianti

- La posizione di visione resta **unica e condivisa per record**: nessun progresso separato per persona, nemmeno sulle serie private.
- **`ProgressEvent` non cambia forma** e `progressUndo` non cambia comportamento: l'azzeramento non introduce un tipo di evento nuovo, non marca eventi e non tocca l'undo.
- **`addedAt` vuol dire «inizio del tracciamento attuale»**, non più «ingresso in lista»: è l'unico significato che cambia, e cambia di proposito.
- Avanzamento, undo di un avanzamento, conflitto di revisione, conteggio arretrati, locandina, cinque ordinamenti, filtro delle completate, cambio piattaforma e rimozione si comportano esattamente come oggi.
- `src/domain/` resta puro; Dexie e Firestore restano confinati in `src/persistence/`; le viste continuano a non parlare con la persistenza.

## Vincoli

- Nessuna dipendenza nuova, nessun framework CSS, nessuno store globale.
- Nessun colore fuori da `src/styles/tokens.css`; nessuna icona nuova.
- `src/domain/` senza import da Vue, da API del browser, da Dexie o da Firebase.
- Dexie e Firestore **solo** in `src/persistence/`; entrambe le implementazioni del contratto restano allineate, e il costo del cambiamento sul confine dati va misurato e dichiarato.
- Nessun campo nuovo su `TrackedShow` oltre ai due della visibilità; `canUndo` resta derivato da `lastViewedAt` e il dettaglio continua a non ricevere i `ProgressEvent`.
- Nessuna modifica a `firestore.rules`, allo schema Dexie o alla forma di `ProgressEvent`.
- Nessuna migrazione dei dati di produzione.
- Testi utente in italiano, identificatori in inglese; indentazione a 4 spazi; import da `src/` con l'alias `@/`; tipi `readonly` in profondità; il codice non si commenta.
- Controlli touch di almeno 46 px (`--tap`), stato dei comandi leggibile dagli assistivi.

## Fuori scope

- Profili separati o progressi separati per persona: la posizione resta unica per record.
- Visibilità applicata a livello di regole Firestore o di query per destinatario.
- Una schermata di storico dei reset o degli eventi.
- Annullamento dell'azzeramento, conservazione degli eventi precedenti, cestino o ripristino: un reset sbagliato si corregge con un altro reset.
- Migrazione o riscrittura dei dati già presenti in produzione.
- Lettura di backup in formato 1, o conversione da 1 a 2.
- Una terza persona, inviti, gruppi o condivisione parziale.
- Notifiche di alcun genere quando una serie diventa condivisa o viene azzerata.

## Definition of done

Criteri verificabili, ognuno coperto da almeno un test.

1. Una serie aggiunta con «Solo per me» nasce privata con `privateFor` uguale al profilo attivo; con «Per tutti» nasce condivisa e senza `privateFor`.
2. Un record privo del campo di visibilità è trattato come condiviso.
3. La lente «Tutto» mostra le mie private e le condivise; «Solo le mie» mostra solo le mie private; le private dell'altra persona non compaiono in nessuno dei due casi.
4. La lente è ricordata per dispositivo e vale «Tutto» al primo avvio.
5. Il riepilogo «N nuove puntate su M serie» è calcolato su tutto il visibile, indipendentemente dalla lente.
6. Il conteggio delle completate è calcolato dopo la lente, e il comando «Mostra completate» compare solo quando quel conteggio è maggiore di zero. Il conteggio non compare nell'etichetta del pulsante.
7. Con la lente «Solo le mie» e nessuna serie privata, la lista mostra lo stato vuoto dedicato e i controlli restano visibili.
8. La serie privata dell'altra persona non blocca l'inserimento della stessa serie; una condivisa o una mia privata lo bloccano.
9. Lo store rifiuta la seconda scheda con lo stesso destinatario per lo stesso `providerShowId`, in entrambe le implementazioni, e riconosce come condivisi i documenti privi del campo.
10. Il passaggio a «Per tutti» mostra il suggerimento non vincolante e non esegue alcun reset.
11. Rendere privata una serie condivisa è permesso, la toglie dalla lista dell'altra persona e conserva posizione, revisione e storico.
12. Rimettendo «Per tutti» una serie resa privata, entrambi ritrovano la stessa posizione, la stessa revisione e lo stesso storico.
13. Il reset porta la posizione alla scelta, azzera `lastViewedAt`, porta `addedAt` all'istante del reset, incrementa `progressRevision` e non scrive alcun evento.
14. Dopo un reset non resta alcun `ProgressEvent` per quella serie e «Annulla ultima conferma» non è disponibile; il comando torna disponibile dopo la prima conferma «Vista» successiva.
15. Il reset lascia invariati identificativo, stagioni ed episodi, `catalogUpdatedAt`, piattaforma selezionata e visibilità.
16. Il reset chiede sempre conferma, dichiara che l'operazione non si può annullare e, sulle serie condivise, che vale per entrambi; annullando il dialogo nulla cambia.
17. Il picker del reset offre «non ancora iniziata» e le sole puntate già uscite, speciali esclusi; una puntata futura è rifiutata con messaggio italiano.
18. Il reset è rifiutato quando la posizione richiesta coincide con quella corrente, con messaggio esplicito.
19. Dopo un reset la serie sta in cima sia con «Ultima attività» sia con «Inserite di recente».
20. Il backup esporta `formatVersion: 2` con visibilità in ogni serie e `privateFor` presente se e solo se privata; un file in versione 1 è rifiutato con un messaggio che ne nomina la versione.
21. Le serie private portano in lista il puntino nel colore del profilo attivo con testo alternativo «Solo per te»; le condivise non portano alcun segno.
22. Aprendo per indirizzo diretto il dettaglio di una serie privata dell'altra persona, la serie si vede normalmente.
23. Comportamento preesistente invariato: forma di `ProgressEvent`, avanzamento, undo, conflitto di revisione, cinque ordinamenti, filtro delle completate, cambio piattaforma, rimozione; `firestore.rules` non modificato.

## Da decidere

Nessun punto aperto. Le domande sollevate durante la stesura sono state chiuse dall'utente e sono recepite qui come vincoli:

- l'azzeramento **non è annullabile** e riporta la serie allo stato di una appena inserita (§ 5), con le tre deroghe dichiarate e il nuovo significato di `addedAt`;
- la decisione «dopo un reset non c'è niente da annullare» è stata riaperta e **riconfermata nella forma originale** (§ 5);
- la visibilità si sceglie **anche all'inserimento**, con default «Per tutti» (§ 1);
- il reset sulla posizione già corrente **è rifiutato** (§ 5);
- le due schede della stessa serie **si accettano senza avviso** (§ 3).

## Esempio

Istanza concreta, solo illustrativa.

```ts
// Due campi piatti sul dato, un tipo discriminato per i calcoli.
export type ShowAudience =
    | { readonly kind: 'shared' }
    | { readonly kind: 'private'; readonly profileId: string };

// Campo assente = serie condivisa: nessuna migrazione sui dati esistenti.
export function resolveShowAudience(show: TrackedShow): ShowAudience {
    if (show.visibility !== 'private' || show.privateFor === undefined) {
        return { kind: 'shared' };
    }
    return { kind: 'private', profileId: show.privateFor };
}

export function matchesScope(show: TrackedShow, viewerProfileId: string, scope: ShowScope): boolean {
    const audience = resolveShowAudience(show);
    if (audience.kind === 'private' && audience.profileId !== viewerProfileId) {
        return false;
    }
    return scope === 'all' || audience.kind === 'private';
}

// Il reset non produce eventi: restituisce solo la serie riportata
// allo stato di una appena inserita, con la posizione scelta.
// Gli eventi li cancella lo store, riusando cio che gia fa removeShow.
export type ResetProgressOutcome =
    | { readonly outcome: 'applied'; readonly show: TrackedShow }
    | { readonly outcome: 'rejected'; readonly reason: string };
```
