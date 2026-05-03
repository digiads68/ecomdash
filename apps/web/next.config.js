/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ecomdash/shared"],
  images: {
    domains: ["picsum.photos"],
  },
};

module.exports = nextConfig;
