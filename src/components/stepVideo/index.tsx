'use client';
import Image from 'next/image';
import S from './style.module.scss';
import { useSearchParams } from 'next/navigation';
import { langType } from '@/types';

export default function StepVideo({ num, text, source: gif }: { num: number; text: langType; source: string }) {
  const lang = useSearchParams().get('lang');
  const host = process.env.NEXT_PUBLIC_HOST;
  return (
    <div className={S.stepVideo}>
      <div>
        <p>Step {num}</p>
        <p>{text[lang !== 'en' ? 'ko' : 'en']}</p>
      </div>
      <Image src={host + gif} alt={gif} width={400} height={225} />
    </div>
  );
}
