# SPEC — TV Tracker

**Riferimento visivo approvato:** `tv-tracker-mockup.html`. Il mockup contiene dati finti e interazioni dimostrative; definisce flussi, testi, gerarchia e direzione grafica, ma non è codice di produzione.

## Obiettivo

PWA mobile-first, essenziale, per Fabio e Irene, con un'unica tracciatura condivisa, per sapere:

- quali serie sta seguendo;
- qual è la prima puntata ancora da vedere;
- quante puntate già pubblicate restano da vedere;
- quando sono disponibili nuove puntate.

Non sono previste statistiche, valutazioni, diario di visione o storico delle puntate viste.

## Principi UX

1. La home è la lista operativa: deve rispondere subito a «cosa possiamo guardare?».
2. Le puntate viste scompaiono dall'elenco operativo; resta visibile la prima da vedere e il numero di successive disponibili.
3. Marcare una puntata come vista aggiorna implicitamente come viste tutte le precedenti della stessa serie.
4. I dati editoriali arrivano dalla rete; lo stato personale di visione è salvato separatamente.
5. L'app continua a mostrare i dati già scaricati quando è offline. Ricerca e aggiornamento catalogo richiedono rete.

## Ambito MVP

### Accesso

- all'apertura, prima dei dati, viene mostrata una schermata di login;
- due soli profili cablati nella configurazione: `fabio` e `irene`;
- il profilo si sceglie tramite due pulsanti con icona maschile e femminile e nome visibile;
- dopo la scelta sono disponibili campo password e pulsante «Accedi»;
- il tasto Invio nel campo password esegue il login;
- nell'intestazione dell'app sono sempre visibili l'utente attivo e il comando «Esci»;
- l'identificativo autenticato alimenta `confirmedBy` e `undoneBy` negli eventi;
- la sessione resta valida sul dispositivo fino al logout o alla scadenza stabilita da Firebase Authentication.

Configurazione applicativa prevista:

| Campo | Fabio | Irene |
| --- | --- | --- |
| `id` | `fabio` | `irene` |
| `displayName` | Fabio | Irene |
| `genderIcon` | maschile | femminile |
| `firebaseLoginId` | identificativo tecnico configurato | identificativo tecnico configurato |

La password **non viene cablata nel file di configurazione della PWA**: qualunque valore inserito nel bundle frontend è leggibile dagli strumenti del browser. I due account vengono invece creati in Firebase Authentication; il mockup accetta temporaneamente `xxx`.

Usare la stessa password per entrambi è compatibile con l'uso privato richiesto, ma non dimostra realmente chi stia operando: chi conosce `xxx` può selezionare indifferentemente Fabio o Irene. L'app registra quindi l'identità scelta e autenticata, non una prova forte dell'identità personale. In futuro si potranno assegnare password diverse senza cambiare modello dati o interfaccia.

### Home / Serie seguite

- elenco delle serie attive;
- copertina, titolo, prima puntata da vedere e relativa data di uscita;
- locandina della stagione contenente la prima puntata da vedere; se la serie non è mai iniziata, locandina della stagione 1;
- badge «N nuove» per le puntate pubblicate e non viste;
- stato «In pari» quando non esistono puntate pubblicate da vedere;
- evidenza separata della prossima puntata futura, quando nota;
- azione rapida «Vista» sulla prima puntata da vedere;
- l'azione «Vista» richiede sempre conferma prima di modificare la posizione;
- accesso al dettaglio;
- pulsante per aggiungere una serie.

Ordinamento selezionabile dalla home:

1. **Ultima attività** — predefinito: prima le serie con la conferma «Vista» più recente; quelle mai iniziate vanno in fondo.
2. **Titolo A–Z** — confronto alfabetico in locale italiano.
3. **Più puntate da vedere** — conteggio decrescente; le serie in pari vanno in fondo.
4. **Inserite di recente** — `addedAt` decrescente.
5. **Prossima uscita** — prima la serie con la prossima puntata programmata più vicina; date ignote o serie senza prossima uscita vanno in fondo.

A parità di valore si usa sempre il titolo alfabetico, così la lista non cambia ordine casualmente. La scelta di ordinamento è una preferenza locale del dispositivo e non modifica né sincronizza i dati condivisi.

### Inserimento

