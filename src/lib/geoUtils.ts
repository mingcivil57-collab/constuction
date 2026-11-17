import { MapPointCoordinate } from "../types";

// Haversine distance between two lat/lng points in meters
export function getDistanceMeters(p1: MapPointCoordinate, p2: MapPointCoordinate): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Total line distance for array of coordinates
export function calculateLineDistance(coords: MapPointCoordinate[]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += getDistanceMeters(coords[i], coords[i + 1]);
  }
  return total;
}

// Format distance human readable (Thai)
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} กม.`;
  }
  return `${meters.toFixed(1)} ม.`;
}

// Spherical polygon area calculation in sq. meters
export function calculatePolygonArea(coords: MapPointCoordinate[]): number {
  if (coords.length < 3) return 0;
  const R = 6371000;
  let total = 0;

  for (let i = 0; i < coords.length; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % coords.length];

    const lat1 = (p1.lat * Math.PI) / 180;
    const lat2 = (p2.lat * Math.PI) / 180;
    const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;

    total += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  const area = Math.abs((total * R * R) / 2);
  return area;
}

// Format area human readable (Thai sq.m and Rai-Ngan-Sq.Wah)
export function formatArea(sqMeters: number): string {
  if (sqMeters <= 0) return "0 ตร.ม.";

  const sqWahTotal = sqMeters / 4;
  const rai = Math.floor(sqWahTotal / 400);
  const remainderRai = sqWahTotal % 400;
  const ngan = Math.floor(remainderRai / 100);
  const sqWah = (remainderRai % 100).toFixed(1);

  let raiText = "";
  if (rai > 0 || ngan > 0) {
    raiText = ` (${rai > 0 ? `${rai} ไร่ ` : ""}${ngan > 0 ? `${ngan} งาน ` : ""}${sqWah} ตร.วา)`;
  }

  if (sqMeters >= 1000000) {
    return `${(sqMeters / 1000000).toFixed(2)} ตร.กม.${raiText}`;
  }

  return `${sqMeters.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} ตร.ม.${raiText}`;
}

export function generateNextId(type: "point" | "line" | "polygon", existingObjects: { id: string }[]): string {
  const prefix = type.toUpperCase();
  const existingNums = existingObjects
    .filter((o) => o.id.startsWith(prefix))
    .map((o) => {
      const numPart = o.id.replace(`${prefix}-`, "");
      return parseInt(numPart, 10) || 0;
    });

  const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
  return `${prefix}-${String(nextNum).padStart(3, "0")}`;
}

// Parse various coordinate string formats (Decimal degrees, DMS, Google Maps URLs)
export function parseCoordinateString(input: string): { lat: number; lng: number } | null {
  if (!input || typeof input !== "string") return null;
  const str = input.trim();

  // 1. Google Maps URL containing @lat,lng or q=lat,lng
  const urlMatch = str.match(/[@?&]q?=([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/) || str.match(/@([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/);
  if (urlMatch) {
    const lat = parseFloat(urlMatch[1]);
    const lng = parseFloat(urlMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    }
  }

  // 2. DMS format (e.g. 13°45'22.8"N 100°30'06.4"E)
  const dmsRegex = /(\d+)[°\s]+(\d+)['\s]+([\d.]+)["]?\s*([NSns])?[,\s]+(\d+)[°\s]+(\d+)['\s]+([\d.]+)["]?\s*([EWew])?/;
  const dmsMatch = str.match(dmsRegex);
  if (dmsMatch) {
    let lat = parseInt(dmsMatch[1], 10) + parseInt(dmsMatch[2], 10) / 60 + parseFloat(dmsMatch[3]) / 3600;
    if (dmsMatch[4] && dmsMatch[4].toUpperCase() === "S") lat = -lat;

    let lng = parseInt(dmsMatch[5], 10) + parseInt(dmsMatch[6], 10) / 60 + parseFloat(dmsMatch[7]) / 3600;
    if (dmsMatch[8] && dmsMatch[8].toUpperCase() === "W") lng = -lng;

    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    }
  }

  // 3. Standard Decimal Degrees (e.g. "13.756331, 100.501765" or "13.756331 100.501765")
  const ddRegex = /([+-]?\d+(?:\.\d+)?)[,\s\t]+([+-]?\d+(?:\.\d+)?)/;
  const ddMatch = str.match(ddRegex);
  if (ddMatch) {
    const lat = parseFloat(ddMatch[1]);
    const lng = parseFloat(ddMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    }
  }

  return null;
}
