import React from 'react';
import {
  Search,
  SlidersHorizontal,
  RotateCcw,
  Thermometer,
  Compass,
  Clock,
  Filter as FilterIcon,
  Tag,
  X,
  Layers,
  Database,
  CalendarRange
} from 'lucide-react';
import { FitsFilterState } from '../types/fits';

interface FilterSidebarProps {
  filters: FitsFilterState;
  onFilterChange: (newFilters: FitsFilterState) => void;
  onResetFilters: () => void;
  availableObjects: string[];
  availableFilters: string[];
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onCloseDesktop?: () => void;
  totalFiltered: number;
  totalAll: number;
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  availableObjects,
  availableFilters,
  isOpenMobile,
  onCloseMobile,
  onCloseDesktop,
  totalFiltered,
  totalAll
}) => {
  const frameTypes = ['ALL', 'LIGHT', 'DARK', 'FLAT', 'BIAS'];

  const handleTextChange = (key: keyof FitsFilterState, value: any) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const content = (
    <div className="space-y-5">
      {/* Title & Reset & Close */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-700/50">
        <div className="flex items-center space-x-2 text-slate-200 font-semibold text-xs tracking-wider uppercase">
          <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
          <span>Filtres de Metadades</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="btn-reset-filters"
            onClick={onResetFilters}
            className="text-[11px] text-slate-400 hover:text-blue-400 flex items-center gap-1 transition"
            title="Restablir tots els filtres"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restablir</span>
          </button>
          {onCloseDesktop && (
            <button
              onClick={onCloseDesktop}
              className="hidden lg:flex p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              title="Amagar panell de filtres"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Text Search */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
          <Search className="w-3 h-3 text-slate-400" />
          <span>Cerca Ràpida</span>
        </label>
        <div className="relative">
          <input
            id="filter-search-input"
            type="text"
            value={filters.search}
            onChange={(e) => handleTextChange('search', e.target.value)}
            placeholder="Nom objecte, fitxer, instrument..."
            className="w-full bg-[#0D1117] border border-slate-700 focus:border-blue-500 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition"
          />
          {filters.search && (
            <button
              onClick={() => handleTextChange('search', '')}
              className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Frame Type Filter (Light, Dark, Flat, Bias) */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
          <Layers className="w-3 h-3 text-slate-400" />
          <span>Tipus de Fotograma</span>
        </label>
        <div className="grid grid-cols-3 gap-1">
          {frameTypes.map(type => {
            const isSelected = filters.image_type === type;
            return (
              <button
                key={type}
                id={`filter-type-${type.toLowerCase()}`}
                onClick={() => handleTextChange('image_type', type)}
                className={`px-2 py-1 text-[11px] font-mono font-medium rounded border transition ${
                  isSelected
                    ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                    : 'bg-[#0D1117] border-slate-700/80 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>
      </div>

      {/* Target Object Dropdown */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
          <Tag className="w-3 h-3 text-slate-400" />
          <span>Objecte Astronòmic</span>
        </label>
        <select
          id="filter-object-select"
          value={filters.object_name}
          onChange={(e) => handleTextChange('object_name', e.target.value)}
          className="w-full bg-[#0D1117] border border-slate-700 focus:border-blue-500 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
        >
          <option value="ALL">Tots els objectes ({availableObjects.length})</option>
          {availableObjects.map(obj => (
            <option key={obj} value={obj}>{obj}</option>
          ))}
        </select>
      </div>

      {/* Filter Type (Ha, OIII, SII, RGB...) */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
          <FilterIcon className="w-3 h-3 text-slate-400" />
          <span>Filtre Òptic</span>
        </label>
        <select
          id="filter-optic-select"
          value={filters.filter_name}
          onChange={(e) => handleTextChange('filter_name', e.target.value)}
          className="w-full bg-[#0D1117] border border-slate-700 focus:border-blue-500 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
        >
          <option value="ALL">Tots els filtres</option>
          {availableFilters.map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {/* Exposure Time Range (s) */}
      <div className="space-y-1.5 pt-2 border-t border-slate-700/40">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-400 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
            <Clock className="w-3 h-3 text-blue-400" />
            <span>Exposició (s)</span>
          </span>
          <span className="font-mono text-blue-400 font-semibold">
            {filters.min_exposure}s - {filters.max_exposure}s
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="600"
          step="5"
          value={filters.min_exposure}
          onChange={(e) => handleTextChange('min_exposure', Number(e.target.value))}
          className="w-full accent-blue-500 h-1 bg-slate-700 rounded cursor-pointer"
        />
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            value={filters.min_exposure}
            onChange={(e) => handleTextChange('min_exposure', Math.max(0, Number(e.target.value)))}
            className="w-1/2 bg-[#0D1117] border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 text-center font-mono focus:outline-none focus:border-blue-500"
            placeholder="Min s"
          />
          <span className="text-slate-600">-</span>
          <input
            type="number"
            min="0"
            value={filters.max_exposure}
            onChange={(e) => handleTextChange('max_exposure', Math.max(0, Number(e.target.value)))}
            className="w-1/2 bg-[#0D1117] border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 text-center font-mono focus:outline-none focus:border-blue-500"
            placeholder="Max s"
          />
        </div>
      </div>

      {/* Sensor Temperature Filter (°C) */}
      <div className="space-y-1.5 pt-2 border-t border-slate-700/40">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-400 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
            <Thermometer className="w-3 h-3 text-orange-400" />
            <span>Temp Sensor</span>
          </span>
          <span className="font-mono text-orange-400 font-semibold">
            {filters.min_temp}°C - {filters.max_temp}°C
          </span>
        </div>
        <input
          type="range"
          min="-30"
          max="35"
          step="1"
          value={filters.max_temp}
          onChange={(e) => handleTextChange('max_temp', Number(e.target.value))}
          className="w-full accent-orange-500 h-1 bg-slate-700 rounded cursor-pointer"
        />
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="-50"
            max="50"
            value={filters.min_temp}
            onChange={(e) => handleTextChange('min_temp', Number(e.target.value))}
            className="w-1/2 bg-[#0D1117] border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 text-center font-mono focus:outline-none focus:border-orange-500"
            placeholder="Min °C"
          />
          <span className="text-slate-600">-</span>
          <input
            type="number"
            min="-50"
            max="50"
            value={filters.max_temp}
            onChange={(e) => handleTextChange('max_temp', Number(e.target.value))}
            className="w-1/2 bg-[#0D1117] border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 text-center font-mono focus:outline-none focus:border-orange-500"
            placeholder="Max °C"
          />
        </div>
      </div>

      {/* Rotation Angle Filter (°) */}
      <div className="space-y-1.5 pt-2 border-t border-slate-700/40">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-400 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
            <Compass className="w-3 h-3 text-purple-400" />
            <span>Angle Rotació</span>
          </span>
          <span className="font-mono text-purple-300 font-semibold">
            {filters.min_angle}° - {filters.max_angle}°
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            max="360"
            value={filters.min_angle}
            onChange={(e) => handleTextChange('min_angle', Math.max(0, Math.min(360, Number(e.target.value))))}
            className="w-1/2 bg-[#0D1117] border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 text-center font-mono focus:outline-none focus:border-blue-500"
            placeholder="Min °"
          />
          <span className="text-slate-600">-</span>
          <input
            type="number"
            min="0"
            max="360"
            value={filters.max_angle}
            onChange={(e) => handleTextChange('max_angle', Math.max(0, Math.min(360, Number(e.target.value))))}
            className="w-1/2 bg-[#0D1117] border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 text-center font-mono focus:outline-none focus:border-blue-500"
            placeholder="Max °"
          />
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="space-y-1.5 pt-2 border-t border-slate-700/40">
        <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
          <CalendarRange className="w-3 h-3 text-slate-400" />
          <span>Rang de Dates de Captura</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            id="filter-date-from"
            type="date"
            value={filters.date_from}
            onChange={(e) => handleTextChange('date_from', e.target.value)}
            className="w-1/2 bg-[#0D1117] border border-slate-700 focus:border-blue-500 rounded px-2 py-1 text-[11px] text-slate-200 font-mono focus:outline-none"
          />
          <span className="text-slate-600">-</span>
          <input
            id="filter-date-to"
            type="date"
            value={filters.date_to}
            onChange={(e) => handleTextChange('date_to', e.target.value)}
            className="w-1/2 bg-[#0D1117] border border-slate-700 focus:border-blue-500 rounded px-2 py-1 text-[11px] text-slate-200 font-mono focus:outline-none"
          />
        </div>
      </div>

      {/* Sorting */}
      <div className="space-y-1.5 pt-2 border-t border-slate-700/40">
        <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Ordenar per</label>
        <div className="grid grid-cols-2 gap-1.5">
          <select
            value={filters.sortBy}
            onChange={(e) => handleTextChange('sortBy', e.target.value)}
            className="bg-[#0D1117] border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none"
          >
            <option value="date_obs">Data Captura</option>
            <option value="exposure_time">Exposició</option>
            <option value="object_name">Objecte</option>
            <option value="sensor_temp">Temperatura</option>
            <option value="rotation_angle">Angle Rotació</option>
            <option value="file_name">Nom Fitxer</option>
          </select>
          <select
            value={filters.sortOrder}
            onChange={(e) => handleTextChange('sortOrder', e.target.value)}
            className="bg-[#0D1117] border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none"
          >
            <option value="desc">Descendent ↓</option>
            <option value="asc">Ascendent ↑</option>
          </select>
        </div>
      </div>

      {/* SQL Status & Counts Badge */}
      <div className="p-3 bg-[#0D1117] border border-slate-700/60 rounded-lg space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Resultats:</span>
          <span className="font-mono font-semibold text-blue-400">
            {totalFiltered} / {totalAll}
          </span>
        </div>
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse"></span>
            SQL DB Active
          </span>
          <span className="text-slate-500">Indexed</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside 
        id="filter-sidebar"
        className="w-80 bg-[#161B22] border border-slate-700/50 rounded-xl p-4 shadow-md sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto overscroll-contain flex-shrink-0"
      >
        {content}
      </aside>

      {/* Mobile Drawer */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div 
            className="fixed inset-0 bg-[#0B0F19]/80 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <div className="relative ml-auto w-full max-w-xs bg-[#161B22] border-l border-slate-700 p-5 overflow-y-auto h-full shadow-2xl z-10 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/50">
              <span className="font-bold text-white text-sm">Filtres de Metadades</span>
              <button 
                onClick={onCloseMobile}
                className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {content}
            <button
              onClick={onCloseMobile}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-md shadow transition"
            >
              Aplica ({totalFiltered} resultats)
            </button>
          </div>
        </div>
      )}
    </>
  );
};
