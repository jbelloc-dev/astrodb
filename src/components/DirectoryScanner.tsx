import React, { useState, useRef, useEffect } from 'react';
import { 
  FolderSearch, 
  UploadCloud, 
  FileCheck, 
  X, 
  AlertCircle, 
  Sparkles, 
  CheckCircle2, 
  HardDrive,
  Info,
  FolderTree,
  ShieldCheck,
  Zap,
  Image as ImageIcon,
  Server,
  Square
} from 'lucide-react';
import { FitsMetadata } from '../types/fits';
import { FitsParser } from '../utils/fitsParser';
import { SqlStorage } from '../utils/sqlStorage';

interface DirectoryScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (newImages: FitsMetadata[]) => void;
  onLoadSamples: () => void;
}

interface ScannedFileInfo {
  file: File;
  relativePath: string;
}

interface NasScanState {
  running: boolean;
  phase: 'idle' | 'listing' | 'processing' | 'done' | 'cancelled' | 'error';
  trigger: 'manual' | 'auto' | null;
  startedAt: string | null;
  finishedAt: string | null;
  filesOnNas: number;
  toProcess: number;
  processed: number;
  imported: number;
  relinked: number;
  skippedKnownPath: number;
  skippedDuplicate: number;
  skippedRecent: number;
  failed: number;
  currentFile: string;
  errors: { file: string; error: string }[];
  message: string;
}

interface NasInfo {
  enabled: boolean;
  root: string;
  autoScanIntervalMin: number;
}

/**
 * Server-side scan of the NAS share mounted into the container. The server
 * reads the FITS files from its own disk, so nothing travels over the network
 * to the browser; this hook only starts the job and polls its progress.
 */
function useNasScanner(isOpen: boolean, onFinished: () => void) {
  const [info, setInfo] = useState<NasInfo | null>(null);
  const [state, setState] = useState<NasScanState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wasRunning = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch('/api/nas/info')
      .then(r => r.json())
      .then(data => {
        if (cancelled || !data?.success) return;
        setInfo({ enabled: data.enabled, root: data.root, autoScanIntervalMin: data.autoScanIntervalMin });
        setState(data.state);
        wasRunning.current = !!data.state?.running;
      })
      .catch(() => { if (!cancelled) setInfo(null); });
    return () => { cancelled = true; };
  }, [isOpen]);

  const running = !!state?.running;
  useEffect(() => {
    if (!isOpen || !running) return;
    const timer = setInterval(async () => {
      try {
        const data = await fetch('/api/nas/status').then(r => r.json());
        if (data?.success) {
          setState(data.state);
          if (wasRunning.current && !data.state.running) onFinishedRef.current();
          wasRunning.current = !!data.state.running;
        }
      } catch (_) {}
    }, 1500);
    return () => clearInterval(timer);
  }, [isOpen, running]);

  const start = async () => {
    setError(null);
    try {
      const data = await fetch('/api/nas/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }).then(r => r.json());
      if (!data?.success) {
        setError(data?.error || "No s'ha pogut iniciar l'escaneig del NAS.");
        return;
      }
      setState(data.state);
      wasRunning.current = !!data.state?.running;
    } catch (err: any) {
      setError(err?.message || "No s'ha pogut contactar amb el servidor.");
    }
  };

  const cancel = async () => {
    try {
      const data = await fetch('/api/nas/cancel', { method: 'POST' }).then(r => r.json());
      if (data?.success) setState(data.state);
    } catch (_) {}
  };

  return { info, state, error, start, cancel };
}

