import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import Navigation from '@/components/navigation';
import Footer from '@/components/footer';
import { Suspense } from 'react';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

const host = process.env.NEXT_PUBLIC_HOST;
const siteUrl = host || 'https://gamulpung.com';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Gamulpung - Infinite Multiplayer Minesweeper | 무한 멀티플레이어 지뢰찾기',
    template: '%s | Gamulpung',
  },
  description:
    'Play infinite multiplayer minesweeper online for free. Explore an endless map with real-time co-op. 무한으로 펼쳐지는 맵에서 다른 플레이어와 실시간으로 함께하는 온라인 지뢰찾기 게임.',
  keywords: [
    'minesweeper',
    'multiplayer minesweeper',
    'online minesweeper',
    'infinite minesweeper',
    'co-op minesweeper',
    'browser game',
    '지뢰찾기',
    '멀티플레이어 지뢰찾기',
    '온라인 지뢰찾기',
    '무한 지뢰찾기',
    '지뢰찾기 같이하기',
    '지뢰찾기 온라인',
  ],
  alternates: {
    canonical: '/',
    languages: {
      'en-US': '/',
      'ko-KR': '/ko',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    alternateLocale: 'ko_KR',
    url: siteUrl,
    siteName: 'Gamulpung',
    title: 'Gamulpung - Infinite Multiplayer Minesweeper',
    description:
      'Play infinite multiplayer minesweeper online for free. Explore an endless map with real-time co-op.',
    images: [
      {
        url: siteUrl + '/ogimage.png',
        width: 1200,
        height: 630,
        alt: 'Gamulpung - Infinite Multiplayer Minesweeper Game',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gamulpung - Infinite Multiplayer Minesweeper',
    description:
      'Play infinite multiplayer minesweeper online for free. Explore an endless map with real-time co-op.',
    images: siteUrl + '/ogimage.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="google-site-verification" content="1sW-H9-5GodnFCoN_y-Cbz8mVgWH5zED1nvKVKKtG88" />
        <link rel="canonical" href={siteUrl} />
        <meta name="theme-color" content="#000000" />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'VideoGame',
              name: 'Gamulpung - Infinite Multiplayer Minesweeper',
              alternateName: '가물퐁 - 무한 멀티플레이어 지뢰찾기',
              description:
                'Play infinite multiplayer minesweeper online for free. Explore an endless map with real-time co-op.',
              url: siteUrl,
              image: siteUrl + '/ogimage.png',
              genre: ['Puzzle', 'Multiplayer', 'Strategy'],
              gamePlatform: 'Web Browser',
              applicationCategory: 'Game',
              operatingSystem: 'Any',
              playMode: ['MultiPlayer', 'CoOperative'],
              numberOfPlayers: {
                '@type': 'QuantitativeValue',
                minValue: 1,
              },
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
                availability: 'https://schema.org/InStock',
              },
              inLanguage: ['en', 'ko'],
            }),
          }}
        />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'Gamulpung',
              url: siteUrl,
            }),
          }}
        />
        <link
          rel="preload"
          href="https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_2302@1.0/LOTTERIACHAB.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_2302_01@1.0/GeekbleMalang2WOFF2.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Suspense fallback={<div>Loading...</div>}>
          <Navigation />
          {children}
          <Footer />
        </Suspense>
      </body>
    </html>
  );
}
