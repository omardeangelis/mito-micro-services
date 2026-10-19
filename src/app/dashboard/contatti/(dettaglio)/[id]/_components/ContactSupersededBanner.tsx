"use client"

import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { detailHrefFromDa } from "../../../_lib/detailHrefFromDa"
import { useContactSheet } from "../../_components/ContactSheet"

type Props = {
  /** The active contact of the same customer, if there is one */
  activeTaskId: number | null
  /** The `da` parameter of the address: the list state to carry along */
  da: string | undefined
}

/**
 * Why a contact that is no longer the active one can't be edited (AC27), with
 * the way to the active one of the customer when it exists. The link keeps the
 * list state (`da`), so closing the sheet still leads to the same view.
 */
export function ContactSupersededBanner({ activeTaskId, da }: Props) {
  const { focusStateTriggerOnNextMount } = useContactSheet()

  return (
    <div
      role="note"
      className="flex flex-col items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm"
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
          href={detailHrefFromDa(activeTaskId, da)}
          prefetch={false}
          scroll={false}
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
