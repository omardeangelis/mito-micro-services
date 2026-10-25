// Le colonne dei filtri avanzati stanno nel dominio, condivise con il server
export {
  CUSTOMER_FILTER_MAP,
  CUSTOMER_FILTER_QUERY_MAP,
  PRATICA_FILTER_MAP,
  PRATICA_FILTER_QUERY_MAP,
} from "@mito/domain/filters/advanced"

// Call-state columns and sorts that moved to Contatti. A saved preference or
// link can still name them: the page ignores them (AC59, AC60)

/** Ids of the table columns Clienti no longer has. */
export const REMOVED_CUSTOMER_COLUMN_IDS: readonly string[] = [
  "Stato Chiamate",
  "Contattato il",
  "Priorità",
]

/** Values of `order_by` that sorted by one of those columns. */
export const REMOVED_CUSTOMER_ORDER_BY: readonly string[] = [
  "contattato",
  "priority",
]
