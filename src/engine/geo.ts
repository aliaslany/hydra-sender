/**
 * Point-in-Polygon (PIP) Geo-fencing module
 * Ray-casting algorithm to test whether a given latitude/longitude coordinate
 * falls within a polygon boundary.
 */

export type LatLng = [number, number]; // [latitude, longitude]

/**
 * Checks if a point [latitude, longitude] is inside a polygon [[lat, lon], [lat, lon], ...].
 * @param point [latitude, longitude]
 * @param polygon Array of [latitude, longitude] vertices defining the boundary
 * @returns boolean
 */
export function isPointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (!polygon || polygon.length < 3) {
    return true; // No boundary restriction if less than 3 points
  }

  const [lat, lon] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect =
      yi > lon !== yj > lon &&
      lat < ((xj - xi) * (lon - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Parses polygon coordinate input from string (JSON or lat,lon:lat,lon format)
 */
export function parsePolygonJson(input: string | undefined | null): LatLng[] {
  if (!input || !input.trim()) return [];
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item: any) => {
          if (Array.isArray(item) && item.length >= 2) {
            const lat = Number(item[0]);
            const lon = Number(item[1]);
            return !isNaN(lat) && !isNaN(lon) ? ([lat, lon] as LatLng) : null;
          }
          if (item && typeof item === 'object') {
            const lat = Number(item.lat ?? item.latitude);
            const lon = Number(item.lon ?? item.lng ?? item.longitude);
            return !isNaN(lat) && !isNaN(lon) ? ([lat, lon] as LatLng) : null;
          }
          return null;
        })
        .filter((p): p is LatLng => p !== null);
    }
  } catch {
    // Try semicolon / colon format: "lat,lon:lat,lon:..."
    const points: LatLng[] = [];
    const parts = input.split(/[:;\n]/);
    for (const part of parts) {
      const coords = part.split(',').map((c) => Number(c.trim()));
      if (coords.length >= 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
        points.push([coords[0], coords[1]]);
      }
    }
    return points;
  }
  return [];
}
