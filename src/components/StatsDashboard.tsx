import React, { useMemo } from 'react';
import { X, BarChart3, Layers, Target, Filter as FilterIcon, Moon } from 'lucide-react';
import { AstroStats, FitsMetadata } from '../types/fits';
import { HorizontalBarChart, HorizontalBarDatum } from './charts/HorizontalBarChart';
import { NightlyIntegrationChart, NightlyDatum } from './charts/NightlyIntegrationChart';

interface StatsDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  images: FitsMetadata[];
  stats: AstroStats;
  isFiltered: boolean;
}

// Matches the frame-type badge colours used across the grid/table/header,
// so the same identity (LIGHT/DARK/FLAT/BIAS) always reads the same colour
// instead of introducing a second, competing colour code for it here.
const TYPE_COLORS: Record<string, string> = {
  LIGHT: '#4ade80',
  DARK: '#94a3b8',
  FLAT: '#60a5fa',
  BIAS: '#a5b4fc',
};
const DEFAULT_TYPE_COLOR = '#cbd5e1';

const formatDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export const StatsDashboard: React.FC<StatsDashboardProps> = ({
  isOpen,
  onClose,
  images,
  stats,
  isFiltered
}) => {
  // Total integration time per capture night (YYYY-MM-DD), across all frame
  // types — same measure the header's "Integració Total" already sums.
  const nightlyData = useMemo<NightlyDatum[]>(() => {
    const byNight = new Map<string, { seconds: number; frameCount: number }>();
    for (const img of images) {
      const night = (img.date_obs || '').slice(0, 10);
      if (!night) continue;
      const cur = byNight.get(night) || { seconds: 0, frameCount: 0 };
      cur.seconds += img.exposure_time || 0;
      cur.frameCount += 1;
      byNight.set(night, cur);
    }
    return Array.from(byNight.entries())
      .map(([date, v]) => ({ date, seconds: v.seconds, frameCount: v.frameCount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [images]);

  const typeData: HorizontalBarDatum[] = useMemo(() => {
    return [...stats.typeBreakdown]
      .sort((a, b) => b.count - a.count)
      .map(t => ({
        label: t.image_type,
        value: t.count,
        color: TYPE_COLORS[t.image_type.toUpperCase()] || DEFAULT_TYPE_COLOR,
        tooltip: `${t.image_type}: ${t.count} fotogrames (${formatDuration(t.total_exp)})`
      }));
  }, [stats.typeBreakdown]);

  const objectData: HorizontalBarDatum[] = useMemo(() => {
    return [...stats.objectBreakdown]
      .sort((a, b) => b.total_exp - a.total_exp)
      .slice(0, 10)
      .map(o => ({
        label: o.object_name,
        value: o.total_exp,
        tooltip: `${o.object_name}: ${formatDuration(o.total_exp)} (${o.count} fotogrames)`
      }));
  }, [stats.objectBreakdown]);

  const filterData: HorizontalBarDatum[] = useMemo(() => {
    return [...stats.filterBreakdown]
      .sort((a, b) => b.total_exp - a.total_exp)
      .slice(0, 10)
      .map(f => ({
        label: f.filter_name,
        value: f.total_exp,
        tooltip: `${f.filter_name}: ${formatDuration(f.total_exp)} (${f.count} fotogrames)`
      }));
  }, [stats.filterBreakdown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#0B0F19]/85 backdrop-blur-md animate-fadeIn">
      <div
        id="stats-dashboard-modal"
        className="bg-[#161B22] border border-slate-700/60 rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700/50 bg-[#0D1117] shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white font-sans">
                Panell d'Estadístiques
              </h2>
              <p className="text-[11px] text-slate-400">
                {isFiltered
                  ? `Dades del subconjunt filtrat (${images.length} fotogrames)`
                  : `Dades de tot el catàleg (${images.length} fotogrames)`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {images.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-slate-500">
              No hi ha dades per representar gràficament.
            </div>
          ) : (
            <>
              {/* Nightly Integration Timeline */}
              <div className="p-4 bg-[#0D1117] border border-slate-700/50 rounded-lg">
                <div className="flex items-center gap-2 text-slate-200 font-semibold text-xs uppercase tracking-wider mb-3">
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                  <span>Integració per Nit de Captura</span>
                </div>
                <NightlyIntegrationChart data={nightlyData} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Frame Type Breakdown */}
                <div className="p-4 bg-[#0D1117] border border-slate-700/50 rounded-lg">
                  <div className="flex items-center gap-2 text-slate-200 font-semibold text-xs uppercase tracking-wider mb-3">
                    <Layers className="w-3.5 h-3.5 text-blue-400" />
                    <span>Fotogrames per Tipus</span>
                  </div>
                  <HorizontalBarChart data={typeData} valueFormatter={(v) => `${v}`} />
                </div>

                {/* Top Objects by Integration Time */}
                <div className="p-4 bg-[#0D1117] border border-slate-700/50 rounded-lg">
                  <div className="flex items-center gap-2 text-slate-200 font-semibold text-xs uppercase tracking-wider mb-3">
                    <Target className="w-3.5 h-3.5 text-blue-400" />
                    <span>Top Objectes per Integració</span>
                  </div>
                  <HorizontalBarChart data={objectData} valueFormatter={formatDuration} />
                </div>

                {/* Integration by Optical Filter */}
                <div className="p-4 bg-[#0D1117] border border-slate-700/50 rounded-lg md:col-span-2">
                  <div className="flex items-center gap-2 text-slate-200 font-semibold text-xs uppercase tracking-wider mb-3">
                    <FilterIcon className="w-3.5 h-3.5 text-blue-400" />
                    <span>Integració per Filtre Òptic</span>
                  </div>
                  <HorizontalBarChart data={filterData} valueFormatter={formatDuration} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-slate-700/50 bg-[#0D1117] shrink-0">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition"
          >
            Tancar
          </button>
        </div>
      </div>
    </div>
  );
};
