"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { OrderDetailDto } from "@ecomdash/shared";
import { ErrorBox, Loading, PageHeader, Panel, ProductCell, TableWrap, Tag, Td, Th } from "@/components/ui";
import { useApi } from "@/lib/api";
import { formatDateTime, formatVND } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OutcomeBadge, StatusBadge } from "../status";

const RK: Record<string, string> = { REFUND: "Hoàn tiền", RETURN_AND_REFUND: "Trả hàng hoàn tiền", REPLACEMENT: "Đổi hàng", CANCEL: "Huỷ", BUYER_CANCEL: "Người mua huỷ" };

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<OrderDetailDto>(`/orders/${id}`, {}, { shop: false });
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <Loading />;
  const o = q.data;
  const s = o.settlement;
  const e = o.economics;
  return (
    <>
      <PageHeader title={`Đơn ${o.tiktokOrderId}`} subtitle={<><Link href="/orders" className="text-primary-600 hover:underline">← Đơn hàng</Link> · {o.province ?? "—"} · {o.isCod ? "COD" : o.paymentMethod} · {o.shippingProvider ?? ""} {o.trackingNumber ?? ""}</>}
        actions={<><StatusBadge group={o.statusGroup} status={o.status} /><OutcomeBadge outcome={o.outcome} /></>} />
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Sản phẩm" hint="TikTok trả mỗi đơn vị là một dòng; gộp theo SKU">
          <TableWrap>
            <thead><tr><Th>Sản phẩm</Th><Th>SKU người bán</Th><Th right>Đơn giá</Th><Th right>SL</Th><Th right>Giá vốn / đv</Th><Th right>Thành tiền</Th></tr></thead>
            <tbody>{o.lines.map((l) => (
              <tr key={l.tiktokSkuId}><Td><ProductCell title={l.productName} image={l.skuImage} sub={l.skuName ?? undefined} /></Td><Td>{l.sellerSku ?? "—"}</Td><Td right>{formatVND(l.unitPrice)}</Td><Td right>{l.quantity}</Td>
                <Td right>{l.unitCost == null ? <Tag tone="amber">chưa nhập</Tag> : formatVND(l.unitCost)}</Td><Td right>{formatVND(l.unitPrice * l.quantity)}</Td></tr>
            ))}</tbody>
          </TableWrap>
          {o.cancelReason && <p className="mt-2 text-sm text-red-600">Lý do huỷ: {o.cancelReason}</p>}
        </Panel>
        <Panel title="Dòng thời gian">
          <ol className="relative ml-1.5 border-l-2 border-gray-200">
            {o.timeline.map((t, i) => (
              <li key={i} className="mb-3 ml-4 text-[13px]"><span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-primary-500" />{t.label}<span className="block text-xs text-gray-400">{formatDateTime(t.at)}</span></li>
            ))}
          </ol>
        </Panel>
      </div>
      <div className="grid gap-3.5 md:grid-cols-3">
        <Panel title="Người mua trả" hint="payment">
          <Kv rows={[["Tạm tính hàng (sau voucher)", o.payment.subTotal], ["Phí vận chuyển", o.payment.shippingFee], ["Voucher shop", -o.payment.sellerDiscount], ["Voucher TikTok", -o.payment.platformDiscount]]} total={["Tổng", o.payment.totalAmount]} />
        </Panel>
        <Panel title="Đối soát TikTok" hint={s ? `kỳ ${s.settledAt ? formatDateTime(s.settledAt) : ""}` : "chưa đối soát"}>
          {s ? <Kv rows={[["Doanh thu", s.revenueAmount], ["Hoa hồng sàn", -s.platformCommission], ["Phí giao dịch", -s.transactionFee], ["Hoa hồng affiliate", -s.affiliateCommission], ["Phí hạ tầng", -s.infrastructureFee], ["Vận chuyển", s.shippingCostAmount], ["Thuế khấu trừ", -s.taxAmount], ...(s.otherFees ? [["Phí khác", -s.otherFees] as [string, number]] : [])]} total={["Thực nhận", s.settlementAmount]} />
            : <p className="text-sm text-gray-500">TikTok chưa quyết toán đơn này. Dashboard đang dùng tỉ lệ phí ước tính.</p>}
        </Panel>
        <Panel title="Lãi ròng của đơn" hint={e ? (e.feesEstimated || e.cogsEstimated ? "có phần ước tính" : "đã chốt") : ""}>
          {e ? <Kv rows={[["Doanh thu thực", e.realizedRevenue], ["Phí sàn", -e.platformFees], ["Phí khác", -e.otherPlatformFees], ["Giá vốn", -e.cogs], ["Chi phí tự nhập", -e.customCosts]]} total={["Lãi trước quảng cáo", e.contribution]} />
            : <p className="text-sm text-gray-500">Đơn chưa thanh toán nên không tính lãi ròng.</p>}
        </Panel>
      </div>
      {o.returns.length > 0 && (
        <Panel title="Hoàn / huỷ">
          <TableWrap><thead><tr><Th>Mã yêu cầu</Th><Th>Loại</Th><Th>Trạng thái</Th><Th>Lý do</Th><Th right>Hoàn tiền</Th><Th right>SL trả</Th><Th>Ngày</Th></tr></thead>
            <tbody>{o.returns.map((r) => <tr key={r.id}><Td>{r.tiktokReturnId}</Td><Td>{RK[r.kind] ?? r.kind}</Td><Td className="text-xs">{r.status}</Td><Td>{r.reason}</Td><Td right>{formatVND(r.refundTotal)}</Td><Td right>{r.returnedUnits}</Td><Td>{formatDateTime(r.createTime)}</Td></tr>)}</tbody>
          </TableWrap>
        </Panel>
      )}
    </>
  );
}

function Kv({ rows, total }: { rows: [string, number][]; total: [string, number] }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13px]">
      {rows.map(([k, v]) => [<dt key={`k${k}`} className="text-gray-500">{k}</dt>, <dd key={`v${k}`} className={cn("text-right tabular-nums", v < 0 && "text-red-600")}>{v < 0 ? "−" : ""}{formatVND(Math.abs(v))}</dd>])}
      <dt className="border-t border-gray-200 pt-1.5 font-semibold">{total[0]}</dt>
      <dd className={cn("border-t border-gray-200 pt-1.5 text-right font-bold tabular-nums", total[1] < 0 && "text-red-600")}>{formatVND(total[1])}</dd>
    </dl>
  );
}
