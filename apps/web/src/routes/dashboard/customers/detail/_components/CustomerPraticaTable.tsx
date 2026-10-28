import {
  useReactTable,
  type ColumnDef,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table"
import {
  type ProductMapKey,
  getAllProductLabels,
  getLabelColorByProductType,
  getProductLabel,
  getProductType,
} from "@mito/domain/constants/productMap"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useRouter } from "@/lib/navigation"
import { type CustomerPractice } from "@mito/contract/customer"
import { formatDateAsDMY } from "@mito/client/format"

export type CustomerToPraticaColumn = typeof CustomerPractice.Type

const praticheTableColumns: ColumnDef<CustomerToPraticaColumn>[] = [
  {
    header: () => <div className="flex items-center">ID</div>,
    cell: (props) => (
      <div className="text-left">{props.row.original.praticaId}</div>
    ),
    accessorKey: "praticaId",
  },
  {
    header: "Prodotto",
    accessorKey: "productId",
    meta: {
      filterValues: getAllProductLabels(),
    },
    cell: ({ row }) => {
      const product = row.original.productId?.trim()
      return (
        <div className="text-xs capitalize">
          <Badge
            variant="outline"
            className={getLabelColorByProductType(
              getProductType(product!.toString() as ProductMapKey)!
            )}
          >
            {getProductLabel(product?.toString() as ProductMapKey)}
          </Badge>
        </div>
      )
    },
  },
  {
    header: "Ruolo",
    accessorKey: "customerRole",
    cell: (props) => (
      <div className="text-left">{props.row.original.customerRole}</div>
    ),
  },
  {
    header: "Stato",
    accessorKey: "state",
  },
  {
    header: "Data Liquidazione",
    accessorKey: "dataLiquidazione",
    cell: (props) => (
      <div className="text-center">
        {formatDateAsDMY(props.row.original.dataLiquidazione)}
      </div>
    ),
  },
]

export const CustomerPraticaTable = (props: {
  pratica: CustomerToPraticaColumn[]
}) => {
  const { pratica } = props

  const table = useReactTable({
    data: pratica,
    columns: praticheTableColumns,
    getCoreRowModel: getCoreRowModel(),
  })
  const router = useRouter()
  return (
    <Table className="overflow-hidden">
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              return (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              )
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows?.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow
              className="cursor-pointer hover:bg-gray-100"
              key={row.id}
              data-state={row.getIsSelected() && "selected"}
              onClick={() =>
                router.push(
                  `/dashboard/pratiche/${row.getAllCells()[0]?.getValue() as string}`
                )
              }
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={praticheTableColumns.length}
              className="h-24 text-center"
            >
              No results.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
