/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  transpilePackages: ["@ecomdash/shared"],
  // The P&L pages were renamed to "Dashboard" / "Hiệu quả sản phẩm" — keep old bookmarks working.
  async redirects() {
    return [
      { source: "/overview", destination: "/dashboard", permanent: true },
      { source: "/profit/products", destination: "/products/performance", permanent: true },
      { source: "/sign-in", destination: "/login", permanent: true },
    ];
  },
};
