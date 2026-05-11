import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from 'urql';
import { cn } from '../../lib/utils';
import {
  SYSTEM_HEALTH_QUERY,
  type SystemHealthQueryResult,
  type SystemHealthQueryVariables,
} from '../../api/operations/health';
import {
  ACTIVE_EVALUATIONS_QUERY,
  type ActiveEvaluationsQueryResult,
  type ActiveEvaluationsQueryVariables,
} from '../../api/operations/active-evaluation';

const POLL_MS = 30_000;
const STUCK_AMBER_MS = 10 * 60 * 1000;
const STUCK_RED_MS = 30 * 60 * 1000;
const PENDING_AMBER = 100;
const SUCCESS_RATE_WARN = 0.9;

type Tone = 'ok' | 'warn' | 'bad' | 'idle';

const TONE_VALUE: Record<Tone, string> = {
  ok: 'text-gray-900',
  warn: 'text-amber-700',
  bad: 'text-red-700',
  idle: 'text-gray-400',
};

function formatAge(ms: number): string {
  if (ms < 0) return '0s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

function formatPercent(value: number | null): string {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

type HeartbeatStripProps = {
  domainId?: string | null;
};

export function HeartbeatStrip({ domainId }: HeartbeatStripProps) {
  const normalizedDomainId = domainId != null && domainId.trim() !== '' ? domainId : null;

  const [healthResult, reexecuteHealth] = useQuery<SystemHealthQueryResult, SystemHealthQueryVariables>({
    query: SYSTEM_HEALTH_QUERY,
    variables: { refresh: false },
    requestPolicy: 'cache-and-network',
  });

  const [evalsResult, reexecuteEvals] = useQuery<ActiveEvaluationsQueryResult, ActiveEvaluationsQueryVariables>({
    query: ACTIVE_EVALUATIONS_QUERY,
    variables: { domainId: normalizedDomainId },
    requestPolicy: 'cache-and-network',
  });

  const isFetchingRef = useRef(false);
  useEffect(() => {
    isFetchingRef.current = healthResult.fetching || evalsResult.fetching;
  }, [healthResult.fetching, evalsResult.fetching]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (isFetchingRef.current) return;
      reexecuteHealth({ requestPolicy: 'network-only' });
      reexecuteEvals({ requestPolicy: 'network-only' });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [reexecuteHealth, reexecuteEvals]);

  const queue = healthResult.data?.systemHealth.queue ?? null;
  const evaluations = useMemo(
    () => evalsResult.data?.activeEvaluations ?? [],
    [evalsResult.data?.activeEvaluations],
  );
  const hasError = healthResult.error != null || evalsResult.error != null;

  const oldestInFlightMs = useMemo(() => {
    let oldest: number | null = null;
    for (const evaluation of evaluations) {
      for (const member of evaluation.members) {
        if (member.runStartedAt == null) continue;
        if (member.runCompletedAt != null) continue;
        const t = new Date(member.runStartedAt).getTime();
        if (Number.isNaN(t)) continue;
        if (oldest == null || t < oldest) oldest = t;
      }
    }
    return oldest;
  }, [evaluations]);

  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const healthDataRef = useRef(healthResult.data);
  const evalsDataRef = useRef(evalsResult.data);
  useEffect(() => {
    const healthChanged = healthResult.data != null && healthResult.data !== healthDataRef.current;
    const evalsChanged = evalsResult.data != null && evalsResult.data !== evalsDataRef.current;
    if (healthChanged || evalsChanged) {
      healthDataRef.current = healthResult.data;
      evalsDataRef.current = evalsResult.data;
      setLastUpdatedAt(Date.now());
    }
  }, [healthResult.data, evalsResult.data]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const updatedAgo = lastUpdatedAt != null ? formatAge(nowMs - lastUpdatedAt) : '—';

  const throughputTone: Tone =
    queue == null
      ? 'idle'
      : queue.successRate != null && queue.successRate < SUCCESS_RATE_WARN
        ? 'bad'
        : 'ok';

  const inFlightTone: Tone =
    queue == null ? 'idle' : queue.pendingJobs > PENDING_AMBER ? 'warn' : 'ok';

  const oldestTone: Tone =
    oldestInFlightMs == null
      ? 'idle'
      : nowMs - oldestInFlightMs > STUCK_RED_MS
        ? 'bad'
        : nowMs - oldestInFlightMs > STUCK_AMBER_MS
          ? 'warn'
          : 'ok';

  const dotColor = hasError ? 'bg-red-500' : 'bg-emerald-500';

  return (
    <section
      aria-label="System heartbeat"
      className="rounded-lg border border-gray-200 bg-white shadow-sm"
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-6 py-4 md:grid-cols-4">
        <Tile
          label="Throughput · 30m"
          value={queue ? queue.completedLast30m.toLocaleString() : '—'}
          sub={queue ? `${formatPercent(queue.successRate)} success · 24h` : 'Loading…'}
          tone={throughputTone}
        />
        <Tile
          label="In flight"
          value={queue ? `${queue.activeJobs}` : '—'}
          sub={queue ? `${queue.pendingJobs.toLocaleString()} pending` : 'Loading…'}
          tone={inFlightTone}
        />
        <Tile
          label="Oldest run"
          value={oldestInFlightMs != null ? formatAge(nowMs - oldestInFlightMs) : '—'}
          sub={oldestInFlightMs != null ? 'longest active' : 'no active runs'}
          tone={oldestTone}
        />
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
            <span
              aria-hidden
              className={cn('inline-block h-2 w-2 rounded-full animate-pulse', dotColor)}
            />
            Heartbeat
          </div>
          <div className={cn('text-2xl font-medium tabular-nums', hasError ? 'text-red-700' : 'text-gray-900')}>
            {updatedAgo}
          </div>
          <div className="text-xs text-gray-500">
            {hasError ? 'last poll failed' : 'since last update'}
          </div>
        </div>
      </div>
    </section>
  );
}

type TileProps = {
  label: string;
  value: string;
  sub: string;
  tone: Tone;
};

function Tile({ label, value, sub, tone }: TileProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className={cn('text-2xl font-medium tabular-nums', TONE_VALUE[tone])}>
        {value}
      </div>
      <div className="text-xs text-gray-500">{sub}</div>
    </div>
  );
}
