import Link from 'next/link';
import S from './style.module.scss';

export default function Home() {
  return (
    <div className={S.page}>
      <div className={S.welcome}>
        <h2>Welcome to</h2>
        <h1>Gamulpung</h1>
        <Link href="/play">
          <button>Play</button>
        </Link>
      </div>
    </div>
  );
}