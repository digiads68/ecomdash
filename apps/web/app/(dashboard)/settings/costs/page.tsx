"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CostItemDto, CostSkuListDto, ShopConfigDto } from "@ecomdash/shared";
import { toBusinessDate } from "@ecomdash/shared";
import { Badge, Button, ErrorBox, LinkTabs, Loading, Notice, PageHeader, Panel, ProductCell, TableWrap, Td, Th, Toggle } from "@/components/ui";
import { API_URL, useApi, useApiFetch, useCanEdit } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { formatFullDate, formatNumber, formatPct, formatVND, formatVNDCompact } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

const METHOD: Record<string, string> = { PER_ORDER: "Cố định mỗi đơn", PERCENT_REVENUE: "% doanh thu thực", MONTHLY_FIXED: "Cố định mỗi tháng" };
const APPLIES: Record<string, string> = { PAID: "Mọi đơn đã thanh toán", SHIPPED: "Đơn đã gửi đi", SUCCESS: "Đơn thành công" };
const parseMoney = (s: string) => Number(s.replace(/[.\s₫]/g, "").replace(",", "."));

export default function CostsPage() {
  const shopId = useAppStore((s) => s.shopId);
  const f = useApiFetch();
  const edit = useCanEdit();
  const qc = useQueryClient();
  const [missing, setMissing] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const skus = useApi<CostSkuListDto>("/costs/skus", { missing: missing || undefined, q: search || undefined, pageSize: 500 }, { period: false });
  const items = useApi<CostItemDto[]>("/costs/items");
  const config = useApi<ShopConfigDto>(`/shops/${shopId}/config`, {}, { shop: false, enabled: !!shopId });
  const [edits, setEdits] = useState<Record<string, { cost?: string; from?: string }>>({});
  const today = toBusinessDate(new Date());
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setEdits({}), [shopId]);

  const refresh = () => qc.invalidateQueries({ predicate: (q) => ["/costs", "/pnl", "/shops"].some((p) => String(q.queryKey[0]).startsWith(p)) });
  const say = (tone: "green" | "red", text: string) => { setToast({ tone, text }); setTimeout(() => setToast(null), 6000); };

  const dirty = useMemo(() => Object.entries(edits).filter(([, e]) => e.cost !== undefined && e.cost.trim() !== ""), [edits]);
  async function saveCosts() {
    try {
      const list = dirty.map(([skuId, e]) => ({ skuId, unitCost: parseMoney(e.cost!), effectiveFrom: e.from ?? skus.data!.items.find((x) => x.skuId === skuId)?.effectiveFrom ?? today }));
      if (list.some((x) => !(x.unitCost >= 0))) return say("red", "Giá vốn phải là số không âm");
      const r = await f<{ saved: number; recomputeFrom: string }>("/costs/skus", { method: "PUT", body: JSON.stringify({ shopId, items: list }) });
      setEdits({});
      say("green", `Đã lưu ${r.saved} giá vốn. Đang tính lại số liệu Dashboard từ ${formatFullDate(r.recomputeFrom)}…`);
      refresh();
      setTimeout(refresh, 4000);
    } catch (e) { say("red", (e as Error).message); }
  }

  async function importFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await f<{ imported: number; errors: { row: number; message: string }[] }>(`/costs/skus/import?shopId=${shopId}`, { method: "POST", body: fd });
      say(r.errors.length ? "red" : "green", `Đã nhập ${r.imported} dòng${r.errors.length ? `, ${r.errors.length} dòng lỗi: ${r.errors.slice(0, 3).map((e) => `dòng ${e.row} (${e.message})`).join(", ")}` : ""}.`);
      refresh();
    } catch (e) { say("red", (e as Error).message); }
  }

  async function setConfig(patch: Partial<ShopConfigDto>) {
    await f(`/shops/${shopId}/config`, { method: "PUT", body: JSON.stringify(patch) });
    say("green", "Đã lưu cấu hình. Đang tính lại số liệu Dashboard…");
    refresh();
  }

  async function toggleItem(i: CostItemDto) {
    await f(`/costs/items/${i.id}`, { method: "PUT", body: JSON.stringify({ isActive: !i.isActive }) });
    refresh();
  }

  async function removeItem(i: CostItemDto) {
    await f(`/costs/items/${i.id}`, { method: "DELETE" });
    say("green", `Đã xoá "${i.name}". Đang tính lại số liệu Dashboard…`);
    refresh();
  }

  async function addItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fm = e.currentTarget;
    const v = (n: string) => (fm.elements.namedItem(n) as HTMLInputElement).value;
    try {
      await f("/costs/items", { method: "POST", body: JSON.stringify({ shopId, name: v("name"), method: v("method"), amount: parseMoney(v("amount")), appliesTo: v("appliesTo"), effectiveFrom: v("from") }) });
      fm.reset();
      say("green", `Đã thêm chi phí. Đang tính lại số liệu Dashboard từ ${formatFullDate(v("from"))}…`);
      refresh();
    } catch (err) { say("red", (err as Error).message); }
  }

  const d = skus.data;
  return (
    <>
      <PageHeader title="Cài đặt · Chi phí" subtitle="Giá vốn và chi phí tự nhập dùng để tính lãi ròng trên Dashboard. Sửa xong hệ thống tự tính lại từ ngày áp dụng." />
      <LinkTabs active="/settings/costs" items={[{ href: "/settings/connections", label: "Kết nối" }, { href: "/settings/costs", label: "Chi phí" }]} />
      {toast && <div role="status" className={toast.tone === "green" ? "rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700" : "rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"}>{toast.text}</div>}
      {!edit && <Notice tone="blue" title="Chế độ chỉ xem">Bạn được xem shop này nhưng không được sửa giá vốn và chi phí.</Notice>}

      <fieldset disabled={!edit} className="contents">
      <Panel title="Mặc định của shop">
        {config.data ? (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5">
              <span className="text-xs text-gray-500">Giá vốn mặc định cho SKU chưa nhập</span>
              <input id="def-cogs" key={config.data.defaultCogsPercent} defaultValue={config.data.defaultCogsPercent} inputMode="decimal" className="w-14 rounded-md border border-gray-200 px-2 py-0.5 text-right"
                onBlur={(e) => { const v = Number(e.target.value.replace(",", ".")); if (v !== config.data!.defaultCogsPercent && v >= 0 && v <= 100) setConfig({ defaultCogsPercent: v }); }} />
              <span>% giá bán</span>
            </label>
            <label className="flex items-center gap-2.5 rounded-lg border border-gray-200 px-3 py-1.5">
              <span>Hàng hoàn được nhập lại kho <span className="text-xs text-gray-500">· tắt nếu hàng hoàn thường hỏng</span></span>
              <Toggle label="Hàng hoàn nhập lại kho" on={config.data.restockReturns} onChange={(v) => setConfig({ restockReturns: v })} />
            </label>
            <span className="text-xs text-gray-500">Đơn hoàn tiền không trả hàng luôn tính mất giá vốn.</span>
          </div>
        ) : <Loading rows={1} />}
      </Panel>

      <Panel title="Giá vốn theo SKU" hint="giá vốn áp cho đơn đặt từ ngày áp dụng trở đi">
        {d && (
          <div className="mb-2.5 flex flex-wrap items-center gap-3 text-[13px] text-gray-500">
            <span><b className="text-gray-900">{formatNumber(d.totalSkus - d.missingCount)} / {formatNumber(d.totalSkus)} SKU</b> đã nhập giá vốn{d.missingRevenueShare != null && ` · phần chưa nhập chiếm ${formatPct(d.missingRevenueShare)} doanh thu 30 ngày`}</span>
            <div className="h-2 w-40 overflow-hidden rounded-full bg-gray-100"><i className="block h-full bg-primary-500" style={{ width: `${((d.totalSkus - d.missingCount) / Math.max(1, d.totalSkus)) * 100}%` }} /></div>
          </div>
        )}
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <input id="sku-q" className="w-72 max-w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm" placeholder="Tìm sản phẩm, SKU người bán" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-sm">
            <button type="button" onClick={() => setMissing(false)} className={!missing ? "bg-primary-50 px-2.5 py-1.5 font-semibold text-primary-700" : "px-2.5 py-1.5 text-gray-500"}>Tất cả</button>
            <button type="button" onClick={() => setMissing(true)} className={missing ? "border-l border-gray-200 bg-primary-50 px-2.5 py-1.5 font-semibold text-primary-700" : "border-l border-gray-200 px-2.5 py-1.5 text-gray-500"}>Chưa nhập ({d?.missingCount ?? "…"})</button>
          </div>
          <div className="flex-1" />
          <a className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700" href={`${API_URL}/api/costs/skus/export?shopId=${shopId}&format=xlsx`}>Tải file Excel</a>
          <Button size="sm" onClick={() => fileRef.current?.click()}>Nhập từ Excel/CSV</Button>
          <input ref={fileRef} id="cost-file" type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) importFile(file); e.target.value = ""; }} />
        </div>
        {skus.error && <ErrorBox error={skus.error} />}
        {!d && !skus.error && <Loading rows={2} />}
        {d && (
          <TableWrap>
            <thead><tr><Th>Sản phẩm / SKU</Th><Th right>Giá bán</Th><Th right>Đã bán 30 ngày</Th><Th right>Giá vốn / đơn vị</Th><Th>Áp dụng từ</Th><Th right>% giá bán</Th></tr></thead>
            <tbody>
              {d.items.map((s) => {
                const e = edits[s.skuId] ?? {};
                const val = e.cost ?? (s.unitCost == null ? "" : formatNumber(s.unitCost));
                const num = val ? parseMoney(val) : null;
                return (
                  <tr key={s.skuId} className="hover:bg-gray-50">
                    <Td><ProductCell title={s.productTitle} image={s.thumbnailUrl} sub={`${s.skuName ?? ""} · ${s.sellerSku ?? s.tiktokSkuId}`} /></Td>
                    <Td right>{formatVND(s.salePrice)}</Td>
                    <Td right>{formatNumber(s.unitsSold30d)}</Td>
                    <Td right><input id={`cost-${s.skuId}`} aria-label={`Giá vốn ${s.productTitle} ${s.skuName ?? ""}`} inputMode="numeric" placeholder="Chưa nhập" value={val}
                      onChange={(ev) => setEdits({ ...edits, [s.skuId]: { ...e, cost: ev.target.value } })}
                      className="w-28 rounded-md border border-gray-200 px-2 py-1 text-right placeholder:text-amber-600" /></Td>
                    <Td><input id={`from-${s.skuId}`} type="date" aria-label="Áp dụng từ" value={e.from ?? s.effectiveFrom ?? today} onChange={(ev) => setEdits({ ...edits, [s.skuId]: { ...e, from: ev.target.value } })} className="rounded-md border border-gray-200 px-2 py-1" /></Td>
                    <Td right>{num == null || isNaN(num) ? <Badge tone="amber">≈ {config.data?.defaultCogsPercent ?? 40}% mặc định</Badge> : formatPct(num / s.salePrice, 0)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Hiển thị {d?.items.length ?? 0} / {d?.total ?? 0} SKU · {dirty.length} thay đổi chưa lưu</span>
          <div className="flex-1" />
          {dirty.length > 0 && <Button onClick={() => setEdits({})}>Huỷ thay đổi</Button>}
          <Button variant="primary" disabled={!dirty.length} onClick={saveCosts}>Lưu giá vốn</Button>
        </div>
      </Panel>

      <Panel title="Chi phí tự nhập" hint="ngoài giá vốn và phí sàn — số trong kỳ theo khoảng thời gian đang chọn">
        {items.error && <ErrorBox error={items.error} />}
        {items.data && (
          <TableWrap>
            <thead><tr><Th>Tên</Th><Th>Cách tính</Th><Th right>Số tiền</Th><Th>Áp cho</Th><Th>Hiệu lực</Th><Th right>Trong kỳ</Th><Th>Bật</Th><Th /></tr></thead>
            <tbody>
              {items.data.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <Td className="font-medium">{i.name}</Td>
                  <Td>{METHOD[i.method]}</Td>
                  <Td right>{i.method === "PERCENT_REVENUE" ? `${String(i.amount).replace(".", ",")}%` : formatVND(i.amount)}</Td>
                  <Td>{i.method === "PER_ORDER" ? APPLIES[i.appliesTo] : "—"}</Td>
                  <Td>{formatFullDate(i.effectiveFrom)}{i.effectiveTo ? ` → ${formatFullDate(i.effectiveTo)}` : ""}</Td>
                  <Td right>{formatVNDCompact(i.amountInPeriod ?? 0)}</Td>
                  <Td><Toggle label={`Bật ${i.name}`} on={i.isActive} onChange={() => toggleItem(i)} /></Td>
                  <Td><button type="button" className="text-xs text-red-600 hover:underline" onClick={() => removeItem(i)}>Xoá</button></Td>
                </tr>
              ))}
              {!items.data.length && <tr><Td colSpan={8} className="text-center text-gray-500">Chưa có chi phí tự nhập</Td></tr>}
            </tbody>
          </TableWrap>
        )}
        <form onSubmit={addItem} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <input id="cf-name" name="name" required placeholder="Tên chi phí, vd Phí in bill" className="w-52 rounded-lg border border-gray-200 px-3 py-1.5" />
          <select id="cf-method" name="method" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5">
            <option value="PER_ORDER">Cố định mỗi đơn</option><option value="PERCENT_REVENUE">% doanh thu thực</option><option value="MONTHLY_FIXED">Cố định mỗi tháng</option>
          </select>
          <input id="cf-amount" name="amount" required inputMode="decimal" placeholder="Số tiền hoặc %" className="w-36 rounded-lg border border-gray-200 px-3 py-1.5" />
          <select id="cf-applies" name="appliesTo" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5">
            <option value="SHIPPED">Đơn đã gửi đi</option><option value="SUCCESS">Đơn thành công</option><option value="PAID">Mọi đơn đã thanh toán</option>
          </select>
          <input id="cf-from" name="from" type="date" defaultValue={`${today.slice(0, 8)}01`} required className="rounded-lg border border-gray-200 px-2 py-1.5" aria-label="Hiệu lực từ" />
          <Button variant="primary" type="submit">Thêm chi phí</Button>
        </form>
        <p className="mt-2 text-xs text-gray-500">"Áp cho" chỉ dùng với chi phí cố định mỗi đơn. Chi phí theo tháng được chia đều cho từng ngày trong tháng.</p>
      </Panel>
      </fieldset>
    </>
  );
}
