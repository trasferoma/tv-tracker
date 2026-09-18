# 04 — Avanzamento e annullamento

Il cuore dell'app. L'idea di fondo: **non si tiene una spunta per ogni puntata**, si tiene un solo segnalibro — «siamo arrivati a S2E4» — e tutto il resto si deduce.

## Segnare una puntata come vista

```mermaid
flowchart TD
    A["Vista, dalla home o dal dettaglio"] --> B["Finestra di conferma"]
    B --> C{"Confermi?"}
    C -->|no| D["Non cambia nulla"]
    C -->|sì| E["Il segnalibro si sposta<br/>sulla puntata scelta"]
    E --> F["Tutte le precedenti<br/>sono considerate viste"]
    F --> G["Viene registrato l'evento:<br/>chi, quando, quale puntata"]
    G --> H["Segnalibro ed evento<br/>salvati insieme, o nessuno dei due"]
    H --> I["La lista si aggiorna:<br/>puntata successiva, arretrati, locandina"]
```

**Note**

- La conferma è **sempre** richiesta, da entrambe le schermate. È l'unica protezione contro il tocco involontario.
- Scegliendo direttamente una puntata avanzata, **sparisce tutto quello che viene prima**, stagioni intere comprese. È voluto: serve a chi inizia a tracciare una serie già vista a metà.
- La locandina mostrata è quella della stagione della **prima puntata da vedere**: cambia da sola quando si passa alla stagione successiva.
- Le puntate future non si possono segnare: non sono ancora uscite.
- Segnalibro ed evento si salvano **in un'unica operazione**. Se fallisce, fallisce tutto: mai un segnalibro spostato senza il suo evento.

## Annullare l'ultima conferma

```mermaid
flowchart TD
    A["Annulla ultima conferma<br/>(solo nel dettaglio)"] --> B{"Esiste una conferma<br/>da annullare?"}
    B -->|no| C["Il pulsante non compare"]
    B -->|sì| D["Finestra di conferma"]
    D --> E{"Confermi?"}
    E -->|no| F["Non cambia nulla"]
    E -->|sì| G{"Nel frattempo l'altro telefono<br/>ha fatto un avanzamento?"}
    G -->|sì| H["Annullamento rifiutato:<br/>ricarica lo stato aggiornato"]
    G -->|no| I["Segnalibro riportato<br/>dov'era prima"]
    I --> J["L'evento non si cancella:<br/>si marca come annullato,<br/>con chi e quando"]
    J --> K["Posizione, conteggi e locandina<br/>tornano esattamente come prima"]
```

**Note**

- L'annullamento agisce **sull'ultima conferma della serie corrente**, non sulle altre serie.
- È l'**unico** modo di tornare indietro. Negli altri casi il segnalibro va solo avanti: così un telefono rimasto indietro non può far ricomparire puntate già viste.
- Il controllo «l'altro telefono ha fatto qualcosa?» conta solo quando i dati saranno condivisi. In modalità locale non scatta mai, ma il meccanismo c'è già.
