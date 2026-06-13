"use client"

import { Input, type InputProps } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard"
import { CopyIcon } from "lucide-react"
import React from "react"

type Props = InputProps & { canCopy?: boolean }

const InputWithCopy = React.forwardRef<HTMLInputElement, Props>(
  ({ className, type, canCopy, ...props }, ref) => {
    const [, copy] = useCopyToClipboard()
    const { toast } = useToast()
    return (
      <div className="relative flex w-full">
        <Input type={type} className={className} ref={ref} {...props} />
        {canCopy ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Toggle password visibility"
            onClick={(e: React.BaseSyntheticEvent) => {
              e.preventDefault()
              e.stopPropagation()
              copy(props.value?.toString() ?? "")
                .then(() => {
                  toast({
                    variant: "success",
                    duration: 5000,
                    title: "Copiato con successo",
                  })
                })
                .catch(() => {
                  toast({
                    variant: "destructive",
                    duration: 5000,
                    title: "Errore",
                    description: "Azione non supportato dal Browser",
                  })
                })
            }}
            className="absolute right-0 top-0 inline-flex h-10 w-10 items-center justify-center"
          >
            <CopyIcon size={20} className="text-gray-400" />

            <span className="sr-only">Toggle password visibility</span>
          </div>
        ) : null}
      </div>
    )
  }
)
InputWithCopy.displayName = "InputWithCopy"

export { InputWithCopy }
