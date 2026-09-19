# TV Tracker

App per **Fabio e Irene**, per sapere sempre: quali serie stanno seguendo, qual è la prossima puntata da vedere e quante puntate già uscite sono rimaste indietro.

I dati sono **condivisi**: non esistono due liste separate, ma una sola, aggiornata da chiunque dei due segni una puntata come vista.

## Indirizzo dell'app

**[tv-tracker-ds1.pages.dev](https://tv-tracker-ds1.pages.dev)**

All'apertura viene chiesto di scegliere il proprio nome (Fabio o Irene) e di inserire la password concordata. La password è la stessa per entrambi: serve a confermare che siete voi due, non a distinguere chi dei due sta scegliendo — quindi occorre fare attenzione a selezionare il profilo giusto prima di accedere.

## Cosa fa

- Mostra l'elenco delle serie seguite, ciascuna con copertina, prima puntata ancora da vedere e quante puntate arretrate sono già uscite.
- Segnala con «In pari» le serie per cui non c'è nulla di nuovo da vedere.
- Permette di aggiungere una serie cercandola per titolo: i dati (copertina, stagioni, episodi, piattaforma) arrivano da un catalogo online.
- Segna una puntata come vista con un pulsante e una conferma: tutte le puntate precedenti della stessa serie vengono considerate viste automaticamente.
- Permette di **annullare l'ultima conferma**, se ci si sbaglia.
- Aggiorna i dati delle serie seguite su richiesta (pulsante «Aggiorna»), per scoprire nuove puntate uscite nel frattempo.
- Si può ordinare la lista in cinque modi: ultima attività, titolo, puntate da vedere, data di aggiunta, prossima uscita.

## Cosa NON fa

Volutamente. Non è dimenticanza:

- **Nessuna statistica** né storico delle puntate viste.
- **Nessun voto o recensione.**
- **Nessuna notifica**: bisogna aprire l'app per scoprire le novità.
- **Nessun film**: solo serie TV.
- **Nessun profilo separato**: la posizione raggiunta in una serie è una sola, condivisa fra Fabio e Irene. Se uno dei due segna una puntata come vista, la vede segnata anche l'altro.

## Le date sono «data catalogo», non uscite italiane verificate

Le date di uscita mostrate arrivano dal catalogo online (TMDB) e in molti casi corrispondono alla prima trasmissione, che può non coincidere con la disponibilità effettiva su una piattaforma italiana. L'app mostra comunque la piattaforma su cui si sta seguendo la serie, come promemoria di dove guardarla, ma non garantisce che la puntata sia già visibile in Italia proprio in quella data.

## Installazione sul telefono

L'app è installabile come una app normale, senza passare dal Play Store o dall'App Store:

1. Apri l'indirizzo sopra con il browser del telefono (su Android, Chrome).
2. Cerca la voce **«Installa app»** o **«Aggiungi a schermata Home»** nel menu del browser (su alcuni telefoni compare un banner automatico).
3. Da quel momento l'app si apre a schermo intero, con la propria icona, come le altre app installate.

Una volta caricata almeno una volta, l'app resta consultabile e utilizzabile anche **senza connessione**: si può vedere la lista, aprire il dettaglio di una serie e segnare puntate come viste. Cercare una nuova serie e aggiornare il catalogo richiedono invece la connessione.

Quando viene pubblicata una versione nuova, l'app non si aggiorna da sola: compare una barra in basso con scritto che c'è una nuova versione disponibile, con un pulsante per aggiornare. Si può anche ignorarla e continuare a usare la versione attuale finché non si è pronti.

## Dove si gestisce l'app (solo per chi la amministra)

Due pannelli di controllo, entrambi accessibili solo con le credenziali dell'amministratore, non con l'accesso normale dell'app:

- **Firebase** — [console.firebase.google.com/project/tv-tracker-eea72](https://console.firebase.google.com/project/tv-tracker-eea72) — da qui si gestiscono gli account con cui si accede, i dati condivisi delle serie e chi può vederli.
- **Cloudflare** — [dash.cloudflare.com](https://dash.cloudflare.com) — ospita il sito che si vede all'indirizzo pubblico e custodisce la chiave che permette di consultare il catalogo online. Il progetto si chiama `tv-tracker`; nella dashboard si trova sotto **Workers & Pages** (a volte spostata sotto **Compute**).
