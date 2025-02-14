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
};

module.exports = nextConfig;
