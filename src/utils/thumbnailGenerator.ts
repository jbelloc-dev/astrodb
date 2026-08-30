export interface FitsPreviewOptions {
  maxDimension?: number; // Maximum width or height of output JPEG (default: 3840)
  bayerPattern?: string; // 'RGGB' | 'BGGR' | 'GBRG' | 'GRBG' or empty for monochrome
  quality?: number; // JPEG quality (0.0 to 1.0, default 0.95)
  flipY?: boolean; // FITS bottom-up standard orientation
  enableScnr?: boolean; // Optional SCNR Green Noise Reduction
  scnrAmount?: number; // SCNR Green removal strength: 0.0 to 1.0 (default: 1.0)
  scnrMethod?: 'max' | 'avg'; // 'max' (PixInsight Maximum Neutral) | 'avg' (Average Neutral)
  targetBackground?: number; // Auto-STF target background level, 0-1 (PixInsight default: 0.25)
  shadowsClipping?: number; // Auto-STF shadows clipping point, in MAD units (PixInsight default: -2.8)
}

/**
 * Standard Astrophotography SCNR (Subtractive Chromatic Noise Reduction) algorithm
 * Removes the non-physical green cast caused by double-density green photosites in Bayer RGGB sensors.
 */
export function applyScnrGreen(
  r: number,
  g: number,
  b: number,
  amount = 1.0,
  method: 'max' | 'avg' = 'max'
): { r: number; g: number; b: number } {
  if (amount <= 0) return { r, g, b };
  
  let targetG = g;
  if (method === 'max') {
    const maxOther = Math.max(r, b);
    if (g > maxOther) {
      targetG = g - amount * (g - maxOther);
    }
  } else {
    const avgOther = (r + b) * 0.5;
    if (g > avgOther) {
      targetG = g - amount * (g - avgOther);
    }
  }

  return {
    r,
    g: Math.max(0, targetG),
    b
  };
}

/**
 * ---------------------------------------------------------------------
 * Auto Screen Transfer Function (Auto-STF), PixInsight-style.
 * ---------------------------------------------------------------------
 * This is the algorithm behind PixInsight's "AutoStretch" button: pick a
 * black point a fixed number of MAD (median absolute deviation) units below
 * the median, then choose a midtones balance ("m") for the classic MTF
 * (midtones transfer function) curve so the median lands on a target
 * background brightness (0.25 by default). Applied per colour channel
 * (rather than one shared curve for R, G and B), this is also what actually
 * *removes* a colour cast: each channel's background gets pulled to the same
 * level independently, regardless of how unbalanced the raw sensor data was.
 */

interface StfParams {
  dataMin: number;
  range: number;
  blackPoint: number;
  midtones: number;
}

