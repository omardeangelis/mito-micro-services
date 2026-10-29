import type { ColumnDef } from "@tanstack/react-table"
import { PracticeState } from "@mito/contract/customer"
import { type PracticeListRow } from "@mito/contract/pratiche"
import { currencyFormatter, formatDateAsDMY } from "@mito/client/format"
import {
  type ProductMapKey,
  getAllProductLabels,
  getProductLabel,
  getProductType,
} from "@mito/domain/constants/productMap"
import { Badge } from "@/components/ui/badge"
import { productTone } from "@/lib/tones"
import { SortableHeader } from "@/components/custom/table/TableHeaders"
import {
  DropDownCilpBoard,
  TableActionMenu,
} from "@/components/custom/table/TableActions"
import {
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

/** A row of the list, as `getAllPratiche` returns it */
export type PraticheColumnSelectedProps = PracticeListRow

export const PraticheTableColumns: ColumnDef<PraticheColumnSelectedProps>[] = [
  {
    header: () => <div className="flex items-center">ID</div>,
    cell: (props) => (
      <div className="text-left">{props.row.original.praticaId}</div>
    ),
    id: "ID Pratica",
    accessorKey: "praticaId",
    enableColumnFilter: false,
  },
  {
    id: "Prodotto",
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
          <Badge tone={productTone(getProductType(product))}>
            {getProductLabel(product)?.toLowerCase()}
          </Badge>
        </div>
      )
    },
  },
  {
    header: ({ column }) => (
      <SortableHeader className="text-center" column={column}>
        Finanziato
      </SortableHeader>
    ),
    id: "Importo Finanziato",
    accessorKey: "importoFinanziato",
    cell: (props) => (
      <div className="text-center">
        {currencyFormatter(props.row.original.importoFinanziato)}
      </div>
    ),
    enableColumnFilter: false,
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Rate Totali</SortableHeader>
    ),
    cell: (props) => (
      <div className="text-center">{props.row.original.rateTotali}</div>
    ),
    id: "Rate Totali",
    accessorKey: "rateTotali",
    enableHiding: true,
    enableColumnFilter: false,
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Rate Pagate</SortableHeader>
    ),
    cell: (props) => (
      <div className="text-center">{props.row.original.ratePagate}</div>
    ),
    enableHiding: true,
    id: "Rate Pagate",
    accessorKey: "ratePagate",
    enableColumnFilter: false,
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Liquidazione</SortableHeader>
    ),
    cell: (props) => (
      <div className="text-center">
        {formatDateAsDMY(props.row.original.dataLiquidazione)}
      </div>
    ),
    id: "Data Liquidazione",
    accessorKey: "dataLiquidazione",
    enableColumnFilter: false,
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Creato</SortableHeader>
    ),
    cell: (props) => (
      <div className="text-center">
        {formatDateAsDMY(props.row.original.createdAt)}
      </div>
    ),
    id: "Data Creazione",
    accessorKey: "createdAt",
    enableColumnFilter: false,
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Aggiornato</SortableHeader>
    ),
    cell: (props) => (
      <div className="text-center">
        {formatDateAsDMY(props.row.original.updatedAt)}
      </div>
    ),
    id: "Data Aggiornamento",
    accessorKey: "updatedAt",
    enableColumnFilter: false,
  },
  {
    id: "Stato",
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
            {pratica.stato?.toLowerCase()}
          </div>
        </div>
      )
    },
  },
  {
    enableColumnFilter: false,
    enableSorting: false,
    enableHiding: false,
    id: "actions",
    header: "actions",
    cell: ({ row }) => {
      const pratica = row.original
      return (
        <TableActionMenu>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          {pratica.praticaId ? (
            <>
              <DropDownCilpBoard
                label="Copia ID della pratica"
                value={pratica.praticaId}
              />
              <DropdownMenuSeparator />
            </>
          ) : null}
        </TableActionMenu>
      )
    },
  },
]
