import nextConfig from 'eslint-config-next';

const baseConfig = Array.isArray(nextConfig) ? nextConfig : [nextConfig];

export default [
  ...baseConfig,
  {
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
];
