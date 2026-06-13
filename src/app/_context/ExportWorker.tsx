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
import exportWorker from "@/lib/workers/export/worker"
import { useExportStore } from "@/store/useExportStore"
import { type WorkerGenericResponse } from "@/lib/types/workers"
import { useToast } from "@/components/ui/use-toast"
import { ToastAction } from "@/components/ui/toast"

export const ExportWorkerContext = createContext<{
  workerRef: MutableRefObject<Worker | undefined>
  postWorkerMessage: (data: unknown) => void
  terminateWorker: () => void
  connectWorker: () => void
} | null>(null)

export const ExportWorkerProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const workerRef = useRef<Worker>()
  const { setExportState, setResponse } = useExportStore()
  const postWorkerMessage = useCallback(async (data: unknown) => {
    workerRef.current?.postMessage(data)
  }, [])

  const connectWorker = useCallback(() => {
    workerRef.current = new Worker(exportWorker, {
      type: "module",
      name: "exportWorker",
    })
    workerRef.current.onmessage = (
      event: MessageEvent<WorkerGenericResponse<string>>
    ) => {
      setExportState(event.data[0])
      setResponse(event.data[1])
    }
    workerRef.current.onerror = (error) => {
      console.error("WebWorker Error =>", error)
    }
  }, [setExportState, setResponse])

  const terminateWorker = useCallback(() => {
    workerRef.current?.terminate()
  }, [])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
    }
  }, [setExportState, setResponse])

  const ctx = useMemo(() => {
    return {
      workerRef,
      postWorkerMessage,
      terminateWorker,
      connectWorker,
    }
  }, [workerRef, postWorkerMessage, terminateWorker, connectWorker])

  return (
    <ExportWorkerContext.Provider value={ctx}>
      {children}
    </ExportWorkerContext.Provider>
  )
}

export const useExportWorkerContext = () => {
  const ctx = useContext(ExportWorkerContext)
  if (!ctx) {
    throw new Error(
      "useExportWorkerContext must be used within a ExportWorkerProvider"
    )
  }
  return ctx
}

export const useHandleExportWorkerStates = () => {
  const { toast } = useToast()
  const { terminateWorker } = useExportWorkerContext()

  useEffect(() => {
    const unsub = useExportStore.subscribe((state) => {
      const { exportState, response } = state
      if (exportState === "success") {
        toast({
          title: "Export eseguito correttamente",
          description: "Premi su Download per scaricarlo",
          variant: "success",
          duration: 5000,
          action: (
            <ToastAction
              className="hover:bg-white hover:text-black"
              altText="download export"
              asChild
              onClick={() => {
                terminateWorker()
              }}
            >
              <a
                href={`/api/export/download?n=${encodeURIComponent(response!)}`}
                target="_blank"
              >
                Download
              </a>
            </ToastAction>
          ),
          onOpenChange: (open) => {
            if (!open) {
              useExportStore.setState({
                exportState: "idle",
              })
              terminateWorker()
            }
          },
        })
      } else if (exportState === "error") {
        toast({
          title: "Errore",
          description: "C'è stato un errore durante l'export dei dati",
          variant: "destructive",
          duration: 5000,
          onOpenChange: (open) => {
            if (!open) {
              useExportStore.setState({
                exportState: "idle",
              })
              terminateWorker()
            }
          },
        })
      } else if (exportState === "loading") {
        toast({
          title: "Export in corso",
          description: "Ti informeremo quando il file è pronto",
          variant: "info",
          duration: 5000,
        })
      }
    })
    return () => unsub()
  })
}
