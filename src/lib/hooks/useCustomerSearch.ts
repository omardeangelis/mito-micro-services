"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  type CustomerSearchBy,
  parseCustomerSearchBy,
} from "@/lib/constants/customerSearch"

/**
 * Stato della ricerca nella pagina Clienti.
 *
 * - `q` e `active` sono la ricerca in corso, letta dall'URL a ogni render con
 *   la stessa funzione della pagina: il badge mostra il campo in cui il
 *   server sta cercando.
 * - `selected` è la voce del selettore per la prossima ricerca. Back e avanti
 *   sulla stessa pagina non rimontano il componente, quindi con una ricerca
 *   in corso segue l'URL; senza (dopo il cambio di voce, che toglie `q`)
 *   resta la scelta dell'utente.
 */
export function useCustomerSearch() {
  const searchParams = useSearchParams()
  const q = searchParams.get("q") ?? ""
  const active = parseCustomerSearchBy(searchParams.getAll("search_by"))
  const [selected, setSelected] = useState<CustomerSearchBy>(active)

  useEffect(() => {
    if (q) setSelected(active)
  }, [q, active])

  return { q, active, selected, setSelected }
}
