import type { Metadata } from 'next';

const host = 'https://gamultong.github.io/gamulpung-client/';

export const metadata: Metadata = {
  title: 'Play',
  description: 'Play infinite multiplayer Minesweeper in your browser.',
  alternates: {
    canonical: '/play',
  },
  openGraph: {
    type: 'website',
    url: host + '/play',
    title: 'Play | Gamulpung',
    description: 'Play infinite multiplayer Minesweeper in your browser.',
    images: [
      {
        url: host + '/ogimage.png',
        alt: 'Gamulpung',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play | Gamulpung',
    description: 'Play infinite multiplayer Minesweeper in your browser.',
    images: host + '/ogimage.png',
  },
};

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
