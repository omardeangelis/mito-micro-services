import { type Practice, type PracticeWrite } from "@/lib/types/schemas"
import { cleanObject } from "@/lib/utils"

export type HandlePracticesUpdateResponse = Promise<{
  practicesToCreate: PracticeWrite[]
  practicesToUpdate: PracticeWrite[]
}>

export async function handlePracticesUpdate(
  values: PracticeWrite[],
  existingPractices: Practice[]
): HandlePracticesUpdateResponse {
  const practicesIds = values.map((practice) => practice.praticaId)

  if (!practicesIds.length) {
    return {
      practicesToCreate: values,
      practicesToUpdate: [],
    }
  }

  const practicesToCreate = [] as PracticeWrite[]
  const practicesToUpdate = [] as PracticeWrite[]

  for (const practice of values) {
    const newPractice = {
      ...practice,
      dataEstinzione: practice.dataEstinzione
        ? new Date(Date.parse(practice.dataEstinzione as unknown as string))
        : null,
      dataLiquidazione: new Date(
        Date.parse(practice.dataLiquidazione as unknown as string)
      ),
    } as PracticeWrite
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

  return { practicesToCreate, practicesToUpdate }
}
