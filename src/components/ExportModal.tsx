import React, { useState } from 'react';
import { 
  X, 
  Download, 
  Database, 
  FileSpreadsheet, 
  FileCode, 
  FileArchive, 
  Layers, 
  CheckCircle2
} from 'lucide-react';
import { FitsMetadata } from '../types/fits';
import { SqlStorage } from '../utils/sqlStorage';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  filteredImages: FitsMetadata[];
  allImages: FitsMetadata[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  filteredImages,
  allImages
}) => {
  const [useOnlyFiltered, setUseOnlyFiltered] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const targetList = useOnlyFiltered ? filteredImages : allImages;

  const handleExportCsv = () => {
    SqlStorage.exportToCsv(targetList, `fits_catalog_${Date.now()}.csv`);
    showDone("Catàleg exportat correctament a CSV!");
  };

  const handleExportJson = () => {
    SqlStorage.exportToJson(targetList, `fits_catalog_${Date.now()}.json`);
    showDone("Catàleg exportat correctament a JSON!");
  };

  const handleExportSiril = () => {
    SqlStorage.exportStackingFileList(targetList, 'siril');
    showDone("Fitxer de processament Siril descarregat!");
  };

  const handleExportDss = () => {
    SqlStorage.exportStackingFileList(targetList, 'dss');
    showDone("Llistat de fitxers per a DeepSkyStacker descarregat!");
  };

  const handleExportZip = async () => {
    setIsExporting(true);
    await SqlStorage.exportThumbnailsZip(targetList, `fits_previews_${Date.now()}.zip`);
    setIsExporting(false);
    showDone("Arxiu ZIP amb totes les miniatures descarregat!");
  };

  const handleDownloadSqlite = () => {
    window.location.href = '/api/database/export?format=sqlite';
    showDone("Base de dades SQLite (.sqlite) descarregada!");
  };

  const handleDownloadSqlDump = () => {
    window.location.href = '/api/database/export?format=sql';
    showDone("Script d'esquema i dades SQL (.sql) descarregat!");
  };

  const showDone = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B0F19]/85 backdrop-blur-md animate-fadeIn">
      <div 
        id="export-modal"
        className="bg-[#161B22] border border-slate-700/60 rounded-xl w-full max-w-xl overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700/50 bg-[#0D1117]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white font-sans">
                Exportar Catàleg & Dades FITS
              </h2>
              <p className="text-[11px] text-slate-400">
                Tria el format d'exportació de les metadades i fitxers seleccionats
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
        <div className="p-5 space-y-4">
          
          {/* Scope Selector: Filtered vs All */}
          <div className="p-3 bg-[#0D1117] border border-slate-700/50 rounded-lg flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium">Àmbit d'exportació:</span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setUseOnlyFiltered(true)}
                className={`px-3 py-1 rounded border text-xs transition ${
                  useOnlyFiltered
                    ? 'bg-blue-600 border-blue-500 text-white font-medium shadow-sm'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                Filtrades ({filteredImages.length})
              </button>
              <button
                onClick={() => setUseOnlyFiltered(false)}
                className={`px-3 py-1 rounded border text-xs transition ${
                  !useOnlyFiltered
                    ? 'bg-blue-600 border-blue-500 text-white font-medium shadow-sm'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                Totes ({allImages.length})
              </button>
            </div>
          </div>

          {/* Export Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            
            {/* CSV */}
            <button
              onClick={handleExportCsv}
              className="p-3 bg-[#0D1117] hover:bg-slate-800/80 border border-slate-700/50 hover:border-blue-500/50 rounded-lg text-left transition flex items-start space-x-3 group"
            >
              <div className="p-2 rounded bg-emerald-500/10 text-emerald-400 group-hover:scale-105 transition">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white">Full de Càlcul CSV</div>
                <div className="text-[10px] text-slate-400">Totes les metadades i paràmetres</div>
              </div>
            </button>

            {/* SQLite Database */}
            <button
              onClick={handleDownloadSqlite}
              className="p-3 bg-[#0D1117] hover:bg-slate-800/80 border border-slate-700/50 hover:border-blue-500/50 rounded-lg text-left transition flex items-start space-x-3 group"
            >
              <div className="p-2 rounded bg-blue-500/10 text-blue-400 group-hover:scale-105 transition">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white">Base de Dades SQLite</div>
                <div className="text-[10px] text-slate-400">Fitxer binari complet (.sqlite)</div>
              </div>
            </button>

            {/* SQL Dump */}
            <button
              onClick={handleDownloadSqlDump}
              className="p-3 bg-[#0D1117] hover:bg-slate-800/80 border border-slate-700/50 hover:border-blue-500/50 rounded-lg text-left transition flex items-start space-x-3 group"
            >
              <div className="p-2 rounded bg-sky-500/10 text-sky-400 group-hover:scale-105 transition">
                <FileCode className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white">Script SQL (.sql)</div>
                <div className="text-[10px] text-slate-400">Esquema i comandes INSERT</div>
              </div>
            </button>

            {/* JSON */}
            <button
              onClick={handleExportJson}
              className="p-3 bg-[#0D1117] hover:bg-slate-800/80 border border-slate-700/50 hover:border-blue-500/50 rounded-lg text-left transition flex items-start space-x-3 group"
            >
              <div className="p-2 rounded bg-amber-500/10 text-amber-400 group-hover:scale-105 transition">
                <FileCode className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white">Format JSON</div>
                <div className="text-[10px] text-slate-400">Per a integracions i APIs</div>
              </div>
            </button>

            {/* Siril Script */}
            <button
              onClick={handleExportSiril}
              className="p-3 bg-[#0D1117] hover:bg-slate-800/80 border border-slate-700/50 hover:border-blue-500/50 rounded-lg text-left transition flex items-start space-x-3 group"
            >
              <div className="p-2 rounded bg-cyan-500/10 text-cyan-400 group-hover:scale-105 transition">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white">Llistat per a Siril</div>
                <div className="text-[10px] text-slate-400">Classificat: Light/Dark/Flat/Bias</div>
              </div>
            </button>

            {/* Previews ZIP */}
            <button
              onClick={handleExportZip}
              disabled={isExporting}
              className="p-3 bg-[#0D1117] hover:bg-slate-800/80 border border-slate-700/50 hover:border-blue-500/50 rounded-lg text-left transition flex items-start space-x-3 group disabled:opacity-50"
            >
              <div className="p-2 rounded bg-purple-500/10 text-purple-400 group-hover:scale-105 transition">
                <FileArchive className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white">
                  {isExporting ? 'Comprimint...' : 'Arxiu ZIP de Miniatures'}
                </div>
                <div className="text-[10px] text-slate-400">Totes les imatges estirades</div>
              </div>
            </button>

          </div>

          {/* Success Toast */}
          {statusMessage && (
            <div className="p-2.5 bg-green-950/40 border border-green-800/60 rounded-lg text-xs text-green-300 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-slate-700/50 bg-[#0D1117]">
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
