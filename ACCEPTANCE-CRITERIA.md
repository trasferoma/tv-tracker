# Matrice criterio → test (Fase 19)

Riferimento: `spec/tv-tracker-spec.md` § *Criteri di accettazione iniziali*, `spec/implementation-tv-tracker.md`
§ *Scostamenti dalla SPEC già decisi dall'utente*.

Perché un documento e non un test eseguibile: la matrice associa un **testo in prosa** (il criterio) a un
**nome di test**. Renderla eseguibile vorrebbe dire far leggere a un test il codice sorgente degli altri file
di test e confrontare stringhe letterali di `describe`/`it`: un controllo che si rompe a ogni rinomina
innocua, senza verificare alcun comportamento reale. La garanzia che conta — che i test elencati esistano
e restino verdi — è già data da `npm test` e dal numero di test atteso; questo file è l'indice di
tracciabilità che spiega *quale* test dimostra *quale* criterio, aggiornato a mano quando cambia la mappa.

Ogni scostamento dalla lettera della SPEC, deciso con l'utente, è segnalato dove modifica cosa viene
verificato.

## 1 — Ricerca disambiguata, aggiunta solo da catalogo

- `src/components/add/AddShowDialog.spec.ts` — describe `AddShowDialog — criterio 1, niente aggiunta come
  testo libero`, test `digitare un titolo e premere Invio non aggiunge nulla: serve scegliere un risultato`.
- `src/composables/useAddShow.spec.ts` — describe `useAddShow — criterio 1, niente aggiunta come testo
  libero`, test `digitare un titolo non seleziona alcuna serie: serve scegliere un risultato` e
  `i risultati portano titolo italiano, titolo originale e anno per disambiguare`.
- `src/catalog/sampleCatalogSource.spec.ts` — test `disambigua i risultati per anno e titolo originale`.
- **Scostamento verificato**: `src/catalog/sampleCatalogSource.spec.ts` — test
  `mostra nei risultati di ricerca la locandina generale della serie, come TMDB (deviazione dalla SPEC)`.
  La SPEC letterale chiede la locandina di stagione 1 nei risultati; la decisione registrata in Fase 10
  la sostituisce con la locandina generale, perché `search/tv` di TMDB non restituisce mai il poster di
  stagione. **Trovato durante questa verifica**: il catalogo finto (`sampleCatalogSource.ts`) restituiva
  ancora la locandina di stagione 1, contraddicendo `tmdbCatalogSource`/`tmdbMapping.ts`, che già rispettano
  la decisione. Corretto in `src/catalog/sampleCatalogSource.ts` (`toSearchResult` ora usa
  `show.seriesPosterUrl`) e nel test citato, che prima affermava esplicitamente il comportamento opposto.

## 2 — L'aggiunta salva locandina, stagioni ed episodi

- `src/composables/useAddShow.spec.ts` — describe `useAddShow — criterio 2, importa locandina stagioni ed
  episodi`, test `salva nel repository la serie scelta con locandina, stagioni ed episodi del catalogo`.

## 3 — Prima puntata pubblicata non vista e conteggio arretrati

- `src/domain/watchPosition.spec.ts` — test
  `trova la prima puntata pubblicata non vista e conta gli arretrati (criterio 3)`.
- `src/composables/useTrackedShows.spec.ts` — describe
  `useTrackedShows — criterio 3, prima puntata da vedere e arretrati`, test
  `mostra la prima puntata pubblicata non vista e il numero di arretrati`.
- **Scostamento applicabile**: il conteggio arretrati non dipende dalla presenza di un provider italiano
  (SPEC § *Regole di dominio*, scostamento registrato in Fase 4/14). I test sopra non filtrano per provider;
  `src/catalog/sampleCatalogSource.spec.ts` — test
  `una serie senza piattaforme italiane restituisce un elenco vuoto, non un errore` dimostra che l'assenza di
  piattaforma non impedisce comunque l'uso della serie.

## 4 — Marcare S2E4 nasconde S2E4 e le precedenti

- `src/domain/progressAdvance.spec.ts` — test
  `segnando S2E4 come vista, S2E4 e tutte le precedenti spariscono da quelle da vedere (criterio 4)`.
