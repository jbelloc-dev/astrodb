import { FitsMetadata, SqlQueryResult, AstroStats } from '../types/fits';
import JSZip from 'jszip';

const IDB_NAME = 'FitsAstroCatalogDB';
const IDB_VERSION = 1;
const IDB_STORE = 'fits_images';

export class SqlStorage {
  private static isInitialized = false;
  private static idbInstance: IDBDatabase | null = null;

  /**
   * Runs async jobs with a bounded number running at once.
   *
   * The previous implementation fired every /api/images/batch POST with
   * `fetch(...).catch(...)` and never awaited the response, so scanning a
   * large directory queued up hundreds of concurrent multi-megabyte requests
   * (each carrying embedded base64 thumbnails) almost instantly, all landing
   * on the server at once. Combined with the old sql.js in-memory database
   * (which re-serialized the *entire* DB to disk on every write), this is
   * what caused the app to crash on big directory imports. Bounding
   * concurrency here — and actually awaiting completion — gives natural
   * backpressure: the scan loop in DirectoryScanner only proceeds to the next
   * batch once earlier ones have actually been persisted.
   */
  private static async runWithConcurrencyLimit<T>(
    jobs: (() => Promise<T>)[],
    limit = 3
  ): Promise<void> {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const jobIndex = cursor++;
        try {
          await jobs[jobIndex]();
        } catch (err) {
          console.warn('Background sync job failed:', err);
        }
      }
    });
    await Promise.all(workers);
  }

  /**
   * Initialize IndexedDB database connection
   */
  private static async getIdb(): Promise<IDBDatabase> {
    if (this.idbInstance) return this.idbInstance;

    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB not supported'));
      }

      const request = indexedDB.open(IDB_NAME, IDB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result as IDBDatabase;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          const store = db.createObjectStore(IDB_STORE, { keyPath: 'id' });
          store.createIndex('object_name', 'object_name', { unique: false });
          store.createIndex('image_type', 'image_type', { unique: false });
          store.createIndex('filter_name', 'filter_name', { unique: false });
          store.createIndex('date_obs', 'date_obs', { unique: false });
        }
      };

      request.onsuccess = () => {
        this.idbInstance = request.result;
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  public static async init(): Promise<void> {
    if (this.isInitialized) return;
    try {
      await this.getIdb();
      this.isInitialized = true;

      // Check backend server and perform two-way synchronization
      try {
        const healthRes = await fetch('/api/health');
        if (healthRes.ok) {
          // Read local IDB items
          const db = await this.getIdb();
          const tx = db.transaction(IDB_STORE, 'readonly');
          const store = tx.objectStore(IDB_STORE);
          const localItems: FitsMetadata[] = await new Promise((resolve) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
          });

          // Fetch backend images
          const apiRes = await fetch('/api/images?limit=50000');
          if (apiRes.ok) {
            const data = await apiRes.json();
            const serverImages: FitsMetadata[] = Array.isArray(data.images) ? data.images : [];
            const serverIdSet = new Set(serverImages.map(s => s.id));

            // Sync missing local items to backend SQLite
            const missingOnServer = localItems.filter(item => !serverIdSet.has(item.id));
            if (missingOnServer.length > 0) {
              // Fire-and-forget is fine here: it doesn't block app startup,
              // but still goes through saveImagesBatch's bounded concurrency
              // instead of blasting every chunk at once.
              this.saveImagesBatch(missingOnServer).catch(() => {});
            }

            // Sync missing server items to local IndexedDB
            const localIdSet = new Set(localItems.map(l => l.id));
            const missingOnLocal = serverImages.filter(item => !localIdSet.has(item.id));
            if (missingOnLocal.length > 0) {
              const writeTx = db.transaction(IDB_STORE, 'readwrite');
              const writeStore = writeTx.objectStore(IDB_STORE);
              missingOnLocal.forEach(img => {
                const cleanImg = {
                  ...img,
                  headers_json: typeof img.headers_json === 'string' ? JSON.parse(img.headers_json || '{}') : (img.headers_json || {})
                };
                writeStore.put(cleanImg);
              });
            }
          }
        }
      } catch (syncErr) {
        console.warn('Backend sync during init skipped:', syncErr);
      }
    } catch (err) {
      console.warn('Storage initialization fallback:', err);
    }
  }

  /**
   * Save a batch of images into IndexedDB & Sync to SQLite Server
   */
  public static async saveImagesBatch(images: FitsMetadata[]): Promise<boolean> {
    if (!images || images.length === 0) return true;

    // 1. Persist directly to client-side IndexedDB for instant, resilient offline/online storage
    try {
      const db = await this.getIdb();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);

      for (const img of images) {
        // Exclude rawBlob and large pixelData memory buffers from permanent serialization
        const { rawBlob, pixelData, ...storable } = img;
        store.put(storable);
      }

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (idbErr) {
      console.warn('IndexedDB save warning:', idbErr);
    }

    // 2. Sync to Backend SQLite server (non-blocking, chunked)
    const cleanImages = images.map(img => ({
      id: img.id,
      file_name: img.file_name,
      file_path: img.file_path || '',
      file_size: img.file_size || 0,
      file_hash: img.file_hash || '',
      object_name: img.object_name,
      object_category: img.object_category,
      image_type: img.image_type,
      exposure_time: img.exposure_time,
      sensor_temp: img.sensor_temp,
      rotation_angle: img.rotation_angle,
      date_obs: img.date_obs,
      filter_name: img.filter_name,
      telescope: img.telescope || '',
      camera: img.camera || '',
      focal_length: img.focal_length,
      gain: img.gain,
      bayer_pattern: img.bayer_pattern || '',
      ra: img.ra || '',
      dec: img.dec || '',
      airmass: img.airmass,
      width: img.width || 0,
      height: img.height || 0,
      bitpix: img.bitpix || 16,
      thumbnail_url: img.thumbnail_url || '',
      headers_json: img.headers_json || {},
      custom_tags: img.custom_tags || '',
      notes: img.notes || ''
    }));

    const CHUNK_SIZE = 15;
    const chunks: FitsMetadata[][] = [];
    for (let i = 0; i < cleanImages.length; i += CHUNK_SIZE) {
      chunks.push(cleanImages.slice(i, i + CHUNK_SIZE));
    }

    const jobs = chunks.map(chunk => async () => {
      const res = await fetch('/api/images/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: chunk })
      });
      if (!res.ok) {
        console.warn('Chunk sync to server failed with status', res.status);
      }
    });

    // Awaited with bounded concurrency: this is what actually paces the
    // directory scan loop (see runWithConcurrencyLimit above).
    await this.runWithConcurrencyLimit(jobs, 3);
    return true;
  }

  /**
   * Ask the backend which of these relative file paths are already catalogued,
   * so a directory re-scan can skip files it has already imported instead of
   * re-reading, re-parsing and re-uploading every frame again.
   */
  public static async getKnownPaths(paths: string[]): Promise<Set<string>> {
    if (paths.length === 0) return new Set();
    try {
      const res = await fetch('/api/images/known', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.knownPaths)) {
          return new Set<string>(data.knownPaths);
        }
      }
    } catch (err) {
      console.warn('Could not check known files against server, will import everything:', err);
    }
    return new Set();
  }

  /**
   * Ask the backend which of these SHA-256 file-content hashes are already
   * catalogued, so identical FITS frames are recognised as duplicates even
   * when they are re-imported under a different file name or folder path
   * (a path-only check would miss that case entirely).
   */
  public static async getKnownHashes(hashes: string[]): Promise<Set<string>> {
    if (hashes.length === 0) return new Set();
    try {
      const res = await fetch('/api/images/known', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashes })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.knownHashes)) {
          return new Set<string>(data.knownHashes);
        }
      }
    } catch (err) {
      console.warn('Could not check known file hashes against server, will import everything:', err);
    }
    return new Set();
  }

  /**
   * Fetch all images with optional filters from SQLite Server or fallback to IndexedDB
   */
  public static async fetchImages(params: Record<string, any> = {}): Promise<FitsMetadata[]> {
    // 1. Fetch from Local IndexedDB first (guaranteed, fast local storage)
    let localItems: FitsMetadata[] = [];
    try {
      const db = await this.getIdb();
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const request = store.getAll();

      localItems = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });
    } catch (idbErr) {
      console.warn('Local IndexedDB fetch warning:', idbErr);
    }

    // 2. Fetch from Backend SQLite API if available
    let serverItems: FitsMetadata[] = [];
    try {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          queryParams.append(k, String(v));
        }
      });

      const res = await fetch(`/api/images?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.images)) {
          serverItems = data.images.map((img: any) => ({
            ...img,
            headers_json: typeof img.headers_json === 'string' ? JSON.parse(img.headers_json || '{}') : (img.headers_json || {})
          }));
        }
      }
    } catch (apiErr) {
      // Backend offline or starting up
    }

    // 3. Merge both collections by ID (never lose any uploaded image)
    const combinedMap = new Map<string, FitsMetadata>();
    for (const item of serverItems) {
      combinedMap.set(item.id, item);
    }
    for (const item of localItems) {
      if (!combinedMap.has(item.id)) {
        combinedMap.set(item.id, item);
      }
    }

    const allImages = Array.from(combinedMap.values());

    // Sync any local images that were missing on the server back to backend
    if (localItems.length > 0 && serverItems.length === 0) {
      this.saveImagesBatch(localItems).catch(() => {});
    }

    // Sort by date_obs descending
    return allImages.sort((a, b) => new Date(b.date_obs || 0).getTime() - new Date(a.date_obs || 0).getTime());
  }

  /**
   * Delete an image from SQL database & IndexedDB
   */
  public static async deleteImage(id: string): Promise<boolean> {
    // Delete from IndexedDB
    try {
      const db = await this.getIdb();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(id);
    } catch (e) {
      console.warn('IDB delete error:', e);
    }

    // Delete from backend
    try {
      const res = await fetch(`/api/images/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch (err) {
      return true;
    }
  }

  /**
   * Clear database in both backend and IndexedDB
   */
  public static async clearAll(): Promise<boolean> {
    try {
      const db = await this.getIdb();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
    } catch (e) {
      console.warn('IDB clear error:', e);
    }

    try {
      await fetch('/api/images/clear', { method: 'POST' });
    } catch (err) {
      // silent
    }
    return true;
  }

  /**
   * Execute raw SQL query via backend SQLite engine or local fallback
   */
  public static async executeSqlQuery(sql: string): Promise<SqlQueryResult> {
    const startTime = performance.now();
    try {
      const res = await fetch('/api/sql/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql })
      });

      if (res.ok) {
        const data = await res.json();
        const endTime = performance.now();

        if (data.success) {
          return {
            columns: data.columns || [],
            rows: data.rows || [],
            rowCount: data.rowCount !== undefined ? data.rowCount : (data.rows ? data.rows.length : 0),
            executionTimeMs: Math.round(endTime - startTime)
          };
        } else {
          return {
            columns: [],
            rows: [],
            rowCount: 0,
            executionTimeMs: Math.round(endTime - startTime),
            error: data.error || 'SQL Error'
          };
        }
      }
    } catch (err: any) {
      // Fallback
    }

    // Client-side fallback for basic queries if backend is unreachable
    try {
      const allImages = await this.fetchImages();
      const endTime = performance.now();
      const trimmed = sql.trim().toUpperCase();

      if (trimmed.startsWith('SELECT COUNT(*)')) {
        return {
          columns: ['total_images'],
          rows: [{ total_images: allImages.length }],
          rowCount: 1,
          executionTimeMs: Math.round(endTime - startTime)
        };
      }

      return {
        columns: ['id', 'file_name', 'object_name', 'image_type', 'filter_name', 'exposure_time', 'date_obs'],
        rows: allImages.slice(0, 50).map(img => ({
          id: img.id,
          file_name: img.file_name,
          object_name: img.object_name,
          image_type: img.image_type,
          filter_name: img.filter_name,
          exposure_time: img.exposure_time,
          date_obs: img.date_obs
        })),
        rowCount: Math.min(allImages.length, 50),
        executionTimeMs: Math.round(endTime - startTime)
      };
    } catch (e: any) {
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        error: e.message || 'Error executing query'
      };
    }
  }

  /**
   * Get Astro aggregated statistics
   */
  public static async getStats(): Promise<AstroStats | null> {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.success) return data;
      }
    } catch (err) {
      // fallback
    }

    // Compute stats from local IndexedDB data
    try {
      const images = await this.fetchImages();
      if (images.length === 0) return null;

      let totalExp = 0;
      let tempSum = 0;
      let tempCount = 0;
      const objectSet = new Set<string>();
      const filterSet = new Set<string>();
      const typeCounts: Record<string, { count: number; total_exp: number }> = {};
      const objectCounts: Record<string, { count: number; total_exp: number }> = {};
      const filterCounts: Record<string, { count: number; total_exp: number }> = {};

      for (const img of images) {
        totalExp += img.exposure_time || 0;
        if (img.sensor_temp !== null && !isNaN(img.sensor_temp)) {
          tempSum += img.sensor_temp;
          tempCount++;
        }
        if (img.object_name) objectSet.add(img.object_name);
        if (img.filter_name) filterSet.add(img.filter_name);

        // Types
        const t = img.image_type || 'OTHER';
        if (!typeCounts[t]) typeCounts[t] = { count: 0, total_exp: 0 };
        typeCounts[t].count++;
        typeCounts[t].total_exp += img.exposure_time || 0;

        // Objects
        const obj = img.object_name || 'Desconegut';
        if (!objectCounts[obj]) objectCounts[obj] = { count: 0, total_exp: 0 };
        objectCounts[obj].count++;
        objectCounts[obj].total_exp += img.exposure_time || 0;

        // Filters
        const f = img.filter_name || 'None';
        if (!filterCounts[f]) filterCounts[f] = { count: 0, total_exp: 0 };
        filterCounts[f].count++;
        filterCounts[f].total_exp += img.exposure_time || 0;
      }

      return {
        overview: {
          total_images: images.length,
          total_exposure_sec: totalExp,
          distinct_objects: objectSet.size,
          distinct_filters: filterSet.size,
          avg_temp: tempCount > 0 ? tempSum / tempCount : null
        },
        typeBreakdown: Object.entries(typeCounts).map(([image_type, d]) => ({ image_type, ...d })),
        objectBreakdown: Object.entries(objectCounts).map(([object_name, d]) => ({ object_name, ...d })),
        filterBreakdown: Object.entries(filterCounts).map(([filter_name, d]) => ({ filter_name, ...d }))
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Export images catalog to CSV
   */
  public static exportToCsv(images: FitsMetadata[], fileName = 'fits_catalog.csv'): void {
    if (images.length === 0) return;

    const headers = [
      'ID', 'Nom Fitxer', 'Ruta', 'Objecte', 'Categoria', 'Tipus', 'Exposició (s)',
      'Temp Sensor (°C)', 'Angle Rotació (°)', 'Data Captura (UTC)', 'Filtre',
      'Telescopi', 'Càmera', 'Focal (mm)', 'Gain', 'RA', 'DEC', 'Massa d\'Aire',
      'Amplada', 'Alçada', 'Bayer', 'Etiquetes'
    ];

    const escapeCsv = (str: any) => {
      if (str === null || str === undefined) return '';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = images.map(img => [
      img.id,
      img.file_name,
      img.file_path || '',
      img.object_name,
      img.object_category,
      img.image_type,
      img.exposure_time,
      img.sensor_temp !== null ? img.sensor_temp : '',
      img.rotation_angle !== null ? img.rotation_angle : '',
      img.date_obs,
      img.filter_name,
      img.telescope || '',
      img.camera || '',
      img.focal_length !== null ? img.focal_length : '',
      img.gain !== null ? img.gain : '',
      img.ra || '',
      img.dec || '',
      img.airmass !== null ? img.airmass : '',
      img.width,
      img.height,
      img.bayer_pattern || '',
      img.custom_tags || ''
    ].map(escapeCsv).join(','));

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    this.downloadBlob(blob, fileName);
  }

  /**
   * Export to JSON
   */
  public static exportToJson(images: FitsMetadata[], fileName = 'fits_catalog.json'): void {
    const jsonStr = JSON.stringify(images, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    this.downloadBlob(blob, fileName);
  }

  /**
   * Export file list for DeepSkyStacker or Siril
   */
  public static exportStackingFileList(images: FitsMetadata[], format: 'siril' | 'dss' = 'siril'): void {
    let content = '';
    const lights = images.filter(i => i.image_type === 'LIGHT');
    const darks = images.filter(i => i.image_type === 'DARK');
    const flats = images.filter(i => i.image_type === 'FLAT');
    const biases = images.filter(i => i.image_type === 'BIAS');

    if (format === 'siril') {
      content = `# Siril Astro Stacking File List\n# Generat per FITS Astro Classifier\n\n`;
      content += `requires 1.2.0\n\n`;
      content += `# --- LIGHT FRAMES (${lights.length}) ---\n`;
      lights.forEach(l => { content += `${l.file_path || l.file_name}\n`; });
      content += `\n# --- DARK FRAMES (${darks.length}) ---\n`;
      darks.forEach(d => { content += `${d.file_path || d.file_name}\n`; });
      content += `\n# --- FLAT FRAMES (${flats.length}) ---\n`;
      flats.forEach(f => { content += `${f.file_path || f.file_name}\n`; });
      content += `\n# --- BIAS FRAMES (${biases.length}) ---\n`;
      biases.forEach(b => { content += `${b.file_path || b.file_name}\n`; });
    } else {
      content = `# DeepSkyStacker File List\n`;
      lights.forEach(l => { content += `LIGHT\t${l.file_path || l.file_name}\n`; });
      darks.forEach(d => { content += `DARK\t${d.file_path || d.file_name}\n`; });
      flats.forEach(f => { content += `FLAT\t${f.file_path || f.file_name}\n`; });
      biases.forEach(b => { content += `OFFSET\t${b.file_path || b.file_name}\n`; });
    }

    const blob = new Blob([content], { type: 'text/plain' });
    this.downloadBlob(blob, `stacking_list_${format}.txt`);
  }

  /**
   * Export all thumbnails in a ZIP file
   */
  public static async exportThumbnailsZip(images: FitsMetadata[], zipName = 'fits_previews.zip'): Promise<void> {
    const zip = new JSZip();
    const folder = zip.folder('fits_thumbnails');

    images.forEach(img => {
      if (img.thumbnail_url && img.thumbnail_url.startsWith('data:image/')) {
        const base64Data = img.thumbnail_url.split(',')[1];
        const ext = img.thumbnail_url.includes('png') ? 'png' : 'jpg';
        const cleanName = img.file_name.replace(/\.(fits|fit|fts)$/i, '');
        folder?.file(`${cleanName}_preview.${ext}`, base64Data, { base64: true });
      }
    });

    const content = await zip.generateAsync({ type: 'blob' });
    this.downloadBlob(content, zipName);
  }

  private static downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
