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
    default: 'Gamulpung',
    template: '%s | Gamulpung',
  },
  description: 'Gamulpung, Web Multi-play Infinity Minesweeper Game',
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
    images: [
      {
        url: siteUrl + '/ogimage.png',
        alt: 'Gamulpung',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gamulpung',
    description: 'Gamulpung, Web Multi-play Infinity Minesweeper Game',
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
              '@type': 'Organization',
              name: 'Gamulpung',
              url: siteUrl,
              logo: siteUrl + '/icon.png',
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
              potentialAction: {
                '@type': 'SearchAction',
                target: siteUrl + '/?q={search_term_string}',
                'query-input': 'required name=search_term_string',
              },
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
