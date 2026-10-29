import { FilterRule, MatchResult, ParsedDivarAd, Stage2Filters } from '../types';

const PERSIAN_ARABIC_DIGITS: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
};

export function normalizePersianText(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .replace(/[۰-۹٠-٩]/g, (d) => PERSIAN_ARABIC_DIGITS[d] || d)
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractIntFromPersian(input: string | undefined | null): number {
  const norm = normalizePersianText(input).replace(/[,٬]/g, '');
  const match = norm.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

export function parseDescriptionNLP(description: string): ParsedDivarAd['specs'] {
  const norm = normalizePersianText(description);
  const extracted: ParsedDivarAd['specs'] = {};

  // 1. Skeleton Type (نوع اسکلت)
  if (/(اسکلت\s*بتن|سازه\s*بتن|بتن\s*آرمه|بتنی)/.test(norm)) {
    extracted.skeleton = 'CONCRETE';
  } else if (/(اسکلت\s*فلز|سازه\s*فلز|فلزی|تیرآهن)/.test(norm)) {
    extracted.skeleton = 'STEEL';
  }

  // 2. Building Direction (جهت ساختمان)
  if (/(دو\s*کله|شمالی\s*و?\s*جنوبی)/.test(norm)) {
    extracted.direction = 'DUAL';
  } else if (/\bشمالی\b/.test(norm)) {
    extracted.direction = 'NORTH';
  } else if (/\bجنوبی\b/.test(norm)) {
    extracted.direction = 'SOUTH';
  } else if (/(شرقی|غربی)/.test(norm)) {
    extracted.direction = 'EAST_WEST';
  }

  // 3. Cabinet Type (نوع کابینت)
  if (/(های\s*گلاس|هایگلاس|high\s*glass)/i.test(norm)) {
    extracted.cabinet = 'HIGH_GLOSS';
  } else if (/(ممبران|وکیوم|کلاسیک|نئوکلاسیک|چوب)/.test(norm)) {
    extracted.cabinet = 'MEMBRANE_WOOD';
  } else if (/(ام\s*دی\s*اف|mdf)/i.test(norm)) {
    extracted.cabinet = 'MDF';
  } else if (/کابینت\s*فلز/.test(norm)) {
    extracted.cabinet = 'METAL';
  }

  // 4. Cooling System (سیستم سرمایش)
  const cooling: string[] = [];
  if (/(داکت\s*اسپلیت|داکت\s*اسپیلت)/.test(norm)) cooling.push('DUCT_SPLIT');
  if (/(کولر\s*گازی|اسپلیت|اسپیلت)/.test(norm) && !cooling.includes('DUCT_SPLIT')) cooling.push('SPLIT_AC');
  if (/چیلر/.test(norm)) cooling.push('CHILLER');
  if (/کولر\s*آبی/.test(norm)) cooling.push('WATER_COOLER');
  if (cooling.length > 0) extracted.cooling = cooling;

  // 5. Heating System (سیستم گرمایش)
  const heating: string[] = [];
  if (/گرمایش\s*از\s*کف/.test(norm)) heating.push('FLOOR_HEATING');
  if (/(پکیج|شوفاژ)/.test(norm)) heating.push('PACKAGE_RADIATOR');
  if (/(فن\s*کویل|چیلر|داکت\s*اسپلیت)/.test(norm)) heating.push('FAN_COIL_DUCT');
  if (/(موتور\s*خانه|مرکزی)/.test(norm)) heating.push('CENTRAL_ENGINE');
  if (heating.length > 0) extracted.heating = heating;

  // 6. Negation-aware Amenity Fallback
  const amenities: Array<['parking' | 'elevator' | 'storage' | 'balcony', string]> = [
    ['parking', 'پارکینگ'],
    ['elevator', 'آسانسور'],
    ['storage', 'انباری'],
    ['balcony', '(?:بالکن|تراس)']
  ];
  for (const [key, pattern] of amenities) {
    const negRegex = new RegExp(`(بدون|فاقد|ندارد)\\s+${pattern}|${pattern}\\s+ندارد`);
    const posRegex = new RegExp(`(دارای|با|فول)\\s+.*?\\b${pattern}\\b|\\b${pattern}\\s+(?:سندی|مزاحم|اختصاصی|دارد)`);
    if (negRegex.test(norm)) {
      extracted[key] = false;
    } else if (posRegex.test(norm)) {
      extracted[key] = true;
    }
  }

  return extracted;
}

export function computeEquivalentRahn(creditToman: number, rentToman: number): number {
  return Math.round(creditToman + rentToman / 0.03);
}

export function evaluateAdMatch(ad: ParsedDivarAd, rule: FilterRule): MatchResult {
  const T = Math.min(Math.max(rule.tolerance_pct || 0.15, 0.0), 0.25);
  const reasons: string[] = [];

  // 1. Evaluate Budget (35 points max)
  let effectivePrice = ad.dealType === 'BUY' ? ad.totalPrice : ad.credit;
  let effectiveMaxBudget = rule.max_budget || 0;
  let effectiveMinBudget = rule.min_budget || 0;

  if (ad.dealType === 'RENT' && rule.allow_rahn_conversion === 1 && (rule.max_rent > 0 || ad.rent > 0)) {
    effectivePrice = computeEquivalentRahn(ad.credit, ad.rent);
    effectiveMaxBudget = computeEquivalentRahn(rule.max_budget || 0, rule.max_rent || 0);
  }

  if (ad.dealType === 'BUY' && rule.max_price_per_m2 > 0 && ad.pricePerM2 > rule.max_price_per_m2 * (1 + T)) {
    return {
      eligible: false, score: 0, budgetScore: 0, areaScore: 0, specsScore: 0,
      budgetDeviationPct: 1, areaDeviationPct: 0, reasons: ['قیمت هر متر مربع خارج از سقف مجاز + تلورانس است']
    };
  }

  let budgetScore = 35.0;
  let budgetDeviationPct = 0;

  if (effectiveMaxBudget > 0 && effectivePrice > 0) {
    const hardCeiling = effectiveMaxBudget * (1 + T);
    const hardFloor = effectiveMinBudget * (1 - T);

    if (effectivePrice > hardCeiling || (effectiveMinBudget > 0 && effectivePrice < hardFloor)) {
      return {
        eligible: false, score: 0, budgetScore: 0, areaScore: 0, specsScore: 0,
        budgetDeviationPct: (effectivePrice - effectiveMaxBudget) / effectiveMaxBudget,
        areaDeviationPct: 0, reasons: ['بودجه خارج از بازه تلورانس است']
      };
    }

    if (effectivePrice > effectiveMaxBudget) {
      budgetDeviationPct = (effectivePrice - effectiveMaxBudget) / effectiveMaxBudget;
      const ratio = T > 0 ? (effectivePrice - effectiveMaxBudget) / (effectiveMaxBudget * T) : 1;
      budgetScore = 35.0 * (1 - 0.6 * Math.min(ratio, 1));
      reasons.push(`بودجه در بازه تلورانس (+${Math.round(budgetDeviationPct * 100)}٪)`);
    } else if (effectiveMinBudget > 0 && effectivePrice < effectiveMinBudget) {
      budgetDeviationPct = (effectivePrice - effectiveMinBudget) / effectiveMinBudget;
      const ratio = T > 0 ? (effectiveMinBudget - effectivePrice) / (effectiveMinBudget * T) : 1;
      budgetScore = 35.0 * (1 - 0.4 * Math.min(ratio, 1));
    }
  }

  // 2. Evaluate Area (25 points max)
  let areaScore = 25.0;
  let areaDeviationPct = 0;
  if (ad.area > 0 && (rule.min_area > 0 || rule.max_area > 0)) {
    const minArea = rule.min_area || 0;
    const maxArea = rule.max_area || 999999;
    const hardMinArea = minArea * (1 - T);
    const hardMaxArea = maxArea * (1 + T);

    if (ad.area < hardMinArea || ad.area > hardMaxArea) {
      return {
        eligible: false, score: 0, budgetScore, areaScore: 0, specsScore: 0,
        budgetDeviationPct, areaDeviationPct: minArea > 0 ? (ad.area - minArea) / minArea : 0,
        reasons: ['متراژ خارج از بازه تلورانس است']
      };
    }

    if (minArea > 0 && ad.area < minArea) {
      areaDeviationPct = (ad.area - minArea) / minArea;
      const ratio = T > 0 ? (minArea - ad.area) / (minArea * T) : 1;
      areaScore = 25.0 * (1 - 0.6 * Math.min(ratio, 1));
      reasons.push(`متراژ در بازه تلورانس (${Math.round(areaDeviationPct * 100)}٪)`);
    } else if (rule.max_area > 0 && ad.area > maxArea) {
      areaDeviationPct = (ad.area - maxArea) / maxArea;
      const ratio = T > 0 ? (ad.area - maxArea) / (maxArea * T) : 1;
      areaScore = 25.0 * (1 - 0.6 * Math.min(ratio, 1));
    }
  }

  // 3. Evaluate Stage 2 Specifications (40 points max)
  let s2: Stage2Filters = {};
  try {
    s2 = JSON.parse(rule.stage2_filters_json || '{}');
  } catch {
    s2 = {};
  }

  let activeWeight = 0;
  let earnedWeight = 0;

  const checkBoolSpec = (reqVal: boolean | undefined, actualVal: boolean | undefined, weight: number, label: string) => {
    if (reqVal !== true) return;
    activeWeight += weight;
    if (actualVal === true) {
      earnedWeight += weight;
    } else if (actualVal === undefined) {
      earnedWeight += weight * 0.5;
    } else {
      reasons.push(`فاقد ${label}`);
    }
  };

  checkBoolSpec(s2.parking, ad.specs.parking, 8.0, 'پارکینگ');
  checkBoolSpec(s2.elevator, ad.specs.elevator, 8.0, 'آسانسور');
  checkBoolSpec(s2.storage, ad.specs.storage, 4.0, 'انباری');
  checkBoolSpec(s2.balcony, ad.specs.balcony, 2.0, 'بالکن');

  if (s2.min_build_year && s2.min_build_year > 0) {
    activeWeight += 5.0;
    if (ad.buildYear && ad.buildYear >= s2.min_build_year) {
      earnedWeight += 5.0;
    } else if (!ad.buildYear) {
      earnedWeight += 2.5;
    }
  }

  if (s2.bedrooms && s2.bedrooms.length > 0) {
    activeWeight += 4.0;
    if (ad.bedrooms !== null && s2.bedrooms.includes(ad.bedrooms)) {
      earnedWeight += 4.0;
    } else if (ad.bedrooms === null) {
      earnedWeight += 2.0;
    }
  }

  if (s2.floor_range && s2.floor_range.length === 2) {
    activeWeight += 3.0;
    if (ad.floorNumber !== null && ad.floorNumber >= s2.floor_range[0] && ad.floorNumber <= s2.floor_range[1]) {
      earnedWeight += 3.0;
    } else if (ad.floorNumber === null) {
      earnedWeight += 1.5;
    }
  }

  if (s2.skeleton && s2.skeleton.length > 0) {
    activeWeight += 2.0;
    if (ad.specs.skeleton && s2.skeleton.includes(ad.specs.skeleton)) {
      earnedWeight += 2.0;
    } else if (!ad.specs.skeleton) {
      earnedWeight += 1.0;
    }
  }

  if (s2.direction && s2.direction.length > 0) {
    activeWeight += 2.0;
    if (ad.specs.direction && s2.direction.includes(ad.specs.direction)) {
      earnedWeight += 2.0;
    } else if (!ad.specs.direction) {
      earnedWeight += 1.0;
    }
  }

  if (s2.cabinet && s2.cabinet.length > 0) {
    activeWeight += 1.0;
    if (ad.specs.cabinet && s2.cabinet.includes(ad.specs.cabinet)) {
      earnedWeight += 1.0;
    } else if (!ad.specs.cabinet) {
      earnedWeight += 0.5;
    }
  }

  if (s2.cooling && s2.cooling.length > 0) {
    activeWeight += 0.5;
    if (ad.specs.cooling && ad.specs.cooling.some((c) => s2.cooling!.includes(c as any))) {
      earnedWeight += 0.5;
    } else if (!ad.specs.cooling) {
      earnedWeight += 0.25;
    }
  }

  if (s2.heating && s2.heating.length > 0) {
    activeWeight += 0.5;
    if (ad.specs.heating && ad.specs.heating.some((h) => s2.heating!.includes(h as any))) {
      earnedWeight += 0.5;
    } else if (!ad.specs.heating) {
      earnedWeight += 0.25;
    }
  }

  const specsScore = activeWeight > 0 ? 40.0 * (earnedWeight / activeWeight) : 40.0;
  const totalScore = Math.round(budgetScore + areaScore + specsScore);

  return {
    eligible: totalScore >= (rule.min_match_score || 65),
    score: totalScore,
    budgetScore: Math.round(budgetScore * 10) / 10,
    areaScore: Math.round(areaScore * 10) / 10,
    specsScore: Math.round(specsScore * 10) / 10,
    budgetDeviationPct,
    areaDeviationPct,
    reasons
  };
}
