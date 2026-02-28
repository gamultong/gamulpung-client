import type { Metadata } from 'next';

const host = process.env.NEXT_PUBLIC_HOST || 'https://gamulpung.com';

export const metadata: Metadata = {
  title: 'Play Minesweeper Online - 지뢰찾기 플레이',
  description:
    'Play infinite multiplayer minesweeper online for free. No download needed. 무한 맵 온라인 지뢰찾기를 지금 바로 플레이하세요.',
  alternates: {
    canonical: '/play',
  },
  openGraph: {
    type: 'website',
    url: host + '/play',
    title: 'Play Minesweeper Online | Gamulpung',
    description:
      'Play infinite multiplayer minesweeper online for free. No download, real-time co-op.',
    images: [
      {
        url: host + '/ogimage.png',
        width: 1200,
        height: 630,
        alt: 'Gamulpung - Play Infinite Multiplayer Minesweeper Online',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Minesweeper Online | Gamulpung',
    description:
      'Play infinite multiplayer minesweeper online for free. No download, real-time co-op.',
    images: host + '/ogimage.png',
  },
};

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
