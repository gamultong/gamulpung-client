import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const host = 'https://gamultong.github.io/gamulpung-client/';
  const now = new Date();
  const routes = ['/', '/documents', '/play'];
  return routes.map(path => ({
    url: host + path,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : 0.8,
  }));
}
