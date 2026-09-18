# Schemi — TV Tracker

Tre schemi, in Mermaid. Si aprono con qualunque lettore Markdown che renderizza Mermaid (VS Code con l'estensione Markdown Preview Mermaid, IntelliJ, GitHub, Obsidian).

Sono un **riassunto visivo** di `spec/tv-tracker-spec.md`: se uno schema e la SPEC dicono cose diverse, vale la SPEC.

| Schema | Cosa mostra |
| --- | --- |
| [01 — Un telefono, il giro completo](01-giro-completo.md) | Una sera qualunque, dall'apertura dell'app alla puntata segnata, attraverso tutti i pezzi. Da leggere per primo |
| [02 — Aggiunta di una serie](02-aggiunta-serie.md) | Ricerca, scelta della piattaforma, importazione di stagioni ed episodi |
| [03 — Avanzamento e annullamento](03-avanzamento-e-undo.md) | «Vista» con conferma, avanzamento implicito delle puntate precedenti, undo |

## Perché solo tre

Ne erano stati scritti nove. Sei sono stati eliminati perché avevano una data di scadenza:

- **architettura a livelli** e **modello dati** ripetevano quello che il codice TypeScript dirà meglio di loro, e sarebbero divergiti in silenzio;
- **confine dati** e **tecnologie in gioco** erano costruiti sulla contrapposizione «oggi in locale / domani condiviso», che sparisce alla Fase 22;
- **accesso** e **aggiornamento del catalogo** erano già contenuti, nella sostanza, nello schema 01.

I tre rimasti descrivono **comportamento visibile all'utente**, fissato dalla SPEC: non cambiano se domani sostituiamo Dexie, Firestore o TMDB.

Lo schema **03** è quello da non perdere: è l'unico posto dove è scritto che segnare S2E4 fa sparire tutto ciò che viene prima e che annullare non cancella l'evento. È la parte in cui un errore fa perdere dati.
