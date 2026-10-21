import { eq, sql } from "drizzle-orm"
import { db } from "@mito/db"
import { practices } from "@mito/db/schema/pratiche"
import { DAYS_PER_RATE } from "@/lib/constants/practice"

/**
 * The `update` cron: adds the rate due `today` (yyyy-MM-dd) to the practices
 * not imported in the last 30 days. Returns how many it updated.
 */
async function updatePractices(today: string): Promise<number> {
  const practicesToUpdate = await db.select().from(practices).where(sql`
      DATE("data_liquidazione") + INTERVAL '1 day' * "rate_pagate" * ${DAYS_PER_RATE} = ${today}
    `)

  let updated = 0
  for (const practice of practicesToUpdate) {
    // if the last import was before than a month ago, don't update
    if (!shouldUpdate(practice.lastImportUpdate)) {
      continue
    }

    const newRatePagate =
      practice.rateTotali <= practice.ratePagate
        ? practice.ratePagate
        : practice.ratePagate + 1

    const newDebitoResiduo =
      Number(practice.debitoResiduo) - Number(practice.importoRata)

    const newState =
      newRatePagate == practice.rateTotali ? "Chiusa" : practice.state

    await db
      .update(practices)
      .set({
        ratePagate: newRatePagate,
        debitoResiduo: newDebitoResiduo.toString(),
        state: newState,
      })
      .where(eq(practices.id, practice.id))
    updated++
  }
  return updated
}

export { updatePractices }

const shouldUpdate = (lastImportUpdate: Date): boolean => {
  const lastUpdate = lastImportUpdate.getTime()
  const threshold = Date.now() - DAYS_PER_RATE * 24 * 60 * 60 * 1000
  return lastUpdate < threshold
}
