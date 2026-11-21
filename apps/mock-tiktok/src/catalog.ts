export interface SkuDef { name: string; price: number }
export interface ProductDef { title: string; category: string; skus: SkuDef[]; color: string; status?: string }

const v = (names: string[], base: number, step = 40_000): SkuDef[] => names.map((n, i) => ({ name: n, price: base + i * step }));

export const BEAUTY: ProductDef[] = [
  { title: "Serum Vitamin C 15% Sáng Da", category: "Serum", skus: v(["30ml", "50ml"], 189_000), color: "#e11d48" },
  { title: "Kem Chống Nắng Nâng Tông SPF50+ PA++++", category: "Chống nắng", skus: v(["50ml"], 245_000), color: "#f97316" },
  { title: "Son Kem Lì Velvet Matte", category: "Son môi", skus: v(["Đỏ gạch", "Hồng đất", "Cam cháy"], 159_000, 0), color: "#0ea5e9" },
  { title: "Toner Hoa Cúc Cân Bằng Da", category: "Toner", skus: v(["200ml"], 129_000), color: "#10b981" },
  { title: "Sữa Rửa Mặt Trà Xanh Dịu Nhẹ", category: "Sữa rửa mặt", skus: v(["100ml", "150ml"], 99_000), color: "#8b5cf6" },
  { title: "Mặt Nạ Ngủ Collagen", category: "Mặt nạ", skus: v(["80g"], 219_000), color: "#f59e0b" },
  { title: "Tẩy Da Chết Cà Phê Đắk Lắk", category: "Tẩy tế bào chết", skus: v(["200g"], 89_000), color: "#14b8a6" },
  { title: "Nước Tẩy Trang Bí Đao", category: "Tẩy trang", skus: v(["250ml", "500ml"], 135_000), color: "#6366f1" },
  { title: "Kem Dưỡng Ẩm B5 Phục Hồi", category: "Kem dưỡng", skus: v(["50ml"], 265_000), color: "#ec4899" },
  { title: "Dầu Gội Bưởi Kích Thích Mọc Tóc", category: "Chăm sóc tóc", skus: v(["310ml", "500ml"], 149_000, 50_000), color: "#84cc16" },
  { title: "Xịt Khoáng Nha Đam", category: "Xịt khoáng", skus: v(["150ml"], 119_000), color: "#e11d48" },
  { title: "Phấn Phủ Kiềm Dầu Mịn Lì", category: "Trang điểm", skus: v(["Tự nhiên", "Sáng"], 199_000, 0), color: "#f97316" },
  { title: "Serum Niacinamide 10% Giảm Thâm", category: "Serum", skus: v(["30ml"], 209_000), color: "#0ea5e9" },
  { title: "Gel Rửa Mặt Tràm Trà Giảm Mụn", category: "Sữa rửa mặt", skus: v(["120ml"], 115_000), color: "#10b981" },
  { title: "Kem Mắt Peptide Giảm Bọng", category: "Kem dưỡng", skus: v(["15ml"], 289_000), color: "#8b5cf6" },
  { title: "Son Dưỡng Có Màu Dầu Dừa", category: "Son môi", skus: v(["Hồng nude", "Đỏ cherry"], 79_000, 0), color: "#f59e0b" },
  { title: "Mặt Nạ Giấy Rau Má (hộp 10 miếng)", category: "Mặt nạ", skus: v(["Hộp 10"], 149_000), color: "#14b8a6" },
  { title: "Tinh Dầu Dưỡng Tóc Bưởi", category: "Chăm sóc tóc", skus: v(["50ml"], 99_000), color: "#6366f1" },
  { title: "Sữa Tắm Cà Phê Đánh Thức", category: "Chăm sóc cơ thể", skus: v(["400ml"], 159_000), color: "#ec4899" },
  { title: "Kem Body Dưỡng Trắng Ngọc Trai", category: "Chăm sóc cơ thể", skus: v(["200g"], 239_000), color: "#84cc16" },
  { title: "Bông Tẩy Trang 3 Lớp (222 miếng)", category: "Phụ kiện", skus: v(["Túi 222"], 45_000), color: "#e11d48" },
  { title: "Cushion Che Phủ Hoàn Hảo", category: "Trang điểm", skus: v(["#21", "#23"], 329_000, 0), color: "#f97316" },
  { title: "Kẻ Mắt Nước Chống Trôi", category: "Trang điểm", skus: v(["Đen", "Nâu"], 119_000, 0), color: "#0ea5e9" },
  { title: "Xịt Khoá Nền Kiềm Dầu", category: "Trang điểm", skus: v(["100ml"], 169_000), color: "#10b981" },
  { title: "Combo Serum C + Kem Chống Nắng", category: "Combo", skus: v(["Combo"], 399_000), color: "#8b5cf6" },
  { title: "Retinol 0.5% Phục Hồi Ban Đêm", category: "Serum", skus: v(["30ml"], 349_000), color: "#f59e0b" },
  { title: "Kem Trị Mụn Nghệ Hưng Yên", category: "Đặc trị", skus: v(["20g"], 95_000), color: "#14b8a6", status: "SELLER_DEACTIVATED" },
  { title: "Nước Hoa Hồng Không Cồn", category: "Toner", skus: v(["250ml"], 109_000), color: "#6366f1", status: "SELLER_DEACTIVATED" },
];

