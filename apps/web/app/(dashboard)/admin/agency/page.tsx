"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Badge, Button, ErrorBox, Loading, PageHeader, Panel, TableWrap, Td, Th } from "@/components/ui";
import { apiFetch, useApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type Agency = { id: string; label: string | null; status: string; createdAt: string; advertisers: { id: string; name: string; assigned: boolean }[] };

/** DigiAds Business Center connection: sees the ad accounts clients shared with DigiAds (BC tổng / BC con). */
function AgencyInner() {
  const params = useSearchParams();
  const d = useApi<Agency[]>("/admin/agency", {}, { shop: false });
  const connect = async () => {
    const { url } = await apiFetch<{ url: string }>("/admin/agency/authorize-url", { method: "POST" });
    window.location.href = url;
  };
  return (
    <>
      <PageHeader title="Quản trị · Business Center DigiAds" subtitle="Kết nối TikTok for Business cấp nền tảng — dùng để gắn tài khoản quảng cáo thay khách"
        actions={<Button variant="primary" onClick={connect}>Kết nối Business Center</Button>} />
      {params.get("connected") && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700">Đã kết nối — thấy {params.get("count")} tài khoản quảng cáo. Tài khoản chưa thuộc khách nào nằm trong <Link className="underline" href="/admin/pool">Uỷ quyền chưa gán</Link>.</div>}
      {d.error && <ErrorBox error={d.error} />}
      {!d.data && !d.error && <Loading />}
      {d.data && !d.data.length && <Panel><p className="text-sm text-gray-500">Chưa kết nối. Đăng nhập TikTok for Business bằng tài khoản quản trị BC của DigiAds; khách cần chia sẻ tài khoản quảng cáo vào BC (hoặc tài khoản nằm trong BC con của DigiAds).</p></Panel>}
      {d.data?.map((a) => (
        <Panel key={a.id} title={a.label ?? "Business Center"} hint={`kết nối ${formatDateTime(a.createdAt)}`} actions={<Badge tone={a.status === "ACTIVE" ? "green" : "red"}>{a.status === "ACTIVE" ? "Đang hoạt động" : a.status}</Badge>}>
          <TableWrap>
            <thead><tr><Th>Tài khoản quảng cáo</Th><Th>Trạng thái</Th></tr></thead>
            <tbody>{a.advertisers.map((v) => <tr key={v.id}><Td>{v.name}</Td><Td>{v.assigned ? <Badge tone="green">Đã gắn khách</Badge> : <Link href="/admin/pool" className="text-xs text-primary-700 hover:underline">Chưa gán → gắn</Link>}</Td></tr>)}</tbody>
          </TableWrap>
        </Panel>
      ))}
      <p className="text-xs text-gray-500">Khi một tài khoản vừa do khách tự kết nối vừa thấy qua BC DigiAds, hệ thống giữ một tài khoản duy nhất với hai nguồn token: ưu tiên token của khách, tự chuyển sang token BC nếu token khách hỏng.</p>
    </>
  );
}

export default function AgencyPage() {
  return <Suspense fallback={<Loading />}><AgencyInner /></Suspense>;
}