- campo titolo con autocomplete remoto e debounce;
- ogni risultato mostra copertina, titolo, anno e stato per disambiguare remake e omonimi;
- nei risultati di ricerca viene mostrata la locandina della stagione 1;
- una serie può essere aggiunta solo scegliendo un risultato, non come testo libero;
- duplicati bloccati tramite identificativo del catalogo esterno;
- dopo la selezione della serie vengono recuperate le piattaforme disponibili in Italia;
- se la serie è presente su più piattaforme, l'utente deve scegliere quella su cui la sta seguendo prima di confermare;
- se è presente su una sola piattaforma, questa viene proposta già selezionata;
- la piattaforma scelta è modificabile successivamente senza alterare episodi o posizione raggiunta;
- al salvataggio vengono importati stagioni, episodi, titoli e date di uscita disponibili;
- scelta iniziale opzionale della posizione raggiunta: «Da iniziare» oppure stagione/episodio già visto.

### Dettaglio serie

- modifica limitata alla posizione raggiunta; titolo e copertina restano dati del catalogo;
- stagioni espandibili;
- sono mostrati solo gli episodi successivi alla posizione raggiunta;
- gli episodi futuri sono riconoscibili e non possono essere marcati come visti;
- nella relativa stagione, la prossima puntata futura mostra un riquadro «Prossima puntata in arrivo» con data, numero e titolo, senza azione «Vista»;
- «Segna come vista» su un episodio apre un popup di conferma e, solo dopo la conferma, marca implicitamente anche tutti i precedenti;
- scegliendo direttamente un episodio avanzato, tutte le stagioni precedenti e gli episodi precedenti della stessa stagione vengono considerati visti e scompaiono immediatamente;
- rimozione della serie con popup rosso di conferma;
- pulsante «Annulla ultima conferma» nel dettaglio, visibile solo se esiste almeno un avanzamento annullabile per quella serie;
- l'undo richiede a sua volta conferma e ripristina esattamente posizione, conteggi e locandina precedenti;
- aggiornamento manuale dei dati dalla rete.

### Aggiornamento automatico

- all'apertura, se l'ultimo controllo è abbastanza vecchio e c'è rete, aggiornamento in background delle serie seguite;
- aggiornamento forzabile con pull-to-refresh o pulsante;
- il badge «nuove» è derivato confrontando data di uscita e posizione raggiunta;
- nessuna notifica push nel MVP: richiederebbe infrastruttura server o controlli periodici non affidabili in una PWA chiusa.

## Fonte dati proposta

La fonte principale proposta diventa **TMDB**, perché permette ricerca localizzata in italiano, immagini, stagioni, episodi e provider di visione filtrati per paese. Le chiamate useranno `language=it-IT` e regione `IT` quando prevista.

TMDB indica su quali servizi una serie è disponibile in Italia attraverso i dati dei watch provider, forniti in collaborazione con JustWatch. Questo dato è utile per mostrare «Netflix» o «Disney+», ma **non certifica la data italiana di uscita di ogni singolo episodio**. La data episodio disponibile nel catalogo può essere quella di prima trasmissione. L'app mostrerà quindi la piattaforma italiana e userà la data episodio come indicazione, senza dichiararla erroneamente «uscita italiana verificata».

TVmaze resta un possibile ripiego per l'elenco episodi, non la sorgente primaria.

Il catalogo esterno va trattato come sorgente fallibile: l'app conserva una copia locale minima di serie, stagioni ed episodi per lavorare offline.

## Modello dati definitivo dell'MVP

### TrackedShow

| Campo | Significato |
| --- | --- |
| `id` | UUID locale |
| `catalogProvider` | sorgente del catalogo, inizialmente `tmdb` |
| `providerShowId` | identificativo stabile della serie |
| `title` | titolo corrente del catalogo |
| `seriesPosterUrl` | locandina generale della serie, usata come fallback |
| `status` | stato editoriale della serie |
| `italianProviders` | piattaforme disponibili per la regione `IT` |
| `selectedStreamingProviderId` | piattaforma italiana scelta da Fabio e Irene |
| `selectedStreamingProviderName` | nome della piattaforma scelto, conservato come snapshot leggibile |
| `lastWatchedEpisodeId` | ultimo episodio visto, assente se mai iniziata |
| `progressRevision` | revisione incrementale della posizione, usata per rilevare undo obsoleti |
| `addedAt` | istante di inserimento nella lista condivisa |
| `lastViewedAt` | istante dell'ultima conferma «Vista», assente se mai iniziata |
| `catalogUpdatedAt` | ultimo aggiornamento remoto riuscito |
| `updatedAt` | ultima modifica dello stato personale |

