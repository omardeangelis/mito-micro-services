---
domain: crm
type: tech-debt
links:
  - "[[specs/crm/home-operatore/SPEC]]"
  - "[[specs/crm/home-operatore/IMPLEMENTATION-NOTES]]"
created: 2026-11-05
updated: 2026-11-05
---

# Tech debt: Home dell'operatore

- **Indice per attore.** `getMyDay` e `getMyCalls` filtrano `actor_operator_id` sul solo indice di `created_at`. Un indice `(actor_operator_id, created_at)` è aggiuntivo: da valutare con EXPLAIN su dati reali.
- **Cronologia del foglio.** Dopo «Vai al contatto attivo» nel foglio, l'indietro riapre il contatto di partenza: la chiusura sostituisce solo l'ultima voce.
- **`/dashboard/lavoro` e `/dashboard`.** Le due rotte condividono le query: passando dall'una all'altra `gcTime: 0` non svuota la cache, e una riga chiusa riappare per un momento.
- **Avvisi di una visita precedente.** Il link porta alla rotta del contatto anche su una home riaperta.
- **`useCurrentUser`.** Le altre pagine non hanno `retryOnMount: false`. Lo scheletro del provider ora compare solo al primo caricamento, ma il ciclo sulle letture non è stato provato su `ProfilePage`, `SettingsPage`, `ImportPage`, `WavePage`.
- **`DataSection.tsx`.** `OperatorDataSection` e `UnknownRole` non sono più raggiungibili: si tolgono con `home-admin`.
