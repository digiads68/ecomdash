const vndFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const compactVndFormatter = new Intl.NumberFormat("vi-VN", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

const vnDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
});

export function formatVND(value: number): string {
  return vndFormatter.format(value);
}

export function formatVNDCompact(value: number): string {
  return compactVndFormatter.format(value) + "₫";
}

export function formatDate(dateStr: string): string {
  return vnDateFormatter.format(new Date(dateStr));
}

export function formatPctChange(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(value));
}

export function formatROAS(value: number): string {
  return `${value.toFixed(2)}x`;
}
