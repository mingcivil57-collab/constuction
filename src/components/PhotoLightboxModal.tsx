import React, { useState, useEffect, useCallback, useRef } from "react";
import { ProjectPhoto } from "../types";
import { formatDateDisplay } from "../lib/dateUtils";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
  Maximize2,
  Minimize2,
  Calendar,
  Camera,
  Layers,
  Plus,
  Minus,
  Move,
  Pencil,
  Eraser,
  Trash2,
  Undo2,
  Check,
  Eye,
  EyeOff,
} from "lucide-react";

interface PhotoLightboxModalProps {
  photos: ProjectPhoto[];
  currentIndex: number;
  projectName: string;
  onClose: () => void;
  onSelectIndex: (index: number) => void;
}

interface DrawPoint {
  x: number; // Normalized 0..1
  y: number; // Normalized 0..1
}

interface DrawStroke {
  points: DrawPoint[];
  color: string;
  size: number;
  isEraser?: boolean;
}

const PEN_COLORS = [
  { label: "แดง", value: "#ef4444" },
  { label: "ส้ม", value: "#f97316" },
  { label: "เหลือง", value: "#eab308" },
  { label: "เขียว", value: "#22c55e" },
  { label: "ฟ้า", value: "#06b6d4" },
  { label: "ม่วง", value: "#a855f7" },
  { label: "ขาว", value: "#ffffff" },
  { label: "ดำ", value: "#000000" },
];

const PEN_SIZES = [
  { label: "บาง", size: 3, px: "3px" },
  { label: "ปกติ", size: 6, px: "6px" },
  { label: "หนา", size: 12, px: "12px" },
  { label: "เน้น", size: 22, px: "22px" },
];

