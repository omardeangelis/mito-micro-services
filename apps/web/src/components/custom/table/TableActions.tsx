import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { type PropsWithChildren } from "react"
import { Button } from "@/components/ui/button"
import { MoreHorizontal } from "lucide-react"

export const DropDownCilpBoard: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => {
  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onClick={async (e) => {
        e.stopPropagation()
        navigator.clipboard
          .writeText(value)
          .then(() => {
            // No close button: the «Chiudi» action closes the toast by itself
            toast.success("Copiato con successo", {
              closeButton: false,
              action: {
                label: "Chiudi",
                onClick: () => {
                  // Sonner closes the toast after its action: nothing to do here
                },
              },
            })
          })
          .catch(() => {
            toast.error("Errore", {
              description: "Errore nel copiare l'ID",
            })
          })
      }}
    >
      {label}
    </DropdownMenuItem>
  )
}

DropDownCilpBoard.displayName = "DropDownCilpBoard"

export const DropDownAction: React.FC<{
  label: string
  onClick: () => void
}> = ({ label, onClick }) => {
  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {label}
    </DropdownMenuItem>
  )
}

export const TableActionMenu: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

TableActionMenu.displayName = "TableActionMenu"
