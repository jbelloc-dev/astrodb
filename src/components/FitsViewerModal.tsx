import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Download, 
  Search, 
  Copy, 
  Check, 
  Thermometer, 
  Compass, 
  Clock, 
  Telescope,
  Info,
  Maximize2,
  Minimize2,
  Calendar,
  Layers,
  FileCode,
  Trash2,
  Sparkles,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Move
} from 'lucide-react';
import { FitsMetadata } from '../types/fits';
import { generateFitsPreviewJpeg, applyScnrToDataUrl } from '../utils/thumbnailGenerator';

interface FitsViewerModalProps {
  image: FitsMetadata | null;
  isOpen: boolean;
  onClose: () => void;
  onDownloadPreview: (image: FitsMetadata) => void;
  onDownloadFits: (image: FitsMetadata) => void;
  onDeleteImage?: (id: string) => void;
}

export const FitsViewerModal: React.FC<FitsViewerModalProps> = ({
  image,
  isOpen,
  onClose,
  onDownloadPreview,
  onDownloadFits,
  onDeleteImage,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'metadata' | 'headers'>('preview');
  const [headerSearch, setHeaderSearch] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // SCNR Green reduction options
  const [scnrEnabled, setScnrEnabled] = useState<boolean>(false);
  const [scnrAmount, setScnrAmount] = useState<number>(1.0);
  const [scnrMethod, setScnrMethod] = useState<'max' | 'avg'>('max');
  const [processedPreview, setProcessedPreview] = useState<string>('');

  // Pan and Zoom states: zoomLevel 0 means "Fit to Viewport", >0 means explicit scale factor (e.g. 1.0 = 100%)
  const [zoomLevel, setZoomLevel] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const startPanRef = useRef<{ startX: number; startY: number; initPanX: number; initPanY: number }>({
    startX: 0,
    startY: 0,
    initPanX: 0,
    initPanY: 0
  });

  const viewportRef = useRef<HTMLDivElement>(null);

  // Reset zoom & pan when image or tab changes
  useEffect(() => {
    setZoomLevel(0);
    setPan({ x: 0, y: 0 });
  }, [image?.id, activeTab]);

  // Update preview when image or SCNR settings change
  useEffect(() => {
    if (!image) {
      setProcessedPreview('');
      return;
    }

    let isMounted = true;

    async function computePreview() {
      if (!image) return;

      // If we have raw pixel data in memory, regenerate directly with ultra high-res 3840px
      if (image.pixelData && image.width && image.height) {
        const url = generateFitsPreviewJpeg(image.pixelData, image.width, image.height, {
          maxDimension: 3840,
          bayerPattern: image.bayer_pattern,
          quality: 0.95,
          enableScnr: scnrEnabled,
          scnrAmount: scnrAmount,
          scnrMethod: scnrMethod
        });
        if (isMounted) setProcessedPreview(url);
      } else if (image.thumbnail_url) {
        // If image comes from persistent storage, apply SCNR dynamically on the canvas DataURL
        if (scnrEnabled && scnrAmount > 0) {
          const url = await applyScnrToDataUrl(image.thumbnail_url, scnrAmount, scnrMethod);
          if (isMounted) setProcessedPreview(url);
        } else {
          if (isMounted) setProcessedPreview(image.thumbnail_url);
        }
      }
    }

    computePreview();

    return () => {
      isMounted = false;
    };
  }, [image, scnrEnabled, scnrAmount, scnrMethod]);

  if (!isOpen || !image) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Mouse wheel zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    if (activeTab !== 'preview') return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setZoomLevel((prev) => {
      const current = prev === 0 ? 1 : prev;
      const next = Math.min(6.0, Math.max(0.3, current + delta));
      return parseFloat(next.toFixed(2));
    });
  };

  // Mouse drag pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTab !== 'preview' || zoomLevel === 0) return;
    setIsPanning(true);
    startPanRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initPanX: pan.x,
      initPanY: pan.y
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || zoomLevel === 0) return;
    const dx = e.clientX - startPanRef.current.startX;
    const dy = e.clientY - startPanRef.current.startY;
    setPan({
      x: startPanRef.current.initPanX + dx,
      y: startPanRef.current.initPanY + dy
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Double click: toggle between Fit (0) and 100% (1.0)
  const handleDoubleClick = () => {
    if (zoomLevel === 0) {
      setZoomLevel(1.0);
    } else {
      setZoomLevel(0);
      setPan({ x: 0, y: 0 });
    }
  };

  const headersList = Object.entries(image.headers_json || {}).filter(([k, v]) => {
    if (!headerSearch) return true;
    const term = headerSearch.toLowerCase();
    return k.toLowerCase().includes(term) || String(v).toLowerCase().includes(term);
  });

  const displayUrl = processedPreview || image.thumbnail_url;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md transition-all duration-200 ${
      isFullscreen ? 'p-0' : 'p-2 sm:p-4 md:p-6'
    }`}>
      <div 
        className={`bg-slate-900 border border-slate-700/80 shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isFullscreen 
            ? 'w-screen h-screen rounded-none border-none' 
            : 'w-[98vw] max-w-[1920px] h-[95vh] max-h-[95vh] rounded-2xl'
        }`}
      >
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
              <Telescope className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-slate-100 truncate">
                  {image.object_name || 'Imatge FITS'}
                </h3>
                <span className="px-2 py-0.5 text-xs font-mono font-medium rounded-full bg-blue-950/80 text-blue-300 border border-blue-800/60">
                  {image.image_type}
                </span>
                {image.bayer_pattern ? (
                  <span className="px-2 py-0.5 text-xs font-mono font-medium rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                    CFA {image.bayer_pattern} (OSC Color)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-mono font-medium rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Monocrom
                  </span>
                )}
                <span className="text-xs text-slate-400 font-mono hidden md:inline">
                  {image.width} × {image.height} px
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono truncate">{image.file_name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`p-2 rounded-lg border transition-colors ${
                isFullscreen
                  ? 'bg-blue-600/30 text-blue-300 border-blue-500/50 hover:bg-blue-600/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title={isFullscreen ? 'Sortir de pantalla completa' : 'Pantalla completa (Ocupar tot el monitor)'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={() => {
                if (displayUrl) {
                  const link = document.createElement('a');
                  link.href = displayUrl;
                  link.download = `${image.file_name.replace(/\.[^/.]+$/, '')}_preview${scnrEnabled ? '_scnr' : ''}.jpg`;
                  link.click();
                } else {
                  onDownloadPreview(image);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
              title="Descarregar imatge JPEG fidel en alta resolució"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Baixar JPEG</span>
            </button>

            <button
              onClick={() => onDownloadFits(image)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
              title="Descarregar fitxer FITS original"
            >
              <FileCode className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Baixar FITS</span>
            </button>

            {onDeleteImage && (
              <button
                onClick={() => onDeleteImage(image.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 rounded-lg transition-colors"
                title="Eliminar del catàleg"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">Eliminar</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors ml-1"
              title="Tancar visor"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Navigation Tabs & Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 border-b border-slate-800 bg-slate-900/95 text-sm shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-2 px-4 py-2.5 border-b-2 font-medium transition-colors ${
                activeTab === 'preview'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Maximize2 className="w-4 h-4" />
              <span>Representació Gran ({image.width} × {image.height})</span>
            </button>
            <button
              onClick={() => setActiveTab('metadata')}
              className={`flex items-center gap-2 px-4 py-2.5 border-b-2 font-medium transition-colors ${
                activeTab === 'metadata'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Info className="w-4 h-4" />
              <span>Dades de Captura</span>
            </button>
            <button
              onClick={() => setActiveTab('headers')}
              className={`flex items-center gap-2 px-4 py-2.5 border-b-2 font-medium transition-colors ${
                activeTab === 'headers'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode className="w-4 h-4" />
              <span>Capçaleres FITS ({Object.keys(image.headers_json || {}).length})</span>
            </button>
          </div>

          {/* SCNR and Zoom Controls Toolbar (visible on preview tab) */}
          {activeTab === 'preview' && (
            <div className="flex flex-wrap items-center gap-2 py-1.5">
              
              {/* SCNR Green Removal Toggle */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setScnrEnabled(!scnrEnabled)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border transition-all ${
                    scnrEnabled
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                  title="Elimina el to verdós no físic produït pels sensors Bayer RGGB"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${scnrEnabled ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span>SCNR Verd: {scnrEnabled ? 'ACTIU' : 'DESACTIVAT'}</span>
                </button>

                {scnrEnabled && (
                  <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px] font-mono">
                    <button
                      onClick={() => setScnrAmount(0.5)}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        scnrAmount === 0.5 ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      50%
                    </button>
                    <button
                      onClick={() => setScnrAmount(0.75)}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        scnrAmount === 0.75 ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      75%
                    </button>
                    <button
                      onClick={() => setScnrAmount(1.0)}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        scnrAmount === 1.0 ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      100%
                    </button>
                  </div>
                )}
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
                <button
                  onClick={() => setZoomLevel((prev) => Math.max(0.3, (prev === 0 ? 1 : prev) - 0.25))}
                  className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
                  title="Allunyar (Zoom Out)"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => {
                    setZoomLevel(0);
                    setPan({ x: 0, y: 0 });
                  }}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    zoomLevel === 0 ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Ajustar a la finestra completa"
                >
                  Ajustar
                </button>

                <button
                  onClick={() => {
                    setZoomLevel(1.0);
                    setPan({ x: 0, y: 0 });
                  }}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    zoomLevel === 1.0 ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Resolució Real 1:1 (100%)"
                >
                  100%
                </button>

                <button
                  onClick={() => {
                    setZoomLevel(2.0);
                    setPan({ x: 0, y: 0 });
                  }}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    zoomLevel === 2.0 ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Zoom 200%"
                >
                  200%
                </button>

                <button
                  onClick={() => setZoomLevel((prev) => Math.min(6.0, (prev === 0 ? 1 : prev) + 0.25))}
                  className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
                  title="Apropar (Zoom In)"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                {zoomLevel !== 0 && (
                  <button
                    onClick={() => {
                      setZoomLevel(0);
                      setPan({ x: 0, y: 0 });
                    }}
                    className="p-1 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded transition-colors"
                    title="Restablir posició i zoom"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}

                <span className="px-1 text-[11px] text-slate-400">
                  {zoomLevel === 0 ? 'Auto' : `${Math.round(zoomLevel * 100)}%`}
                </span>
              </div>

            </div>
          )}
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-950/60 p-2 sm:p-4 overflow-hidden">
          
          {/* 1. High-Resolution Expansive Preview Tab */}
          {activeTab === 'preview' && (
            <div className="flex-1 flex flex-col w-full h-full min-h-0">
              
              {/* Primary Large Viewport */}
              <div 
                ref={viewportRef}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onDoubleClick={handleDoubleClick}
                className={`flex-1 w-full h-full min-h-0 relative overflow-hidden bg-black rounded-xl border border-slate-800 flex items-center justify-center select-none ${
                  zoomLevel > 0 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
                }`}
              >
                {displayUrl ? (
                  <div 
                    className="w-full h-full flex items-center justify-center"
                    style={
                      zoomLevel > 0
                        ? {
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
                            transformOrigin: 'center center',
                            transition: isPanning ? 'none' : 'transform 0.1s ease-out'
                          }
                        : undefined
                    }
                  >
                    <img
                      src={displayUrl}
                      alt={image.object_name}
                      draggable={false}
                      className={`select-none pointer-events-none rounded transition-all duration-150 ${
                        zoomLevel === 0
                          ? 'max-w-full max-h-full w-auto h-auto object-contain'
                          : 'max-w-none max-h-none object-none'
                      }`}
                    />
                  </div>
                ) : (
                  <div className="p-12 text-center text-slate-400">
                    No hi ha representació JPEG disponible per a aquesta imatge
                  </div>
                )}

                {/* Floating Navigation & Zoom Hint */}
                <div className="absolute bottom-3 right-3 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2 pointer-events-none shadow-lg">
                  <Move className="w-3 h-3 text-blue-400" />
                  <span>Roda ratolí: Zoom | Arrossega: Desplaçar | Doble clic: Alternar</span>
                </div>
              </div>
              
              {/* Image Details Bar */}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-400 font-mono shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-slate-900 px-2.5 py-1 rounded border border-slate-800 text-slate-200">
                    Resolució nativa: <strong className="text-white">{image.width} × {image.height} px</strong>
                  </span>
                  <span className="bg-slate-900 px-2.5 py-1 rounded border border-slate-800 text-slate-200">
                    Profunditat: <strong className="text-white">{image.bitpix}-bit</strong>
                  </span>
                  {image.bayer_pattern && (
                    <span className="bg-emerald-950/80 text-emerald-300 px-2.5 py-1 rounded border border-emerald-800/60">
                      Sensor CFA: <strong>{image.bayer_pattern}</strong>
                    </span>
                  )}
                  {scnrEnabled && (
                    <span className="bg-emerald-900/50 text-emerald-300 px-2.5 py-1 rounded border border-emerald-700/60">
                      SCNR Verd: <strong>{Math.round(scnrAmount * 100)}%</strong>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="bg-slate-900 px-2.5 py-1 rounded border border-slate-800 text-slate-300">
                    Exposició: <strong className="text-emerald-400">{image.exposure_time}s</strong>
                  </span>
                  <span className="bg-slate-900 px-2.5 py-1 rounded border border-slate-800 text-slate-300">
                    Filtre: <strong className="text-cyan-400">{image.filter_name || 'Sense filtre'}</strong>
                  </span>
                </div>
              </div>

            </div>
          )}

          {/* 2. Metadata Tab */}
          {activeTab === 'metadata' && (
            <div className="flex-1 overflow-y-auto p-2">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                
                {/* Target & Frame Info */}
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-slate-200 font-medium text-sm border-b border-slate-800 pb-2">
                    <Info className="w-4 h-4 text-blue-400" />
                    <span>Objecte i Frame</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Nom Objecte:</span>
                      <span className="font-semibold text-slate-200">{image.object_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Categoria:</span>
                      <span className="text-slate-300">{image.object_category}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Tipus de Frame:</span>
                      <span className="font-mono text-blue-400">{image.image_type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Coordenades RA / Dec:</span>
                      <span className="font-mono text-slate-300">{image.ra || '-'} / {image.dec || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Exposure & Timing */}
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-slate-200 font-medium text-sm border-b border-slate-800 pb-2">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <span>Exposició i Temps</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Temps d'Exposició:</span>
                      <span className="font-semibold text-emerald-400">{image.exposure_time} s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Data Observació:</span>
                      <span className="font-mono text-slate-300">{image.date_obs || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Massa d'Aire (Airmass):</span>
                      <span className="font-mono text-slate-300">{image.airmass ?? '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Sensor & Camera */}
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-slate-200 font-medium text-sm border-b border-slate-800 pb-2">
                    <Thermometer className="w-4 h-4 text-amber-400" />
                    <span>Sensor i Càmera</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Càmera:</span>
                      <span className="font-semibold text-slate-200">{image.camera || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Temperatura Sensor:</span>
                      <span className="font-mono text-amber-400">{image.sensor_temp !== undefined ? `${image.sensor_temp} °C` : '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Guany (Gain):</span>
                      <span className="font-mono text-slate-300">{image.gain ?? '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Matriu Bayer (CFA):</span>
                      <span className="font-mono text-emerald-400">{image.bayer_pattern || 'Monocrom'}</span>
                    </div>
                  </div>
                </div>

                {/* Optics & Telescope */}
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-slate-200 font-medium text-sm border-b border-slate-800 pb-2">
                    <Telescope className="w-4 h-4 text-purple-400" />
                    <span>Òptica i Telescopi</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Telescopi:</span>
                      <span className="font-semibold text-slate-200">{image.telescope || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Distància Focal:</span>
                      <span className="font-mono text-purple-400">{image.focal_length ? `${image.focal_length} mm` : '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Angle Rotació:</span>
                      <span className="font-mono text-slate-300">{image.rotation_angle !== undefined ? `${image.rotation_angle} °` : '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Filter */}
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-slate-200 font-medium text-sm border-b border-slate-800 pb-2">
                    <Layers className="w-4 h-4 text-cyan-400" />
                    <span>Filtre i Òptica Auxiliar</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Filtre:</span>
                      <span className="font-semibold text-cyan-400">{image.filter_name || 'Sense filtre'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Etiquetes:</span>
                      <span className="text-slate-300">{image.custom_tags || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* File Info */}
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-slate-200 font-medium text-sm border-b border-slate-800 pb-2">
                    <FileCode className="w-4 h-4 text-indigo-400" />
                    <span>Fitxer i Camí</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Mida:</span>
                      <span className="font-mono text-slate-300">{(image.file_size / (1024 * 1024)).toFixed(2)} MB</span>
                    </div>
                    <div className="text-slate-400 break-all font-mono text-[11px] bg-slate-950/60 p-2 rounded border border-slate-800">
                      {image.file_path}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* 3. Headers Tab */}
          {activeTab === 'headers' && (
            <div className="flex-1 flex flex-col min-h-0 space-y-3 p-2">
              <div className="relative shrink-0">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cercar clau o valor FITS (e.g. EXPTIME, GAIN, DATE-OBS, INSTRUME)..."
                  value={headerSearch}
                  onChange={(e) => setHeaderSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-900/90 border border-slate-700/80 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex-1 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60 overflow-y-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold w-1/3">Clau (Key)</th>
                      <th className="px-4 py-2.5 font-semibold w-1/2">Valor (Value)</th>
                      <th className="px-4 py-2.5 font-semibold text-right w-1/6">Acció</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {headersList.map(([key, value]) => (
                      <tr key={key} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-2 text-blue-400 font-bold">{key}</td>
                        <td className="px-4 py-2 text-slate-200 break-all">{String(value)}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => handleCopy(`${key} = ${value}`, key)}
                            className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
                            title="Copiar capçalera"
                          >
                            {copiedKey === key ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {headersList.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                          No s'ha trobat cap capçalera FITS coincident
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
