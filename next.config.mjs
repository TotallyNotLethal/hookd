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
