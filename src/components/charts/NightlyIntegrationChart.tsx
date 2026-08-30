import React from 'react';

export interface NightlyDatum {
  date: string; // YYYY-MM-DD
  seconds: number;
  frameCount: number;
}

interface NightlyIntegrationChartProps {
  data: NightlyDatum[];
  color?: string;
}

const formatDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const formatShortDate = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
};

/**
 * Vertical bar chart of total integration time per capture night. A simple
 * time trend over discrete, evenly-spaced categories (nights), so — per the
 * "trend over time -> one hue" rule — every bar shares the same accent
 * colour rather than a categorical palette.
 */
export const NightlyIntegrationChart: React.FC<NightlyIntegrationChartProps> = ({
  data,
  color = '#3987e5'
}) => {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-slate-500">
        Sense dates de captura per mostrar
      </div>
    );
  }

  const maxSeconds = Math.max(...data.map(d => d.seconds), 1);

  return (
    <div className="overflow-x-auto overscroll-contain">
      <div className="flex items-end gap-1.5 h-36 min-w-max px-1">
        {data.map((d) => {
          const pct = Math.max(3, (d.seconds / maxSeconds) * 100);
          return (
            <div
              key={d.date}
              className="group flex flex-col items-center justify-end h-full w-6 shrink-0"
              title={`${formatShortDate(d.date)}: ${formatDuration(d.seconds)} (${d.frameCount} fotogrames)`}
            >
              <div className="flex-1 w-full flex items-end">
                <div
                  className="w-full rounded-t-sm transition-all duration-300 group-hover:brightness-125"
                  style={{ height: `${pct}%`, backgroundColor: color, minHeight: 2 }}
                />
              </div>
              <span className="mt-1.5 text-[9px] text-slate-500 font-mono whitespace-nowrap [writing-mode:vertical-rl] rotate-180 h-9">
                {formatShortDate(d.date)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
