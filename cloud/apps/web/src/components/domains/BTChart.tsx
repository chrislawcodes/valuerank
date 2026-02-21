import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';

type ValueKey =
  | 'Self_Direction_Action'
  | 'Universalism_Nature'
  | 'Benevolence_Dependability'
  | 'Security_Personal'
  | 'Power_Dominance'
  | 'Achievement'
  | 'Tradition'
  | 'Stimulation'
  | 'Hedonism'
  | 'Conformity_Interpersonal';

type ModelEntry = {
  model: string;
  label: string;
  values: Record<ValueKey, number>;
};

type HoveredCell = {
  model: string;
  label: string;
  value: ValueKey;
  logVal: number;
  rank: number;
};

// Static snapshot from a validated analysis export.
// TODO: Replace with API-backed per-domain data.
const data: ModelEntry[] = [
  { model: 'claude-sonnet-4-5', label: 'Claude\nSonnet 4.5', values: { Self_Direction_Action: 1.6451, Universalism_Nature: 1.4332, Benevolence_Dependability: 0.5614, Security_Personal: 0.4356, Achievement: 0.2526, Hedonism: -0.1574, Tradition: -0.1741, Stimulation: -0.3415, Power_Dominance: -0.8556, Conformity_Interpersonal: -2.7994 } },
  { model: 'deepseek-chat', label: 'DeepSeek\nChat', values: { Self_Direction_Action: 1.1955, Tradition: 0.6793, Universalism_Nature: 0.3466, Benevolence_Dependability: 0.0318, Conformity_Interpersonal: 0.0038, Power_Dominance: -0.0191, Security_Personal: -0.255, Stimulation: -0.3927, Hedonism: -0.4592, Achievement: -1.1309 } },
  { model: 'deepseek-reasoner', label: 'DeepSeek\nReasoner', values: { Self_Direction_Action: 1.4757, Power_Dominance: 0.844, Security_Personal: 0.5842, Tradition: 0.4419, Universalism_Nature: 0.1326, Conformity_Interpersonal: 0.0911, Benevolence_Dependability: -0.2564, Stimulation: -0.595, Achievement: -1.0585, Hedonism: -1.6596 } },
  { model: 'gemini-2.5-flash', label: 'Gemini\n2.5 Flash', values: { Self_Direction_Action: 0.7974, Security_Personal: 0.5093, Power_Dominance: 0.3923, Tradition: 0.1021, Universalism_Nature: 0.0859, Conformity_Interpersonal: -0.1738, Achievement: -0.2376, Benevolence_Dependability: -0.2784, Stimulation: -0.3068, Hedonism: -0.8904 } },
  { model: 'gemini-2.5-pro', label: 'Gemini\n2.5 Pro', values: { Universalism_Nature: 0.9101, Self_Direction_Action: 0.5365, Tradition: 0.4465, Security_Personal: 0.3661, Benevolence_Dependability: 0.1517, Achievement: -0.0736, Power_Dominance: -0.0869, Stimulation: -0.6201, Conformity_Interpersonal: -0.7657, Hedonism: -0.8646 } },
  { model: 'gpt-5-mini', label: 'GPT-5\nMini', values: { Self_Direction_Action: 0.5542, Universalism_Nature: 0.7732, Security_Personal: 0.4395, Power_Dominance: 0.4274, Tradition: 0.3343, Achievement: 0.0158, Stimulation: -0.4636, Benevolence_Dependability: -0.567, Conformity_Interpersonal: -0.6049, Hedonism: -0.9088 } },
  { model: 'gpt-5.1', label: 'GPT-5.1', values: { Universalism_Nature: 1.8516, Tradition: 1.3391, Stimulation: 0.8216, Self_Direction_Action: 0.5984, Benevolence_Dependability: 0.1681, Achievement: -0.2982, Hedonism: -0.4806, Power_Dominance: -0.5003, Security_Personal: -0.805, Conformity_Interpersonal: -2.6948 } },
  { model: 'grok-4-0709', label: 'Grok 4', values: { Self_Direction_Action: 0.6742, Universalism_Nature: 0.5698, Benevolence_Dependability: 0.3342, Tradition: 0.2349, Stimulation: 0.0669, Power_Dominance: 0.0057, Security_Personal: 0.0051, Achievement: -0.421, Conformity_Interpersonal: -0.6001, Hedonism: -0.8696 } },
  { model: 'grok-4-1-fast-reasoning', label: 'Grok 4.1\nFast', values: { Self_Direction_Action: 1.2015, Power_Dominance: 0.793, Benevolence_Dependability: 0.6631, Tradition: 0.1394, Security_Personal: 0.0376, Universalism_Nature: -0.0684, Achievement: -0.1333, Stimulation: -0.218, Conformity_Interpersonal: -1.1808, Hedonism: -1.234 } },
  { model: 'mistral-large-2512', label: 'Mistral\nLarge', values: { Universalism_Nature: 2.6088, Achievement: 2.3594, Hedonism: 2.3267, Benevolence_Dependability: 1.3833, Tradition: 0.6257, Stimulation: 0.3216, Self_Direction_Action: -1.5381, Conformity_Interpersonal: -2.3806, Power_Dominance: -2.6477, Security_Personal: -3.059 } },
  { model: 'mistral-small-2503', label: 'Mistral\nSmall', values: { Tradition: 3.1687, Benevolence_Dependability: 2.1636, Universalism_Nature: 1.2043, Self_Direction_Action: 1.1051, Achievement: -0.4261, Security_Personal: -0.7413, Stimulation: -1.0604, Hedonism: -1.1403, Power_Dominance: -1.601, Conformity_Interpersonal: -2.6724 } },
];

