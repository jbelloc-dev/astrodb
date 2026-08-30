import React from 'react';
import { 
  Eye, 
  Download, 
  Trash2, 
  Clock, 
  Thermometer, 
  Compass, 
  Layers, 
  ArrowUpDown
} from 'lucide-react';
import { FitsMetadata, FitsFilterState } from '../types/fits';

interface ImageTableProps {
  images: FitsMetadata[];
  selectedIds: string[];
  allSelected: boolean;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onOpenViewer: (image: FitsMetadata) => void;
  onDeleteImage: (id: string) => void;
  onDownloadPreview: (image: FitsMetadata) => void;
  filters: FitsFilterState;
  onSortChange: (sortBy: FitsFilterState['sortBy']) => void;
}

export const ImageTable: React.FC<ImageTableProps> = ({
  images,
  selectedIds,
  allSelected,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onOpenViewer,
  onDeleteImage,
  onDownloadPreview,
  filters,
  onSortChange
}) => {
  const isAllSelected = allSelected;

  const getTypeBadgeClass = (type: string) => {
    switch (type.toUpperCase()) {
      case 'LIGHT':
        return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'DARK':
        return 'bg-slate-500/20 text-slate-400 border-slate-700/60';
      case 'FLAT':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'BIAS':
        return 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20';
      default:
        return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  const formatExposure = (sec: number) => {
    if (sec >= 60) {
      const min = Math.floor(sec / 60);
      const remain = sec % 60;
      return remain > 0 ? `${min}m ${remain}s` : `${min}m`;
    }
    if (sec < 0.1) return `${(sec * 1000).toFixed(0)}ms`;
    return `${sec}s`;
  };

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-[#161B22] border border-slate-700/50 rounded-xl text-center space-y-4">
        <div className="w-14 h-14 rounded-xl bg-[#0D1117] border border-slate-700 flex items-center justify-center text-slate-500">
          <Layers className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-200">
            No s'han trobat imatges FITS
          </h3>
          <p className="text-xs text-slate-400">
            Ajusta els filtres o escaneja un directori per omplir la taula SQL.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      id="fits-table-container"
      className="bg-[#161B22] border border-slate-700/50 rounded-lg overflow-hidden shadow-sm"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300 border-collapse">
          <thead>
            <tr className="bg-[#0D1117] border-b border-slate-700/60 text-slate-400 font-semibold select-none text-[11px] uppercase tracking-wider">
              <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={() => (isAllSelected ? onClearSelection() : onSelectAll())}
                  className="w-4 h-4 rounded border-slate-700 bg-[#0D1117] text-blue-600 focus:ring-0 cursor-pointer accent-blue-500"
                />
              </th>
              <th className="p-3 w-16">Preview</th>
              
              {/* Sortable Header: Object */}
              <th 
                className="p-3 cursor-pointer hover:text-blue-400 transition"
                onClick={() => onSortChange('object_name')}
              >
                <div className="flex items-center gap-1">
                  <span>Objecte</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>

              {/* Type */}
              <th className="p-3">Tipus</th>

              {/* Sortable Header: Exposure */}
              <th 
                className="p-3 cursor-pointer hover:text-blue-400 transition"
                onClick={() => onSortChange('exposure_time')}
              >
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-blue-400" />
                  <span>Exp.</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>

              {/* Sortable Header: Temp */}
              <th 
                className="p-3 cursor-pointer hover:text-blue-400 transition"
                onClick={() => onSortChange('sensor_temp')}
              >
                <div className="flex items-center gap-1">
                  <Thermometer className="w-3 h-3 text-orange-400" />
                  <span>Temp (°C)</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>

              {/* Sortable Header: Angle */}
              <th 
                className="p-3 cursor-pointer hover:text-blue-400 transition"
                onClick={() => onSortChange('rotation_angle')}
              >
                <div className="flex items-center gap-1">
                  <Compass className="w-3 h-3 text-purple-400" />
                  <span>Angle</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>

              <th className="p-3">Filtre</th>

              {/* Sortable Header: Date */}
              <th 
                className="p-3 cursor-pointer hover:text-blue-400 transition"
                onClick={() => onSortChange('date_obs')}
              >
                <div className="flex items-center gap-1">
                  <span>Data (UTC)</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>

              <th className="p-3">Dimensions</th>
              <th className="p-3">Equip (Telescopi/Càmera)</th>
              <th className="p-3 text-right">Accions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {images.map((img) => {
              const isSelected = selectedIds.includes(img.id);
              const typeClass = getTypeBadgeClass(img.image_type);

              return (
                <tr
                  key={img.id}
                  id={`fits-row-${img.id}`}
                  className={`hover:bg-slate-800/40 transition cursor-pointer ${
                    isSelected ? 'bg-blue-950/20' : ''
                  }`}
                  onClick={() => onOpenViewer(img)}
                >
                  <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(img.id)}
                      className="w-4 h-4 rounded border-slate-700 bg-[#0D1117] text-blue-600 focus:ring-0 cursor-pointer accent-blue-500"
                    />
                  </td>

                  {/* Thumbnail */}
                  <td className="p-2">
                    <div className="w-12 h-12 rounded bg-[#0D1117] border border-slate-700 overflow-hidden">
                      <img
                        src={img.thumbnail_url}
                        alt={img.object_name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  </td>

                  {/* Object Name & File */}
                  <td className="p-3">
                    <div className="font-sans font-bold text-white text-xs">
                      {img.object_name}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate max-w-[180px]" title={img.file_name}>
                      {img.file_name}
                    </div>
                  </td>

                  {/* Image Type */}
                  <td className="p-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${typeClass}`}>
                      {img.image_type}
                    </span>
                  </td>

                  {/* Exposure */}
                  <td className="p-3 text-blue-400 font-medium">
                    {formatExposure(img.exposure_time)}
                  </td>

                  {/* Temp */}
                  <td className="p-3">
                    {img.sensor_temp !== null ? (
                      <span className={`${img.sensor_temp <= 0 ? 'text-orange-400' : 'text-slate-300'}`}>
                        {img.sensor_temp.toFixed(1)}°C
                      </span>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>

                  {/* Angle */}
                  <td className="p-3 text-purple-300">
                    {img.rotation_angle !== null ? `${img.rotation_angle.toFixed(1)}°` : '0.0°'}
                  </td>

                  {/* Filter */}
                  <td className="p-3">
                    <span className="px-1.5 py-0.5 rounded bg-[#0D1117] text-slate-300 border border-slate-700 text-[10px]">
                      {img.filter_name || 'Clear'}
                    </span>
                  </td>

                  {/* Date */}
                  <td className="p-3 text-slate-400 text-[11px]">
                    <div>{new Date(img.date_obs).toLocaleDateString()}</div>
                    <div className="text-[10px] text-slate-500">
                      {new Date(img.date_obs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  </td>

                  {/* Dimensions */}
                  <td className="p-3 text-slate-400 text-[11px]">
                    {img.width} × {img.height}
                  </td>

                  {/* Equipment */}
                  <td className="p-3 text-slate-400 text-[11px] max-w-[160px] truncate font-sans" title={`${img.telescope} ${img.camera}`}>
                    {img.telescope || img.camera || '-'}
                  </td>

                  {/* Actions */}
                  <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end space-x-1">
                      <button
                        onClick={() => onOpenViewer(img)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 rounded hover:bg-slate-800 transition"
                        title="Inspecciona"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDownloadPreview(img)}
                        className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                        title="Descarrega miniatura"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDeleteImage(img.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition"
                        title="Elimina"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
