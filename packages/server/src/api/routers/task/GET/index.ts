import { operatorProcedure } from "../../../trpc"
import { selectCustomerSchema } from "@mito/domain/schemas"
import { z } from "zod"
import { getContactsInput } from "@mito/domain/contact/listInput"
import { runTrpc } from "../../../../effect/trpc"
import { actorOf } from "../../../../services/contact/actor"
import { contactErrorToTrpc } from "../../../../services/contact/errors"
import { getContactById as getContactByIdService } from "../../../../services/contact/getContactById"
import { getContacts as getContactsService } from "../../../../services/contact/getContacts"
import {
  getActiveTask as getActiveTaskService,
  listCustomerAlerts,
  listCustomersWithActiveAlerts,
} from "../../../../services/contact/queries"

const getCustomerAlertsInput = selectCustomerSchema.pick({ id: true })

// Storico completo degli alert di un cliente (attivi e risolti), su tutte le
// sue task passate e presenti, con il nome dell'operatore che ha risolto
// ciascun alert risolto. Usato dalla sezione "Alerts" nel dettaglio cliente.
export const getCustomerAlerts = operatorProcedure
  .input(getCustomerAlertsInput)
  .query(({ input }) => runTrpc(listCustomerAlerts(input.id)))

const getCustomersWithActiveAlertsInput = z.object({
  customerIds: z.array(z.string()),
})

// Dato un insieme di clienti, restituisce SOLO quelli che hanno un alert attivo
// (callback pianificato non ancora risolto) sulla loro task attiva. Serve al
// dialog di assegnazione massiva per avvertire l'operatore e chiedere conferma
// prima di sovrascrivere lo stato con una nuova chiamata.
export const getCustomersWithActiveAlerts = operatorProcedure
  .input(getCustomersWithActiveAlertsInput)
  .query(({ input }) =>
    runTrpc(listCustomersWithActiveAlerts(input.customerIds))
  )

const getActiveTaskInput = selectCustomerSchema.pick({
  id: true,
})

export const getActiveTask = operatorProcedure
  .input(getActiveTaskInput)
  .query(({ input }) => runTrpc(getActiveTaskService(input.id)))

/** The list of contacts, filtered, ordered and paged: see `getContacts`. */
export const getContacts = operatorProcedure
  .input(getContactsInput)
  .query(({ ctx, input }) =>
    runTrpc(getContactsService({ ...input, actor: actorOf(ctx.operator) }))
  )

/** The detail of a contact, read-only: see `getContactById`. */
export const getContactById = operatorProcedure
  .input(z.object({ id: z.string() }))
  .query(({ ctx, input }) =>
    runTrpc(
      getContactByIdService({ id: input.id, actor: actorOf(ctx.operator) }),
      contactErrorToTrpc
    )
  )
