export type Deal = 'buy' | 'rent';
export type PropertyType = 'apartment' | 'villa' | 'old' | 'land' | 'commercial' | 'office';

export interface Ad {
  token: string;
  title: string;
  url: string;
  deal: Deal;
  property: PropertyType;
  image?: string;
  district?: string;
  total?: number;      // toman
  perM2?: number;
  deposit?: number;
  rent?: number;
  area?: number;       // m2
  rooms?: number;
  floor?: number;
  year?: number;       // Jalali build year, as Divar shows it
  parking?: boolean;
  storage?: boolean;
  elevator?: boolean;
  balcony?: boolean;
  orientation?: string;
  structure?: string;
  cabinet?: string;
  cooling?: string;
  heating?: string;
}

export interface Range { min?: number; max?: number }
export type FlagKey = 'parking' | 'storage' | 'elevator' | 'balcony';
export type AttrKey = 'orientation' | 'structure' | 'cabinet' | 'cooling' | 'heating';
export type RangeKey = 'total' | 'perM2' | 'deposit' | 'rent' | 'area' | 'floor' | 'year' | 'rooms';

/** What a user asked for. Stored as JSON in searches.criteria */
export interface Criteria {
  total?: Range; perM2?: Range; deposit?: Range; rent?: Range; area?: Range;
  floor?: Range; year?: Range; rooms?: Range;
  flags?: Partial<Record<FlagKey, true>>;
  attrs?: Partial<Record<AttrKey, string>>;
}

export interface MatchResult {
  ok: boolean;            // false = outside tolerance on a hard criterion
  score: number | null;   // 0..100, null = nothing could be measured
  checked: number;        // criteria that could be evaluated
  asked: number;          // criteria the user set
}

export const MAX_TOLERANCE = 0.15;

/** A classifieds website crawled through its public HTML pages (list page -> ad links -> ad page). */
export interface SiteList { url: string; deal: Deal; property: PropertyType }
export interface SiteConfig {
  id: string;                    // used as token prefix, e.g. "sheypoor" -> "sheypoor:12345"
  enabled?: boolean;
  lists: SiteList[];             // newest-ads listing pages, one per deal/property
  linkPattern: string;           // regex that ad URLs match
  idPattern?: string;            // regex with one capture group for the ad id (default: last path segment)
  maxDetails?: number;           // ad pages fetched per run (HTML parsing is CPU-heavy on the free plan)
  priceUnit?: 'toman' | 'rial';  // rial prices are divided by 10
  useProxy?: boolean;            // default true when DIVAR_PROXY_URL is set
}
