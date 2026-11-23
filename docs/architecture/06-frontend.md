# 06 — Frontend (apps/web)

Giao diện giả định để duyệt: `docs/mockups/index.html` (mở trực tiếp trong trình duyệt). Khi triển khai, bám bố cục và nội dung từng màn hình trong mockup; số liệu thật lấy từ API ở `05-api-contracts.md`.

## 1. Sửa nền (bắt buộc trước khi làm trang)

| Lỗi | Sửa |
|---|---|
| Thiếu `postcss.config.js` → Tailwind không chạy | Thêm `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }` |
| `app/page.tsx` và `app/(dashboard)/page.tsx` cùng `/` | Xoá `app/page.tsx` (server component gọi Prisma — web không truy cập DB); `(dashboard)/page.tsx` redirect `/overview` |
| `/api/api` lặp | `NEXT_PUBLIC_API_URL` không chứa `/api`; `api-client.ts` ghép `${base}/api${path}` |
| `selectedShopId` không bao giờ được set | `ShopSwitcher` trong Topbar gọi `GET /shops`, nếu store rỗng/không còn hợp lệ thì chọn shop đầu tiên |
| Clerk bắt buộc (đã gỡ) | Đăng nhập do API cấp phiên cookie; `lib/api.ts` gửi `credentials: "include"`, 401 → `/login`; `middleware.ts` chặn khi không có cookie `ecomdash_session` (`12` §6) |
| Ngày gửi API dạng ISO datetime | Gửi `YYYY-MM-DD` theo `Asia/Ho_Chi_Minh` (helper `toBusinessDate()` trong `lib/format.ts`) |

## 2. Điều hướng

Sidebar (`bg-gray-900`, mục đang chọn `bg-primary-600`), nhóm:

```
TỔNG QUAN
  Dashboard            /dashboard        (trang chủ — 11 §12; /overview chuyển hướng)
  Hiệu quả sản phẩm    /products/performance   (/profit/products chuyển hướng)
BÁN HÀNG
  Đơn hàng             /orders           (+ /orders/[id])
  Sản phẩm             /products
  Hoàn / Huỷ           /returns
  Khách hàng           /customers
TIỀN
  Đối soát             /finance
  Quảng cáo            /ads
VẬN HÀNH
  Cảnh báo             /alerts
  Báo cáo định kỳ      /reports
CÀI ĐẶT
  Chi phí              /settings/costs
  Kết nối              /settings/connections
  Thành viên           /settings/members      (chỉ Chủ / Quản trị tổ chức, quản trị DigiAds)
  Tài khoản            /settings/account
QUẢN TRỊ DIGIADS       (chỉ Super admin / Admin)
  Khách hàng           /admin/clients  (+ /admin/clients/[id]: gắn kết thay khách, link mời, thành viên, nhật ký)
  Uỷ quyền chưa gán    /admin/pool
  Nhân viên            /admin/staff
  Business Center      /admin/agency
Ngoài khung: /login · /invite/[token] · /onboarding
```
Ngôn từ: phần mềm là **Dashboard**, không gọi "lãi lỗ"; tên chỉ số ("Lãi ròng", "ROAS thực"…) giữ nguyên.

Topbar: ô chọn shop (nhóm theo khách cho nhân viên DigiAds; chọn shop = chọn tổ chức cho các trang theo tổ chức) · khoảng thời gian · **mốc đồng bộ chung** "Số liệu đến HH:mm (shop + QC)" hoặc nhãn vàng "Quảng cáo trễ N phút" (`GET /sync/watermark`) · chuông cảnh báo · menu tài khoản (vai trò, Tài khoản & mật khẩu, Đăng xuất).
Chế độ chỉ đọc (Mod, Thành viên): trang Chi phí, Kết nối, Cảnh báo, Báo cáo ẩn/khoá nút sửa và hiện "Chế độ chỉ xem". Tổ chức chưa gắn đủ Shop + Ads → thẻ "Hoàn tất kết nối" thay cho trang dữ liệu (`12` §3.1).
DemoBanner vàng khi `NEXT_PUBLIC_DEMO_MODE=true`: "Chế độ demo — dữ liệu giả lập từ mock TikTok API".

## 3. Màn hình

### 3.1 Dashboard (trang chủ)
Xem `11-dashboard-metrics.md` §12 — thay toàn bộ mô tả "Tổng quan" cũ bên dưới.

### 3.1-cũ Tổng quan (đã thay)
- Hàng KPI (8 thẻ, 4 cột desktop / 2 cột mobile): GMV, Đơn hàng, AOV, Chi quảng cáo, ROAS tổng, Thực nhận, Lợi nhuận ước tính, Tỉ lệ huỷ. Mỗi thẻ: giá trị, % thay đổi so với kỳ trước (xanh/đỏ; với chi phí & tỉ lệ huỷ thì tăng là đỏ), sparkline 14 ngày.
- Biểu đồ kết hợp: cột GMV + đường chi QC (trục phải) theo ngày.
- Phễu trạng thái đơn (5 nhóm, thanh ngang).
- Top 5 sản phẩm (ảnh, tên, GMV, đã bán).
- Khối "Cần chú ý": cảnh báo đang FIRING + kết nối NEEDS_REAUTH.

