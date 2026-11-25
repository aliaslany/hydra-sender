import { describe, expect, it } from 'vitest';
import { isPointInPolygon, parsePolygonJson } from '../src/engine/geo';

describe('Geo-fencing (Point-in-Polygon)', () => {
  const aliabadBox: [number, number][] = [
    [36.88, 54.82],
    [36.88, 54.90],
    [36.93, 54.90],
    [36.93, 54.82]
  ];

  it('detects coordinates strictly inside polygon', () => {
    expect(isPointInPolygon([36.9025, 54.8558], aliabadBox)).toBe(true);
  });

  it('rejects coordinates outside polygon (e.g., Gorgan or Sari)', () => {
    expect(isPointInPolygon([36.84, 54.44], aliabadBox)).toBe(false);
    expect(isPointInPolygon([36.56, 53.06], aliabadBox)).toBe(false);
  });

  it('allows any coordinate when fewer than 3 polygon vertices exist', () => {
    expect(isPointInPolygon([35.7, 51.4], [[36.9, 54.8], [36.91, 54.85]])).toBe(true);
    expect(isPointInPolygon([35.7, 51.4], [])).toBe(true);
  });

  it('parses JSON arrays, object vertices, and colon-delimited strings', () => {
    expect(parsePolygonJson('[[36.9,54.8],[36.91,54.85],[36.92,54.88]]')).toHaveLength(3);
    expect(parsePolygonJson('[{"lat":36.9,"lng":54.8}]')).toEqual([[36.9, 54.8]]);
    expect(parsePolygonJson('36.9,54.8:36.91,54.85:36.92,54.88')).toHaveLength(3);
    expect(parsePolygonJson('')).toEqual([]);
  });
});