function computeMedianSorted(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeAutoStf(rawSamples: number[], targetBackground: number, shadowsClipping: number): StfParams {
  if (rawSamples.length === 0) {
    return { dataMin: 0, range: 1, blackPoint: 0, midtones: 0.5 };
  }

  const sorted = rawSamples.slice().sort((a, b) => a - b);
  const n = sorted.length;

  // Robust min/max (skip the extreme 0.01% tails) so a single hot pixel or
  // cosmic-ray hit can't stretch the whole normalization range.
  const loIdx = Math.floor(n * 0.0001);
  const hiIdx = Math.min(n - 1, Math.ceil(n * 0.9999));
  let dataMin = sorted[loIdx];
  let dataMax = sorted[hiIdx];
  if (!(dataMax > dataMin)) {
    dataMin = sorted[0];
    dataMax = sorted[n - 1];
  }
  const range = (dataMax - dataMin) || 1;

  const normalized = sorted.map(v => Math.max(0, Math.min(1, (v - dataMin) / range)));
  const median = computeMedianSorted(normalized);
  const deviations = normalized.map(v => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = computeMedianSorted(deviations);

  // Black point: `shadowsClipping` MAD-units below the median (default -2.8,
  // PixInsight's own default). 1.4826 scales MAD to be comparable to a
  // standard deviation for a normal distribution — standard convention.
  let blackPoint = median + shadowsClipping * mad * 1.4826;
  blackPoint = Math.max(0, Math.min(0.99, blackPoint));

  const x = Math.max(0, Math.min(1, (median - blackPoint) / Math.max(1e-6, 1 - blackPoint)));

  // Midtones balance: solve MTF(x; m) = targetBackground for m (closed form).
  let midtones: number;
  if (mad <= 1e-6 || x <= 1e-6) {
    midtones = 0.5; // flat/degenerate data (e.g. a bias frame): identity-ish mapping
  } else {
    const t = targetBackground;
    const denom = 2 * t * x - t - x;
    midtones = Math.abs(denom) < 1e-9 ? 0.5 : (x * (t - 1)) / denom;
    midtones = Math.max(0.001, Math.min(0.999, midtones));
  }

  return { dataMin, range, blackPoint, midtones };
}

/** The classic midtones transfer function curve: MTF(0)=0, MTF(1)=1, MTF(m)=0.5 */
function mtf(x: number, m: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (m <= 0) return 1;
  if (m >= 1) return 0;
  if (Math.abs(x - m) < 1e-9) return 0.5;
  return ((m - 1) * x) / ((2 * m - 1) * x - m);
}

function applyStf(value: number, stf: StfParams): number {
  const norm = Math.max(0, Math.min(1, (value - stf.dataMin) / stf.range));
  const x = Math.max(0, Math.min(1, (norm - stf.blackPoint) / Math.max(1e-6, 1 - stf.blackPoint)));
  return mtf(x, stf.midtones);
}

/**
 * Gathers a representative sample of raw values for one Bayer colour channel
 * only (matched via `isTargetChannel`), scanning in whole 2x2 mosaic cells so
 * every visited cell contributes its correct R/G/G/B members and channels
 * never get mixed together.
 */
function collectChannelSamples(
  pixelData: Float32Array | Uint16Array | Uint8Array,
  srcWidth: number,
  srcHeight: number,
  isTargetChannel: (x: number, y: number) => boolean,
  maxSamples = 6000
): number[] {
  const samples: number[] = [];
  const totalCells = Math.max(1, (srcWidth * srcHeight) / 4);
  const cellStride = Math.max(1, Math.floor(Math.sqrt(totalCells / maxSamples)));
  const step = Math.max(2, cellStride * 2);

  for (let y = 0; y < srcHeight; y += step) {
    for (let x = 0; x < srcWidth; x += step) {
      for (let oy = 0; oy < 2; oy++) {
        for (let ox = 0; ox < 2; ox++) {
          const px = x + ox;
          const py = y + oy;
          if (px >= srcWidth || py >= srcHeight) continue;
          if (isTargetChannel(px, py)) {
            const v = pixelData[py * srcWidth + px];
            if (v !== undefined && isFinite(v) && !isNaN(v)) samples.push(v);
          }
        }
      }
    }
  }
  return samples;
}

/**
 * Generates a clean JPEG preview representation from raw FITS pixel data.
 * Produces crisp, full-size (width x height) previews for both OSC Color (Bayer CFA)
 * and Monochrome sensors, with an automatic PixInsight-style stretch and,
 * for colour data, automatic per-channel colour balance.
 */
export function generateFitsPreviewJpeg(
  pixelData: Float32Array | Uint16Array | Uint8Array,
  width: number,
  height: number,
  options: FitsPreviewOptions = {}
): string {
  const {
    maxDimension = 1920,
    bayerPattern,
    quality = 0.88,
    flipY = false,
    enableScnr = false,
    scnrAmount = 1.0,
    scnrMethod = 'max',
    targetBackground = 0.25,
    shadowsClipping = -2.8
  } = options;

  if (!pixelData || pixelData.length === 0 || width <= 0 || height <= 0) {
    return generateFallbackThumbnail('FITS', 'LIGHT');
  }

  try {
    // Normalize Bayer pattern string
    let pattern = (bayerPattern || '').toUpperCase().trim().replace(/[^A-Z]/g, '');
    if (pattern.includes('RGGB')) pattern = 'RGGB';
    else if (pattern.includes('BGGR')) pattern = 'BGGR';
    else if (pattern.includes('GBRG')) pattern = 'GBRG';
    else if (pattern.includes('GRBG')) pattern = 'GRBG';
    else pattern = '';

    const isBayer = pattern === 'RGGB' || pattern === 'BGGR' || pattern === 'GBRG' || pattern === 'GRBG';

    if (isBayer && width >= 2 && height >= 2) {
      return generateOscColorBilinearJpeg(
        pixelData,
        width,
        height,
        pattern,
        maxDimension,
        quality,
        flipY,
        enableScnr,
        scnrAmount,
        scnrMethod,
        targetBackground,
        shadowsClipping
      );
    } else {
      return generateMonoJpeg(pixelData, width, height, maxDimension, quality, flipY, targetBackground, shadowsClipping);
    }
  } catch (err) {
    console.error('Error generating FITS preview JPEG:', err);
    return generateFallbackThumbnail('FITS', 'LIGHT');
  }
}

/**
 * High-definition Bilinear Debayering & Astrophotography True Color Render.
 * Uses direct target-resolution sampling with Bayer 2x2 grid alignment for
 * maximum speed & low memory footprint, and an independent (per-channel,
 * "unlinked") Auto-STF stretch so the automatic colour balance actually
 * corrects a green/blue cast instead of preserving it.
 */
function generateOscColorBilinearJpeg(
  pixelData: Float32Array | Uint16Array | Uint8Array,
  srcWidth: number,
  srcHeight: number,
  pattern: string,
  maxDimension: number,
  quality: number,
  flipY: boolean,
  enableScnr: boolean,
  scnrAmount: number,
  scnrMethod: 'max' | 'avg',
  targetBackground: number,
  shadowsClipping: number
): string {
  const isR = (x: number, y: number): boolean => {
    const bx = x % 2;
    const by = y % 2;
    if (pattern === 'RGGB') return bx === 0 && by === 0;
    if (pattern === 'BGGR') return bx === 1 && by === 1;
    if (pattern === 'GBRG') return bx === 0 && by === 1;
    if (pattern === 'GRBG') return bx === 1 && by === 0;
    return false;
  };

  const isB = (x: number, y: number): boolean => {
    const bx = x % 2;
    const by = y % 2;
    if (pattern === 'RGGB') return bx === 1 && by === 1;
    if (pattern === 'BGGR') return bx === 0 && by === 0;
    if (pattern === 'GBRG') return bx === 1 && by === 0;
    if (pattern === 'GRBG') return bx === 0 && by === 1;
    return false;
  };

  const getPixel = (x: number, y: number): number => {
    const clampedX = Math.max(0, Math.min(srcWidth - 1, x));
    const clampedY = Math.max(0, Math.min(srcHeight - 1, y));
    const actualY = flipY ? (srcHeight - 1 - clampedY) : clampedY;
    return pixelData[actualY * srcWidth + clampedX] || 0;
  };

  // Independent black point + midtones stretch per channel, sampled straight
  // from the raw mosaic at each channel's own native positions (G combines
  // both green sub-pixel positions). This is what actually removes a colour
  // cast: R, G and B each get pulled to the same target background level
  // independently, instead of sharing one curve that preserves whatever
  // imbalance the sensor/sky produced.
  const rSamples = collectChannelSamples(pixelData, srcWidth, srcHeight, isR);
  const bSamples = collectChannelSamples(pixelData, srcWidth, srcHeight, isB);
  const gSamples = collectChannelSamples(pixelData, srcWidth, srcHeight, (x, y) => !isR(x, y) && !isB(x, y));

  const stfR = computeAutoStf(rSamples, targetBackground, shadowsClipping);
  const stfG = computeAutoStf(gSamples, targetBackground, shadowsClipping);
  const stfB = computeAutoStf(bSamples, targetBackground, shadowsClipping);

  // 2. Compute target dimensions capped at maxDimension
  let dstWidth = srcWidth;
  let dstHeight = srcHeight;
  if (srcWidth > maxDimension || srcHeight > maxDimension) {
    const scale = Math.min(maxDimension / srcWidth, maxDimension / srcHeight);
    dstWidth = Math.max(16, Math.floor(srcWidth * scale));
    dstHeight = Math.max(16, Math.floor(srcHeight * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = dstWidth;
  canvas.height = dstHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return generateFallbackThumbnail('FITS', 'LIGHT');

  const imgData = ctx.createImageData(dstWidth, dstHeight);
  const data = imgData.data;

  const scaleX = srcWidth / dstWidth;
  const scaleY = srcHeight / dstHeight;

  // Bilinear Debayering pass sampled directly onto destination canvas
  for (let dy = 0; dy < dstHeight; dy++) {
    const srcY = Math.floor(dy * scaleY);
    const rowOffset = dy * dstWidth * 4;

    for (let dx = 0; dx < dstWidth; dx++) {
      const srcX = Math.floor(dx * scaleX);

      let r = 0, g = 0, b = 0;

      if (isR(srcX, srcY)) {
        r = getPixel(srcX, srcY);
        g = (getPixel(srcX - 1, srcY) + getPixel(srcX + 1, srcY) + getPixel(srcX, srcY - 1) + getPixel(srcX, srcY + 1)) * 0.25;
        b = (getPixel(srcX - 1, srcY - 1) + getPixel(srcX + 1, srcY - 1) + getPixel(srcX - 1, srcY + 1) + getPixel(srcX + 1, srcY + 1)) * 0.25;
      } else if (isB(srcX, srcY)) {
        b = getPixel(srcX, srcY);
        g = (getPixel(srcX - 1, srcY) + getPixel(srcX + 1, srcY) + getPixel(srcX, srcY - 1) + getPixel(srcX, srcY + 1)) * 0.25;
        r = (getPixel(srcX - 1, srcY - 1) + getPixel(srcX + 1, srcY - 1) + getPixel(srcX - 1, srcY + 1) + getPixel(srcX + 1, srcY + 1)) * 0.25;
      } else {
        g = getPixel(srcX, srcY);
        const hasRNeighborHoriz = isR(srcX - 1, srcY) || isR(srcX + 1, srcY);
        if (hasRNeighborHoriz) {
          r = (getPixel(srcX - 1, srcY) + getPixel(srcX + 1, srcY)) * 0.5;
          b = (getPixel(srcX, srcY - 1) + getPixel(srcX, srcY + 1)) * 0.5;
        } else {
          b = (getPixel(srcX - 1, srcY) + getPixel(srcX + 1, srcY)) * 0.5;
          r = (getPixel(srcX, srcY - 1) + getPixel(srcX, srcY + 1)) * 0.5;
        }
      }

      let byteR = Math.max(0, Math.min(255, Math.round(applyStf(r, stfR) * 255)));
      let byteG = Math.max(0, Math.min(255, Math.round(applyStf(g, stfG) * 255)));
      let byteB = Math.max(0, Math.min(255, Math.round(applyStf(b, stfB) * 255)));

      if (enableScnr && scnrAmount > 0) {
        const scnr = applyScnrGreen(byteR, byteG, byteB, scnrAmount, scnrMethod);
        byteR = scnr.r;
        byteG = scnr.g;
        byteB = scnr.b;
      }

      const destIdx = rowOffset + dx * 4;
      data[destIdx] = byteR;
      data[destIdx + 1] = byteG;
      data[destIdx + 2] = byteB;
      data[destIdx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * High-definition Monochrome FITS JPEG generation, with the same
 * PixInsight-style Auto-STF stretch as the colour path.
 */
function generateMonoJpeg(
  pixelData: Float32Array | Uint16Array | Uint8Array,
  srcWidth: number,
  srcHeight: number,
  maxDimension: number,
  quality: number,
  flipY: boolean,
  targetBackground: number,
  shadowsClipping: number
): string {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return generateFallbackThumbnail('FITS', 'LIGHT');
  }

  const totalPixels = srcWidth * srcHeight;
  const sampleCount = Math.min(20000, totalPixels);
  const step = Math.max(1, Math.floor(totalPixels / sampleCount));
  const samples: number[] = [];

  for (let i = 0; i < totalPixels; i += step) {
    const val = pixelData[i];
    if (val !== undefined && isFinite(val) && !isNaN(val)) {
      samples.push(val);
    }
  }

  const stf = computeAutoStf(samples, targetBackground, shadowsClipping);

  let dstWidth = srcWidth;
  let dstHeight = srcHeight;
  if (srcWidth > maxDimension || srcHeight > maxDimension) {
    const scale = Math.min(maxDimension / srcWidth, maxDimension / srcHeight);
    dstWidth = Math.max(16, Math.floor(srcWidth * scale));
    dstHeight = Math.max(16, Math.floor(srcHeight * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = dstWidth;
  canvas.height = dstHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return generateFallbackThumbnail('FITS', 'LIGHT');

  const imgData = ctx.createImageData(dstWidth, dstHeight);
  const data = imgData.data;

  const scaleX = srcWidth / dstWidth;
  const scaleY = srcHeight / dstHeight;

  for (let dy = 0; dy < dstHeight; dy++) {
    const srcY = Math.floor(dy * scaleY);
    const actualSrcY = flipY ? (srcHeight - 1 - srcY) : srcY;
    const srcRowOffset = actualSrcY * srcWidth;
    const dstRowOffset = dy * dstWidth * 4;

    for (let dx = 0; dx < dstWidth; dx++) {
      const srcX = Math.floor(dx * scaleX);
      const val = pixelData[srcRowOffset + srcX] || 0;
      const byteVal = Math.max(0, Math.min(255, Math.round(applyStf(val, stf) * 255)));

      const destIdx = dstRowOffset + dx * 4;
      data[destIdx] = byteVal;
      data[destIdx + 1] = byteVal;
      data[destIdx + 2] = byteVal;
      data[destIdx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Apply SCNR filter directly on an existing DataURL image in memory
 */
export function applyScnrToDataUrl(
  dataUrl: string,
  amount = 1.0,
  method: 'max' | 'avg' = 'max'
): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl || amount <= 0) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;

        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          
          let targetG = g;
          if (method === 'max') {
            const maxOther = Math.max(r, b);
            if (g > maxOther) {
              targetG = g - amount * (g - maxOther);
            }
          } else {
            const avgOther = (r + b) * 0.5;
            if (g > avgOther) {
              targetG = g - amount * (g - avgOther);
            }
          }
          d[i + 1] = Math.max(0, Math.min(255, Math.round(targetG)));
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch (err) {
        console.error('Error applying SCNR to DataURL:', err);
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Clean SVG placeholder when no pixel data is available
 */
export function generateFallbackThumbnail(name: string, type: string): string {
  const isDark = type === 'DARK' || type === 'BIAS';
  const isFlat = type === 'FLAT';
  const bg = isDark ? '#06090e' : isFlat ? '#1e293b' : '#0b0f19';
  const accent = isDark ? '#475569' : isFlat ? '#3b82f6' : '#2563eb';
  const cleanTitle = (name || 'FITS').slice(0, 24);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
      <rect width="800" height="800" fill="${bg}"/>
      <circle cx="400" cy="360" r="${isDark ? 24 : 120}" fill="${accent}" opacity="0.2"/>
      <circle cx="400" cy="360" r="${isDark ? 12 : 50}" fill="${accent}" opacity="0.6"/>
      <text x="400" y="560" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="600" fill="#f1f5f9" text-anchor="middle">${cleanTitle}</text>
      <text x="400" y="620" font-family="ui-monospace, monospace" font-size="24" font-weight="600" fill="${accent}" text-anchor="middle">[${type}]</text>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Alias for backwards compatibility
export const generateFitsLowResThumbnail = generateFitsPreviewJpeg;
