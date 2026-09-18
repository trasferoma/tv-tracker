# 03 — Aggiunta di una serie

Il flusso più lungo dell'app. Si svolge in una finestra modale, come nel mockup. Una serie **non si aggiunge mai come testo libero**: solo scegliendo un risultato del catalogo.

```mermaid
flowchart TD
    A["Pulsante +"] --> B["Finestra Aggiungi una serie"]
    B --> C["Digita il titolo"]
    C --> D["Attesa di mezzo secondo<br/>dopo l'ultimo tasto"]
    D --> E["Ricerca su TMDB in italiano"]
    E --> F["Risultati: copertina, titolo,<br/>anno, stato, titolo originale"]
    F --> G["Scegli un risultato"]
    G --> H{"Già nella lista?"}
    H -->|sì| I["Messaggio: serie già seguita"]
    I --> C
    H -->|no| J["Cerca le piattaforme italiane"]
    J --> K{"Quante piattaforme?"}
    K -->|"più di una"| L["Scegli dove la state guardando"]
    K -->|"una sola"| M["Proposta già selezionata"]
    K -->|"nessuna"| N["Etichetta Nessuna piattaforma"]
    L --> O
    M --> O
    N --> O["Posizione di partenza:<br/>Da iniziare, oppure stagione ed episodio"]
    O --> P["Scarica stagioni, episodi,<br/>titoli e date"]
    P --> Q["Serie salvata e visibile in home"]
```

**Note**

- Il duplicato si riconosce dall'**identificativo TMDB**, non dal titolo: due serie diverse possono chiamarsi uguale.
- Il titolo originale compare **solo qui**, in piccolo, per distinguere remake e omonimi. In home si vede il titolo italiano.
- Senza piattaforme italiane la serie **si aggiunge lo stesso**: la piattaforma ricorda dove guardare, non decide se una puntata esiste.
- La piattaforma è modificabile in seguito senza toccare episodi o posizione.

## Le tre chiamate a TMDB

La chiave non passa mai dal browser: l'app parla con il proxy, il proxy parla con TMDB.

```mermaid
sequenceDiagram
    participant U as Utente
    participant A as App nel browser
    participant P as Proxy
    participant T as TMDB

    U->>A: scrive "severance"
    A->>P: cerca serie
    P->>T: search/tv (con la chiave)
    T-->>P: risultati in italiano
    P-->>A: risultati
    A-->>U: elenco con copertine

    U->>A: sceglie la serie
    A->>P: piattaforme italiane
    P->>T: watch/providers
    T-->>P: piattaforme per l'Italia
    P-->>A: piattaforme
    A-->>U: scelta della piattaforma

    U->>A: conferma
    A->>P: stagioni ed episodi
    P->>T: tv/id e season/numero
    T-->>P: episodi con date
    P-->>A: catalogo della serie
    A-->>U: serie in lista
```
