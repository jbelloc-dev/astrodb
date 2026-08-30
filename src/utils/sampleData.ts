import { FitsMetadata } from '../types/fits';
import { generateFitsPreviewJpeg } from './thumbnailGenerator';

export function generateSampleAstroLibrary(): FitsMetadata[] {
  const samples: FitsMetadata[] = [];

  const targets = [
    {
      name: 'M42 - Orion Nebula',
      category: 'Nebulosa' as const,
      ra: '05h 35m 17s',
      dec: "-05° 23' 28\"",
      filter: 'Ha',
      exposure: 300,
      temp: -10.0,
      angle: 45.0,
      telescope: 'SkyWatcher Esprit 100ED',
      camera: 'ZWO ASI2600MM Pro',
      gain: 100,
      focal: 550,
      pattern: 'nebula_core',
      count: 3
    },
    {
      name: 'M42 - Orion Nebula',
      category: 'Nebulosa' as const,
      ra: '05h 35m 17s',
      dec: "-05° 23' 28\"",
      filter: 'OIII',
      exposure: 300,
      temp: -10.2,
      angle: 45.0,
      telescope: 'SkyWatcher Esprit 100ED',
      camera: 'ZWO ASI2600MM Pro',
      gain: 100,
      focal: 550,
      pattern: 'nebula_core',
      count: 2
    },
    {
      name: 'M31 - Galàxia d\'Andròmeda',
      category: 'Galàxia' as const,
      ra: '00h 42m 44s',
      dec: "+41° 16' 09\"",
      filter: 'Luminance',
      exposure: 180,
      temp: -15.0,
      angle: 92.5,
      telescope: 'Celestron RASA 8',
      camera: 'QHY268M',
      gain: 56,
      focal: 400,
      pattern: 'spiral_galaxy',
      count: 4
    },
    {
      name: 'M31 - Galàxia d\'Andròmeda',
      category: 'Galàxia' as const,
      ra: '00h 42m 44s',
      dec: "+41° 16' 09\"",
      filter: 'Red',
      exposure: 120,
      temp: -14.9,
      angle: 92.5,
      telescope: 'Celestron RASA 8',
      camera: 'QHY268M',
      gain: 56,
      focal: 400,
      pattern: 'spiral_galaxy',
      count: 2
    },
    {
      name: 'NGC 7000 - Nebulosa Amèrica del Nord',
      category: 'Nebulosa' as const,
      ra: '20h 58m 47s',
      dec: "+44° 19' 48\"",
      filter: 'Ha',
      exposure: 600,
      temp: -10.0,
      angle: 180.0,
      telescope: 'William Optics RedCat 51',
      camera: 'ZWO ASI533MM Pro',
      gain: 100,
      focal: 250,
      pattern: 'rich_nebula',
      count: 3
    },
    {
      name: 'NGC 6960 - Nebulosa del Vel',
      category: 'Nebulosa' as const,
      ra: '20h 45m 38s',
      dec: "+30° 42' 30\"",
      filter: 'OIII',
      exposure: 300,
      temp: -10.0,
      angle: 270.0,
      telescope: 'Takahashi FSQ-106ED',
      camera: 'ZWO ASI6200MM Pro',
      gain: 100,
      focal: 530,
      pattern: 'filaments',
      count: 2
    },
    {
      name: 'M13 - Gran Cúmul d\'Hèrcules',
      category: 'Cúmul' as const,
      ra: '16h 41m 41s',
      dec: "+36° 27' 35\"",
      filter: 'Green',
      exposure: 60,
      temp: -5.0,
      angle: 0.0,
      telescope: 'Celestron EdgeHD 11',
      camera: 'ZWO ASI294MM Pro',
      gain: 120,
      focal: 1960,
      pattern: 'globular_cluster',
      count: 3
    },
    {
      name: 'Júpiter i la Gran Taca Vermella',
      category: 'Sistema Solar' as const,
      ra: '03h 12m 04s',
      dec: "+16° 45' 12\"",
      filter: 'RGB',
      exposure: 0.02,
      temp: 18.5,
      angle: 12.0,
      telescope: 'Celestron C14 XLT',
      camera: 'ZWO ASI462MC',
      gain: 250,
      focal: 3910,
      pattern: 'planet_disc',
      count: 2
    }
  ];

  const now = Date.now();
  let fileIdx = 1;

  // High resolution dimensions for all astronomical lights: 1024x1024
  const width = 1024;
  const height = 1024;

  // Generate Lights
  targets.forEach((target) => {
    const isBayer = target.camera.toUpperCase().includes('MC') || target.camera.toUpperCase().includes('COLOR');
    const bayerPattern = isBayer ? 'RGGB' : undefined;

    for (let i = 1; i <= target.count; i++) {
      const pixelData = generateSyntheticAstroPixels(width, height, target.pattern, i, isBayer);
      
      const thumbnail = generateFitsPreviewJpeg(pixelData, width, height, {
        maxDimension: 2400,
        bayerPattern,
        quality: 0.95
      });

      const dateObs = new Date(now - (fileIdx * 1800000) - (i * 360000)).toISOString();
      const sanitizedName = target.name.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `Light_${sanitizedName}_${target.filter}_${target.exposure}s_bin1_${String(i).padStart(3, '0')}.fits`;

      const headers: Record<string, any> = {
        SIMPLE: true,
        BITPIX: 16,
        NAXIS: 2,
        NAXIS1: width,
        NAXIS2: height,
        BSCALE: 1.0,
        BZERO: 32768,
        OBJECT: target.name,
        IMAGETYP: 'LIGHT',
        EXPTIME: target.exposure,
        'CCD-TEMP': target.temp + (Math.random() * 0.4 - 0.2),
        ROTATANG: (target.angle + (Math.random() * 0.6 - 0.3)) % 360,
        'DATE-OBS': dateObs,
        FILTER: target.filter,
        TELESCOP: target.telescope,
        INSTRUME: target.camera,
        FOCALLEN: target.focal,
        GAIN: target.gain,
        RA: target.ra,
        DEC: target.dec,
        AIRMASS: Number((1.12 + Math.random() * 0.18).toFixed(3)),
        SITELAT: '+41.3879',
        SITELONG: '+02.1699',
        OBSERVER: 'Observatori del Montsec',
        BAYERPAT: isBayer ? 'RGGB' : 'NONE',
        ROWORDER: 'BOTTOM-UP',
        SWCREATE: 'N.I.N.A. 3.0 / Astroberry',
        FITS_VER: '4.0'
      };

      samples.push({
        id: `sample_light_${fileIdx}`,
        file_name: fileName,
        file_path: `/astrophoto/session_2025_03/${fileName}`,
        file_size: 1024 * 1024 * 2 + 2880,
        object_name: target.name,
        object_category: target.category,
        image_type: 'LIGHT',
        exposure_time: target.exposure,
        sensor_temp: Number(headers['CCD-TEMP'].toFixed(1)),
        rotation_angle: Number(headers['ROTATANG'].toFixed(1)),
        date_obs: dateObs,
        filter_name: target.filter,
        telescope: target.telescope,
        camera: target.camera,
        focal_length: target.focal,
        gain: target.gain,
        bayer_pattern: isBayer ? 'RGGB' : undefined,
        ra: target.ra,
        dec: target.dec,
        airmass: headers['AIRMASS'],
        width,
        height,
        bitpix: 16,
        thumbnail_url: thumbnail,
        headers_json: headers,
        pixelData,
        custom_tags: 'AstroCatalog, High Resolution, Good Seeing',
        notes: 'Captura en alta resolució en condicions de cel fosc (Bortle 2/3).'
      });

      fileIdx++;
    }
  });

  // Calibration frames (Darks, Flats, Biases) at 1024x1024
  for (let i = 1; i <= 3; i++) {
    const pixelData = generateSyntheticCalibrationPixels(width, height, 'DARK');
    const thumbnail = generateFitsPreviewJpeg(pixelData, width, height, {
      maxDimension: 1200,
      quality: 0.92
    });
    const fileName = `Dark_Master_300s_m10C_gain100_${String(i).padStart(3, '0')}.fits`;

    samples.push({
      id: `sample_dark_${i}`,
      file_name: fileName,
      file_path: `/astrophoto/calibration/darks/${fileName}`,
      file_size: 1024 * 1024 * 2 + 2880,
      object_name: 'Master Dark -10°C',
      object_category: 'Calibració',
      image_type: 'DARK',
      exposure_time: 300,
      sensor_temp: -10.0,
      rotation_angle: 0.0,
      date_obs: new Date(now - (fileIdx * 1500000)).toISOString(),
      filter_name: 'Dark',
      telescope: 'SkyWatcher Esprit 100ED',
      camera: 'ZWO ASI2600MM Pro',
      focal_length: 550,
      gain: 100,
      width,
      height,
      bitpix: 16,
      thumbnail_url: thumbnail,
      headers_json: {
        OBJECT: 'Dark -10C',
        IMAGETYP: 'DARK',
        EXPTIME: 300,
        'CCD-TEMP': -10.0,
        ROTATANG: 0.0,
        FILTER: 'Dark',
        INSTRUME: 'ZWO ASI2600MM Pro'
      },
      pixelData,
      custom_tags: 'Calibration, Dark Library'
    });
    fileIdx++;
  }

  // Flats
  for (let i = 1; i <= 2; i++) {
    const pixelData = generateSyntheticCalibrationPixels(width, height, 'FLAT');
    const thumbnail = generateFitsPreviewJpeg(pixelData, width, height, {
      maxDimension: 1200,
      quality: 0.92
    });
    const fileName = `Flat_Ha_1.2s_m10C_gain100_${String(i).padStart(3, '0')}.fits`;

    samples.push({
      id: `sample_flat_${i}`,
      file_name: fileName,
      file_path: `/astrophoto/calibration/flats/${fileName}`,
      file_size: 1024 * 1024 * 2 + 2880,
      object_name: 'Master Flat Ha',
      object_category: 'Calibració',
      image_type: 'FLAT',
      exposure_time: 1.2,
      sensor_temp: -10.0,
      rotation_angle: 45.0,
      date_obs: new Date(now - (fileIdx * 1200000)).toISOString(),
      filter_name: 'Ha',
      telescope: 'SkyWatcher Esprit 100ED',
      camera: 'ZWO ASI2600MM Pro',
      focal_length: 550,
      gain: 100,
      width,
      height,
      bitpix: 16,
      thumbnail_url: thumbnail,
      headers_json: {
        OBJECT: 'Flat Ha',
        IMAGETYP: 'FLAT',
        EXPTIME: 1.2,
        'CCD-TEMP': -10.0,
        ROTATANG: 45.0,
        FILTER: 'Ha',
        INSTRUME: 'ZWO ASI2600MM Pro'
      },
      pixelData,
      custom_tags: 'Calibration, Flat Panel'
    });
    fileIdx++;
  }

  // Bias
  for (let i = 1; i <= 2; i++) {
    const pixelData = generateSyntheticCalibrationPixels(width, height, 'BIAS');
    const thumbnail = generateFitsPreviewJpeg(pixelData, width, height, {
      maxDimension: 1200,
      quality: 0.92
    });
    const fileName = `Bias_0.001s_m10C_gain100_${String(i).padStart(3, '0')}.fits`;

    samples.push({
      id: `sample_bias_${i}`,
      file_name: fileName,
      file_path: `/astrophoto/calibration/bias/${fileName}`,
      file_size: 1024 * 1024 * 2 + 2880,
      object_name: 'Master Bias 1ms',
      object_category: 'Calibració',
      image_type: 'BIAS',
      exposure_time: 0.001,
      sensor_temp: -10.0,
      rotation_angle: 0.0,
      date_obs: new Date(now - (fileIdx * 1000000)).toISOString(),
      filter_name: 'None',
      telescope: 'SkyWatcher Esprit 100ED',
      camera: 'ZWO ASI2600MM Pro',
      focal_length: 550,
      gain: 100,
      width,
      height,
      bitpix: 16,
      thumbnail_url: thumbnail,
      headers_json: {
        OBJECT: 'Bias',
        IMAGETYP: 'BIAS',
        EXPTIME: 0.001,
        'CCD-TEMP': -10.0,
        ROTATANG: 0.0,
        FILTER: 'None',
        INSTRUME: 'ZWO ASI2600MM Pro'
      },
      pixelData,
      custom_tags: 'Calibration, Read Noise'
    });
    fileIdx++;
  }

  return samples;
}

