import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"
import { ToastAction } from "@radix-ui/react-toast"
import { type PropsWithChildren } from "react"
import { Button } from "@/components/ui/button"
import { MoreHorizontal } from "lucide-react"

export const DropDownCilpBoard: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => {
  const { toast } = useToast()
  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onClick={async (e) => {
        e.stopPropagation()
        navigator.clipboard
          .writeText(value)
          .then(() => {
            toast({
              title: "Copiato con successo",
              variant: "success",
              closeManually: true,
              action: (
                <ToastAction altText="Copiato con successo">Chiudi</ToastAction>
              ),
            })
          })
          .catch(() => {
            toast({
              title: "Errore",
              description: "Errore nel copiare l'ID",
              variant: "destructive",
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
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

TableActionMenu.displayName = "TableActionMenu"