- `src/composables/useShowDetail.spec.ts` — describe
  `useShowDetail — criterio 4, avanzamento multiplo attraverso più stagioni`, test
  `confermando un episodio della stagione 2 fa sparire la stagione 1 e gli episodi precedenti della
  stagione 2`.

## 5 — Conferma sempre richiesta, annullarla non cambia nulla

- `src/composables/useTrackedShows.spec.ts` — describe
  `useTrackedShows — criterio 5, annullare la conferma non cambia lo stato` (flusso home), test
  `lo stato del repository resta identico quando la conferma viene annullata`.
- `src/composables/useShowDetail.spec.ts` — describe
  `useShowDetail — criterio 5, annullare la conferma non cambia lo stato` (flusso dettaglio), test
  `lo stato del repository resta identico quando la conferma di visualizzazione viene annullata`.

## 6 — L'undo ripristina esattamente lo stato precedente

- `src/domain/progressUndo.spec.ts` — test
  `ripristina esattamente posizione, conteggi e locandina (criterio 6)`.
- `src/composables/useShowDetail.spec.ts` — describe
  `useShowDetail — criterio 6, l'undo ripristina esattamente posizione, conteggi e locandina`, test
  `il contenuto dopo undo coincide con quello precedente alla conferma`.

## 7 — Eliminazione con conferma rossa

- `src/views/ShowDetailView.spec.ts` — describe
  `ShowDetailView — criterio 7, rimozione con conferma rossa`, test
  `la conferma di eliminazione è visivamente rossa`,
  `annullando la conferma la serie resta nella lista condivisa`,
  `confermando l'eliminazione la serie viene rimossa e la vista torna alla home`.

## 8 — Nuova puntata alza il badge senza spostare la posizione

- `src/domain/watchPosition.spec.ts` — test
  `alza il conteggio degli arretrati senza spostare la posizione quando una puntata viene pubblicata dopo
  l'ultimo aggiornamento (criterio 8)`.
- `src/domain/catalogMerge.spec.ts` — test
  `una nuova puntata annunciata alza gli arretrati senza spostare la posizione (criterio 8)`.

## 9 — Offline: lista e avanzamento restano disponibili

- `src/views/HomeView.spec.ts` — describe `HomeView — senza rete (criterio 9)`, test
  `mostra la lista e permette di avanzare la posizione anche quando il catalogo remoto non è raggiungibile`.
- `src/composables/useCatalogRefresh.spec.ts` — test
  `restituisce "unavailable" con il motivo quando il catalogo non è raggiungibile` (fallimento dichiarato)
  e `torna a dichiarare un aggiornamento riuscito quando un tentativo successivo va a buon fine`
  (sincronizzazione al ritorno della rete).

## 10 — Due aggiornamenti da dispositivi diversi non si perdono

**Dichiarato esplicitamente, non spuntato a metà**: in modalità locale non esiste un secondo dispositivo
reale, quindi questo criterio è verificabile **solo a livello di revisione ed eventi** dentro una singola
istanza di Dexie, non come sincronizzazione reale fra client. La verifica completa, con l'emulatore
Firestore o un doppio del contratto, è pianificata in Fase 22 (già annotata nel piano).

Quanto è verificabile oggi:

- `src/persistence/localTrackedShowStore.spec.ts` — describe
  `rilettura dello stato dentro la transazione`, test
  `due avanzamenti concorrenti non fanno regredire la posizione`.
- `src/persistence/localTrackedShowStore.spec.ts` — describe `undoLastProgress`, test
  `viene respinto per conflitto di revisione anche quando il dominio riceve una revisione attesa non più
  valida`.
- `src/domain/progressUndo.spec.ts` — test
  `rifiuta l'undo per conflitto di revisione, invitando a ricaricare lo stato`.

## 11 — I cinque ordinamenti

- `src/domain/showSorting.spec.ts`, tutti con `(criterio 11)` nel titolo:
  `ordina per ultima attività: prima la conferma «Vista» più recente, poi la data di inserimento per chi
  non ha conferme, pareggio risolto per titolo`,
  `ordina alfabeticamente sul titolo, con pareggio risolto restando stabile sull'ordine di partenza`,
  `ordina per arretrati decrescenti, con le serie in pari in fondo e pareggio risolto per titolo`,
  `ordina per data di inserimento decrescente, con pareggio risolto per titolo`,
  `ordina per prossima uscita più vicina, con date ignote e serie senza prossima puntata in fondo,
  pareggio risolto per titolo`.
