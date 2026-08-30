import React from 'react';
import { 
  Eye, 
  Download, 
  Trash2, 
  Thermometer, 
  Compass, 
  Clock, 
  Layers, 
  Telescope
} from 'lucide-react';
import { FitsMetadata } from '../types/fits';

interface ImageGridProps {
  images: FitsMetadata[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onOpenViewer: (image: FitsMetadata) => void;
  onDeleteImage: (id: string) => void;
  onDownloadPreview: (image: FitsMetadata) => void;
  onDownloadFits: (image: FitsMetadata) => void;
}

export const ImageGrid: React.FC<ImageGridProps> = ({
  images,
  selectedIds,
  onToggleSelect,
  onOpenViewer,
  onDeleteImage,
  onDownloadPreview,
}) => {
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
          <p className="text-xs text-slate-400 max-w-sm">
            Prova d'ajustar els filtres de cerca o importa un directori amb fotografies astronòmiques.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      id="fits-image-grid"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4"
    >
      {images.map((img) => {
        const isSelected = selectedIds.includes(img.id);
        const typeClass = getTypeBadgeClass(img.image_type);

        return (
          <div
            key={img.id}
            id={`fits-card-${img.id}`}
            className={`group relative bg-[#161B22] border rounded-lg overflow-hidden transition-all duration-150 flex flex-col hover:border-slate-500 shadow-sm ${
              isSelected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-700/50'
            }`}
          >
            {/* Top Image Preview Box */}
            <div 
              className="relative aspect-[4/3] w-full bg-[#0D1117] overflow-hidden cursor-pointer" 
              onClick={() => onOpenViewer(img)}
            >
              <img
                src={img.thumbnail_url}
                alt={img.object_name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />

              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#161B22] via-transparent to-black/40 opacity-70 group-hover:opacity-40 transition-opacity" />

              {/* Selection Checkbox & Low-res preview pill */}
              <div 
                className="absolute top-2.5 left-2.5 z-10 flex items-center gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(img.id);
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {}}
                  className="w-4 h-4 rounded border-slate-700 bg-[#0D1117] text-blue-600 focus:ring-0 cursor-pointer accent-blue-500"
                />
                <span className="bg-black/70 backdrop-blur-md text-[9px] px-1.5 py-0.5 rounded border border-white/10 uppercase font-mono text-slate-300">
                  {img.bayer_pattern ? `OSC ${img.bayer_pattern}` : 'MONO'}
                </span>
              </div>

              {/* Frame Type Badge */}
              <div className="absolute top-2.5 right-2.5 z-10">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border backdrop-blur-md uppercase tracking-wider font-mono ${typeClass}`}>
                  {img.image_type}
                </span>
              </div>

              {/* Quick View Button on Hover */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[1px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenViewer(img);
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-md transform transition hover:scale-105 flex items-center gap-1.5 text-xs font-medium"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Inspeccionar FITS</span>
                </button>
              </div>

              {/* Bottom strip on image: Dimensions & Filter */}
              <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[10px] text-slate-300 font-mono">
                <span className="bg-black/70 px-1.5 py-0.5 rounded border border-white/10">
                  {img.filter_name || 'Clear'}
                </span>
                <span className="bg-black/70 px-1.5 py-0.5 rounded border border-white/10">
                  {img.width} × {img.height}
                </span>
              </div>
            </div>

            {/* Card Content & Metadata */}
            <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5">
              
              <div>
                {/* Object Name & Category */}
                <div className="flex items-start justify-between gap-1.5">
                  <h3 
                    onClick={() => onOpenViewer(img)}
                    className="font-bold text-white text-xs sm:text-sm truncate hover:text-blue-400 cursor-pointer transition font-sans"
                    title={img.object_name}
                  >
                    {img.object_name}
                  </h3>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#0D1117] text-slate-400 border border-slate-700/80 flex-shrink-0 font-mono">
                    {img.object_category}
                  </span>
                </div>

                {/* File Name */}
                <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5" title={img.file_name}>
                  {img.file_name}
                </p>
              </div>

              {/* Astrophotography Stats Grid */}
              <div className="grid grid-cols-3 gap-1.5 py-2 border-y border-slate-700/40 text-xs">
                
                {/* Exposure */}
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase text-slate-500 tracking-wider flex items-center gap-1 font-mono">
                    <Clock className="w-2.5 h-2.5 text-blue-400" />
                    <span>Exp</span>
                  </span>
                  <span className="font-mono text-blue-400 font-medium text-xs truncate">
                    {formatExposure(img.exposure_time)}
                  </span>
                </div>

                {/* Sensor Temp */}
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase text-slate-500 tracking-wider flex items-center gap-1 font-mono">
                    <Thermometer className="w-2.5 h-2.5 text-orange-400" />
                    <span>Temp</span>
                  </span>
                  <span className="font-mono text-orange-400 font-medium text-xs truncate">
                    {img.sensor_temp !== null ? `${img.sensor_temp.toFixed(1)}°C` : 'N/A'}
                  </span>
                </div>

                {/* Rotation Angle */}
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase text-slate-500 tracking-wider flex items-center gap-1 font-mono">
                    <Compass className="w-2.5 h-2.5 text-purple-400" />
                    <span>Angle</span>
                  </span>
                  <span className="font-mono text-purple-300 font-medium text-xs truncate">
                    {img.rotation_angle !== null ? `${img.rotation_angle.toFixed(1)}°` : '0.0°'}
                  </span>
                </div>

              </div>

              {/* Equipment & Date Info */}
              <div className="text-[10px] text-slate-400 space-y-0.5 font-mono">
                {(img.telescope || img.camera) && (
                  <div className="flex items-center gap-1.5 truncate text-slate-400">
                    <Telescope className="w-3 h-3 text-slate-500 flex-shrink-0" />
                    <span className="truncate">{img.telescope || img.camera}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-slate-500">
                  <span>{new Date(img.date_obs).toLocaleDateString()}</span>
                  <span>{new Date(img.date_obs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} UTC</span>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-700/40">
                <button
                  onClick={() => onOpenViewer(img)}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium transition"
                >
                  <Eye className="w-3 h-3" />
                  <span>Inspecciona</span>
                </button>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => onDownloadPreview(img)}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                    title="Descarrega miniatura (JPG)"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteImage(img.id)}
                    className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition"
                    title="Elimina del catàleg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })}
    </div>
  );
};
