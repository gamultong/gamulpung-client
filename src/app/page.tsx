import Link from 'next/link';
import S from './style.module.scss';

export default function Home() {
  return (
    <div className={S.page}>
      <div className={S.welcome}>
        <h2>Welcome to</h2>
        <h1>GAMULPUNG💣</h1>
        <Link href="/play">
          <button>PLAY</button>
        </Link>
      </div>
      <div className={S.rules}>
        <h1>How to Play</h1>
      </div>
    </div>
  );
}