export const HOME: ProductDef[] = [
  { title: "Bộ 6 Hộp Thuỷ Tinh Đựng Thực Phẩm", category: "Nhà bếp", skus: v(["Bộ 6"], 259_000), color: "#0ea5e9" },
  { title: "Chảo Chống Dính Đá Hoa Cương", category: "Nhà bếp", skus: v(["24cm", "28cm"], 219_000, 60_000), color: "#f97316" },
  { title: "Kệ Gia Vị Xoay 360 Độ", category: "Nhà bếp", skus: v(["16 lọ"], 189_000), color: "#10b981" },
  { title: "Thảm Lau Chân Silicon Thấm Hút", category: "Phòng tắm", skus: v(["40x60", "50x80"], 89_000, 40_000), color: "#8b5cf6" },
  { title: "Móc Dán Tường Chịu Lực (10 cái)", category: "Tiện ích", skus: v(["Trong suốt"], 39_000), color: "#f59e0b" },
  { title: "Túi Hút Chân Không Đựng Chăn", category: "Lưu trữ", skus: v(["Bộ 5"], 129_000), color: "#14b8a6" },
  { title: "Đèn Ngủ Cảm Biến Chuyển Động", category: "Chiếu sáng", skus: v(["Ánh vàng", "Ánh trắng"], 69_000, 0), color: "#6366f1" },
  { title: "Bình Giữ Nhiệt Inox 316", category: "Đồ uống", skus: v(["500ml", "750ml"], 149_000, 30_000), color: "#ec4899" },
  { title: "Cây Lau Nhà Tự Vắt 360", category: "Vệ sinh", skus: v(["Bộ"], 279_000), color: "#84cc16" },
  { title: "Hộp Đựng Đồ Trang Điểm Mica", category: "Lưu trữ", skus: v(["3 tầng"], 159_000), color: "#e11d48" },
  { title: "Khăn Tắm Cotton Hữu Cơ", category: "Phòng tắm", skus: v(["70x140"], 119_000), color: "#f97316" },
  { title: "Nồi Chiên Không Dầu Mini 3.5L", category: "Điện gia dụng", skus: v(["Đen", "Trắng"], 690_000, 0), color: "#0ea5e9" },
  { title: "Rổ Inox Đa Năng Gấp Gọn", category: "Nhà bếp", skus: v(["Size L"], 99_000), color: "#10b981" },
  { title: "Bàn Chải Vệ Sinh Khe Hẹp (5 cái)", category: "Vệ sinh", skus: v(["Bộ 5"], 49_000), color: "#8b5cf6" },
];

