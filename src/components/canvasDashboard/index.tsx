import S from './style.module.scss';
import CursorSVG from '@/assets/cursorsvg';
import DownArrowSVG from '@/assets/downArrowSvg';
import PointerSVG from '@/assets/pointervg';
import SearchSVG from '@/assets/searchsvg';
import UpArrowSVG from '@/assets/upArrowSvg';
import useScreenSize from '@/hooks/useScreenSize';
import { useClickStore, useAnimationStore } from '@/store/interactionStore';
import { useCursorStore } from '@/store/cursorStore';
import { useTileSize } from '@/store/tileStore';
import { useState } from 'react';

type CanvasDashboardProps = {
  renderRange: number;
  maxTileCount: number;
};

export default function CanvasDashboard({ renderRange, maxTileCount }: CanvasDashboardProps) {
  // constants
  const zoomScale = 1.5;

  // stores
  const tileSize = useTileSize();
  const { x: clickX, y: clickY } = useClickStore();
  const { useAnimation, setAnimation } = useAnimationStore();
  const { windowWidth, windowHeight } = useScreenSize();
  const { zoom, zoomDown, zoomUp, originPosition: cursorOriginPosition, score, items } = useCursorStore();

  const rowRange = (windowWidth * renderRange) / (tileSize / zoomScale);
  const colRange = (windowHeight * renderRange) / (tileSize / zoomScale);

  // states
  const [bottomToggle, setBottomToggle] = useState(true);
  const [isBombMode, setIsBombMode] = useState(false);

  // functions
  const checkMaxTileCount = () => rowRange * colRange > maxTileCount;
  const toggleBottom = () => setBottomToggle(!bottomToggle);
  const toggleBombMode = () => setIsBombMode(!isBombMode);
  const lessZoom = () => !checkMaxTileCount() && zoomDown();

  return (
    <div className={S.dashboard}>
      <div className={S.bottom}>
        <div className={S.toggle} onPointerDown={toggleBottom}>
          {!bottomToggle && <DownArrowSVG />}
          {bottomToggle && <UpArrowSVG />}
        </div>
        {bottomToggle && (
          <>
            <div className={S.score}>{score} pts</div>
            <div className={S.coordinates}>
              <p>
                &nbsp;
                <CursorSVG />({cursorOriginPosition.x}, {cursorOriginPosition.y})
              </p>
              <p>
                <PointerSVG />
                &nbsp;({clickX === Infinity ? '' : clickX}, {clickY === Infinity ? '' : clickY})
              </p>
              <p className={`${S.bomb} ${isBombMode ? S.bombMode : ''}`} onClick={toggleBombMode}>
                💣 X {items.bomb}
              </p>
              <p className={S.animation} onClick={() => setAnimation(!useAnimation)}>
                <input type="checkbox" checked={useAnimation} readOnly />
                Animation
              </p>
            </div>
            <div className={S.zoom}>
              <p>
                <SearchSVG />
                &nbsp;
                {Math.ceil(zoom * 100)}%
              </p>
              <div className={S.buttons}>
                <button onPointerDown={lessZoom}>-</button>
                <button onPointerDown={zoomUp}>+</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
