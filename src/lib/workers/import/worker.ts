import { type ProcessAPIResponse } from "@/app/api/import/_types"
import { type HandleCustomerUpdateResponse } from "@/app/api/import/update/_services/updateCustomers"
import { type HandlePracticesUpdateResponse } from "@/app/api/import/update/_services/updatePractices"

export type ImportWorkerData = [Pick<ProcessAPIResponse, "created">, string]
const importWorkerFn = function () {
  self.onmessage = async function (e: MessageEvent<ImportWorkerData>) {
    self.postMessage(["loading", "Worker: Message received"])
    const baseUrl = e.data[1]
    const { created } = e.data[0]
    const SPLIT_SIZE = 30
    try {
      function splitArray<T>(array: T[], size: number): T[][] {
        const res = [] as T[][]
        for (let i = 0; i < array.length; i += size) {
          res.push(array.slice(i, i + size))
        }
        return res
      }

      const splitCustomersSize = Math.ceil(
        created.customerToCreate.length / SPLIT_SIZE
      )
      const splitPracticesSize = Math.ceil(
        created.practicesToCreate.length / SPLIT_SIZE
      )

      const splittedCustomers = splitArray(
        created.customerToCreate,
        splitCustomersSize
      )
      const splittedPractices = splitArray(
        created.practicesToCreate,
        splitPracticesSize
      )

      const updateCustomers = []
      for (const customers of splittedCustomers) {
        const response = await fetch(`${baseUrl}/api/import/update/customers`, {
          method: "PUT",
          body: JSON.stringify(customers),
        })
        updateCustomers.push(response)
      }

      const updatePractices = []
      for (const practices of splittedPractices) {
        const response = await fetch(`${baseUrl}/api/import/update/practices`, {
          method: "PUT",
          body: JSON.stringify(practices),
        })
        updatePractices.push(response)
      }

      if (
        updatePractices.some((res) => !res.ok) ||
        updateCustomers.some((res) => !res.ok)
      ) {
        return self.postMessage(["error", "Error importing data"])
      } else {
        const allUpdateResponsesCustomers = (await Promise.all(
          updateCustomers.filter((res) => res.ok).map((res) => res.json())
        )) as Awaited<HandleCustomerUpdateResponse>[]
        const allUpdateResponsesPractices = (await Promise.all(
          updatePractices.filter((res) => res.ok).map((res) => res.json())
        )) as Awaited<HandlePracticesUpdateResponse>[]

        console.log(allUpdateResponsesCustomers, "customers")
        console.log(allUpdateResponsesPractices, "practices")

        // Ensure data is sorted before splitting
        const customersToCreate = allUpdateResponsesCustomers
          .flatMap((cu) => cu.customersToCreate)
          .sort((a, b) => a.id!.localeCompare(b.id!))
        const customersToUpdate = allUpdateResponsesCustomers
          .flatMap((customer) => customer.customersToUpdate)
          .sort((a, b) => a.id!.localeCompare(b.id!))
        const practicesToCreate = allUpdateResponsesPractices.flatMap(
          (practice) => practice.practicesToCreate
        )

        const splitCustomerCreationSize = Math.ceil(
          customersToCreate.length / SPLIT_SIZE
        )

        const splitCustomersToCreate = splitArray(
          customersToCreate,
          splitCustomerCreationSize
        )

        const splitPracticesToCreateSize = Math.ceil(
          practicesToCreate.length / SPLIT_SIZE
        )

        const splitPracticesToCreate = splitArray(
          practicesToCreate,
          splitPracticesToCreateSize
        )

        for (const customers of splitCustomersToCreate) {
          const customerCreation = await fetch(
            `${baseUrl}/api/import/create/customers`,
            {
              method: "POST",
              body: JSON.stringify(customers),
            }
          )

          if (!customerCreation.ok) {
            return self.postMessage(["error", "Error importing data"])
          }
        }

        for (const practices of splitPracticesToCreate) {
          const practiceCreation = await fetch(
            `${baseUrl}/api/import/create/practices`,
            {
              method: "POST",
              body: JSON.stringify(practices),
            }
          )

          if (!practiceCreation.ok) {
            return self.postMessage(["error", "Error importing data"])
          }
        }

        // Sort customerToPraticaToCreate by internal_sort
        const customerToPraticaToCreate =
          created.customerToPraticaToCreate.sort(
            (a, b) => a._internal_sort - b._internal_sort
          )

        const sortedCustomersToCreate = customersToCreate.sort(
          (a, b) => a._internal_sort - b._internal_sort
        )

        const sortedCustomersToUpdate = customersToUpdate.sort(
          (a, b) => a._internal_sort - b._internal_sort
        )

        const sortedPracticesToCreate = practicesToCreate.sort(
          (a, b) => a._internal_sort - b._internal_sort
        )

        const totalParts = SPLIT_SIZE
        const partSize = Math.ceil(
          customerToPraticaToCreate.length / totalParts
        )

        let previousMaxInternalSort = 0

        for (let i = 0; i < totalParts; i++) {
          const start = i * partSize
          const end = (i + 1) * partSize

          const customersToCreateChunk = sortedCustomersToCreate.slice(
            start,
            end
          )
          const customersToUpdateChunk = sortedCustomersToUpdate.slice(
            start,
            end
          )

          const maxInternalSort = Math.max(
            ...customersToCreateChunk.map((cc) => cc._internal_sort),
            ...customersToUpdateChunk.map((cu) => cu._internal_sort)
          )

          const practicesToCreateChunk = sortedPracticesToCreate.filter(
            (p) =>
              p._internal_sort >= previousMaxInternalSort &&
              p._internal_sort <= maxInternalSort
          )

          previousMaxInternalSort = maxInternalSort

          const ctpReqPart = {
            customersToCreate: customersToCreateChunk.map((customer) => ({
              id: customer.id,
              fiscalCode: customer.fiscalCode,
              vatCode: customer.vatCode,
              tempID: customer.tempID,
            })),
            customersToUpdate: customersToUpdateChunk.map((customer) => ({
              id: customer.id,
              fiscalCode: customer.fiscalCode,
              vatCode: customer.vatCode,
              tempID: customer.tempID,
            })),
            practicesToCreate: practicesToCreateChunk.map((practice) => ({
              praticaId: practice.praticaId,
            })),
            customerToPraticaArray: customerToPraticaToCreate,
          }

          const ctpImport = await fetch(
            `${baseUrl}/api/import/create/customerToPratica`,
            {
              method: "POST",
              body: JSON.stringify(ctpReqPart),
            }
          )

          if (ctpImport.status !== 200) {
            return self.postMessage([
              "error",
              `Error importing data at step ${i + 1}`,
            ])
          }
        }

        return self.postMessage(["success", "Data Imported"])
      }
    } catch (_error) {
      console.error(_error, "DIOOOOOOO CANEEEE")
      return self.postMessage(["error", "Error importing data", _error])
    }
  }

  self.onerror = function (error) {
    console.error("WebWorker Error =>", error)
  }
}

//This stringifies the whole function
const codeToString = importWorkerFn.toString()
//This brings out the code in the bracket in string
const mainCode = codeToString.substring(
  codeToString.indexOf("{") + 1,
  codeToString.lastIndexOf("}")
)
//convert the code into a raw data
const blob = new Blob([mainCode], { type: "application/javascript" })
//A url is made out of the blob object and we're good to go
const worker_script = URL.createObjectURL(blob)

export default worker_script
