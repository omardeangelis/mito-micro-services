---
domain: crm
type: concept
status: implemented
ingested: true
last_ingested: 2026-10-23
links:
  - "[[specs/crm/gestione-operatori/SPEC]]"
  - "[[specs/crm/gestione-operatori/IMPLEMENTATION-NOTES]]"
  - "[[specs/crm/gestione-operatori/REPORT]]"
  - "[[domains/crm/crm]]"
  - "[[domains/crm/flows/preferenze-di-layout-nel-browser]]"
  - "[[chore/migrazione-effect]]"
created: 2026-10-23
updated: 2026-10-23
---

# Preferenze di layout

## Definition

Le scelte di layout di chi usa il gestionale: se la sidebar è chiusa, e quali colonne sono nascoste nelle tabelle di Clienti, Pratiche e Contatti. Sono 4 chiavi, con la forma di `UserPreference` di `@mito/domain/schemas`.

Appartengono al **browser**, non all'utente. Stanno in cookie scritti dal client, uno per chiave, e il server non le salva (decisione 5 e D9 della spec). Ogni browser ha le sue: non si sincronizzano fra dispositivi, ed è un costo accettato.

Non dicono niente su chi è l'utente. Ruolo e operatore vengono sempre dalla sessione, mai dai cookie.

## Attributes

| Chiave | Cookie | Valore | Chi la usa |
|---|---|---|---|
| `dashboardCollapsed` | `mito-pref-ds` | booleano | la sidebar (`DashboardLayout`) |
| `customerTableVisibleColumns` | `mito-pref-ct` | lista di id di colonna | la tabella Clienti |
| `practicesTableVisibleColumns` | `mito-pref-pt` | lista di id di colonna | la tabella Pratiche |
| `contactTableVisibleColumns` | `mito-pref-cot` | lista di id di colonna | la tabella Contatti (`ContactColumnsMenu`) |

### Regole dei cookie

- **Scrittura:** solo dal client, al click. `path=/`, `SameSite=Lax`, scadenza 1 anno, valore JSON con encoding URI. Ogni setter scrive solo il suo cookie.
- **Lettura:** lo stesso parser sul client (`document.cookie`) e nei server component (`cookies()` di `next/headers`), in `src/lib/preferences/`.
- **Tolleranza:** un cookie mancante o illeggibile (encoding, JSON, tipo sbagliato) vale come assente, senza eccezioni. Una lista che nomina colonne non più esistenti non nasconde nulla.
- **Dimensioni:** Clienti ha circa 32 colonne; una lista resta sotto 1 KB, lontano dal limite di 4 KB di un cookie.
- **Logout:** cancella i 4 cookie e lo store.
- **Contenuto non sensibile:** niente `Secure` e nessun dato di identità. Chi trova i cookie di un altro utente vede solo quali colonne erano nascoste.

### Dove vivono nel client

- **Lo store zustand** (`src/store/userPreferences.ts`) tiene lo stato a schermo e scrive i cookie. Non usa più `persist` né localStorage: c'è una sola copia nel browser.
- **Le tabelle** leggono dallo store. La prop che arriva dal server, letta dai cookie della richiesta, vale solo per il primo render.

### Dove vivevano prima

- La colonna `users.preferences` (testo JSON) e la scrittura con `POST /api/user/preferences`, che il backend serviva costruendo una `NextRequest` e che richiamava tRPC su sé stesso. Una route e 4 procedure `update*` esistono ancora, senza chiamanti nel client, fino alla PR P2. La colonna resta anche dopo (TD1 di [[chore/migrazione-effect]] §7).

## Related flows

- [[domains/crm/flows/preferenze-di-layout-nel-browser]]: la scelta, il primo render dai cookie, la copia una tantum dal server, il logout e il passo futuro della P2.

## [Source: gestione-operatori]

- Spec: AC31–AC35, decisione 5, D9 e le Technical Notes "Perché cookie e non localStorage o IndexedDB" di [[specs/crm/gestione-operatori/SPEC]]. Implementato nella PR P1; la P2 non è ancora fatta.
- **Invariante del rendering** (review della P1, [[specs/crm/gestione-operatori/REPORT]]): oggi niente sotto `UserPreferenceProvider` è reso dal server, quindi i cookie della richiesta servono da seme. Se il dashboard venisse reso dal server, lo store andrebbe seminato dai cookie della richiesta.
- **Colonne di Pratiche:** il vecchio codice le salvava sotto la chiave sbagliata, e il server non le ha mai tenute. La copia una tantum non ne porta.
