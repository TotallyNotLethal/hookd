/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Google profile photos
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      // Firebase Storage and Google APIs (for user uploads)
      {
        protocol: 'https',
        hostname: '**.firebasestorage.app',
      },
      {
        protocol: 'https',
        hostname: '**.googleapis.com',
      },
      // Optional fallback for other external image sources
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  serverExternalPackages: ['@xenova/transformers', 'sharp', 'onnxruntime-node'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = Array.isArray(config.externals)
        ? config.externals
        : config.externals
        ? [config.externals]
        : [];
      externals.push({
        sharp: 'commonjs sharp',
        '@xenova/transformers': 'commonjs @xenova/transformers',
        'onnxruntime-node': 'commonjs onnxruntime-node',
      });
      config.externals = externals;
    }
    return config;
  },
};

export default nextConfig;
