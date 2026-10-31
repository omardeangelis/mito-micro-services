import { Input, type InputProps } from "@/components/ui/input"
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard"
import { CopyIcon } from "lucide-react"
import React from "react"
import { toast } from "sonner"

type Props = InputProps & { canCopy?: boolean }

const InputWithCopy = React.forwardRef<HTMLInputElement, Props>(
  ({ className, type, canCopy, ...props }, ref) => {
    const [, copy] = useCopyToClipboard()
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
                  toast.success("Copiato con successo", { duration: 5000 })
                })
                .catch(() => {
                  toast.error("Errore", {
                    duration: 5000,
                    description: "Azione non supportato dal Browser",
                  })
                })
            }}
            className="size-7.5 absolute right-0 top-0 inline-flex items-center justify-center"
          >
            <CopyIcon size={20} className="text-muted-foreground" />

            <span className="sr-only">Toggle password visibility</span>
          </div>
        ) : null}
      </div>
    )
  }
)
InputWithCopy.displayName = "InputWithCopy"

export { InputWithCopy }