### ProgressEvent

Ogni conferma di visualizzazione genera un evento appartenente alla singola serie.

| Campo | Significato |
| --- | --- |
| `id` | UUID dell'evento |
| `trackedShowId` | serie interessata |
| `previousEpisodeId` | posizione prima della conferma, assente se mai iniziata |
| `confirmedEpisodeId` | episodio scelto dall'utente |
| `seasonNumber` | snapshot del numero di stagione confermato |
| `episodeNumber` | snapshot del numero di episodio confermato |
| `episodeTitle` | snapshot del titolo al momento della conferma |
| `confirmedAt` | istante della conferma, assegnato dal server |
| `confirmedBy` | identificativo dell'utente che ha confermato, Fabio o Irene |
| `undoneAt` | istante dell'eventuale undo |
| `undoneBy` | identificativo dell'utente che ha effettuato l'undo |

Stagione, numero e titolo sarebbero ricavabili da `confirmedEpisodeId`, ma vengono conservati come snapshot per mantenere l'evento comprensibile anche se TMDB corregge o rinomina successivamente una puntata.

L'undo non cancella l'evento: valorizza `undoneAt` e `undoneBy`, ripristina `previousEpisodeId` e genera una nuova revisione della posizione. Questo mantiene sincronizzabili le azioni di Fabio e Irene senza introdurre uno storico visibile nell'interfaccia.

Non vengono salvati nell'evento:

- locandina della stagione;
- numero delle puntate rimanenti;
- titolo corrente della serie;
- piattaforma scelta.

Sono valori derivabili dalla posizione corrente e dal catalogo, quindi duplicarli nell'evento creerebbe dati facilmente incoerenti.

### Season

| Campo | Significato |
| --- | --- |
| `providerSeasonId` | identificativo della stagione nel catalogo |
| `seasonNumber` | numero stagione |
| `posterUrl` | locandina specifica della stagione, se disponibile |
| `episodes` | episodi ordinati della stagione |

### Episode

| Campo | Significato |
| --- | --- |
| `providerEpisodeId` | identificativo del catalogo |
| `seasonNumber` | numero stagione |
| `episodeNumber` | numero episodio |
| `title` | titolo episodio |
| `airDate` | data di pubblicazione locale `YYYY-MM-DD`, se nota |

Lo stato personale non viene salvato con un booleano per ogni episodio: basta `lastWatchedEpisodeId` insieme all'ordine degli episodi. In questo modo «vista fino a S2E4» è atomico e le puntate precedenti spariscono senza centinaia di flag ridondanti.

## Persistenza e condivisione — decisione presa

Un singolo file JSON condiviso non è una base dati multiutente. Su due telefoni presenta tre problemi:

- il browser non può riscriverlo in modo trasparente e periodico su Google Drive/Dropbox;
- due modifiche vicine possono sovrascriversi;
- manca un'autorità che risolva conflitti e versioni.

### Soluzione: Firebase Cloud Firestore

Firestore sarà la sorgente autorevole dello stato condiviso e la sua persistenza locale permetterà letture e scritture offline. Al ritorno della rete il client sincronizza le modifiche. Il volume previsto rientra ampiamente in un uso personale del piano gratuito, fermo restando il controllo dei limiti correnti prima della pubblicazione.

Modello di accesso proposto:

- autenticazione Firebase Email/Password con due account precreati, Fabio e Irene;
- un solo `householdId` condiviso da Fabio e Irene;
- regole Firestore che consentono l'accesso esclusivamente ai membri di quel nucleo;
- nessun profilo separato e una sola posizione vista per serie;
- ogni avanzamento aggiorna solo il documento della serie interessata;
- ogni avanzamento e ogni undo sono salvati atomicamente insieme al relativo `ProgressEvent`;
- fra due normali avanzamenti concorrenti prevale la posizione più avanzata, così un dispositivo rimasto indietro non può far ricomparire puntate già viste;
- un undo esplicito è l'unica operazione autorizzata a spostare la posizione all'indietro e prevale soltanto se annulla l'ultima conferma ancora attiva;
- export JSON mantenuto come backup, non come sincronizzazione.

