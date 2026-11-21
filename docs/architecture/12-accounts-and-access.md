# 12 — Tài khoản, phân quyền, gắn kết TikTok Shop + Ads, đồng bộ cùng khung

> Nguồn chuẩn cho: phân cấp tài khoản, ai xem/sửa được shop nào, luồng khách vào hệ thống, DigiAds gắn thay khách,
> vòng đồng bộ chung của shop và quảng cáo. Code: `apps/api/src/access/`, `auth/`, `connections/`, `admin/`, `orgs/`,
> `sync/org-round.service.ts`; web: `/login`, `/onboarding`, `/invite/[token]`, `/admin/*`, `/settings/members|account|connections`.

## 1. Bối cảnh và giới hạn của TikTok

- **Không có đăng nhập bằng tài khoản TikTok Shop Partner (TSP)** cho hệ thống ngoài. Uỷ quyền "Partner" chỉ dành cho Affiliate
  Partner; token Partner không xem được shop của khách và không có API liệt kê shop của partner.
  DigiAds thấy shop vì **từng seller uỷ quyền app của DigiAds** → mỗi seller một token, liệt kê shop bằng
  `GET /authorization/202309/shops`. Vì vậy nhân viên DigiAds đăng nhập bằng **email + mật khẩu**.
- Seller có thể uỷ quyền app ngay trong **Seller Center App Store** — callback **không có `state`** → hệ thống không biết của khách nào
  → lưu vào **kho uỷ quyền chưa gán**, DigiAds gán sau.
- **Chi phí quảng cáo không lấy được từ Shop API** (không có chi tiêu/chiến dịch/ROI, không có liên kết shop↔tài khoản QC). Shop API chỉ có
  dữ liệu để đối chiếu (§5.3). Chi phí QC luôn lấy từ TikTok for Business (Marketing API).
- TikTok for Business: token của **Business Center DigiAds** thấy các tài khoản quảng cáo khách chia sẻ vào BC (BC tổng) hoặc nằm trong BC con của DigiAds
  (`/oauth2/advertiser/get/`, `/bc/get/`, `/bc/asset/get/`). Khớp store↔shop qua `/gmv_max/store/list/`.

## 2. Phân cấp

```
Nền tảng DigiAds (User.platformRole)
  ├─ SUPER_ADMIN  mọi tổ chức, mọi shop; quản lý nhân viên (kể cả cấp Admin); gắn thay khách
  ├─ ADMIN        mọi tổ chức, mọi shop; mời Mod và giao shop cho Mod; gắn thay khách
  └─ MOD          chỉ xem các shop được giao (ShopAccess), có thể thuộc nhiều khách; không vào trang quản trị
Tổ chức khách (OrganizationMember.role)
  ├─ OWNER        người đăng nhập TikTok đầu tiên (hoặc người nhận lời mời chủ); mọi shop; mời thành viên; kết nối; gỡ kết nối
  ├─ ADMIN        như OWNER trừ gỡ kết nối / xoá tổ chức
  └─ MEMBER       chỉ xem các shop được giao (ShopAccess)
```

Quy tắc (hàm thuần `apps/api/src/access/access.ts`, test bảng quyền `access.spec.ts`):

| Hành động | SUPER_ADMIN / ADMIN | MOD | OWNER / ADMIN tổ chức | MEMBER |
|---|---|---|---|---|
| Xem shop | mọi shop đã gán khách | shop được giao | mọi shop của tổ chức | shop được giao |
| Sửa giá vốn, chi phí, cảnh báo, báo cáo, kết nối | ✓ | — | ✓ (tổ chức mình) | — |
| Quản lý thành viên | ✓ | — | ✓ | — |
| Gỡ kết nối TikTok | ✓ | — | chỉ OWNER | — |
| Trang `/admin/*` | ✓ | — | — | — |

- Mọi route theo shop dùng `getShopForUser(access, shopId, "view"|"edit")`: ngoài phạm vi → **404**, chỉ xem mà sửa → **403**.
- Route theo tổ chức nhận `orgId` (query) qua `resolveOrgId(access, orgId, mode)`; bỏ trống thì dùng tổ chức duy nhất của người dùng.
- `GET /shops` trả các shop xem được kèm `organizationName`, `canEdit` — web nhóm shop theo khách trong ô chọn shop.
- Job nền (báo cáo, cảnh báo) dùng `SYSTEM_ACCESS`.

## 3. Luồng vào hệ thống