export default function PhotoLightboxModal({
  photos,
  currentIndex,
  projectName,
  onClose,
  onSelectIndex,
}: PhotoLightboxModalProps) {
  const [index, setIndex] = useState(currentIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [showCaption, setShowCaption] = useState(true);

  // Pen and Drawing Tools state (Ephemeral in-memory presentation session, not saved to Sheets)
  const [isPenMode, setIsPenMode] = useState(false);
  const [penColor, setPenColor] = useState("#ef4444");
  const [penSize, setPenSize] = useState(6);
  const [isEraser, setIsEraser] = useState(false);
  const [photoStrokes, setPhotoStrokes] = useState<Record<number, DrawStroke[]>>({});

  const modalRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<DrawStroke | null>(null);

  // Keep index in sync with props
  useEffect(() => {
    setIndex(currentIndex);
  }, [currentIndex]);

  const currentPhoto = photos[index] || photos[0];
  const totalPhotos = photos.length;
  const currentPhotoStrokes = photoStrokes[index] || [];

  // Handlers for navigation
  const goPrev = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    setIndex((prev) => (prev - 1 + totalPhotos) % totalPhotos);
  }, [totalPhotos]);

  const goNext = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    setIndex((prev) => (prev + 1) % totalPhotos);
  }, [totalPhotos]);

  // Sync back selected index
  useEffect(() => {
    onSelectIndex(index);
    // Scroll active thumbnail into view
    if (thumbnailRefs.current[index]) {
      thumbnailRefs.current[index]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [index, onSelectIndex]);

  // Slideshow timer
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      goNext();
    }, 3500);
    return () => clearInterval(interval);
  }, [isPlaying, goNext]);

  // Zoom handlers (Step by 20%: 100%, 120%, 140%, 160%, 180%, 200%... up to 400%)
  const handleZoomIn = useCallback(() => {
    setZoomLevel((z) => {
      const currentPercent = Math.round(z * 100);
      const nextPercent = Math.min(currentPercent + 20, 400);
      return nextPercent / 100;
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((z) => {
      const currentPercent = Math.round(z * 100);
      const nextPercent = Math.max(currentPercent - 20, 100);
      const next = nextPercent / 100;
      if (next === 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        goPrev();
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        goNext();
      } else if (e.key === "Escape") {
        if (isPenMode) {
          setIsPenMode(false);
        } else {
          onClose();
        }
      } else if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.key === "+" || e.key === "=") {
        handleZoomIn();
      } else if (e.key === "-" || e.key === "_") {
        handleZoomOut();
      } else if (e.key === "0") {
        handleResetZoom();
      } else if (e.key === "p" || e.key === "P") {
        setIsPenMode((prev) => {
          if (!prev) setIsPlaying(false);
          return !prev;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goPrev, goNext, onClose, isPenMode, handleZoomIn, handleZoomOut, handleResetZoom]);

  // Toggle full screen mode on the container
  const toggleFullscreen = () => {
    if (!modalRef.current) return;
    if (!document.fullscreenElement) {
      modalRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (isPenMode) return; // Prevent accidental wheel zoom while drawing
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  // Pan dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isPenMode || zoomLevel <= 1) return;
    if ((e.target as HTMLElement).closest("button, a, input")) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isPenMode || zoomLevel <= 1) return;
    if ((e.target as HTMLElement).closest("button, a, input")) return;
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDragging(true);
      dragStartRef.current = { x: touch.clientX - panOffset.x, y: touch.clientY - panOffset.y };
    }
  };

  // Global window listeners for drag panning
  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      setPanOffset({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    };

    const onMouseUp = () => {
      setIsDragging(false);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        setPanOffset({
          x: touch.clientX - dragStartRef.current.x,
          y: touch.clientY - dragStartRef.current.y,
        });
      }
    };

    const onTouchEnd = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: false });
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging]);

  // -------------------------------------------------------------
  // Canvas Annotation Engine
  // -------------------------------------------------------------

  const renderStroke = (
    ctx: CanvasRenderingContext2D,
    stroke: DrawStroke,
    w: number,
    h: number
  ) => {
    if (stroke.points.length === 0) return;

    ctx.save();
    if (stroke.isEraser) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.lineWidth = Math.max(8, stroke.size * 2.5 * (w / 1000));
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = Math.max(2, stroke.size * (w / 1000));
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (stroke.points.length === 1) {
      ctx.beginPath();
      const px = stroke.points[0].x * w;
      const py = stroke.points[0].y * h;
      const radius = (stroke.isEraser ? Math.max(8, stroke.size * 2.5 * (w / 1000)) : Math.max(2, stroke.size * (w / 1000))) / 2;
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * w, stroke.points[0].y * h);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * w, stroke.points[i].y * h);
      }
      ctx.stroke();
    }
    ctx.restore();
  };

  const redrawCanvas = useCallback((strokesToDraw: DrawStroke[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokesToDraw) {
      renderStroke(ctx, s, canvas.width, canvas.height);
    }
  }, []);

  const syncCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const width = img.naturalWidth || (img.clientWidth ? img.clientWidth * 2 : 1600);
    const height = img.naturalHeight || (img.clientHeight ? img.clientHeight * 2 : 1200);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const strokes = photoStrokes[index] || [];
    redrawCanvas(strokes);
  }, [index, photoStrokes, redrawCanvas]);

  // Sync canvas size when photo changes or when image finishes loading
  useEffect(() => {
    syncCanvasDimensions();
  }, [index, syncCanvasDimensions]);

  const getCanvasPoint = (clientX: number, clientY: number): DrawPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { x, y };
  };

  const startDrawing = (clientX: number, clientY: number) => {
    if (!isPenMode) return;
    const pt = getCanvasPoint(clientX, clientY);
    if (!pt) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    isDrawingRef.current = true;
    const newStroke: DrawStroke = {
      points: [pt],
      color: penColor,
      size: penSize,
      isEraser,
    };
    currentStrokeRef.current = newStroke;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    if (isEraser) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,1)";
      const radius = Math.max(8, penSize * 2.5 * (canvas.width / 1000)) / 2;
      ctx.beginPath();
      ctx.arc(pt.x * canvas.width, pt.y * canvas.height, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = penColor;
      const radius = Math.max(2, penSize * (canvas.width / 1000)) / 2;
      ctx.beginPath();
      ctx.arc(pt.x * canvas.width, pt.y * canvas.height, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  const drawMove = (clientX: number, clientY: number) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    const pt = getCanvasPoint(clientX, clientY);
    if (!pt) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const stroke = currentStrokeRef.current;
    const prevPt = stroke.points[stroke.points.length - 1];
    stroke.points.push(pt);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    if (stroke.isEraser) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.lineWidth = Math.max(8, stroke.size * 2.5 * (canvas.width / 1000));
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = Math.max(2, stroke.size * (canvas.width / 1000));
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(prevPt.x * canvas.width, prevPt.y * canvas.height);
    ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
    ctx.stroke();
    ctx.restore();
  };

  const stopDrawing = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (currentStrokeRef.current && currentStrokeRef.current.points.length > 0) {
      const finishedStroke = currentStrokeRef.current;
      setPhotoStrokes((prev) => ({
        ...prev,
        [index]: [...(prev[index] || []), finishedStroke],
      }));
    }
    currentStrokeRef.current = null;
  };

  // Global mouse/touch move and up listeners for drawing
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDrawingRef.current) {
        e.preventDefault();
        drawMove(e.clientX, e.clientY);
      }
    };

    const onMouseUp = () => {
      if (isDrawingRef.current) {
        stopDrawing();
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isDrawingRef.current && e.touches.length === 1) {
        e.preventDefault();
        drawMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const onTouchEnd = () => {
      if (isDrawingRef.current) {
        stopDrawing();
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [index, penColor, penSize, isEraser]);

  // Clear all drawings for current photo
  const handleClearDrawing = () => {
    setPhotoStrokes((prev) => ({
      ...prev,
      [index]: [],
    }));
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Undo last stroke
  const handleUndoDrawing = () => {
    setPhotoStrokes((prev) => {
      const current = prev[index] || [];
      if (current.length === 0) return prev;
      const updated = current.slice(0, -1);
      redrawCanvas(updated);
      return {
        ...prev,
        [index]: updated,
      };
    });
  };

  if (!currentPhoto) return null;

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-[9999] bg-slate-950/98 backdrop-blur-lg text-white flex flex-col justify-between select-none overflow-hidden isolate animate-fadeIn"
    >
      {/* Top Bar Navigation */}
      <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-3 z-30 shrink-0 shadow-lg">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-indigo-600/30 text-indigo-400 rounded-xl border border-indigo-500/30 shrink-0">
            <Camera className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-white truncate max-w-[200px] sm:max-w-xs">
                {projectName}
              </h4>
              <span className="text-[11px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full shrink-0">
                {index + 1} / {totalPhotos}
              </span>
              {currentPhoto.remarks && (
                <span className="text-xs text-amber-300 font-medium truncate max-w-[150px] sm:max-w-xs hidden md:inline bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                  {currentPhoto.remarks}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              โหมดนำเสนอรูปภาพผลงานสนาม (Presentation Mode)
            </p>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Pen / Drawing Tool Button */}
          <button
            type="button"
            onClick={() => {
              if (!isPenMode) {
                setIsPlaying(false); // Stop slideshow when drawing
              }
              setIsPenMode(!isPenMode);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              isPenMode
                ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-300"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            }`}
            title={isPenMode ? "ปิดโหมดปากกา (กด P หรือ ESC)" : "เปิดโหมดปากกาเพื่อวาดอธิบายบนภาพ (กด P)"}
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">ปากกาอธิบาย</span>
            {currentPhotoStrokes.length > 0 && !isPenMode && (
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="มีรอยวาดในรูปนี้" />
            )}
          </button>

          {/* Auto Play / Slideshow Toggle */}
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              isPlaying
                ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 animate-pulse"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            }`}
            title={isPlaying ? "หยุดการแสดงสไลด์" : "เริ่มเล่นสไลด์ภาพอัตโนมัติ (ทุก 3.5 วินาที)"}
          >
            {isPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5" />
                <span className="hidden md:inline">กำลังเล่นสไลด์...</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span className="hidden md:inline">เล่นสไลด์</span>
              </>
            )}
          </button>

          {/* Top Bar Zoom Controls */}
          <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 1}
              className="p-1.5 text-slate-300 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
              title="ย่อรูป (-20%)"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="text-[11px] font-mono font-bold px-1.5 text-indigo-300 min-w-[42px] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 4}
              className="p-1.5 text-slate-300 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
              title="ขยายรูป (+20%)"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            {zoomLevel > 1 && (
              <button
                type="button"
                onClick={handleResetZoom}
                className="p-1.5 text-amber-400 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                title="รีเซ็ตขนาด 100% (กด 0)"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Toggle Fullscreen */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-colors cursor-pointer hidden sm:flex"
            title={isFullscreen ? "ออกจากโหมดเต็มหน้าจอ" : "แสดงเต็มหน้าจอ (Fullscreen)"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          {/* Open Original */}
          <a
            href={currentPhoto.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-colors cursor-pointer hidden sm:flex"
            title="เปิดรูปต้นฉบับในแท็บใหม่"
          >
            <ExternalLink className="h-4 w-4" />
          </a>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white bg-rose-500/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-xl border border-rose-500/30 transition-all cursor-pointer ml-1"
            title="ปิดป๊อปอัพ (ESC)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Pen Drawing Sub-Bar (Integrated into layout flow so it NEVER covers or obscures the photo) */}
      {isPenMode && (
        <div className="bg-slate-900/98 border-b border-indigo-500/30 px-3 sm:px-6 py-2 shrink-0 z-30 shadow-xl flex flex-wrap items-center justify-between gap-2 sm:gap-3 animate-fadeIn">
          {/* Left: Mode Selection */}
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1.5 text-xs font-bold text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-1 rounded-xl">
              <Pencil className="h-3.5 w-3.5" />
              <span>โหมดวาดเขียน</span>
            </div>

            <div className="flex items-center bg-slate-800/90 p-0.5 sm:p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setIsEraser(false)}
                className={`px-2.5 py-1 sm:py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  !isEraser
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
                title="โหมดปากกาวาด"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>ปากกา</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEraser(true)}
                className={`px-2.5 py-1 sm:py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isEraser
                    ? "bg-rose-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
                title="โหมดลบเส้นวาดเฉพาะจุด"
              >
                <Eraser className="h-3.5 w-3.5" />
                <span>ยางลบ</span>
              </button>
            </div>
          </div>

          {/* Center: Color palette & Stroke Sizes */}
          <div className="flex items-center flex-wrap gap-2 sm:gap-3">
            {/* Color Palette (Active when in Pen mode) */}
            {!isEraser && (
              <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-800/80 px-2 py-1 rounded-xl border border-slate-700">
                <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">สี:</span>
                <div className="flex items-center gap-1 sm:gap-1.5">
                  {PEN_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setPenColor(c.value)}
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full transition-transform cursor-pointer relative flex items-center justify-center ${
                        penColor === c.value
                          ? "scale-110 sm:scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900 shadow-md"
                          : "hover:scale-110 opacity-80 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={`สี${c.label}`}
                    >
                      {penColor === c.value && (
                        <Check
                          className={`h-2.5 w-2.5 sm:h-3 sm:w-3 ${
                            c.value === "#ffffff" || c.value === "#eab308"
                              ? "text-slate-950"
                              : "text-white"
                          }`}
                        />
                      )}
                    </button>
                  ))}

                  {/* Custom Color Input */}
                  <label
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-dashed border-slate-400 hover:border-white flex items-center justify-center cursor-pointer transition-colors relative overflow-hidden bg-gradient-to-tr from-indigo-500 via-amber-400 to-rose-500 shrink-0"
                    title="เลือกสีอื่นตามใจชอบ"
                  >
                    <input
                      type="color"
                      value={penColor}
                      onChange={(e) => setPenColor(e.target.value)}
                      className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Pen Stroke Sizes */}
            <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-xl border border-slate-700">
              <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">ขนาด:</span>
              {PEN_SIZES.map((s) => (
                <button
                  key={s.size}
                  type="button"
                  onClick={() => setPenSize(s.size)}
                  className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    penSize === s.size
                      ? "bg-slate-700 text-white ring-1 ring-slate-400 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title={`หัวปากกาขนาด ${s.label} (${s.px})`}
                >
                  <span
                    className="rounded-full inline-block"
                    style={{
                      width: Math.min(s.size, 8),
                      height: Math.min(s.size, 8),
                      backgroundColor: isEraser ? "#f43f5e" : penColor,
                    }}
                  />
                  <span className="text-[11px]">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Actions (Undo, Clear, Done) */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={handleUndoDrawing}
              disabled={currentPhotoStrokes.length === 0}
              className="p-1.5 text-slate-300 hover:text-white disabled:opacity-25 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-slate-700"
              title="ย้อนกลับ 1 ขั้นตอน (Undo)"
            >
              <Undo2 className="h-4 w-4" />
            </button>

            {/* Clear Button */}
            <button
              type="button"
              onClick={handleClearDrawing}
              disabled={currentPhotoStrokes.length === 0}
              className="px-2.5 py-1 sm:py-1.5 text-xs font-bold text-rose-300 hover:text-white bg-rose-500/10 hover:bg-rose-600 disabled:opacity-25 rounded-xl border border-rose-500/30 transition-all flex items-center gap-1 cursor-pointer shadow-sm"
              title="ล้างเส้นวาดทั้งหมดในภาพนี้ (Clear)"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>เคลียร์</span>
            </button>

            {/* Done / Close Pen Mode Button */}
            <button
              type="button"
              onClick={() => setIsPenMode(false)}
              className="px-3 py-1 sm:py-1.5 text-xs font-bold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-600/80 transition-colors ml-1 cursor-pointer"
              title="เสร็จสิ้นและปิดแถบเครื่องมือวาด"
            >
              เสร็จสิ้น
            </button>
          </div>
        </div>
      )}

      {/* Main Image Stage */}
      <div
        className={`relative flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden bg-slate-950 ${
          isPenMode
            ? "cursor-crosshair"
            : zoomLevel > 1
            ? isDragging
              ? "cursor-grabbing"
              : "cursor-grab"
            : "cursor-default"
        }`}
        onWheel={handleWheel}
        onMouseDown={!isPenMode ? handleMouseDown : undefined}
        onTouchStart={!isPenMode ? handleTouchStart : undefined}
      >
        {/* Left Chevron Button */}
        <button
          type="button"
          onClick={goPrev}
          className="absolute left-3 sm:left-6 z-20 p-3 sm:p-4 rounded-full bg-slate-900/85 hover:bg-indigo-600 text-white border border-slate-700/80 hover:border-indigo-500 shadow-2xl backdrop-blur-md transition-all cursor-pointer group hover:scale-110 active:scale-95"
          title="รูปก่อนหน้า (ปุ่มลูกศรซ้าย ←)"
        >
          <ChevronLeft className="h-6 w-6 sm:h-8 sm:w-8 transition-transform group-hover:-translate-x-0.5" />
        </button>

        {/* Floating Quick Zoom Buttons */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 flex flex-col gap-1.5 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-700/90 shadow-2xl">
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoomLevel >= 4}
            className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-30 text-white rounded-xl border border-slate-600/60 transition-all cursor-pointer shadow-md hover:scale-105"
            title="ขยายรูป (+20%)"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoomLevel <= 1}
            className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-30 text-white rounded-xl border border-slate-600/60 transition-all cursor-pointer shadow-md hover:scale-105"
            title="ย่อรูป (-20%)"
          >
            <Minus className="h-4 w-4" />
          </button>
          {zoomLevel > 1 && (
            <button
              type="button"
              onClick={handleResetZoom}
              className="w-8 h-8 flex items-center justify-center bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 hover:text-amber-300 rounded-xl border border-amber-500/40 transition-all cursor-pointer shadow-md hover:scale-105 mt-0.5"
              title="รีเซ็ตขนาดปกติ (100%)"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Drag Hint when Zoomed and Not in Pen Mode */}
        {zoomLevel > 1 && !isPenMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700 text-xs text-amber-300 font-medium shadow-xl flex items-center gap-1.5 animate-fadeIn pointer-events-none">
            <Move className="h-3.5 w-3.5 text-amber-400" />
            <span>คลิกค้างแล้วลากเพื่อเลื่อนดูรูป | ดับเบิลคลิกเพื่อรีเซ็ต</span>
          </div>
        )}

        {/* Center Main Photo and Canvas Container */}
        <div className="relative max-w-full max-h-full flex items-center justify-center">
          <div
            className="relative inline-block select-none"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
              transformOrigin: "center center",
              transition: isDragging ? "none" : "transform 0.15s ease-out",
            }}
          >
            <img
              ref={imageRef}
              src={currentPhoto.imageUrl}
              alt={currentPhoto.remarks || "รูปถ่ายผลงาน"}
              referrerPolicy="no-referrer"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onLoad={syncCanvasDimensions}
              onDoubleClick={() => {
                if (!isPenMode) {
                  if (zoomLevel > 1) {
                    handleResetZoom();
                  } else {
                    setZoomLevel(2);
                  }
                }
              }}
              className={`w-auto h-auto object-contain rounded-2xl shadow-2xl select-none block transition-all duration-200 ${
                showThumbnails
                  ? isPenMode
                    ? "max-h-[calc(100vh-200px)] max-w-[94vw]"
                    : "max-h-[calc(100vh-165px)] max-w-[95vw]"
                  : isPenMode
                  ? "max-h-[calc(100vh-130px)] max-w-[96vw]"
                  : "max-h-[calc(100vh-95px)] max-w-[97vw]"
              } ${
                isPenMode
                  ? "cursor-crosshair"
                  : isDragging
                  ? "cursor-grabbing"
                  : zoomLevel > 1
                  ? "cursor-grab"
                  : "cursor-zoom-in"
              }`}
              style={{
                userSelect: "none",
                WebkitUserDrag: "none",
                touchAction: isPenMode ? "none" : zoomLevel > 1 ? "none" : "auto",
              }}
            />

            {/* Drawing Canvas Overlay (Covers the exact bounds of the image) */}
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 w-full h-full rounded-2xl ${
                isPenMode ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"
              }`}
              style={{
                touchAction: "none",
              }}
              onMouseDown={(e) => {
                if (!isPenMode) return;
                e.preventDefault();
                e.stopPropagation();
                startDrawing(e.clientX, e.clientY);
              }}
              onTouchStart={(e) => {
                if (!isPenMode) return;
                if (e.touches.length === 1) {
                  e.preventDefault();
                  e.stopPropagation();
                  startDrawing(e.touches[0].clientX, e.touches[0].clientY);
                }
              }}
            />
          </div>
        </div>

        {/* Floating Quick Caption Overlay at Bottom */}
        {showCaption ? (
          <div className="absolute bottom-2.5 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 max-w-xl w-[92vw] sm:w-auto bg-slate-900/90 border border-slate-800/90 rounded-2xl px-3.5 py-2 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 pointer-events-auto animate-fadeIn">
            <div className="space-y-0.5 min-w-0">
              <h5 className="text-xs sm:text-sm font-bold text-slate-100 flex items-center gap-2">
                <span className="text-amber-400 font-mono text-xs font-bold bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20 shrink-0">
                  #{index + 1}
                </span>
                <span className="truncate max-w-[200px] sm:max-w-md">{currentPhoto.remarks || "ไม่มีคำอธิบายภาพ"}</span>
              </h5>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
                <Calendar className="h-3 w-3 text-indigo-400 shrink-0" />
                <span>บันทึกภาพเมื่อ: {formatDateDisplay(currentPhoto.date)}</span>
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowThumbnails(!showThumbnails)}
                className="text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                title={showThumbnails ? "ซ่อนแถบรูปภาพย่อยเพื่อขยายรูปภาพให้ใหญ่ที่สุด" : "แสดงแถบรูปภาพย่อย"}
              >
                <Layers className="h-3.5 w-3.5 text-indigo-400" />
                <span className="hidden sm:inline">{showThumbnails ? "ซ่อนรูปย่อย" : "แสดงรูปย่อย"}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCaption(false)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-colors cursor-pointer"
                title="ย่อคำอธิบายภาพ เพื่อดูรูปเต็มตา"
              >
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCaption(true)}
            className="absolute bottom-2.5 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-full shadow-xl backdrop-blur-md flex items-center gap-1.5 transition-all cursor-pointer pointer-events-auto"
            title="แสดงคำอธิบายภาพ"
          >
            <Eye className="h-3.5 w-3.5 text-amber-400" />
            <span>คำอธิบาย (#{index + 1})</span>
          </button>
        )}

        {/* Right Chevron Button */}
        <button
          type="button"
          onClick={goNext}
          className="absolute right-3 sm:right-6 z-20 p-3 sm:p-4 rounded-full bg-slate-900/85 hover:bg-indigo-600 text-white border border-slate-700/80 hover:border-indigo-500 shadow-2xl backdrop-blur-md transition-all cursor-pointer group hover:scale-110 active:scale-95"
          title="รูปถัดไป (ปุ่มลูกศรขวา →)"
        >
          <ChevronRight className="h-6 w-6 sm:h-8 sm:w-8 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      {/* Bottom Thumbnail Strip Carousel */}
      {showThumbnails && (
        <div className="bg-slate-900/95 border-t border-slate-800 px-3 py-2 shrink-0 z-20">
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900 focus:outline-none">
            {photos.map((p, i) => {
              const isActive = i === index;
              return (
                <button
                  key={i}
                  ref={(el) => (thumbnailRefs.current[i] = el)}
                  type="button"
                  onClick={() => {
                    setZoomLevel(1);
                    setPanOffset({ x: 0, y: 0 });
                    setIndex(i);
                  }}
                  className={`relative flex-shrink-0 w-16 h-11 sm:w-20 sm:h-13 rounded-xl overflow-hidden border-2 transition-all cursor-pointer group ${
                    isActive
                      ? "border-amber-400 ring-2 ring-amber-400/50 scale-105 shadow-lg shadow-amber-500/20"
                      : "border-slate-800 opacity-60 hover:opacity-100 hover:border-slate-600"
                  }`}
                >
                  <img
                    src={p.imageUrl}
                    alt={p.remarks || `รูปที่ ${i + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
                  />
                  <span
                    className={`absolute bottom-0.5 right-0.5 text-[9px] font-mono font-bold px-1 rounded ${
                      isActive
                        ? "bg-amber-500 text-slate-950"
                        : "bg-slate-950/80 text-white"
                    }`}
                  >
                    #{i + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
