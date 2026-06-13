/* eslint-disable react-hooks/rules-of-hooks */
"use client"
import React from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { type PraticaState } from "../_types/pratiche"
import { currencyFormatter, formatDateAsDMY } from "@/lib/utils"
import {
  type ProductMapKey,
  getAllProductLabels,
  getProductLabel,
  getLabelColorByProductType,
  getProductType,
} from "@/lib/constants/productMap"
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
import { stateEnum } from "@/server/db/schema/pratiche"
import type { Practice } from "@/lib/types/schemas"

export type PraticheColumnSelectedProps = {
  id: string | number
  praticaId: string | null
  productId: string | number | null
  importoFinanziato: number | null
  dataLiquidazione: Date | null
  stato: PraticaState | null
  updatedAt: Date | null
  createdAt: Practice["createdAt"]
  rateTotali: number | null
  ratePagate: number | null
  customerName?: string | null
  customerSurname?: string | null
}

export const PraticheTableColumns: ColumnDef<PraticheColumnSelectedProps>[] = [
  {
    header: () => <div className="flex items-center">ID</div>,
    cell: (props) => (
      <div className="text-left">{props.row.original.praticaId!}</div>
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
      const product = row.original.productId
      return (
        <div className="text-xs capitalize">
          <Badge
            variant="outline"
            size="sm"
            className={getLabelColorByProductType(
              getProductType(product?.toString().trim() as ProductMapKey)!
            )}
          >
            {getProductLabel(
              product?.toString().trim() as ProductMapKey
            )?.toLowerCase()}
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
        {currencyFormatter(props.row.original.importoFinanziato!)}
      </div>
    ),
    enableColumnFilter: false,
  },
  // {
  //   header: "Nome",
  //   accessorKey: "customerName",
  //   enableColumnFilter: false,
  //   cell: (props) => (
  //     <div className="text-left">
  //       {props.row.original.customerName ?? "N/A"}
  //     </div>
  //   ),
  // },
  // {
  //   header: "Cognome",
  //   accessorKey: "customerSurname",
  //   enableColumnFilter: false,
  //   cell: (props) => (
  //     <div className="text-left">
  //       {props.row.original.customerSurname ?? "N/A"}
  //     </div>
  //   ),
  // },
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
        {props.row.original.dataLiquidazione &&
        props.row.original.dataLiquidazione instanceof Date
          ? formatDateAsDMY(props.row.original.dataLiquidazione)
          : "N/A"}
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
        {props.row.original.createdAt &&
        props.row.original.createdAt instanceof Date
          ? formatDateAsDMY(props.row.original.createdAt)
          : "N/A"}
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
        {props.row.original.updatedAt &&
        props.row.original.updatedAt instanceof Date
          ? formatDateAsDMY(props.row.original.updatedAt)
          : "N/A"}
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
      filterValues: stateEnum,
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