L'autenticazione non va sostituita con un codice segreto permanente nell'URL: sarebbe comodo ma troppo facile da condividere accidentalmente.

### Struttura Firestore

```text
households/{householdId}
├── members/{uid}
├── trackedShows/{trackedShowId}
│   └── progressEvents/{progressEventId}
└── appMeta/config
```

- le regole verificano che `request.auth.uid` esista in `members`;
- Fabio e Irene leggono e scrivono la stessa collezione `trackedShows`;
- conferma «Vista», aggiornamento di `lastWatchedEpisodeId`, `lastViewedAt`, `progressRevision` e creazione del `ProgressEvent` formano un'unica operazione logica;
- l'undo controlla la revisione corrente prima di ripristinare `previousEpisodeId`;
- gli eventi restano tecnici e non costituiscono una schermata di storico.

## Decisioni tecniche

- Vue 3 con Composition API e `<script setup>`;
- TypeScript in modalità `strict`;
- Vite e Vue Router;
- Firebase Authentication Email/Password;
- Cloud Firestore con cache persistente web abilitata;
- `vite-plugin-pwa` per installazione e cache degli asset applicativi;
- hosting statico su Cloudflare Pages;
- una Cloudflare Pages Function/Worker espone soltanto gli endpoint TMDB necessari e conserva il token TMDB come secret;
- il browser non contiene il token TMDB e non chiama direttamente endpoint che richiedono credenziali;
- nessun framework CSS, store globale o libreria di componenti necessario per l'MVP;
- logica di dominio, ordinamenti, avanzamento e undo in funzioni pure separate dai componenti;
- accesso a Firebase incapsulato in repository/composable, mai direttamente nei componenti;
- il mockup HTML è la specifica visiva e comportamentale: non va importato né rifattorizzato come codice di produzione.

Le versioni esatte delle dipendenze vanno fissate al momento dello scaffold usando release stabili e compatibili, senza copiare quelle del progetto Gym Tracker alla cieca.

## Regole di dominio

- La posizione vista è monotona nelle azioni normali: segnare S2E4 implica che ogni episodio precedente è visto.
- Dal dettaglio è possibile correggere la posizione all'indietro soltanto tramite l'undo confermato dell'ultima operazione.
- Gli speciali (`seasonNumber = 0`) sono mostrati in una sezione separata e non entrano nella posizione principale né nel conteggio «nuove».
- Una puntata è «presumibilmente disponibile» quando `airDate <= data odierna` e la serie ha almeno un provider italiano noto; se la data manca, è catalogata ma non contata come nuova.
- Eliminare una serie elimina il `TrackedShow` condiviso e tutti i suoi eventi di avanzamento, dopo conferma rossa; l'eventuale cache editoriale riutilizzabile non fa parte dell'aggregato e può restare.
- L'undo agisce sull'ultima conferma non già annullata della serie corrente; non influenza le altre serie.
- Se nel frattempo un altro dispositivo ha prodotto un avanzamento successivo, un vecchio undo viene rifiutato e l'utente deve ricaricare lo stato corrente.
- Un avanzamento viene applicato soltanto dopo conferma sia dalla home sia dal dettaglio.
- Un cambio di titolo o copertina dal provider aggiorna i dati editoriali senza toccare la posizione raggiunta.
- La locandina visualizzata deriva dalla stagione della prima puntata non vista. Quando l'avanzamento passa a una stagione successiva, cambia automaticamente.
- Se il catalogo non fornisce una locandina di stagione, si usa quella generale della serie; solo in sua assenza compare un segnaposto.

## Decisioni funzionali finali

1. Gli speciali sono separati e non influenzano avanzamento o conteggi.
2. Le date degli episodi vengono mostrate come «Data catalogo», senza dichiararle date italiane verificate.
3. Fabio e Irene hanno due account Firebase distinti associati allo stesso `householdId`.
4. La password `xxx` vale soltanto nel mockup; le credenziali reali non sono salvate nel repository o nel bundle.
5. La posizione è unica e condivisa: non esistono progressi separati per Fabio e Irene.

## Fuori scope MVP