### 3.2 Đơn hàng
- Tab trạng thái có số đếm (Tất cả · Chờ thanh toán · Chờ xử lý · Đang giao · Đã giao · Đã huỷ).
- Ô tìm mã đơn / mã vận đơn; lọc COD.
- Bảng: Mã đơn, Thời gian, Sản phẩm (ảnh + tên + "+n"), Tỉnh/thành, Tổng tiền, Thực nhận (hoặc "Chưa đối soát"), Thanh toán (COD/Online), Vận chuyển, Trạng thái (badge).
- Chi tiết đơn (`/orders/[id]`): dòng thời gian, bảng SKU, khối thanh toán (tạm tính, phí ship, giảm giá shop/sàn, tổng), khối đối soát (doanh thu, từng loại phí, thực nhận), yêu cầu hoàn nếu có.

### 3.3 Sản phẩm
- Bảng: ảnh, tên, trạng thái, số SKU, tồn kho (đỏ khi < 10), giá, GMV, đã bán, lượt xem, tỉ lệ chuyển đổi, tỉ lệ hoàn, % thay đổi GMV. Sắp xếp theo cột.
- Chi tiết: biểu đồ GMV/ngày, bảng SKU.

### 3.4 Tài chính (mới)
- KPI: Doanh thu đối soát, Tổng phí sàn, Chi QC, Lợi nhuận ước tính, Biên lợi nhuận.
- Biểu đồ thác nước: GMV → Giảm giá shop → Phí sàn → Hoa hồng affiliate → Phí vận chuyển → Thực nhận → Giá vốn → Chi QC → Lợi nhuận.
- Bảng phí theo loại (số tiền, % GMV).
- Bảng kỳ thanh toán (statements) và tab "Đối soát theo đơn".
- Ghi chú: "x đơn chưa đối soát — lợi nhuận sẽ cập nhật khi TikTok quyết toán".

### 3.5 Quảng cáo
- Tab Tổng quan: KPI (Chi tiêu, Hiển thị, Click, CTR, CPC, ROAS tổng), 2 khối song song "Shop Ads thủ công" và "GMV Max" (GMV Max có nhãn "ROI do TikTok tính, gồm cả đơn tự nhiên"), biểu đồ cột chồng chi tiêu theo nguồn + đường ROAS tổng, widget dự báo ngân sách tháng.
- Tab Chiến dịch thủ công / GMV Max: bảng chiến dịch (tên, advertiser, trạng thái bật/tắt, ngân sách, chi tiêu, hiển thị, click, CTR, CPC, đơn, doanh thu, ROAS/ROI — badge màu: ≥4 xanh, 2–4 vàng, <2 đỏ).

### 3.6 Hoàn / Huỷ (mới)
KPI tỉ lệ hoàn, tỉ lệ huỷ, tiền hoàn; biểu đồ theo ngày; lý do hàng đầu (thanh ngang); bảng yêu cầu.

### 3.7 Khách hàng
KPI người mua, khách mới, tỉ lệ quay lại; phân khúc (donut); top tỉnh/thành; bảng cohort giữ chân 6 tháng (heatmap). Không hiển thị PII.

### 3.8 Cảnh báo, Báo cáo
Giữ chức năng v1, cập nhật danh sách metric (04 §7). Form tạo rule: metric, toán tử, ngưỡng, cửa sổ, kênh gửi.

### 3.9 Cài đặt → Kết nối
- Hai thẻ tách bạch: **"TikTok Shop · TikTok Shop Partner API"** (mỗi uỷ quyền seller — trạng thái, nguồn: khách tự gắn / App Store / link DigiAds, hạn token, shop + bật/tắt đồng bộ)
  và **"TikTok Ads · TikTok for Business"** (advertiser — tiền tệ, múi giờ + cảnh báo khác múi giờ shop, nguồn token: khách / BC DigiAds, store → shop).
- Dòng mốc đồng bộ chung, bảng "Tình trạng đồng bộ" (nút "Đồng bộ ngay" khi có quyền sửa), thanh hạn mức gói.
- Onboarding, thành viên, tài khoản, quản trị: `12-accounts-and-access.md` §3, §7.

## 4. Quy ước
- Data fetching: TanStack Query, mỗi endpoint một hook trong `lib/hooks/` (`useOverview`, `useOrders`, …), `queryKey = [endpoint, shopId, from, to, ...filters]`.
- Mọi trang có 3 trạng thái: skeleton khi tải, empty state ("Chưa có dữ liệu — đồng bộ lần đầu có thể mất vài phút" + link Kết nối), lỗi (thông báo + nút thử lại).
- Biểu đồ: ECharts (`echarts-for-react`, đã có). Màu: GMV `#3B82F6`, chi QC `#F59E0B`, GMV Max `#8B5CF6`, huỷ/hoàn `#EF4444`, tốt `#10B981`.
- Tiền: `formatVND()` / `formatVNDCompact()` (`apps/web/lib/format.ts`). Ngày: `dd/MM` theo `Asia/Ho_Chi_Minh`.
- Ngôn ngữ giao diện: tiếng Việt.
- Responsive: sidebar thu gọn thành drawer dưới 1024px; bảng cuộn ngang trong khung riêng.
