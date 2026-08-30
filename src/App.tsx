import React, { useState, useEffect, useMemo } from 'react';
import { 
  FolderSearch, 
  Sparkles, 
  Database, 
  Download, 
  Trash2, 
  SlidersHorizontal, 
  Layers, 
  Clock, 
  Thermometer, 
  Compass, 
  Telescope,
  CheckSquare,
  Square,
  AlertCircle
} from 'lucide-react';
import { FitsMetadata, FitsFilterState, AstroStats } from './types/fits';
import { FitsParser } from './utils/fitsParser';
import { generateSampleAstroLibrary } from './utils/sampleData';
import { SqlStorage } from './utils/sqlStorage';
import { useDebouncedValue } from './utils/useDebouncedValue';

import { Header } from './components/Header';
import { FilterSidebar } from './components/FilterSidebar';
import { ImageGrid } from './components/ImageGrid';
import { ImageTable } from './components/ImageTable';
import { DirectoryScanner } from './components/DirectoryScanner';
import { FitsViewerModal } from './components/FitsViewerModal';
import { SqlConsoleModal } from './components/SqlConsoleModal';
import { ExportModal } from './components/ExportModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { StatsDashboard } from './components/StatsDashboard';

const DEFAULT_FILTERS: FitsFilterState = {
  search: '',
  image_type: 'ALL',
  filter_name: 'ALL',
  object_name: 'ALL',
  min_exposure: 0,
  max_exposure: 3600,
  min_temp: -30,
  max_temp: 35,
  min_angle: 0,
  max_angle: 360,
  date_from: '',
  date_to: '',
  sortBy: 'date_obs',
  sortOrder: 'desc'
};

