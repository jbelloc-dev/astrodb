import React from 'react';

export interface HorizontalBarDatum {
  label: string;
  value: number;
  color?: string;
  tooltip?: string;
}

interface HorizontalBarChartProps {
  data: HorizontalBarDatum[];
  valueFormatter?: (v: number) => string;
  defaultColor?: string;
  emptyLabel?: string;
}

/**
 * Simple, dependency-free horizontal bar chart. Bars are div-based (not SVG)
 * so labels & values stay real, selectable text and the layout stays
 * responsive without manual viewBox math. One shared max scales every bar,
 * and a hover state plus a native `title` tooltip give per-bar detail
 * without needing a custom tooltip layer.
 */
export const HorizontalBarChart: React.FC<HorizontalBarChartProps> = ({
  data,
  valueFormatter = (v) => String(v),
  defaultColor = '#3987e5',
  emptyLabel = 'Sense dades per mostrar'
}) => {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-xs text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="space-y-2.5">
      {data.map((d) => {
        const pct = Math.max(2, (d.value / maxValue) * 100);
        return (
          <div
            key={d.label}
            className="group"
            title={d.tooltip || `${d.label}: ${valueFormatter(d.value)}`}
          >
            <div className="flex items-center justify-between text-[11px] mb-1 gap-2">
              <span className="text-slate-300 truncate font-medium">{d.label}</span>
              <span className="font-mono text-slate-400 shrink-0 group-hover:text-slate-200 transition-colors">
                {valueFormatter(d.value)}
              </span>
            </div>
            <div className="h-2 w-full bg-slate-800/70 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 group-hover:brightness-125"
                style={{ width: `${pct}%`, backgroundColor: d.color || defaultColor }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
