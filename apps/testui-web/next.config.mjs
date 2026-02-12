/** @type {import('next').NextConfig} */
const nextConfig = {
  // Separate dev cache from production build output to avoid
  // stale chunk/runtime mismatch on frequent dev/build switching.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next"
};

export default nextConfig;
