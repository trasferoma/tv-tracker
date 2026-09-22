# Ripresa — feature `visibilita-e-reset`

Nota di passaggio, aggiornata al 2026-09-21. Serve solo a ripartire senza rileggere tutto.

## Stato

**Fasi 1-6 chiuse e verificate. Fase 7 scritta ma NON verificata.** Restano le Fasi 8-11.

Suite: **502 test su 51 file**, verdi. `lint` e `typecheck` puliti. Baseline di partenza: 417 test.

I due documenti autorevoli sono `spec-visibilita-e-reset.md` (comportamento, 23 criteri di *definition of done*) e `implementation-visibilita-e-reset.md` (piano in 11 fasi, con spunte e registro aggiornati fase per fase).

## Prima mossa di domani, non saltarla

**La verifica della Fase 7 non è stata eseguita**: la sessione è stata interrotta su richiesta subito dopo la scrittura. Va fatta *prima* di aprire la Fase 8, con una seconda invocazione di `clean-code-implementer` in modalità verifica.

Due cose da metterle davanti, invece di lasciarle cercare:

1. **Il parametro `scope` di `useTrackedShows` ha un valore predefinito** (`ref('all')`). Se la Fase 9 dimentica di cablarlo con `useScopePreference`, la lente semplicemente non funziona e **niente si rompe**: nessun errore, nessun test rosso. È la forma di difetto che questo progetto ha già pagato — una firma che promette più di quanto l'implementazione garantisca.
2. **Una mutazione era sopravvissuta** al primo tentativo: il filtro di visibilità sulle righe con dati non allineati era mascherato da un secondo controllo a valle. È stata catturata solo rafforzando il test su `trackedProviderShowIds`. Vale la pena ricontrollare che non ci siano altri punti dove un secondo filtro maschera l'assenza del primo.

## La feature in quattro righe

Una serie tracciata è **condivisa** («Per tutti») o **privata** di una persona («Solo per me»). La home guadagna una lente **«Tutto» / «Solo le mie»** accanto a «Mostra completate». Dal dettaglio si cambia il flag e si **azzera il tracciamento** scegliendo da che stagione e puntata ripartire.

## Cosa c'è già, per livello

- **Dominio** — `showVisibility.ts` (tipo discriminato del destinatario, invariante, predicati di visibilità e lente) e `progressReset.ts` (l'azzeramento, definitivo e senza eventi).
- **Confine dati** — contratto esteso con cambio di visibilità e azzeramento, implementati in **entrambe** le implementazioni; unicità per `providerShowId` + destinatario; costo misurato: zero composable e zero viste toccati.
- **Backup** — formato 2, campi di visibilità obbligatori, esportazione che normalizza.
- **Composable** — `useScopePreference.ts` nuovo; `useTrackedShows` filtra su visibile, poi lente, poi completate, con riepilogo calcolato prima della lente e conteggio completate dopo.

## Cosa manca

- **Fase 8** — composable di dettaglio e inserimento: cambio di visibilità, azzeramento, scelta della visibilità in fase di inserimento.
- **Fase 9** — home: la lente a schermo, il puntino sulle serie private, lo stato vuoto dedicato. **Qui va cablato `useScopePreference` in `HomeView.vue`**, passandolo come terzo argomento a `useTrackedShows`: vedi il punto 1 qui sopra.
- **Fase 10** — dettaglio e inserimento a schermo: il comando «Chi vede questa serie», il dialogo di azzeramento che riusa il picker esistente, la scelta della visibilità nell'inserimento.
- **Fase 11** — verifica finale: quattro comandi verdi, 23 criteri dimostrati uno per uno, mutazioni deliberate.

## Decisioni già prese, da non riaprire

Sono 23, tutte nella SPEC, e la sezione «Da decidere» è vuota. Le tre che si dimenticano più facilmente:

- **Il reset non è annullabile** e riporta la serie allo stato di una appena inserita: eventi cancellati, `lastViewedAt` assente, `addedAt` all'istante del reset, revisione incrementata. `addedAt` significa ora «quando è cominciato il tracciamento attuale».
- **Il confine è di comodità, non di sicurezza**: il filtro vive nel client e `firestore.rules` non si tocca. Il dettaglio aperto per indirizzo diretto mostra la serie anche all'altra persona.
- **Due schede della stessa serie possono coesistere** e si accettano senza avviso: in lista si distinguono perché la privata porta il puntino.

## Fuori piano, già fatto in questa sessione

- `.wrangler/**` aggiunto alle esclusioni di ESLint: `npm run lint` analizzava i file generati da wrangler e restituiva 132 errori su albero pulito.
- Corretto un **difetto preesistente** autorizzato dall'utente: una puntata senza data di uscita risultava confermabile come vista, e siccome il segnalibro marca implicitamente tutte le precedenti, un tocco poteva dare per viste intere stagioni non ancora uscite.
- Tolto il ramo di rifiuto dedicato al backup in formato 1: non esistono file di quel formato, e il messaggio generico nomina già versione attesa e trovata.

## Da tenere d'occhio

`src/views/HomeView.spec.ts` va in timeout in modo intermittente durante la suite completa, ed è **preesistente**. Rilanciato da solo passa sempre. Se comincia a capitare spesso va affrontato, perché rende inaffidabile il controllo di fine fase.

## Pipeline da seguire

Per ogni fase: annuncio in una riga, delega a `clean-code-implementer`, seconda invocazione in modalità verifica, spunta e registro nel piano. `solid-srp-reviewer` non si applica (non è Java).

## Prima di far provare qualcosa all'utente

Node 22 via `fnm` (la seconda riga non è facoltativa), incremento di `src/appVersion.ts`, `npm run build`, poi `npx wrangler pages deploy dist --project-name tv-tracker --branch master --commit-dirty=true`. La procedura completa è in `CLAUDE.md`.
