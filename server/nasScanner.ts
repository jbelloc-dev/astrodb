/**
 * NAS scanner: catalogs FITS files that live directly on the NAS share mounted
 * into the container (default: /data/fotos), without the browser having to
 * download every frame over the network and upload it again.
 *
 * It reuses exactly the same FITS parser and preview pipeline as the browser
 * import (src/utils/fitsParser.ts + thumbnailGenerator.ts), so records created
 * here are indistinguishable from the ones created by "Explorar Carpeta" —
 * except that `file_path` is always the path relative to the NAS root, e.g.
 * "00-ALZIR/2026-09-14/M 13/LIGHT/xxx.fits".
 *
 * Duplicate handling:
 *  - a file whose relative path is already in the catalog is skipped without
 *    being read at all (cheap re-scans);
 *  - a file whose SHA-256 is already in the catalog is not imported again. If
 *    the existing record points to a path that no longer exists on the NAS
 *    (e.g. an old "M:/..." or browser-relative path), it is re-linked to the
 *    real NAS path instead.
 *  - files modified in the last few minutes are left for the next scan, so a
 *    frame that is still being copied from Trevinca is never read half-written.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import jpeg from 'jpeg-js';
import type Database from 'better-sqlite3';
import { FitsParser } from '../src/utils/fitsParser';
import { setJpegEncoder } from '../src/utils/thumbnailGenerator';

// Server-side JPEG encoder for the preview pipeline (there is no <canvas> here)
setJpegEncoder((rgba, width, height, quality) => {
  const encoded = jpeg.encode(
    { data: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height },
    Math.round(Math.max(0.1, Math.min(1, quality)) * 100)
  );
  return `data:image/jpeg;base64,${Buffer.from(encoded.data).toString('base64')}`;
});

const FITS_EXT = /\.(fits|fit|fts|fits\.gz)$/i;
const SKIP_DIR_PREFIXES = ['#', '@', '.'];
const SAVE_BATCH = 20;
const MAX_ERRORS_KEPT = 50;

export interface NasScanState {
  running: boolean;
  phase: 'idle' | 'listing' | 'processing' | 'done' | 'cancelled' | 'error';
  trigger: 'manual' | 'auto' | null;
  subdir: string;
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

export interface NasScannerDeps {
  db: Database.Database;
  /** Normalises a parsed FitsMetadata into a DB row (and persists its thumbnail). */
  toRow: (img: any) => Record<string, any>;
  /** Inserts rows in a single transaction. */
  saveRows: (rows: Record<string, any>[]) => number;
}

function emptyState(): NasScanState {
  return {
    running: false, phase: 'idle', trigger: null, subdir: '',
    startedAt: null, finishedAt: null,
    filesOnNas: 0, toProcess: 0, processed: 0, imported: 0, relinked: 0,
    skippedKnownPath: 0, skippedDuplicate: 0, skippedRecent: 0, failed: 0,
    currentFile: '', errors: [], message: ''
  };
}

const yieldToEventLoop = () => new Promise<void>(resolve => setImmediate(resolve));

