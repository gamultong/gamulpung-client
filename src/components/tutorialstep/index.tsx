import S from './style.module.scss';
import Image from 'next/image';
import docs from '@/app/video.json';
import { useSearchParams } from 'next/navigation';
import Pageupsvg from '@/assets/pageupsvg';
import Pagedownsvg from '@/assets/pagedownsvg';
import { useState } from 'react';

export default function TutorialStep() {
  const host = process.env.NEXT_PUBLIC_HOST;
  const searchParams = useSearchParams();
  const lang = (searchParams.get('lang') as 'en' | 'ko') || 'ko';
  const [step, setStep] = useState(0);
  const data = docs.data[step];

  const up = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };
  const down = () => {
    if (step < docs.data.length - 1) {
      setStep(step + 1);
    } else {
      setStep(-1);
    }
  };
  return (
    <>
      {step !== -1 && (
        <div className={S.tutorial}>
          <div className={S.button} onClick={up}>
            {step > 0 && <Pageupsvg />}{' '}
          </div>
          <div className={S.step}>
            <Image src={`${host}${data.gif}`} alt={data.gif} width={400} height={225} />
            <div>
              <p>Step {data.id}</p>
              <p>{data.description[lang]}</p>
            </div>
          </div>
          <div className={S.button} onClick={down}>
            {docs.data.length - 1 > step ? <Pagedownsvg /> : <Image src={`${host}/icon.png`} alt="Play" width={88} height={88} />}
          </div>
        </div>
      )}
    </>
  );
}
