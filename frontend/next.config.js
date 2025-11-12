/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloudflare Pages compatibility
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Enable static export for Cloudflare Pages
  trailingSlash: true,
  reactStrictMode: true,
  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/v1',
  },
  // TypeScript strict mode
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
}

module.exports = nextConfig
