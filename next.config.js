const nextConfig = {
  /* config options here */
  sassOptions: {
    silenceDeprecations: ['legacy-js-api'],
  },
  images: {
    unoptimized: true,
  },
  experimental: {},

  output: 'export',
  basePath: '/gamulpung-client', // GitHub Pages에서 사용하는 경로로 설정
  assetPrefix: '/gamulpung-client/', // GitHub Pages에서 사용하는 경로로 설정
  trailingSlash: true, // 슬래시로 끝나게 설정
  distDir: 'out',

  webpack(config) {
    // Enable async WebAssembly support
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Ensure .wasm files are treated as assets
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    return config;
  },
};

module.exports = nextConfig;
