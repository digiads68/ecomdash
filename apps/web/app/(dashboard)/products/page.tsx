"use client";

import { useState } from "react";
import type { ProductRowDto } from "@ecomdash/shared";
import { Badge, ErrorBox, Loading, PageHeader, ProductCell, TableWrap, Td, Th, ChangePill } from "@/components/ui";
import { useApi } from "@/lib/api";
import { formatNumber, formatPct, formatVND, formatVNDCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLS: { key: keyof ProductRowDto; label: string }[] = [{ key: "gmv", label: "GMV" }, { key: "unitsSold", label: "Đã bán" }, { key: "pageViews", label: "Lượt xem" }, { key: "conversionRate", label: "Chuyển đổi" }];

export default function ProductsPage() {
  const [sort, setSort] = useState("gmv:desc");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const data = useApi<ProductRowDto[]>("/products", { sort, q: q || undefined, status: status || undefined });
  const [sk] = sort.split(":");
  return (
    <>
      <PageHeader title="Sản phẩm" subtitle="Doanh số từ đơn hàng · lượt xem từ Analytics API · lãi ròng theo sản phẩm ở trang Hiệu quả sản phẩm" />
      <div className="flex flex-wrap gap-2">
        <input id="product-q" className="w-72 max-w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm" placeholder="Tìm tên sản phẩm" value={q} onChange={(e) => setQ(e.target.value)} />
        <select id="product-status" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Mọi trạng thái</option><option value="ACTIVATE">Đang bán</option><option value="SELLER_DEACTIVATED">Đã ẩn</option>
        </select>
      </div>
      {data.error && <ErrorBox error={data.error} />}
      {!data.data && !data.error && <Loading />}
      {data.data && (
        <TableWrap>
          <thead><tr><Th>Sản phẩm</Th><Th>Trạng thái</Th><Th right>SKU</Th><Th right>Tồn kho</Th><Th right>Giá</Th>
            {COLS.map((c) => <Th key={c.key} right><button type="button" onClick={() => setSort(`${c.key}:desc`)} className={cn("font-semibold", sk === c.key && "text-primary-700")}>{c.label}{sk === c.key ? " ↓" : ""}</button></Th>)}
            <Th right>± GMV</Th></tr></thead>
          <tbody>{data.data.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <Td><ProductCell title={p.title} image={p.thumbnailUrl} sub={`ID ${p.tiktokProductId}`} /></Td>
              <Td>{p.status === "ACTIVATE" ? <Badge tone="green">Đang bán</Badge> : <Badge tone="gray">Đã ẩn</Badge>}</Td>
              <Td right>{p.skuCount}</Td>
              <Td right className={cn(p.inventory < 10 && "font-semibold text-red-600")}>{formatNumber(p.inventory)}</Td>
              <Td right>{p.minPrice === p.maxPrice ? formatVND(p.minPrice) : `${formatVNDCompact(p.minPrice)}–${formatVNDCompact(p.maxPrice)}`}</Td>
              <Td right>{formatVNDCompact(p.gmv)}</Td><Td right>{formatNumber(p.unitsSold)}</Td><Td right>{formatNumber(p.pageViews)}</Td><Td right>{formatPct(p.conversionRate)}</Td>
              <Td right><ChangePill value={p.gmvChangePct} /></Td>
            </tr>
          ))}</tbody>
        </TableWrap>
      )}
    </>
  );
}
