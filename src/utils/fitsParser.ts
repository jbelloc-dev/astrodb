import { FitsHeaderCard, FitsMetadata } from '../types/fits';
import { generateFitsPreviewJpeg, generateFallbackThumbnail } from './thumbnailGenerator';

export class FitsParser {
  /**
   * Parses an ArrayBuffer of a FITS file and extracts headers and data.
   *
   * Transparently gunzips the buffer first if it looks gzip-compressed
   * (magic bytes 1F 8B), so plain gzip-wrapped FITS (".fits.gz") actually
   * gets decoded instead of silently producing a blank/garbage record.
   * True Rice/CFITSIO tile-compressed FITS (".fz", a different and far more
   * involved format) is explicitly detected and rejected with a clear error
   * rather than being fed byte-for-byte into the header parser, which would
   * previously produce a bogus fallback thumbnail with no real metadata.
   */
  static async parseFits(
    buffer: ArrayBuffer,
    fileName: string,
    fileSize?: number,
    filePath?: string,
    precomputedHash?: string
  ): Promise<FitsMetadata> {
    // Hash the original on-disk bytes (before any decompression) so re-scanning
    // the same directory can be recognised as "already imported" even if the
    // file gets renamed or moved, and so exact duplicate frames are traceable.
    // Callers that already hashed the buffer to check for duplicates before
    // parsing (see DirectoryScanner) can pass that hash in to avoid redoing it.
    const file_hash = precomputedHash || await this.hashBuffer(buffer);

    buffer = await this.decompressIfNeeded(buffer, fileName);

    const dataView = new DataView(buffer);
    const textDecoder = new TextDecoder('ascii');
    
    let headerOffset = 0;
    const cards: FitsHeaderCard[] = [];
    const headerMap: Record<string, any> = {};
    let isEnd = false;

    // FITS headers are organized in 2880-byte blocks of 36 cards (80 chars each)
    while (headerOffset < buffer.byteLength && !isEnd) {
      const blockLength = Math.min(2880, buffer.byteLength - headerOffset);
      const blockBytes = new Uint8Array(buffer, headerOffset, blockLength);
      const blockText = textDecoder.decode(blockBytes);

      for (let i = 0; i < 36; i++) {
        const cardIndex = i * 80;
        if (cardIndex + 80 > blockText.length) break;
        const cardStr = blockText.substring(cardIndex, cardIndex + 80);

        if (cardStr.startsWith('END     ') || cardStr.trim() === 'END') {
          isEnd = true;
          break;
        }

        const card = this.parseCard(cardStr);
        if (card) {
          cards.push(card);
          if (card.key && !['COMMENT', 'HISTORY', ''].includes(card.key)) {
            headerMap[card.key] = card.value;
          }
        }
      }

      headerOffset += 2880;
    }

    // Extract core metadata with smart aliases
    const bitpix = Number(headerMap['BITPIX'] || 16);
    const naxis = Number(headerMap['NAXIS'] || 2);
    const width = Number(headerMap['NAXIS1'] || 0);
    const height = Number(headerMap['NAXIS2'] || 0);
    const bscale = Number(headerMap['BSCALE'] !== undefined ? headerMap['BSCALE'] : 1);
    const bzero = Number(headerMap['BZERO'] !== undefined ? headerMap['BZERO'] : (bitpix === 16 ? 32768 : 0));

    // File name inferences if headers are missing
    const inferred = this.inferFromFileName(fileName);

    const object_name = (
      headerMap['OBJECT'] ||
      headerMap['OBJNAME'] ||
      headerMap['TARGET'] ||
      inferred.object ||
      'Desconegut'
    ).toString().trim();

    const image_type = this.normalizeImageType(
      headerMap['IMAGETYP'] ||
      headerMap['FRAME'] ||
      headerMap['OBSTYPE'] ||
      headerMap['DATA-TYP'] ||
      inferred.type ||
      'LIGHT'
    );

    const exposure_time = Number(
      headerMap['EXPTIME'] !== undefined ? headerMap['EXPTIME'] :
      headerMap['EXPOSURE'] !== undefined ? headerMap['EXPOSURE'] :
      headerMap['EXP-TIME'] !== undefined ? headerMap['EXP-TIME'] :
      inferred.exposure || 0
    );

    const sensor_temp = headerMap['CCD-TEMP'] !== undefined ? Number(headerMap['CCD-TEMP']) :
      headerMap['TEMPERAT'] !== undefined ? Number(headerMap['TEMPERAT']) :
      headerMap['SET-TEMP'] !== undefined ? Number(headerMap['SET-TEMP']) :
      headerMap['SENS-TMP'] !== undefined ? Number(headerMap['SENS-TMP']) :
      inferred.temp !== undefined ? inferred.temp : null;

    let rotation_angle = headerMap['ROTATANG'] !== undefined ? Number(headerMap['ROTATANG']) :
      headerMap['ROTANGLE'] !== undefined ? Number(headerMap['ROTANGLE']) :
      headerMap['POSANGLE'] !== undefined ? Number(headerMap['POSANGLE']) :
      headerMap['CROTA2'] !== undefined ? Number(headerMap['CROTA2']) :
      headerMap['CROTA1'] !== undefined ? Number(headerMap['CROTA1']) :
      inferred.angle !== undefined ? inferred.angle : null;

    if (rotation_angle !== null) {
      rotation_angle = ((rotation_angle % 360) + 360) % 360;
    }

    const date_obs = (
      headerMap['DATE-OBS'] ||
      headerMap['DATE'] ||
      headerMap['UT-DATE'] ||
      inferred.date ||
      new Date().toISOString()
    ).toString().trim();

    const filter_name = (
      headerMap['FILTER'] ||
      headerMap['FILTNAME'] ||
      headerMap['FILTER1'] ||
      inferred.filter ||
      'None'
    ).toString().trim();

    const telescope = (headerMap['TELESCOP'] || headerMap['INSTRUME'] || '').toString().trim();
    const camera = (headerMap['CAMERA'] || headerMap['INSTRUME'] || headerMap['DETECTOR'] || '').toString().trim();
    const focal_length = headerMap['FOCALLEN'] !== undefined ? Number(headerMap['FOCALLEN']) : null;
    const gain = headerMap['GAIN'] !== undefined ? Number(headerMap['GAIN']) : 
                 headerMap['ISO'] !== undefined ? Number(headerMap['ISO']) : null;
    const airmass = headerMap['AIRMASS'] !== undefined ? Number(headerMap['AIRMASS']) : null;
    const ra = (headerMap['RA'] || headerMap['OBJCTRA'] || '').toString();
    const dec = (headerMap['DEC'] || headerMap['OBJCTDEC'] || '').toString();

    const object_category = this.categorizeObject(object_name, image_type);

    // Bayer CFA Pattern detection (BAYERPAT, CFA_PAT, CFA-PAT, COLORTYP, XBAYROFF, YBAYROFF, ROWORDER, OSC camera inference)
    let bayer_raw = (
      headerMap['BAYERPAT'] ||
      headerMap['BAYER'] ||
      headerMap['COLORTYP'] ||
      headerMap['CFA_PAT'] ||
      headerMap['CFA-PAT'] ||
      headerMap['CFAINFO'] ||
      headerMap['PATTERN'] ||
      ''
    ).toString().trim().toUpperCase();

    // Check if offsets exist (e.g. XBAYROFF, YBAYROFF, BAYOFFX, BAYOFFY)
    const bayOffX = Number(headerMap['XBAYROFF'] ?? headerMap['BAYOFFX'] ?? 0);
    const bayOffY = Number(headerMap['YBAYROFF'] ?? headerMap['BAYOFFY'] ?? 0);
    const rowOrder = (headerMap['ROWORDER'] || '').toString().trim().toUpperCase();

    let bayer_pattern = bayer_raw.replace(/[^A-Z]/g, '');

    // Normalize known alias strings e.g. "RGGB4", "GBRG4", "BAYER_RGGB", "RGBG"
    if (bayer_pattern.includes('RGGB')) bayer_pattern = 'RGGB';
    else if (bayer_pattern.includes('BGGR')) bayer_pattern = 'BGGR';
    else if (bayer_pattern.includes('GBRG')) bayer_pattern = 'GBRG';
    else if (bayer_pattern.includes('GRBG')) bayer_pattern = 'GRBG';
    else if (bayer_pattern.length !== 4) bayer_pattern = '';

    // If Bayer offsets are present (e.g., 0,1 or 1,0), adjust standard RGGB accordingly
    if (!bayer_pattern && (headerMap['XBAYROFF'] !== undefined || headerMap['BAYOFFX'] !== undefined)) {
      if (bayOffX === 0 && bayOffY === 0) bayer_pattern = 'RGGB';
      else if (bayOffX === 1 && bayOffY === 0) bayer_pattern = 'GRBG';
      else if (bayOffX === 0 && bayOffY === 1) bayer_pattern = 'GBRG';
      else if (bayOffX === 1 && bayOffY === 1) bayer_pattern = 'BGGR';
    }

    // If still empty, infer from camera model, instrument, filter or filename
    if (!bayer_pattern) {
      const fullText = (camera + ' ' + (headerMap['INSTRUME'] || '') + ' ' + (headerMap['DETECTOR'] || '') + ' ' + filter_name + ' ' + fileName).toUpperCase();
      const isOscCamera = (
        fullText.includes('MC') || // ZWO ASI2600MC, ASI533MC, ASI294MC, ASI585MC, ASI071MC, ASI2400MC, ASI6200MC, ASI678MC, ASI462MC, ASI485MC, ASI290MC, ASI178MC, ASI183MC, ASI224MC, ASI120MC, etc.
        fullText.includes('COLOR') ||
        fullText.includes('COLOUR') ||
        fullText.includes('QHY268C') ||
        fullText.includes('QHY533C') ||
        fullText.includes('QHY600C') ||
        fullText.includes('QHY168C') ||
        fullText.includes('QHY247C') ||
        fullText.includes('QHY128C') ||
        fullText.includes('QHY367C') ||
        fullText.includes('QHY183C') ||
        fullText.includes('QHY294C') ||
        fullText.includes('QHY462C') ||
        fullText.includes('QHY585C') ||
        (fullText.includes('QHY') && fullText.includes(' C')) ||
        fullText.includes('SV305') ||
        fullText.includes('SV405CC') ||
        fullText.includes('SV505C') ||
        fullText.includes('SV705C') ||
        fullText.includes('SV905C') ||
        fullText.includes('URANUS-C') ||
        fullText.includes('SATURN-C') ||
        fullText.includes('NEPTUNE-C') ||
        fullText.includes('MARS-C') ||
        fullText.includes('POSEIDON-C') ||
        fullText.includes('ARES-C') ||
        fullText.includes('CANON') ||
        fullText.includes('NIKON') ||
        fullText.includes('SONY') ||
        fullText.includes('PENTAX') ||
        fullText.includes('FUJI') ||
        fullText.includes('OLYMPUS') ||
        fullText.includes('PANASONIC') ||
        fullText.includes('EOS') ||
        fullText.includes('DSLR') ||
        fullText.includes('OSC') ||
        fullText.includes('ONE-SHOT') ||
        fullText.includes('BAYER') ||
        fullText.includes('DEBAYER') ||
        fullText.includes('CFA')
      );

      if (isOscCamera) {
        bayer_pattern = 'RGGB'; // Universal astronomical CMOS/DSLR default
      }
    }

    // Extract Downsampled Pixel Data & Generate Faithful Preview JPEG
    let thumbnail_url = '';
    let pixelData: Float32Array | undefined;

    if (naxis >= 2 && width > 0 && height > 0 && headerOffset < buffer.byteLength) {
      try {
        const { pixelData: downsampled, width: dw, height: dh } = this.extractDownsampledPixelArray(
          buffer,
          headerOffset,
          width,
          height,
          bitpix,
          bscale,
          bzero,
          1000,
          !!bayer_pattern
        );
        pixelData = downsampled;
        thumbnail_url = generateFitsPreviewJpeg(downsampled, dw, dh, {
          maxDimension: 1000,
          bayerPattern: bayer_pattern || undefined,
          quality: 0.82
        });
      } catch (err) {
        console.warn('Could not decode pixel data for thumbnail, generating fallback', err);
        thumbnail_url = generateFallbackThumbnail(object_name, image_type);
      }
    } else {
      thumbnail_url = generateFallbackThumbnail(object_name, image_type);
    }

    const id = `fits_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    return {
      id,
      file_name: fileName,
      file_path: filePath || fileName,
      file_size: fileSize || buffer.byteLength,
      object_name,
      object_category,
      image_type,
      exposure_time,
      sensor_temp: sensor_temp !== null && !isNaN(sensor_temp) ? sensor_temp : null,
      rotation_angle: rotation_angle !== null && !isNaN(rotation_angle) ? rotation_angle : null,
      date_obs,
      filter_name,
      telescope,
      camera,
      focal_length: focal_length !== null && !isNaN(focal_length) ? focal_length : null,
      gain: gain !== null && !isNaN(gain) ? gain : null,
      bayer_pattern: bayer_pattern || undefined,
      ra,
      dec,
      airmass,
      width,
      height,
      bitpix,
      thumbnail_url,
      headers_json: headerMap,
      headers_cards: cards,
      pixelData,
      file_hash
    };
  }

  /**
   * SHA-256 hash of the raw file bytes, hex-encoded. Cheap: we already have
   * the whole buffer in memory to parse it, so this adds no extra file I/O.
   * Public so callers can hash a file up front (e.g. to check for content
   * duplicates before doing any real parsing/thumbnail work).
   */
  static async hashBuffer(buffer: ArrayBuffer): Promise<string> {
    try {
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (err) {
      console.warn('Could not compute file hash:', err);
      return '';
    }
  }

  /**
   * Detects and handles compressed FITS variants:
   *  - Plain gzip (".fits.gz", magic bytes 1F 8B) is transparently inflated
   *    using the browser's native DecompressionStream, so it decodes exactly
   *    like an uncompressed FITS file.
   *  - Rice/CFITSIO tile-compressed FITS (".fz") is a fundamentally different,
   *    much more involved on-disk layout (compressed tiles inside a binary
   *    table, not a simple pixel array) that this lightweight parser does not
   *    implement. Rather than silently reading its compressed bytes as if
   *    they were raw pixels (which previously produced a bogus, meaningless
   *    thumbnail), we detect it and throw a clear, catchable error so the
   *    file is skipped with an honest reason instead of a wrong result.
   */
  private static async decompressIfNeeded(buffer: ArrayBuffer, fileName: string): Promise<ArrayBuffer> {
    const header = new Uint8Array(buffer.slice(0, 2));
    const isGzip = header.length === 2 && header[0] === 0x1f && header[1] === 0x8b;

    if (isGzip) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error(`${fileName} és un FITS comprimit amb gzip, però aquest navegador no suporta DecompressionStream per descomprimir-lo.`);
      }
      const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
      const decompressed = await new Response(stream).arrayBuffer();
      return decompressed;
    }

    const looksLikePlainFits = new TextDecoder('ascii').decode(new Uint8Array(buffer.slice(0, 6))) === 'SIMPLE';
    if (!looksLikePlainFits && fileName.toLowerCase().endsWith('.fz')) {
      throw new Error(`${fileName} sembla estar comprimit amb Rice/CFITSIO (.fz). Cal descomprimir-lo amb 'funpack' abans de pujar-lo.`);
    }

    return buffer;
  }

  /**
   * Standalone preview generation helper
   */
  public static generateThumbnail(
    pixelData: Float32Array | Uint16Array | Uint8Array,
    width: number,
    height: number,
    bayerPattern?: string,
    maxSize = 800
  ): string {
    return generateFitsPreviewJpeg(pixelData, width, height, {
      maxDimension: maxSize,
      bayerPattern,
      quality: 0.90
    });
  }

  /**
   * Parse 80-char FITS card
   */
  private static parseCard(cardStr: string): FitsHeaderCard | null {
    if (!cardStr || cardStr.trim().length === 0) return null;
    
    // Check for comment or history lines
    const key = cardStr.substring(0, 8).trim();
    if (key === 'COMMENT' || key === 'HISTORY' || key === '') {
      return {
        key,
        value: cardStr.substring(8).trim(),
        raw: cardStr
      };
    }

    const equalPos = cardStr.indexOf('=', 8);
    if (equalPos === -1) {
      return {
        key,
        value: cardStr.substring(8).trim(),
        raw: cardStr
      };
    }

    let rest = cardStr.substring(equalPos + 1).trim();
    let comment = '';

    // Check for comments after '/'
    let inQuote = false;
    let slashPos = -1;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "'") {
        inQuote = !inQuote;
      } else if (rest[i] === '/' && !inQuote) {
        slashPos = i;
        break;
      }
    }

    if (slashPos !== -1) {
      comment = rest.substring(slashPos + 1).trim();
      rest = rest.substring(0, slashPos).trim();
    }

    let value: string | number | boolean = rest;

    // String parsing '...'
    if (rest.startsWith("'")) {
      const endQuote = rest.lastIndexOf("'");
      if (endQuote > 0) {
        value = rest.substring(1, endQuote).trim();
      }
    } else if (rest === 'T') {
      value = true;
    } else if (rest === 'F') {
      value = false;
    } else if (!isNaN(Number(rest)) && rest.length > 0) {
      value = Number(rest);
    }

    return {
      key,
      value,
      comment,
      raw: cardStr
    };
  }

  /**
   * Decodes a downsampled pixel array directly from a big-endian FITS stream.
   *
   * IMPORTANT: this uses proper box-averaging, not point-sampling. The
   * previous version picked a single source pixel per destination pixel —
   * for a typical 6000-9000px OSC camera downsampled to a 1000px preview,
   * that means only ~2 rows and ~2 columns out of every 8-10 were ever read,
   * throwing away 90%+ of the data. Real sensor read/shot noise on a
   * per-pixel basis then shows up directly as colour speckle in the
   * downsampled mosaic, which debayering happily turns into a visible tint.
   * Averaging every same-colour sample in each block (still split by Bayer
   * sub-position, so different colours never get mixed) uses all the data,
   * kills that noise/aliasing, and keeps the mosaic pattern perfectly
   * regular for the debayering step that follows.
   */
  public static extractDownsampledPixelArray(
    buffer: ArrayBuffer,
    offset: number,
    srcWidth: number,
    srcHeight: number,
    bitpix: number,
    bscale = 1,
    bzero = 0,
    maxDim = 1000,
    hasBayer = false
  ): { pixelData: Float32Array; width: number; height: number } {
    if (srcWidth <= 0 || srcHeight <= 0) {
      return { pixelData: new Float32Array(0), width: 0, height: 0 };
    }

    let step = 1;
    if (srcWidth > maxDim || srcHeight > maxDim) {
      const scale = Math.max(srcWidth / maxDim, srcHeight / maxDim);
      step = Math.max(1, Math.floor(scale));
    }

    // For OSC/Bayer sensors, `step` must stay even so every destination pixel
    // keeps landing on one consistent, unambiguous position within the 2x2
    // RGGB/BGGR/... repeat unit (see the averaging loop below).
    if (hasBayer && step > 1 && step % 2 !== 0) step += 1;

    const dstWidth = Math.max(2, Math.floor(srcWidth / step));
    const dstHeight = Math.max(2, Math.floor(srcHeight / step));
    const result = new Float32Array(dstWidth * dstHeight);
    const view = new DataView(buffer, offset);
    const byteLength = buffer.byteLength - offset;
    const bytesPerPix = Math.abs(bitpix) / 8;

    const getRawVal = (srcIdx: number): number => {
      const bytePos = srcIdx * bytesPerPix;
      if (bytePos < 0 || bytePos >= byteLength) return 0;
      if (bitpix === 16) {
        if (bytePos + 1 >= byteLength) return 0;
        return view.getInt16(bytePos, false) * bscale + bzero;
      } else if (bitpix === 8) {
        return view.getUint8(bytePos) * bscale + bzero;
      } else if (bitpix === 32) {
        if (bytePos + 3 >= byteLength) return 0;
        return view.getInt32(bytePos, false) * bscale + bzero;
      } else if (bitpix === -32) {
        if (bytePos + 3 >= byteLength) return 0;
        return view.getFloat32(bytePos, false) * bscale + bzero;
      } else if (bitpix === -64) {
        if (bytePos + 7 >= byteLength) return 0;
        return view.getFloat64(bytePos, false) * bscale + bzero;
      }
      return 0;
    };

    if (step === 1) {
      // Native resolution — no downsampling needed.
      for (let dy = 0; dy < dstHeight; dy++) {
        const rowBase = dy * srcWidth;
        const dstRowBase = dy * dstWidth;
        for (let dx = 0; dx < dstWidth; dx++) {
          result[dstRowBase + dx] = getRawVal(rowBase + dx);
        }
      }
      return { pixelData: result, width: dstWidth, height: dstHeight };
    }

    if (hasBayer) {
      // Bayer-aware box downsampling ("super-pixel binning"): average every
      // same-colour sample (same row/col parity within the 2x2 mosaic
      // repeat) inside each source block. Every PAIR of output rows/cols
      // (one even, one odd — the two halves of one Bayer repeat) shares a
      // block of size 2*step, so the whole source is tiled exactly once
      // with no gaps and no overlap. Uses ALL the source data and never
      // mixes colour channels, producing a clean, still perfectly-regular
      // Bayer mosaic at the smaller size.
      for (let dy = 0; dy < dstHeight; dy++) {
        const rowParity = dy % 2;
        const blockRow = Math.floor(dy / 2) * (2 * step);
        const dstRowBase = dy * dstWidth;

        for (let dx = 0; dx < dstWidth; dx++) {
          const colParity = dx % 2;
          const blockCol = Math.floor(dx / 2) * (2 * step);

          let sum = 0;
          let count = 0;
          for (let iy = rowParity; iy < 2 * step; iy += 2) {
            const sy = blockRow + iy;
            if (sy >= srcHeight) break;
            const rowBase = sy * srcWidth;
            for (let ix = colParity; ix < 2 * step; ix += 2) {
              const sx = blockCol + ix;
              if (sx >= srcWidth) break;
              sum += getRawVal(rowBase + sx);
              count++;
            }
          }
          result[dstRowBase + dx] = count > 0 ? sum / count : 0;
        }
      }
    } else {
      // Monochrome: plain box-average downsampling (also cuts noise
      // compared to picking a single pixel per block).
      for (let dy = 0; dy < dstHeight; dy++) {
        const blockRow = dy * step;
        const dstRowBase = dy * dstWidth;

        for (let dx = 0; dx < dstWidth; dx++) {
          const blockCol = dx * step;

          let sum = 0;
          let count = 0;
          for (let iy = 0; iy < step; iy++) {
            const sy = blockRow + iy;
            if (sy >= srcHeight) break;
            const rowBase = sy * srcWidth;
            for (let ix = 0; ix < step; ix++) {
              const sx = blockCol + ix;
              if (sx >= srcWidth) break;
              sum += getRawVal(rowBase + sx);
              count++;
            }
          }
          result[dstRowBase + dx] = count > 0 ? sum / count : 0;
        }
      }
    }

    return { pixelData: result, width: dstWidth, height: dstHeight };
  }

  /**
   * Decodes pixel array to Float32Array from big-endian FITS stream
   */
  public static extractPixelArray(
    buffer: ArrayBuffer,
    offset: number,
    width: number,
    height: number,
    bitpix: number,
    bscale = 1,
    bzero = 0
  ): Float32Array {
    const totalPixels = width * height;
    const result = new Float32Array(totalPixels);
    const view = new DataView(buffer, offset);

    if (bitpix === 8) {
      // 8-bit unsigned
      for (let i = 0; i < totalPixels; i++) {
        if (offset + i >= buffer.byteLength) break;
        result[i] = view.getUint8(i) * bscale + bzero;
      }
    } else if (bitpix === 16) {
      // 16-bit integer (signed by spec, unsigned via bzero=32768)
      for (let i = 0; i < totalPixels; i++) {
        const bytePos = i * 2;
        if (offset + bytePos + 1 >= buffer.byteLength) break;
        const raw = view.getInt16(bytePos, false); // big-endian
        result[i] = raw * bscale + bzero;
      }
    } else if (bitpix === 32) {
      // 32-bit int
      for (let i = 0; i < totalPixels; i++) {
        const bytePos = i * 4;
        if (offset + bytePos + 3 >= buffer.byteLength) break;
        result[i] = view.getInt32(bytePos, false) * bscale + bzero;
      }
    } else if (bitpix === -32) {
      // 32-bit float
      for (let i = 0; i < totalPixels; i++) {
        const bytePos = i * 4;
        if (offset + bytePos + 3 >= buffer.byteLength) break;
        result[i] = view.getFloat32(bytePos, false) * bscale + bzero;
      }
    } else if (bitpix === -64) {
      // 64-bit double
      for (let i = 0; i < totalPixels; i++) {
        const bytePos = i * 8;
        if (offset + bytePos + 7 >= buffer.byteLength) break;
        result[i] = view.getFloat64(bytePos, false) * bscale + bzero;
      }
    }

    return result;
  }

  /**
   * Generates a clean JPEG preview data URL
   */
  public static generateThumbnailCanvas(
    pixelData: Float32Array,
    srcWidth: number,
    srcHeight: number,
    maxThumbSize = 1200,
    bayerPattern?: string,
    enableScnr = false,
    scnrAmount = 1.0
  ): string {
    return generateFitsPreviewJpeg(pixelData, srcWidth, srcHeight, {
      maxDimension: maxThumbSize,
      bayerPattern,
      quality: 0.92,
      enableScnr,
      scnrAmount
    });
  }

  /**
   * Creates SVG data URL placeholder if no image array is present
   */
  public static generateFallbackThumbnail(name: string, type: string): string {
    return generateFallbackThumbnail(name, type);
  }

  private static normalizeImageType(typeStr: string): FitsMetadata['image_type'] {
    const upper = (typeStr || '').toUpperCase().trim();
    if (upper.includes('LIGHT') || upper.includes('TARGET') || upper.includes('OBJECT') || upper.includes('SCIENCE')) return 'LIGHT';
    if (upper.includes('DARK')) return 'DARK';
    if (upper.includes('FLAT')) return 'FLAT';
    if (upper.includes('BIAS') || upper.includes('OFFSET')) return 'BIAS';
    if (upper.includes('FOCUS')) return 'FOCUS';
    if (upper.includes('ALIGN')) return 'ALIGNMENT';
    return 'LIGHT';
  }

  private static categorizeObject(name: string, type: string): FitsMetadata['object_category'] {
    if (type === 'DARK' || type === 'FLAT' || type === 'BIAS') return 'Calibració';
    const upper = name.toUpperCase();
    if (upper.startsWith('M31') || upper.startsWith('M33') || upper.startsWith('M51') || upper.startsWith('M81') || upper.startsWith('M82') || upper.startsWith('M101') || upper.startsWith('M104') || upper.includes('GALAXY') || upper.includes('GALAXIA')) return 'Galàxia';
    if (upper.startsWith('M42') || upper.startsWith('M8') || upper.startsWith('M20') || upper.startsWith('M16') || upper.startsWith('M17') || upper.startsWith('M1') || upper.startsWith('NGC7000') || upper.includes('NEBULA') || upper.includes('NEBULOSA') || upper.includes('ROSETTE') || upper.includes('VEIL')) return 'Nebulosa';
    if (upper.startsWith('M13') || upper.startsWith('M22') || upper.startsWith('M45') || upper.startsWith('M44') || upper.includes('CLUSTER') || upper.includes('CUMUL') || upper.includes('PLEIADES')) return 'Cúmul';
    if (upper.includes('JUPITER') || upper.includes('SATURN') || upper.includes('MARS') || upper.includes('MOON') || upper.includes('LLUNA') || upper.includes('SOL') || upper.includes('SUN') || upper.includes('VENUS')) return 'Sistema Solar';
    return 'Deep Sky';
  }

  private static inferFromFileName(name: string): {
    object?: string;
    type?: string;
    exposure?: number;
    temp?: number;
    angle?: number;
    filter?: string;
    date?: string;
  } {
    const res: any = {};
    const lower = name.toLowerCase();

    // Type
    if (lower.includes('dark')) res.type = 'DARK';
    else if (lower.includes('flat')) res.type = 'FLAT';
    else if (lower.includes('bias') || lower.includes('offset')) res.type = 'BIAS';
    else if (lower.includes('light')) res.type = 'LIGHT';

    // Exposure (e.g., 120s, 300s, 60sec, 0.5s)
    const expMatch = name.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)/i);
    if (expMatch) res.exposure = parseFloat(expMatch[1]);

    // Temp (e.g., -10C, -15deg, -10_C, 20C)
    const tempMatch = name.match(/(-?\d+(?:\.\d+)?)\s*(?:C|degC|celsius)/i);
    if (tempMatch) res.temp = parseFloat(tempMatch[1]);

    // Angle / Rotation (e.g., rot45, 90deg, ang180)
    const angMatch = name.match(/(?:rot|angle|ang|posang)\s*=?\s*(\d+(?:\.\d+)?)/i);
    if (angMatch) res.angle = parseFloat(angMatch[1]);

    // Filter
    const filterMatches = ['Ha', 'OIII', 'SII', 'Luminance', 'Lum', 'Red', 'Green', 'Blue', 'Clear', 'DualBand'];
    for (const f of filterMatches) {
      if (new RegExp(`[_-]${f}[_-]`, 'i').test(name) || new RegExp(`\\b${f}\\b`, 'i').test(name)) {
        res.filter = f;
        break;
      }
    }

    // Target object guess
    const cleaned = name.replace(/\.(fits|fit|fts|fz)$/i, '');
    const parts = cleaned.split(/[_-]/);
    if (parts.length > 0 && !['light', 'dark', 'flat', 'bias'].includes(parts[0].toLowerCase())) {
      res.object = parts[0];
    }

    return res;
  }
}
