import { useState } from 'react';
import S from './style.module.scss';
import DownArrowSVG from '@/assets/downArrowSvg';
import UpArrowSVG from '@/assets/upArrowSvg';
import CrownSVG from '@/assets/crownsvg';
import { useRankStore } from '@/store/rankingStore';

export default function ScoreBoardComponent() {
  const { rankings } = useRankStore();
  const [topToggle, setTopToggle] = useState(true);
  const toggleTop = () => setTopToggle(!topToggle);

  return (
    <div className={S.scoreboard}>
      <div className={S.toggle} onPointerDown={toggleTop}>
        <span>RANKING</span>
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