### 3.1 Khách tự đăng ký — bắt buộc gắn hai nền tảng
```
/login ─"Đăng nhập bằng TikTok Shop"─► GET /api/auth/tiktok/start (state intent=login)
  └► trang uỷ quyền TikTok Shop ─► GET /api/connections/shop/callback
       open_id mới  → tạo Organization (tên = seller_name, gói PRO dùng thử, cảnh báo mẫu) + User OWNER (tiktokOpenId)
                      + SellerAuthorization + Shop → cấp phiên → /onboarding
       open_id cũ   → đăng nhập lại (không tạo trùng) → /dashboard
/onboarding (3 bước, quay lại được, có thanh tiến độ đồng bộ lần đầu)
  1. TikTok Shop  ✓ (gắn thêm shop nếu có nhiều tài khoản seller)                         [bắt buộc]
  2. TikTok Ads   "Kết nối TikTok for Business" → advertiser + khớp store↔shop            [bắt buộc]
                  hoặc "Tôi không chạy quảng cáo TikTok" → Organization.adsMode = NONE
  3. Tài khoản    đặt email + mật khẩu (tuỳ chọn) → POST /connections/orgs/:id/onboarded
```
- Trạng thái gắn kết tính sẵn (`orgLinkStatus`): `shopLinked`, `adsLinked`, `adsMode`, `storeLinksComplete`, `ready = shopLinked && (adsLinked || adsMode=NONE)`.
- Khi `!ready`, các trang dữ liệu của khách hiển thị thẻ **"Hoàn tất kết nối"** thay vì số liệu thiếu một nửa (doanh thu có mà QC chưa có làm ROAS/lãi ròng sai).
- Hệ thống **nhớ cả hai kết nối**: `SellerAuthorization` (token Shop, tự làm mới dưới advisory lock) và `AdsAuthorization` (token Marketing API, không hết hạn theo thời gian).

### 3.2 DigiAds gắn thay khách
Nguồn quyền DigiAds đang có:
- **Shop**: mọi uỷ quyền app nhận được. Không có `state` (App Store) → `SellerAuthorization.organizationId = null`, `source = APP_STORE`.
- **Ads**: kết nối **Business Center DigiAds** ở `/admin/agency` (OAuth TikTok for Business, `state intent=agency`) → `AdsAuthorization.kind = AGENCY_BC`,
  advertiser mới vào kho (`organizationId = null`).

Thao tác (Super admin / Admin):
- `/admin/clients` → **Tạo khách hàng** (tên + email chủ; gửi lời mời OWNER) khi khách chưa từng đăng nhập.
- `/admin/clients/[id]` → **Gắn kết thay khách**: chọn uỷ quyền shop / tài khoản QC trong kho → `POST /admin/orgs/:id/assign-seller|assign-advertiser`.
  Gán uỷ quyền seller là gán **cả uỷ quyền** (mọi shop của tài khoản seller đó). Gán advertiser xong hệ thống tải lại store và tự khớp store↔shop.
- **Link mời gắn kết** (`GET /admin/orgs/:id/connect-links`): link uỷ quyền TikTok Shop và TikTok Ads gắn sẵn `orgId` trong `state`, hiệu lực 7 ngày —
  khi DigiAds chưa có quyền, khách bấm link là vào thẳng tổ chức (`source = ADMIN_LINK`).
- `/admin/pool` gom mọi uỷ quyền chưa gán; tài khoản QC có store khớp shop của một khách được gợi ý sẵn khách đó.
- Gỡ về kho: `POST /admin/unassign {type: SELLER|ADVERTISER}` — dữ liệu giữ nguyên, khách không còn thấy; ShopAccess của shop đó bị xoá.
- Khách sau đó đăng nhập bằng TikTok Shop: `open_id` khớp uỷ quyền đã gán → vào đúng tổ chức, được tạo membership OWNER.
- **AuditLog** ghi mọi gắn/gỡ/mời: ai, lúc nào, tổ chức nào, đối tượng nào (`/admin/clients/[id]` → Nhật ký gắn kết).

Một tài khoản QC vừa do khách tự OAuth vừa thấy qua BC DigiAds: **một** `Advertiser` (unique `tiktokAdvertiserId`), nhiều nguồn token qua
bảng nối `AdvertiserAuthorization`. Đồng bộ chọn token ACTIVE theo thứ tự **CLIENT trước, AGENCY_BC sau** (`adsClientFor`); token khách hỏng thì tự rơi về token BC.
Advertiser đã thuộc khách A thì OAuth của khách B bỏ qua nó (báo "đã thuộc khách khác").

