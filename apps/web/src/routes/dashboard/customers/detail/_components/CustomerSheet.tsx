import React, { type PropsWithChildren } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useHistoryBack } from "@/lib/hooks/useHistoryBack"

import { type Customer } from "@mito/contract/customer"
import { BlackListBadge } from "../../_components/BlackListBadge"

type Props = PropsWithChildren<Pick<Customer, "id" | "blackListStatus">>

export const CustomerSheet = (props: Props) => {
  const goBack = useHistoryBack()
  return (
    <Sheet open={true} onOpenChange={() => goBack("/dashboard/customers")}>
      <SheetContent className="min-w-[80%] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-4">
            <SheetTitle className="text-title font-heading">
              Scheda Cliente
            </SheetTitle>
            <BlackListBadge state={props.blackListStatus} />
          </div>
        </SheetHeader>
        <div className="mt-8 flex flex-col gap-8">{props.children}</div>
      </SheetContent>
    </Sheet>
  )
}
