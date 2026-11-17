// UTM (Universal Transverse Mercator) <-> Lat/Long (WGS84) Conversion Utilities

export interface UTMCoords {
  easting: number;  // X (meters)
  northing: number; // Y (meters)
  zone: number;     // e.g. 47 or 48 for Thailand
  hemisphere: "N" | "S";
  formatted: string; // e.g. "47N 662514 m E 1521408 m N"
}

const A = 6378137.0; // semi-major axis (meters)
const F = 1 / 298.257223563; // flattening
const B = A * (1 - F); // semi-minor axis
const E = Math.sqrt((A * A - B * B) / (A * A)); // first eccentricity
const E_PRIME_SQ = (A * A - B * B) / (B * B); // second eccentricity squared
const K0 = 0.9996; // scale factor

export function latLngToUtm(lat: number, lng: number): UTMCoords {
  const zone = Math.floor((lng + 180) / 6) + 1;
  const lon0 = (zone - 1) * 6 - 180 + 3; // central meridian
  const hemisphere: "N" | "S" = lat >= 0 ? "N" : "S";

  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const lon0Rad = (lon0 * Math.PI) / 180;

  const N = A / Math.sqrt(1 - E * E * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = E_PRIME_SQ * Math.cos(latRad) * Math.cos(latRad);
  const A_val = (lngRad - lon0Rad) * Math.cos(latRad);

  const M =
    A *
    ((1 - (E * E) / 4 - (3 * Math.pow(E, 4)) / 64 - (5 * Math.pow(E, 6)) / 256) * latRad -
      ((3 * E * E) / 8 + (3 * Math.pow(E, 4)) / 32 + (45 * Math.pow(E, 6)) / 1024) * Math.sin(2 * latRad) +
      ((15 * Math.pow(E, 4)) / 256 + (45 * Math.pow(E, 6)) / 1024) * Math.sin(4 * latRad) -
      ((35 * Math.pow(E, 6)) / 3072) * Math.sin(6 * latRad));

  let easting =
    K0 *
      N *
      (A_val +
        ((1 - T + C) * Math.pow(A_val, 3)) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * E_PRIME_SQ) * Math.pow(A_val, 5)) / 120) +
    500000.0;

  let northing =
    K0 *
    (M +
      N *
        Math.tan(latRad) *
        ((A_val * A_val) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * Math.pow(A_val, 4)) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * E_PRIME_SQ) * Math.pow(A_val, 6)) / 720));

  if (lat < 0) {
    northing += 10000000.0;
  }

  const roundedEasting = Math.round(easting);
  const roundedNorthing = Math.round(northing);

  return {
    easting: roundedEasting,
    northing: roundedNorthing,
    zone,
    hemisphere,
    formatted: `UTM Zone ${zone}${hemisphere} E: ${roundedEasting.toLocaleString()} m, N: ${roundedNorthing.toLocaleString()} m`,
  };
}

export function utmToLatLng(
  easting: number,
  northing: number,
  zone: number,
  hemisphere: "N" | "S" = "N"
): { lat: number; lng: number } | null {
  if (isNaN(easting) || isNaN(northing) || isNaN(zone)) return null;

  const x = easting - 500000.0;
  const y = hemisphere === "S" ? northing - 10000000.0 : northing;

  const lon0 = (zone - 1) * 6 - 180 + 3;
  const lon0Rad = (lon0 * Math.PI) / 180;

  const e1 = (1 - Math.sqrt(1 - E * E)) / (1 + Math.sqrt(1 - E * E));
  const M = y / K0;
  const mu = M / (A * (1 - (E * E) / 4 - (3 * Math.pow(E, 4)) / 64 - (5 * Math.pow(E, 6)) / 256));

  const phi1Rad =
    mu +
    ((3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32) * Math.sin(4 * mu) +
    ((151 * Math.pow(e1, 3)) / 96) * Math.sin(6 * mu) +
    ((1097 * Math.pow(e1, 4)) / 512) * Math.sin(8 * mu);

  const N1 = A / Math.sqrt(1 - E * E * Math.sin(phi1Rad) * Math.sin(phi1Rad));
  const T1 = Math.tan(phi1Rad) * Math.tan(phi1Rad);
  const C1 = E_PRIME_SQ * Math.cos(phi1Rad) * Math.cos(phi1Rad);
  const R1 = (A * (1 - E * E)) / Math.pow(1 - E * E * Math.sin(phi1Rad) * Math.sin(phi1Rad), 1.5);
  const D = x / (N1 * K0);

  const latRad =
    phi1Rad -
    ((N1 * Math.tan(phi1Rad)) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * E_PRIME_SQ) * Math.pow(D, 4)) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * E_PRIME_SQ - 3 * C1 * C1) * Math.pow(D, 6)) / 720);

  const lngRad =
    lon0Rad +
    (D -
      ((1 + 2 * T1 + C1) * Math.pow(D, 3)) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * E_PRIME_SQ + 24 * T1 * T1) * Math.pow(D, 5)) / 120) /
      Math.cos(phi1Rad);

  const lat = (latRad * 180) / Math.PI;
  const lng = (lngRad * 180) / Math.PI;

  if (isNaN(lat) || isNaN(lng)) return null;

  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
  };
}