const VALUES: ValueKey[] = [
  'Self_Direction_Action',
  'Universalism_Nature',
  'Benevolence_Dependability',
  'Security_Personal',
  'Power_Dominance',
  'Achievement',
  'Tradition',
  'Stimulation',
  'Hedonism',
  'Conformity_Interpersonal',
];

const VALUE_LABELS: Record<ValueKey, string> = {
  Self_Direction_Action: 'Self-Direction',
  Universalism_Nature: 'Universalism (Nature)',
  Benevolence_Dependability: 'Benevolence',
  Security_Personal: 'Security',
  Power_Dominance: 'Power/Dominance',
  Achievement: 'Achievement',
  Tradition: 'Tradition',
  Stimulation: 'Stimulation',
  Hedonism: 'Hedonism',
  Conformity_Interpersonal: 'Conformity',
};

const VALUE_QUADRANT: Record<ValueKey, string> = {
  Self_Direction_Action: 'Openness',
  Universalism_Nature: 'Self-Transcendence',
  Benevolence_Dependability: 'Self-Transcendence',
  Security_Personal: 'Conservation',
  Power_Dominance: 'Self-Enhancement',
  Achievement: 'Self-Enhancement',
  Tradition: 'Conservation',
  Stimulation: 'Openness',
  Hedonism: 'Openness',
  Conformity_Interpersonal: 'Conservation',
};

const QUADRANT_COLORS: Record<string, string> = {
  Openness: '#60a5fa',
  'Self-Transcendence': '#34d399',
  Conservation: '#f59e0b',
  'Self-Enhancement': '#f87171',
};

function getColor(logStrength: number): string {
  const minVal = -3.1;
  const maxVal = 3.2;
  const t = (logStrength - minVal) / (maxVal - minVal);
  const clamped = Math.max(0, Math.min(1, t));

  if (clamped < 0.5) {
    const u = clamped / 0.5;
    const r = Math.round(20 + u * (30 - 20));
    const g = Math.round(20 + u * (40 - 20));
    const b = Math.round(60 + u * (20 - 60));
    return `rgb(${r},${g},${b})`;
  }

  const u = (clamped - 0.5) / 0.5;
  if (u < 0.4) {
    const v = u / 0.4;
    const r = Math.round(30 + v * (20 - 30));
    const g = Math.round(40 + v * (100 - 40));
    const b = Math.round(20 + v * (120 - 20));
    return `rgb(${r},${g},${b})`;
  }

  const v = (u - 0.4) / 0.6;
  const r = Math.round(20 + v * (0 - 20));
  const g = Math.round(100 + v * (220 - 100));
  const b = Math.round(120 + v * (200 - 120));
  return `rgb(${r},${g},${b})`;
}

function getRankColor(rank: number): string {
  if (rank === 1) return '#fbbf24';
  if (rank === 2) return '#94a3b8';
  if (rank === 3) return '#cd7c35';
  return '#3f4a5e';
}

