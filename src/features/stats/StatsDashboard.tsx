'use client';

import type { PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import S from './StatsDashboard.module.scss';

type Summary = {
  total_events: number;
  joins: number;
  quits: number;
  current_connections: number;
  active_cursors: number;
  created_cursors: number;
  moves: number;
  opened_tiles: number;
  flags: number;
  explosions: number;
  debug_logs: number;
};

type EventCount = {
  event_type: string;
  count: number;
};

type ActivityPoint = {
  bucket_start: string;
  join: number;
  quit: number;
  move: number;
  create_cursor: number;
  open_tile: number;
  set_flag: number;
  explosion: number;
};

type ActivityEventKey = keyof Omit<ActivityPoint, 'bucket_start'>;

type ActivitySegment = {
  key: ActivityEventKey;
  label: string;
  value: number;
  color: string;
};

type ActivityTimelinePoint = ActivityPoint & {
  key: string;
  total: number;
  label: string;
  showLabel: boolean;
  segments: ActivitySegment[];
};

type ActivityTimeline = {
  points: ActivityTimelinePoint[];
  maxTotal: number;
  tickValues: number[];
};

type HourlyConnection = {
  hour_start: string;
  joins: number;
  quits: number;
  peak_connections: number;
  end_connections: number;
};

type PlayerStat = {
  actor_id: string;
  event_count: number;
  move_count: number;
  join_count: number;
  quit_count: number;
  last_event_at: string | null;
  last_tile_id: string | null;
};

type ColorStat = {
  color: string;
  count: number;
};

type TileStat = {
  tile_id: string;
  x: number | null;
  y: number | null;
  count: number;
  last_event_type: string | null;
  last_event_at: string | null;
};

type TilePointStat = TileStat & {
  x: number;
  y: number;
};

type TileHeatmapCell = TilePointStat & {
  left: number;
  top: number;
  intensity: number;
  tooltip: string;
};

type TileHeatmapHover = {
  tile: TileHeatmapCell;
  x: number;
  y: number;
};

type TileHeatmap = {
  cells: TileHeatmapCell[];
  width: number;
  height: number;
  viewBox: string;
  maxCount: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
};

type StatEvent = {
  id: number;
  added_at: string;
  event_type: string;
  actor_id: string | null;
  tile_id: string | null;
  value: number | null;
  payload: Record<string, unknown>;
};

type AppLog = {
  id: number;
  added_at: string;
  level: string;
  module: string | null;
  function_name: string | null;
  message: string;
};

type ConnectionGraphPoint = {
  hourStart: string;
  x: number;
  hitX: number;
  hitWidth: number;
  peak: number;
  end: number;
  peakY: number;
  endY: number;
  joins: number;
  quits: number;
};

type ActiveCursor = {
  connection_id: string;
  cursor_id: string;
  connected_at: string | null;
  session_seconds: number;
  color: number | null;
  tile_id: string | null;
  x: number | null;
  y: number | null;
  score: number;
  is_alive: boolean;
  active_at: string | null;
  last_event_at?: string | null;
  is_connected?: boolean;
  window: {
    width: number | null;
    height: number | null;
  };
};

type Runtime = {
  current_connections: number;
  active_cursors: number;
  process_uptime_seconds: number;
  started_at: string | null;
};

type Stored = {
  total_events: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  observed_seconds: number;
};

type Uptime = {
  started_at: string | null;
  uptime_seconds: number;
};

type DashboardData = {
  server_time: string;
  range: string;
  bucket: string;
  summary: Summary;
  runtime: Runtime;
  stored: Stored;
  uptime: Uptime;
  event_counts: EventCount[];
  activity: ActivityPoint[];
  hourly_connections: HourlyConnection[];
  players: PlayerStat[];
  colors: ColorStat[];
  tiles: TileStat[];
  tile_heatmap: TileStat[];
  active_cursors: ActiveCursor[];
  last_known_cursors: ActiveCursor[];
  recent_events: StatEvent[];
  recent_logs: AppLog[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const DASHBOARD_RANGE = 'all';
const POLL_MS = 3000;
const EMPTY_SUMMARY: Summary = {
  total_events: 0,
  joins: 0,
  quits: 0,
  current_connections: 0,
  active_cursors: 0,
  created_cursors: 0,
  moves: 0,
  opened_tiles: 0,
  flags: 0,
  explosions: 0,
  debug_logs: 0,
};
const EMPTY_UPTIME: Uptime = {
  started_at: null,
  uptime_seconds: 0,
};
const EMPTY_RUNTIME: Runtime = {
  current_connections: 0,
  active_cursors: 0,
  process_uptime_seconds: 0,
  started_at: null,
};
const EMPTY_STORED: Stored = {
  total_events: 0,
  first_seen_at: null,
  last_seen_at: null,
  observed_seconds: 0,
};

const eventLabels: Record<string, string> = {
  JOIN: 'Join',
  QUIT: 'Quit',
  CREATE_CURSOR: 'Create',
  MOVE: 'Move',
  OPEN_TILE: 'Open',
  SET_FLAG: 'Flag',
  EXPLOSION: 'Blast',
};

const activityEvents: Array<{
  key: ActivityEventKey;
  eventType: string;
  color: string;
}> = [
  { key: 'join', eventType: 'JOIN', color: '#277853' },
  { key: 'quit', eventType: 'QUIT', color: '#a33f48' },
  { key: 'move', eventType: 'MOVE', color: '#a86a18' },
  { key: 'create_cursor', eventType: 'CREATE_CURSOR', color: '#2368a2' },
  { key: 'open_tile', eventType: 'OPEN_TILE', color: '#59615c' },
  { key: 'set_flag', eventType: 'SET_FLAG', color: '#b8951f' },
  { key: 'explosion', eventType: 'EXPLOSION', color: '#1f2522' },
];

const colorLabels: Record<string, string> = {
  '1': 'Red',
  '2': 'Blue',
  '3': 'Yellow',
  '4': 'Purple',
};

const CONNECTION_GRAPH = {
  width: 960,
  height: 260,
  top: 18,
  right: 18,
  bottom: 34,
  left: 42,
  bucketWidth: 64,
};

const TILE_HEATMAP = {
  cell: 26,
  gap: 3,
  padding: 18,
};

export default function StatsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hoveredConnectionHour, setHoveredConnectionHour] = useState<string | null>(null);
  const [hoveredActivityKey, setHoveredActivityKey] = useState<string | null>(null);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);
  const [tileZoom, setTileZoom] = useState(1);
  const [isTilePanning, setIsTilePanning] = useState(false);
  const [hoveredTile, setHoveredTile] = useState<TileHeatmapHover | null>(null);
  const connectionScrollRef = useRef<HTMLDivElement | null>(null);
  const connectionUserScrolledRef = useRef(false);
  const tileHeatmapFrameRef = useRef<HTMLDivElement | null>(null);
  const tileHeatmapViewportRef = useRef<HTMLDivElement | null>(null);
  const tilePanRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setIsRefreshing(true);
        const response = await fetch(`${API_URL}/stats/dashboard?range=${DASHBOARD_RANGE}&bucket=1m&limit=40`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`stats api ${response.status}`);
        }
        const payload = normalizeDashboardData(await response.json());
        if (mounted) {
          setData(payload);
          setError(null);
        }
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e.message : 'stats api failed');
        }
      } finally {
        if (mounted) {
          setIsRefreshing(false);
        }
      }
    };

    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!copiedUserId) {
      return;
    }

    const timer = window.setTimeout(() => setCopiedUserId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedUserId]);

  const peakEventCount = useMemo(() => {
    if (!data) {
      return 1;
    }
    return Math.max(1, ...data.event_counts.map(item => item.count));
  }, [data]);

  const connectionGraph = useMemo(() => {
    if (!data) {
      return buildConnectionGraph([]);
    }
    return buildConnectionGraph(data.hourly_connections);
  }, [data]);
  const hoveredConnection = useMemo<ConnectionGraphPoint | null>(() => (
    connectionGraph.points.find(point => point.hourStart === hoveredConnectionHour) ?? null
  ), [connectionGraph.points, hoveredConnectionHour]);

  const activityTimeline = useMemo(() => buildActivityTimeline(data?.activity ?? []), [data?.activity]);
  const selectedActivity = useMemo(() => (
    activityTimeline.points.find(point => point.key === hoveredActivityKey)
    ?? [...activityTimeline.points].reverse().find(point => point.total > 0)
    ?? activityTimeline.points.at(-1)
    ?? null
  ), [activityTimeline.points, hoveredActivityKey]);

  const activeColorCounts = useMemo(() => {
    if (!data) {
      return [];
    }

    const counts = data.active_cursors.reduce<Record<string, number>>((acc, cursor) => {
      if (cursor.color === null) {
        return acc;
      }
      const color = String(cursor.color);
      acc[color] = (acc[color] ?? 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([color, count]) => ({ color, count }))
      .sort((a, b) => b.count - a.count || Number(a.color) - Number(b.color));
  }, [data]);

  const tileHeatmap = useMemo(() => buildTileHeatmap(data?.tile_heatmap ?? []), [data?.tile_heatmap]);
  const summary = data?.summary;

  useEffect(() => {
    const scroll = connectionScrollRef.current;
    if (!scroll || connectionUserScrolledRef.current) {
      return;
    }

    scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth;
  }, [connectionGraph.width]);

  const scrollConnectionToLatest = () => {
    const scroll = connectionScrollRef.current;
    if (!scroll) {
      return;
    }

    scroll.scrollTo({
      left: scroll.scrollWidth - scroll.clientWidth,
      behavior: 'smooth',
    });
  };

  const handleTileWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (tileHeatmap.cells.length === 0 || (!event.ctrlKey && !event.metaKey)) {
      return;
    }

    event.preventDefault();
    const frame = tileHeatmapFrameRef.current;
    const rect = frame?.getBoundingClientRect();
    const cursorX = rect ? event.clientX - rect.left : 0;
    const cursorY = rect ? event.clientY - rect.top : 0;
    const offsetX = frame ? frame.scrollLeft + cursorX : 0;
    const offsetY = frame ? frame.scrollTop + cursorY : 0;
    const delta = event.deltaY > 0 ? -0.12 : 0.12;

    setTileZoom(currentZoom => {
      const nextZoom = clamp(Number((currentZoom + delta).toFixed(2)), 0.75, 3);
      if (nextZoom === currentZoom || !frame) {
        return nextZoom;
      }

      const ratio = nextZoom / currentZoom;
      window.requestAnimationFrame(() => {
        frame.scrollLeft = offsetX * ratio - cursorX;
        frame.scrollTop = offsetY * ratio - cursorY;
      });
      return nextZoom;
    });
  };

  const handleTilePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const frame = event.currentTarget;
    tilePanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: frame.scrollLeft,
      scrollTop: frame.scrollTop,
    };
    frame.setPointerCapture(event.pointerId);
    setHoveredTile(null);
    setIsTilePanning(true);
  };

  const handleTilePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isTilePanning || tilePanRef.current.pointerId !== event.pointerId) {
      return;
    }

    const frame = event.currentTarget;
    frame.scrollLeft = tilePanRef.current.scrollLeft - (event.clientX - tilePanRef.current.startX);
    frame.scrollTop = tilePanRef.current.scrollTop - (event.clientY - tilePanRef.current.startY);
  };

  const stopTilePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tilePanRef.current.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      tilePanRef.current.pointerId = -1;
      setIsTilePanning(false);
    }
  };

  const moveTileTooltip = (event: ReactPointerEvent<SVGGElement>, tile: TileHeatmapCell) => {
    if (isTilePanning) {
      return;
    }

    const rect = tileHeatmapViewportRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    setHoveredTile({
      tile,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  };

  const copyUserId = async (userId: string) => {
    await copyText(userId);
    setCopiedUserId(userId);
  };

  return (
    <main className={S.page}>
      <section className={S.header}>
        <div>
          <p className={S.kicker}>Gamulpung telemetry</p>
          <h1>Stats Dashboard</h1>
        </div>
        <div className={S.headerMeta}>
          <span className={isRefreshing ? S.livePulse : S.liveDot} />
          <span>{data ? formatTime(data.server_time) : 'connecting'}</span>
          <span>{rangeLabel(data?.range ?? DASHBOARD_RANGE)}</span>
        </div>
      </section>

      {error && <div className={S.errorBanner}>{error}</div>}

      <section className={S.summaryGrid}>
        <SummaryCard
          label="Runtime"
          value={data?.runtime.current_connections ?? 0}
          detail={`${data?.runtime.active_cursors ?? 0} cursors / ${formatDuration(data?.runtime.process_uptime_seconds ?? 0)} process`}
          tone="green"
        />
        <SummaryCard label="All Events" value={summary?.total_events ?? 0} detail="observed rows" tone="ink" />
        <SummaryCard label="Stored" value={data?.stored.total_events ?? 0} detail={`${formatDuration(data?.stored.observed_seconds ?? 0)} observed`} tone="gray" />
        <SummaryCard label="Join" value={summary?.joins ?? 0} detail={`${summary?.quits ?? 0} quits`} tone="blue" />
        <SummaryCard label="Move" value={summary?.moves ?? 0} detail={`${summary?.created_cursors ?? 0} cursors`} tone="amber" />
        <SummaryCard label="Open" value={summary?.opened_tiles ?? 0} detail={`${summary?.flags ?? 0} flags`} tone="rose" />
      </section>

      <section className={S.fullWidth}>
        <Panel title="Cursor State" meta={`${data?.active_cursors.length ?? 0} live / ${data?.last_known_cursors.length ?? 0} last known`}>
          <div className={S.liveColorStrip}>
            {activeColorCounts.map(item => (
              <div className={S.liveColorItem} key={item.color}>
                <span className={S.colorSwatch} data-color={item.color} />
                <strong>{colorLabel(item.color)}</strong>
                <em>{item.count}</em>
              </div>
            ))}
            {data && activeColorCounts.length === 0 && (
              <div className={S.emptyState}>No active color data</div>
            )}
          </div>
          <div className={S.cursorSectionTitle}>
            <strong>Current Runtime</strong>
            <span>process memory</span>
          </div>
          <div className={S.activeCursorGrid}>
            {(data?.active_cursors ?? []).map(cursor => (
              <CursorCard
                cursor={cursor}
                key={cursor.cursor_id}
                status="runtime"
                copiedUserId={copiedUserId}
                onCopyUserId={copyUserId}
              />
            ))}
            {data && data.active_cursors.length === 0 && (
              <div className={S.emptyState}>No connected cursors</div>
            )}
          </div>
          <div className={S.cursorSectionTitle}>
            <strong>Last Known</strong>
            <span>stored events</span>
          </div>
          <div className={S.activeCursorGrid}>
            {(data?.last_known_cursors ?? []).map(cursor => (
              <CursorCard
                cursor={cursor}
                key={cursor.cursor_id}
                status="stored"
                copiedUserId={copiedUserId}
                onCopyUserId={copyUserId}
              />
            ))}
            {data && data.last_known_cursors.length === 0 && (
              <div className={S.emptyState}>No stored open sessions</div>
            )}
          </div>
        </Panel>
      </section>

      <section className={S.fullWidth}>
        <Panel title="Hourly Connections" meta={`${rangeLabel(data?.range ?? DASHBOARD_RANGE)} connection state`}>
          <div className={S.connectionChart} aria-label="Hourly connections">
            <div className={S.connectionToolbar}>
              <span>{connectionGraph.points.length} buckets</span>
              <button type="button" onClick={scrollConnectionToLatest}>Latest</button>
            </div>
            <div
              className={S.connectionScroll}
              ref={connectionScrollRef}
              onScroll={() => {
                connectionUserScrolledRef.current = true;
              }}
            >
              <div
                className={S.connectionTimeline}
                style={{ width: connectionGraph.width }}
              >
                <svg
                  className={S.connectionVector}
                  viewBox={`0 0 ${connectionGraph.width} ${CONNECTION_GRAPH.height}`}
                  role="img"
                  aria-label="Hourly connection vector graph"
                >
                  <line
                    x1={CONNECTION_GRAPH.left}
                    y1={connectionGraph.zeroY}
                    x2={connectionGraph.width - CONNECTION_GRAPH.right}
                    y2={connectionGraph.zeroY}
                    className={S.connectionAxis}
                  />
                  {connectionGraph.gridLines.map(line => (
                    <line
                      key={line.value}
                      x1={CONNECTION_GRAPH.left}
                      y1={line.y}
                      x2={connectionGraph.width - CONNECTION_GRAPH.right}
                      y2={line.y}
                      className={S.connectionGridLine}
                    />
                  ))}
                  {connectionGraph.areaPoints && (
                    <polygon points={connectionGraph.areaPoints} className={S.connectionArea} />
                  )}
                  {connectionGraph.peakPoints && (
                    <polyline points={connectionGraph.peakPoints} className={S.connectionPeakLine} />
                  )}
                  {connectionGraph.endPoints && (
                    <polyline points={connectionGraph.endPoints} className={S.connectionEndLine} />
                  )}
                  {hoveredConnection && (
                    <>
                      <line
                        x1={hoveredConnection.x}
                        y1={CONNECTION_GRAPH.top}
                        x2={hoveredConnection.x}
                        y2={connectionGraph.zeroY}
                        className={S.connectionFocusLine}
                      />
                      <g
                        className={S.connectionTooltip}
                        transform={`translate(${tooltipX(hoveredConnection.x, connectionGraph.width)}, ${CONNECTION_GRAPH.top + 10})`}
                      >
                        <rect width="132" height="82" rx="4" />
                        <text x="10" y="20">{formatHour(hoveredConnection.hourStart)}</text>
                        <text x="10" y="40">Peak {hoveredConnection.peak}</text>
                        <text x="10" y="58">End {hoveredConnection.end}</text>
                        <text x="10" y="76">+{hoveredConnection.joins} / -{hoveredConnection.quits}</text>
                      </g>
                    </>
                  )}
                  {connectionGraph.points.map(point => (
                    <g
                      key={point.hourStart}
                      tabIndex={0}
                      role="button"
                      aria-label={`${formatHour(point.hourStart)}, peak ${point.peak}, end ${point.end}, join ${point.joins}, quit ${point.quits}`}
                      onBlur={() => setHoveredConnectionHour(null)}
                      onFocus={() => setHoveredConnectionHour(point.hourStart)}
                      onMouseEnter={() => setHoveredConnectionHour(point.hourStart)}
                      onMouseLeave={() => setHoveredConnectionHour(null)}
                    >
                      <title>
                        {`${formatHour(point.hourStart)}\nPeak ${point.peak}\nEnd ${point.end}\nJoin ${point.joins}\nQuit ${point.quits}`}
                      </title>
                      <rect
                        x={point.hitX}
                        y={CONNECTION_GRAPH.top}
                        width={point.hitWidth}
                        height={connectionGraph.zeroY - CONNECTION_GRAPH.top}
                        className={S.connectionHitArea}
                      />
                      <circle cx={point.x} cy={point.peakY} r="4.5" className={S.connectionPeakPoint} />
                      <circle cx={point.x} cy={point.endY} r="3.5" className={S.connectionEndPoint} />
                      {point.joins > 0 && (
                        <circle cx={point.x} cy={CONNECTION_GRAPH.top + 5} r="3.5" className={S.connectionJoinPoint} />
                      )}
                      {point.quits > 0 && (
                        <circle cx={point.x} cy={CONNECTION_GRAPH.top + 16} r="3.5" className={S.connectionQuitPoint} />
                      )}
                    </g>
                  ))}
                  <text x={CONNECTION_GRAPH.left} y={CONNECTION_GRAPH.top + 4} className={S.connectionYAxis}>
                    {connectionGraph.maxConnections}
                  </text>
                  <text x={CONNECTION_GRAPH.left} y={connectionGraph.zeroY - 4} className={S.connectionYAxis}>
                    0
                  </text>
                </svg>
                <div
                  className={S.connectionLabels}
                  style={{
                    paddingLeft: CONNECTION_GRAPH.left,
                    paddingRight: CONNECTION_GRAPH.right,
                    gridTemplateColumns: `repeat(${Math.max(1, connectionGraph.points.length)}, ${CONNECTION_GRAPH.bucketWidth}px)`,
                  }}
                >
                  {connectionGraph.points.map(point => (
                    <div className={S.connectionLabel} key={point.hourStart}>
                      <strong>{point.peak}</strong>
                      <em>{formatHour(point.hourStart)}</em>
                      <small>
                        +{point.joins} / -{point.quits}
                      </small>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className={S.legend}>
            <span><i className={S.legendPeak} />Peak connections</span>
            <span><i className={S.legendEnd} />End connections</span>
            <span><i className={S.legendJoin} />Joins</span>
            <span><i className={S.legendQuit} />Quits</span>
          </div>
        </Panel>
      </section>

      <section className={S.twoColumn}>
        <Panel title="Activity Timeline" meta={formatBucketMeta(data?.bucket ?? '1m')}>
          <div className={S.activityTimeline}>
            <div className={S.activityAxis} aria-hidden="true">
              {activityTimeline.tickValues.map(value => (
                <span key={value}>{value}</span>
              ))}
            </div>
            <div className={S.activityPlot} aria-label="Activity timeline">
              {activityTimeline.tickValues.map(value => (
                <i
                  key={value}
                  className={S.activityGridLine}
                  style={{ bottom: `${(value / activityTimeline.maxTotal) * 100}%` }}
                />
              ))}
              {activityTimeline.points.map(point => (
                <button
                  className={S.activityBucket}
                  key={point.key}
                  type="button"
                  aria-label={activityAriaLabel(point)}
                  onBlur={() => setHoveredActivityKey(null)}
                  onFocus={() => setHoveredActivityKey(point.key)}
                  onMouseEnter={() => setHoveredActivityKey(point.key)}
                  onMouseLeave={() => setHoveredActivityKey(null)}
                >
                  <span
                    className={S.activityStack}
                    style={{ height: `${Math.max(4, (point.total / activityTimeline.maxTotal) * 100)}%` }}
                  >
                    {point.segments.map(segment => (
                      <i
                        key={segment.key}
                        style={{
                          height: `${(segment.value / point.total) * 100}%`,
                          background: segment.color,
                        }}
                      />
                    ))}
                  </span>
                  {point.showLabel && <em>{point.label}</em>}
                </button>
              ))}
            </div>
            <aside className={S.activityDetail}>
              {selectedActivity ? (
                <>
                  <span>{selectedActivity.label}</span>
                  <strong>{selectedActivity.total}</strong>
                  <em>events</em>
                  <dl>
                    {selectedActivity.segments.length > 0 ? selectedActivity.segments.map(segment => (
                      <div key={segment.key}>
                        <dt><i style={{ background: segment.color }} />{segment.label}</dt>
                        <dd>{segment.value}</dd>
                      </div>
                    )) : (
                      <div>
                        <dt>No events</dt>
                        <dd>0</dd>
                      </div>
                    )}
                  </dl>
                </>
              ) : (
                <span>No activity</span>
              )}
            </aside>
          </div>
          <div className={S.activityLegend}>
            {activityEvents.slice(0, 5).map(item => (
              <span key={item.key}>
                <i style={{ background: item.color }} />
                {eventLabels[item.eventType]}
              </span>
            ))}
            {activityEvents.slice(5).map(item => (
              <span key={item.key}>
                <i style={{ background: item.color }} />
                {eventLabels[item.eventType]}
              </span>
            ))}
          </div>
        </Panel>

        <Panel title="Event Breakdown" meta={`${data?.event_counts.length ?? 0} types`}>
          <div className={S.scrollArea}>
            <div className={S.breakdown}>
            {(data?.event_counts ?? []).map(item => (
              <div className={S.breakdownRow} key={item.event_type}>
                <span>{eventLabels[item.event_type] ?? item.event_type}</span>
                <div>
                  <i style={{ width: `${(item.count / peakEventCount) * 100}%` }} />
                </div>
                <strong>{item.count}</strong>
              </div>
            ))}
            </div>
          </div>
        </Panel>
      </section>

      <section className={S.twoColumn}>
        <Panel title="Players" meta={`${data?.players.length ?? 0} top actors`}>
          <div className={S.scrollArea}>
            <table className={`${S.table} ${S.playerTable}`}>
              <thead>
                <tr>
                  <th>Actor</th>
                  <th>Events</th>
                  <th>Moves</th>
                  <th>Last Tile</th>
                </tr>
              </thead>
              <tbody>
                {(data?.players ?? []).map(player => (
                  <tr key={player.actor_id}>
                    <td>
                      <CopyableUserId
                        value={player.actor_id}
                        copiedUserId={copiedUserId}
                        onCopy={copyUserId}
                      />
                    </td>
                    <td>{player.event_count}</td>
                    <td>{player.move_count}</td>
                    <td>{player.last_tile_id ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && data.players.length === 0 && (
              <div className={S.emptyState}>No player activity</div>
            )}
          </div>
        </Panel>

        <Panel title="Cursor Colors" meta="create events">
          <div className={S.scrollArea}>
            <div className={S.colorGrid}>
              {(data?.colors ?? []).map(item => (
                <div className={S.colorItem} key={item.color}>
                  <span className={S.colorSwatch} data-color={item.color} />
                  <strong>{colorLabel(item.color)}</strong>
                  <em>{item.count}</em>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </section>

      <section className={S.twoColumn}>
        <Panel title="Move Heatmap" meta={`${tileHeatmap.cells.length} moved tiles`}>
          <div className={S.tileHeatmapHint}>
            <span>Drag to move</span>
            <span>Pinch / Ctrl+scroll to zoom</span>
            <span>{Math.round(tileZoom * 100)}%</span>
          </div>
          <div className={S.tileHeatmapViewport} ref={tileHeatmapViewportRef}>
            <div
              ref={tileHeatmapFrameRef}
              className={`${S.tileHeatmapFrame} ${isTilePanning ? S.tileHeatmapFramePanning : ''}`}
              onPointerCancel={stopTilePan}
              onPointerDown={handleTilePointerDown}
              onPointerLeave={() => setHoveredTile(null)}
              onPointerMove={handleTilePointerMove}
              onPointerUp={stopTilePan}
              onWheel={handleTileWheel}
            >
              {tileHeatmap.cells.length > 0 ? (
                <svg
                  className={S.tileHeatmap}
                  viewBox={tileHeatmap.viewBox}
                  role="img"
                  aria-label="Move heatmap"
                  style={{
                    width: tileHeatmap.width * tileZoom,
                    height: tileHeatmap.height * tileZoom,
                  }}
                >
                  {tileHeatmap.cells.map(tile => (
                    <g
                      key={tile.tile_id}
                      className={S.tileHeatmapNode}
                      tabIndex={0}
                      aria-label={tile.tooltip.replaceAll('\n', ', ')}
                      onBlur={() => setHoveredTile(null)}
                      onFocus={() => setHoveredTile({
                        tile,
                        x: tile.left * tileZoom,
                        y: tile.top * tileZoom,
                      })}
                      onPointerLeave={() => setHoveredTile(null)}
                      onPointerMove={event => moveTileTooltip(event, tile)}
                    >
                      <rect
                        x={tile.left}
                        y={tile.top}
                        width={TILE_HEATMAP.cell}
                        height={TILE_HEATMAP.cell}
                        rx="2"
                        fill={tileHeatColor(tile.intensity)}
                        className={S.tileHeatmapCell}
                      />
                      {tile.count > 1 && (
                        <text
                          x={tile.left + TILE_HEATMAP.cell / 2}
                          y={tile.top + TILE_HEATMAP.cell / 2 + 4}
                          textAnchor="middle"
                          className={S.tileHeatmapCount}
                        >
                          {tile.count}
                        </text>
                      )}
                    </g>
                  ))}
                </svg>
              ) : (
                <div className={S.emptyState}>No tile activity</div>
              )}
            </div>
            {hoveredTile && !isTilePanning && (
              <div
                className={S.tileHeatmapTooltip}
                style={{
                  left: hoveredTile.x,
                  top: hoveredTile.y,
                }}
              >
                <strong>{hoveredTile.tile.tile_id}</strong>
                <span>Count {hoveredTile.tile.count}</span>
                <span>Last {eventLabels[hoveredTile.tile.last_event_type ?? ''] ?? hoveredTile.tile.last_event_type ?? '-'}</span>
                <span>Point {hoveredTile.tile.x}, {hoveredTile.tile.y}</span>
              </div>
            )}
          </div>
          <div className={S.tileHeatmapMeta}>
            <span>X {tileHeatmap.bounds.minX}..{tileHeatmap.bounds.maxX}</span>
            <span>Y {tileHeatmap.bounds.minY}..{tileHeatmap.bounds.maxY}</span>
            <span>Peak {tileHeatmap.maxCount}</span>
          </div>
        </Panel>

        <Panel title="Recent Events" meta="stat_event">
          <div className={S.scrollArea}>
            <table className={S.table}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Actor</th>
                  <th>Tile</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recent_events ?? []).map(event => (
                  <tr key={event.id}>
                    <td>{formatTime(event.added_at)}</td>
                    <td>{eventLabels[event.event_type] ?? event.event_type}</td>
                    <td>
                      {event.actor_id ? (
                        <CopyableUserId
                          value={event.actor_id}
                          copiedUserId={copiedUserId}
                          onCopy={copyUserId}
                        />
                      ) : '-'}
                    </td>
                    <td>{event.tile_id ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: 'green' | 'ink' | 'blue' | 'amber' | 'rose' | 'gray';
}) {
  return (
    <article className={`${S.summaryCard} ${S[tone]}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
      <em>{detail}</em>
    </article>
  );
}

function CopyableUserId({
  value,
  copiedUserId,
  onCopy,
}: {
  value: string;
  copiedUserId: string | null;
  onCopy: (value: string) => Promise<void>;
}) {
  return (
    <span className={S.copyableUserIdWrap}>
      <button
        className={S.copyableUserId}
        type="button"
        title={`Copy ${value}`}
        aria-label={`Copy user id ${value}`}
        onClick={() => void onCopy(value)}
      >
        {shortId(value)}
      </button>
      {copiedUserId === value && (
        <span className={S.copyableUserIdCopied}>Copied</span>
      )}
    </span>
  );
}

function CursorCard({
  cursor,
  status,
  copiedUserId,
  onCopyUserId,
}: {
  cursor: ActiveCursor;
  status: 'runtime' | 'stored';
  copiedUserId: string | null;
  onCopyUserId: (value: string) => Promise<void>;
}) {
  return (
    <article className={S.activeCursor}>
      <div className={S.cursorLead}>
        <span className={S.colorSwatch} data-color={cursor.color === null ? undefined : String(cursor.color)} />
        <div>
          <strong>
            <CopyableUserId
              value={cursor.cursor_id}
              copiedUserId={copiedUserId}
              onCopy={onCopyUserId}
            />
          </strong>
          <em>
            {colorLabel(cursor.color)} / {status === 'runtime' ? (cursor.is_alive ? 'alive' : 'reviving') : 'last known'}
          </em>
        </div>
      </div>
      <dl>
        <div>
          <dt>Color</dt>
          <dd>{colorLabel(cursor.color)}</dd>
        </div>
        <div>
          <dt>Tile</dt>
          <dd>{cursor.tile_id ?? '-'}</dd>
        </div>
        <div>
          <dt>Point</dt>
          <dd>{pointLabel(cursor)}</dd>
        </div>
        <div>
          <dt>Score</dt>
          <dd>{cursor.score.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Connected</dt>
          <dd>{formatTime(cursor.connected_at)}</dd>
        </div>
        <div>
          <dt>{status === 'runtime' ? 'Session' : 'Observed'}</dt>
          <dd>{formatDuration(cursor.session_seconds)}</dd>
        </div>
      </dl>
    </article>
  );
}

function Panel({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <section className={S.panel}>
      <header>
        <h2>{title}</h2>
        <span>{meta}</span>
      </header>
      {children}
    </section>
  );
}

function buildActivityTimeline(activity: ActivityPoint[]): ActivityTimeline {
  const points = activity.slice(-36);
  const maxTotal = Math.max(1, ...points.map(activityTotal));
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  return {
    points: points.map((point, index) => ({
      ...point,
      key: point.bucket_start,
      total: activityTotal(point),
      label: formatBucketLabel(point.bucket_start),
      showLabel: index === 0 || index === points.length - 1 || index % labelStep === 0,
      segments: activityEvents
        .map(item => ({
          key: item.key,
          label: eventLabels[item.eventType],
          value: point[item.key],
          color: item.color,
        }))
        .filter(segment => segment.value > 0),
    })),
    maxTotal,
    tickValues: [maxTotal, Math.ceil(maxTotal / 2), 0].filter((value, index, values) => (
      index === values.findIndex(item => item === value)
    )),
  };
}

function activityAriaLabel(point: ActivityTimelinePoint) {
  const details = point.segments.length > 0
    ? point.segments.map(segment => `${segment.label} ${segment.value}`).join(', ')
    : 'No events';
  return `${point.label}, total ${point.total}, ${details}`;
}

function buildTileHeatmap(tiles: TileStat[]): TileHeatmap {
  const points = tiles.filter(hasTilePoint);
  const fallbackSize = TILE_HEATMAP.padding * 2;

  if (points.length === 0) {
    return {
      cells: [],
      width: fallbackSize,
      height: fallbackSize,
      viewBox: `0 0 ${fallbackSize} ${fallbackSize}`,
      maxCount: 0,
      bounds: {
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0,
      },
    };
  }

  const xs = points.map(tile => tile.x);
  const ys = points.map(tile => tile.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const step = TILE_HEATMAP.cell + TILE_HEATMAP.gap;
  const width = TILE_HEATMAP.padding * 2 + (maxX - minX + 1) * step - TILE_HEATMAP.gap;
  const height = TILE_HEATMAP.padding * 2 + (maxY - minY + 1) * step - TILE_HEATMAP.gap;
  const maxCount = Math.max(1, ...points.map(tile => tile.count));

  return {
    cells: points.map(tile => ({
      ...tile,
      left: TILE_HEATMAP.padding + (tile.x - minX) * step,
      top: TILE_HEATMAP.padding + (tile.y - minY) * step,
      intensity: tile.count / maxCount,
      tooltip: [
        tile.tile_id,
        `Count ${tile.count}`,
        `Last ${tile.last_event_type ?? '-'}`,
        `Point ${tile.x}, ${tile.y}`,
      ].join('\n'),
    })),
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    maxCount,
    bounds: {
      minX,
      maxX,
      minY,
      maxY,
    },
  };
}

function hasTilePoint(tile: TileStat): tile is TilePointStat {
  return typeof tile.x === 'number' && typeof tile.y === 'number';
}

function tileHeatColor(intensity: number) {
  const alpha = Math.max(0.22, Math.min(0.84, 0.22 + intensity * 0.62));
  return `rgba(163, 63, 72, ${alpha.toFixed(3)})`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildConnectionGraph(items: HourlyConnection[]) {
  const height = CONNECTION_GRAPH.height;
  const top = CONNECTION_GRAPH.top;
  const right = CONNECTION_GRAPH.right;
  const bottom = CONNECTION_GRAPH.bottom;
  const left = CONNECTION_GRAPH.left;
  const contentWidth = Math.max(
    CONNECTION_GRAPH.width - left - right,
    Math.max(1, items.length) * CONNECTION_GRAPH.bucketWidth,
  );
  const width = left + contentWidth + right;
  const graphHeight = height - top - bottom;
  const maxConnections = Math.max(
    1,
    ...items.map(item => Math.max(item.peak_connections, item.end_connections)),
  );
  const zeroY = top + graphHeight;
  const hitWidth = CONNECTION_GRAPH.bucketWidth;

  const yFor = (value: number) => zeroY - (value / maxConnections) * graphHeight;
  const points = items.map((item, index) => {
    const x = left + index * CONNECTION_GRAPH.bucketWidth + CONNECTION_GRAPH.bucketWidth / 2;
    return {
      hourStart: item.hour_start,
      x,
      hitX: x - hitWidth / 2,
      hitWidth,
      peak: item.peak_connections,
      end: item.end_connections,
      peakY: yFor(item.peak_connections),
      endY: yFor(item.end_connections),
      joins: item.joins,
      quits: item.quits,
    };
  });
  const peakPoints = points.map(point => `${point.x},${point.peakY}`).join(' ');
  const endPoints = points.map(point => `${point.x},${point.endY}`).join(' ');
  const areaPoints = points.length
    ? `${points[0].x},${zeroY} ${peakPoints} ${points[points.length - 1].x},${zeroY}`
    : '';

  return {
    width,
    points,
    peakPoints,
    endPoints,
    areaPoints,
    zeroY,
    maxConnections,
    gridLines: [0.25, 0.5, 0.75, 1].map(ratio => ({
      value: ratio,
      y: zeroY - ratio * graphHeight,
    })),
  };
}

function tooltipX(x: number, width: number) {
  const tooltipWidth = 132;
  const padding = 8;
  return Math.max(
    CONNECTION_GRAPH.left + padding,
    Math.min(x + padding, width - CONNECTION_GRAPH.right - tooltipWidth),
  );
}

function normalizeDashboardData(payload: unknown): DashboardData {
  const source = isRecord(payload) ? payload as Partial<DashboardData> : {};
  const summary = source.summary ?? EMPTY_SUMMARY;
  const uptime = source.uptime ?? EMPTY_UPTIME;
  const runtime = source.runtime ?? {
    ...EMPTY_RUNTIME,
    current_connections: summary.current_connections ?? 0,
    active_cursors: summary.active_cursors ?? 0,
    process_uptime_seconds: uptime.uptime_seconds ?? 0,
    started_at: uptime.started_at ?? null,
  };
  const stored = source.stored ?? {
    ...EMPTY_STORED,
    total_events: summary.total_events ?? 0,
  };

  return {
    server_time: source.server_time ?? new Date().toISOString(),
    range: source.range ?? DASHBOARD_RANGE,
    bucket: source.bucket ?? '1m',
    summary: {
      ...EMPTY_SUMMARY,
      ...summary,
    },
    runtime: {
      ...EMPTY_RUNTIME,
      ...runtime,
    },
    stored: {
      ...EMPTY_STORED,
      ...stored,
    },
    uptime: {
      ...EMPTY_UPTIME,
      ...uptime,
    },
    event_counts: arrayOrEmpty(source.event_counts),
    activity: arrayOrEmpty(source.activity),
    hourly_connections: arrayOrEmpty(source.hourly_connections),
    players: arrayOrEmpty(source.players),
    colors: arrayOrEmpty(source.colors),
    tiles: arrayOrEmpty(source.tiles),
    tile_heatmap: Array.isArray(source.tile_heatmap)
      ? arrayOrEmpty(source.tile_heatmap)
      : arrayOrEmpty(source.tiles),
    active_cursors: normalizeCursors(source.active_cursors),
    last_known_cursors: normalizeCursors(source.last_known_cursors),
    recent_events: arrayOrEmpty(source.recent_events),
    recent_logs: arrayOrEmpty(source.recent_logs),
  };
}

function normalizeCursors(value: ActiveCursor[] | undefined): ActiveCursor[] {
  return arrayOrEmpty(value).map(cursor => ({
    ...cursor,
    connected_at: cursor.connected_at ?? null,
    session_seconds: cursor.session_seconds ?? 0,
    color: cursor.color ?? null,
    tile_id: cursor.tile_id ?? null,
    x: cursor.x ?? null,
    y: cursor.y ?? null,
    score: cursor.score ?? 0,
    is_alive: cursor.is_alive ?? true,
    active_at: cursor.active_at ?? null,
    window: {
      width: cursor.window?.width ?? null,
      height: cursor.window?.height ?? null,
    },
  }));
}

function arrayOrEmpty<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function copyText(value: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function activityTotal(point: ActivityPoint) {
  return point.join
    + point.quit
    + point.move
    + point.create_cursor
    + point.open_tile
    + point.set_flag
    + point.explosion;
}

function shortId(value: string) {
  if (value.length <= 10) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function colorLabel(value: string | number | null) {
  if (value === null) {
    return '-';
  }
  const color = String(value);
  return colorLabels[color] ?? `Color ${color}`;
}

function pointLabel(cursor: ActiveCursor) {
  if (cursor.x === null || cursor.y === null) {
    return '-';
  }
  return `${cursor.x}, ${cursor.y}`;
}

function rangeLabel(value: string) {
  return value.toLowerCase() === 'all' ? 'All' : value;
}

function formatBucketMeta(value: string) {
  if (value === '1m') {
    return '1 min buckets';
  }
  if (value === '5m') {
    return '5 min buckets';
  }
  if (value === '1h') {
    return '1 hour buckets';
  }
  return `${value} buckets`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0s';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatHour(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
  });
}

function formatBucketLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