export const DirectoryScanner: React.FC<DirectoryScannerProps> = ({
  isOpen,
  onClose,
  onScanComplete,
  onLoadSamples
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFileName, setCurrentFileName] = useState('');
  const [currentPath, setCurrentPath] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [processedCount, setProcessedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string>('');

  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  const nas = useNasScanner(isOpen, () => onScanComplete([]));

  if (!isOpen) return null;

  /**
   * Recursive scanner for HTML5 Drag & Drop Directory Entries (local disk folder drop)
   */
  const traverseDirectoryEntry = async (
    entry: any,
    currentPath = ''
  ): Promise<ScannedFileInfo[]> => {
    const results: ScannedFileInfo[] = [];

    if (entry.isFile) {
      const file: File = await new Promise((resolve, reject) => {
        entry.file(resolve, reject);
      });
      const name = file.name.toLowerCase();
      if (
        name.endsWith('.fits') ||
        name.endsWith('.fit') ||
        name.endsWith('.fts') ||
        name.endsWith('.fz') ||
        name.endsWith('.fits.gz')
      ) {
        results.push({
          file,
          relativePath: currentPath ? `${currentPath}/${file.name}` : file.name
        });
      }
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const entries: any[] = await new Promise((resolve) => {
        const allEntries: any[] = [];
        const readBatch = () => {
          dirReader.readEntries((batch: any[]) => {
            if (batch.length === 0) {
              resolve(allEntries);
            } else {
              allEntries.push(...batch);
              readBatch();
            }
          }, () => resolve(allEntries));
        };
        readBatch();
      });

      const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      for (const childEntry of entries) {
        const subResults = await traverseDirectoryEntry(childEntry, nextPath);
        results.push(...subResults);
      }
    }

    return results;
  };

  /**
   * Check if running inside an iframe or sandboxed preview
   */
  const isInIframe = (): boolean => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  };

  /**
   * Universal Local Directory Selector using native browser folder picker
   */
  const handleSelectDirectory = () => {
    setErrorMessage(null);
    folderInputRef.current?.click();
  };

  /**
   * Process and parse an array of FITS files, generate low-res miniatures and save to SQL database.
   *
   * Duplicate prevention happens in two stages:
   *  1. By relative path (cheap, no file reads): skips files whose path is already
   *     in the catalog, so re-scanning a folder you've imported before doesn't
   *     re-read everything again.
   *  2. By file content (SHA-256 hash of the raw bytes): catches the same frame
   *     being re-imported under a different name/folder, or duplicate copies
   *     living in two different subfolders of the same selection — a path check
   *     alone would miss both. Files are hashed a small bounded batch at a time
   *     (not the whole selection at once) so a large directory import never has
   *     to hold thousands of raw FITS buffers in memory simultaneously.
   */
  const processScannedFiles = async (allItems: ScannedFileInfo[]) => {
    setIsProcessing(true);
    setSkippedCount(0);
    setCurrentFileName('Comprovant fitxers ja catalogats...');

    const knownPaths = await SqlStorage.getKnownPaths(allItems.map(i => i.relativePath));
    const afterPathFilter = knownPaths.size > 0
      ? allItems.filter(i => !knownPaths.has(i.relativePath))
      : allItems;
    let skipped = allItems.length - afterPathFilter.length;
    let totalToProcess = afterPathFilter.length;
    setProgress({ current: 0, total: totalToProcess });

    const parsedImages: FitsMetadata[] = [];
    const BATCH_SIZE = 4;
    const HASH_CHUNK_SIZE = 8;
    // Hashes already accepted earlier in this same run, so duplicate content
    // within one drag/drop or folder selection is caught immediately, without
    // waiting on a server round trip.
    const seenHashesThisRun = new Set<string>();
    let unsavedBatch: FitsMetadata[] = [];
    let processedIndex = 0;

    for (let chunkStart = 0; chunkStart < afterPathFilter.length; chunkStart += HASH_CHUNK_SIZE) {
      const chunk = afterPathFilter.slice(chunkStart, chunkStart + HASH_CHUNK_SIZE);
      setCurrentFileName('Comprovant contingut duplicat...');

      const hashedChunk: { file: File; relativePath: string; buffer: ArrayBuffer; hash: string }[] = [];
      for (const { file, relativePath } of chunk) {
        const buffer = await file.arrayBuffer();
        const hash = await FitsParser.hashBuffer(buffer);
        if (hash && seenHashesThisRun.has(hash)) {
          continue;
        }
        if (hash) seenHashesThisRun.add(hash);
        hashedChunk.push({ file, relativePath, buffer, hash });
      }

      const knownHashes = await SqlStorage.getKnownHashes(
        hashedChunk.map(h => h.hash).filter(Boolean)
      );
      const toParse = knownHashes.size > 0
        ? hashedChunk.filter(h => !(h.hash && knownHashes.has(h.hash)))
        : hashedChunk;

      const chunkSkipped = chunk.length - toParse.length;
      skipped += chunkSkipped;
      totalToProcess -= chunkSkipped;

      for (const { file, relativePath, buffer, hash } of toParse) {
        processedIndex++;
        setCurrentFileName(file.name);
        setCurrentPath(relativePath);
        setProgress({ current: processedIndex, total: totalToProcess });

        // Yield event loop and give the garbage collector breathing room
        await new Promise(r => setTimeout(r, 20));

        try {
          // Parse metadata and generate lightweight thumbnail (< 40 KB).
          // The hash was already computed above, so it's passed through
          // instead of being redone here.
          const metadata = await FitsParser.parseFits(
            buffer,
            file.name,
            file.size,
            relativePath,
            hash
          );

          // Strip the heavy pixel array (not needed once the thumbnail is
          // generated) but keep the original file itself as `rawBlob` — it
          // gets persisted into IndexedDB (see SqlStorage.saveImagesBatch) so
          // "Baixar FITS" can return the real original file later, not just
          // the parsed metadata.
          const persistItem: FitsMetadata = {
            ...metadata,
            headers_json: metadata.headers_json || {},
            rawBlob: file
          };
          delete (persistItem as any).pixelData;

          parsedImages.push(persistItem);
          unsavedBatch.push(persistItem);

          // Periodically batch sync to SQLite database and IndexedDB in small chunks
          if (unsavedBatch.length >= BATCH_SIZE) {
            await SqlStorage.saveImagesBatch(unsavedBatch);
            unsavedBatch = [];
          }
        } catch (err: any) {
          console.warn(`Fitxer omès per error en decodificar ${file.name}:`, err);
        }
      }
    }

    // Ensure all remaining images are persisted in SQL database
    if (unsavedBatch.length > 0) {
      await SqlStorage.saveImagesBatch(unsavedBatch);
      unsavedBatch = [];
    }

    if (skipped > 0) setSkippedCount(skipped);
    setProcessedCount(parsedImages.length);
    setIsProcessing(false);
    onScanComplete(parsedImages);
  };

  /**
   * Handle files from <input type="file">
   */
  const handleFileList = async (fileList: FileList | File[]) => {
    const rawFiles = Array.from(fileList);
    const validItems: ScannedFileInfo[] = [];

    for (const f of rawFiles) {
      const name = f.name.toLowerCase();
      if (
        name.endsWith('.fits') ||
        name.endsWith('.fit') ||
        name.endsWith('.fts') ||
        name.endsWith('.fz') ||
        name.endsWith('.fits.gz')
      ) {
        // webkitRelativePath contains subfolder path if picked with webkitdirectory
        // @ts-ignore
        const relativePath = f.webkitRelativePath || f.name;
        validItems.push({ file: f, relativePath });
      }
    }

    if (validItems.length === 0) {
      setErrorMessage("No s'han trobat fitxers amb extensió FITS (.fits, .fit, .fts, .fz) als fitxers seleccionats.");
      return;
    }

    setErrorMessage(null);
    await processScannedFiles(validItems);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setErrorMessage(null);

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      setIsProcessing(true);
      setCurrentFileName('Analitzant estructura de carpetes del disc dur...');
      const scannedList: ScannedFileInfo[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // @ts-ignore
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry) {
          const results = await traverseDirectoryEntry(entry);
          scannedList.push(...results);
        }
      }

      if (scannedList.length > 0) {
        await processScannedFiles(scannedList);
      } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await handleFileList(e.dataTransfer.files);
      } else {
        setIsProcessing(false);
        setErrorMessage("No s'ha trobat cap fitxer FITS a la selecció arrossegada.");
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFileList(e.dataTransfer.files);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B0F19]/85 backdrop-blur-sm animate-fadeIn">
      <div 
        id="directory-scanner-modal"
        className="bg-[#161B22] border border-slate-700/60 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-700/50 bg-[#0D1117]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white font-sans">
                  Escanejar Disc Dur Local
                </h2>
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] px-1.5 py-0.2 rounded font-mono flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Disc Local (Sense Google Drive)
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Selecciona una carpeta del teu disc dur per processar FITS, extreure metadades i generar miniatures ràpides
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

        {/* Modal Body */}
        <div className="p-5 space-y-4">

          {/* NAS scan (server-side, only when the NAS share is mounted in the container) */}
          {nas.info?.enabled && (
            <div className="p-3.5 bg-[#0D1117] border border-emerald-500/30 rounded-lg space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start space-x-2.5">
                  <div className="p-2 rounded bg-emerald-600/10 text-emerald-400 mt-0.5 sm:mt-0 flex-shrink-0">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-white">
                      Escaneja el NAS directament
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Busca FITS nous a <code className="text-emerald-300 font-mono">{nas.info.root}</code> i els cataloga des del mateix NAS, sense passar per la xarxa.
                      {nas.info.autoScanIntervalMin > 0 && (
                        <> Escaneig automàtic cada {nas.info.autoScanIntervalMin} min.</>
                      )}
                    </p>
                  </div>
                </div>

                {nas.state?.running ? (
                  <button
                    id="btn-nas-cancel"
                    onClick={nas.cancel}
                    className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md transition flex items-center justify-center gap-2 flex-shrink-0"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Aturar</span>
                  </button>
                ) : (
                  <button
                    id="btn-nas-scan"
                    disabled={isProcessing}
                    onClick={nas.start}
                    className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50 flex-shrink-0"
                  >
                    <Server className="w-4 h-4" />
                    <span>Escaneja el NAS</span>
                  </button>
                )}
              </div>

              {nas.state?.running && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-emerald-400 font-medium">
                      {nas.state.phase === 'listing'
                        ? 'Llistant fitxers FITS al NAS...'
                        : `Processant fitxers nous${nas.state.trigger === 'auto' ? ' (automàtic)' : ''}...`}
                    </span>
                    {nas.state.phase === 'processing' && (
                      <span className="font-mono text-slate-300">
                        {nas.state.processed} / {nas.state.toProcess}
                      </span>
                    )}
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-emerald-500 transition-all duration-300 ${nas.state.phase === 'listing' ? 'animate-pulse w-full opacity-40' : ''}`}
                      style={nas.state.phase === 'processing'
                        ? { width: `${nas.state.toProcess > 0 ? (nas.state.processed / nas.state.toProcess) * 100 : 100}%` }
                        : undefined}
                    />
                  </div>
                  {nas.state.currentFile && (
                    <p className="text-[10px] text-slate-500 truncate font-mono">{nas.state.currentFile}</p>
                  )}
                </div>
              )}

              {nas.state && !nas.state.running && nas.state.finishedAt && (
                <div className={`text-[11px] rounded p-2 border ${nas.state.phase === 'error' ? 'bg-rose-950/30 border-rose-800/40 text-rose-300' : 'bg-emerald-950/20 border-emerald-800/30 text-emerald-200'}`}>
                  <p>
                    {nas.state.message}{' '}
                    <strong>{nas.state.imported}</strong> importats
                    {nas.state.relinked > 0 && <>, <strong>{nas.state.relinked}</strong> re-enllaçats</>}
                    , {nas.state.skippedKnownPath + nas.state.skippedDuplicate} ja catalogats
                    {nas.state.skippedRecent > 0 && <>, {nas.state.skippedRecent} massa recents (es faran al pròxim escaneig)</>}
                    {nas.state.failed > 0 && <>, <span className="text-rose-300">{nas.state.failed} amb errors</span></>}
                    {' '}({nas.state.filesOnNas} FITS al NAS).
                  </p>
                  {nas.state.errors.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-rose-300">Veure errors</summary>
                      <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-rose-200/80 max-h-32 overflow-auto">
                        {nas.state.errors.map((e, i) => (
                          <li key={i} className="truncate" title={`${e.file}: ${e.error}`}>{e.file}: {e.error}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              {nas.error && (
                <p className="text-[11px] text-rose-300">{nas.error}</p>
              )}
            </div>
          )}

          {/* Direct Local Hard Drive Picker Box */}
          <div className="p-3.5 bg-[#0D1117] border border-blue-500/30 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start space-x-2.5">
              <div className="p-2 rounded bg-blue-600/10 text-blue-400 mt-0.5 sm:mt-0 flex-shrink-0">
                <FolderTree className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-white">
                  Tria qualsevol carpeta del teu Disc Dur (C:, D:, /home, etc.)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Explora recursivament totes les subcarpetes (ex: <code className="text-blue-300 font-mono">Lights/</code>, <code className="text-blue-300 font-mono">Darks/</code>, <code className="text-blue-300 font-mono">Flats/</code>) i desa les rutes a la base de dades SQL.
                </p>
              </div>
            </div>

            <button
              id="btn-native-local-folder"
              disabled={isProcessing}
              onClick={handleSelectDirectory}
              className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50 flex-shrink-0"
            >
              <FolderSearch className="w-4 h-4" />
              <span>Explorar Carpeta</span>
            </button>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
              isDragging
                ? 'border-blue-500 bg-blue-950/20'
                : 'border-slate-700 hover:border-slate-500 bg-[#0D1117]'
            }`}
          >
            <div className="flex flex-col items-center justify-center space-y-2.5">
              <div className="w-12 h-12 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-xs font-semibold text-slate-200">
                  O bé arrossega carpetes o fitxers FITS des del teu explorador d'arxius
                </h3>
                <p className="text-[11px] text-slate-400">
                  Compatibilitat amb <code className="text-blue-400 font-mono">.fits</code>, <code className="text-blue-400 font-mono">.fit</code>, <code className="text-blue-400 font-mono">.fts</code>, <code className="text-blue-400 font-mono">.fz</code>
                </p>
              </div>

              {/* Actions: Standard Inputs */}
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                
                {/* Hidden input for folder */}
                <input
                  type="file"
                  ref={folderInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileList(e.target.files);
                    }
                    e.target.value = '';
                  }}
                  // @ts-ignore
                  webkitdirectory=""
                  directory=""
                  multiple
                  className="hidden"
                />

                {/* Hidden input for files */}
                <input
                  type="file"
                  ref={filesInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileList(e.target.files);
                    }
                    e.target.value = '';
                  }}
                  accept=".fits,.fit,.fts,.fz"
                  multiple
                  className="hidden"
                />

                <button
                  id="btn-select-folder-input"
                  disabled={isProcessing}
                  onClick={handleSelectDirectory}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition flex items-center gap-2 disabled:opacity-50"
                >
                  <FolderTree className="w-3.5 h-3.5 text-blue-400" />
                  <span>Seleccionar Carpeta</span>
                </button>

                <button
                  id="btn-select-files-input"
                  disabled={isProcessing}
                  onClick={() => filesInputRef.current?.click()}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition flex items-center gap-2 disabled:opacity-50"
                >
                  <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Triar Fitxers Individuals</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Demo Sample Option */}
          <div className="flex items-center justify-between p-3 bg-[#0D1117] border border-slate-700/60 rounded-lg">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded bg-blue-500/10 text-blue-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="text-left">
                <h4 className="text-xs font-semibold text-slate-200">
                  Vols provar amb dades de mostra?
                </h4>
                <p className="text-[11px] text-slate-400">
                  Carrega una sessió astronòmica d'exemple amb Lights (M31, M42, NGC7000), Darks, Flats i Biases.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                onClose();
                onLoadSamples();
              }}
              className="px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded transition"
            >
              Carrega Mostres
            </button>
          </div>

          {/* Processing Progress Status */}
          {isProcessing && (
            <div className="p-3.5 bg-blue-950/30 border border-blue-800/40 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-blue-400 font-medium flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                  Processant FITS & generant previsualitzacions HD...
                </span>
                <span className="font-mono text-slate-300">
                  {progress.current} / {progress.total} ({progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%)
                </span>
              </div>
              
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-150"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>

              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400 truncate font-mono">
                  Fitxer: <span className="text-slate-200">{currentFileName}</span>
                </p>
                {currentPath && (
                  <p className="text-[10px] text-slate-500 truncate font-mono">
                    Ruta: <span className="text-slate-400">{currentPath}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Success Message */}
          {!isProcessing && processedCount > 0 && (
            <div className="p-3 bg-green-950/30 border border-green-800/50 rounded-lg flex items-center justify-between text-xs text-green-300">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span>
                  S'han processat <strong>{processedCount}</strong> imatges FITS i s'han desat a la base de dades SQL
                  {skippedCount > 0 && (
                    <> ({skippedCount} ja catalogades, s'han ometès)</>
                  )}.
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white font-medium rounded transition"
              >
                Veure Catàleg
              </button>
            </div>
          )}

          {/* All files already catalogued */}
          {!isProcessing && processedCount === 0 && skippedCount > 0 && (
            <div className="p-3 bg-blue-950/30 border border-blue-800/50 rounded-lg flex items-center space-x-2 text-xs text-blue-300">
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
              <span>
                Els <strong>{skippedCount}</strong> fitxers d'aquesta selecció ja estaven catalogats. No calia tornar-los a processar.
              </span>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-lg flex items-start space-x-2 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Features info pill */}
          <div className="p-3 bg-[#0D1117] border border-slate-700/50 rounded-lg text-[11px] text-slate-400 space-y-1.5">
            <div className="flex items-center gap-1.5 text-slate-300 font-medium">
              <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
              <span>Decodificació FITS & Base de Dades SQL:</span>
            </div>
            <p className="text-[10px] text-slate-400">
              Cada fitxer FITS es decodifica per extreure les capçaleres astronòmiques completes i una previsualització nítida en color real o monocrom. Totes les dades es guarden a la base de dades per a una navegació i filtratge immediat.
            </p>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-700/50 bg-[#0D1117] gap-2">
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
