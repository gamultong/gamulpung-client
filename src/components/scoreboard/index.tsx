import { useState, useEffect } from 'react';
import S from './style.module.scss';
import DownArrowSVG from '@/assets/downArrowSvg';
import UpArrowSVG from '@/assets/upArrowSvg';
import CrownSVG from '@/assets/crownsvg';
import { useRankStore } from '@/store/rankingStore';

const MOBILE_BREAKPOINT = 768;

export default function ScoreBoardComponent() {
  const { rankings } = useRankStore();
  const [topToggle, setTopToggle] = useState(true);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) setTopToggle(false);
      else setTopToggle(true);
    };
    onChange(mql);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const toggleTop = () => setTopToggle(!topToggle);

  return (
    <div className={S.scoreboard}>
      <div className={S.toggle} onPointerDown={toggleTop}>
        <span>RANK</span>
        {topToggle ? <DownArrowSVG /> : <UpArrowSVG />}
      </div>
      {topToggle && (
        <div className={S.scoreList}>
          {rankings.map((score, index) => (
            <div key={index} className={S.scoreItem}>
              <span>
                #{score.ranking} {score.ranking === 1 && <CrownSVG />}
              </span>
              <span>{score.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