export const FASHION: ProductDef[] = [
  { title: "Áo Sơ Mi Lụa Tay Dài Công Sở", category: "Áo nữ", skus: v(["S", "M", "L"], 289_000, 0), color: "#0ea5e9" },
  { title: "Chân Váy Midi Xếp Ly", category: "Váy", skus: v(["S", "M"], 259_000, 0), color: "#ec4899" },
  { title: "Quần Ống Rộng Vải Đũi", category: "Quần nữ", skus: v(["M", "L"], 229_000, 0), color: "#84cc16" },
  { title: "Đầm Hoa Nhí Cổ Vuông", category: "Đầm", skus: v(["S", "M", "L"], 349_000, 0), color: "#f97316" },
  { title: "Áo Thun Basic Cotton 100%", category: "Áo nữ", skus: v(["Trắng", "Đen", "Be"], 129_000, 0), color: "#6366f1" },
  { title: "Áo Khoác Cardigan Len Mỏng", category: "Áo khoác", skus: v(["Free size"], 299_000), color: "#14b8a6" },
  { title: "Túi Tote Vải Canvas", category: "Phụ kiện", skus: v(["Kem", "Đen"], 149_000, 0), color: "#f59e0b" },
  { title: "Set Bộ Mặc Nhà Linen", category: "Đồ bộ", skus: v(["M", "L"], 319_000, 0), color: "#8b5cf6" },
];

export const TOYS: ProductDef[] = [
  { title: "Bộ Xếp Hình Nam Châm 64 Chi Tiết", category: "Đồ chơi trí tuệ", skus: v(["64 chi tiết", "100 chi tiết"], 359_000, 150_000), color: "#f97316" },
  { title: "Xe Ô Tô Điều Khiển Địa Hình", category: "Xe điều khiển", skus: v(["Đỏ", "Xanh"], 429_000, 0), color: "#ef4444" },
  { title: "Bảng Vẽ Điện Tử LCD 10 Inch", category: "Đồ dùng học tập", skus: v(["Xanh", "Hồng"], 119_000, 0), color: "#10b981" },
  { title: "Gấu Bông Thỏ Tai Dài 50cm", category: "Thú bông", skus: v(["50cm"], 189_000), color: "#ec4899" },
  { title: "Bộ Đồ Chơi Nấu Ăn Gỗ", category: "Đồ chơi nhập vai", skus: v(["Bộ 22 món"], 279_000), color: "#a16207" },
  { title: "Slime Mây Bông 6 Màu", category: "Đồ chơi sáng tạo", skus: v(["Hộp 6"], 79_000), color: "#8b5cf6" },
];

export const PROVINCES: [string, number][] = [
  ["Thành phố Hồ Chí Minh", 28], ["Hà Nội", 22], ["Bình Dương", 8], ["Đồng Nai", 6], ["Đà Nẵng", 5], ["Hải Phòng", 4.5],
  ["Cần Thơ", 4], ["Khánh Hòa", 3], ["Nghệ An", 3], ["Thanh Hóa", 3], ["Bà Rịa - Vũng Tàu", 2.5], ["Quảng Ninh", 2.5],
  ["Long An", 2], ["Lâm Đồng", 2], ["Thừa Thiên Huế", 1.5], ["Bắc Ninh", 1.5],
];

export const CARRIERS = ["J&T Express", "Giao Hàng Nhanh", "SPX Express", "Ninja Van", "Viettel Post"];
export const CANCEL_REASONS = ["Người mua đổi ý", "Muốn thay đổi địa chỉ giao hàng", "Hết hàng", "Tìm được giá tốt hơn", "Giao hàng thất bại"];
export const RETURN_REASONS = ["Sản phẩm bị lỗi / hư hỏng", "Không đúng mô tả", "Giao sai hàng / thiếu hàng", "Không còn nhu cầu", "Hàng giả / nhái"];

export function thumbDataUri(title: string, color: string): string {
  const initials = title.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="12" fill="${color}"/><text x="40" y="50" font-family="Arial" font-size="28" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