/**
 * Generate high-definition synthetic astronomical pixel data with intricate textures,
 * multiple gas cloud layers, dust lanes, diffraction spikes, and star field PSFs.
 */
export function generateSyntheticAstroPixels(
  width: number,
  height: number,
  pattern: string,
  seed: number,
  isBayer = false
): Float32Array {
  const total = width * height;
  const pixels = new Float32Array(total);
  const cx = width / 2;
  const cy = height / 2;

  // 1. Realistic Background Sky Glow & Read Noise (ADU ~1200)
  for (let i = 0; i < total; i++) {
    const noise = (Math.random() - 0.5) * 60 + (Math.random() - 0.5) * 30;
    pixels[i] = 1250 + noise;
  }

  // 2. High-Resolution Deep Sky Structures
  for (let y = 0; y < height; y++) {
    const dy = (y - cy) / (height / 2);
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const dx = (x - cx) / (width / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);

      let signal = 0;
      let rWeight = 1.0;
      let gWeight = 1.0;
      let bWeight = 1.0;

      if (pattern === 'nebula_core') {
        // Multi-frequency filamentary ionization nebulosity (Orion M42 style)
        const angle = Math.atan2(dy, dx);
        const gasCore = Math.exp(-dist * 2.2) * 22000;
        const gasLobe1 = Math.exp(-Math.sqrt((dx - 0.15) ** 2 + (dy + 0.1) ** 2) * 2.8) * 14000;
        const gasLobe2 = Math.exp(-Math.sqrt((dx + 0.2) ** 2 + (dy - 0.15) ** 2) * 2.4) * 11000;
        
        // High frequency turbulent gas clouds
        const turb1 = Math.sin(dx * 12 + dy * 8 + seed) * Math.cos(dy * 14 - dx * 6) * 2800;
        const turb2 = Math.sin(angle * 5 + dist * 10) * Math.exp(-dist * 1.5) * 3200;
        
        // Dark dust bay / filament crossing the core
        const dustBay = Math.exp(-((dx * 0.8 + dy * 0.6 + 0.05) ** 2) * 45) * 0.75;
        
        signal = Math.max(0, (gasCore + gasLobe1 + gasLobe2 + turb1 + turb2) * (1 - dustBay));
        rWeight = 1.45; gWeight = 0.82; bWeight = 0.95;
      } else if (pattern === 'spiral_galaxy') {
        // High-definition inclined spiral galaxy (Andromeda M31 style)
        const rotDx = dx * Math.cos(0.65) - dy * Math.sin(0.65);
        const rotDy = (dx * Math.sin(0.65) + dy * Math.cos(0.65)) * 2.6; // High inclination
        const ellDist = Math.sqrt(rotDx * rotDx + rotDy * rotDy);
        const angle = Math.atan2(rotDy, rotDx);
        
        // Intense galactic core + smooth halo
        const core = Math.exp(-ellDist * 6.5) * 34000;
        const disc = Math.exp(-ellDist * 1.8) * 9000;
        
        // Two major spiral arms with star-forming H-II knots
        const armWave = Math.cos(angle * 2 + ellDist * 14 + seed * 0.5);
        const arm1 = Math.exp(-ellDist * 1.6) * Math.pow(Math.max(0, armWave), 3.5) * 5500;
        
        // Prominent concentric elliptical dust lanes
        const dustLane = Math.exp(-((ellDist - 0.28) ** 2) * 120) * 0.45 + Math.exp(-((ellDist - 0.45) ** 2) * 160) * 0.35;
        
        // Companion dwarf satellite galaxy (M32 style)
        const satDx = dx - 0.38;
        const satDy = dy + 0.32;
        const satDist = Math.sqrt(satDx * satDx + satDy * satDy);
        const satellite = Math.exp(-satDist * 18.0) * 16000;

        signal = (core + disc + arm1) * Math.max(0.2, 1 - dustLane) + satellite;
        rWeight = 1.15; gWeight = 1.0; bWeight = 1.25;
      } else if (pattern === 'rich_nebula' || pattern === 'filaments') {
        // Intricate shockwave filaments (NGC 7000 / Veil Nebula style)
        const wave1 = Math.sin(dx * 16 + dy * 10 + seed) * Math.cos(dy * 20 - dx * 8);
        const wave2 = Math.sin(dx * 32 - dy * 18) * 1200;
        const filament = Math.exp(-Math.abs(dx * 1.2 - dy * 0.8 + Math.sin(dy * 10) * 0.1) * 6.0) * 16000;
        const ionizationGlow = Math.exp(-dist * 1.3) * 7500 * (1 + wave1 * 0.4);
        
        signal = Math.max(0, filament + ionizationGlow + wave2);
        rWeight = 1.55; gWeight = 0.65; bWeight = 1.15;
      } else if (pattern === 'globular_cluster') {
        // High density stellar core glow
        const coreGlow = Math.exp(-dist * 4.8) * 22000;
        const haloGlow = Math.exp(-dist * 1.8) * 4500;
        signal = coreGlow + haloGlow;
        rWeight = 1.05; gWeight = 1.0; bWeight = 1.1;
      } else if (pattern === 'planet_disc') {
        // High-definition planetary disc with atmospheric bands and Great Red Spot
        if (dist < 0.28) {
          const limbDarkening = Math.sqrt(Math.max(0, 1 - (dist / 0.28) ** 2));
          // Multiple alternating belts (NEB, SEB, EZ, polar regions)
          const belts = Math.sin(dy * 45) * 5000 + Math.sin(dy * 90) * 1800;
          
          // Great Red Spot vortex
          const grsDist = Math.sqrt(((dx - 0.08) * 1.6) ** 2 + (dy + 0.06) ** 2);
          const grsSpot = grsDist < 0.045 ? Math.exp(-grsDist * 40) * 12000 : 0;
          
          signal = (35000 + belts + grsSpot) * (0.4 + 0.6 * limbDarkening);
          rWeight = grsDist < 0.045 ? 2.2 : 1.35;
          gWeight = 0.88;
          bWeight = 0.58;
        } else {
          // Jovian Galilean moons (Io & Europa)
          const moon1 = Math.sqrt((dx - 0.52) ** 2 + (dy + 0.02) ** 2) < 0.008 ? 38000 : 0;
          const moon2 = Math.sqrt((dx + 0.62) ** 2 + (dy - 0.04) ** 2) < 0.007 ? 32000 : 0;
          signal = moon1 + moon2;
        }
      }

      if (isBayer) {
        // RGGB CFA Bayer Matrix encoding
        const isR = (y % 2 === 0) && (x % 2 === 0);
        const isB = (y % 2 === 1) && (x % 2 === 1);
        const cfaFactor = isR ? rWeight : isB ? bWeight : gWeight;
        pixels[idx] += signal * cfaFactor;
      } else {
        pixels[idx] += signal;
      }
    }
  }

  // 3. High-Fidelity Point Spread Function (PSF) Starfield with Diffraction Spikes
  const starCount = pattern === 'globular_cluster' ? 850 : 220;
  for (let s = 0; s < starCount; s++) {
    // Pseudorandom positions reproducible with seed
    const sx = (Math.sin(s * 997 + seed * 13) * 0.5 + 0.5) * (width - 30) + 15;
    const sy = (Math.cos(s * 883 + seed * 17) * 0.5 + 0.5) * (height - 30) + 15;
    
    // In globular cluster, concentrate towards center
    let finalSx = sx;
    let finalSy = sy;
    if (pattern === 'globular_cluster') {
      const radiusFromCenter = Math.pow(Math.random(), 2.2) * (width * 0.35);
      const theta = Math.random() * Math.PI * 2;
      finalSx = cx + Math.cos(theta) * radiusFromCenter;
      finalSy = cy + Math.sin(theta) * radiusFromCenter;
    }

    const brightness = Math.pow(Math.random(), 3.2) * 58000 + 3500;
    const radius = 1.2 + Math.random() * 2.8;

    const minX = Math.max(0, Math.floor(finalSx - radius * 4));
    const maxX = Math.min(width - 1, Math.ceil(finalSx + radius * 4));
    const minY = Math.max(0, Math.floor(finalSy - radius * 4));
    const maxY = Math.min(height - 1, Math.ceil(finalSy + radius * 4));

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const d2 = (px - finalSx) * (px - finalSx) + (py - finalSy) * (py - finalSy);
        const psf = Math.exp(-d2 / (2 * radius * radius));
        pixels[py * width + px] += brightness * psf;
      }
    }

    // 4-point cross diffraction spikes on bright stars (magnitude > 35,000)
    if (brightness > 35000) {
      const spikeLength = Math.min(60, Math.floor(brightness / 1000));
      for (let offset = -spikeLength; offset <= spikeLength; offset++) {
        if (offset === 0) continue;
        const atten = Math.exp(-Math.abs(offset) / 14) * (brightness * 0.22);
        
        // Horizontal spike
        const spx = Math.round(finalSx + offset);
        const spy = Math.round(finalSy);
        if (spx >= 0 && spx < width && spy >= 0 && spy < height) {
          pixels[spy * width + spx] += atten;
        }
        
        // Vertical spike
        const vpx = Math.round(finalSx);
        const vpy = Math.round(finalSy + offset);
        if (vpx >= 0 && vpx < width && vpy >= 0 && vpy < height) {
          pixels[vpy * width + vpx] += atten;
        }
      }
    }
  }

  return pixels;
}

