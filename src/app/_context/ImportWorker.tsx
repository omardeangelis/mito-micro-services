"use client"
import {
  type MutableRefObject,
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useContext,
} from "react"
import importWorker from "@/lib/workers/import/worker"
import { type WorkerGenericResponse } from "@/lib/types/workers"
import { useImportStore } from "@/store/useImportStore"
import { useToast } from "@/components/ui/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { useRouter } from "next/navigation"

const ImportWorkerContext = createContext<{
  workerRef: MutableRefObject<Worker | undefined>
  postWorkerMessage: (data: unknown) => void
  terminateWorker: () => void
  connectWorker: () => void
} | null>(null)

export const ImportWorkerProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const workerRef = useRef<Worker>()
  const { setImportState } = useImportStore()
  const postWorkerMessage = useCallback(async (data: unknown) => {
    workerRef.current?.postMessage(data)
  }, [])

  const connectWorker = useCallback(() => {
    workerRef.current = new Worker(importWorker, {
      type: "module",
      name: "importWorker",
    })
    workerRef.current.onmessage = (
      event: MessageEvent<WorkerGenericResponse<string>>
    ) => {
      setImportState(event.data[0])
    }
    workerRef.current.onerror = (error) => {
      console.error("WebWorker Error =>", error)
    }
  }, [setImportState])

  const terminateWorker = useCallback(() => {
    workerRef.current?.terminate()
  }, [])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
    }
  }, [setImportState])

  const ctx = useMemo(() => {
    return {
      workerRef,
      postWorkerMessage,
      terminateWorker,
      connectWorker,
    }
  }, [workerRef, postWorkerMessage, terminateWorker, connectWorker])

  return (
    <ImportWorkerContext.Provider value={ctx}>
      {children}
    </ImportWorkerContext.Provider>
  )
}

export const useImportWorkerContext = () => {
  const ctx = useContext(ImportWorkerContext)
  if (!ctx) {
    throw new Error(
      "useImportWorkerContext must be used within a ImportWorkerProvider"
    )
  }
  return ctx
}

export const useHandleImportWorkerStates = () => {
  const { toast } = useToast()
  const router = useRouter()
  const { terminateWorker } = useImportWorkerContext()

  useEffect(() => {
    const unsub = useImportStore.subscribe((state) => {
      const { importState } = state
      if (importState === "success") {
        toast({
          title: "Import Completato con successo",
          description: "The export was successful",
          variant: "success",
          duration: 5000,
          action: (
            <ToastAction
              className="hover:bg-white hover:text-black"
              altText="download export"
              onClick={() => {
                terminateWorker()
                router.refresh()
              }}
            >
              <p>Ricarica</p>
            </ToastAction>
          ),
          onOpenChange: (open) => {
            if (!open) {
              useImportStore.setState({
                importState: "idle",
              })
              terminateWorker()
            }
          },
        })
      } else if (importState === "error") {
        toast({
          title: "Errore",
          description: "C'è stato un errore durante l'import dei dati",
          variant: "destructive",
          duration: 5000,
          onOpenChange: (open) => {
            if (!open) {
              useImportStore.setState({
                importState: "idle",
              })
              terminateWorker()
            }
          },
        })
      } else if (importState === "loading") {
        toast({
          title: "Import in corso",
          description: "Ti informeremo quando sarà completato",
          variant: "info",
          duration: 5000,
        })
      }
    })
    return () => unsub()
  })
}
