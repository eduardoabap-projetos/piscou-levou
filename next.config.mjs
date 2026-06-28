/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hostinger: static HTML export
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js'],
  },
};

export default nextConfig;
