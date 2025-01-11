'use client';
import S from './style.module.scss';
import { useSearchParams } from 'next/navigation';
import Stats from '@/app/beta1stats.json';
import StatBlock from '../statblock';

export default function MainStatComponent() {
  const searchParams = useSearchParams();
  const lang = (searchParams.get('lang') || 'ko') as 'ko' | 'en';
  const allStats = Stats.stats;
  return (
    <div className={S.statsComponent}>
      <h2>{Stats.title[lang]}</h2>
      <div className={S.statsContainer}>
        <div className={S.stats}>
          {allStats.map((stat, index) => (
            <StatBlock key={stat.key} text={stat.label[lang]} value={stat.value} isEven={index % 2 === 1} />
          ))}
        </div>
      </div>
    </div>
  );
}