- statistiche e storico;
- voti, recensioni e note;
- consigli personalizzati;
- catalogo autonomo delle piattaforme streaming oltre alla scelta associata alla serie;
- notifiche push;
- profili separati;
- import automatico da servizi terzi;
- film.

## Direzione visiva

- tema esclusivamente chiaro nell'MVP;
- fondo azzurro ghiaccio molto tenue, superfici bianche e bordi blu-grigio;
- colore principale blu petrolio e accento azzurro pulito;
- verde riservato allo stato «in pari», ambra alle puntate in attesa;
- ombre leggere, ampio spazio bianco e tipografia scura ad alto contrasto;
- copertine come elemento cromatico principale, senza fondi scuri o accento lime di Gym Tracker.

## Requisiti non funzionali

- mobile-first, controlli touch di almeno 46 px e nessuno scorrimento orizzontale della pagina;
- testi visibili in italiano, identificatori del codice in inglese;
- label accessibili, focus visibile e dialog modali utilizzabili da tastiera;
- installabile come PWA e utilizzabile offline dopo almeno un accesso online riuscito;
- senza rete restano disponibili lista, dettaglio e avanzamenti sulla cache già caricata; ricerca, inserimento dal catalogo e aggiornamento TMDB richiedono rete;
- nessun token TMDB, password o credenziale Firebase amministrativa nel repository o nel bundle;
- errori di autenticazione, rete, sincronizzazione e catalogo mostrati con messaggi comprensibili senza perdere lo stato locale;
- aggiornamento PWA disponibile tramite avviso discreto e ignorabile;
- test automatici almeno per ordinamenti, calcolo della prima puntata non vista, conteggio arretrati, avanzamento multiplo, undo, conflitto di revisione e selezione della locandina stagionale.

## Organizzazione suggerita

```text
src/
├── domain/          tipi, avanzamento, undo, ordinamenti e regole pure
├── catalog/         contratti e mapping TMDB
├── auth/            profili configurati e sessione Firebase
├── persistence/     repository Firestore
├── composables/     stato reattivo e casi d'uso
├── components/      dialog, card, stagioni e controlli condivisi
├── views/           login, home, inserimento e dettaglio
├── router/
└── styles/
functions/
└── api/             proxy minimo verso TMDB
```

Le viste non accedono direttamente a Firebase o TMDB. La UI riceve modelli già preparati dai composable; le regole di dominio restano testabili senza Vue.

## Criteri di accettazione iniziali

1. Cercando un titolo compaiono risultati disambiguati e si può aggiungere solo una serie reale del catalogo.
2. L'aggiunta salva copertina, stagioni ed episodi disponibili.
3. La home mostra immediatamente la prima puntata pubblicata non vista e il numero totale delle puntate arretrate.
4. Marcando S2E4 come vista, S2E4 e tutte le puntate precedenti non compaiono più tra quelle da vedere.
5. Prima di applicare un avanzamento dalla home o dal dettaglio compare sempre una conferma; annullandola, lo stato resta identico.
6. Dopo un avanzamento confermato, il dettaglio permette l'undo con ulteriore conferma e ripristina esattamente la posizione precedente.
7. L'eliminazione richiede una conferma visivamente rossa; annullandola, serie ed eventi restano intatti.
8. Una nuova puntata pubblicata dopo l'ultimo aggiornamento aumenta il badge «nuove» senza alterare la posizione vista.
9. Senza rete l'app mostra l'ultimo catalogo scaricato e permette di avanzare la posizione; la sincronizzazione avviene quando torna online.
10. Due aggiornamenti da dispositivi diversi non vengono persi grazie alle revisioni e agli eventi di avanzamento.
11. Tutti e cinque gli ordinamenti producono l'ordine previsto; valori mancanti finiscono in fondo e i pareggi sono risolti alfabeticamente.
12. Dopo una conferma «Vista», con ordinamento «Ultima attività» la serie aggiornata sale immediatamente in cima.
13. Senza autenticazione la lista non è accessibile; scegliendo Fabio o Irene e inserendo credenziali valide si apre la stessa lista condivisa mostrando l'identità attiva.
14. Conferma «Vista» e undo registrano rispettivamente `confirmedBy` e `undoneBy` con l'utente autenticato; dopo «Esci» è necessario autenticarsi nuovamente.
