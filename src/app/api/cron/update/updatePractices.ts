import { eq, sql } from "drizzle-orm"
import { db } from "@/server/db"
import { practices } from "@/server/db/schema/pratiche"
import { DAYS_PER_RATE } from "../../_utils"

async function updatePractices(today: string) {
  const practicesToUpdate = await db.select().from(practices).where(sql`
      DATE("data_liquidazione") + INTERVAL '1 day' * "rate_pagate" * ${DAYS_PER_RATE} = ${today}
    `)

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
  }
}

export { updatePractices }

const shouldUpdate = (lastImportUpdate: Date): boolean => {
  const lastUpdate = lastImportUpdate.getTime()
  const threshold = Date.now() - DAYS_PER_RATE * 24 * 60 * 60 * 1000
  return lastUpdate < threshold
}
