import React, { useState, useEffect, useRef } from "react";
import L from "leaflet";
import { MapObject, MapPointCoordinate, Project } from "../types";
import { latLngToUtm, utmToLatLng } from "../lib/utmUtils";
import { getUserSession } from "../lib/userAuth";
import {
  calculateLineDistance,
  calculatePolygonArea,
  formatArea,
  formatDistance,
  generateNextId,
  parseCoordinateString,
} from "../lib/geoUtils";
import {
  MapPin,
  Globe,
  ExternalLink,
  Edit3,
  Save,
  Compass,
  CheckCircle2,
  Maximize2,
  X,
  MousePointerClick,
  Info,
  Target,
  Crown,
  HardHat,
  Wrench,
  Star,
  Droplets,
  Building2,
  Flag,
  ShieldCheck,
  Shapes,
  Spline,
  Undo2,
  Redo2,
  Layers,
  Trash2,
  Check,
  Plus,
  Minus,
  ZoomIn,
  ZoomOut,
  Lock,
  Activity,
  RotateCcw,
  Palette,
  Sliders,
  Paintbrush,
  Keyboard,
  Crosshair,
  Navigation,
  CornerDownLeft,
  Copy,
  CheckCheck,
  MapPinned,
  ChevronDown,
} from "lucide-react";

export const MAP_PRESET_COLORS = [
  { hex: "#ef4444", name: "แดง" },
  { hex: "#3b82f6", name: "น้ำเงิน" },
  { hex: "#10b981", name: "เขียว" },
  { hex: "#f59e0b", name: "ส้ม" },
  { hex: "#8b5cf6", name: "ม่วง" },
  { hex: "#ec4899", name: "ชมพู" },
  { hex: "#06b6d4", name: "ฟ้า" },
  { hex: "#334155", name: "เทาเข้ม" },
  { hex: "#ffffff", name: "ขาว" },
];

export interface PinStyle {
  id: string;
  name: string;
  color: string;
  iconName: string;
  label: string;
  description: string;
}

export const PIN_STYLES: PinStyle[] = [
  { id: "red-classic", name: "หมุดสีแดงมาตรฐาน", color: "#ef4444", iconName: "MapPin", label: "แดงมาตรฐาน", description: "หมุดสถานที่สีแดงพื้นฐาน" },
  { id: "indigo-location", name: "หมุดสีน้ำเงินโครงการ", color: "#4f46e5", iconName: "MapPin", label: "น้ำเงินโครงการ", description: "หมุดจุดเน้นที่ตั้งโครงการหลัก" },
  { id: "emerald-construction", name: "หมุดงานก่อสร้าง (หมวกเซฟตี้)", color: "#10b981", iconName: "HardHat", label: "เขียวก่อสร้าง", description: "สัญลักษณ์งานวิศวกรรม/ก่อสร้าง" },
  { id: "amber-repair", name: "หมุดงานซ่อมบำรุง (ประแจ)", color: "#f59e0b", iconName: "Wrench", label: "ส้มซ่อมบำรุง", description: "สัญลักษณ์งานปรับปรุง/ซ่อมบำรุง" },
  { id: "purple-star", name: "หมุดดาวโครงการสำคัญ", color: "#8b5cf6", iconName: "Star", label: "ม่วงดาวเด่น", description: "หมุดดาวสำหรับจุดสำคัญพิเศษ" },
  { id: "cyan-water", name: "หมุดงานระบบน้ำ/คลอง", color: "#06b6d4", iconName: "Droplets", label: "ฟ้าชลประทาน", description: "สัญลักษณ์งานคลอง/ระบบระบายน้ำ" },
  { id: "rose-bridge", name: "หมุดอาคาร/สิ่งปลูกสร้าง", color: "#f43f5e", iconName: "Building2", label: "ชมพูอาคาร", description: "สัญลักษณ์งานอาคารและโครงสร้าง" },
  { id: "slate-flag", name: "หมุดธงจุดตรวจ/สายทาง", color: "#0f172a", iconName: "Flag", label: "ดำธงเช็คพอยต์", description: "สัญลักษณ์จุดเริ่มต้น/สิ้นสุดสายทาง" },
  { id: "gold-crown", name: "หมุดสีทองพิเศษ (Owner VIP)", color: "#d97706", iconName: "Crown", label: "ทอง VIP Owner", description: "สัญลักษณ์พิเศษเฉพาะสิทธิ์ Owner" },
];

