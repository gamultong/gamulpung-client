import Link from 'next/link';
import S from './style.module.scss';
import StepVideo from '@/components/stepVideo';
import Image from 'next/image';
import video from './video.json';
import MainStatComponent from '@/components/mainStatComponent';
import SiteMapGraph from '@/components/sitemapComponent';

export default function Home() {
  const host = process.env.NEXT_PUBLIC_HOST;
  return (
    <div className={S.page}>
      <div className={S.welcome} style={{ backgroundImage: `url(${host}/main_photo.png)` }}>
        <h2>Welcome to</h2>
        <h1>GAMULPUNG💣</h1>
        <Link href="/play">
          <button>PLAY</button>
        </Link>
      </div>
      <SiteMapGraph />
      <MainStatComponent />
      <div className={S.rules}>
        <h1>How to Play</h1>
        {video?.data.map(step => (
          <StepVideo key={step.id} num={step.id} text={step.description} source={step.gif} />
        ))}
      </div>
      <div className={S.contribute}>
        <div className={S.mainBlock}>
          <h1>If you want to Contribute</h1>
          <Link href="/documents/contribute-guide">
            <button>Contribute</button>
          </Link>
        </div>
        <Image src={host + '/landingTile.svg'} alt="tile" width={400} height={800} />
      </div>
    </div>
  );
}
