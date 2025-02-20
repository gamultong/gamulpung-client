import S from './style.module.scss';
import CursorSVG from '@/assets/cursorsvg';
import PointerSVG from '@/assets/pointervg';
import SearchSVG from '@/assets/searchsvg';
import useScreenSize from '@/hooks/useScreenSize';
import useClickStore from '@/store/clickStore';
import { useCursorStore } from '@/store/cursorStore';

type CanvasDashboardProps = {
  tileSize: number;
  renderRange: number;
  maxTileCount: number;
};

export default function CanvasDashboard({ tileSize, renderRange, maxTileCount }: CanvasDashboardProps) {
  const zoomScale = 1.5;
  const { zoom, setZoom, originX: cursorOriginX, originY: cursorOriginY } = useCursorStore();
  const { windowWidth: w, windowHeight: h } = useScreenSize();
  const { x: clickX, y: clickY } = useClickStore();

  const checkMaxTileCount = () => (w * renderRange) / (tileSize / zoomScale) + (h * renderRange) / (tileSize / zoomScale) > maxTileCount;

  const moreZoom = () => {
    if (zoom * zoomScale <= 1.7) setZoom(zoom * zoomScale);
  };
  const lessZoom = () => {
    if (zoom / zoomScale < 0.15 || checkMaxTileCount()) return;
    setZoom(zoom / zoomScale);
  };

  return (
    <div className={S.dashboard}>
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
          <button onPointerDown={moreZoom}>+</button>
        </div>
      </div>
    </div>
  );
}
