import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { practices } from "@mito/db/schema/pratiche"
import { operators } from "@mito/db/schema/operators"
import { query } from "../../effect/db"

/**
 * The practice with this `praticaId`, with its operator, or `undefined` if
 * there is none.
 */
export const getPracticeById = (praticaId: string) =>
  query((client) =>
    client
      .select({
        id: practices.id,
        praticaId: practices.praticaId,
        productId: practices.productId,
        state: practices.state,
        importoFinanziato: practices.importoFinanziato,
        importoErogato: practices.importoErogato,
        dataLiquidazione: practices.dataLiquidazione,
        importoRata: practices.importoRata,
        rateTotali: practices.rateTotali,
        ratePagate: practices.ratePagate,
        chatId: practices.chatId,
        updatedAt: practices.updatedAt,
        desPuntoVendita: practices.desPuntoVendita,
        operator: {
          id: operators.id,
          name: operators.name,
          surname: operators.surname,
        },
      })
      .from(practices)
      .leftJoin(operators, eq(operators.id, practices.operatorId))
      .where(eq(practices.praticaId, praticaId))
  ).pipe(Effect.map((result) => result[0]))

/** The distinct regions of the practices, as `{ region }` rows. */
export const listRegions = () =>
  query((client) =>
    client
      .selectDistinct({
        region: practices.region,
      })
      .from(practices)
  )