export function generatePinIconSvg(pinStyleId: string = "red-classic", isEditing: boolean = false): string {
  const style = PIN_STYLES.find((s) => s.id === pinStyleId) || PIN_STYLES[0];
  const bg = isEditing ? "#4f46e5" : style.color;

  let innerContent = "";

  switch (style.iconName) {
    case "HardHat":
      innerContent = `
        <path d="M2 15h20M4 15a8 8 0 0 1 16 0M12 4v5" stroke="${bg}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M1 18h22" stroke="${bg}" stroke-width="2.2" stroke-linecap="round"/>
      `;
      break;

    case "Wrench":
      innerContent = `
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="${bg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      `;
      break;

    case "Star":
      innerContent = `
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="${bg}" stroke="${bg}" stroke-width="1"/>
      `;
      break;

    case "Droplets":
      innerContent = `
        <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" fill="${bg}" stroke="${bg}" stroke-width="1"/>
      `;
      break;

    case "Building2":
      innerContent = `
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M6 12H4a2 2 0 0 0-2 2v8h20v-8a2 2 0 0 0-2-2h-2M10 6h4M10 10h4M10 14h4" stroke="${bg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      `;
      break;

    case "Flag":
      innerContent = `
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" stroke="${bg}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      `;
      break;

    case "Crown":
      innerContent = `
        <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" stroke="${bg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      `;
      break;

    default: // MapPin / Dot
      innerContent = `
        <circle cx="12" cy="12" r="5.5" fill="${bg}" />
      `;
      break;
  }

  const cleanBgId = bg.replace(/[^a-zA-Z0-9]/g, "");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46" style="display:block; overflow:visible;">
      <defs>
        <filter id="pin-shadow-${cleanBgId}" x="-30%" y="-20%" width="160%" height="150%">
          <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#000000" flood-opacity="0.45"/>
        </filter>
      </defs>

      <!-- Outer Teardrop Pin Shell -->
      <path d="M 19 46 C 11.5 33 2 25 2 17 A 17 17 0 1 1 36 17 C 36 25 26.5 33 19 46 Z"
            fill="${bg}"
            stroke="#ffffff"
            stroke-width="2.5"
            stroke-linejoin="round"
            filter="url(#pin-shadow-${cleanBgId})" />

      <!-- Inner White Lens Circle -->
      <circle cx="19" cy="17" r="11" fill="#ffffff" />

      <!-- Centered Icon -->
      <g transform="translate(7, 5)">
        ${innerContent}
      </g>
    </svg>
  `;
}

interface ProjectMapSectionProps {
  project: Project;
  onUpdateMetadata: (updatedProject: Project) => Promise<void>;
  onCheckFirebaseConnection?: () => boolean;
}

export default function ProjectMapSection({ project, onUpdateMetadata, onCheckFirebaseConnection }: ProjectMapSectionProps) {
  // Default coordinates fallback
  const defaultLat = project.lat || 13.7563;
  const defaultLng = project.lng || 100.5018;
  const defaultLocationName = project.locationName || project.projectName;

  const [lat, setLat] = useState<number>(defaultLat);
  const [lng, setLng] = useState<number>(defaultLng);
  const [locationName, setLocationName] = useState<string>(defaultLocationName);
  const [pinStyle, setPinStyle] = useState<string>(project.pinStyle || "red-classic");

  // Map Drawing Objects State (For Admin & Owner)
  const initialMapObjects = project.mapObjects || [];
  const [mapObjects, setMapObjects] = useState<MapObject[]>(initialMapObjects);
  const [savedMapObjects, setSavedMapObjects] = useState<MapObject[]>(initialMapObjects);

  // Undo / Redo History Stack
  const [history, setHistory] = useState<MapObject[][]>([initialMapObjects]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Drawing Tools Active Mode: "point" | "line" | "polygon" | null
  const [drawingMode, setDrawingMode] = useState<"point" | "line" | "polygon" | null>(null);
  const [tempCoords, setTempCoords] = useState<MapPointCoordinate[]>([]);

  // Selection & Inspector State
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [showObjectList, setShowObjectList] = useState<boolean>(false);
  const [focusTarget, setFocusTarget] = useState<{ id: string; timestamp: number } | null>(null);

  // Coordinate Input Mode: "latlng" or "utm"
  const [coordMode, setCoordMode] = useState<"latlng" | "utm">("latlng");

  // UTM temporary input state
  const currentUtm = latLngToUtm(lat, lng);
  const [utmZone, setUtmZone] = useState<number>(currentUtm.zone);
  const [utmHemisphere, setUtmHemisphere] = useState<"N" | "S">(currentUtm.hemisphere);
  const [utmEasting, setUtmEasting] = useState<number>(currentUtm.easting);
  const [utmNorthing, setUtmNorthing] = useState<number>(currentUtm.northing);

  const [mapType, setMapType] = useState<"k" | "esri" | "h" | "m" | "terrain">("k"); // 'k' = Google Satellite, 'esri' = Esri World HD, 'h' = Google Hybrid, 'm' = Roadmap, 'terrain' = Topographic Terrain
  const [zoom, setZoom] = useState<number>(16);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [isGettingGps, setIsGettingGps] = useState<boolean>(false);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [centerTrigger, setCenterTrigger] = useState<number>(0);

  // User session check for Role authorization
  const session = getUserSession();
  const isAdminOrOwner = session?.role === "Owner" || session?.role === "Admin" || !session;

  const activePinStyleObj = PIN_STYLES.find((s) => s.id === pinStyle) || PIN_STYLES[0];

  // Dirty State check for unsaved map drawing changes
  const isMapDirty = JSON.stringify(mapObjects) !== JSON.stringify(savedMapObjects);

  // Focus location handler
  const handleFocusLocation = () => {
    setZoom(16);
    setCenterTrigger(Date.now());
  };

  // Sync state when project changes from parent/props
  useEffect(() => {
    const newLat = project.lat || 13.7563;
    const newLng = project.lng || 100.5018;
    setLat(newLat);
    setLng(newLng);
    setLocationName(project.locationName || project.projectName);
    setPinStyle(project.pinStyle || "red-classic");

    const objs = project.mapObjects || [];
    setMapObjects(objs);
    setSavedMapObjects(objs);
    setHistory([objs]);
    setHistoryIndex(0);

    const utm = latLngToUtm(newLat, newLng);
    setUtmZone(utm.zone);
    setUtmHemisphere(utm.hemisphere);
    setUtmEasting(utm.easting);
    setUtmNorthing(utm.northing);
  }, [project.lat, project.lng, project.locationName, project.projectName, project.pinStyle, project.mapObjects]);

  // Push new state to History Stack
  const pushToHistory = (newObjects: MapObject[]) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(newObjects);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setMapObjects(newObjects);
  };

  // Undo / Redo Actions
  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setMapObjects(history[prevIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setMapObjects(history[nextIndex]);
    }
  };

  // Keyboard Shortcuts for Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [historyIndex, history]);

  // Sync UTM when lat/lng changes
  const handleLatLngChange = (newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
    const utm = latLngToUtm(newLat, newLng);
    setUtmZone(utm.zone);
    setUtmHemisphere(utm.hemisphere);
    setUtmEasting(utm.easting);
    setUtmNorthing(utm.northing);
  };

  // Sync Lat/Lng when UTM changes
  const handleUtmChange = (zone: number, hemisphere: "N" | "S", easting: number, northing: number) => {
    setUtmZone(zone);
    setUtmHemisphere(hemisphere);
    setUtmEasting(easting);
    setUtmNorthing(northing);

    const result = utmToLatLng(easting, northing, zone, hemisphere);
    if (result) {
      setLat(result.lat);
      setLng(result.lng);
    }
  };

  // Active Drawing Style State (For Admin & Owner)
  const [activeColor, setActiveColor] = useState<string>("#ef4444");
  const [activeSize, setActiveSize] = useState<number>(4);
  const [editingStyleObjId, setEditingStyleObjId] = useState<string | null>(null);

  // Add & Edit Point via Coordinates Modal State
  const [showPointCoordModal, setShowPointCoordModal] = useState<boolean>(false);
  const [editingPointObjId, setEditingPointObjId] = useState<string | null>(null);
  const [pointCoordInputMode, setPointCoordInputMode] = useState<"latlng" | "utm">("latlng");
  const [pointCoordLabel, setPointCoordLabel] = useState<string>("");
  const [pointCoordLat, setPointCoordLat] = useState<string>("");
  const [pointCoordLng, setPointCoordLng] = useState<string>("");
  const [pointCoordQuickPaste, setPointCoordQuickPaste] = useState<string>("");
  const [pointCoordUtmZone, setPointCoordUtmZone] = useState<number>(47);
  const [pointCoordUtmHemi, setPointCoordUtmHemi] = useState<"N" | "S">("N");
  const [pointCoordUtmEasting, setPointCoordUtmEasting] = useState<string>("");
  const [pointCoordUtmNorthing, setPointCoordUtmNorthing] = useState<string>("");
  const [pointCoordColor, setPointCoordColor] = useState<string>("#ef4444");
  const [pointCoordSize, setPointCoordSize] = useState<number>(7);
  const [pointCoordError, setPointCoordError] = useState<string>("");
  const [pointCopySuccess, setPointCopySuccess] = useState<boolean>(false);
  const [isGettingPointGps, setIsGettingPointGps] = useState<boolean>(false);
  const [showPointMenu, setShowPointMenu] = useState<boolean>(false);
  const [showPointMenuFs, setShowPointMenuFs] = useState<boolean>(false);

  // Open Point Coordinates Dialog (for creating new or editing existing point)
  const handleOpenPointCoordModal = (targetPointObj?: MapObject) => {
    if (targetPointObj && targetPointObj.type === "point") {
      setEditingPointObjId(targetPointObj.id);
      setPointCoordLabel(targetPointObj.label || targetPointObj.id);
      const coord = targetPointObj.coordinates as MapPointCoordinate;
      setPointCoordLat(coord.lat.toString());
      setPointCoordLng(coord.lng.toString());
      setPointCoordQuickPaste(`${coord.lat}, ${coord.lng}`);

      const utm = latLngToUtm(coord.lat, coord.lng);
      setPointCoordUtmZone(utm.zone);
      setPointCoordUtmHemi(utm.hemisphere);
      setPointCoordUtmEasting(utm.easting.toString());
      setPointCoordUtmNorthing(utm.northing.toString());

      setPointCoordColor(targetPointObj.color || activeColor || "#ef4444");
      setPointCoordSize(targetPointObj.size || activeSize || 7);
    } else {
      setEditingPointObjId(null);
      const nextId = generateNextId("point", mapObjects);
      setPointCoordLabel(`จุดตำแหน่ง ${nextId}`);

      const defaultLat = lat || 13.7563;
      const defaultLng = lng || 100.5018;
      setPointCoordLat(defaultLat.toString());
      setPointCoordLng(defaultLng.toString());
      setPointCoordQuickPaste(`${defaultLat}, ${defaultLng}`);

      const utm = latLngToUtm(defaultLat, defaultLng);
      setPointCoordUtmZone(utm.zone);
      setPointCoordUtmHemi(utm.hemisphere);
      setPointCoordUtmEasting(utm.easting.toString());
      setPointCoordUtmNorthing(utm.northing.toString());

      setPointCoordColor(activeColor || "#ef4444");
      setPointCoordSize(activeSize > 0 ? activeSize : 7);
    }
    setPointCoordError("");
    setPointCoordInputMode("latlng");
    setShowPointCoordModal(true);
  };

  // When Lat or Lng text input changes
  const handlePointLatLngInputChange = (newLatStr: string, newLngStr: string) => {
    setPointCoordLat(newLatStr);
    setPointCoordLng(newLngStr);
    setPointCoordError("");

    const parsedLat = parseFloat(newLatStr);
    const parsedLng = parseFloat(newLngStr);

    if (
      !isNaN(parsedLat) &&
      !isNaN(parsedLng) &&
      parsedLat >= -90 &&
      parsedLat <= 90 &&
      parsedLng >= -180 &&
      parsedLng <= 180
    ) {
      setPointCoordQuickPaste(`${parsedLat}, ${parsedLng}`);
      const utm = latLngToUtm(parsedLat, parsedLng);
      setPointCoordUtmZone(utm.zone);
      setPointCoordUtmHemi(utm.hemisphere);
      setPointCoordUtmEasting(utm.easting.toString());
      setPointCoordUtmNorthing(utm.northing.toString());
    }
  };

  // When quick paste string input changes
  const handlePointQuickPasteChange = (pasteStr: string) => {
    setPointCoordQuickPaste(pasteStr);
    setPointCoordError("");
    const parsed = parseCoordinateString(pasteStr);
    if (parsed) {
      setPointCoordLat(parsed.lat.toString());
      setPointCoordLng(parsed.lng.toString());
      const utm = latLngToUtm(parsed.lat, parsed.lng);
      setPointCoordUtmZone(utm.zone);
      setPointCoordUtmHemi(utm.hemisphere);
      setPointCoordUtmEasting(utm.easting.toString());
      setPointCoordUtmNorthing(utm.northing.toString());
    }
  };

  // When UTM text inputs change
  const handlePointUtmInputChange = (
    zone: number,
    hemi: "N" | "S",
    eastingStr: string,
    northingStr: string
  ) => {
    setPointCoordUtmZone(zone);
    setPointCoordUtmHemi(hemi);
    setPointCoordUtmEasting(eastingStr);
    setPointCoordUtmNorthing(northingStr);
    setPointCoordError("");

    const parsedEasting = parseFloat(eastingStr);
    const parsedNorthing = parseFloat(northingStr);

    if (!isNaN(parsedEasting) && !isNaN(parsedNorthing)) {
      const result = utmToLatLng(parsedEasting, parsedNorthing, zone, hemi);
      if (result) {
        setPointCoordLat(result.lat.toString());
        setPointCoordLng(result.lng.toString());
        setPointCoordQuickPaste(`${result.lat}, ${result.lng}`);
      }
    }
  };

  // Pull Project Location Coordinates
  const handleUseProjectCoordsForPoint = () => {
    const projLat = project.lat || lat || 13.7563;
    const projLng = project.lng || lng || 100.5018;
    setPointCoordLat(projLat.toString());
    setPointCoordLng(projLng.toString());
    setPointCoordQuickPaste(`${projLat}, ${projLng}`);

    const utm = latLngToUtm(projLat, projLng);
    setPointCoordUtmZone(utm.zone);
    setPointCoordUtmHemi(utm.hemisphere);
    setPointCoordUtmEasting(utm.easting.toString());
    setPointCoordUtmNorthing(utm.northing.toString());
    setPointCoordError("");
  };

  // Get Current Device GPS for Point
  const handleUseCurrentGpsForPoint = () => {
    if (!navigator.geolocation) {
      setPointCoordError("เบราว์เซอร์นี้ไม่รองรับการดึงพิกัด GPS อัตโนมัติ");
      return;
    }
    setIsGettingPointGps(true);
    setPointCoordError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsGettingPointGps(false);
        const gLat = Number(pos.coords.latitude.toFixed(6));
        const gLng = Number(pos.coords.longitude.toFixed(6));
        setPointCoordLat(gLat.toString());
        setPointCoordLng(gLng.toString());
        setPointCoordQuickPaste(`${gLat}, ${gLng}`);

        const utm = latLngToUtm(gLat, gLng);
        setPointCoordUtmZone(utm.zone);
        setPointCoordUtmHemi(utm.hemisphere);
        setPointCoordUtmEasting(utm.easting.toString());
        setPointCoordUtmNorthing(utm.northing.toString());
      },
      (err) => {
        setIsGettingPointGps(false);
        setPointCoordError("ไม่สามารถเข้าถึงตำแหน่ง GPS ได้ (กรุณาอนุญาตการเข้าถึง Location)");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Save/Create point from modal
  const handleSavePointFromModal = () => {
    const parsedLat = parseFloat(pointCoordLat);
    const parsedLng = parseFloat(pointCoordLng);

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      setPointCoordError("กรุณาระบุค่าพิกัดละติจูดและลองจิจูดให้ครบถ้วนและถูกต้อง");
      return;
    }

    if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
      setPointCoordError("ค่าละติจูดต้องอยู่ระหว่าง -90 ถึง 90 และลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180");
      return;
    }

    const roundedLat = Number(parsedLat.toFixed(6));
    const roundedLng = Number(parsedLng.toFixed(6));

    if (editingPointObjId) {
      // Update existing point
      const updated = mapObjects.map((item) => {
        if (item.id === editingPointObjId) {
          return {
            ...item,
            label: pointCoordLabel.trim() || item.label || item.id,
            coordinates: { lat: roundedLat, lng: roundedLng },
            color: pointCoordColor,
            size: pointCoordSize,
          };
        }
        return item;
      });
      pushToHistory(updated);
      setSelectedObjectId(editingPointObjId);
      setFocusTarget({ id: editingPointObjId, timestamp: Date.now() });
    } else {
      // Create new point
      const newId = generateNextId("point", mapObjects);
      const newObj: MapObject = {
        id: newId,
        type: "point",
        coordinates: { lat: roundedLat, lng: roundedLng },
        label: pointCoordLabel.trim() || `จุดตำแหน่ง ${newId}`,
        color: pointCoordColor,
        size: pointCoordSize,
      };
      pushToHistory([...mapObjects, newObj]);
      setSelectedObjectId(newId);
      setFocusTarget({ id: newId, timestamp: Date.now() });
    }

    setShowPointCoordModal(false);
    setDrawingMode(null);
  };

  // Map Click Handler when in Drawing Mode (Available for all roles to draw & measure)
  const handleMapClickForDrawing = (clickedLat: number, clickedLng: number) => {
    if (drawingMode === "point") {
      const newId = generateNextId("point", mapObjects);
      const newObj: MapObject = {
        id: newId,
        type: "point",
        coordinates: { lat: clickedLat, lng: clickedLng },
        label: `จุดตำแหน่ง ${newId}`,
        color: activeColor,
        size: activeSize > 0 ? activeSize : 7,
      };
      pushToHistory([...mapObjects, newObj]);
      setSelectedObjectId(newId);
    } else if (drawingMode === "line" || drawingMode === "polygon") {
      setTempCoords((prev) => [...prev, { lat: clickedLat, lng: clickedLng }]);
    }
  };

  // Finish current Line or Polygon drawing
  const handleFinishDrawing = () => {
    if (!drawingMode) return;

    if (drawingMode === "line") {
      if (tempCoords.length < 2) {
        alert("การวาดเส้นต้องมีอย่างน้อย 2 จุดขึ้นไป");
        return;
      }
      const newId = generateNextId("line", mapObjects);
      const newObj: MapObject = {
        id: newId,
        type: "line",
        coordinates: [...tempCoords],
        label: `เส้นทาง ${newId}`,
        color: activeColor,
        size: activeSize > 0 ? activeSize : 4,
      };
      pushToHistory([...mapObjects, newObj]);
      setSelectedObjectId(newId);
    } else if (drawingMode === "polygon") {
      if (tempCoords.length < 3) {
        alert("การวาดโพลิกอนขอบเขตต้องมีอย่างน้อย 3 จุดมุมขึ้นไป");
        return;
      }
      const newId = generateNextId("polygon", mapObjects);
      const newObj: MapObject = {
        id: newId,
        type: "polygon",
        coordinates: [...tempCoords],
        label: `ขอบเขตพื้นที่ ${newId}`,
        color: activeColor,
        size: activeSize > 0 ? activeSize : 3,
      };
      pushToHistory([...mapObjects, newObj]);
      setSelectedObjectId(newId);
    }

    setDrawingMode(null);
    setTempCoords([]);
  };

  // Update Style (Color/Size) for a Specific Map Object
  const handleUpdateObjectStyle = (objId: string, color?: string, size?: number) => {
    const updated = mapObjects.map((item) => {
      if (item.id === objId) {
        return {
          ...item,
          color: color !== undefined ? color : item.color,
          size: size !== undefined ? size : item.size,
        };
      }
      return item;
    });
    pushToHistory(updated);
  };

  // Close point options dropdown on outside click or Escape
  useEffect(() => {
    const handleGlobalClick = () => {
      setShowPointMenu(false);
      setShowPointMenuFs(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPointMenu(false);
        setShowPointMenuFs(false);
      }
    };
    if (showPointMenu || showPointMenuFs) {
      document.addEventListener("click", handleGlobalClick);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("click", handleGlobalClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showPointMenu, showPointMenuFs]);

  // Cancel Drawing in Progress
  const handleCancelDrawing = () => {
    setDrawingMode(null);
    setTempCoords([]);
  };

  // Remove Last Clicked Point in Active Drawing
  const handleRemoveLastTempPoint = () => {
    setTempCoords((prev) => prev.slice(0, prev.length - 1));
  };

  // Save Full Map Objects Metadata
  const handleSaveMapObjects = async () => {
    setIsSaving(true);
    setSaveMessage("");
    try {
      await onUpdateMetadata({
        ...project,
        lat,
        lng,
        locationName,
        pinStyle,
        mapObjects,
      });
      setSavedMapObjects(mapObjects);
      setSaveMessage("บันทึกพิกัดตำแหน่ง และวัตถุบนแผนที่ (จุด/เส้น/โพลิกอน) ลงใน Google Sheet และระบบเรียบร้อยแล้ว");
      setIsEditing(false);
      setTimeout(() => setSaveMessage(""), 5000);
    } catch (err) {
      console.error(err);
      setSaveMessage("เกิดข้อผิดพลาดในการบันทึกพิกัดและวัตถุบนแผนที่");
    } finally {
      setIsSaving(false);
    }
  };

  // Get Current Geolocation from Browser GPS
  const handleGetGps = () => {
    if (!navigator.geolocation) {
      alert("เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง GPS");
      return;
    }
    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLat = Number(pos.coords.latitude.toFixed(6));
        const newLng = Number(pos.coords.longitude.toFixed(6));
        handleLatLngChange(newLat, newLng);
        setIsGettingGps(false);
      },
      (err) => {
        console.error(err);
        alert("ไม่สามารถดึงพิกัด GPS ปัจจุบันได้ กรุณาอนุญาตการเข้าถึงสิทธิ์ตำแหน่ง");
        setIsGettingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Preset location quick selection
  const presets = [
    { label: "กรุงเทพฯ", lat: 13.7563, lng: 100.5018 },
    { label: "เชียงใหม่", lat: 18.7883, lng: 98.9853 },
    { label: "ขอนแก่น", lat: 16.4322, lng: 102.8236 },
    { label: "ชลบุรี", lat: 12.9236, lng: 100.8825 },
    { label: "ภูเก็ต", lat: 7.8804, lng: 98.3923 },
    { label: "สงขลา", lat: 7.1988, lng: 100.5951 },
  ];

  const utmInfo = latLngToUtm(lat, lng);
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-4 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 shrink-0">
            <Globe className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2 flex-wrap">
              <span>แผนที่ตำแหน่งที่ตั้งโครงการ</span>
              <span className="text-xs font-normal text-slate-400 font-sans hidden sm:inline">(Project Location Map)</span>
              {/* Active Pin Style Tag */}
              <span
                className="text-[11px] font-semibold text-white px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs shrink-0"
                style={{ backgroundColor: activePinStyleObj.color }}
              >
                <span>หมุด: {activePinStyleObj.label}</span>
              </span>
            </h3>
            <div className="text-xs text-slate-500 font-mono mt-1 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 flex-wrap">
              <span className="flex items-center gap-1 text-slate-700 font-semibold shrink-0">
                <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                Lat/Long: {lat.toFixed(6)}, {lng.toFixed(6)}
              </span>
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 text-[11px] font-mono shrink-0">
                {utmInfo.formatted}
              </span>
              {locationName && locationName.trim() !== project.projectName.trim() && (
                <span className="text-slate-600 font-sans truncate text-xs bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60 max-w-xs">
                  จุดสังเกต: {locationName}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => {
              if (!isEditing && onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
              setIsEditing(!isEditing);
            }}
            className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
              isEditing
                ? "bg-indigo-600 text-white border-indigo-700 shadow-indigo-600/20 ring-2 ring-indigo-500/30"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
            }`}
          >
            <Edit3 className={`h-3.5 w-3.5 ${isEditing ? "text-white" : "text-indigo-600"}`} />
            <span>{isEditing ? "กำลังปักหมุด (ปิด)" : "แก้ไข / ปักหมุด"}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFullScreen(true)}
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="เปิดแผนที่เต็มจอ"
          >
            <Maximize2 className="h-3.5 w-3.5 text-amber-400" />
            <span>แผนที่เต็มจอ</span>
          </button>

          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="เปิดพิกัดนี้บน Google Maps"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Google Maps</span>
          </a>
        </div>
      </div>

      {saveMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{saveMessage}</span>
        </div>
      )}

      {/* Map Drawing Toolbar (Available for all roles to view, draw, & measure) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4 text-white space-y-3 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30 shrink-0">
              <Shapes className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-bold flex items-center gap-2 truncate">
                <span>เครื่องมือวาดแผนที่ (Map Drawing Tools)</span>
                {isAdminOrOwner ? (
                  <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                    <ShieldCheck className="h-3 w-3 text-amber-400" />
                    <span>สิทธิ์ Admin / Owner (บันทึกได้)</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0" title="โหมดทดลองวาดและวัดขนาด (เฉพาะ Admin/Owner บันทึกได้)">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>โหมดวาด/วัดขนาด (User)</span>
                  </span>
                )}
              </h4>
              <p className="text-[11px] text-slate-400 truncate">
                วาดจุดตำแหน่ง, เส้นทางโครงการ และโพลิกอนขอบเขตพื้นที่เพื่อวัดระยะ/พื้นที่
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            {/* Unified Add Point Button with Integrated Coordinate Input */}
            <div className="relative inline-block">
              <div className="flex items-center bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    const isPoint = drawingMode === "point";
                    setDrawingMode(isPoint ? null : "point");
                    if (!isPoint && (activeColor === "#3b82f6" || activeColor === "#10b981")) {
                      setActiveColor("#ef4444");
                      setActiveSize(7);
                    }
                    setTempCoords([]);
                    setShowPointMenu(false);
                  }}
                  className={`px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    drawingMode === "point"
                      ? "bg-rose-500 text-white shadow-md shadow-rose-500/30 ring-2 ring-rose-300"
                      : "text-slate-200 hover:bg-slate-700"
                  }`}
                  title="คลิกเพื่อเปิดโหมดเพิ่มจุดตำแหน่ง (คลิกบนแผนที่)"
                >
                  <MapPin className="h-3.5 w-3.5 text-rose-400" />
                  <span>เพิ่มจุด</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPointMenu((prev) => !prev);
                  }}
                  className={`px-1.5 py-1.5 text-xs font-bold transition-all flex items-center justify-center cursor-pointer border-l border-slate-700/80 ${
                    drawingMode === "point"
                      ? "bg-rose-600 text-white hover:bg-rose-700"
                      : "text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`}
                  title="เลือกวิธีเพิ่มจุด (คลิกบนแผนที่ หรือ กรอกพิกัด)"
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showPointMenu ? "rotate-180 text-amber-400" : ""}`} />
                </button>
              </div>

              {/* Dropdown Menu inside Add Point */}
              {showPointMenu && (
                <div
                  className="absolute top-full left-0 mt-1.5 w-56 bg-slate-900/98 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl z-50 p-1.5 animate-fadeIn"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setDrawingMode("point");
                      if (activeColor === "#3b82f6" || activeColor === "#10b981") {
                        setActiveColor("#ef4444");
                        setActiveSize(7);
                      }
                      setTempCoords([]);
                      setShowPointMenu(false);
                    }}
                    className={`w-full px-2.5 py-2 rounded-lg text-left text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                      drawingMode === "point"
                        ? "bg-rose-500/20 text-rose-300 font-bold"
                        : "text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    <MapPin className="h-4 w-4 text-rose-400 shrink-0" />
                    <div>
                      <div className="font-bold text-white">คลิกปักหมุดบนแผนที่</div>
                      <div className="text-[10px] text-slate-400">คลิกที่ใดก็ได้บนแผนที่เพื่อวางจุด</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowPointMenu(false);
                      handleOpenPointCoordModal();
                    }}
                    className="w-full px-2.5 py-2 rounded-lg text-left text-xs font-medium text-amber-300 hover:bg-amber-500/15 hover:text-amber-200 flex items-center gap-2 transition-colors cursor-pointer border-t border-slate-800 mt-1 pt-1.5"
                  >
                    <Keyboard className="h-4 w-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <span>✍️ กรอกพิกัดระบุตำแหน่ง</span>
                      </div>
                      <div className="text-[10px] text-slate-400">ระบุ Lat/Lng หรือ UTM Zone 47/48</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Add Line Button */}
            <button
              type="button"
              onClick={() => {
                const isLine = drawingMode === "line";
                setDrawingMode(isLine ? null : "line");
                if (!isLine && (activeColor === "#ef4444" || activeColor === "#10b981")) {
                  setActiveColor("#3b82f6");
                  setActiveSize(4);
                }
                setTempCoords([]);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                drawingMode === "line"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-300"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
              }`}
            >
              <Spline className="h-3.5 w-3.5 text-blue-400" />
              <span>เพิ่มเส้น</span>
            </button>

            {/* Add Polygon Button */}
            <button
              type="button"
              onClick={() => {
                const isPoly = drawingMode === "polygon";
                setDrawingMode(isPoly ? null : "polygon");
                if (!isPoly && (activeColor === "#ef4444" || activeColor === "#3b82f6")) {
                  setActiveColor("#10b981");
                  setActiveSize(3);
                }
                setTempCoords([]);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                drawingMode === "polygon"
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-300"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
              }`}
            >
              <Shapes className="h-3.5 w-3.5 text-emerald-400" />
              <span>เพิ่มโพลิกอน</span>
            </button>

            {/* Undo / Redo */}
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                className="p-1 hover:bg-slate-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="ย้อนกลับ (Undo - Ctrl+Z)"
              >
                <Undo2 className="h-3.5 w-3.5 text-slate-300" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                className="p-1 hover:bg-slate-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="ทำซ้ำ (Redo - Ctrl+Y)"
              >
                <Redo2 className="h-3.5 w-3.5 text-slate-300" />
              </button>
            </div>

            {/* Object Inspector Toggle */}
            <button
              type="button"
              onClick={() => setShowObjectList(!showObjectList)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                showObjectList
                  ? "bg-amber-500 text-slate-950 font-extrabold"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
              }`}
            >
              <Layers className="h-3.5 w-3.5 text-amber-400" />
              <span>วัตถุบนแผนที่ ({mapObjects.length})</span>
            </button>

            {/* Save Map Objects */}
            {isAdminOrOwner ? (
              <button
                type="button"
                onClick={handleSaveMapObjects}
                disabled={isSaving}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                  isMapDirty
                    ? "bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold ring-2 ring-amber-300 animate-pulse"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white"
                }`}
              >
                <Save className="h-3.5 w-3.5" />
                <span>{isSaving ? "กำลังบันทึก..." : isMapDirty ? "บันทึกวัตถุบนแผนที่ *" : "บันทึกวัตถุ"}</span>
              </button>
            ) : (
              <div
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800/80 text-slate-400 border border-slate-700/60 flex items-center gap-1.5 cursor-not-allowed select-none"
                title="บทบาท User สามารถวาดทดสอบ/วัดขนาดได้ แต่ไม่สามารถบันทึกถาวรได้ (เฉพาะสิทธิ์ Admin/Owner)"
              >
                <Lock className="h-3.5 w-3.5 text-amber-400" />
                <span>บันทึก (เฉพาะ Admin)</span>
              </div>
            )}
          </div>
        </div>



        {/* Object Inspector Drawer List */}
        {showObjectList && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h5 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Layers className="h-4 w-4" />
                <span>รายการวัตถุบนแผนที่ทั้งหมด ({mapObjects.length} รายการ)</span>
              </h5>
              {isAdminOrOwner && mapObjects.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("คุณต้องการลบวัตถุทั้งหมดบนแผนที่หรือไม่?")) {
                      pushToHistory([]);
                    }
                  }}
                  className="text-[11px] text-rose-400 hover:text-rose-300 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/60 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>ลบทั้งหมด</span>
                </button>
              )}
            </div>

            {mapObjects.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">
                ยังไม่มีวัตถุบนแผนที่ สามารถกดเลือก "เพิ่มจุด", "เพิ่มเส้น" หรือ "เพิ่มโพลิกอน" เพื่อเริ่มวาดได้
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {mapObjects.map((obj) => {
                  const isSelected = selectedObjectId === obj.id;
                  const isEditingStyle = editingStyleObjId === obj.id;
                  let detailsText = "";
                  const objColor = obj.color || (obj.type === "point" ? "#ef4444" : obj.type === "line" ? "#3b82f6" : "#10b981");
                  const objSize = obj.size || (obj.type === "point" ? 7 : obj.type === "line" ? 4 : 3);

                  let icon = <MapPin className="h-3.5 w-3.5" style={{ color: objColor }} />;

                  if (obj.type === "point") {
                    const coord = obj.coordinates as MapPointCoordinate;
                    detailsText = `Lat: ${coord.lat.toFixed(5)}, Lng: ${coord.lng.toFixed(5)}`;
                  } else if (obj.type === "line") {
                    icon = <Spline className="h-3.5 w-3.5" style={{ color: objColor }} />;
                    const coords = obj.coordinates as MapPointCoordinate[];
                    detailsText = `ความยาว: ${formatDistance(calculateLineDistance(coords))} (${coords.length} จุด)`;
                  } else if (obj.type === "polygon") {
                    icon = <Shapes className="h-3.5 w-3.5" style={{ color: objColor }} />;
                    const coords = obj.coordinates as MapPointCoordinate[];
                    detailsText = `พื้นที่: ${formatArea(calculatePolygonArea(coords))} (${coords.length} จุดมุม)`;
                  }

                  return (
                    <div
                      key={obj.id}
                      className={`p-2.5 rounded-xl border text-xs flex flex-col gap-2 transition-all ${
                        isSelected
                          ? "bg-slate-800 border-amber-500 ring-1 ring-amber-500/50"
                          : "bg-slate-900/80 border-slate-800 hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {/* Color Badge Indicator */}
                          <div
                            className="p-1.5 rounded-lg bg-slate-800 shrink-0 border flex items-center justify-center relative"
                            style={{ borderColor: objColor }}
                            title={`สี: ${objColor}, ขนาด: ${objSize}px`}
                          >
                            {icon}
                            <span
                              className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border border-slate-900"
                              style={{ backgroundColor: objColor }}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-amber-300 text-[11px] shrink-0">{obj.id}</span>
                              <input
                                type="text"
                                value={obj.label || ""}
                                onChange={(e) => {
                                  const newLabel = e.target.value;
                                  const updated = mapObjects.map((item) => (item.id === obj.id ? { ...item, label: newLabel } : item));
                                  pushToHistory(updated);
                                }}
                                placeholder="ตั้งชื่อวัตถุ..."
                                disabled={!isAdminOrOwner}
                                className="bg-transparent border-b border-transparent focus:border-amber-400 text-slate-200 focus:outline-none text-xs font-medium w-full truncate"
                              />
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-[11px] font-mono text-slate-400 truncate">{detailsText}</p>
                              <span className="text-[10px] font-mono text-amber-300/80 bg-slate-800 px-1.5 py-0.2 rounded shrink-0">
                                {objSize}px
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {/* Edit Coordinates Button for Point objects */}
                          {obj.type === "point" && isAdminOrOwner && (
                            <button
                              type="button"
                              onClick={() => handleOpenPointCoordModal(obj)}
                              className="p-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 transition-colors cursor-pointer"
                              title="แก้ไขค่าพิกัดจุดนี้ (Lat/Lng หรือ UTM)"
                            >
                              <Crosshair className="h-3.5 w-3.5 text-rose-400" />
                              <span className="hidden sm:inline">พิกัด</span>
                            </button>
                          )}

                          {/* Customize Style Toggle Button */}
                          {isAdminOrOwner && (
                            <button
                              type="button"
                              onClick={() => setEditingStyleObjId(isEditingStyle ? null : obj.id)}
                              className={`p-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer border ${
                                isEditingStyle
                                  ? "bg-amber-500 text-slate-950 border-amber-400 font-bold"
                                  : "bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700"
                              }`}
                              title="ปรับแต่งสีและขนาดวัตถุนี้"
                            >
                              <Palette className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">สี/ขนาด</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedObjectId(obj.id);
                              setFocusTarget({ id: obj.id, timestamp: Date.now() });
                            }}
                            className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer border border-slate-700"
                            title="ซูมไปยังตำแหน่ง"
                          >
                            <Target className="h-3 w-3 text-emerald-400" />
                            <span>ซูม</span>
                          </button>

                          {isAdminOrOwner && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = mapObjects.filter((item) => item.id !== obj.id);
                                pushToHistory(updated);
                                if (selectedObjectId === obj.id) setSelectedObjectId(null);
                              }}
                              className="p-1.5 hover:bg-rose-950/80 text-rose-400 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-800/50"
                              title="ลบวัตถุนี้"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded Style Customizer Sub-Panel */}
                      {isEditingStyle && isAdminOrOwner && (
                        <div className="mt-1 pt-2 border-t border-slate-800/80 bg-slate-950/90 p-2.5 rounded-xl space-y-2.5 animate-fadeIn">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                              <Paintbrush className="h-3.5 w-3.5 text-amber-400" />
                              <span>ปรับแต่งรูปแบบสีและขนาดวัตถุ ({obj.id})</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingStyleObjId(null)}
                              className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 cursor-pointer"
                            >
                              ปิด
                            </button>
                          </div>

                          {/* Preset Colors */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-slate-400 shrink-0">เลือกสี:</span>
                            {MAP_PRESET_COLORS.map((c) => (
                              <button
                                key={c.hex}
                                type="button"
                                onClick={() => handleUpdateObjectStyle(obj.id, c.hex, obj.size)}
                                className={`w-4 h-4 rounded-full border cursor-pointer transition-transform ${
                                  objColor.toLowerCase() === c.hex.toLowerCase()
                                    ? "ring-2 ring-amber-400 scale-125 border-white"
                                    : "border-slate-700 hover:scale-110"
                                }`}
                                style={{ backgroundColor: c.hex }}
                                title={`เปลี่ยนเป็นสี${c.name}`}
                              />
                            ))}

                            {/* Color Picker Input */}
                            <div className="flex items-center gap-1 bg-slate-900 px-1 py-0.5 rounded border border-slate-700 shrink-0 ml-1">
                              <input
                                type="color"
                                value={objColor}
                                onChange={(e) => handleUpdateObjectStyle(obj.id, e.target.value, obj.size)}
                                className="w-4 h-4 rounded bg-transparent cursor-pointer border-0 p-0"
                                title="เลือกสีระบุเอง (Color Picker)"
                              />
                              <span className="font-mono text-[9px] text-slate-300 uppercase">{objColor}</span>
                            </div>
                          </div>

                          {/* Size Control Slider */}
                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-900">
                            <span className="text-[10px] text-slate-400 whitespace-nowrap">
                              {obj.type === "point" ? "ขนาดรัศมีจุด:" : "ความหนาเส้น/ขอบเขต:"}
                            </span>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min="1"
                                max="16"
                                value={objSize}
                                onChange={(e) => handleUpdateObjectStyle(obj.id, obj.color, Number(e.target.value))}
                                className="w-28 sm:w-36 accent-amber-500 cursor-pointer"
                              />
                              <span className="font-mono text-[11px] text-amber-300 font-bold w-7 text-right">
                                {objSize}px
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Coordinates Form */}
      {isEditing && (
        <div className="bg-slate-50 border border-indigo-200 rounded-2xl p-4 space-y-4 ring-2 ring-indigo-500/10 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
            <h4 className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-indigo-600" />
              <span>ระบุพิกัดตำแหน่งโครงการ (ปักหมุดบนแผนที่ หรือ กรอกตัวเลข)</span>
            </h4>

            {/* Coordinate Format Mode Switcher */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setCoordMode("latlng")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  coordMode === "latlng"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                Lat / Long (องศาทศนิยม)
              </button>
              <button
                type="button"
                onClick={() => setCoordMode("utm")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  coordMode === "utm"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                UTM (WGS84 Grid)
              </button>
            </div>
          </div>

          {coordMode === "latlng" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Latitude (ละติจูด N) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={lat}
                  onChange={(e) => handleLatLngChange(parseFloat(e.target.value) || 0, lng)}
                  placeholder="เช่น 13.756300"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Longitude (ลองจิจูด E) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={lng}
                  onChange={(e) => handleLatLngChange(lat, parseFloat(e.target.value) || 0)}
                  placeholder="เช่น 100.501800"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">UTM Zone</label>
                  <select
                    value={utmZone}
                    onChange={(e) => handleUtmChange(parseInt(e.target.value, 10), utmHemisphere, utmEasting, utmNorthing)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value={47}>Zone 47 (ประเทศไทยส่วนใหญ่)</option>
                    <option value={48}>Zone 48 (ภาคอีสานตอนบน/ตะวันออก)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hemisphere</label>
                  <select
                    value={utmHemisphere}
                    onChange={(e) => handleUtmChange(utmZone, e.target.value as "N" | "S", utmEasting, utmNorthing)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="N">N (Northern)</option>
                    <option value="S">S (Southern)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Easting (X - เมตร) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={utmEasting}
                    onChange={(e) => handleUtmChange(utmZone, utmHemisphere, parseFloat(e.target.value) || 0, utmNorthing)}
                    placeholder="เช่น 662854"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Northing (Y - เมตร) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={utmNorthing}
                    onChange={(e) => handleUtmChange(utmZone, utmHemisphere, utmEasting, parseFloat(e.target.value) || 0)}
                    placeholder="เช่น 1521580"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-2.5 text-[11px] text-indigo-900 font-mono flex items-center justify-between">
                <span>คำนวณแปลงเป็น Lat/Lng อัตโนมัติ:</span>
                <span className="font-bold text-indigo-700">
                  Lat: {lat.toFixed(6)}, Lng: {lng.toFixed(6)}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ชื่อเรียกสถานที่ / จุดอ้างอิงอธิบาย</label>
            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="เช่น บริเวณสะพานข้ามคลองสายหลัก หมู่ 3"
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Pin Style Selection */}
          <div className="space-y-2 pt-1 border-t border-slate-200/60">
            <label className="block text-xs font-bold text-slate-800 flex items-center justify-between">
              <span>เลือกรูปแบบสัญลักษณ์หมุดปักแผนที่ (Custom Pin Icon Style)</span>
              <span className="text-[11px] font-normal text-indigo-600 font-mono">
                {activePinStyleObj.name}
              </span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {PIN_STYLES.map((style) => {
                const isSelected = pinStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setPinStyle(style.id)}
                    className={`p-2 rounded-xl border text-left transition-all flex items-center gap-2 cursor-pointer ${
                      isSelected
                        ? "bg-white border-indigo-600 ring-2 ring-indigo-500/20 shadow-xs"
                        : "bg-white/80 border-slate-200 hover:bg-white hover:border-slate-300"
                    }`}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-2xs font-bold text-xs"
                      style={{ backgroundColor: style.color }}
                    >
                      ✓
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{style.label}</p>
                      <p className="text-[10px] text-slate-500 truncate">{style.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preset Buttons & GPS */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-slate-500">เลือกตำแหน่งด่วน:</span>
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    handleLatLngChange(p.lat, p.lng);
                    setLocationName(`อ.เมือง จ.${p.label}`);
                  }}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700 transition-colors cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGetGps}
                disabled={isGettingGps}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Compass className={`h-3.5 w-3.5 text-amber-400 ${isGettingGps ? "animate-spin" : ""}`} />
                <span>{isGettingGps ? "กำลังดึงพิกัด GPS..." : "ดึงพิกัด GPS ปัจจุบัน"}</span>
              </button>

              <button
                type="button"
                onClick={handleSaveMapObjects}
                disabled={isSaving}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{isSaving ? "กำลังบันทึก..." : "บันทึกพิกัด"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Satellite Map Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-slate-900 text-white p-2 sm:px-3.5 text-xs font-medium min-w-0 rounded-t-xl border-x border-t border-slate-800">
        <div className="flex items-center gap-1.5 bg-slate-800/90 p-1 rounded-lg border border-slate-700/80 self-start sm:self-auto overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setMapType("k")}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              mapType === "k" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-300 hover:text-white"
            }`}
          >
            ดาวเทียม Google
          </button>
          <button
            type="button"
            onClick={() => setMapType("esri")}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              mapType === "esri" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-300 hover:text-white"
            }`}
          >
            ดาวเทียม Esri World HD
          </button>
          <button
            type="button"
            onClick={() => setMapType("h")}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              mapType === "h" ? "bg-emerald-500 text-slate-950 shadow-sm" : "text-slate-300 hover:text-white"
            }`}
          >
            ไฮบริด (Hybrid HD)
          </button>
          <button
            type="button"
            onClick={() => setMapType("m")}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              mapType === "m" ? "bg-indigo-500 text-white shadow-sm" : "text-slate-300 hover:text-white"
            }`}
          >
            แผนที่ถนน (Roadmap)
          </button>
          <button
            type="button"
            onClick={() => setMapType("terrain")}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              mapType === "terrain" ? "bg-teal-500 text-slate-950 shadow-sm" : "text-slate-300 hover:text-white"
            }`}
            title="แผนที่ภูมิประเทศ OpenStreetMap (OpenTopoMap)"
          >
            ภูมิประเทศ OSM (Terrain)
          </button>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2.5 text-slate-300">
          <button
            type="button"
            onClick={handleFocusLocation}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/60 text-emerald-300 font-sans font-bold transition-colors cursor-pointer shadow-xs"
            title="ซูมกลับไปยังตำแหน่งหมุดโครงการ"
          >
            <Target className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>ที่ตั้งโครงการ</span>
          </button>

          <span className="hidden md:inline-flex items-center gap-1.5 text-slate-400 font-sans text-xs">
            <ZoomIn className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span>ซูมเข้า-ออกด้วย Scroll Wheel หรือปุ่ม +/-</span>
          </span>
        </div>
      </div>

      {/* Main Map Canvas Area */}
      <div className="relative w-full h-[420px] sm:h-[540px] rounded-b-xl overflow-hidden border-x border-b border-slate-800 shadow-inner flex flex-col md:flex-row">
        {/* Interactive Leaflet Map Component */}
        <div className="relative flex-1 h-full overflow-hidden">
          {!isFullScreen && (
            <LeafletMapView
              lat={lat}
              lng={lng}
              mapType={mapType}
              zoom={zoom}
              onZoomChange={setZoom}
              isEditing={isEditing}
              onLatLngChange={handleLatLngChange}
              locationName={locationName || project.projectName}
              utmFormatted={utmInfo.formatted}
              isFullScreen={false}
              centerTrigger={centerTrigger}
              pinStyle={pinStyle}
              mapObjects={mapObjects}
              drawingMode={drawingMode}
              tempCoords={tempCoords}
              onMapClickForDrawing={handleMapClickForDrawing}
              selectedObjectId={selectedObjectId}
              onSelectObject={setSelectedObjectId}
              focusTarget={focusTarget}
              canDraw={true}
              activeColor={activeColor}
              activeSize={activeSize}
            />
          )}

          {/* Active Drawing Floating Status Banner */}
          {drawingMode && (
            <div className="absolute top-3 left-3 right-3 bg-slate-950/95 backdrop-blur-md border border-amber-500 text-white p-3 rounded-2xl shadow-2xl z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-fadeIn">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30 shrink-0">
                  {drawingMode === "point" ? (
                    <MapPin className="h-5 w-5 text-rose-400" />
                  ) : drawingMode === "line" ? (
                    <Spline className="h-5 w-5 text-blue-400" />
                  ) : (
                    <Shapes className="h-5 w-5 text-emerald-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <h5 className="text-xs font-bold text-amber-300 flex items-center gap-1.5 flex-wrap">
                    <span>
                      {drawingMode === "point"
                        ? "กำลังวาดเพิ่มจุด: คลิกบนแผนที่เพื่อวางจุดตำแหน่ง"
                        : drawingMode === "line"
                        ? `กำลังวาดเพิ่มเส้น: คลิกบนแผนที่เพื่อสร้างจุดหลัก (สะสม ${tempCoords.length} จุด)`
                        : `กำลังวาดเพิ่มโพลิกอน: คลิกบนแผนที่เพื่อกำหนดจุดมุม (สะสม ${tempCoords.length} จุด)`}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-[10px] text-slate-200 shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full border border-white shrink-0" style={{ backgroundColor: activeColor }} />
                      <span className="uppercase">{activeColor}</span>
                      <span className="text-amber-400 font-bold ml-0.5">{activeSize}px</span>
                    </span>
                  </h5>
                  <p className="text-[11px] font-mono text-slate-300 mt-0.5 truncate">
                    {drawingMode === "line" && `ระยะทางรวม: ${formatDistance(calculateLineDistance(tempCoords))}`}
                    {drawingMode === "polygon" && `พื้นที่รวม: ${formatArea(calculatePolygonArea(tempCoords))}`}
                    {drawingMode === "point" && "คลิกตำแหน่งใดก็ได้บนแผนที่เพื่อสร้างจุดอ้างอิง"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 justify-end flex-wrap">
                {drawingMode === "point" && (
                  <button
                    type="button"
                    onClick={() => handleOpenPointCoordModal()}
                    className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-extrabold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 ring-1 ring-white/20"
                    title="เปิดหน้าต่างกรอกพิกัดระบุตำแหน่งจุด"
                  >
                    <Keyboard className="h-3.5 w-3.5 text-slate-950" />
                    <span>✍️ กรอกพิกัดระบุจุด</span>
                  </button>
                )}

                {tempCoords.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRemoveLastTempPoint}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    ลบจุดล่าสุด
                  </button>
                )}

                {drawingMode === "line" && tempCoords.length >= 2 && (
                  <button
                    type="button"
                    onClick={handleFinishDrawing}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shadow-md"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>เสร็จสิ้นการวาดเส้น</span>
                  </button>
                )}

                {drawingMode === "polygon" && tempCoords.length >= 3 && (
                  <button
                    type="button"
                    onClick={handleFinishDrawing}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shadow-md"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>เสร็จสิ้นการวาดโพลิกอน</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCancelDrawing}
                  className="px-2.5 py-1.5 bg-rose-900/60 hover:bg-rose-800 text-rose-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          {/* Pinning Notification Header */}
          {isEditing && !drawingMode && (
            <div className="absolute top-3 right-3 bg-indigo-950/90 backdrop-blur-md border border-indigo-500 text-indigo-100 px-3 py-1.5 rounded-xl shadow-xl z-10 text-xs font-bold flex items-center gap-1.5 animate-pulse">
              <MousePointerClick className="h-4 w-4 text-amber-400 shrink-0" />
              <span>โหมดปักหมุดเปิดอยู่ (คลิกบนแผนที่หรือลากหมุดเพื่อปรับตำแหน่ง)</span>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Modal View */}
      {isFullScreen && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col animate-fadeIn">
          {/* Fullscreen Header */}
          <div className="bg-slate-900 border-b border-slate-800 p-3 sm:px-6 flex items-center justify-between text-white">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 shrink-0">
                <Globe className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold flex items-center gap-2 truncate">
                  <span className="truncate">{project.projectName} - แผนที่พิกัดเต็มจอ</span>
                  <span className="text-[10px] font-bold bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                    FULLSCREEN MODE
                  </span>
                </h3>
                <p className="text-xs text-slate-400 font-mono truncate">
                  Lat: {lat.toFixed(6)}, Lng: {lng.toFixed(6)} | {utmInfo.formatted} ({locationName})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {/* Drawing Tools in Fullscreen */}
              <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80">
                {/* Unified Add Point Button with Integrated Coordinate Input in Fullscreen */}
                <div className="relative inline-block">
                  <div className="flex items-center rounded-lg overflow-hidden border border-slate-700">
                    <button
                      type="button"
                      onClick={() => {
                        const isPoint = drawingMode === "point";
                        setDrawingMode(isPoint ? null : "point");
                        if (!isPoint && (activeColor === "#3b82f6" || activeColor === "#10b981")) {
                          setActiveColor("#ef4444");
                          setActiveSize(7);
                        }
                        setTempCoords([]);
                        setShowPointMenuFs(false);
                      }}
                      className={`px-2.5 py-1 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        drawingMode === "point"
                          ? "bg-rose-500 text-white shadow-md ring-2 ring-rose-300"
                          : "text-slate-300 hover:bg-slate-700 hover:text-white"
                      }`}
                      title="คลิกบนแผนที่เพื่อวางจุดตำแหน่ง"
                    >
                      <MapPin className="h-3.5 w-3.5 text-rose-400" />
                      <span className="hidden sm:inline">เพิ่มจุด</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPointMenuFs((prev) => !prev);
                      }}
                      className={`px-1.5 py-1 text-xs font-bold transition-all flex items-center justify-center cursor-pointer border-l border-slate-700 ${
                        drawingMode === "point"
                          ? "bg-rose-600 text-white hover:bg-rose-700"
                          : "text-slate-300 hover:bg-slate-700 hover:text-white"
                      }`}
                      title="เลือกวิธีเพิ่มจุด (คลิกบนแผนที่ หรือ กรอกพิกัด)"
                    >
                      <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${showPointMenuFs ? "rotate-180 text-amber-400" : ""}`} />
                    </button>
                  </div>

                  {/* Dropdown Menu inside Add Point (Fullscreen) */}
                  {showPointMenuFs && (
                    <div
                      className="absolute top-full left-0 mt-1.5 w-56 bg-slate-900/98 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl z-50 p-1.5 animate-fadeIn"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setDrawingMode("point");
                          if (activeColor === "#3b82f6" || activeColor === "#10b981") {
                            setActiveColor("#ef4444");
                            setActiveSize(7);
                          }
                          setTempCoords([]);
                          setShowPointMenuFs(false);
                        }}
                        className={`w-full px-2.5 py-2 rounded-lg text-left text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                          drawingMode === "point"
                            ? "bg-rose-500/20 text-rose-300 font-bold"
                            : "text-slate-200 hover:bg-slate-800"
                        }`}
                      >
                        <MapPin className="h-4 w-4 text-rose-400 shrink-0" />
                        <div>
                          <div className="font-bold text-white">คลิกปักหมุดบนแผนที่</div>
                          <div className="text-[10px] text-slate-400">คลิกที่ใดก็ได้บนแผนที่เพื่อวางจุด</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowPointMenuFs(false);
                          handleOpenPointCoordModal();
                        }}
                        className="w-full px-2.5 py-2 rounded-lg text-left text-xs font-medium text-amber-300 hover:bg-amber-500/15 hover:text-amber-200 flex items-center gap-2 transition-colors cursor-pointer border-t border-slate-800 mt-1 pt-1.5"
                      >
                        <Keyboard className="h-4 w-4 text-amber-400 shrink-0" />
                        <div>
                          <div className="font-bold flex items-center gap-1.5">
                            <span>✍️ กรอกพิกัดระบุตำแหน่ง</span>
                          </div>
                          <div className="text-[10px] text-slate-400">ระบุ Lat/Lng หรือ UTM Zone 47/48</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const isLine = drawingMode === "line";
                    setDrawingMode(isLine ? null : "line");
                    if (!isLine && (activeColor === "#ef4444" || activeColor === "#10b981")) {
                      setActiveColor("#3b82f6");
                      setActiveSize(4);
                    }
                    setTempCoords([]);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    drawingMode === "line"
                      ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-300"
                      : "text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`}
                  title="เพิ่มเส้นหรือแนวคลอง/ถนน"
                >
                  <Spline className="h-3.5 w-3.5 text-blue-400" />
                  <span className="hidden sm:inline">เพิ่มเส้น</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const isPoly = drawingMode === "polygon";
                    setDrawingMode(isPoly ? null : "polygon");
                    if (!isPoly && (activeColor === "#ef4444" || activeColor === "#3b82f6")) {
                      setActiveColor("#10b981");
                      setActiveSize(3);
                    }
                    setTempCoords([]);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    drawingMode === "polygon"
                      ? "bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300"
                      : "text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`}
                  title="เพิ่มพื้นที่หรือแปลงที่ดิน"
                >
                  <Shapes className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">เพิ่มโพลิกอน</span>
                </button>
              </div>

              {/* Undo / Redo in Fullscreen */}
              <div className="flex items-center gap-0.5 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={historyIndex <= 0}
                  className="p-1 hover:bg-slate-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-slate-300"
                  title="ย้อนกลับ (Undo - Ctrl+Z)"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  className="p-1 hover:bg-slate-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-slate-300"
                  title="ทำซ้ำ (Redo - Ctrl+Y)"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Object Inspector Toggle in Fullscreen Header */}
              <button
                type="button"
                onClick={() => setShowObjectList(!showObjectList)}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                  showObjectList
                    ? "bg-amber-500 text-slate-950 font-extrabold border-amber-400 ring-2 ring-amber-300/40"
                    : "bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700"
                }`}
                title="เปิด/ปิด แถบรายการวัตถุบนแผนที่"
              >
                <Layers className="h-3.5 w-3.5 text-amber-400" />
                <span>วัตถุบนแผนที่ ({mapObjects.length})</span>
              </button>

              {/* Save Button in Fullscreen */}
              {isAdminOrOwner ? (
                <button
                  type="button"
                  onClick={handleSaveMapObjects}
                  disabled={isSaving}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                    isMapDirty
                      ? "bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold ring-2 ring-amber-300 animate-pulse"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white"
                  }`}
                  title="บันทึกข้อมูลวัตถุบนแผนที่"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{isSaving ? "กำลังบันทึก..." : isMapDirty ? "บันทึกวัตถุ *" : "บันทึกวัตถุ"}</span>
                </button>
              ) : (
                <div
                  className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-slate-800/80 text-slate-400 border border-slate-700/60 flex items-center gap-1 cursor-not-allowed select-none"
                  title="บทบาท User สามารถวาดทดสอบ/วัดขนาดได้ แต่ไม่สามารถบันทึกถาวรได้"
                >
                  <Lock className="h-3 w-3 text-amber-400" />
                  <span className="hidden sm:inline">เฉพาะ Admin บันทึกได้</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (!isEditing && onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
                  setIsEditing(!isEditing);
                }}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                  isEditing
                    ? "bg-indigo-600 text-white border-indigo-500"
                    : "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
                }`}
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{isEditing ? "โหมดแก้ไข (เปิด)" : "โหมดแก้ไข / ปักหมุด"}</span>
              </button>

              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Google Maps</span>
              </a>

              <button
                type="button"
                onClick={() => setIsFullScreen(false)}
                className="p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold"
                title="ปิดหน้าจอเต็มจอ"
              >
                <X className="h-5 w-5" />
                <span className="hidden sm:inline">ปิดหน้าจอเต็มจอ</span>
              </button>
            </div>
          </div>

          {/* Fullscreen Map Toolbar */}
          <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2 flex items-center justify-between text-xs text-slate-300 flex-wrap gap-2">
            <div className="flex items-center gap-1.5 bg-slate-800/90 p-1 rounded-lg border border-slate-700/80 overflow-x-auto max-w-full">
              <button
                type="button"
                onClick={() => setMapType("k")}
                className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer whitespace-nowrap ${
                  mapType === "k" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-300 hover:text-white"
                }`}
              >
                ดาวเทียม Google
              </button>
              <button
                type="button"
                onClick={() => setMapType("esri")}
                className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer whitespace-nowrap ${
                  mapType === "esri" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-300 hover:text-white"
                }`}
              >
                ดาวเทียม Esri World HD
              </button>
              <button
                type="button"
                onClick={() => setMapType("h")}
                className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer whitespace-nowrap ${
                  mapType === "h" ? "bg-emerald-500 text-slate-950 shadow-sm" : "text-slate-300 hover:text-white"
                }`}
              >
                ไฮบริด (Hybrid HD)
              </button>
              <button
                type="button"
                onClick={() => setMapType("m")}
                className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer whitespace-nowrap ${
                  mapType === "m" ? "bg-indigo-500 text-white shadow-sm" : "text-slate-300 hover:text-white"
                }`}
              >
                แผนที่ถนน (Roadmap)
              </button>
              <button
                type="button"
                onClick={() => setMapType("terrain")}
                className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer whitespace-nowrap ${
                  mapType === "terrain" ? "bg-teal-500 text-slate-950 shadow-sm" : "text-slate-300 hover:text-white"
                }`}
                title="แผนที่ภูมิประเทศ OpenStreetMap (OpenTopoMap)"
              >
                ภูมิประเทศ OSM (Terrain)
              </button>
            </div>

            <div className="flex items-center gap-3 font-mono">
              <button
                type="button"
                onClick={handleFocusLocation}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-600 text-emerald-300 font-sans font-bold transition-colors cursor-pointer shadow-xs"
                title="ซูมกลับไปยังตำแหน่งหมุดโครงการ"
              >
                <Target className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>ที่ตั้งโครงการ</span>
              </button>

              <span className="hidden md:inline-flex items-center gap-1.5 text-slate-300 font-sans text-xs">
                <ZoomIn className="h-3.5 w-3.5 text-cyan-400" />
                <span>เลื่อน Scroll Wheel เพื่อซูมเข้า-ออกได้โดยตรง</span>
              </span>
            </div>
          </div>

          {/* Fullscreen Map Canvas and Side Panel */}
          <div className="relative flex-1 w-full h-full overflow-hidden flex flex-col md:flex-row">
            <div className="relative flex-1 w-full h-full overflow-hidden">
              <LeafletMapView
                lat={lat}
                lng={lng}
                mapType={mapType}
                zoom={zoom}
                onZoomChange={setZoom}
                isEditing={isEditing}
                onLatLngChange={handleLatLngChange}
                locationName={locationName || project.projectName}
                utmFormatted={utmInfo.formatted}
                isFullScreen={true}
                centerTrigger={centerTrigger}
                pinStyle={pinStyle}
                mapObjects={mapObjects}
                drawingMode={drawingMode}
                tempCoords={tempCoords}
                onMapClickForDrawing={handleMapClickForDrawing}
                selectedObjectId={selectedObjectId}
                onSelectObject={setSelectedObjectId}
                focusTarget={focusTarget}
                canDraw={true}
                activeColor={activeColor}
                activeSize={activeSize}
              />

              {/* Active Drawing Floating Status Banner in Fullscreen */}
              {drawingMode && (
                <div className="absolute top-3 left-3 right-3 sm:right-auto sm:max-w-xl bg-slate-950/95 backdrop-blur-md border border-amber-500 text-white p-3 rounded-2xl shadow-2xl z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-fadeIn">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30 shrink-0">
                      {drawingMode === "point" ? (
                        <MapPin className="h-5 w-5 text-rose-400" />
                      ) : drawingMode === "line" ? (
                        <Spline className="h-5 w-5 text-blue-400" />
                      ) : (
                        <Shapes className="h-5 w-5 text-emerald-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h5 className="text-xs font-bold text-amber-300 flex items-center gap-1.5 flex-wrap">
                        <span>
                          {drawingMode === "point"
                            ? "กำลังวาดเพิ่มจุด: คลิกบนแผนที่เพื่อวางจุดตำแหน่ง"
                            : drawingMode === "line"
                            ? `กำลังวาดเพิ่มเส้น: คลิกบนแผนที่ (${tempCoords.length} จุด)`
                            : `กำลังวาดเพิ่มโพลิกอน: คลิกบนแผนที่ (${tempCoords.length} จุด)`}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-[10px] text-slate-200 shrink-0">
                          <span className="w-2.5 h-2.5 rounded-full border border-white shrink-0" style={{ backgroundColor: activeColor }} />
                          <span className="uppercase">{activeColor}</span>
                          <span className="text-amber-400 font-bold ml-0.5">{activeSize}px</span>
                        </span>
                      </h5>
                      <p className="text-[11px] font-mono text-slate-300 mt-0.5 truncate">
                        {drawingMode === "line" && `ระยะทางรวม: ${formatDistance(calculateLineDistance(tempCoords))}`}
                        {drawingMode === "polygon" && `พื้นที่รวม: ${formatArea(calculatePolygonArea(tempCoords))}`}
                        {drawingMode === "point" && "คลิกตำแหน่งใดก็ได้บนแผนที่เพื่อสร้างจุดอ้างอิง"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 justify-end flex-wrap">
                    {drawingMode === "point" && (
                      <button
                        type="button"
                        onClick={() => handleOpenPointCoordModal()}
                        className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-extrabold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 ring-1 ring-white/20"
                        title="เปิดหน้าต่างกรอกพิกัดระบุตำแหน่งจุด"
                      >
                        <Keyboard className="h-3.5 w-3.5 text-slate-950" />
                        <span>✍️ กรอกพิกัดระบุจุด</span>
                      </button>
                    )}

                    {tempCoords.length > 0 && (
                      <button
                        type="button"
                        onClick={handleRemoveLastTempPoint}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        ลบจุดล่าสุด
                      </button>
                    )}

                    {drawingMode === "line" && tempCoords.length >= 2 && (
                      <button
                        type="button"
                        onClick={handleFinishDrawing}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shadow-md"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>เสร็จสิ้น</span>
                      </button>
                    )}

                    {drawingMode === "polygon" && tempCoords.length >= 3 && (
                      <button
                        type="button"
                        onClick={handleFinishDrawing}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shadow-md"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>เสร็จสิ้น</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleCancelDrawing}
                      className="px-2.5 py-1.5 bg-rose-900/60 hover:bg-rose-800 text-rose-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}

              {/* Pinning Notification Header in Fullscreen */}
              {isEditing && !drawingMode && (
                <div className="absolute top-3 right-3 bg-indigo-950/90 backdrop-blur-md border border-indigo-500 text-indigo-100 px-3 py-1.5 rounded-xl shadow-xl z-10 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                  <MousePointerClick className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>โหมดปักหมุดเปิดอยู่ (คลิกบนแผนที่หรือลากหมุดเพื่อปรับตำแหน่ง)</span>
                </div>
              )}
            </div>

            {/* Object Inspector Drawer List inside Fullscreen Mode */}
            {showObjectList && (
              <div className="w-full md:w-96 bg-slate-950 border-t md:border-t-0 md:border-l border-slate-800 p-4 space-y-3 overflow-y-auto max-h-[45vh] md:max-h-full shrink-0 z-30 shadow-2xl animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <h5 className="text-xs sm:text-sm font-bold text-amber-400 flex items-center gap-1.5">
                    <Layers className="h-4 w-4" />
                    <span>วัตถุบนแผนที่ ({mapObjects.length} รายการ)</span>
                  </h5>
                  <div className="flex items-center gap-2">
                    {isAdminOrOwner && mapObjects.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("คุณต้องการลบวัตถุทั้งหมดบนแผนที่หรือไม่?")) {
                            pushToHistory([]);
                          }
                        }}
                        className="text-[11px] text-rose-400 hover:text-rose-300 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/60 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>ลบทั้งหมด</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowObjectList(false)}
                      className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                      title="ปิดแถบรายการ"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {mapObjects.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">
                    ยังไม่มีวัตถุบนแผนที่ สามารถกดเลือก "เพิ่มจุด", "เพิ่มเส้น" หรือ "เพิ่มโพลิกอน" เพื่อเริ่มวาดได้
                  </p>
                ) : (
                  <div className="space-y-2">
                    {mapObjects.map((obj) => {
                      const isSelected = selectedObjectId === obj.id;
                      const isEditingStyle = editingStyleObjId === obj.id;
                      let detailsText = "";
                      const objColor = obj.color || (obj.type === "point" ? "#ef4444" : obj.type === "line" ? "#3b82f6" : "#10b981");
                      const objSize = obj.size || (obj.type === "point" ? 7 : obj.type === "line" ? 4 : 3);

                      let icon = <MapPin className="h-3.5 w-3.5" style={{ color: objColor }} />;

                      if (obj.type === "point") {
                        const coord = obj.coordinates as MapPointCoordinate;
                        detailsText = `Lat: ${coord.lat.toFixed(5)}, Lng: ${coord.lng.toFixed(5)}`;
                      } else if (obj.type === "line") {
                        icon = <Spline className="h-3.5 w-3.5" style={{ color: objColor }} />;
                        const coords = obj.coordinates as MapPointCoordinate[];
                        detailsText = `ความยาว: ${formatDistance(calculateLineDistance(coords))} (${coords.length} จุด)`;
                      } else if (obj.type === "polygon") {
                        icon = <Shapes className="h-3.5 w-3.5" style={{ color: objColor }} />;
                        const coords = obj.coordinates as MapPointCoordinate[];
                        detailsText = `พื้นที่: ${formatArea(calculatePolygonArea(coords))} (${coords.length} จุดมุม)`;
                      }

                      return (
                        <div
                          key={obj.id}
                          className={`p-2.5 rounded-xl border text-xs flex flex-col gap-2 transition-all ${
                            isSelected
                              ? "bg-slate-800 border-amber-500 ring-1 ring-amber-500/50"
                              : "bg-slate-900/80 border-slate-800 hover:bg-slate-800/60"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {/* Color Badge Indicator */}
                              <div
                                className="p-1.5 rounded-lg bg-slate-800 shrink-0 border flex items-center justify-center relative"
                                style={{ borderColor: objColor }}
                                title={`สี: ${objColor}, ขนาด: ${objSize}px`}
                              >
                                {icon}
                                <span
                                  className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border border-slate-900"
                                  style={{ backgroundColor: objColor }}
                                />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-amber-300 text-[11px] shrink-0">{obj.id}</span>
                                  <input
                                    type="text"
                                    value={obj.label || ""}
                                    onChange={(e) => {
                                      const newLabel = e.target.value;
                                      const updated = mapObjects.map((item) => (item.id === obj.id ? { ...item, label: newLabel } : item));
                                      pushToHistory(updated);
                                    }}
                                    placeholder="ตั้งชื่อวัตถุ..."
                                    disabled={!isAdminOrOwner}
                                    className="bg-transparent border-b border-transparent focus:border-amber-400 text-slate-200 focus:outline-none text-xs font-medium w-full truncate"
                                  />
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <p className="text-[11px] font-mono text-slate-400 truncate">{detailsText}</p>
                                  <span className="text-[10px] font-mono text-amber-300/80 bg-slate-800 px-1.5 py-0.2 rounded shrink-0">
                                    {objSize}px
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {/* Edit Coordinates Button for Point objects */}
                              {obj.type === "point" && isAdminOrOwner && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPointCoordModal(obj)}
                                  className="p-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 transition-colors cursor-pointer"
                                  title="แก้ไขค่าพิกัดจุดนี้ (Lat/Lng หรือ UTM)"
                                >
                                  <Crosshair className="h-3.5 w-3.5 text-rose-400" />
                                  <span className="hidden sm:inline">พิกัด</span>
                                </button>
                              )}

                              {/* Customize Style Toggle Button */}
                              {isAdminOrOwner && (
                                <button
                                  type="button"
                                  onClick={() => setEditingStyleObjId(isEditingStyle ? null : obj.id)}
                                  className={`p-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer border ${
                                    isEditingStyle
                                      ? "bg-amber-500 text-slate-950 border-amber-400 font-bold"
                                      : "bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700"
                                  }`}
                                  title="ปรับแต่งสีและขนาดวัตถุนี้"
                                >
                                  <Palette className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">สี/ขนาด</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedObjectId(obj.id);
                                  setFocusTarget({ id: obj.id, timestamp: Date.now() });
                                }}
                                className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer border border-slate-700"
                                title="ซูมไปยังตำแหน่ง"
                              >
                                <Target className="h-3 w-3 text-emerald-400" />
                                <span>ซูม</span>
                              </button>

                              {isAdminOrOwner && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = mapObjects.filter((item) => item.id !== obj.id);
                                    pushToHistory(updated);
                                    if (selectedObjectId === obj.id) setSelectedObjectId(null);
                                  }}
                                  className="p-1.5 hover:bg-rose-950/80 text-rose-400 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-800/50"
                                  title="ลบวัตถุนี้"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Expanded Style Customizer Sub-Panel */}
                          {isEditingStyle && isAdminOrOwner && (
                            <div className="mt-1 pt-2 border-t border-slate-800/80 bg-slate-950/90 p-2.5 rounded-xl space-y-2.5 animate-fadeIn">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                                  <Paintbrush className="h-3.5 w-3.5 text-amber-400" />
                                  <span>ปรับแต่งสีและขนาด ({obj.id})</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setEditingStyleObjId(null)}
                                  className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 cursor-pointer"
                                >
                                  ปิด
                                </button>
                              </div>

                              {/* Color Selector */}
                              <div>
                                <label className="text-[10px] text-slate-400 block mb-1">เลือกสี:</label>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {MAP_PRESET_COLORS.map((c) => (
                                    <button
                                      key={c.hex}
                                      type="button"
                                      onClick={() => handleUpdateObjectStyle(obj.id, c.hex, obj.size)}
                                      className={`w-5 h-5 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center ${
                                        objColor.toLowerCase() === c.hex.toLowerCase()
                                          ? "border-white ring-2 ring-amber-400 scale-110"
                                          : "border-slate-800 hover:scale-105"
                                      }`}
                                      style={{ backgroundColor: c.hex }}
                                      title={c.name}
                                    />
                                  ))}
                                  <input
                                    type="color"
                                    value={objColor}
                                    onChange={(e) => handleUpdateObjectStyle(obj.id, e.target.value, obj.size)}
                                    className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                                    title="เลือกสีอิสระ"
                                  />
                                </div>
                              </div>

                              {/* Size Selector */}
                              <div>
                                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                                  <span>{obj.type === "point" ? "ขนาดรัศมีจุด (px):" : "ความหนาของเส้น (px):"}</span>
                                  <span className="font-mono text-amber-300 font-bold">{objSize} px</span>
                                </div>
                                <input
                                  type="range"
                                  min={obj.type === "point" ? 3 : 1}
                                  max={obj.type === "point" ? 20 : 12}
                                  step={1}
                                  value={objSize}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    handleUpdateObjectStyle(obj.id, obj.color, val);
                                  }}
                                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        )}

        {/* Modal: Add or Edit Point by Coordinates (Lat/Lng or UTM) */}
        {showPointCoordModal && (
          <div
            className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowPointCoordModal(false);
              }
            }}
          >
            <div className="bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col my-auto max-h-[94vh] text-white">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-800 p-4 sm:px-5 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 bg-gradient-to-br from-rose-500/20 to-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30 shrink-0">
                    <Crosshair className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 truncate">
                      <span>{editingPointObjId ? `แก้ไขพิกัดจุด (${editingPointObjId})` : "กรอกพิกัดปักจุดตำแหน่งบนแผนที่"}</span>
                    </h4>
                    <p className="text-xs text-slate-400 truncate">
                      รองรับพิกัดภูมิศาสตร์ WGS84 (Lat/Lng), DMS และกริด UTM Zone 47/48
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPointCoordModal(false)}
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                  title="ปิดหน้าต่าง"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
                {/* Quick Fill Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-slate-400 font-medium shrink-0">ดึงพิกัดด่วน:</span>
                  <button
                    type="button"
                    onClick={handleUseProjectCoordsForPoint}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="ใช้พิกัดที่ตั้งหลักของโครงการ"
                  >
                    <Target className="h-3.5 w-3.5 text-amber-400" />
                    <span>พิกัดโครงการหลัก ({lat.toFixed(4)}, {lng.toFixed(4)})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleUseCurrentGpsForPoint}
                    disabled={isGettingPointGps}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    title="ดึงพิกัด GPS ปัจจุบันของอุปกรณ์"
                  >
                    <Navigation className={`h-3.5 w-3.5 text-emerald-400 ${isGettingPointGps ? "animate-spin" : ""}`} />
                    <span>{isGettingPointGps ? "กำลังค้นหา..." : "GPS ตำแหน่งปัจจุบัน"}</span>
                  </button>
                </div>

                {/* Coordinate System Tab Switcher */}
                <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPointCoordInputMode("latlng")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      pointCoordInputMode === "latlng"
                        ? "bg-amber-500 text-slate-950 shadow-md font-extrabold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    <span>ละติจูด / ลองจิจูด (Lat, Lng)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPointCoordInputMode("utm")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      pointCoordInputMode === "utm"
                        ? "bg-amber-500 text-slate-950 shadow-md font-extrabold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>พิกัดกริด UTM (Zone 47/48)</span>
                  </button>
                </div>

                {/* Tab Content: Lat / Lng */}
                {pointCoordInputMode === "latlng" ? (
                  <div className="space-y-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                    {/* Quick Paste Field */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                          <span>📋 ช่องวางพิกัดด่วน (Quick Paste)</span>
                        </label>
                        <span className="text-[10px] text-slate-400">รองรับ Lat,Lng / DMS / ลิงก์ Maps</span>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={pointCoordQuickPaste}
                          onChange={(e) => handlePointQuickPasteChange(e.target.value)}
                          placeholder="เช่น 13.756331, 100.501765 หรือ 13°45'22.8&quot;N 100°30'06.4&quot;E"
                          className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none pr-8"
                        />
                        {pointCoordQuickPaste && (
                          <button
                            type="button"
                            onClick={() => handlePointQuickPasteChange("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                            title="ล้างข้อมูล"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Separate Lat and Lng Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          ละติจูด (Latitude - Y) <span className="text-rose-400">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            value={pointCoordLat}
                            onChange={(e) => handlePointLatLngInputChange(e.target.value, pointCoordLng)}
                            placeholder="เช่น 13.756331"
                            className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-amber-400/80">
                            °N
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">ขอบเขต -90.0 ถึง 90.0</p>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          ลองจิจูด (Longitude - X) <span className="text-rose-400">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            value={pointCoordLng}
                            onChange={(e) => handlePointLatLngInputChange(pointCoordLat, e.target.value)}
                            placeholder="เช่น 100.501765"
                            className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-400/80">
                            °E
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">ขอบเขต -180.0 ถึง 180.0</p>
                      </div>
                    </div>

                    {/* Live Calculated UTM Preview */}
                    <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 block">แปลงเป็นพิกัด UTM อัตโนมัติ:</span>
                        <span className="text-xs font-mono font-bold text-amber-300 truncate block">
                          UTM Zone {pointCoordUtmZone}{pointCoordUtmHemi} | E: {pointCoordUtmEasting || "-"} m, N: {pointCoordUtmNorthing || "-"} m
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const text = `UTM Zone ${pointCoordUtmZone}${pointCoordUtmHemi} ${pointCoordUtmEasting}E ${pointCoordUtmNorthing}N`;
                          navigator.clipboard.writeText(text);
                          setPointCopySuccess(true);
                          setTimeout(() => setPointCopySuccess(false), 2000);
                        }}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-medium flex items-center gap-1 shrink-0 transition-colors cursor-pointer border border-slate-700"
                        title="คัดลอกพิกัด UTM"
                      >
                        {pointCopySuccess ? <CheckCheck className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        <span>{pointCopySuccess ? "คัดลอกแล้ว" : "คัดลอก"}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Tab Content: UTM */
                  <div className="space-y-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          โซนพิกัด (UTM Zone)
                        </label>
                        <select
                          value={pointCoordUtmZone}
                          onChange={(e) =>
                            handlePointUtmInputChange(
                              Number(e.target.value),
                              pointCoordUtmHemi,
                              pointCoordUtmEasting,
                              pointCoordUtmNorthing
                            )
                          }
                          className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
                        >
                          <option value={47}>Zone 47 (เหนือ / กลาง / ตก / ใต้)</option>
                          <option value={48}>Zone 48 (อีสาน / ตะวันออก)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          ซีกโลก (Hemisphere)
                        </label>
                        <select
                          value={pointCoordUtmHemi}
                          onChange={(e) =>
                            handlePointUtmInputChange(
                              pointCoordUtmZone,
                              e.target.value as "N" | "S",
                              pointCoordUtmEasting,
                              pointCoordUtmNorthing
                            )
                          }
                          className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
                        >
                          <option value="N">N (Northern - ซีกโลกเหนือ)</option>
                          <option value="S">S (Southern - ซีกโลกใต้)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          Easting (พิกัดแกนราบ X เมตร) <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={pointCoordUtmEasting}
                          onChange={(e) =>
                            handlePointUtmInputChange(
                              pointCoordUtmZone,
                              pointCoordUtmHemi,
                              e.target.value,
                              pointCoordUtmNorthing
                            )
                          }
                          placeholder="เช่น 662514"
                          className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          Northing (พิกัดแกนดิ่ง Y เมตร) <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={pointCoordUtmNorthing}
                          onChange={(e) =>
                            handlePointUtmInputChange(
                              pointCoordUtmZone,
                              pointCoordUtmHemi,
                              pointCoordUtmEasting,
                              e.target.value
                            )
                          }
                          placeholder="เช่น 1521408"
                          className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Live Calculated Lat/Lng Preview */}
                    <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 block">แปลงเป็น ละติจูด / ลองจิจูด อัตโนมัติ:</span>
                        <span className="text-xs font-mono font-bold text-emerald-300 truncate block">
                          Lat: {pointCoordLat || "-"} , Lng: {pointCoordLng || "-"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const text = `${pointCoordLat}, ${pointCoordLng}`;
                          navigator.clipboard.writeText(text);
                          setPointCopySuccess(true);
                          setTimeout(() => setPointCopySuccess(false), 2000);
                        }}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-medium flex items-center gap-1 shrink-0 transition-colors cursor-pointer border border-slate-700"
                        title="คัดลอก Lat, Lng"
                      >
                        {pointCopySuccess ? <CheckCheck className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        <span>{pointCopySuccess ? "คัดลอกแล้ว" : "คัดลอก"}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Point Label & Visual Customization */}
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      ชื่อหรือป้ายกำกับจุด (Point Label)
                    </label>
                    <input
                      type="text"
                      value={pointCoordLabel}
                      onChange={(e) => setPointCoordLabel(e.target.value)}
                      placeholder="เช่น จุดตำแหน่ง P1, จุด กม. 0+000, อาคารควบคุม"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Color Presets */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">
                        สีสัญลักษณ์จุด:
                      </label>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {MAP_PRESET_COLORS.map((c) => (
                          <button
                            key={c.hex}
                            type="button"
                            onClick={() => setPointCoordColor(c.hex)}
                            className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center ${
                              pointCoordColor.toLowerCase() === c.hex.toLowerCase()
                                ? "border-white ring-2 ring-amber-400 scale-110"
                                : "border-slate-800 hover:scale-105"
                            }`}
                            style={{ backgroundColor: c.hex }}
                            title={c.name}
                          />
                        ))}
                        <input
                          type="color"
                          value={pointCoordColor}
                          onChange={(e) => setPointCoordColor(e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                          title="เลือกสีอิสระ"
                        />
                      </div>
                    </div>

                    {/* Point Marker Radius Size Slider */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-slate-300 font-bold mb-1">
                        <span>ขนาดรัศมีจุด (Radius):</span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block rounded-full border border-white"
                            style={{
                              backgroundColor: pointCoordColor,
                              width: `${Math.max(6, pointCoordSize * 1.5)}px`,
                              height: `${Math.max(6, pointCoordSize * 1.5)}px`,
                            }}
                          />
                          <span className="font-mono text-amber-300">{pointCoordSize} px</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="4"
                        max="16"
                        step="1"
                        value={pointCoordSize}
                        onChange={(e) => setPointCoordSize(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Error Banner */}
                {pointCoordError && (
                  <div className="p-3 bg-rose-950/80 border border-rose-600/80 text-rose-200 text-xs rounded-xl flex items-center gap-2 animate-fadeIn">
                    <Info className="h-4 w-4 text-rose-400 shrink-0" />
                    <span>{pointCoordError}</span>
                  </div>
                )}
              </div>

              {/* Modal Footer Buttons */}
              <div className="bg-slate-950 border-t border-slate-800 p-3 sm:px-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPointCoordModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer border border-slate-700"
                >
                  ยกเลิก
                </button>

                <button
                  type="button"
                  onClick={handleSavePointFromModal}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20 active:scale-95"
                >
                  <MapPin className="h-4 w-4 text-slate-950" />
                  <span>{editingPointObjId ? "💾 บันทึกการแก้ไขพิกัด" : "➕ บันทึกและปักจุดบนแผนที่"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

// Leaflet Interactive Map View Component with Full Drawing Support
interface LeafletMapViewProps {
  lat: number;
  lng: number;
  mapType: "k" | "esri" | "h" | "m" | "terrain";
  zoom: number;
  onZoomChange?: (zoom: number) => void;
  isEditing: boolean;
  onLatLngChange: (lat: number, lng: number) => void;
  locationName: string;
  utmFormatted: string;
  isFullScreen: boolean;
  centerTrigger?: number;
  pinStyle?: string;
  mapObjects?: MapObject[];
  drawingMode?: "point" | "line" | "polygon" | null;
  tempCoords?: MapPointCoordinate[];
  onMapClickForDrawing?: (lat: number, lng: number) => void;
  selectedObjectId?: string | null;
  onSelectObject?: (id: string | null) => void;
  focusTarget?: { id: string; timestamp: number } | null;
  canDraw?: boolean;
  activeColor?: string;
  activeSize?: number;
}

function LeafletMapView({
  lat,
  lng,
  mapType,
  zoom,
  onZoomChange,
  isEditing,
  onLatLngChange,
  isFullScreen,
  centerTrigger,
  pinStyle = "red-classic",
  mapObjects = [],
  drawingMode = null,
  tempCoords = [],
  onMapClickForDrawing,
  selectedObjectId = null,
  onSelectObject,
  focusTarget,
  canDraw = true,
  activeColor = "#ef4444",
  activeSize = 4,
}: LeafletMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const overlayTileLayerRef = useRef<L.TileLayer | null>(null);
  const drawingLayerRef = useRef<L.LayerGroup | null>(null);
  const currentTileTypeRef = useRef<string>(mapType);

  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;

  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;

  const drawingModeRef = useRef(drawingMode);
  drawingModeRef.current = drawingMode;

  const onMapClickForDrawingRef = useRef(onMapClickForDrawing);
  onMapClickForDrawingRef.current = onMapClickForDrawing;

  const onLatLngChangeRef = useRef(onLatLngChange);
  onLatLngChangeRef.current = onLatLngChange;

  // High-resolution tile sources with proper maxNativeZoom bounds to prevent "Map data not yet available"
  const getTileConfig = (type: "k" | "esri" | "h" | "m" | "terrain") => {
    if (type === "k") {
      return {
        url: "https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
        maxZoom: 22,
        maxNativeZoom: 18,
        attribution: "&copy; Google Maps Satellite HD",
      };
    }
    if (type === "esri") {
      return {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        subdomains: [] as string[],
        maxZoom: 22,
        maxNativeZoom: 17,
        attribution: "&copy; Esri World Imagery, Maxar",
      };
    }
    if (type === "h") {
      return {
        url: "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
        maxZoom: 22,
        maxNativeZoom: 18,
        attribution: "&copy; Google Maps Hybrid HD",
      };
    }
    if (type === "terrain") {
      return {
        url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        subdomains: ["a", "b", "c"],
        maxZoom: 19,
        maxNativeZoom: 17,
        attribution: "&copy; OpenStreetMap contributors, &copy; OpenTopoMap (CC-BY-SA)",
      };
    }
    return {
      url: "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: "&copy; Google Maps Roadmap",
    };
  };

  // Main Pin Icon Generator
  const createPinIcon = (editing: boolean, styleId?: string) => {
    return L.divIcon({
      className: "custom-leaflet-pin-icon",
      html: generatePinIconSvg(styleId || "red-classic", editing),
      iconSize: [38, 46],
      iconAnchor: [19, 46],
    });
  };

  // Initialize Leaflet Map Instance
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (leafletMapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [lat, lng],
      zoom: zoom,
      zoomControl: false,
      scrollWheelZoom: true,
      dragging: true,
      touchZoom: true,
      doubleClickZoom: true,
      zoomSnap: 0.25,
      zoomDelta: 0.25,
      wheelPxPerZoomLevel: 60,
    });

    const initialTileConfig = getTileConfig(mapType);
    const tileLayer = L.tileLayer(initialTileConfig.url, {
      subdomains: initialTileConfig.subdomains.length > 0 ? initialTileConfig.subdomains : "abc",
      maxZoom: initialTileConfig.maxZoom,
      maxNativeZoom: initialTileConfig.maxNativeZoom,
      tileSize: 256,
      keepBuffer: 6,
      updateWhenIdle: false,
      updateWhenZooming: true,
      attribution: initialTileConfig.attribution,
    }).addTo(map);

    tileLayer.on("tileerror", (e: L.TileErrorEvent) => {
      if (e.tile && !e.tile.dataset.fallbackAttempted) {
        e.tile.dataset.fallbackAttempted = "true";
        const coords = e.coords;
        if (coords) {
          const { x, y, z } = coords;
          if (mapType === "k" || mapType === "h") {
            e.tile.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
          } else if (mapType === "terrain") {
            const sub = ["a", "b", "c"][Math.abs(x + y) % 3];
            e.tile.src = `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
          } else if (mapType === "esri") {
            const sub = ["mt0", "mt1", "mt2", "mt3"][Math.abs(x + y) % 4];
            e.tile.src = `https://${sub}.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`;
          } else {
            const sub = ["a", "b", "c"][Math.abs(x + y) % 3];
            e.tile.src = `https://${sub}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
          }
        }
      }
    });

    const marker = L.marker([lat, lng], {
      icon: createPinIcon(isEditing, pinStyle),
      draggable: isEditing,
    }).addTo(map);

    marker.on("dragend", () => {
      const position = marker.getLatLng();
      if (onLatLngChangeRef.current) {
        onLatLngChangeRef.current(Number(position.lat.toFixed(6)), Number(position.lng.toFixed(6)));
      }
    });

    // Map Click Handler
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (drawingModeRef.current && onMapClickForDrawingRef.current) {
        onMapClickForDrawingRef.current(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      } else if (isEditingRef.current && onLatLngChangeRef.current) {
        onLatLngChangeRef.current(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      }
    });

    // Map Zoom Handler
    map.on("zoomend", () => {
      if (onZoomChangeRef.current) {
        onZoomChangeRef.current(parseFloat(map.getZoom().toFixed(2)));
      }
    });

    // Drawing Objects Layer Group
    const drawingLayerGroup = L.layerGroup().addTo(map);

    tileLayerRef.current = tileLayer;
    currentTileTypeRef.current = mapType;
    markerRef.current = marker;
    drawingLayerRef.current = drawingLayerGroup;
    leafletMapRef.current = map;

    // Force tile recalculation after layout settles
    const invalidate = () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      }
    };
    requestAnimationFrame(invalidate);
    const t1 = setTimeout(invalidate, 100);
    const t2 = setTimeout(invalidate, 300);

    // Direct Scroll Wheel Zoom Handler (Direct zoom without requiring Ctrl)
    const handleWheel = (e: WheelEvent) => {
      if (!leafletMapRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.deltaY < 0) {
        leafletMapRef.current.zoomIn(0.25);
      } else if (e.deltaY > 0) {
        leafletMapRef.current.zoomOut(0.25);
      }
    };

    const containerEl = mapContainerRef.current;
    if (containerEl) {
      containerEl.addEventListener("wheel", handleWheel, { passive: false });
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (containerEl) {
        containerEl.removeEventListener("wheel", handleWheel);
      }
      if (overlayTileLayerRef.current) {
        overlayTileLayerRef.current.remove();
        overlayTileLayerRef.current = null;
      }
      map.remove();
      leafletMapRef.current = null;
    };
  }, []);

  // Container Resize Observer
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      }
    });

    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Update Main Location Marker
  useEffect(() => {
    if (!markerRef.current || !leafletMapRef.current) return;
    markerRef.current.setLatLng([lat, lng]);
    markerRef.current.setIcon(createPinIcon(isEditing, pinStyle));

    if (markerRef.current.dragging) {
      if (isEditing) {
        markerRef.current.dragging.enable();
      } else {
        markerRef.current.dragging.disable();
      }
    }
  }, [lat, lng, isEditing, pinStyle]);

  // Sync Zoom level to Leaflet Map instance
  useEffect(() => {
    const map = leafletMapRef.current;
    if (map && Math.abs(map.getZoom() - zoom) > 0.05) {
      map.setZoom(zoom);
    }
  }, [zoom]);

  // Handle FlyTo trigger
  useEffect(() => {
    if (centerTrigger && centerTrigger > 0 && leafletMapRef.current) {
      leafletMapRef.current.flyTo([lat, lng], Math.max(zoom, 16), { duration: 0.8 });
    }
  }, [centerTrigger]);

  // Handle Map Type updates
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !tileLayerRef.current) return;

    if (currentTileTypeRef.current !== mapType) {
      const config = getTileConfig(mapType);
      tileLayerRef.current.options.subdomains = config.subdomains.length > 0 ? config.subdomains : "abc";
      tileLayerRef.current.options.maxZoom = config.maxZoom;
      tileLayerRef.current.options.maxNativeZoom = config.maxNativeZoom;
      tileLayerRef.current.options.attribution = config.attribution;
      tileLayerRef.current.setUrl(config.url);
      currentTileTypeRef.current = mapType;
    }
  }, [mapType]);

  // Render Map Objects & Active Drawing on Leaflet Canvas
  useEffect(() => {
    if (!leafletMapRef.current || !drawingLayerRef.current) return;

    const layerGroup = drawingLayerRef.current;
    layerGroup.clearLayers();

    // 1. Render All Existing Saved Map Objects
    mapObjects.forEach((obj) => {
      const isSelected = selectedObjectId === obj.id;
      const objColor = obj.color || (obj.type === "point" ? "#ef4444" : obj.type === "line" ? "#3b82f6" : "#10b981");
      const objSize = obj.size || (obj.type === "point" ? 7 : obj.type === "line" ? 4 : 3);

      if (obj.type === "point") {
        const coord = obj.coordinates as MapPointCoordinate;
        const circleMarker = L.circleMarker([coord.lat, coord.lng], {
          radius: isSelected ? objSize + 3 : objSize,
          fillColor: isSelected ? "#f59e0b" : objColor,
          color: "#ffffff",
          weight: 2.5,
          fillOpacity: 0.9,
        });

        circleMarker.bindTooltip(`${obj.label || obj.id}`, {
          permanent: isSelected,
          direction: "top",
          className: "leaflet-custom-tooltip font-bold text-xs",
        });

        circleMarker.on("click", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          if (onSelectObject) onSelectObject(obj.id);
        });

        circleMarker.addTo(layerGroup);
      } else if (obj.type === "line") {
        const coords = obj.coordinates as MapPointCoordinate[];
        if (coords.length >= 2) {
          const latLngs = coords.map((c) => [c.lat, c.lng] as [number, number]);
          const lineDist = calculateLineDistance(coords);

          const polyline = L.polyline(latLngs, {
            color: isSelected ? "#f59e0b" : objColor,
            weight: isSelected ? objSize + 2 : objSize,
            opacity: 0.9,
            dashArray: isSelected ? "8, 8" : undefined,
          });

          polyline.bindTooltip(`${obj.label || obj.id} (${formatDistance(lineDist)})`, {
            permanent: isSelected,
            direction: "center",
            className: "leaflet-custom-tooltip font-bold text-xs",
          });

          polyline.on("click", (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            if (onSelectObject) onSelectObject(obj.id);
          });

          polyline.addTo(layerGroup);
        }
      } else if (obj.type === "polygon") {
        const coords = obj.coordinates as MapPointCoordinate[];
        if (coords.length >= 3) {
          const latLngs = coords.map((c) => [c.lat, c.lng] as [number, number]);
          const areaSqM = calculatePolygonArea(coords);

          const polygon = L.polygon(latLngs, {
            color: isSelected ? "#f59e0b" : objColor,
            weight: isSelected ? objSize + 1.5 : objSize,
            fillColor: isSelected ? "#fcd34d" : objColor,
            fillOpacity: 0.35,
          });

          polygon.bindTooltip(`${obj.label || obj.id} (${formatArea(areaSqM)})`, {
            permanent: isSelected,
            direction: "center",
            className: "leaflet-custom-tooltip font-bold text-xs",
          });

          polygon.on("click", (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            if (onSelectObject) onSelectObject(obj.id);
          });

          polygon.addTo(layerGroup);
        }
      }
    });

    // 2. Render Active Drawing Temporary Preview
    if (tempCoords.length > 0) {
      // Vertex Handle Circles
      tempCoords.forEach((c, idx) => {
        const handle = L.circleMarker([c.lat, c.lng], {
          radius: idx === tempCoords.length - 1 ? activeSize + 3 : activeSize + 1,
          fillColor: idx === tempCoords.length - 1 ? "#f59e0b" : "#ffffff",
          color: activeColor,
          weight: 2,
          fillOpacity: 1,
        });
        handle.addTo(layerGroup);
      });

      if (drawingMode === "line" && tempCoords.length >= 2) {
        const tempLine = L.polyline(
          tempCoords.map((c) => [c.lat, c.lng] as [number, number]),
          { color: activeColor, weight: activeSize, dashArray: "6, 6", opacity: 0.85 }
        );
        tempLine.addTo(layerGroup);
      } else if (drawingMode === "polygon" && tempCoords.length >= 2) {
        const latLngs = tempCoords.map((c) => [c.lat, c.lng] as [number, number]);
        if (tempCoords.length >= 3) {
          const tempPoly = L.polygon(latLngs, {
            color: activeColor,
            weight: activeSize,
            dashArray: "6, 6",
            fillColor: activeColor,
            fillOpacity: 0.3,
          });
          tempPoly.addTo(layerGroup);
        } else {
          const tempLine = L.polyline(latLngs, {
            color: activeColor,
            weight: activeSize,
            dashArray: "6, 6",
            opacity: 0.85,
          });
          tempLine.addTo(layerGroup);
        }
      }
    }
  }, [mapObjects, tempCoords, drawingMode, selectedObjectId, activeColor, activeSize]);

  // Handle Focus Target Zoom
  useEffect(() => {
    if (!focusTarget || !leafletMapRef.current) return;
    const targetObj = mapObjects.find((o) => o.id === focusTarget.id);
    if (!targetObj) return;

    const map = leafletMapRef.current;

    if (targetObj.type === "point") {
      const coord = targetObj.coordinates as MapPointCoordinate;
      map.flyTo([coord.lat, coord.lng], 18, { duration: 0.8 });
    } else {
      const coords = targetObj.coordinates as MapPointCoordinate[];
      if (coords.length > 0) {
        const bounds = L.latLngBounds(coords.map((c) => [c.lat, c.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18, animate: true });
      }
    }
  }, [focusTarget]);

  // Floating On-Map Zoom Control Handlers
  const handleMapZoomIn = () => {
    if (leafletMapRef.current) {
      leafletMapRef.current.zoomIn(0.25);
    }
  };

  const handleMapZoomOut = () => {
    if (leafletMapRef.current) {
      leafletMapRef.current.zoomOut(0.25);
    }
  };

  const handleMapResetZoom = () => {
    if (leafletMapRef.current) {
      leafletMapRef.current.flyTo([lat, lng], 16, { duration: 0.6 });
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={mapContainerRef} className="w-full h-full min-h-[380px] z-0" />

      {/* Floating On-Canvas Quick Zoom Widget */}
      <div className="absolute bottom-4 right-4 z-[400] flex flex-col gap-1.5 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-700/80 shadow-2xl">
        <button
          type="button"
          onClick={handleMapZoomIn}
          className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white rounded-xl border border-slate-600/60 transition-all cursor-pointer shadow-md hover:scale-105"
          title="ซูมเข้า (+)"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleMapZoomOut}
          className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white rounded-xl border border-slate-600/60 transition-all cursor-pointer shadow-md hover:scale-105"
          title="ซูมออก (-)"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleMapResetZoom}
          className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-emerald-900 active:bg-emerald-800 text-emerald-400 hover:text-emerald-300 rounded-xl border border-slate-600/60 transition-all cursor-pointer shadow-md hover:scale-105 mt-0.5"
          title="ซูมกลับไปที่หมุดโครงการ"
        >
          <Target className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
