import { type DateRangePickerValue } from "@tremor/react"
import type { WorkerGenericResponse } from "../../types/workers"
import { type Operator, type User } from "@/lib/types/schemas"
// import {
//   formatCurrencyColumn,
//   formatTaskClosedAt,
//   type FetchTask,
// } from "@/app/api/export/utils"
// import { type FetchDefaultResponse } from "@/app/api/export/[export]/fetchDefault/route"
// import { type DefaultExportResponse } from "@/app/api/export/[export]/defaultExport/route"
// import { type CallExportResponse } from "@/app/api/export/[export]/callExport/route"

type ExportWorkerData = [string, DateRangePickerValue, string]
const exportWorkerFn = function () {
  self.onmessage = async function (e: MessageEvent<ExportWorkerData>) {
    const formatFileName = (filename: string, name: string) => {
      if (name === "") return filename
      // Divide la stringa filename in due parti
      const firstPart = filename.split(/\d/)[0] // Prima parte fino al primo numero
      const restPart = filename.substring(firstPart ? firstPart.length : 0) // Seconda parte dopo il primo numero
      // Formatta il nome: tutto minuscolo e spazi sostituiti da trattini
      const formattedName = name.toLowerCase().replace(/\s+/g, "-")
      const result = `${firstPart}${formattedName}-${restPart}`
      return result
    }
    const formatDate = (date: Date) => {
      const day = new Intl.DateTimeFormat("it-IT", { day: "2-digit" }).format(
        date
      )
      const month = new Intl.DateTimeFormat("it-IT", {
        month: "2-digit",
      }).format(date)
      const year = new Intl.DateTimeFormat("it-IT", { year: "numeric" }).format(
        date
      )
      return `${day}-${month}-${year}`
    }
    const _formatDateForFileName = (date: Date | undefined) => {
      if (!date) return ""
      // Assicuriamoci che sia una Date valida
      const d = date instanceof Date ? date : new Date(date)
      if (isNaN(d.getTime())) return ""
      const day = d.getDate()
      const month = d.getMonth() + 1
      const year = d.getFullYear()
      return `${day}/${month}/${year}`
    }
    const userInfoResponse = await fetch(`${e.data[2]}/api/auth/user`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
    const userInfo = (await userInfoResponse.json()) as {
      user: User
      operator: Operator
      isAdmin: boolean
    }

    const createFilePath = (
      tabValue: string,
      interval: DateRangePickerValue,
      isAdmin: boolean,
      operatorSurname: string
    ) => {
      const from = formatDate(interval.from!)
      const to = formatDate(interval.to!)

      let fileName = ""
      switch (tabValue) {
        case "default":
          fileName = `export-clienti-pratiche-${from}-${to}.xlsx`
          break
        case "call":
          fileName = `export-chiamate-${from}-${to}.xlsx`
          if (!isAdmin) fileName = formatFileName(fileName, operatorSurname)
          break
      }
      return fileName
    }
    const message: WorkerGenericResponse<string> = [
      "loading",
      "Worker: Message received",
    ]
    self.postMessage(message)
    const tabValue = e.data[0]
    const interval = e.data[1]
    const _baseUrl = e.data[2]
    const _filePath = createFilePath(
      tabValue,
      interval,
      userInfo.isAdmin,
      userInfo.operator?.surname ?? ""
    )

    self.postMessage(message)
  }

  self.onerror = function (error) {
    console.error("WebWorker Error =>", error)
  }
}

//This stringifies the whole function
const codeToString = exportWorkerFn.toString()
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
