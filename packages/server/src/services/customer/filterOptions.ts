import { desc, max, sql } from "drizzle-orm"
import { Effect } from "effect"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { query } from "../../effect/db"

/** The distinct towns of the customers, sorted. */
export const listComuni = () =>
  query((client) =>
    client
      .selectDistinct({
        comune: customers.comune,
      })
      .from(customers)
      .orderBy(customers.comune)
  )

/** The distinct offices (sedi) of the customers, sorted. */
export const listSedi = () =>
  query((client) =>
    client
      .selectDistinct({
        sede: customers.sede,
      })
      .from(customers)
      .orderBy(customers.sede)
  )

/** The distinct work fields (ambiti) of the customers, sorted. */
export const listAmbiti = () =>
  query((client) =>
    client
      .selectDistinct({
        ambito: customers.ambitoLavorativo,
      })
      .from(customers)
      .orderBy(customers.ambitoLavorativo)
  )

/** The distinct occupations of the customers, sorted. */
export const listJobs = () =>
  query((client) =>
    client
      .selectDistinct({
        job: customers.occupazione,
      })
      .from(customers)
      .orderBy(customers.occupazione)
  )

/**
 * The names of the import files of a table, the most recently imported first.
 * The "Nessuno" placeholder and the rows without a file are left out.
 */
export const listFileNames = (table: "customers" | "practices") => {
  const source = table === "customers" ? customers : practices
  // Nessun LIMIT: l'aggregazione scansiona comunque tutta la tabella, quindi
  // un limite non fa risparmiare nulla lato DB e il payload è irrisorio
  // (~9 KB per 270 nomi). In passato il limite tagliava in ordine alfabetico
  // e faceva sparire dal filtro i file appena caricati.
  return query((client) =>
    client
      .select({
        fileName: source.fileName,
        lastImportUpdate: max(source.lastImportUpdate),
      })
      .from(source)
      .where(
        sql`${source.fileName} IS NOT NULL AND ${source.fileName} != 'Nessuno'`
      )
      .groupBy(source.fileName)
      .orderBy(desc(max(source.lastImportUpdate)))
  ).pipe(
    Effect.map((fileNames) => fileNames.map((f) => ({ fileName: f.fileName })))
  )
}