export default function App() {
  const [images, setImages] = useState<FitsMetadata[]>([]);
  const [filters, setFilters] = useState<FitsFilterState>(DEFAULT_FILTERS);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [stats, setStats] = useState<AstroStats | null>(null);
  const [visibleCount, setVisibleCount] = useState(200);

  // Modals state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSqlConsoleOpen, setIsSqlConsoleOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [isFilterSidebarOpen, setIsFilterSidebarOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<FitsMetadata | null>(null);
  const [isLoadingSamples, setIsLoadingSamples] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Delete Confirmation State
  const [deleteTarget, setDeleteTarget] = useState<{
    isOpen: boolean;
    ids: string[];
    count: number;
    fileName?: string;
    isDeleting?: boolean;
  }>({
    isOpen: false,
    ids: [],
    count: 0,
  });

  // Initialize DB & Load Existing Catalog
  useEffect(() => {
    async function initApp() {
      await SqlStorage.init();
      await refreshData();
      setIsInitialLoading(false);
    }
    initApp();
  }, []);

  const refreshData = async () => {
    const fetched = await SqlStorage.fetchImages();
    setImages(fetched);
    const newStats = await SqlStorage.getStats();
    if (newStats) setStats(newStats);
  };

  // Load sample astronomical session
  const handleLoadSamples = async () => {
    setIsLoadingSamples(true);
    const sampleBatch = generateSampleAstroLibrary();
    await SqlStorage.saveImagesBatch(sampleBatch);
    await refreshData();
    setIsLoadingSamples(false);
  };

  // Scan folder / batch upload complete handler
  const handleScanComplete = async (newImages: FitsMetadata[]) => {
    if (newImages && newImages.length > 0) {
      setImages(prev => {
        const idSet = new Set(prev.map(p => p.id));
        const added = newImages.filter(n => !idSet.has(n.id));
        return [...added, ...prev];
      });
    }
    await refreshData();
  };

  // Request Delete Single Image (triggers confirmation prompt)
  const handleDeleteImage = (id: string) => {
    const img = images.find(i => i.id === id);
    setDeleteTarget({
      isOpen: true,
      ids: [id],
      count: 1,
      fileName: img?.file_name || undefined,
      isDeleting: false,
    });
  };

  // Request Delete Selected Batch (triggers confirmation prompt)
  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    setDeleteTarget({
      isOpen: true,
      ids: [...selectedIds],
      count: selectedIds.length,
      isDeleting: false,
    });
  };

  // Confirm and execute deletion
  const handleConfirmDelete = async () => {
    if (deleteTarget.ids.length === 0) return;
    setDeleteTarget(prev => ({ ...prev, isDeleting: true }));

    const idsToDelete = deleteTarget.ids;
    for (const id of idsToDelete) {
      await SqlStorage.deleteImage(id);
    }

    setImages(prev => prev.filter(img => !idsToDelete.includes(img.id)));
    setSelectedIds(prev => prev.filter(id => !idsToDelete.includes(id)));

    // If modal image was deleted, close viewer
    if (selectedImage && idsToDelete.includes(selectedImage.id)) {
      setSelectedImage(null);
    }

    const newStats = await SqlStorage.getStats();
    if (newStats) setStats(newStats);

    setDeleteTarget({
      isOpen: false,
      ids: [],
      count: 0,
      isDeleting: false,
    });
  };

  // Request Clear all images (triggers confirmation prompt)
  const handleClearAll = () => {
    if (images.length === 0) return;
    setDeleteTarget({
      isOpen: true,
      ids: images.map(i => i.id),
      count: images.length,
      isDeleting: false,
    });
  };

  // Download low-res thumbnail directly
  const handleDownloadPreview = (image: FitsMetadata) => {
    if (!image.thumbnail_url) return;
    const a = document.createElement('a');
    a.href = image.thumbnail_url;
    const cleanName = image.file_name.replace(/\.(fits|fit|fts)$/i, '');
    a.download = `${cleanName}_preview.jpg`;
    a.click();
  };

  // Download raw FITS if blob is present or metadata JSON
  const handleDownloadFits = (image: FitsMetadata) => {
    if (image.rawBlob) {
      const url = URL.createObjectURL(image.rawBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = image.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      SqlStorage.exportToJson([image], `${image.file_name}_metadata.json`);
    }
  };

  // Debounce the search term used for the (potentially expensive) filter
  // pass, while the search inputs themselves stay bound to `filters.search`
  // directly so typing feels instant regardless of catalog size.
  const debouncedSearch = useDebouncedValue(filters.search, 150);

  // Filter & Search computation
  const filteredImages = useMemo(() => {
    return images.filter(img => {
      // Search
      if (debouncedSearch) {
        const term = debouncedSearch.toLowerCase();
        const matchesName = img.object_name.toLowerCase().includes(term);
        const matchesFile = img.file_name.toLowerCase().includes(term);
        const matchesTelescope = (img.telescope || '').toLowerCase().includes(term);
        const matchesCamera = (img.camera || '').toLowerCase().includes(term);
        const matchesTags = (img.custom_tags || '').toLowerCase().includes(term);
        if (!matchesName && !matchesFile && !matchesTelescope && !matchesCamera && !matchesTags) {
          return false;
        }
      }

      // Frame Type
      if (filters.image_type !== 'ALL') {
        if (img.image_type.toUpperCase() !== filters.image_type.toUpperCase()) {
          return false;
        }
      }

      // Optical Filter
      if (filters.filter_name !== 'ALL') {
        if ((img.filter_name || '').toUpperCase() !== filters.filter_name.toUpperCase()) {
          return false;
        }
      }

      // Object Name
      if (filters.object_name !== 'ALL') {
        if (img.object_name !== filters.object_name) {
          return false;
        }
      }

      // Exposure time
      if (img.exposure_time < filters.min_exposure || img.exposure_time > filters.max_exposure) {
        return false;
      }

      // Sensor Temp
      if (img.sensor_temp !== null) {
        if (img.sensor_temp > filters.max_temp || img.sensor_temp < filters.min_temp) {
          return false;
        }
      }

      // Rotation Angle
      if (img.rotation_angle !== null) {
        if (img.rotation_angle < filters.min_angle || img.rotation_angle > filters.max_angle) {
          return false;
        }
      }

      // Date range (compares the YYYY-MM-DD prefix, so this stays correct
      // regardless of the time-of-day or timezone suffix in date_obs)
      if (filters.date_from || filters.date_to) {
        const obsDate = (img.date_obs || '').slice(0, 10);
        if (filters.date_from && obsDate < filters.date_from) return false;
        if (filters.date_to && obsDate > filters.date_to) return false;
      }

      return true;
    }).sort((a, b) => {
      let valA: any = a[filters.sortBy];
      let valB: any = b[filters.sortBy];

      if (valA === null || valA === undefined) valA = '';
      if (valB === null || valB === undefined) valB = '';

      if (typeof valA === 'string') {
        return filters.sortOrder === 'asc' 
          ? valA.localeCompare(String(valB)) 
          : String(valB).localeCompare(valA);
      }

      return filters.sortOrder === 'asc' ? valA - valB : valB - valA;
    });
    // Deliberately depends on the individual fields (not the whole `filters`
    // object) and on `debouncedSearch` rather than `filters.search`, so
    // typing in the search box doesn't force this to recompute on every
    // keystroke — only once the debounce settles.
  }, [
    images,
    debouncedSearch,
    filters.image_type,
    filters.filter_name,
    filters.object_name,
    filters.min_exposure,
    filters.max_exposure,
    filters.min_temp,
    filters.max_temp,
    filters.min_angle,
    filters.max_angle,
    filters.date_from,
    filters.date_to,
    filters.sortBy,
    filters.sortOrder
  ]);

  // Cap the number of cards/rows actually mounted in the DOM at once. Even
  // with the backend fixed, a catalog of several thousand frames rendered as
  // one giant grid of full-size inline images would still make the browser
  // tab sluggish (or crash on low-memory machines) — "Carrega'n més" keeps
  // this responsive regardless of catalog size.
  const PAGE_SIZE = 200;
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filters, viewMode]);
  const visibleImages = useMemo(
    () => filteredImages.slice(0, visibleCount),
    [filteredImages, visibleCount]
  );

  // Dynamically compute statistics for filtered images
  const filteredStats: AstroStats = useMemo(() => {
    if (filteredImages.length === 0) {
      return {
        overview: {
          total_images: 0,
          total_exposure_sec: 0,
          distinct_objects: 0,
          distinct_filters: 0,
          avg_temp: null,
        },
        typeBreakdown: [],
        objectBreakdown: [],
        filterBreakdown: [],
      };
    }

    let totalExp = 0;
    let tempSum = 0;
    let tempCount = 0;
    const objectSet = new Set<string>();
    const filterSet = new Set<string>();
    const typeMap = new Map<string, { count: number; total_exp: number }>();
    const objectMap = new Map<string, { count: number; total_exp: number }>();
    const filterMap = new Map<string, { count: number; total_exp: number }>();

    for (const img of filteredImages) {
      const exp = img.exposure_time || 0;
      totalExp += exp;

      if (img.sensor_temp !== null && img.sensor_temp !== undefined && !isNaN(img.sensor_temp)) {
        tempSum += img.sensor_temp;
        tempCount++;
      }

      if (img.object_name && img.object_name !== 'Desconegut') {
        objectSet.add(img.object_name);
        const cur = objectMap.get(img.object_name) || { count: 0, total_exp: 0 };
        objectMap.set(img.object_name, { count: cur.count + 1, total_exp: cur.total_exp + exp });
      }

      if (img.filter_name && img.filter_name !== 'Sense filtre') {
        filterSet.add(img.filter_name);
        const cur = filterMap.get(img.filter_name) || { count: 0, total_exp: 0 };
        filterMap.set(img.filter_name, { count: cur.count + 1, total_exp: cur.total_exp + exp });
      }

      const typeKey = (img.image_type || 'LIGHT').toUpperCase();
      const curType = typeMap.get(typeKey) || { count: 0, total_exp: 0 };
      typeMap.set(typeKey, { count: curType.count + 1, total_exp: curType.total_exp + exp });
    }

    const typeBreakdown = Array.from(typeMap.entries()).map(([image_type, data]) => ({
      image_type,
      count: data.count,
      total_exp: data.total_exp,
    }));

    const objectBreakdown = Array.from(objectMap.entries()).map(([object_name, data]) => ({
      object_name,
      count: data.count,
      total_exp: data.total_exp,
    }));

    const filterBreakdown = Array.from(filterMap.entries()).map(([filter_name, data]) => ({
      filter_name,
      count: data.count,
      total_exp: data.total_exp,
    }));

    return {
      overview: {
        total_images: filteredImages.length,
        total_exposure_sec: totalExp,
        distinct_objects: objectSet.size,
        distinct_filters: filterSet.size,
        avg_temp: tempCount > 0 ? tempSum / tempCount : null,
      },
      typeBreakdown,
      objectBreakdown,
      filterBreakdown,
    };
  }, [filteredImages]);

  // Check if any filter is currently applied. Compared directly against
  // DEFAULT_FILTERS (rather than hardcoded duplicate thresholds) so this
  // can never drift out of sync with the actual defaults again.
  const isFiltered = useMemo(() => {
    return (Object.keys(DEFAULT_FILTERS) as (keyof FitsFilterState)[]).some(key => {
      if (key === 'sortBy' || key === 'sortOrder') return false;
      return filters[key] !== DEFAULT_FILTERS[key];
    });
  }, [filters]);

  // Extract distinct objects & filters for dropdowns
  const availableObjects = useMemo(() => {
    const set = new Set<string>();
    images.forEach(i => {
      if (i.object_name && i.object_name !== 'Desconegut') set.add(i.object_name);
    });
    return Array.from(set).sort();
  }, [images]);

  const availableFilters = useMemo(() => {
    const set = new Set<string>();
    images.forEach(i => {
      if (i.filter_name) set.add(i.filter_name);
    });
    return Array.from(set).sort();
  }, [images]);

  // Selection helpers
  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedIds(filteredImages.map(i => i.id));
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col font-sans selection:bg-blue-600/30 selection:text-blue-200">
      
      {/* Top Astronomy Header (with live dynamic filtered statistics) */}
      <Header
        stats={filteredStats}
        globalStats={stats}
        totalImagesCount={images.length}
        filteredCount={filteredImages.length}
        isFiltered={isFiltered}
        onResetFilters={() => setFilters(DEFAULT_FILTERS)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenScanner={() => setIsScannerOpen(true)}
        onLoadSamples={handleLoadSamples}
        onOpenSqlConsole={() => setIsSqlConsoleOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenStats={() => setIsStatsOpen(true)}
        isLoadingSamples={isLoadingSamples}
        searchQuery={filters.search}
        onSearchChange={(q) => setFilters(prev => ({ ...prev, search: q }))}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 flex flex-col lg:flex-row gap-5">
        
        {/* Left Filter Sidebar (Shown only when toggled on by user) */}
        {images.length > 0 && isFilterSidebarOpen && (
          <FilterSidebar
            filters={filters}
            onFilterChange={setFilters}
            onResetFilters={() => setFilters(DEFAULT_FILTERS)}
            availableObjects={availableObjects}
            availableFilters={availableFilters}
            isOpenMobile={isMobileFilterOpen}
            onCloseMobile={() => setIsMobileFilterOpen(false)}
            onCloseDesktop={() => setIsFilterSidebarOpen(false)}
            totalFiltered={filteredImages.length}
            totalAll={images.length}
          />
        )}

        {/* Mobile Drawer (Always available if triggered on mobile) */}
        {images.length > 0 && !isFilterSidebarOpen && isMobileFilterOpen && (
          <FilterSidebar
            filters={filters}
            onFilterChange={setFilters}
            onResetFilters={() => setFilters(DEFAULT_FILTERS)}
            availableObjects={availableObjects}
            availableFilters={availableFilters}
            isOpenMobile={isMobileFilterOpen}
            onCloseMobile={() => setIsMobileFilterOpen(false)}
            totalFiltered={filteredImages.length}
            totalAll={images.length}
          />
        )}

        {/* Center / Right Catalogue Area */}
        <div className="flex-1 flex flex-col space-y-3.5 min-w-0">
          
          {/* Action Bar (Search & Filter toggle button, Batch actions) */}
          {images.length > 0 && (
            <div className="bg-[#161B22] border border-slate-700/50 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2.5 shadow-sm">
              
              <div className="flex items-center space-x-2">
                {/* Filter Toggle Button */}
                <button
                  id="btn-toggle-filters"
                  onClick={() => {
                    if (window.innerWidth < 1024) {
                      setIsMobileFilterOpen(true);
                    } else {
                      setIsFilterSidebarOpen(prev => !prev);
                    }
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition flex items-center gap-1.5 ${
                    isFilterSidebarOpen
                      ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                      : isFiltered
                        ? 'bg-blue-950/60 border-blue-600/80 text-blue-300'
                        : 'bg-[#0D1117] hover:bg-slate-800 text-slate-200 border-slate-700'
                  }`}
                  title={isFilterSidebarOpen ? 'Amagar panell de filtres' : 'Mostrar filtres de metadades'}
                >
                  <SlidersHorizontal className={`w-3.5 h-3.5 ${isFilterSidebarOpen ? 'text-white' : 'text-blue-400'}`} />
                  <span>{isFilterSidebarOpen ? 'Amagar Filtres' : 'Filtres de Metadades'}</span>
                  {isFiltered && (
                    <span className="px-1.5 py-0.2 text-[10px] font-bold bg-blue-500 text-white rounded-full">
                      {filteredImages.length}
                    </span>
                  )}
                </button>

                {/* Batch Select Controls */}
                <button
                  onClick={selectedIds.length === filteredImages.length ? handleClearSelection : handleSelectAll}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 px-2 py-1 rounded hover:bg-slate-800 transition"
                >
                  {selectedIds.length > 0 && selectedIds.length === filteredImages.length ? (
                    <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  <span>{selectedIds.length > 0 ? `Seleccionades (${selectedIds.length})` : 'Seleccionar totes'}</span>
                </button>
              </div>

              {/* Batch Actions */}
              {selectedIds.length > 0 && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      const selectedSubset = images.filter(i => selectedIds.includes(i.id));
                      SqlStorage.exportToCsv(selectedSubset, `fits_selected_${Date.now()}.csv`);
                    }}
                    className="px-2.5 py-1 bg-[#0D1117] hover:bg-slate-800 text-slate-300 text-xs font-medium rounded border border-slate-700 transition flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5 text-green-400" />
                    <span>CSV Seleccionades</span>
                  </button>
                  <button
                    onClick={handleDeleteSelected}
                    className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 text-xs font-medium rounded border border-rose-800/60 transition flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Eliminar ({selectedIds.length})</span>
                  </button>
                </div>
              )}

              {/* Clear all database */}
              {selectedIds.length === 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-[11px] text-slate-500 hover:text-rose-400 transition ml-auto"
                >
                  Buidar tot el catàleg
                </button>
              )}
            </div>
          )}

          {/* Empty Catalog Welcome Hero */}
          {images.length === 0 && !isInitialLoading && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 bg-[#161B22] border border-slate-700/50 rounded-xl text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-xl">
                <Telescope className="w-8 h-8" />
              </div>

              <div className="max-w-md space-y-2">
                <h2 className="text-xl font-bold text-white tracking-tight font-sans">
                  Catàleg FITS d'Astrofotografia
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Escaneja una carpeta del teu ordinador per extreure automàticament les metadades de les teves fotos astronòmiques (Objecte, Exposició, Angle, Data, Temperatura del sensor) i guardar-les a la base de dades SQL.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  id="btn-hero-scan"
                  onClick={() => setIsScannerOpen(true)}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition active:scale-95 flex items-center gap-2"
                >
                  <FolderSearch className="w-4 h-4" />
                  <span>Escanejar Directori FITS</span>
                </button>

                <button
                  id="btn-hero-samples"
                  onClick={handleLoadSamples}
                  disabled={isLoadingSamples}
                  className="px-4 py-2.5 bg-[#0D1117] hover:bg-slate-800 text-slate-200 text-xs sm:text-sm font-medium border border-slate-700 rounded-lg transition active:scale-95 flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span>{isLoadingSamples ? 'Carregant...' : 'Carregar Sessió de Mostra'}</span>
                </button>
              </div>

              {/* Quick Feature Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 border-t border-slate-700/50 w-full max-w-xl text-left">
                <div className="p-3 bg-[#0D1117] border border-slate-700/50 rounded-lg space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-blue-400 font-semibold">
                    <Compass className="w-3.5 h-3.5" />
                    <span>Angle & Rotació</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Extracció del framing angle (ROTATANG / POSANGLE)</p>
                </div>
                <div className="p-3 bg-[#0D1117] border border-slate-700/50 rounded-lg space-y-1">
                  <div className="flex items-center gap-1.5 text-blue-400 font-semibold text-xs">
                    <Thermometer className="w-3.5 h-3.5" />
                    <span>Temp. Sensor</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Classificació per temperatura (CCD-TEMP)</p>
                </div>
                <div className="p-3 bg-[#0D1117] border border-slate-700/50 rounded-lg space-y-1">
                  <div className="flex items-center gap-1.5 text-blue-400 font-semibold text-xs">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Temps d'Exposició</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Detecció automàtica de Lights, Darks, Flats i Biases</p>
                </div>
                <div className="p-3 bg-[#0D1117] border border-slate-700/50 rounded-lg space-y-1">
                  <div className="flex items-center gap-1.5 text-blue-400 font-semibold text-xs">
                    <Database className="w-3.5 h-3.5" />
                    <span>Base de Dades SQL</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Consultes relacionals, exportació SQLite & CSV</p>
                </div>
              </div>

            </div>
          )}

          {/* Catalog Views (Grid vs Table) */}
          {images.length > 0 && viewMode === 'grid' && (
            <ImageGrid
              images={visibleImages}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onSelectAll={handleSelectAll}
              onClearSelection={handleClearSelection}
              onOpenViewer={(img) => setSelectedImage(img)}
              onDeleteImage={handleDeleteImage}
              onDownloadPreview={handleDownloadPreview}
              onDownloadFits={handleDownloadFits}
            />
          )}

          {images.length > 0 && viewMode === 'table' && (
            <ImageTable
              images={visibleImages}
              selectedIds={selectedIds}
              allSelected={filteredImages.length > 0 && selectedIds.length === filteredImages.length}
              onToggleSelect={handleToggleSelect}
              onSelectAll={handleSelectAll}
              onClearSelection={handleClearSelection}
              onOpenViewer={(img) => setSelectedImage(img)}
              onDeleteImage={handleDeleteImage}
              onDownloadPreview={handleDownloadPreview}
              filters={filters}
              onSortChange={(field) => {
                setFilters(prev => ({
                  ...prev,
                  sortBy: field,
                  sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc'
                }));
              }}
            />
          )}

          {/* Load more (keeps the DOM light on huge catalogs) */}
          {visibleImages.length < filteredImages.length && (
            <div className="flex justify-center pt-1">
              <button
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                className="px-4 py-2 text-xs font-medium text-slate-300 bg-[#161B22] hover:bg-slate-800 border border-slate-700/60 rounded-lg transition"
              >
                Carrega'n més ({filteredImages.length - visibleImages.length} restants)
              </button>
            </div>
          )}

        </div>

      </main>

      {/* Directory Scanner Modal */}
      <DirectoryScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanComplete={handleScanComplete}
        onLoadSamples={handleLoadSamples}
      />

      {/* Interactive FITS Viewer & Inspector Modal */}
      <FitsViewerModal
        image={selectedImage}
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        onDownloadPreview={handleDownloadPreview}
        onDownloadFits={handleDownloadFits}
        onDeleteImage={handleDeleteImage}
      />

      {/* SQL Console Modal */}
      <SqlConsoleModal
        isOpen={isSqlConsoleOpen}
        onClose={() => setIsSqlConsoleOpen(false)}
      />

      {/* Export Options Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        filteredImages={filteredImages}
        allImages={images}
      />

      {/* Statistics Dashboard (charts) Modal */}
      <StatsDashboard
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        images={filteredImages}
        stats={filteredStats}
        isFiltered={isFiltered}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteTarget.isOpen}
        onClose={() => setDeleteTarget(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmDelete}
        count={deleteTarget.count}
        fileName={deleteTarget.fileName}
        isDeleting={deleteTarget.isDeleting}
      />

    </div>
  );
}
