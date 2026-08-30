export interface FitsHeaderCard {
  key: string;
  value: string | number | boolean;
  comment?: string;
  raw?: string;
}

export interface FitsMetadata {
  id: string;
  file_name: string;
  file_path?: string;
  file_size?: number;
  file_hash?: string;
  object_name: string;
  object_category: 'Deep Sky' | 'Galàxia' | 'Nebulosa' | 'Cúmul' | 'Sistema Solar' | 'Calibració' | 'Altres';
  image_type: 'LIGHT' | 'DARK' | 'FLAT' | 'BIAS' | 'FOCUS' | 'ALIGNMENT' | 'OTHER';
  exposure_time: number; // in seconds
  sensor_temp: number | null; // in °C
  rotation_angle: number | null; // in degrees (0 - 360)
  date_obs: string; // ISO date or FITS DATE-OBS
  filter_name: string;
  telescope: string;
  camera: string;
  focal_length: number | null; // in mm
  gain: number | null;
  bayer_pattern?: string; // e.g. 'RGGB', 'BGGR', 'GBRG', 'GRBG'
  ra?: string;
  dec?: string;
  airmass?: number | null;
  width: number;
  height: number;
  bitpix: number;
  thumbnail_url: string; // Data URL for low-resolution preview
  headers_json: Record<string, any>;
  headers_cards?: FitsHeaderCard[];
  custom_tags?: string;
  notes?: string;
  created_at?: string;
  rawBlob?: Blob;
  pixelData?: Float32Array | Uint16Array | Uint8Array;
}

export interface FitsFilterState {
  search: string;
  image_type: string; // 'ALL', 'LIGHT', 'DARK', 'FLAT', 'BIAS'
  filter_name: string; // 'ALL', 'Ha', 'OIII', 'SII', 'L', 'R', 'G', 'B', etc.
  object_name: string; // 'ALL' or specific target
  min_exposure: number;
  max_exposure: number;
  min_temp: number;
  max_temp: number;
  min_angle: number;
  max_angle: number;
  date_from: string;
  date_to: string;
  sortBy: 'date_obs' | 'exposure_time' | 'object_name' | 'sensor_temp' | 'file_name' | 'rotation_angle';
  sortOrder: 'asc' | 'desc';
}

export interface SqlQueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  executionTimeMs?: number;
  error?: string;
}

export interface AstroStats {
  overview: {
    total_images: number;
    total_exposure_sec: number;
    distinct_objects: number;
    distinct_filters: number;
    avg_temp: number | null;
  };
  typeBreakdown: { image_type: string; count: number; total_exp: number }[];
  objectBreakdown: { object_name: string; count: number; total_exp: number }[];
  filterBreakdown: { filter_name: string; count: number; total_exp: number }[];
}

export type ColormapType = 
  | 'grayscale'
  | 'inverted'
  | 'hubble'
  | 'inferno'
  | 'viridis'
  | 'cosmic'
  | 'ha_red'
  | 'oiii_teal'
  | 'heat';

export type StretchAlgorithm = 
  | 'zscale'
  | 'asinh'
  | 'linear'
  | 'log'
  | 'sqrt'
  | 'minmax';