export function BTChart() {
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);
  const [sortBy, setSortBy] = useState<'model' | ValueKey>('model');
  const [highlightValue, setHighlightValue] = useState<ValueKey | null>(null);

  const modelOrder = useMemo(() => {
    if (sortBy === 'model') return data;
    return [...data].sort((a, b) => b.values[sortBy] - a.values[sortBy]);
  }, [sortBy]);

  const getRank = (modelEntry: ModelEntry, valueName: ValueKey): number => {
    const sorted = [...VALUES].sort((a, b) => modelEntry.values[b] - modelEntry.values[a]);
    return sorted.indexOf(valueName) + 1;
  };

  return (
    <div
      className="rounded-xl border border-slate-800 bg-[#0a0e1a] p-6 text-[#c8d4e8]"
      style={{ fontFamily: "'Georgia', serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=JetBrains+Mono:wght@300;400;500&display=swap');
        .cell-hover:hover { filter: brightness(1.3); cursor: pointer; transform: scale(1.04); transition: all 0.1s ease; }
        ::-webkit-scrollbar { height: 4px; }
        ::-webkit-scrollbar-track { background: #0a0e1a; }
        ::-webkit-scrollbar-thumb { background: #2a3550; border-radius: 2px; }
      `}</style>

      <div className="mb-8 border-b border-[#1e2d4a] pb-6">
        <div
          className="mb-1 text-[28px] font-bold text-[#e8f0ff]"
          style={{ fontFamily: "'Playfair Display', serif", letterSpacing: '-0.5px' }}
        >
          Bradley-Terry Value Rankings
        </div>
        <div
          className="text-xs text-[#4a6080]"
          style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em' }}
        >
          LOG STRENGTH · 11 MODELS · 10 SCHWARTZ VALUES · JOBS DOMAIN
        </div>
      </div>

      <div className="mb-7 flex flex-wrap items-center gap-6">
        <div className="text-[11px] text-[#4a6080]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>QUADRANT →</div>
        {Object.entries(QUADRANT_COLORS).map(([quadrant, color]) => (
          <div key={quadrant} className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm opacity-70" style={{ background: color }} />
            <span className="text-[11px] text-[#7a90b0]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{quadrant}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-[#4a6080]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>SCALE:</span>
          <div className="flex gap-0.5">
            {[-3, -1.5, 0, 1.5, 3].map((value) => (
              <div key={value} className="flex h-3.5 w-7 items-center justify-center rounded-sm" style={{ background: getColor(value) }}>
                <span className="text-[8px] text-white/60" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-[#4a6080]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>SORT BY →</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setSortBy('model')}
          className="h-auto min-h-0 rounded-sm px-2.5 py-1"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            background: sortBy === 'model' ? '#1e3a5f' : 'transparent',
            border: `1px solid ${sortBy === 'model' ? '#3a6090' : '#1e2d4a'}`,
            color: sortBy === 'model' ? '#a0c4ff' : '#4a6080',
            cursor: 'pointer',
          }}
        >
          MODEL NAME
        </Button>
        {VALUES.map((valueName) => (
          <Button
            key={valueName}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSortBy(valueName)}
            className="h-auto min-h-0 rounded-sm px-2.5 py-1"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              background: sortBy === valueName ? `${QUADRANT_COLORS[VALUE_QUADRANT[valueName]]}33` : 'transparent',
              border: `1px solid ${sortBy === valueName ? `${QUADRANT_COLORS[VALUE_QUADRANT[valueName]]}88` : '#1e2d4a'}`,
              color: sortBy === valueName ? QUADRANT_COLORS[VALUE_QUADRANT[valueName]] : '#4a6080',
              cursor: 'pointer',
            }}
          >
            {VALUE_LABELS[valueName].toUpperCase()}
          </Button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[900px]" style={{ borderCollapse: 'separate', borderSpacing: '3px' }}>
          <thead>
            <tr>
              <th className="w-[100px]" />
              {VALUES.map((valueName) => (
                <th
                  key={valueName}
                  onMouseEnter={() => setHighlightValue(valueName)}
                  onMouseLeave={() => setHighlightValue(null)}
                  className="cursor-pointer px-1 pb-3 align-bottom"
                >
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className="h-5 w-[3px] rounded-sm transition-opacity"
                      style={{
                        background: QUADRANT_COLORS[VALUE_QUADRANT[valueName]],
                        opacity: highlightValue === valueName ? 1 : 0.5,
                      }}
                    />
                    <div
                      className="whitespace-nowrap uppercase transition-colors"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '10px',
                        color: highlightValue === valueName ? QUADRANT_COLORS[VALUE_QUADRANT[valueName]] : '#4a6080',
                        letterSpacing: '0.06em',
                        writingMode: 'vertical-rl',
                        transform: 'rotate(180deg)',
                      }}
                    >
                      {VALUE_LABELS[valueName]}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modelOrder.map((entry) => (
              <tr key={entry.model}>
                <td className="pr-3 pb-[3px]">
                  <div
                    className="text-right text-xs leading-[1.3] text-[#8a9ab8]"
                    style={{ fontFamily: "'Playfair Display', serif", whiteSpace: 'pre-line' }}
                  >
                    {entry.label}
                  </div>
                </td>
                {VALUES.map((valueName) => {
                  const logVal = entry.values[valueName];
                  const rank = getRank(entry, valueName);
                  const isHovered = hoveredCell?.model === entry.model && hoveredCell?.value === valueName;
                  const isHighlighted = highlightValue === valueName;

                  return (
                    <td key={valueName} className="p-0">
                      <div
                        className="cell-hover relative flex h-11 w-[62px] flex-col items-center justify-center rounded"
                        onMouseEnter={() => setHoveredCell({ model: entry.model, label: entry.label, value: valueName, logVal, rank })}
                        onMouseLeave={() => setHoveredCell(null)}
                        style={{
                          background: getColor(logVal),
                          outline: isHighlighted ? `2px solid ${QUADRANT_COLORS[VALUE_QUADRANT[valueName]]}88` : isHovered ? '2px solid #ffffff44' : 'none',
                          transition: 'outline 0.1s ease',
                          opacity: highlightValue && !isHighlighted ? 0.5 : 1,
                        }}
                      >
                        <div
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '11px',
                            fontWeight: 500,
                            color: logVal > 0.5 ? '#e8f8f0' : logVal < -1 ? '#6080a0' : '#a0c0d8',
                            letterSpacing: '-0.02em',
                          }}
                        >
                          {logVal > 0 ? '+' : ''}
                          {logVal.toFixed(2)}
                        </div>
                        <div
                          className="absolute top-[3px] right-[5px] flex h-[14px] w-[14px] items-center justify-center rounded-sm"
                          style={{ background: getRankColor(rank) }}
                        >
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: '8px',
                              fontWeight: 700,
                              color: rank <= 3 ? '#0a0e1a' : '#8090a8',
                            }}
                          >
                            {rank}
                          </span>
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hoveredCell && (
        <div className="fixed right-8 bottom-8 z-50 min-w-[220px] rounded-lg border border-[#1e3050] bg-[#0d1525] px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          <div className="mb-2 text-[15px] text-[#e0eaff]" style={{ fontFamily: "'Playfair Display', serif" }}>
            {hoveredCell.label.replace('\n', ' ')}
          </div>
          <div className="mb-1.5 flex items-center gap-2">
            <div className="h-2 w-2 rounded-sm" style={{ background: QUADRANT_COLORS[VALUE_QUADRANT[hoveredCell.value]] }} />
            <span className="text-[11px]" style={{ fontFamily: "'JetBrains Mono', monospace", color: QUADRANT_COLORS[VALUE_QUADRANT[hoveredCell.value]] }}>
              {VALUE_QUADRANT[hoveredCell.value]}
            </span>
          </div>
          <div className="mb-1 text-xs text-[#7a90b0]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {VALUE_LABELS[hoveredCell.value]}
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-xl font-medium text-[#c8f0d8]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {hoveredCell.logVal > 0 ? '+' : ''}
                {hoveredCell.logVal.toFixed(3)}
              </span>
              <span className="ml-1 text-[10px] text-[#4a6080]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                log strength
              </span>
            </div>
            <div
              className="rounded px-2 py-0.5 text-[13px]"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                background: getRankColor(hoveredCell.rank),
                color: hoveredCell.rank <= 3 ? '#0a0e1a' : '#8090a8',
              }}
            >
              #{hoveredCell.rank}
            </div>
          </div>
        </div>
      )}

      <div className="mt-7 text-[10px] leading-relaxed text-[#2a3a58]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        CELL COLOR = BT LOG STRENGTH (cool = low/negative, warm-teal = high/positive) · CORNER BADGE = RANK WITHIN MODEL (gold=1, silver=2, bronze=3)
        <br />
        CLICK SORT BUTTONS TO REORDER MODELS BY VALUE · HOVER COLUMN HEADERS TO HIGHLIGHT
      </div>
    </div>
  );
}