export function createNasScanner(deps: NasScannerDeps) {
  const root = path.resolve(process.env.NAS_PHOTOS_DIR || '/data/fotos');
  const minAgeMs = Math.max(0, Number(process.env.NAS_MIN_FILE_AGE_SEC ?? 120)) * 1000;
  const intervalMin = Math.max(0, Number(process.env.NAS_SCAN_INTERVAL_MIN ?? 0));

  let state: NasScanState = emptyState();
  let cancelRequested = false;

  // Files already found to be byte-identical copies of a catalogued frame.
  // Remembered (by path + size + mtime) so later scans don't re-read and
  // re-hash every duplicate copy on the NAS each time. In-memory only: after a
  // restart they are simply checked once more.
  const knownDuplicates = new Set<string>();
  const dupKey = (rel: string, st: fs.Stats) => `${rel}\u0000${st.size}\u0000${Math.floor(st.mtimeMs)}`;

  const isEnabled = () => {
    try { return fs.statSync(root).isDirectory(); } catch { return false; }
  };

  /** Resolves a catalog path to an absolute NAS path, or null if it falls outside the NAS root. */
  const resolveInsideRoot = (relPath: string | null | undefined): string | null => {
    if (!relPath) return null;
    const abs = path.resolve(root, relPath);
    if (abs !== root && !abs.startsWith(root + path.sep)) return null;
    return abs;
  };

  async function listFitsFiles(dir: string, out: string[]) {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
      pushError(path.relative(root, dir) || '.', `No es pot llegir la carpeta: ${err.message}`);
      return;
    }
    for (const e of entries) {
      if (cancelRequested) return;
      if (SKIP_DIR_PREFIXES.some(p => e.name.startsWith(p))) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await listFitsFiles(full, out);
      else if (e.isFile() && FITS_EXT.test(e.name)) out.push(full);
    }
  }

  function pushError(file: string, error: string) {
    state.failed++;
    if (state.errors.length < MAX_ERRORS_KEPT) state.errors.push({ file, error });
  }

  async function run(subdir: string) {
    const { db, toRow, saveRows } = deps;
    const scanRoot = resolveInsideRoot(subdir || '.') || root;

    state.phase = 'listing';
    state.message = 'Llistant fitxers FITS al NAS...';
    const files: string[] = [];
    await listFitsFiles(scanRoot, files);
    files.sort();
    state.filesOnNas = files.length;
    if (cancelRequested) return;

    const knownPaths = new Set(
      (db.prepare('SELECT file_path FROM fits_images WHERE file_path IS NOT NULL').all() as any[])
        .map(r => r.file_path as string)
    );
    const knownHashes = new Set(
      (db.prepare("SELECT DISTINCT file_hash FROM fits_images WHERE file_hash IS NOT NULL AND file_hash != ''").all() as any[])
        .map(r => r.file_hash as string)
    );
    const byHash = db.prepare('SELECT id, file_path FROM fits_images WHERE file_hash = ?');
    const relinkStmt = db.prepare('UPDATE fits_images SET file_path = ? WHERE id = ?');

    const candidates = files
      .map(abs => ({ abs, rel: path.relative(root, abs).split(path.sep).join('/') }))
      .filter(f => {
        if (knownPaths.has(f.rel)) { state.skippedKnownPath++; return false; }
        return true;
      });

    state.toProcess = candidates.length;
    state.phase = 'processing';
    state.message = candidates.length
      ? `Processant ${candidates.length} fitxers nous...`
      : 'No hi ha fitxers nous.';

    let pending: Record<string, any>[] = [];
    const flush = () => {
      if (pending.length) { saveRows(pending); pending = []; }
    };

    for (const { abs, rel } of candidates) {
      if (cancelRequested) break;
      state.currentFile = rel;
      try {
        const st = await fs.promises.stat(abs);
        if (minAgeMs > 0 && Date.now() - st.mtimeMs < minAgeMs) {
          state.skippedRecent++;
          continue;
        }
        if (knownDuplicates.has(dupKey(rel, st))) {
          state.skippedDuplicate++;
          continue;
        }

        const buf = await fs.promises.readFile(abs);
        const hash = crypto.createHash('sha256').update(buf).digest('hex');

        if (knownHashes.has(hash)) {
          // Same content already catalogued. If none of those records points to a
          // file that actually exists on the NAS, adopt this real path for one of them.
          const existing = byHash.all(hash) as { id: string; file_path: string }[];
          const anyValid = existing.some(r => {
            const p = resolveInsideRoot(r.file_path);
            return p !== null && fs.existsSync(p);
          });
          if (!anyValid && existing.length > 0) {
            flush();
            relinkStmt.run(rel, existing[0].id);
            knownPaths.add(rel);
            state.relinked++;
          } else {
            knownDuplicates.add(dupKey(rel, st));
            state.skippedDuplicate++;
          }
          continue;
        }

        const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        const metadata = await FitsParser.parseFits(arrayBuffer, path.basename(abs), st.size, rel, hash);
        delete (metadata as any).pixelData;
        delete (metadata as any).headers_cards;

        pending.push(toRow(metadata));
        knownHashes.add(hash);
        knownPaths.add(rel);
        state.imported++;
        if (pending.length >= SAVE_BATCH) flush();
      } catch (err: any) {
        pushError(rel, err?.message || String(err));
      } finally {
        state.processed++;
        // Keep the HTTP server responsive between (CPU-heavy) frames
        await yieldToEventLoop();
      }
    }
    flush();
  }

  function start(opts: { subdir?: string; trigger?: 'manual' | 'auto' } = {}): { started: boolean; state: NasScanState } {
    if (state.running) return { started: false, state };
    if (!isEnabled()) {
      return { started: false, state: { ...state, message: `La carpeta del NAS (${root}) no està muntada al contenidor.` } };
    }
    cancelRequested = false;
    state = {
      ...emptyState(),
      running: true,
      phase: 'listing',
      trigger: opts.trigger || 'manual',
      subdir: opts.subdir || '',
      startedAt: new Date().toISOString()
    };
    const t0 = Date.now();
    console.log(`[NAS] Escaneig ${state.trigger} iniciat a ${root}${state.subdir ? '/' + state.subdir : ''}`);

    run(state.subdir)
      .then(() => {
        state.phase = cancelRequested ? 'cancelled' : 'done';
        state.message = cancelRequested ? 'Escaneig aturat.' : 'Escaneig acabat.';
      })
      .catch(err => {
        state.phase = 'error';
        state.message = `Error: ${err?.message || err}`;
        console.error('[NAS] Error durant l\'escaneig:', err);
      })
      .finally(() => {
        state.running = false;
        state.currentFile = '';
        state.finishedAt = new Date().toISOString();
        console.log(
          `[NAS] ${state.message} ${state.imported} importats, ${state.relinked} re-enllaçats, ` +
          `${state.skippedKnownPath} ja catalogats, ${state.skippedDuplicate} duplicats, ` +
          `${state.skippedRecent} massa recents, ${state.failed} errors (${Math.round((Date.now() - t0) / 1000)} s)`
        );
      });

    return { started: true, state };
  }

  function cancel() {
    if (state.running) cancelRequested = true;
    return state;
  }

  if (intervalMin > 0) {
    setInterval(() => {
      if (!state.running && isEnabled()) start({ trigger: 'auto' });
    }, intervalMin * 60 * 1000).unref();
    console.log(`[NAS] Escaneig automàtic cada ${intervalMin} min a ${root}`);
  }

  return {
    root,
    intervalMin,
    isEnabled,
    resolveInsideRoot,
    getState: () => state,
    start,
    cancel
  };
}
