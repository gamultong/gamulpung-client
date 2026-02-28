import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const host = process.env.NEXT_PUBLIC_HOST || 'https://gamulpung.com';
  const now = new Date();

  const routes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '/', priority: 1.0, changeFrequency: 'weekly' },
    { path: '/play', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/documents', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/documents/how-to-play', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/documents/contribute-guide', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/documents/blog', priority: 0.6, changeFrequency: 'weekly' },
    { path: '/documents/release-notes', priority: 0.5, changeFrequency: 'monthly' },
  ];

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: host + path,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
