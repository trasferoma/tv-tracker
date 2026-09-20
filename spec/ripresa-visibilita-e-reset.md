# Ripresa — feature `visibilita-e-reset`

Nota di passaggio del 2026-09-20. Serve solo a ripartire senza rileggere tutto.

## Stato

Specifica chiusa, **codice non iniziato**. Nessun file sorgente toccato: in `git status` ci sono solo i documenti nuovi di `spec/`.

23 decisioni prese con l'utente, nessuna domanda aperta.

## Prima mossa di domani, non saltarla

**I due documenti sono disallineati.** `spec-visibilita-e-reset.md` è aggiornato e autorevole; `implementation-visibilita-e-reset.md` è rimasto a un modello del reset **che è stato scartato**. Presi uno per volta sembrano entrambi sensati: è per questo che è insidioso.

Prima di aprire la Fase 1, riallineare il piano alla SPEC delegando a `spec-specialist`. Dal piano vanno tolti:

- l'unione discriminata su `ProgressEvent` (Fase 3, voce «prima di tutto il resto della fase») — `ProgressEvent` **resta com'è oggi**;
- la marcatura degli eventi come annullati e l'annullabilità del reset;
- la validazione del backup per tipo di evento (Fase 6) — `confirmedEpisodeId` resta obbligatorio;
- la lettura Firestore di eventi privi di puntata (Fase 5);
- `progressUndo.ts` **non si tocca**.

## La feature in quattro righe

Una serie tracciata è **condivisa** («Per tutti») o **privata** di una persona («Solo per me»). La home guadagna una lente **«Tutto» / «Solo le mie»** accanto a «Mostra completate». Dal dettaglio si cambia il flag e si **azzera il tracciamento** scegliendo da che stagione e puntata ripartire.

## Le decisioni che cambiano il codice

- **Visibilità**: due campi piatti su `TrackedShow` — `visibility: 'shared' | 'private'` e `privateFor`, valorizzato se e solo se privata. Campo assente = **condivisa**, quindi nessuna migrazione sui dati veri. Un tipo discriminato di dominio per i calcoli.
- **Lente**: «Solo le mie» = solo le mie private. Persiste in `localStorage`, default «Tutto».
- **Unicità**: non più un record per `providerShowId`, ma `providerShowId` + destinatario. Due schede della stessa serie possono coesistere e si accettano: in lista si distinguono perché la privata porta il puntino.
- **Confine di comodità, non di sicurezza**: filtro nel client, `firestore.rules` **non si tocca**. Il dettaglio aperto per indirizzo diretto mostra la serie anche all'altra persona.
- **Reset**: **non annullabile**, riporta la serie allo stato di una appena inserita. Eventi **cancellati** (riusando `removeShow`), nessun evento di reset scritto, `lastViewedAt` assente, `addedAt` all'istante del reset, `progressRevision` **incrementata** (non azzerata: è il gettone del conflitto), identificativo, catalogo, piattaforma e visibilità invariati.
- **`addedAt` cambia significato**: da «quando è entrata in lista» a «quando è cominciato il tracciamento attuale». Voluto: dopo un reset la serie sta in cima in entrambi gli ordinamenti.
- **Conteggi**: il riepilogo «N nuove puntate» si calcola su tutto il visibile; il numero accanto a «Mostra completate» **dopo** la lente, perché è l'etichetta di un comando.
- **Backup**: `formatVersion: 2`, campi di visibilità obbligatori, i file versione 1 rifiutati con messaggio esplicito.

## Pipeline da seguire

Piano in 11 fasi, dal dominio alle viste. Per ogni fase: annuncio in una riga, delega a `clean-code-implementer`, seconda invocazione in modalità verifica, spunta nel registro del piano. `solid-srp-reviewer` non si applica (non è Java).

## Prima di far provare qualcosa all'utente

Node 22 via `fnm`, incremento di `src/appVersion.ts`, `npm run build`, poi `npx wrangler pages deploy dist --project-name tv-tracker --branch master --commit-dirty=true`. La procedura completa sta in `CLAUDE.md`.
