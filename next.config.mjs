/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['edge-tts-universal', 'ws', 'bufferutil', 'utf-8-validate'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent webpack from bundling optional native addons used by 'ws'.
      // Without this, webpack replaces require('bufferutil') with an empty
      // object instead of throwing, so ws never falls back to its pure-JS path.
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        { bufferutil: 'bufferutil', 'utf-8-validate': 'utf-8-validate' },
      ];
    }
    return config;
  },
};
export default nextConfig;
