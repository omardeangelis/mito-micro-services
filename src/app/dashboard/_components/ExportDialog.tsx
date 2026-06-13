"use client"

import React, {
  createContext,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import * as Tabs from "@radix-ui/react-tabs"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { it } from "date-fns/locale"
import { addDays, format } from "date-fns"
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import { type User } from "next-auth"
import { type Operator } from "@/lib/types/schemas"
import {
  adjustFromAndTo,
  createFilePath,
  type FetchTask,
} from "@/lib/workers/export/service/utils"
import { type FetchDefaultResponse } from "@/app/api/export/[export]/fetchDefault/route"
import { generateDefaultWorkbook } from "@/lib/workers/export/service/defaultExport"
import { generateCallWorkbook } from "@/lib/workers/export/service/callExport"
import { saveExport } from "@/lib/workers/export/service/saveExport"
import { type DateRange } from "react-day-picker"
import { useForm } from "react-hook-form"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { CalendarIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const Context = createContext<{
  isLoading: boolean
  error: string | null
  exportSuccess: boolean | null
  storedFilePath: string | null
  dateRange: DateRange | undefined
  setDateRange: Dispatch<SetStateAction<DateRange | undefined>>
  setIsLoading: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
  setExportSuccess: Dispatch<SetStateAction<boolean | null>>
  setStoredFilePath: Dispatch<SetStateAction<string | null>>
}>({
  isLoading: false,
  error: null,
  exportSuccess: null,
  storedFilePath: null,
  dateRange: {
    from: new Date(),
    to: addDays(new Date(), 7),
  },
  setDateRange: () => void 0,
  setIsLoading: () => void 0,
  setError: () => void 0,
  setExportSuccess: () => void 0,
  setStoredFilePath: () => void 0,
})

const predefinedRanges = [
  { label: "Today", value: "today", from: new Date(), to: new Date() },
  {
    label: "Yesterday",
    value: "yesterday",
    from: addDays(new Date(), -1),
    to: addDays(new Date(), -1),
  },
  {
    label: "Last 7 days",
    value: "last7days",
    from: addDays(new Date(), -6),
    to: new Date(),
  },
  {
    label: "Last 30 days",
    value: "last30days",
    from: addDays(new Date(), -29),
    to: new Date(),
  },
  {
    label: "This month",
    value: "thisMonth",
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  },
]

function DateRangePicker({ children }: { children: React.ReactNode }) {
  const { dateRange, setDateRange } = useContext(Context)

  const form = useForm<{ dateRange: DateRange | undefined }>({
    defaultValues: {
      dateRange: dateRange,
    },
  })

  return (
    <Form {...form}>
      <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
        <FormField
          control={form.control}
          name="dateRange"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Scegli range personalizzato</FormLabel>
              <FormControl>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="date"
                        variant={"outline"}
                        className={cn(
                          "w-full justify-start bg-white text-left font-normal",
                          !dateRange && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (
                          dateRange.to ? (
                            <>
                              {format(dateRange.from, "LLL dd, y")} -{" "}
                              {format(dateRange.to, "LLL dd, y")}
                            </>
                          ) : (
                            format(dateRange.from, "LLL dd, y")
                          )
                        ) : (
                          <span>Pick a date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0"
                      align="start"
                      side="top"
                    >
                      <Calendar
                        initialFocus
                        locale={it}
                        mode="range"
                        defaultMonth={dateRange?.from}
                        selected={dateRange}
                        onSelect={(newDate) => {
                          setDateRange(newDate)
                          field.onChange(newDate)
                        }}
                        numberOfMonths={2}
                        captionLayout="dropdown"
                        fromYear={1900}
                        toYear={2050}
                      />
                    </PopoverContent>
                  </Popover>
                  <Select
                    onValueChange={(value) => {
                      const selectedRange = predefinedRanges.find(
                        (range) => range.value === value
                      )
                      if (selectedRange) {
                        setDateRange({
                          from: selectedRange.from,
                          to: selectedRange.to,
                        })
                        field.onChange({
                          from: selectedRange.from,
                          to: selectedRange.to,
                        })
                      }
                    }}
                  >
                    <SelectTrigger className="min-w-[200px] bg-white">
                      <SelectValue placeholder="Scegli tra i range predefiniti" />
                    </SelectTrigger>
                    <SelectContent>
                      {predefinedRanges.map((range) => (
                        <SelectItem key={range.value} value={range.value}>
                          {range.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {children}
      </form>
    </Form>
  )
}

export const ExportDialog = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportSuccess, setExportSuccess] = useState<boolean | null>(null)
  const [storedFilePath, setStoredFilePath] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(),
    to: addDays(new Date(), 7),
  })
  const ctx = useMemo(
    () => ({
      isLoading,
      setIsLoading,
      error,
      setError,
      exportSuccess,
      setExportSuccess,
      storedFilePath,
      setStoredFilePath,
      dateRange,
      setDateRange,
    }),
    [isLoading, error, exportSuccess, storedFilePath, dateRange]
  )
  return (
    <Context.Provider value={ctx}>
      <CompleteDialog />
    </Context.Provider>
  )
}

export const CompleteDialog = () => {
  const baseUrl = window?.location.origin
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false)
  const [tabsValue, setTabsValue] = useState("default")
  const {
    isLoading,
    error,
    exportSuccess,
    storedFilePath,
    dateRange,
    setIsLoading,
    setError,
    setExportSuccess,
    setStoredFilePath,
  } = useContext(Context)

  const exportData = useCallback(async () => {
    if (!dateRange) return
    setIsLoading(true)
    setError(null)
    setExportSuccess(null)

    // setta le ore del from alle 7.00 e le ore del to alle 23.59
    adjustFromAndTo(dateRange)
    console.log("dateRange", dateRange)

    // console.log("Fetch user info")
    const userInfoResponse = await fetch(`${baseUrl}/api/auth/user`, {
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

    // console.log("userInfo", userInfo)

    const filePath = createFilePath(
      tabsValue,
      dateRange,
      userInfo.isAdmin,
      userInfo.operator?.surname ?? ""
    )
    setStoredFilePath(filePath)

    // console.log("filePath", filePath)

    let workbook

    if (tabsValue === "default") {
      // console.log("fetching default")
      try {
        const res = await fetch(`${baseUrl}/api/export/export/fetchDefault`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filePath: filePath,
            interval: dateRange,
            tabValue: tabsValue,
          }),
        })

        const response = (await res.json()) as FetchDefaultResponse
        const { dbCustomers, dbPractices } = response
        // console.log("dbCustomers", dbCustomers)
        console.log("dbPractices", dbPractices)

        workbook = generateDefaultWorkbook(dbCustomers, dbPractices)
        // console.log("workbook", workbook)
      } catch (error) {
        console.error("Error fetching default", error)
        setIsLoading(false)
        setError("Errore nell'esportazione dei dati")
        return
      }
    } else {
      // console.log("fetching call")
      try {
        const res = await fetch(`${baseUrl}/api/export/export/fetchCall`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filePath: filePath,
            interval: dateRange,
            tabValue: tabsValue,
          }),
        })

        const response = (await res.json()) as {
          result: FetchTask
        }
        const result = response.result

        // console.log("responsedidio", result)
        workbook = await generateCallWorkbook(baseUrl, result, dateRange)
      } catch (error) {
        console.error("Error fetching call", error)
        setIsLoading(false)
        setError("Errore nell'esportazione dei dati")
        return
      }
    }

    const saveFileResponse = await saveExport(filePath, workbook)

    if (saveFileResponse.error) {
      setIsLoading(false)
      setError("Errore nel salvataggio del file")
    } else {
      setExportSuccess(true)
      setIsLoading(false)
    }
  }, [
    setIsLoading,
    setError,
    setExportSuccess,
    baseUrl,
    tabsValue,
    dateRange,
    setStoredFilePath,
  ])

  const downloadFile = useCallback(
    async (storedFilePath: string) => {
      const response = await fetch(
        `/api/export/download?n=${encodeURIComponent(storedFilePath)}`
      )
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      // Usa direttamente il nome del file, non estrarre dal percorso (perché contiene slash nella data)
      a.download = storedFilePath ?? "file" // Imposta il nome del file
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url) // Libera la memoria

      setIsLoading(false)
      setError(null)
      setExportSuccess(null)
      setIsDialogOpen(false)
    },
    [setError, setExportSuccess, setIsLoading]
  )

  const handleDialogClose = useCallback(() => {
    setError(null)
    setExportSuccess(null)
    setIsDialogOpen(false)
  }, [setError, setExportSuccess])

  const LoadingUpdate = () => {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Esportazione in corso</DialogTitle>
          <DialogDescription>Attendere prego...</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-28 items-center justify-center">
          <LoadingSpinner />
        </div>
      </>
    )
  }

  const SuccessUpdate = () => {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Esportazione completata</DialogTitle>
          <DialogDescription>
            I dati sono stati esportati correttamente
          </DialogDescription>
        </DialogHeader>
        <Button
          className="w-full"
          variant="default"
          onClick={() => downloadFile(storedFilePath!)}
        >
          Scarica il file
        </Button>
      </>
    )
  }

  const ErrorUpdate = () => {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Errore</DialogTitle>
          <DialogDescription>
            C&apos;è stato un errore durante l&apos;esportazione dei dati
          </DialogDescription>
        </DialogHeader>
        <Button
          className="w-full"
          variant="default"
          onClick={() => handleDialogClose()}
        >
          Chiudi
        </Button>
      </>
    )
  }

  return (
    <Dialog modal onOpenChange={setIsDialogOpen} open={isDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Esporta</Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-2xl">
        {isLoading ? (
          <LoadingUpdate />
        ) : error ? (
          <ErrorUpdate />
        ) : exportSuccess === true ? (
          <SuccessUpdate />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Esporta i dati</DialogTitle>
              <DialogDescription>
                Clicca sul bottone per scaricare i dati in formato CSV
              </DialogDescription>
            </DialogHeader>
            <Tabs.Root
              defaultValue="default"
              value={tabsValue}
              onValueChange={setTabsValue}
              className="flex w-full"
            >
              <Tabs.List className="flex w-full items-stretch gap-4">
                <Tabs.Trigger value="default">
                  <Card
                    className={cn(
                      "flex-1 p-1",
                      tabsValue === "default"
                        ? "border-2 border-primary"
                        : "border-2 border-transparent"
                    )}
                  >
                    <CardHeader className="items-start p-1 text-left">
                      <CardTitle className="text-lg">Standard</CardTitle>
                      <CardDescription className="text-sm">
                        Esporta clienti e pratiche che sono state aggiornate
                        nell&apos;intervallo scelto
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Tabs.Trigger>
                <Tabs.Trigger value="call">
                  <Card
                    className={cn(
                      "flex-1 p-1",
                      tabsValue === "call"
                        ? "border-2 border-primary"
                        : "border-2 border-transparent"
                    )}
                  >
                    <CardHeader className="items-start p-1 text-left">
                      <CardTitle className="text-lg">Chiamate</CardTitle>
                      <CardDescription className="text-sm">
                        Chiamate effettuate nell&apos;intervallo scelto e le
                        note relative al client
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Tabs.Trigger>
              </Tabs.List>
            </Tabs.Root>
            <div className="mt-4">
              <DateRangePicker>
                <Button
                  variant="default"
                  className="w-full"
                  onClick={exportData}
                >
                  Esporta dati
                </Button>
              </DateRangePicker>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
