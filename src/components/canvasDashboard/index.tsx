import S from './style.module.scss';
import CursorSVG from '@/assets/cursorsvg';
import PointerSVG from '@/assets/pointervg';
import SearchSVG from '@/assets/searchsvg';
import useClickStore from '@/store/clickStore';
import { useCursorStore } from '@/store/cursorStore';

export default function CanvasDashboard() {
  const zoomScale = 1.5;
  const { zoom, setZoom, originX: cursorOriginX, originY: cursorOriginY } = useCursorStore();
  const { x: clickX, y: clickY } = useClickStore();

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
          <button onPointerDown={() => setZoom(zoom / zoomScale > 0.15 ? zoom / zoomScale : zoom)}>-</button>
          <button onPointerDown={() => setZoom(zoom * zoomScale < 1.7 ? zoom * zoomScale : zoom)}>+</button>
        </div>
      </div>
    </div>
  );
}
