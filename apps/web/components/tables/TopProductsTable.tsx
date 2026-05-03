"use client";

import { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import Image from "next/image";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useTopProducts } from "@/lib/hooks/useTopProducts";
import { formatVNDCompact, formatNumber, formatROAS } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TopProduct } from "@ecomdash/shared";

const columnHelper = createColumnHelper<TopProduct>();

const columns = [
  columnHelper.accessor("name", {
    header: "Sản phẩm",
    cell: (info) => (
      <div className="flex items-center gap-3">
        {info.row.original.thumbnailUrl ? (
          <Image
            src={info.row.original.thumbnailUrl}
            alt={info.getValue()}
            width={36}
            height={36}
            className="rounded-md object-cover shrink-0 bg-gray-100"
          />
        ) : (
          <div className="w-9 h-9 rounded-md bg-gray-100 shrink-0" />
        )}
        <span className="text-sm font-medium text-gray-900 line-clamp-2 max-w-[200px]">
          {info.getValue()}
        </span>
      </div>
    ),
    enableSorting: false,
  }),
  columnHelper.accessor("revenue", {
    header: "Doanh thu",
    cell: (info) => (
      <span className="text-sm font-semibold text-gray-900 tabular-nums">
        {formatVNDCompact(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("orders", {
    header: "Đơn hàng",
    cell: (info) => (
      <span className="text-sm text-gray-700 tabular-nums">{formatNumber(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor("roas", {
    header: "ROAS",
    cell: (info) => {
      const val = info.getValue();
      if (val === null) return <span className="text-gray-400 text-sm">—</span>;
      return (
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            val >= 4 ? "text-green-600" : val >= 2 ? "text-blue-600" : val >= 1 ? "text-yellow-600" : "text-red-600"
          )}
        >
          {formatROAS(val)}
        </span>
      );
    },
  }),
];

function SortIcon({ isSorted }: { isSorted: false | "asc" | "desc" }) {
  if (isSorted === "asc") return <ArrowUp className="w-3.5 h-3.5 text-primary-500" />;
  if (isSorted === "desc") return <ArrowDown className="w-3.5 h-3.5 text-primary-500" />;
  return <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />;
}

export function TopProductsTable() {
  const { data = [], isLoading } = useTopProducts(10);
  const [sorting, setSorting] = useState<SortingState>([{ id: "revenue", desc: true }]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Sản phẩm bán chạy</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-gray-100">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "flex items-center gap-1.5",
                          header.column.getCanSort() && "cursor-pointer hover:text-gray-700"
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <SortIcon isSorted={header.column.getIsSorted()} />
                        )}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {columns.map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 bg-gray-100 rounded animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              : table.getRowModel().rows.length === 0
              ? (
                <tr>
                  <td colSpan={columns.length} className="px-5 py-12 text-center text-sm text-gray-400">
                    Chưa có dữ liệu sản phẩm
                  </td>
                </tr>
              )
              : table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-5 py-3.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
