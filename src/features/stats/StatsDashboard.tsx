'use client';

import { useEffect, useMemo, useState } from 'react';
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

type ActiveCursor = {
  connection_id: string;
  cursor_id: string;
  connected_at: string;
  session_seconds: number;
  color: number;
  tile_id: string;
  x: number;
  y: number;
  score: number;
  is_alive: boolean;
  active_at: string;
  window: {
    width: number;
    height: number;
  };
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
  uptime: Uptime;
  event_counts: EventCount[];
  activity: ActivityPoint[];
  hourly_connections: HourlyConnection[];
  players: PlayerStat[];
  colors: ColorStat[];
  tiles: TileStat[];
  active_cursors: ActiveCursor[];
  recent_events: StatEvent[];
  recent_logs: AppLog[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const POLL_MS = 3000;

const eventLabels: Record<string, string> = {
  JOIN: 'Join',
  QUIT: 'Quit',
  CREATE_CURSOR: 'Create',
  MOVE: 'Move',
  OPEN_TILE: 'Open',
  SET_FLAG: 'Flag',
  EXPLOSION: 'Blast',
};

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
};

export default function StatsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setIsRefreshing(true);
        const response = await fetch(`${API_URL}/stats/dashboard?range=24h&bucket=1m&limit=40`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`stats api ${response.status}`);
        }
        const payload = (await response.json()) as DashboardData;
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

  const peakActivity = useMemo(() => {
    if (!data) {
      return 1;
    }
    return Math.max(
      1,
      ...data.activity.map(point => point.join + point.quit + point.move + point.create_cursor + point.open_tile),
    );
  }, [data]);

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

  const activeColorCounts = useMemo(() => {
    if (!data) {
      return [];
    }

    const counts = data.active_cursors.reduce<Record<string, number>>((acc, cursor) => {
      const color = String(cursor.color);
      acc[color] = (acc[color] ?? 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([color, count]) => ({ color, count }))
      .sort((a, b) => b.count - a.count || Number(a.color) - Number(b.color));
  }, [data]);

  const summary = data?.summary;

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
          <span>24h</span>
        </div>
      </section>

      {error && <div className={S.errorBanner}>{error}</div>}

      <section className={S.summaryGrid}>
        <SummaryCard
          label="Live"
          value={summary?.current_connections ?? 0}
          detail={`${summary?.active_cursors ?? 0} cursors / ${formatDuration(data?.uptime.uptime_seconds ?? 0)} up`}
          tone="green"
        />
        <SummaryCard label="Events" value={summary?.total_events ?? 0} detail="stat_event rows" tone="ink" />
        <SummaryCard label="Join" value={summary?.joins ?? 0} detail={`${summary?.quits ?? 0} quits`} tone="blue" />
        <SummaryCard label="Move" value={summary?.moves ?? 0} detail={`${summary?.created_cursors ?? 0} cursors`} tone="amber" />
        <SummaryCard label="Open" value={summary?.opened_tiles ?? 0} detail={`${summary?.flags ?? 0} flags`} tone="rose" />
        <SummaryCard label="Logs" value={summary?.debug_logs ?? 0} detail="recent debug" tone="gray" />
      </section>

      <section className={S.fullWidth}>
        <Panel title="Active Cursors" meta={`${data?.active_cursors.length ?? 0} connected`}>
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
          <div className={S.activeCursorGrid}>
            {(data?.active_cursors ?? []).map(cursor => (
              <article className={S.activeCursor} key={cursor.cursor_id}>
                <div className={S.cursorLead}>
                  <span className={S.colorSwatch} data-color={String(cursor.color)} />
                  <div>
                    <strong>{shortId(cursor.cursor_id)}</strong>
                    <em>
                      {colorLabel(cursor.color)} / {cursor.is_alive ? 'alive' : 'reviving'}
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
                    <dd>{cursor.tile_id}</dd>
                  </div>
                  <div>
                    <dt>Point</dt>
                    <dd>
                      {cursor.x}, {cursor.y}
                    </dd>
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
                    <dt>Session</dt>
                    <dd>{formatDuration(cursor.session_seconds)}</dd>
                  </div>
                </dl>
              </article>
            ))}
            {data && data.active_cursors.length === 0 && (
              <div className={S.emptyState}>No connected cursors</div>
            )}
          </div>
        </Panel>
      </section>

      <section className={S.fullWidth}>
        <Panel title="Hourly Connections" meta="24h connection state">
          <div className={S.connectionChart} aria-label="Hourly connections">
            <svg
              className={S.connectionVector}
              viewBox={`0 0 ${CONNECTION_GRAPH.width} ${CONNECTION_GRAPH.height}`}
              role="img"
              aria-label="Hourly connection vector graph"
            >
              <line
                x1={CONNECTION_GRAPH.left}
                y1={connectionGraph.zeroY}
                x2={CONNECTION_GRAPH.width - CONNECTION_GRAPH.right}
                y2={connectionGraph.zeroY}
                className={S.connectionAxis}
              />
              {connectionGraph.gridLines.map(line => (
                <line
                  key={line.value}
                  x1={CONNECTION_GRAPH.left}
                  y1={line.y}
                  x2={CONNECTION_GRAPH.width - CONNECTION_GRAPH.right}
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
              {connectionGraph.points.map(point => (
                <g key={point.hourStart}>
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
            <div className={S.connectionLabels}>
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
          <div className={S.legend}>
            <span><i className={S.legendPeak} />Peak connections</span>
            <span><i className={S.legendEnd} />End connections</span>
            <span><i className={S.legendJoin} />Joins</span>
            <span><i className={S.legendQuit} />Quits</span>
          </div>
        </Panel>
      </section>

      <section className={S.twoColumn}>
        <Panel title="Activity Timeline" meta={`${data?.bucket ?? '1m'} buckets`}>
          <div className={S.timeline} aria-label="Activity timeline">
            {(data?.activity ?? []).slice(-36).map(point => (
              <div className={S.timelineBar} key={point.bucket_start}>
                <span
                  style={{
                    height: `${Math.max(
                      4,
                      ((point.join + point.quit + point.move + point.create_cursor + point.open_tile) / peakActivity) * 100,
                    )}%`,
                  }}
                />
              </div>
            ))}
          </div>
          <div className={S.legend}>
            <span>Join</span>
            <span>Quit</span>
            <span>Move</span>
            <span>Create</span>
          </div>
        </Panel>

        <Panel title="Event Breakdown" meta={`${data?.event_counts.length ?? 0} types`}>
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
        </Panel>
      </section>

      <section className={S.twoColumn}>
        <Panel title="Players" meta="top actors">
          <table className={S.table}>
            <thead>
              <tr>
                <th>Actor</th>
                <th>Events</th>
                <th>Moves</th>
                <th>Last Tile</th>
              </tr>
            </thead>
            <tbody>
              {(data?.players ?? []).slice(0, 8).map(player => (
                <tr key={player.actor_id}>
                  <td>{shortId(player.actor_id)}</td>
                  <td>{player.event_count}</td>
                  <td>{player.move_count}</td>
                  <td>{player.last_tile_id ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Cursor Colors" meta="create events">
          <div className={S.colorGrid}>
            {(data?.colors ?? []).map(item => (
              <div className={S.colorItem} key={item.color}>
                <span className={S.colorSwatch} data-color={item.color} />
                <strong>{colorLabel(item.color)}</strong>
                <em>{item.count}</em>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className={S.twoColumn}>
        <Panel title="Tile Activity" meta="hot tiles">
          <table className={S.table}>
            <thead>
              <tr>
                <th>Tile</th>
                <th>Count</th>
                <th>Last</th>
              </tr>
            </thead>
            <tbody>
              {(data?.tiles ?? []).slice(0, 10).map(tile => (
                <tr key={tile.tile_id}>
                  <td>{tile.tile_id}</td>
                  <td>{tile.count}</td>
                  <td>{tile.last_event_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Recent Events" meta="stat_event">
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
              {(data?.recent_events ?? []).slice(0, 10).map(event => (
                <tr key={event.id}>
                  <td>{formatTime(event.added_at)}</td>
                  <td>{eventLabels[event.event_type] ?? event.event_type}</td>
                  <td>{event.actor_id ? shortId(event.actor_id) : '-'}</td>
                  <td>{event.tile_id ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </section>

      <section className={S.fullWidth}>
        <Panel title="Recent Debug Logs" meta="app_log">
          <div className={S.logList}>
            {(data?.recent_logs ?? []).slice(0, 12).map(log => (
              <div className={S.logRow} key={log.id}>
                <span>{formatTime(log.added_at)}</span>
                <strong>{log.level}</strong>
                <em>{log.module ?? '-'}</em>
                <p>{log.message}</p>
              </div>
            ))}
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

function Panel({ title, meta, children }: { title: string; meta: string; children: React.ReactNode }) {
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

function buildConnectionGraph(items: HourlyConnection[]) {
  const width = CONNECTION_GRAPH.width;
  const height = CONNECTION_GRAPH.height;
  const top = CONNECTION_GRAPH.top;
  const right = CONNECTION_GRAPH.right;
  const bottom = CONNECTION_GRAPH.bottom;
  const left = CONNECTION_GRAPH.left;
  const graphWidth = width - left - right;
  const graphHeight = height - top - bottom;
  const maxConnections = Math.max(
    1,
    ...items.map(item => Math.max(item.peak_connections, item.end_connections)),
  );
  const zeroY = top + graphHeight;
  const pointCount = Math.max(1, items.length - 1);

  const yFor = (value: number) => zeroY - (value / maxConnections) * graphHeight;
  const points = items.map((item, index) => {
    const x = left + (index / pointCount) * graphWidth;
    return {
      hourStart: item.hour_start,
      x,
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
    ? `${left},${zeroY} ${peakPoints} ${width - right},${zeroY}`
    : '';

  return {
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

function shortId(value: string) {
  if (value.length <= 10) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function colorLabel(value: string | number) {
  const color = String(value);
  return colorLabels[color] ?? `Color ${color}`;
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

function formatTime(value: string) {
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
