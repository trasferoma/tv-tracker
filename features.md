# Da includere nella prossima implementazione

Lavoro rimandato di proposito, non dimenticato. Ogni voce dice **cosa**, **perché è stata rimandata** e **cosa serve sapere** per farla senza ricostruire il contesto da capo.

Le voci si chiudono togliendole da qui quando entrano in una `spec-*`/`implementation-*`.

---

## 1. `resolveActiveProfileIdFromSession` è duplicata in tre composable

**Cosa.** La stessa funzione, identica riga per riga, vive in `src/composables/useTrackedShows.ts`, `useShowDetail.ts` e `useAddShow.ts`. Ricava l'identificativo del profilo attivo dalla sessione:

```ts
function resolveActiveProfileIdFromSession(): string {
    return matchSessionState(session.state.value, {
        restoring: () => '',
        authenticated: (profile) => profile.id,
        anonymous: () => ''
    });
}
```

**Dove va.** In `src/auth/session.ts`, che esporta già `matchSessionState` e i tipi della sessione: è la sede naturale, e i tre composable la importerebbero invece di riscriverla.

**Perché è stata rimandata.** Due copie erano preesistenti; la terza è nata con la feature «visibilità e reset» (settembre 2026). Estrarla tocca tre file appartenenti a fasi già scritte e verificate, senza cambiare **alcun** comportamento: non valeva la pena riaprirle a ridosso della chiusura.

**Cosa sapere prima di farla.** Ogni composable inietta già la funzione come dipendenza sostituibile nei test (`resolveActiveProfileId` dentro il proprio oggetto di dipendenze): l'estrazione riguarda **solo** l'implementazione predefinita, non il punto di iniezione. I test esistenti non dovrebbero accorgersene — se se ne accorgono, la sostituzione non è equivalente e va capito perché.

---

## 2. `resetSuggestionVisible` è uno stato ridondante

**Cosa.** `useShowDetail` espone un flag `resetSuggestionVisible`, valorizzato quando una serie passa a «Per tutti» per suggerire l'azzeramento. La vista però conosce già il verso del cambio, e potrebbe decidere da sé se mostrare il suggerimento senza consultare lo stato del composable.

**Perché è stata rimandata.** Segnalata dalla verifica della Fase 10 come semplificazione, non come difetto: il comportamento attuale è corretto e testato. Toccarla significa cambiare la firma pubblica di `UseShowDetail`, già chiusa e verificata.

**Cosa sapere prima di farla.** Oggi il flag è azzerato all'inizio di ogni cambio di visibilità, e `ShowDetailView.vue` chiama `dismissResetSuggestion()` quando il messaggio effimero si chiude, per non lasciare i due stati disallineati. Se il flag sparisce, sparisce anche quella necessità: è metà del guadagno dell'intervento.

---

## 3. Due file di test vanno in timeout in modo intermittente

**Cosa.** `src/views/HomeView.spec.ts` e `src/router/index.spec.ts` falliscono per timeout in modo saltuario durante `npm test` a pieno carico. Rilanciati da soli passano sempre.

**Perché è stata rimandata.** È **preesistente** alla feature «visibilità e reset» ed estraneo ai file toccati. Si è manifestato con frequenza bassa e non riproducibile in isolamento.

**Perché conta comunque.** Ogni fase di questo progetto si chiude con «suite verde». Un test che a volte fallisce senza motivo addestra a ignorare il rosso, e il primo rosso vero passa inosservato. Se la frequenza aumenta, va affrontato prima di qualunque altra cosa.

**Diagnosi, aggiunta il 2026-09-22 dopo cinque comparse in una giornata.** Non è un timer applicativo. Il test che cade è **sempre il primo del file**, e paga da solo il costo di avvio del worker: la trasformazione Vite dell'intero grafo di dipendenze di `HomeView.vue` — quasi tutti i composable e i moduli di dominio — più l'istanziazione di un ambiente **jsdom** dedicato. Le esecuzioni successive dello stesso file sono 5-10 volte più veloci (350-450 ms contro 2400-4535 ms) perché riusano cache e ambiente. A suite piena quel costo compete con 57 file in parallelo e occasionalmente supera i 5000 ms di soglia: in isolamento non ci si avvicina mai. La causa strutturale è che **26 file su 58** sovrascrivono a `jsdom` l'ambiente `node` predefinito, e un worker paga il cambio.

`HomeView.spec.ts` usa un router locale e **non** attraversa la guardia di sessione da 5000 ms di `src/router/index.ts`: quella resta invece il sospetto principale per la flakiness gemella di `router/index.spec.ts`, che monta il router vero. Sono due difetti diversi sotto lo stesso sintomo.

**Tre rimedi, in ordine di costo.** Alzare il timeout del solo file: una riga, ma maschera il sintomo e lascerebbe passare inosservato un vero regresso di prestazioni. Separare i file `jsdom` da quelli `node` in due gruppi Vitest: affronta la causa, costa una modifica a `vite.config.ts` e allo script `test`. Ridurre la concorrenza dei worker: scambia velocità della suite per meno contesa di memoria, ed è probabilmente il più economico rispetto al beneficio su questa macchina.