### 3.3 Thành viên và nhân viên
- Khách: `/settings/members` (OWNER/ADMIN) → mời email với vai trò ADMIN hoặc MEMBER + chọn shop; sửa vai trò, sửa shop, xoá.
- DigiAds: `/admin/staff` → mời Mod/Admin (Admin/Super admin chỉ Super admin cấp), giao shop cho Mod (shop của nhiều khách), khoá tài khoản (xoá mọi phiên).
- Lời mời: token ngẫu nhiên, DB lưu SHA-256, hiệu lực 7 ngày, email qua SendGrid (demo chỉ log), trang `/invite/[token]` đặt mật khẩu.

## 4. Đồng bộ cùng khung (shop + quảng cáo)

- **Vòng đồng bộ theo tổ chức** (`org.round`, `OrgRoundService`): lần lượt `orders → returns` của mọi shop, rồi `ads.reports` (kéo lại 7 ngày) của mọi advertiser,
  trong cùng một job, cùng lịch (15 phút × `SYNC_INTERVAL_FACTOR`). Sản phẩm, đối soát, analytics, chiến dịch chạy lịch riêng chậm hơn.
  Backfill xong một shop thì xếp ngay một vòng để có mốc chung đầu tiên.
- Mỗi vòng ghi `SyncRound { startedAt, finishedAt, shopOk, adsOk, shopSyncedTo, adsSyncedTo, error }`.
- `GET /sync/watermark?orgId` → mốc chung. Thanh trên cùng hiển thị **một** dòng "Số liệu đến HH:mm (shop + QC)" = mốc sớm hơn của hai nguồn;
  QC trễ hơn 20 phút → nhãn vàng "Quảng cáo trễ N phút" và thông báo trên Dashboard "ROAS và lãi ròng hôm nay sẽ còn thay đổi".
- Khung thời gian: đơn gom theo ngày đặt trong múi giờ shop; QC theo `stat_time_day` trong múi giờ tài khoản QC. Khác múi giờ → cảnh báo ở trang Kết nối, không dịch số.
- Kiểm thử: `MOCK_ADS_DELAY_MIN=45` cho Ads API của mock trễ 45 phút.

## 5. Dữ liệu quảng cáo phía TikTok Shop — chỉ để đối chiếu

| Dữ liệu | Nguồn | Lưu | Dùng |
|---|---|---|---|
| `gmv_max_ad_fee_amount` (phí GMV Max trừ vào tiền đơn khi bật tự trả) | finance 202501 order transactions — cấp giao dịch, hoặc trong `fee_tax_breakdown.fee` (không cộng cả hai) | `OrderSettlement.gmvMaxAdFee` | **loại khỏi phí sàn / phí khác** (P&L dùng `settlementAmount + gmvMaxAdFee`); kiểm tra chéo với chi tiêu GMV Max từ Ads API trên các ngày đã đối soát (> 14 ngày) |
| `affiliate_ads_commission_amount` | như trên | `OrderSettlement.affiliateAdsCommission` (vẫn tính trong hoa hồng affiliate) | hiển thị |
| Điều chỉnh `GMV_PAYMENT_FOR_ADS` (QC trả bằng số dư shop) | dòng `type=ADJUSTMENT` trong statement transactions | `StatementAdjustment` | "QC trừ vào số dư shop" — không cộng vào phí khác, không cộng vào chi phí QC |
| Tỉ lệ doanh thu `GMV_MAX` / `NON_GMV_MAX` | `/analytics/202509/shop/performance` → `gmv_breakdowns` | `ShopDailyStat.gmvMaxRevenueShare` | "x% doanh thu đến từ GMV Max" |

`PnlSummaryDto.dataQuality` trả `shopGmvMaxAdFee`, `adsPaidFromBalance`, `gmvMaxFeeGap`, `gmvMaxRevenueShare`; Dashboard hiện thẻ "Đối chiếu quảng cáo phía TikTok Shop".
Hình dạng chính xác của các trường trên với shop VN là **[CHƯA XÁC MINH]** — xem `09-go-live-checklist.md`.

## 6. Xác thực

- Phiên do API cấp: cookie `ecomdash_session` (httpOnly, SameSite=Lax, Secure khi `APP_URL` là https), DB lưu SHA-256 trong `Session`, hết hạn `SESSION_DAYS` (30).
  Script có thể gửi `Authorization: Bearer <token>`.