- **Scostamento verificato**: `ordina per ultima attività` include esplicitamente l'inserimento come
  attività (Fase 19 § *Scostamenti*, decisione del 2026-09-18). Confermato dai due test aggiuntivi nello
  stesso file: `con «Ultima attività», una serie appena aggiunta va in cima, sopra una confermata il giorno
  precedente` e `con «Ultima attività», una serie aggiunta tempo fa e mai iniziata si colloca in base alla
  sua data di inserimento, non finisce sempre in fondo`.

## 12 — Dopo «Vista», «Ultima attività» porta la serie in cima

- `src/domain/showSorting.spec.ts` — test
  `con ordinamento «Ultima attività» la serie appena confermata sale in cima (criterio 12)`.
- `src/composables/useTrackedShows.spec.ts` — describe
  `useTrackedShows — criterio 12, ordinamento per ultima attività`, test
  `dopo la conferma la serie sale immediatamente in cima`.

## 13 — Accesso: lista non raggiungibile senza autenticazione

**Coperto in modalità locale, da ricontrollare dopo la Fase 21** (sostituzione del controllo con Firebase
Authentication): la schermata e il contratto restano gli stessi, ma la verifica va rieseguita con
l'implementazione online, come già previsto dal piano.

- `src/views/LoginView.spec.ts` — describe `LoginView — criterio 13, accesso alla lista condivisa`, test
  `senza identità attiva mostra i due profili e il modulo di accesso` e
  `scegliendo un profilo e inserendo credenziali valide accede e apre la lista condivisa`.

## 14 — `confirmedBy`/`undoneBy` con l'utente autenticato, nuovo accesso dopo «Esci»

**Coperto in modalità locale, da ricontrollare dopo la Fase 21**, stesso motivo del criterio 13.

- `src/views/LoginView.spec.ts` — describe
  `LoginView — criterio 14, serve autenticarsi di nuovo dopo «Esci»`, test
  `quando il logout reale azzera la sessione, il modulo di accesso ricompare` e
  `riaprendo l'app dopo il logout, senza sessione salvata, mostra il modulo di accesso invece di saltare a
  home`.
- **Test mancante scritto in questa fase** (il comportamento esisteva già in `useShowDetail.ts` e
  `useTrackedShows.ts`, ma nessun test lo esercitava senza sostituire `resolveActiveProfileId` con un
  valore fisso — la lettura reale di `session.state.value` non era mai stata provata):
  - `src/composables/useShowDetail.spec.ts` — describe
    `useShowDetail — criterio 14, confirmedBy e undoneBy con l'identità autenticata`, test
    `senza forzare l'identità nei test, la conferma e l'undo registrano il profilo autenticato in
    sessione`. Verificato per rottura: forzando `resolveActiveProfileIdFromSession` a restituire sempre
    stringa vuota, il test fallisce con `expected '' to be 'irene'`; ripristinato.
  - `src/composables/useTrackedShows.spec.ts` — describe
    `useTrackedShows — criterio 14, confirmedBy con l'identità autenticata`, test
    `senza forzare l'identità nei test, la conferma registra il profilo autenticato in sessione`.
- `src/auth/session.spec.ts` — test
  `alimenta confirmedBy con l'identità attiva quando si conferma un avanzamento` (fondamenta a livello di
  dominio: l'id del profilo autenticato produce il `confirmedBy` corretto).

## Nota su `confirmedAt`/`updatedAt` (criterio 10, Fase 18)

Il registro della Fase 18 segnala che `updatedAt` è assegnato dal dispositivo, non dal server: due
dispositivi con orologi sfasati potrebbero far vincere la copia sbagliata in un merge di backup. Non è un
criterio di accettazione della SPEC (riguarda l'import/export, fuori dai 14 criteri elencati), resta una
proposta aperta per la Fase 22/23 già tracciata nel piano.
