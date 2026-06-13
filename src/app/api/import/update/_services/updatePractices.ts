import { db } from "@/server/db"
import { practices } from "@/server/db/schema/pratiche"
import { eq, inArray } from "drizzle-orm"
import { cleanObject } from "@/lib/utils"

import { type PracticeWriteWithInternalSort } from "../../process/_services/type"
export type HandlePracticesUpdateResponse = Promise<{
  practicesToCreate: PracticeWriteWithInternalSort[]
}>

export async function handlePracticesUpdate(
  values: PracticeWriteWithInternalSort[]
): HandlePracticesUpdateResponse {
  const practicesIds = values.map((practice) => practice.praticaId)

  if (!practicesIds.length) {
    return {
      practicesToCreate: values,
    }
  }

  const existingPractices = await db
    .select()
    .from(practices)
    .where(inArray(practices.praticaId, practicesIds))

  const practicesToCreate = [] as PracticeWriteWithInternalSort[]
  const practicesToUpdate = [] as PracticeWriteWithInternalSort[]

  for (const practice of values) {
    const newPractice = {
      ...practice,
      dataEstinzione: practice.dataEstinzione
        ? new Date(Date.parse(practice.dataEstinzione as unknown as string))
        : null,
      dataLiquidazione: new Date(
        Date.parse(practice.dataLiquidazione as unknown as string)
      ),
    } as PracticeWriteWithInternalSort
    const practiceToUpdate = existingPractices.find(
      (ep) => ep.praticaId === practice.praticaId
    )
    if (practiceToUpdate) {
      const cleanPracticeObject = cleanObject(newPractice)
      const oldRatePagate = practiceToUpdate.ratePagate
      const newRatePagate = cleanPracticeObject.ratePagate
      let lastImportUpdate = practiceToUpdate.lastImportUpdate
      if (oldRatePagate !== newRatePagate) {
        lastImportUpdate = new Date()
      }
      const {
        chatId: __,
        operatorId: ___,
        updatedAt: ____,
        rateTotali: _____,
        ...rest
      } = cleanPracticeObject
      const mergedPractice = { ...practiceToUpdate, ...rest, lastImportUpdate }
      practicesToUpdate.push(mergedPractice)
    } else {
      practicesToCreate.push(newPractice)
    }
  }

  if (practicesToUpdate.length) {
    const updatePromises = practicesToUpdate.map(async (practice) => {
      return db
        .update(practices)
        .set({
          praticaId: practice.praticaId,
          region: practice.region,
          desPuntoVendita: practice.desPuntoVendita,
          desConvenzionato: practice.desConvenzionato,
          subagente: practice.subagente,
          importoFinanziato: practice.importoFinanziato,
          importoErogato: practice.importoErogato,
          rateTotali: practice.rateTotali,
          importoRata: practice.importoRata,
          ratePagate: practice.ratePagate,
          debitoResiduo: practice.debitoResiduo,
          dataLiquidazione: practice.dataLiquidazione,
          dataEstinzione: practice.dataEstinzione,
          importoRichiesto: practice.importoRichiesto,
          paymentMethod: practice.paymentMethod,
          tassoPratica: practice.tassoPratica,
          state: practice.state,
          isWave: practice.isWave,
          fileName: practice.fileName,
          createdAt: practice.createdAt,
          updatedAt: practice.updatedAt,
          lastImportUpdate: practice.lastImportUpdate,
          productId: practice.productId,
          operatorId: practice.operatorId,
          chatId: practice.chatId,
        })
        .where(eq(practices.praticaId, practice.praticaId))
    })

    await Promise.all(updatePromises)
  }

  return { practicesToCreate }
}
