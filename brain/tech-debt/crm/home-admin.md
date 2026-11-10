---
domain: crm
type: concept
links:
  - "[[specs/crm/home-admin/SPEC]]"
ingested: false
last_ingested: null
created: 2026-11-05
updated: 2026-11-05
---

# Tech debt: Home dell'admin

- **Endpoint `HttpApi` senza client.** Togliendo le card dalla home, `getFinancedTotal`, `getFinancedAverage`, `getFinancedByBranch` e il loro gruppo restano nel contratto e nel server senza nessun chiamante in `apps/web`, insieme alla lettura di `getContactProgress` usata solo dalle card. Si tolgono con Next.js e tRPC, quando si spegne la vecchia home (`brain/chore/roadmap-nuovo-stack.md`): oggi non fanno parte di questa spec.
