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
import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

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
  const { zoom, zoomDown, zoomUp, originPosition: cursorOriginPosition, score, items, setIsBombMode, isBombMode } = useCursorStore();
  const bombCount = items?.bomb ?? 0;

  const rowRange = (windowWidth * renderRange) / (tileSize / zoomScale);
  const colRange = (windowHeight * renderRange) / (tileSize / zoomScale);

  // states
  const [isMobile, setIsMobile] = useState(false);
  const [bottomToggle, setBottomToggle] = useState(true);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
      if (e.matches) setBottomToggle(false);
      else setBottomToggle(true);
    };
    onChange(mql);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // functions
  const checkMaxTileCount = () => rowRange * colRange > maxTileCount;
  const toggleBottom = () => setBottomToggle(!bottomToggle);
  const toggleBombMode = () => setIsBombMode(!isBombMode);
  const lessZoom = () => !checkMaxTileCount() && zoomDown();

  if (isMobile) {
    return (
      <div className={S.dashboard}>
        <div className={S.mobileBar}>
          {/* Compact bar: always visible */}
          <div className={S.mobileCompact}>
            <span className={S.mobileScore}>{score} pts</span>
            <button type="button" className={`${S.mobileBomb} ${isBombMode ? S.bombMode : ''}`} onClick={toggleBombMode}>
              <span>💣</span>
              <span>x{bombCount}</span>
            </button>
            <div className={S.mobileZoom}>
              <button onPointerDown={lessZoom}>-</button>
              <span>{Math.ceil(zoom * 100)}%</span>
              <button onPointerDown={zoomUp}>+</button>
            </div>
            <button className={S.mobileToggle} onPointerDown={toggleBottom}>
              {bottomToggle ? <UpArrowSVG /> : <DownArrowSVG />}
            </button>
          </div>
          {/* Expanded details */}
          {bottomToggle && (
            <div className={S.mobileDetails}>
              <p>
                <CursorSVG />
                ({cursorOriginPosition.x}, {cursorOriginPosition.y})
              </p>
              <p>
                <PointerSVG />
                ({clickX === Infinity ? '' : clickX}, {clickY === Infinity ? '' : clickY})
              </p>
              <p className={S.animation} onClick={() => setAnimation(!useAnimation)}>
                <input type="checkbox" checked={useAnimation} readOnly />
                Animation
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

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
              <button type="button" className={`${S.bomb} ${isBombMode ? S.bombMode : ''}`} onClick={toggleBombMode}>
                <span>💣</span>
                <span>X {bombCount}</span>
              </button>
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
