import React from 'react';
import { 
  Telescope, 
  FolderSearch, 
  Sparkles, 
  Database, 
  Download, 
  LayoutGrid, 
  Table as TableIcon,
  Clock, 
  Thermometer, 
  Layers,
  Compass,
  Search,
  Filter,
  RotateCcw,
  BarChart3
} from 'lucide-react';
import { AstroStats } from '../types/fits';

interface HeaderProps {
  stats: AstroStats | null;
  globalStats?: AstroStats | null;
  totalImagesCount: number;
  filteredCount: number;
  isFiltered?: boolean;
  onResetFilters?: () => void;
  viewMode: 'grid' | 'table';
  onViewModeChange: (mode: 'grid' | 'table') => void;
  onOpenScanner: () => void;
  onLoadSamples: () => void;
  onOpenSqlConsole: () => void;
  onOpenExport: () => void;
  onOpenStats: () => void;
  isLoadingSamples: boolean;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  stats,
  globalStats,
  totalImagesCount,
  filteredCount,
  isFiltered = false,
  onResetFilters,
  viewMode,
  onViewModeChange,
  onOpenScanner,
  onLoadSamples,
  onOpenSqlConsole,
  onOpenExport,
  onOpenStats,
  isLoadingSamples,
  searchQuery = '',
  onSearchChange
}) => {
  // Format total exposure in human readable string (h, m, s)
  const formatTotalTime = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs.toFixed(1)}s`;
  };

  const totalExpSeconds = stats?.overview?.total_exposure_sec || 0;
  const globalExpSeconds = globalStats?.overview?.total_exposure_sec || 0;
  const avgTemp = stats?.overview?.avg_temp;

  return (
    <header className="sticky top-0 z-30 bg-[#161B22] border-b border-slate-700/50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        {/* Top row: Brand, Global Search & Primary Actions */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm shadow-blue-500/30">
              <Telescope className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                  ASTRO-ARCHIVE <span className="text-slate-400 font-normal text-xs bg-[#0D1117] border border-slate-700/60 px-2 py-0.5 rounded">v2.4 SQL</span>
                </h1>
              </div>
              <p className="text-[11px] text-slate-400">
                FITS Astronomical Image Classifier & SQL Catalog
              </p>
            </div>
          </div>

          {/* Center search bar (desktop) */}
          {onSearchChange && (
            <div className="hidden lg:flex items-center relative flex-1 max-w-sm mx-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Cerca per Objecte, Data o Filtre..."
                className="bg-[#0D1117] border border-slate-700 rounded-md px-3.5 py-1.5 w-full text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 pointer-events-none" />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Import Directory (Primary Theme Button) */}
            <button
              id="btn-scan-directory"
              onClick={onOpenScanner}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition active:scale-95"
            >
              <FolderSearch className="w-3.5 h-3.5" />
              <span>+ Importar Directori</span>
            </button>

            {/* Load Samples */}
            <button
              id="btn-load-samples"
              onClick={onLoadSamples}
              disabled={isLoadingSamples}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-200 bg-[#0D1117] hover:bg-slate-800 border border-slate-700 rounded-md transition active:scale-95 disabled:opacity-50"
              title="Carrega imatges FITS de prova amb metadades i calibracions reals"
            >
              <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${isLoadingSamples ? 'animate-spin' : ''}`} />
              <span>{isLoadingSamples ? 'Carregant...' : 'Sessió de Mostra'}</span>
            </button>

            {/* SQL Console */}
            <button
              id="btn-open-sql"
              onClick={onOpenSqlConsole}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-md transition active:scale-95"
              title="Obre la consola interactiva SQL"
            >
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span>Consola SQL</span>
            </button>

            {/* Stats Dashboard (Charts) */}
            <button
              id="btn-open-stats"
              onClick={onOpenStats}
              disabled={totalImagesCount === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-md transition active:scale-95 disabled:opacity-40"
              title="Obre el panell de gràfiques i estadístiques"
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Estadístiques</span>
            </button>

            {/* Export CSV / DB */}
            <button
              id="btn-open-export"
              onClick={onOpenExport}
              disabled={totalImagesCount === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-700 hover:bg-slate-600 rounded-md transition active:scale-95 disabled:opacity-40"
              title="Exporta el catàleg en CSV, SQL, JSON, Siril o ZIP"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar</span>
            </button>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-[#0D1117] border border-slate-700 rounded-md p-0.5">
              <button
                id="btn-view-grid"
                onClick={() => onViewModeChange('grid')}
                className={`p-1.5 rounded transition ${viewMode === 'grid' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                title="Vista en graella"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                id="btn-view-table"
                onClick={() => onViewModeChange('table')}
                className={`p-1.5 rounded transition ${viewMode === 'table' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                title="Vista en taula"
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>
        </div>

        {/* Bottom row: Astronomical Summary Status Bar (Updates dynamically with filters) */}
        {totalImagesCount > 0 && (
          <div className="mt-2.5 pt-2 border-t border-slate-700/40 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-y-2">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              
              {/* Fotogrames count */}
              <div className="flex items-center gap-1.5 text-slate-300">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span>
                  {isFiltered ? (
                    <>
                      Fotogrames filtrats: <strong className="text-blue-400 font-mono">{filteredCount}</strong>
                      <span className="text-slate-500 font-mono"> / {totalImagesCount}</span>
                    </>
                  ) : (
                    <>
                      Indexats: <strong className="text-white font-mono">{totalImagesCount}</strong> fotogrames
                    </>
                  )}
                </span>
                {isFiltered && (
                  <span className="px-1.5 py-0.2 text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded font-medium flex items-center gap-1">
                    <Filter className="w-2.5 h-2.5" />
                    Filtrat
                  </span>
                )}
              </div>

              {/* Dynamic Integration Time */}
              <div className="flex items-center gap-1.5 text-slate-300">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span>
                  Integració{isFiltered ? ' filtrada' : ''}:{' '}
                  <strong className="text-blue-400 font-mono">{formatTotalTime(totalExpSeconds)}</strong>
                  {isFiltered && globalExpSeconds > 0 && totalExpSeconds !== globalExpSeconds && (
                    <span className="text-slate-500 font-mono text-[11px]"> (total: {formatTotalTime(globalExpSeconds)})</span>
                  )}
                </span>
              </div>

              {/* Dynamic Average Temperature */}
              {avgTemp !== null && avgTemp !== undefined && (
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Thermometer className="w-3.5 h-3.5 text-blue-400" />
                  <span>
                    Temp. Mitjana{isFiltered ? ' (filtrada)' : ''}:{' '}
                    <strong className="text-orange-400 font-mono">{Number(avgTemp).toFixed(1)}°C</strong>
                  </span>
                </div>
              )}

              {/* Unique Objects */}
              {stats?.overview?.distinct_objects !== undefined && (
                <div className="hidden sm:flex items-center gap-1.5 text-slate-300">
                  <Compass className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Objectes{isFiltered ? ' filtrats' : ''}:{' '}
                    <strong className="text-slate-200 font-mono">{stats.overview.distinct_objects}</strong>
                  </span>
                </div>
              )}

              {/* Quick Reset Filter Button in Header if filtered */}
              {isFiltered && onResetFilters && (
                <button
                  onClick={onResetFilters}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-300 px-2 py-0.5 bg-[#0D1117] hover:bg-slate-800 border border-slate-700/60 rounded transition"
                  title="Restableix tots els filtres per veure tot el catàleg"
                >
                  <RotateCcw className="w-3 h-3 text-blue-400" />
                  <span>Restablir filtres</span>
                </button>
              )}
            </div>

            {/* Frame type breakdown pill tags (calculated strictly for the filtered images) */}
            {stats?.typeBreakdown && stats.typeBreakdown.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {stats.typeBreakdown.map(t => {
                  const colorMap: Record<string, string> = {
                    LIGHT: 'bg-green-500/10 text-green-400 border-green-500/20',
                    DARK: 'bg-slate-500/20 text-slate-400 border-slate-700/60',
                    FLAT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                    BIAS: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
                  };
                  const color = colorMap[t.image_type.toUpperCase()] || 'bg-slate-800 text-slate-300 border-slate-700';
                  return (
                    <span 
                      key={t.image_type} 
                      className={`text-[10px] px-2 py-0.5 rounded border ${color} font-mono`}
                      title={`${t.image_type}: ${t.count} fotogrames (${formatTotalTime(t.total_exp)})`}
                    >
                      {t.image_type}: {t.count}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </header>
  );
};
