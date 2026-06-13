"use client"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useRouter } from "next/navigation"

export const CreatePraticaTooltipButton = ({
  children,
  disabled,
  id,
}: {
  children: React.ReactNode
  disabled: boolean
  id: string
}) => {
  const navigate = useRouter()
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            disabled={disabled}
            variant={(disabled && "disabled") || "default"}
            onClick={() =>
              navigate.replace(`/dashboard/customers/${id}/connect`)
            }
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm text-gray-500">
            {disabled
              ? "Puoi aggiungere una pratica solo se il cliente ha uno stato di caricato o erogato"
              : "Aggiungi una pratica"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
