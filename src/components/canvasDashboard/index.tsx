import S from './style.module.scss';
import CursorSVG from '@/assets/cursorsvg';
import DownArrowSVG from '@/assets/downArrowSvg';
import PointerSVG from '@/assets/pointervg';
import SearchSVG from '@/assets/searchsvg';
import UpArrowSVG from '@/assets/upArrowSvg';
import useScreenSize from '@/hooks/useScreenSize';
import useClickStore from '@/store/clickStore';
import { useCursorStore } from '@/store/cursorStore';
import { useState } from 'react';

type CanvasDashboardProps = {
  tileSize: number;
  renderRange: number;
  maxTileCount: number;
};

export default function CanvasDashboard({ tileSize, renderRange, maxTileCount }: CanvasDashboardProps) {
  const zoomScale = 1.5;
  const { zoom, zoomDown, zoomUp, originX: cursorOriginX, originY: cursorOriginY } = useCursorStore();
  const { windowWidth: w, windowHeight: h } = useScreenSize();
  const { x: clickX, y: clickY } = useClickStore();

  const checkMaxTileCount = () => (w * renderRange) / (tileSize / zoomScale) + (h * renderRange) / (tileSize / zoomScale) > maxTileCount;
  const [bottomToggle, setBottomToggle] = useState(true);
  const toggleBottom = () => setBottomToggle(!bottomToggle);
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
            <div className={S.coordinates}>
              <p>
                &nbsp;
                <CursorSVG />({cursorOriginX}, {cursorOriginY})
              </p>
              <p>
                <PointerSVG />
                &nbsp;({clickX === Infinity ? '' : clickX}, {clickY === Infinity ? '' : clickY})
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