/**
 * Generate synthetic calibration frame pixels (darks, flats, biases) at full resolution
 */
export function generateSyntheticCalibrationPixels(
  width: number,
  height: number,
  type: 'DARK' | 'FLAT' | 'BIAS'
): Float32Array {
  const total = width * height;
  const pixels = new Float32Array(total);
  const cx = width / 2;
  const cy = height / 2;

  if (type === 'DARK') {
    // Bias pedestal + thermal noise + hot pixels
    for (let i = 0; i < total; i++) {
      pixels[i] = 1050 + (Math.random() - 0.5) * 45;
    }
    // Hot pixels & cosmic ray trails
    for (let h = 0; h < 120; h++) {
      const idx = Math.floor(Math.random() * total);
      pixels[idx] = 48000 + Math.random() * 16000;
    }
  } else if (type === 'FLAT') {
    // Optical vignetting gradient + dust donuts
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const dx = (x - cx) / (width / 2);
        const dy = (y - cy) / (height / 2);
        const dist2 = dx * dx + dy * dy;
        const vignette = 1.0 - 0.32 * dist2; // Optical falloff
        pixels[idx] = 34000 * vignette + (Math.random() - 0.5) * 70;
      }
    }
    // Dust donuts (shadow rings from optical train dust)
    const donuts = [
      { x: cx - 140, y: cy + 90, r: 35 },
      { x: cx + 220, y: cy - 130, r: 48 },
      { x: cx - 80, y: cy - 180, r: 28 }
    ];
    donuts.forEach(d => {
      for (let py = Math.max(0, d.y - 60); py < Math.min(height, d.y + 60); py++) {
        for (let px = Math.max(0, d.x - 60); px < Math.min(width, d.x + 60); px++) {
          const dist = Math.sqrt((px - d.x) ** 2 + (py - d.y) ** 2);
          if (Math.abs(dist - d.r) < 5) {
            pixels[py * width + px] *= 0.85; // Shadow attenuation ring
          }
        }
      }
    });
  } else if (type === 'BIAS') {
    // Sensor readout pattern noise (horizontal line banding)
    for (let y = 0; y < height; y++) {
      const band = (Math.sin(y * 0.15) + Math.cos(y * 0.04)) * 18;
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        pixels[idx] = 1020 + band + (Math.random() - 0.5) * 30;
      }
    }
  }

  return pixels;
}
