/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_MAPTILER_KEY: "8rgoitRLGMm5tjewUhOy",
    OPENAI_API_KEY: "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",
  },
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
