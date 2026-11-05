import { Link } from "react-router"
import { buttonVariants } from "@/components/ui/button"
import { useContactSheet } from "./ContactSheet"

type Props = {
  /** The active contact of the same customer, if there is one */
  activeTaskId: number | null
}

/**
 * Why a contact that is no longer the active one can't be edited (AC27), with
 * the way to the active one of the customer when it exists. The link keeps the
 * list state, so closing the sheet still leads to the same view.
 */
export function ContactSupersededBanner({ activeTaskId }: Props) {
  const { focusStateTriggerOnNextMount, detailHref } = useContactSheet()

  return (
    <div
      role="note"
      className="border-warning-soft-border bg-warning-soft text-warning-soft-foreground flex flex-col items-start gap-3 rounded-md border p-4"
    >
      <div className="flex flex-col gap-1">
        <p className="font-medium">Contatto concluso</p>
        <p className="text-sm">
          Questo contatto è stato sostituito da uno più recente e si può solo
          consultare.
        </p>
      </div>
      {activeTaskId === null ? null : (
        <Link
          to={detailHref(activeTaskId)}
          preventScrollReset
          className={buttonVariants({ variant: "outline", size: "sm" })}
          onClick={(event) => {
            // A modified click opens the link elsewhere: this sheet stays on
            // the old contact and must not promise its next one a focus
            if (
              event.button !== 0 ||
              event.ctrlKey ||
              event.metaKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return
            }
            // The focus goes to the state selector of the contact that mounts
            focusStateTriggerOnNextMount()
          }}
        >
          Vai al contatto attivo
        </Link>
      )}
    </div>
  )
}
