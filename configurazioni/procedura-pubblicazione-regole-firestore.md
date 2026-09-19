# Procedura: pubblicare le regole Firestore e creare i due membri del nucleo

Questa procedura la esegui **tu, dalla console di Firebase** (`https://console.firebase.google.com`, progetto `tv-tracker-eea72`). Nessuno di questi passaggi si fa da codice: sono azioni che solo chi ha accesso alla console può compiere, e vanno fatte **una volta sola**.

Oggi Firestore è bloccato del tutto (regola `allow read, write: if false`): l'app, finché resta in modalità locale (`VITE_LOCAL_MODE=true` in `.env.local`), non ne risente. Questa procedura prepara Firestore per il giorno in cui si deciderà di spegnere la modalità locale — **non la spegne**.

Segui i passi nell'ordine. Ogni passo indica come verificare che sia andato a buon fine prima di passare al successivo.

---

## Passo 1 — Pubblicare le regole di sicurezza

1. Apri la console di Firebase, progetto `tv-tracker-eea72`.
2. Nel menu a sinistra vai su **Firestore Database**, poi sulla scheda **Regole** (in inglese *Rules*).
3. Cancella tutto il contenuto della casella di testo e incolla esattamente questo blocco (è lo stesso contenuto del file `firestore.rules` nella cartella principale del progetto):

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isHouseholdMember(householdId) {
      return request.auth != null &&
          exists(/databases/$(database)/documents/households/$(householdId)/members/$(request.auth.uid));
    }

    function belongsToShow(showId) {
      return request.resource.data.trackedShowId == showId;
    }

    match /households/{householdId} {
      allow read, write: if false;

      match /members/{memberId} {
        allow read, write: if false;
      }

      match /appMeta/{configId} {
        allow read, write: if false;
      }

      match /trackedShows/{showId} {
        allow read, write: if isHouseholdMember(householdId);

        match /progressEvents/{eventId} {
          allow read, delete: if isHouseholdMember(householdId);
          allow create, update: if isHouseholdMember(householdId) && belongsToShow(showId);
        }
      }
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

4. Premi **Pubblica** (*Publish*). La console conferma con un messaggio verde.

**Cosa proteggono queste regole, in parole semplici:**
- Nessuno può leggere o scrivere nulla se non ha fatto login (niente accesso anonimo).
- Chi ha fatto login può leggere e scrivere le serie (`trackedShows`) e i relativi eventi (`progressEvents`) **solo** se il suo utente Firebase risulta registrato come membro del nucleo (documento dentro `members`, passo 2). Un estraneo autenticato con un account qualsiasi resta fuori.
- Un evento di avanzamento (`progressEvents`) può essere creato o modificato solo se dichiara di appartenere alla serie sotto cui viene scritto: non è possibile agganciare un evento a una serie diversa da quella del suo percorso.
- I documenti `members` e `appMeta/config` non sono mai leggibili né scrivibili direttamente dall'app: servono solo come elenco interno che le regole consultano, e si gestiscono a mano dalla console (passi 2 e 3).
- Qualunque percorso non elencato esplicitamente resta bloccato per difetto.

---

## Passo 2 — Creare i due documenti `members/{uid}`

Ogni membro del nucleo (Fabio e Irene) deve avere un documento dentro `households/{householdId}/members/`, con l'**ID del documento uguale al suo `uid` Firebase**. Il contenuto del documento non viene mai letto dall'app: conta solo che il documento esista.

**Dove trovare i due valori che ti servono:**
- l'`householdId` è nel file `.env.local` alla riga `VITE_FIREBASE_HOUSEHOLD_ID`;
- i due `uid` sono nel file `configurazioni/utenze.txt` (righe «Fabio» e «Irene»), oppure in `.env.local` alle righe `FIREBASE_FABIO_UID` e `FIREBASE_IRENE_UID`.

Passaggi in console:

1. Vai su **Firestore Database** → scheda **Dati** (*Data*).
2. Se la collezione `households` non esiste ancora, creala con **Avvia raccolta** (*Start collection*), ID `households`.
3. Crea (o apri, se esiste già) il documento con ID uguale al valore di `VITE_FIREBASE_HOUSEHOLD_ID`.
4. Dentro quel documento, crea la sottocollezione `members` (**Avvia raccolta** → ID `members`).
5. Crea un documento con **ID documento = uid di Fabio** (copiato da dove indicato sopra). Come contenuto, aggiungi un solo campo di comodo per riconoscerlo a occhio in console: campo `displayName`, tipo stringa, valore `Fabio`.
6. Ripeti il punto 5 per Irene: ID documento = uid di Irene, campo `displayName` = `Irene`.

**Verifica:** sotto `households/{householdId}/members` devono comparire esattamente due documenti, ciascuno con l'ID uguale a un `uid`.

---

## Passo 3 — Inizializzare `appMeta/config`

Questo documento non è ancora letto da nessuna parte del codice: lo creiamo solo per rispettare la struttura pianificata, così è pronto se in futuro servirà.

1. Dentro il documento `households/{householdId}`, crea la sottocollezione `appMeta` (**Avvia raccolta** → ID `appMeta`).
2. Crea un documento con **ID documento = `config`**.
3. Aggiungi un campo `schemaVersion`, tipo numero, valore `1`.

---

## Passo 4 — Prove negative con il simulatore delle regole

Prima di considerare le regole pronte, verifica che respingano chi non deve entrare. La console di Firebase ha un simulatore dentro la stessa scheda **Regole**, di solito una sezione o pulsante **Rules Playground** / **Simulatore**.

Per ognuna delle tre prove seguenti, imposta:
- **Tipo di operazione**: `get` (lettura di un documento singolo).
- **Percorso del documento** (*Location*): `/databases/(default)/documents/households/<householdId>/trackedShows/prova-simulazione`, sostituendo `<householdId>` con il valore reale (da `.env.local`).

### Prova 1 — utente autenticato ma non membro (deve essere RESPINTA)
- Spunta **Autenticato** (*Authenticated*).
- Nel campo `uid` inserisci un valore inventato, per esempio `utente-non-registrato`.
- Esegui la simulazione: il risultato atteso è **Negato/Rifiutato** (in inglese *Denied*).

### Prova 2 — utente non autenticato (deve essere RESPINTA)
- Lascia **deselezionata** la casella Autenticato (nessun uid).
- Esegui la simulazione: il risultato atteso è **Negato/Rifiutato**.

### Prova 3 — un membro reale (deve essere CONSENTITA)
- Spunta **Autenticato**.
- Nel campo `uid` incolla uno dei due uid reali (Fabio o Irene, dallo stesso posto del passo 2).
- Esegui la simulazione: il risultato atteso è **Consentito/Approvato** (in inglese *Allowed*).

Se una delle tre prove non dà il risultato atteso, **non procedere oltre**: rileggi il passo 1 (le regole pubblicate devono coincidere esattamente con quelle sopra) e il passo 2 (l'uid usato nella prova 3 deve corrispondere esattamente a un documento presente sotto `members`).

---

## Cosa NON fare ancora

Non modificare `VITE_LOCAL_MODE` in `.env.local`. Finché vale `true` l'app continua a funzionare in modalità locale, indipendentemente da questa procedura. L'attivazione di Firestore nell'app è un passo successivo e separato, da fare solo dopo che tutte le prove del passo 4 sono superate.