**Cosa sapere prima di farla.** Il sospetto è un timer o un debounce atteso con tempi reali invece che con i tempi finti di Vitest; `HomeView` monta componenti che dipendono da `localStorage` e da sottoscrizioni. Da guardare prima: i test che asseriscono su elementi che compaiono dopo un'attesa.

---

## 4. Il reset su Firestore non cancella gli eventi dentro la transazione

**Cosa.** `resetProgress` in `src/persistence/firestoreTrackedShowStore.ts` scrive la serie azzerata **dentro** una transazione che ne rilegge lo stato, poi cancella gli eventi in un lotto **separato**, dopo il commit.

**Perché è così, e perché non è un difetto da correggere alla leggera.** Firestore **non ammette query dentro una transazione**, e cancellare la sottocollezione degli eventi è una query. Non esiste una forma «tutto in una transazione» come quella disponibile su Dexie. La forma attuale è già il miglioramento di una precedente, in cui l'intera scrittura della serie avveniva fuori transazione e poteva sovrascrivere in silenzio una conferma arrivata dall'altro dispositivo.

**Il residuo accettato.** Una conferma scritta nella finestra fra il commit della transazione e la cancellazione degli eventi può essere cancellata. Nel caso peggiore produce un rifiuto esplicito dell'annullamento, mai una corruzione silenziosa.

**Cosa sapere prima di toccarla.** Esiste una proposta non applicata: un test di «fallimento a metà» per il reset Firestore, analogo a quello che esiste per Dexie. Non è stato scritto perché coprirebbe un limite già accettato e già coperto in `replaceAllShows`. Se si riapre il tema, quello è il punto da cui partire.

---

## 5. Ridurre la concorrenza dei worker di Vitest

**Cosa.** Far girare la suite con meno worker in parallelo, scambiando un po' di velocità totale per molta meno contesa di memoria sulla macchina di sviluppo. Oggi il blocco `test` di `vite.config.ts` dichiara **solo** `environment`, `include` e `setupFiles`: nessuna opzione di pool, quindi Vitest usa il parallelismo predefinito su tutti i core. L'intervento consiste nell'aggiungere lì la configurazione che limita i worker — nella 3.2.7 si passa da `poolOptions` (per esempio `maxThreads`, oppure `pool: 'forks'` con `maxForks`), ma **la forma esatta va verificata sulla documentazione della versione installata**, non copiata da qui a memoria.

**Perché farlo.** È il rimedio scelto per il difetto della voce 3, di cui la diagnosi è scritta lì: i timeout intermittenti cadono sempre sul **primo** test di un file, che paga da solo l'avvio del worker mentre altri 57 file competono per CPU e memoria. Meno worker significa meno contesa proprio nel momento in cui quel costo si paga. È anche il rimedio più economico rispetto al beneficio fra i tre valutati: non maschera il sintomo come alzare il timeout, e non richiede di riorganizzare la suite in due gruppi come la separazione `jsdom` / `node`.

**Non è solo una questione di test.** Durante lo sviluppo della feature «nascondi serie» (22 settembre 2026) un comando in background è stato **ucciso dal sistema** perché la memoria era criticamente scarsa, e da quel momento ogni fase è stata eseguita con una sola esecuzione per volta. La contesa di memoria su questa macchina è un fatto misurato, non un'ipotesi.

**Perché è stata rimandata.** È debito preesistente ed estraneo alla feature che l'ha fatto notare: toccare la configurazione della suite mentre si chiude una feature avrebbe mescolato due cause nello stesso diff, proprio mentre si usava la suite per giudicare il lavoro.

**Cosa sapere prima di farla.** Serve una misura, non un'impressione: prima di cambiare, cronometrare `npm test` a suite piena almeno tre volte e annotare durata e comparse del timeout; dopo, rifare la stessa misura. Se la durata totale peggiora molto e i timeout non spariscono, il rimedio è sbagliato e va scartato invece che accumulato. Da tenere presente che la causa strutturale resta un'altra — **26 file su 58** sovrascrivono a `jsdom` l'ambiente `node` predefinito e un worker paga il cambio — quindi questo intervento riduce la frequenza del sintomo senza rimuoverne l'origine: se dopo la misura il problema resta, la voce 3 va riaperta sulla separazione dei due gruppi.

---

## Decisioni già prese, da non riproporre

Voci valutate e **respinte** con una ragione. Stanno qui perché tornino in mente come già decise, non come idee nuove.

- **Spostare nella vista l'assemblaggio del testo di conferma dell'azzeramento.** Proposto dalla verifica della Fase 8. Respinto: l'implementazione attuale è corretta e testata, lo split costerebbe un cambio di firma pubblica e tre test riscritti per allinearsi a un precedente che tratta casi più semplici, mentre la regola di progetto vuole che le viste ricevano dati già pronti.
- **Alzare il confine di visibilità a livello di regole Firestore.** Deciso in sede di specifica: il filtro vive nel client ed è di **comodità, non di sicurezza**. I due utenti condividono un household e «Solo per me» serve a non ingombrare la lista dell'altro, non a difendersi da lui. Alzarlo costerebbe query separate per destinatario, regole per documento e un percorso di migrazione, per proteggere da un avversario che non esiste. Il ragionamento completo è in `spec/spec-visibilita-e-reset.md`.
