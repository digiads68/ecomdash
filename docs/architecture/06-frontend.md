# 06 — Frontend (apps/web)

Giao diện giả định để duyệt: `docs/mockups/index.html` (mở trực tiếp trong trình duyệt). Khi triển khai, bám bố cục và nội dung từng màn hình trong mockup; số liệu thật lấy từ API ở `05-api-contracts.md`.

## 1. Sửa nền (bắt buộc trước khi làm trang)

| Lỗi | Sửa |
|---|---|
| Thiếu `postcss.config.js` → Tailwind không chạy | Thêm `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }` |
| `app/page.tsx` và `app/(dashboard)/page.tsx` cùng `/` | Xoá `app/page.tsx` (server component gọi Prisma — web không truy cập DB); `(dashboard)/page.tsx` redirect `/overview` |
| `/api/api` lặp | `NEXT_PUBLIC_API_URL` không chứa `/api`; `api-client.ts` ghép `${base}/api${path}` |
| `selectedShopId` không bao giờ được set | `ShopSwitcher` trong Topbar gọi `GET /shops`, nếu store rỗng/không còn hợp lệ thì chọn shop đầu tiên |
| Clerk bắt buộc | `lib/auth.ts` đọc `NEXT_PUBLIC_AUTH_MODE`; `demo` → không render `ClerkProvider`, `middleware.ts` cho qua mọi route, `useApiClient` không gửi Bearer; Topbar hiển thị "Tài khoản demo" thay cho `UserButton`/`OrganizationSwitcher` |
| Ngày gửi API dạng ISO datetime | Gửi `YYYY-MM-DD` theo `Asia/Ho_Chi_Minh` (helper `toBusinessDate()` trong `lib/format.ts`) |

## 2. Điều hướng

Sidebar (`bg-gray-900`, mục đang chọn `bg-primary-600`), nhóm:

```
TỔNG QUAN
  Tổng quan            /overview
BÁN HÀNG
  Đơn hàng             /orders           (+ /orders/[id])
  Sản phẩm             /products         (+ /products/[id])
  Hoàn / Huỷ           /returns
  Khách hàng           /customers
TÀI CHÍNH
  Tài chính            /finance
QUẢNG CÁO
  Quảng cáo            /ads              (tab: Tổng quan · Chiến dịch thủ công · GMV Max)
VẬN HÀNH
  Cảnh báo             /alerts
  Báo cáo định kỳ      /reports
  Cài đặt              /settings         (tab: Kết nối · Chi phí · Nhóm · Gói dịch vụ)
```
Bỏ `/shop` và `/analytics` của v1 (nội dung gộp vào Tổng quan và Quảng cáo).

Topbar: ShopSwitcher · DateRangePicker (Hôm nay, Hôm qua, 7 ngày, 30 ngày, Tháng này, Tháng trước, Tuỳ chọn) · "Cập nhật lúc HH:mm" (từ `syncedAt`) · chuông cảnh báo · tài khoản.
DemoBanner vàng khi `NEXT_PUBLIC_DEMO_MODE=true`: "Chế độ demo — dữ liệu giả lập từ mock TikTok API".

## 3. Màn hình

### 3.1 Tổng quan
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

### 3.9 Cài đặt → Kết nối (mới, quan trọng)
- Thẻ "TikTok Shop": mỗi seller authorization — tên seller, trạng thái (badge), hạn access token, hạn uỷ quyền; danh sách shop (tên, mã, bật/tắt đồng bộ, lần đồng bộ đơn cuối).
- Thẻ "TikTok Ads": advertiser — tiền tệ, múi giờ, store link (store → shop, nút "Chọn shop" khi chưa khớp).
- Bảng "Tình trạng đồng bộ": resource × trạng thái × lần thành công cuối × lỗi; nút "Đồng bộ ngay".
- Nút "Kết nối TikTok Shop" / "Kết nối TikTok Ads" (demo → trang uỷ quyền giả của mock).
- Thanh hạn mức gói: "2 / 5 shop (PRO)".

## 4. Quy ước
- Data fetching: TanStack Query, mỗi endpoint một hook trong `lib/hooks/` (`useOverview`, `useOrders`, …), `queryKey = [endpoint, shopId, from, to, ...filters]`.
- Mọi trang có 3 trạng thái: skeleton khi tải, empty state ("Chưa có dữ liệu — đồng bộ lần đầu có thể mất vài phút" + link Kết nối), lỗi (thông báo + nút thử lại).
- Biểu đồ: ECharts (`echarts-for-react`, đã có). Màu: GMV `#3B82F6`, chi QC `#F59E0B`, GMV Max `#8B5CF6`, huỷ/hoàn `#EF4444`, tốt `#10B981`.
- Tiền: `formatVND()` / `formatVNDCompact()` (`apps/web/lib/format.ts`). Ngày: `dd/MM` theo `Asia/Ho_Chi_Minh`.
- Ngôn ngữ giao diện: tiếng Việt.
- Responsive: sidebar thu gọn thành drawer dưới 1024px; bảng cuộn ngang trong khung riêng.
