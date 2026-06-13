/* eslint-disable react-hooks/rules-of-hooks */
"use client"
import React from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { currencyFormatter } from "@/lib/utils"
import {
  type ProductMapKey,
  getAllProductLabels,
  getProductLabel,
  getLabelColorByProductType,
  getProductType,
} from "@/lib/constants/productMap"
import { Badge } from "@/components/ui/badge"

import { SortableHeader } from "@/components/custom/table/TableHeaders"
import { type PraticaState } from "../pratiche/_types/pratiche"
import {
  DropDownCilpBoard,
  TableActionMenu,
} from "@/components/custom/table/TableActions"
import {
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { stateEnum } from "@/server/db/schema/pratiche"

export type PraticheColumnSelectedProps = {
  id: string | number
  praticaId: string | null
  productId: string | number | null
  importoFinanziato: number | null
  dataLiquidazione: Date | null
  stato: PraticaState | null
  updatedAt: Date | null
  operatore?: {
    id: number
    name: string | null
    surname: string | null
  } | null
}

export const LastUpdatedPracticesColumns: ColumnDef<PraticheColumnSelectedProps>[] =
  [
    {
      header: () => <div className="flex items-center">ID</div>,
      cell: (props) => (
        <div className="text-left">{props.row.original.praticaId!}</div>
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
        const product = row.original.productId!.toString().trim()
        return (
          <div className="text-xs capitalize">
            <Badge
              variant="outline"
              className={getLabelColorByProductType(
                getProductType(product?.toString() as ProductMapKey)!
              )}
            >
              {getProductLabel(
                product?.toString() as ProductMapKey
              )?.toLowerCase()}
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
          {currencyFormatter(props.row.original.importoFinanziato!)}
        </div>
      ),
      enableColumnFilter: false,
    },
    {
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
      header: ({ column }) => (
        <SortableHeader column={column}>Liquidazione</SortableHeader>
      ),
      cell: (props) => (
        <div className="text-center">
          {props.row.original.dataLiquidazione?.toDateString()}
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
          {props.row.original.updatedAt?.toDateString()}
        </div>
      ),
      accessorKey: "updatedAt",
      enableColumnFilter: false,
    },
    {
      enableColumnFilter: false,
      enableSorting: false,
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
