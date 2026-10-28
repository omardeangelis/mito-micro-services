import type { ColumnDef } from "@tanstack/react-table"
import { PracticeState } from "@mito/contract/customer"
import { type PracticeListRow } from "@mito/contract/pratiche"
import { currencyFormatter } from "@mito/client/format"
import {
  type ProductMapKey,
  getAllProductLabels,
  getProductLabel,
  getLabelColorByProductType,
  getProductType,
} from "@mito/domain/constants/productMap"
import { Badge } from "@/components/ui/badge"
import { SortableHeader } from "@/components/custom/table/TableHeaders"
import {
  DropDownCilpBoard,
  TableActionMenu,
} from "@/components/custom/table/TableActions"
import {
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

/** The columns of "Ultime Pratiche Aggiornate", as in the Next.js app */
export const LastUpdatedPracticesColumns: ColumnDef<PracticeListRow>[] = [
  {
    header: () => <div className="flex items-center">ID</div>,
    cell: (props) => (
      <div className="text-left">{props.row.original.praticaId}</div>
    ),
    accessorKey: "praticaId",
    enableColumnFilter: false,
  },
  {
    header: "Prodotto",
    accessorKey: "productId",
    enableColumnFilter: true,
    meta: {
      filterValues: getAllProductLabels(),
    },
    cell: ({ row }) => {
      // A practice may have no product: the Next.js app failed on it
      const product = row.original.productId?.trim() as
        ProductMapKey | undefined
      if (!product) return null
      return (
        <div className="text-xs capitalize">
          <Badge
            variant="outline"
            className={getLabelColorByProductType(getProductType(product)!)}
          >
            {getProductLabel(product)?.toLowerCase()}
          </Badge>
        </div>
      )
    },
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Finanziato</SortableHeader>
    ),
    accessorKey: "importoFinanziato",
    cell: (props) => (
      <div className="text-center">
        {currencyFormatter(props.row.original.importoFinanziato)}
      </div>
    ),
    enableColumnFilter: false,
  },
  {
    accessorKey: "state",
    header: "Stato",
    enableColumnFilter: true,
    meta: {
      filterValues: PracticeState.literals,
    },
    cell: ({ row }) => {
      const pratica = row.original
      return (
        <div className="flex items-center justify-start">
          <div className="flex items-center justify-start capitalize">
            {pratica.stato === "Chiusa" ? (
              <span className="sr-only">Pratica Chiusa</span>
            ) : (
              <span className="sr-only">Pratica Aperta</span>
            )}
            {pratica.stato.toLowerCase()}
          </div>
        </div>
      )
    },
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Liquidazione</SortableHeader>
    ),
    cell: (props) => (
      <div className="text-center">
        {props.row.original.dataLiquidazione.toDateString()}
      </div>
    ),
    accessorKey: "dataLiquidazione",
    enableColumnFilter: false,
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Aggiornato</SortableHeader>
    ),
    cell: (props) => (
      <div className="text-center">
        {props.row.original.updatedAt.toDateString()}
      </div>
    ),
    accessorKey: "updatedAt",
    enableColumnFilter: false,
  },
  {
    enableColumnFilter: false,
    enableSorting: false,
    id: "actions",
    header: "actions",
    cell: ({ row }) => (
      <TableActionMenu>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropDownCilpBoard
          label="Copia ID della pratica"
          value={row.original.praticaId}
        />
        <DropdownMenuSeparator />
      </TableActionMenu>
    ),
  },
]
