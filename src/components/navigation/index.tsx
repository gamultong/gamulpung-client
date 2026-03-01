'use client';
import Image from 'next/image';
import S from './style.module.scss';
import Link from 'next/link';
import { useState, useCallback } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';

export default function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const lang = searchParams.get('lang') || 'ko';
  const host = process.env.NEXT_PUBLIC_HOST;
  const isPlayPage = pathname === '/play';
  const doc = searchParams.get('doc') !== null ? `&doc=${searchParams.get('doc')}` : '';

  const toggleMenu = useCallback(() => setIsMenuOpen(prev => !prev), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  return (
    <nav
      className={`${S.nav} ${isPlayPage ? S.playPage : ''}`}
      onMouseEnter={() => setIsMenuOpen(true)}
      onMouseLeave={() => setIsMenuOpen(false)}
    >
      <div className={S.navigation}>
        <div className={`${S.side} ${S.gap}`}>
          <Link href={`/?lang=${lang}`}>
            <Image src={`${host}/icon.png`} alt="Gamulpung" width={50} height={50} />
          </Link>
          <span className={S.desktopOnly}>Documents</span>
          <span className={S.desktopOnly}>Language</span>
          <Link href="https://github.com/gamultong" prefetch={false} className={S.desktopOnly}>
            <span>GitHub</span>
          </Link>
        </div>
        <div className={S.side}>
          <Link href={`/documents/contribute-guide?lang=${lang}`} className={S.desktopOnly}>
            <Image src={`${host}/contributeButton.svg`} alt="Contribute" width={158} height={55} />
          </Link>
          <Link href="/play" className={S.desktopOnly}>
            <Image src={`${host}/playbutton.svg`} alt="Play" width={88} height={55} />
          </Link>
          <button className={S.hamburger} onClick={toggleMenu} aria-label="Menu">
            <span className={`${S.hamburgerLine} ${isMenuOpen ? S.open : ''}`} />
            <span className={`${S.hamburgerLine} ${isMenuOpen ? S.open : ''}`} />
            <span className={`${S.hamburgerLine} ${isMenuOpen ? S.open : ''}`} />
          </button>
        </div>
      </div>
      {isMenuOpen && (
        <div className={S.menu} onClick={closeMenu}>
          <div>
            <Link href={`/?lang=${lang}`} className={S.mobileOnly}>
              <p>Home</p>
            </Link>
            <Link href={`/documents/how-to-play?lang=${lang}`}>
              <p>How to play</p>
            </Link>
            <Link href={`/documents/contribute-guide?lang=${lang}`}>
              <p>Contribute</p>
            </Link>
            <Link href={`/documents/release-notes?lang=${lang}`}>
              <p>Releases</p>
            </Link>
            <Link href={`/documents/blog?lang=${lang}`}>
              <p>Blogs</p>
            </Link>
            <Link href="/play" className={S.mobileOnly}>
              <p>Play</p>
            </Link>
            <Link href="https://github.com/gamultong" prefetch={false} className={S.mobileOnly}>
              <p>GitHub</p>
            </Link>
          </div>
          <div>
            <Link href={`?lang=ko${doc}`}>
              <p>한국어</p>
            </Link>
            <Link href={`?lang=en${doc}`}>
              <p>English</p>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
