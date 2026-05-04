/**
 * Simple linear regression forecast for end-of-month ad spend.
 * Takes daily cumulative spend array [day1, day2, ...dayN] and
 * projects total spend for the full month.
 */
export function forecastEndOfMonth(dailySpend: number[], daysInMonth: number): number {
  const n = dailySpend.length;
  if (n === 0) return 0;
  if (n === 1) return dailySpend[0] * daysInMonth;

  // Cumulative spend by day
  let cumSum = 0;
  const cumulative = dailySpend.map((d) => (cumSum += d));

  // Linear regression: fit y = a + b*x where x = day index (1-based)
  const xs = Array.from({ length: n }, (_, i) => i + 1);
  const ys = cumulative;

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);

  const b = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const a = (sumY - b * sumX) / n;

  const projected = a + b * daysInMonth;
  return Math.max(projected, cumulative[n - 1]);
}
