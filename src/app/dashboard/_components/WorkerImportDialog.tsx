"use client"

import React, { useCallback, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { useImportWorkerContext } from "@/app/_context/ImportWorker"
import { env } from "@/env"
import { type ProcessAPIResponse } from "@/app/api/import/_types"
import { isHeaderError, type HeadersErrorCodes } from "@/lib/types/errors"
import { type Nullable } from "@/lib/types"
import { processFile } from "@/lib/workers/import/service/process"
import { type ImportWorkerData } from "@/lib/workers/import/worker"

const errorMap = {
  headers: "Contralla che gli headers del file siano alla prima riga",
  all: "Tutte le pratiche hanno errori, controlla il file",
  size: "Il file non può essere più grande di 4.4MB",
} satisfies Record<HeadersErrorCodes | "size", string>

const _baseUrl = env.NEXT_PUBLIC_BASE_URL

export const WorkerImportDialog = () => {
  const baseUrl = window?.location.origin
  const role = useUserPreferenceContext((state) => state.role)
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false)
  const [isInputFull, setIsInputFull] = useState<boolean>(false)
  const importResponse = useRef<Pick<
    ProcessAPIResponse,
    "created" | "errors" | "headers"
  > | null>(null)

  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [errorType, setErrorType] = useState<HeadersErrorCodes | "size" | null>(
    null
  )

  const formRef = useRef<HTMLFormElement>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const { terminateWorker, connectWorker, postWorkerMessage } =
    useImportWorkerContext()

  const onDownload = useCallback(async () => {
    if (!error) return
    window.open(`${baseUrl}/api/export/download?n=${encodeURIComponent(error)}`)
    setError(null)
    setIsProcessing(false)
    terminateWorker()
  }, [baseUrl, error, terminateWorker])

  const onContinue = useCallback(() => {
    connectWorker()
    postWorkerMessage([
      importResponse.current!,
      baseUrl,
    ] satisfies ImportWorkerData)
    setIsProcessing(false)
    setIsDialogOpen(false)
    setError(null)
    setErrorType(null)
  }, [baseUrl, connectWorker, postWorkerMessage])

  const handleImport = useCallback(async () => {
    setIsProcessing(true)
    const file = inputRef.current!.files![0]!
    const res = await processFile(file, file.name)
    const { error, created, errors, headers } = res

    if (res.status && res.status !== 200) {
      if (isHeaderError(error)) {
        setErrorType(error.code)
        setError(errorMap[error.code])
        setIsProcessing(false)
      } else {
        if (res.status === 413) {
          setErrorType("size")
          setError(errorMap.size)
        }
        setIsProcessing(false)
        setError("Errore nell'importazione dei dati")
        throw new Error("Error importing data")
      }
    } else {
      importResponse.current = {
        created,
        errors,
        headers,
      } as unknown as ProcessAPIResponse
      if (errors?.practicesWithErrors.length) {
        console.error("Error importing data")
        const data = {
          columnsArray: headers,
          practicesWithErrors: errors.practicesWithErrors,
        }
        fetch(`${baseUrl}/api/export/importError`, {
          method: "POST",
          body: JSON.stringify(data),
        })
          .then(async (res) => {
            if (res.status === 200) {
              const { filePath } = (await res.json()) as { filePath: string }
              setError(filePath)
            } else {
              throw new Error("Error exporting data")
            }
          })
          .catch((err) => {
            console.log("Errore", err)
          })
          .finally(() => {
            setIsProcessing(false)
          })
      } else {
        onContinue()
      }
    }
  }, [baseUrl, onContinue])

  const handleDialogOpen = useCallback((value: boolean) => {
    setIsDialogOpen(value)
    if (!value) {
      setError(null)
      setErrorType(null)
      setIsProcessing(false)
    }
  }, [])

  const onClose = useCallback(() => {
    setError(null)
    setErrorType(null)
    setIsProcessing(false)
    setIsDialogOpen(false)
  }, [])
  if (role !== "ADMIN") return null
  return (
    <Dialog onOpenChange={handleDialogOpen} open={isDialogOpen}>
      <DialogTrigger asChild>
        <Button>Nuovo import</Button>
      </DialogTrigger>
      {isProcessing ? (
        <DialogLoading />
      ) : (error ?? errorType) ? (
        <DialogError
          onDownload={onDownload}
          onContinue={onContinue}
          onClose={onClose}
          type={errorType}
          num_errors={
            importResponse.current?.errors.practicesWithErrors.length ?? 0
          }
        />
      ) : (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Carica un file</DialogTitle>
            <DialogDescription>
              Carica un file per importare i dati
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex w-full items-center gap-2"
            onSubmit={handleImport}
            ref={formRef}
          >
            <Input
              type="file"
              placeholder={`Importa il file`}
              className="w-full"
              ref={inputRef}
              onChange={() => setIsInputFull(!!inputRef.current?.files)}
            />
            <Button
              variant={isInputFull ? "default" : "disabled"}
              disabled={!isInputFull}
              type="submit"
            >
              Carica file
            </Button>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}

const DialogLoading = () => {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Processando le pratiche</DialogTitle>
        <DialogDescription>
          Controllo che tutte le pratiche siano idonee al caricamento
        </DialogDescription>
      </DialogHeader>
      <div className="flex min-h-28 justify-center text-sm text-secondary-foreground">
        Caricamento, potrebbe volerci alcuni minuti
      </div>
    </DialogContent>
  )
}

type DialogPracticesErrorProps = {
  onDownload: () => void
  onContinue: () => void
  num_errors: number
}

const DialogHeadersError = (props: { error: string; onClose: () => void }) => {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Errore</DialogTitle>
        <DialogDescription>
          {errorMap[props.error as HeadersErrorCodes]}
        </DialogDescription>
      </DialogHeader>
      <Button onClick={props.onClose}>Chiudi</Button>
    </DialogContent>
  )
}

const DialogPracticesError = (props: DialogPracticesErrorProps) => {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {props.num_errors
            ? `Ci sono ${props.num_errors} pratiche con errori`
            : "Errore nell'import delle pratiche"}
        </DialogTitle>
        <DialogDescription>
          Scarica il report per vedere quali pratiche hanno errori e quali sono
          oppure continua lo stesso
        </DialogDescription>
      </DialogHeader>
      <div className="flex w-full gap-2">
        <Button className="w-full" variant="default" onClick={props.onDownload}>
          Scarica il Report
        </Button>
        <Button className="w-full" variant="ghost" onClick={props.onContinue}>
          Continua lo stesso
        </Button>
      </div>
    </DialogContent>
  )
}

type DialogErrorProps = DialogPracticesErrorProps & {
  onClose: () => void
  type?: Nullable<HeadersErrorCodes | "size">
}

export const DialogError = (props: DialogErrorProps) => {
  if (props.type) {
    return <DialogHeadersError error={props.type} onClose={props.onClose} />
  }
  return <DialogPracticesError {...props} />
}
