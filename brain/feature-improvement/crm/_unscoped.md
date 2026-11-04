---
domain: crm
type: feature-improvement
spec: null
links:
  - "[[chore/crm/design-import-e-assegnazione-wave]]"
  - "[[personas]]"
created: 2026-11-03
updated: 2026-11-03
---

# Feature improvement — CRM, fuori da una spec

## Liste di chiamata promozionali generate dalla piattaforma
- **Status:** open
- **Proposed:** 2026-11-03, da `create-spec` durante l'impostazione della spec di import e assegnazione delle Wave; accettata da Omar come evolutiva da proporre al cliente
- **Observed:** le Promozioni (compleanno, Natale e simili) arrivano come file nel formato Wave, con dentro già le persone da chiamare ([[personas]]). Il CRM salva la data di nascita dei clienti (`customers.birthday_date`, dalla colonna «Data di Nascita» dell'import), ma non la usa per costruire liste
- **Improvement:** la piattaforma genera da sola le liste di una promozione dai dati che ha, per esempio i clienti che compiono gli anni nel mese, con una finestra di chiamata per persona intorno alla data, invece di aspettare il file della banca
- **Why it matters:** l'Admin non deve più aspettare e caricare un file per ogni promozione ricorrente. L'Operatore chiama ogni persona nel momento giusto, non entro una scadenza unica valida per tutta la lista
- **Size:** large
- **Spec:** none