- Mật khẩu băm `scrypt` (`scrypt$salt$hash`), tối thiểu 8 ký tự; sai 5 lần / 15 phút theo email+IP (Redis) → khoá tạm.
- Route: `POST /auth/login`, `POST /auth/logout`, `GET /me`, `GET /auth/tiktok/start`, `POST /auth/password`, `POST /auth/sessions/revoke-others`,
  `GET /auth/invitations/:token`, `POST /auth/invitations/accept`, `GET /auth/demo-accounts` (chỉ `DEMO_MODE=true`).
- OAuth `state`: JWT ký bằng `STATE_JWT_SECRET`, 30 phút (link mời 7 ngày), `intent: login | connect | agency`, `orgId`, `byUserId`, `returnTo`.
- Web: `middleware.ts` chuyển về `/login` khi không có cookie phiên; mọi `fetch` dùng `credentials: "include"`; API trả 401 → web về `/login?next=…`.
  Cookie do API (`:4000`) đặt, web (`:3000`) đọc được vì cookie theo host, không theo cổng. **Production phải đặt web và API cùng site** (ví dụ
  `app.example.vn` + `api.example.vn` với cookie domain chung, hoặc proxy `/api` qua cùng domain) — xem `09`.
- `DEMO_MODE=true`: khoá dự phòng cho `ENCRYPTION_KEY`/`STATE_JWT_SECRET`/`PII_SALT`, danh sách tài khoản demo trên `/login`. Production + `DEMO_MODE=true` → API từ chối khởi động.
- Seed: `admin@digiads.vn` (SUPER_ADMIN) và `mod@digiads.vn` (MOD) với mật khẩu `demo12345`; production chỉ tạo Super admin từ `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` (bắt buộc).

## 7. Dữ liệu (migration `20261122000000_accounts_access`)

- `User`: `email?` unique, `passwordHash?`, `platformRole?`, `tiktokOpenId?` unique, `status` (ACTIVE|INVITED|DISABLED), `lastLoginAt`.
- `Organization`: `adsMode` (TIKTOK|NONE), `onboardedAt?`, `createdById?`. `OrganizationMember.role`: OWNER|ADMIN|MEMBER (VIEWER cũ → MEMBER).
- Mới: `ShopAccess`, `Session`, `Invitation`, `AuditLog`, `SyncRound`, `StatementAdjustment`, `AdvertiserAuthorization`.
- `SellerAuthorization.organizationId?`, `openId` unique, `source`; `Shop.organizationId?`, `tiktokShopId` unique; `AdsAuthorization.organizationId?`, `kind`, `bcId?`, `label?`;
  `Advertiser.organizationId?`, `tiktokAdvertiserId` unique; `SyncState.organizationId?`.
- `OrderSettlement.gmvMaxAdFee`, `affiliateAdsCommission`; `ShopDailyStat.gmvMaxRevenueShare`.

## 8. Mock và kịch bản demo

`apps/mock-tiktok`: ba seller với token riêng (`open_id` khác nhau, token seller A gọi shop seller B → `101000`):
"Công ty TNHH Mỹ Phẩm Hoa Sen" (2 shop), "Thời Trang Mây" (1), "Đồ Chơi Bin" (1). Trang uỷ quyền giả có ô chọn tài khoản;
`/__mock/app-store-authorize?seller=…` mô phỏng uỷ quyền từ App Store (không `state`). Ads: mỗi seller tài khoản riêng; "Business Center: DigiAds (agency)"
thấy 3 tài khoản (Hoa Sen Beauty chia sẻ vào BC, Mây và Bin nằm trong BC DigiAds). Thời Trang Mây bật tự trả GMV Max từ tiền đơn; Hoa Sen Beauty trả một phần QC bằng số dư shop.

`pnpm demo:connect` (`scripts/demo-connect.ts`) dựng qua đúng các endpoint thật:
- **Hoa Sen**: đăng nhập TikTok Shop → gắn Ads qua OAuth riêng → đặt mật khẩu `owner@hoasen.vn` → mời `nhanvien@hoasen.vn` chỉ xem shop Home.
- **Thời Trang Mây**: uỷ quyền từ App Store (vào kho) → admin kết nối BC DigiAds → tạo khách → gắn thay shop + tài khoản QC.
- **Đồ Chơi Bin**: chỉ gắn Shop, chưa gắn Ads → thấy "Hoàn tất kết nối".
- **Mod** được giao Hoa Sen Beauty + Thời Trang Mây.

Kiểm chứng end-to-end: `pnpm --filter @ecomdash/api exec tsx ../../scripts/check-access.ts` (ma trận quyền, nhật ký gắn thay, hai nguồn token, mốc đồng bộ chung, đối chiếu GMV Max).
