/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  devIndicators: false,
  experimental: {
    // Ensure .env.local is loaded in both next dev/build and scripts that use Next's env loader.
    typedRoutes: false,
  },
}

export default nextConfig
