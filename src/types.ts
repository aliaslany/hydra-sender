export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ADMIN_MASTER_TOKEN: string;
  SUPERADMIN_TELEGRAM_IDS: string;
  DIVAR_PROXY_URL?: string;
  DEFAULT_TIMEZONE: string;
  MAX_CHANNEL_MSGS_PER_MIN: string;
  DEFAULT_TOLERANCE_PCT: string;
}

export interface Stage2Filters {
  parking?: boolean;
  elevator?: boolean;
  storage?: boolean;
  balcony?: boolean;
  bedrooms?: number[];
  min_build_year?: number;
  floor_range?: [number, number];
  skeleton?: Array<'CONCRETE' | 'STEEL'>;
  direction?: Array<'NORTH' | 'SOUTH' | 'EAST_WEST' | 'DUAL'>;
  cabinet?: Array<'HIGH_GLOSS' | 'MEMBRANE_WOOD' | 'MDF' | 'METAL'>;
  cooling?: Array<'DUCT_SPLIT' | 'SPLIT_AC' | 'CHILLER' | 'WATER_COOLER'>;
  heating?: Array<'FLOOR_HEATING' | 'PACKAGE_RADIATOR' | 'FAN_COIL_DUCT' | 'CENTRAL_ENGINE'>;
}

export interface FilterRule {
  id: string;
  channel_id: string;
  owner_user_id: number;
  name: string;
  is_active: number;
  city_ids_json: string;
  districts_json: string;
  deal_type: 'BUY' | 'RENT';
  property_type: 'APARTMENT' | 'VILLA_LAND' | 'OLD_HOUSE' | 'COMMERCIAL' | 'ALL_RESIDENTIAL';
  divar_category_slug: string;
  min_budget: number;
  max_budget: number;
  min_rent: number;
  max_rent: number;
  allow_rahn_conversion: number;
  max_price_per_m2: number;
  min_area: number;
  max_area: number;
  tolerance_pct: number;
  min_match_score: number;
  stage2_filters_json: string;
}

export interface ParsedDivarAd {
  token: string;
  title: string;
  description: string;
  cityPersian: string;
  districtPersian: string;
  dealType: 'BUY' | 'RENT';
  totalPrice: number;
  pricePerM2: number;
  credit: number;
  rent: number;
  isConvertible: boolean;
  area: number;
  bedrooms: number | null;
  buildYear: number | null;
  floorNumber: number | null;
  floorText: string;
  primaryPhotoUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  postTimestamp: number;
  specs: {
    parking?: boolean;
    elevator?: boolean;
    storage?: boolean;
    balcony?: boolean;
    skeleton?: 'CONCRETE' | 'STEEL';
    direction?: 'NORTH' | 'SOUTH' | 'EAST_WEST' | 'DUAL';
    cabinet?: 'HIGH_GLOSS' | 'MEMBRANE_WOOD' | 'MDF' | 'METAL';
    cooling?: string[];
    heating?: string[];
  };
}

export interface MatchResult {
  eligible: boolean;
  score: number;
  budgetScore: number;
  areaScore: number;
  specsScore: number;
  budgetDeviationPct: number;
  areaDeviationPct: number;
  reasons: string[];
}
