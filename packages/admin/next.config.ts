import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@elupedia/shared', '@elupedia/shorts'],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
