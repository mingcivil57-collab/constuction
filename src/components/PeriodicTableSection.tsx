import React, { useState, useEffect, useRef, useMemo } from "react";
import { Project, PeriodicProgressRecord, DisbursementPeriod } from "../types";
import { getUserSession } from "../lib/userAuth";
import {
  RemarkHighlightToolbar,
  FormattedRemarkText,
} from "./RemarkHighlightRenderer";
import { VisualRemarkEditor } from "./VisualRemarkEditor";
import {
  getDefaultPeriodicProgress,
  recalculateCumulativeFields,
  preparePeriodicChartData,
  getCurrentProgressInfo,
  formatDateDisplayTh,
  toInputDateFormat,
  getDefaultPeriodicRemarks,
  addDaysToDate,
  cascadeDatesFrom,
} from "../lib/periodicUtils";
import {
  calculateLiquidatedDamages,
  calculateProjectTimeline,
  formatDateDisplay,
} from "../lib/dateUtils";
import {
  Plus,
  Trash2,
  Calculator,
  Edit3,
  Edit2,
  Check,
  X,
  TrendingUp,
  Table as TableIcon,
  Percent,
  Coins,
  Layers,
  FileText,
  Save,
  Palette,
  RotateCcw,
  Sliders,
  Maximize2,
  Minimize2,
  Tv,
  Sun,
  Moon,
  Pin,
  PinOff,
  ChevronUp,
  ChevronDown,
  GripHorizontal,
  Search,
  LayoutGrid,
  List,
  ZoomIn,
  ZoomOut,
  Type,
  Copy,
  AlertTriangle,
  Eraser,
  Sparkles,
  ArrowUpDown,
  Scale,
  AlertOctagon,
  ShieldAlert,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface ChartLineConfig {
  color: string;
  strokeWidth: number;
  dashArray: string; // "0" (solid), "4 4" (dashed), "2 2" (dotted), "8 4" (long dash)
}

interface ChartStyleState {
  planPhysical: ChartLineConfig;
  actualPhysical: ChartLineConfig;
  planFinancial: ChartLineConfig;
  actualFinancial: ChartLineConfig;
}

interface TableThemeState {
  planHeaderBg: string;
  planHeaderFg: string;
  planRowBg: string;
  actualHeaderBg: string;
  actualHeaderFg: string;
  actualRowBg: string;
  varianceHeaderBg: string;
  varianceHeaderFg: string;
  varianceRowBg: string;
}

const DEFAULT_TABLE_THEME: TableThemeState = {
  planHeaderBg: "#fef3c7", // amber-100
  planHeaderFg: "#78350f", // amber-900
  planRowBg: "#fffbeb", // amber-50
  actualHeaderBg: "#d1fae5", // emerald-100
  actualHeaderFg: "#064e3b", // emerald-900
  actualRowBg: "#ecfdf5", // emerald-50
  varianceHeaderBg: "#e0f2fe", // sky-100
  varianceHeaderFg: "#0c4a6e", // sky-950
  varianceRowBg: "#f0f9ff", // sky-50
};

const DEFAULT_CHART_STYLE: ChartStyleState = {
  planPhysical: { color: "#64748b", strokeWidth: 2.5, dashArray: "4 4" },
  actualPhysical: { color: "#10b981", strokeWidth: 3, dashArray: "0" },
  planFinancial: { color: "#f59e0b", strokeWidth: 2.5, dashArray: "4 4" },
  actualFinancial: { color: "#3b82f6", strokeWidth: 3, dashArray: "0" },
};

interface PeriodicTableSectionProps {
  project: Project;
  onUpdatePeriodicProgress: (sheetName: string, records: PeriodicProgressRecord[], remarks?: string[]) => Promise<void>;
  onUpdateDisbursements?: (sheetName: string, disbursements: DisbursementPeriod[]) => Promise<void>;
  isAdmin?: boolean;
  onRequestAdminLogin?: (actionName?: string) => void;
  onCheckFirebaseConnection?: () => boolean;
}

export default function PeriodicTableSection({
  project,
  onUpdatePeriodicProgress,
  onUpdateDisbursements,
  isAdmin = false,
  onRequestAdminLogin,
  onCheckFirebaseConnection,
}: PeriodicTableSectionProps) {
  const userSession = getUserSession();
  const isOwnerOrAdmin = Boolean(
    isAdmin ||
    userSession?.role === "Owner" ||
    userSession?.role === "Admin"
  );

  const [records, setRecords] = useState<PeriodicProgressRecord[]>(() =>
    getDefaultPeriodicProgress(project)
  );
  const [remarks, setRemarks] = useState<string[]>(() => getDefaultPeriodicRemarks(project));
  const [editingRemarkIndex, setEditingRemarkIndex] = useState<number | null>(null);
  const [editingRemarkText, setEditingRemarkText] = useState<string>("");
  const normalRemarkTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fullscreenRemarkTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [remarkToDeleteIndex, setRemarkToDeleteIndex] = useState<number | null>(null);
  const [showDeleteLastIterationConfirm, setShowDeleteLastIterationConfirm] = useState<boolean>(false);

  // Clear Table Data Modal State
  const [showClearModal, setShowClearModal] = useState<boolean>(false);
  const [clearMode, setClearMode] = useState<"values_only" | "reset_to_single">("values_only");
  const [clearDisbursementsAlso, setClearDisbursementsAlso] = useState<boolean>(true);
  const [clearRemarksAlso, setClearRemarksAlso] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [autoCalculate, setAutoCalculate] = useState(true);
  
  // Remarks Dedicated Full Screen Presentation Mode & Font Sizing
  const [isRemarksFullScreen, setIsRemarksFullScreen] = useState<boolean>(false);
  const [remarksFontSize, setRemarksFontSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("table_remarks_font_size");
      if (saved) return Number(saved);
    } catch {}
    return 14;
  });
  const [remarksTheme, setRemarksTheme] = useState<"light" | "dark" | "navy">(() => {
    try {
      const saved = localStorage.getItem("table_remarks_theme");
      if (saved === "light" || saved === "dark" || saved === "navy") return saved;
    } catch {}
    return "light";
  });
  const [remarksLayout, setRemarksLayout] = useState<"single" | "grid">("single");
  const [remarksSearchQuery, setRemarksSearchQuery] = useState<string>("");
  const [copiedRemarkIdx, setCopiedRemarkIdx] = useState<number | null>(null);

  const changeRemarksFontSize = (newSize: number) => {
    const clamped = Math.max(9, Math.min(32, newSize));
    setRemarksFontSize(clamped);
    try {
      localStorage.setItem("table_remarks_font_size", String(clamped));
    } catch {}
  };

  const changeRemarksTheme = (newTheme: "light" | "dark" | "navy") => {
    setRemarksTheme(newTheme);
    try {
      localStorage.setItem("table_remarks_theme", newTheme);
    } catch {}
  };

  const toggleRemarksFullScreen = () => {
    if (!isRemarksFullScreen) {
      setIsRemarksFullScreen(true);
      try {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } catch (e) {}
    } else {
      setIsRemarksFullScreen(false);
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      } catch (e) {}
    }
  };

  useEffect(() => {
    if (!isRemarksFullScreen) return;
    const handleRemarksKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        if (e.key === "Escape") {
          target.blur();
        }
        return;
      }

      if (e.key === "Escape") {
        setIsRemarksFullScreen(false);
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        changeRemarksFontSize(remarksFontSize + 1);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        changeRemarksFontSize(remarksFontSize - 1);
      } else if (e.key === "0") {
        e.preventDefault();
        changeRemarksFontSize(14);
      }
    };
    window.addEventListener("keydown", handleRemarksKeyDown);
    return () => window.removeEventListener("keydown", handleRemarksKeyDown);
  }, [isRemarksFullScreen, remarksFontSize]);

  const handleCopyRemark = (text: string, idx: number) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedRemarkIdx(idx);
      setTimeout(() => setCopiedRemarkIdx(null), 2000);
    } catch (e) {
      console.error("Failed to copy", e);
    }
  };

  // Sort order for remarks: "asc" (งวดที่ 1 2 ... - default requested by user) or "desc" (ล่าสุด ➔ งวดที่ 1)
  const [remarksSortOrder, setRemarksSortOrder] = useState<"asc" | "desc">(() => {
    try {
      const saved = localStorage.getItem("table_remarks_sort_order");
      if (saved === "desc" || saved === "asc") return saved;
    } catch {}
    return "asc"; // Default automatic sorting from งวดที่ 1 2 .....
  });

  const changeRemarksSortOrder = (order: "asc" | "desc") => {
    setRemarksSortOrder(order);
    try {
      localStorage.setItem("table_remarks_sort_order", order);
    } catch {}
  };

  // Helper to extract or derive period number for a remark
  const getRemarkPeriodNo = (text: string, originalIndex: number, total: number): number => {
    const match = text.match(/งวดที่\s*(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0) return num;
    }
    return total - originalIndex;
  };

  // Processed remarks with period number, search filtering, and automatic ordering
  const processedRemarks = useMemo(() => {
    const list = remarks.map((text, originalIndex) => {
      const periodNo = getRemarkPeriodNo(text, originalIndex, remarks.length);
      return {
        text,
        originalIndex,
        periodNo,
      };
    });

    const filtered = list.filter(({ text, periodNo }) => {
      if (!remarksSearchQuery.trim()) return true;
      const q = remarksSearchQuery.trim().toLowerCase();
      const periodLabel = `งวดที่ ${periodNo}`;
      return text.toLowerCase().includes(q) || periodLabel.toLowerCase().includes(q);
    });

    return filtered.sort((a, b) => {
      if (remarksSortOrder === "asc") {
        return a.periodNo - b.periodNo; // 1, 2, 3, 4 ...
      } else {
        return b.periodNo - a.periodNo; // 8, 7, 6, 5 ...
      }
    });
  }, [remarks, remarksSearchQuery, remarksSortOrder]);

  // Keep filteredRemarks as an alias for backwards compatibility
  const filteredRemarks = processedRemarks;

  // Table Font Size for standard and full screen presentation (in px)
  const [tableFontSize, setTableFontSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("periodic_table_font_size") || localStorage.getItem("presentation_table_font_size");
      if (saved) {
        const num = parseInt(saved, 10);
        if (!isNaN(num) && num >= 10 && num <= 32) return num;
      }
    } catch {}
    return 14;
  });

  const changeTableFontSize = (size: number) => {
    const clamped = Math.max(10, Math.min(32, size));
    setTableFontSize(clamped);
    try {
      localStorage.setItem("periodic_table_font_size", clamped.toString());
      localStorage.setItem("presentation_table_font_size", clamped.toString());
    } catch {}
  };

  // Graph comparison mode: 'physical' (% progress) | 'financial' (amount in Baht) | 'both'
  const [chartMode, setChartMode] = useState<"physical" | "financial" | "both">("physical");

  // Chart Style Customization State (Owner Mode)
  const [chartStyle, setChartStyle] = useState<ChartStyleState>(() => {
    try {
      const saved = localStorage.getItem(`chart_style_${project.sheetName}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to parse chart_style", e);
    }
    return DEFAULT_CHART_STYLE;
  });

  // Table Customization State (Owner Mode)
  const [tableTheme, setTableTheme] = useState<TableThemeState>(() => {
    try {
      const saved = localStorage.getItem(`table_theme_${project.sheetName}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to parse table_theme", e);
    }
    return DEFAULT_TABLE_THEME;
  });

  const [showStyleModal, setShowStyleModal] = useState(false);
  const [styleModalTab, setStyleModalTab] = useState<"chart" | "table">("chart");

  // Full Screen Presentation Mode State
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showFullScreenHeader, setShowFullScreenHeader] = useState(true);
  const [fullScreenTheme, setFullScreenTheme] = useState<"light" | "dark">("light");
  const [isGraphPinned, setIsGraphPinned] = useState(true);
  const [isGraphCompact, setIsGraphCompact] = useState(false);
  const [fullScreenGraphHeight, setFullScreenGraphHeight] = useState<number>(320);
  const [isResizingGraph, setIsResizingGraph] = useState<boolean>(false);
  const resizeStartYRef = useRef<number>(0);
  const resizeStartHeightRef = useRef<number>(0);

  // Visibility toggles for the 3 main sub-components in Full Screen Mode
  const [showFullScreenGraph, setShowFullScreenGraph] = useState<boolean>(true);
  const [showFullScreenTable, setShowFullScreenTable] = useState<boolean>(true);
  const [showFullScreenRemarks, setShowFullScreenRemarks] = useState<boolean>(true);

  // Table columns pinning (freeze "รายการหลัก" and "รายการย่อย")
  // On mobile (< 768px), default to false (unpinned, scrollable) per user request
  // On desktop (>= 768px), default to true (pinned)
  const [isColsPinned, setIsColsPinned] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      if (window.innerWidth < 768) {
        return false;
      }
      const saved = localStorage.getItem("periodic_table_cols_pinned");
      if (saved !== null) return saved === "true";
      return true;
    }
    return true;
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsColsPinned(false);
      } else {
        const saved = localStorage.getItem("periodic_table_cols_pinned");
        setIsColsPinned(saved !== null ? saved === "true" : true);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleColsPinned = () => {
    setIsColsPinned((prev) => {
      const next = !prev;
      if (typeof window !== "undefined" && window.innerWidth >= 768) {
        localStorage.setItem("periodic_table_cols_pinned", String(next));
      }
      return next;
    });
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingGraph(true);
    resizeStartYRef.current = e.clientY;
    resizeStartHeightRef.current = fullScreenGraphHeight;
  };

  const handleResizeTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      setIsResizingGraph(true);
      resizeStartYRef.current = e.touches[0].clientY;
      resizeStartHeightRef.current = fullScreenGraphHeight;
    }
  };

  useEffect(() => {
    if (!isResizingGraph) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizeStartYRef.current;
      const newHeight = Math.max(150, Math.min(850, resizeStartHeightRef.current + deltaY));
      setFullScreenGraphHeight(newHeight);
      if (isGraphCompact) setIsGraphCompact(false);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const deltaY = e.touches[0].clientY - resizeStartYRef.current;
        const newHeight = Math.max(150, Math.min(850, resizeStartHeightRef.current + deltaY));
        setFullScreenGraphHeight(newHeight);
        if (isGraphCompact) setIsGraphCompact(false);
      }
    };

    const handleMouseUp = () => {
      setIsResizingGraph(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, [isResizingGraph, isGraphCompact]);

  // Fullscreen Remarks height state & drag handle handlers
  const [fullScreenRemarksHeight, setFullScreenRemarksHeight] = useState<number>(240);
  const [isResizingRemarks, setIsResizingRemarks] = useState<boolean>(false);
  const resizeRemarksStartYRef = useRef<number>(0);
  const resizeRemarksStartHeightRef = useRef<number>(0);

  // Fullscreen Table height state & drag handle handlers
  const [fullScreenTableHeight, setFullScreenTableHeight] = useState<number>(380);
  const [isResizingTable, setIsResizingTable] = useState<boolean>(false);
  const resizeTableStartYRef = useRef<number>(0);
  const resizeTableStartHeightRef = useRef<number>(0);

  const handleTableResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingTable(true);
    resizeTableStartYRef.current = e.clientY;
    resizeTableStartHeightRef.current = fullScreenTableHeight;
  };

  const handleTableResizeTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      setIsResizingTable(true);
      resizeTableStartYRef.current = e.touches[0].clientY;
      resizeTableStartHeightRef.current = fullScreenTableHeight;
    }
  };

  useEffect(() => {
    if (!isResizingTable) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizeTableStartYRef.current;
      const tableEl = fullScreenTableRef.current?.querySelector("table") as HTMLTableElement | null;
      const hasHorizontalScroll = fullScreenTableRef.current
        ? fullScreenTableRef.current.scrollWidth > fullScreenTableRef.current.clientWidth
        : false;
      // Exact height down to the bottom border of the table (the last row: ส่วนต่างการเงินสะสม)
      const maxContentHeight = tableEl ? tableEl.offsetHeight + (hasHorizontalScroll ? 14 : 4) : 1400;
      const newHeight = Math.max(160, Math.min(maxContentHeight, resizeTableStartHeightRef.current + deltaY));
      setFullScreenTableHeight(newHeight);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const deltaY = e.touches[0].clientY - resizeTableStartYRef.current;
        const tableEl = fullScreenTableRef.current?.querySelector("table") as HTMLTableElement | null;
        const hasHorizontalScroll = fullScreenTableRef.current
          ? fullScreenTableRef.current.scrollWidth > fullScreenTableRef.current.clientWidth
          : false;
        // Exact height down to the bottom border of the table (the last row: ส่วนต่างการเงินสะสม)
        const maxContentHeight = tableEl ? tableEl.offsetHeight + (hasHorizontalScroll ? 14 : 4) : 1400;
        const newHeight = Math.max(160, Math.min(maxContentHeight, resizeTableStartHeightRef.current + deltaY));
        setFullScreenTableHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizingTable(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, [isResizingTable]);

  const handleRemarksResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingRemarks(true);
    resizeRemarksStartYRef.current = e.clientY;
    resizeRemarksStartHeightRef.current = fullScreenRemarksHeight;
  };

  const handleRemarksResizeTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      setIsResizingRemarks(true);
      resizeRemarksStartYRef.current = e.touches[0].clientY;
      resizeRemarksStartHeightRef.current = fullScreenRemarksHeight;
    }
  };

  useEffect(() => {
    if (!isResizingRemarks) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Handle is at bottom: dragging DOWN (e.clientY > startY) increases height
      const deltaY = e.clientY - resizeRemarksStartYRef.current;
      const newHeight = Math.max(100, Math.min(1000, resizeRemarksStartHeightRef.current + deltaY));
      setFullScreenRemarksHeight(newHeight);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const deltaY = e.touches[0].clientY - resizeRemarksStartYRef.current;
        const newHeight = Math.max(100, Math.min(1000, resizeRemarksStartHeightRef.current + deltaY));
        setFullScreenRemarksHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizingRemarks(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, [isResizingRemarks]);

  const toggleFullScreen = () => {
    if (!isFullScreen) {
      setIsFullScreen(true);
      setShowFullScreenHeader(true);
      try {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } catch (e) {}
    } else {
      setIsFullScreen(false);
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      } catch (e) {}
    }
  };

  useEffect(() => {
    if (!isFullScreen) return;
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullScreen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Esc") {
        e.preventDefault();
        e.stopPropagation();
        toggleFullScreen();
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isFullScreen]);

  const mainTableRef = useRef<HTMLDivElement>(null);
  const fullScreenTableRef = useRef<HTMLDivElement>(null);

  // Mouse wheel horizontal scrolling on Excel-style tables
  useEffect(() => {
    const attachWheel = (el: HTMLDivElement | null) => {
      if (!el) return () => {};
      const onWheel = (e: WheelEvent) => {
        // If trackpad horizontal gesture is active, let native scroll handle it
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll <= 0) return;

        if (e.deltaY !== 0) {
          const isScrollingLeft = e.deltaY < 0;
          const isScrollingRight = e.deltaY > 0;
          const canScrollLeft = el.scrollLeft > 0;
          const canScrollRight = Math.ceil(el.scrollLeft) < maxScroll - 1;

          if ((isScrollingLeft && canScrollLeft) || (isScrollingRight && canScrollRight)) {
            e.preventDefault();
            el.scrollLeft += e.deltaY;
          }
        }
      };

      el.addEventListener("wheel", onWheel, { passive: false });
      return () => {
        el.removeEventListener("wheel", onWheel);
      };
    };

    const cleanupMain = attachWheel(mainTableRef.current);
    const cleanupFs = attachWheel(fullScreenTableRef.current);

    return () => {
      cleanupMain();
      cleanupFs();
    };
  }, [isFullScreen, showFullScreenTable, records.length, tableFontSize]);

  // Sync records, remarks, chart style, and table theme if project changes
  useEffect(() => {
    setRecords(getDefaultPeriodicProgress(project));
    setRemarks(getDefaultPeriodicRemarks(project));
    try {
      const savedChart = localStorage.getItem(`chart_style_${project.sheetName}`);
      if (savedChart) setChartStyle(JSON.parse(savedChart));
      else setChartStyle(DEFAULT_CHART_STYLE);

      const savedTheme = localStorage.getItem(`table_theme_${project.sheetName}`);
      if (savedTheme) setTableTheme(JSON.parse(savedTheme));
      else setTableTheme(DEFAULT_TABLE_THEME);
    } catch (e) {
      setChartStyle(DEFAULT_CHART_STYLE);
      setTableTheme(DEFAULT_TABLE_THEME);
    }
  }, [project]);

  const saveTableThemeToStorage = (newTheme: TableThemeState) => {
    setTableTheme(newTheme);
    try {
      localStorage.setItem(`table_theme_${project.sheetName}`, JSON.stringify(newTheme));
    } catch (e) {
      console.error("Failed to save table_theme", e);
    }
  };

  const saveChartStyleToStorage = (newStyle: ChartStyleState) => {
    setChartStyle(newStyle);
    try {
      localStorage.setItem(`chart_style_${project.sheetName}`, JSON.stringify(newStyle));
    } catch (e) {
      console.error("Failed to save chart_style", e);
    }
  };

  const resetChartStyleToDefault = () => {
    setChartStyle(DEFAULT_CHART_STYLE);
    try {
      localStorage.removeItem(`chart_style_${project.sheetName}`);
    } catch (e) {
      console.error("Failed to remove chart_style", e);
    }
  };

  // Remarks persistence helper
  const saveRemarksToStorage = (newRemarks: string[]) => {
    setRemarks(newRemarks);
    project.periodicRemarks = newRemarks;
    try {
      localStorage.setItem(`periodic_remarks_${project.sheetName}`, JSON.stringify(newRemarks));
    } catch (e) {
      console.error("Failed to save remarks to localStorage", e);
    }
    onUpdatePeriodicProgress(project.sheetName, records, newRemarks).catch((e) => {
      console.error("Failed to update parent periodic remarks", e);
    });
  };

  const handleAddRemark = (customInitialText?: string) => {
    if (!isOwnerOrAdmin && onRequestAdminLogin) {
      onRequestAdminLogin("เพิ่มหมายเหตุท้ายตาราง");
      return;
    }
    const newText = customInitialText || "กรุณากรอกข้อมูล.....";

    // Prepend to top so latest is always at the top (index 0)
    const newRemarks = [newText, ...remarks];
    saveRemarksToStorage(newRemarks);
    setEditingRemarkIndex(0);
    setEditingRemarkText(newText);
  };

  const handleMoveRemark = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === remarks.length - 1) return;
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    const updated = [...remarks];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    saveRemarksToStorage(updated);
    if (editingRemarkIndex === index) {
      setEditingRemarkIndex(targetIdx);
    } else if (editingRemarkIndex === targetIdx) {
      setEditingRemarkIndex(index);
    }
  };

  const handleStartEditRemark = (index: number) => {
    if (!isOwnerOrAdmin && onRequestAdminLogin) {
      onRequestAdminLogin("แก้ไขหมายเหตุท้ายตาราง");
      return;
    }
    setEditingRemarkIndex(index);
    setEditingRemarkText(remarks[index] || "");
  };

  const handleSaveRemark = (index: number) => {
    const updated = [...remarks];
    updated[index] = editingRemarkText;
    saveRemarksToStorage(updated);
    setEditingRemarkIndex(null);
    setEditingRemarkText("");
  };

  const onRequestDeleteRemark = (index: number) => {
    if (!isOwnerOrAdmin && onRequestAdminLogin) {
      onRequestAdminLogin("ลบหมายเหตุท้ายตาราง");
      return;
    }
    setRemarkToDeleteIndex(index);
  };

  const handleConfirmDeleteRemark = () => {
    if (remarkToDeleteIndex === null) return;
    const index = remarkToDeleteIndex;
    const updated = remarks.filter((_, idx) => idx !== index);
    saveRemarksToStorage(updated);
    if (editingRemarkIndex === index) {
      setEditingRemarkIndex(null);
      setEditingRemarkText("");
    } else if (editingRemarkIndex !== null && editingRemarkIndex > index) {
      setEditingRemarkIndex(editingRemarkIndex - 1);
    }
    setRemarkToDeleteIndex(null);
  };

  // Format currency helper
  const formatMoney = (val: number) => {
    return new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val || 0);
  };

  // Format compact currency helper for graph axis
  const formatCompactMoney = (val: number) => {
    if (val >= 1000000) {
      return `${(val / 1000000).toLocaleString("th-TH", { maximumFractionDigits: 1 })}M`;
    }
    if (val >= 1000) {
      return `${(val / 1000).toLocaleString("th-TH", { maximumFractionDigits: 0 })}k`;
    }
    return val.toLocaleString("th-TH");
  };

  // Format percent helper - strictly 2 decimal places
  const formatPercent = (val: number | string | undefined | null) => {
    if (val === undefined || val === null || val === "") return "-";
    const num = typeof val === "number" ? val : parseFloat(String(val).replace(/[%,\s]/g, ""));
    if (isNaN(num)) return "-";
    return num.toLocaleString("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Custom Dark Tooltip Component for Graph
  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;

    const planCumPct = data["แผนงานสะสมประจำเดือน (%)"] ?? 0;
    const actualCumPct = data["ผลงานสะสมประจำเดือน (%)"];
    const hasActualPct = actualCumPct !== null && actualCumPct !== undefined;
    const diffCumPct = hasActualPct ? actualCumPct - planCumPct : null;

    const planAmt = data["แผนการเงินสะสมประจำเดือน (บาท)"] ?? 0;
    const actualAmt = data["ผลการเงินสะสมประจำเดือน (บาท)"];
    const hasActualAmt = actualAmt !== null && actualAmt !== undefined;
    const diffAmt = hasActualAmt ? actualAmt - planAmt : null;

    return (
      <div className="bg-slate-900/95 text-white rounded-xl p-3 shadow-2xl border border-slate-700/80 text-xs space-y-2 min-w-[230px] backdrop-blur-md">
        <div className="font-bold text-amber-300 border-b border-slate-700/80 pb-1.5 flex items-center justify-between gap-2">
          <span>{label}</span>
          {data.dateRange && (
            <span className="text-[10px] text-slate-300 font-mono font-normal">
              ({data.dateRange})
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          {(chartMode === "physical" || chartMode === "both") && (
            <>
              <div className="flex justify-between items-center gap-3">
                <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shrink-0" />
                  ผลงานสะสมประจำเดือน (%):
                </span>
                <span className="font-mono font-bold text-emerald-400">
                  {hasActualPct ? `${formatPercent(actualCumPct)}%` : "-"}
                </span>
              </div>

              <div className="flex justify-between items-center gap-3">
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-400 inline-block shrink-0" />
                  แผนงานสะสมประจำเดือน (%):
                </span>
                <span className="font-mono font-bold text-slate-200">
                  {formatPercent(planCumPct)}%
                </span>
              </div>

              {/* HIGHLIGHTED VARIANCE ROW (% ส่วนต่างงาน) */}
              <div className="flex justify-between items-center gap-3 pt-1.5 border-t border-slate-800">
                <span className="font-bold text-sky-300 flex items-center gap-1">
                  <span>ส่วนต่างงานสะสม (%):</span>
                </span>
                {diffCumPct !== null ? (
                  <span
                    className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] flex items-center gap-1 ${
                      diffCumPct > 0
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-700/60"
                        : diffCumPct < 0
                        ? "bg-rose-950 text-rose-300 border border-rose-700/60"
                        : "bg-slate-800 text-slate-300 border border-slate-700"
                    }`}
                  >
                    <span>{diffCumPct > 0 ? `+${diffCumPct.toFixed(2)}%` : `${diffCumPct.toFixed(2)}%`}</span>
                    <span className="text-[9px] font-sans font-semibold">
                      {diffCumPct > 0 ? "(เร็วกว่าแผน)" : diffCumPct < 0 ? "(ช้ากว่าแผน)" : "(ตามแผน)"}
                    </span>
                  </span>
                ) : (
                  <span className="text-slate-400 font-mono text-[11px] italic">-</span>
                )}
              </div>
            </>
          )}

          {(chartMode === "financial" || chartMode === "both") && (
            <div className={`space-y-1.5 ${chartMode === "both" ? "pt-2 border-t border-slate-800 mt-2" : ""}`}>
              <div className="flex justify-between items-center gap-3">
                <span className="text-amber-400 font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0" />
                  ผลการเงินสะสม (บาท):
                </span>
                <span className="font-mono font-bold text-amber-400">
                  {hasActualAmt ? formatMoney(actualAmt) : "-"}
                </span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-600 inline-block shrink-0" />
                  แผนการเงินสะสม (บาท):
                </span>
                <span className="font-mono font-bold text-slate-200">{formatMoney(planAmt)}</span>
              </div>
              <div className="flex justify-between items-center gap-3 pt-1.5 border-t border-slate-800">
                <span className="font-bold text-sky-300">ส่วนต่างการเงินสะสม:</span>
                {diffAmt !== null ? (
                  <span
                    className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                      diffAmt > 0
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-700/60"
                        : diffAmt < 0
                        ? "bg-rose-950 text-rose-300 border border-rose-700/60"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {diffAmt > 0 ? `+${formatMoney(diffAmt)}` : formatMoney(diffAmt)}
                  </span>
                ) : (
                  <span className="text-slate-400 font-mono text-[11px] italic">-</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Handle cell value change
  const handleCellChange = (
    index: number,
    field: keyof PeriodicProgressRecord,
    value: any
  ) => {
    let updated = [...records];
    if (field === "startDate") {
      updated[index] = { ...updated[index], startDate: value };
      // Auto-cascade 30 days period dates starting from this iteration
      updated = cascadeDatesFrom(updated, index, 30);
    } else if (field === "endDate") {
      updated[index] = { ...updated[index], endDate: value };
      // If end date of a period is modified, cascade next periods starting from index + 1
      if (index + 1 < updated.length) {
        updated = cascadeDatesFrom(updated, index + 1, 30);
      }
    } else {
      let numVal = value === "" || value === null || value === undefined ? undefined : parseFloat(value);
      if (numVal !== undefined && isNaN(numVal)) {
        numVal = undefined;
      } else if (
        numVal !== undefined &&
        (field === "planMonthlyPercent" || field === "actualMonthlyPercent")
      ) {
        numVal = Math.min(100, Math.max(0, numVal));
      } else if (numVal !== undefined && field === "planMonthlyAmount") {
        numVal = Math.max(0, numVal);
      }

      if (field === "planMonthlyPercent") {
        updated[index] = { ...updated[index], planMonthlyPercent: numVal, planCumulativePercent: undefined };
      } else if (field === "planMonthlyAmount") {
        updated[index] = { ...updated[index], planMonthlyAmount: numVal, planCumulativeAmount: undefined };
      } else if (field === "actualMonthlyPercent") {
        updated[index] = { ...updated[index], actualMonthlyPercent: numVal, actualCumulativePercent: undefined };
      } else {
        updated[index] = { ...updated[index], [field]: numVal };
      }
    }

    const contractVal = project.contractAmount || project.budget || 0;

    setRecords(autoCalculate ? recalculateCumulativeFields(updated, contractVal) : updated);
  };

  // Auto-run 30-day date cascade for all iterations starting from period 1
  const handleAutoRun30Days = () => {
    const contractVal = project.contractAmount || project.budget || 0;
    const updated = cascadeDatesFrom(records, 0, 30);
    setRecords(autoCalculate ? recalculateCumulativeFields(updated, contractVal) : updated);
  };

  // Add new iteration (งวดที่)
  const handleAddIteration = () => {
    const contractVal = project.contractAmount || project.budget || 0;
    const nextNo = records.length + 1;
    const lastRec = records[records.length - 1];
    
    // Default dates for new iteration
    let newStart = "2026-09-01";
    let newEnd = "2026-09-30";
    if (lastRec && lastRec.endDate && lastRec.endDate !== "-") {
      newStart = addDaysToDate(lastRec.endDate, 1);
      newEnd = addDaysToDate(newStart, 29);
    }

    const newRecord: PeriodicProgressRecord = {
      periodNo: nextNo,
      startDate: newStart,
      endDate: newEnd,
      planMonthlyPercent: 0,
      planCumulativePercent: lastRec ? lastRec.planCumulativePercent : 0,
      planMonthlyAmount: 0,
      planCumulativeAmount: lastRec ? lastRec.planCumulativeAmount : 0,
      actualMonthlyPercent: 0,
      actualCumulativePercent: lastRec ? lastRec.actualCumulativePercent : 0,
      actualMonthlyAmount: 0,
      actualCumulativeAmount: lastRec ? lastRec.actualCumulativeAmount : 0,
    };

    const newRecords = [...records, newRecord];
    setRecords(autoCalculate ? recalculateCumulativeFields(newRecords, contractVal) : newRecords);
  };

  // Delete last iteration
  const onRequestDeleteLastIteration = () => {
    if (records.length <= 1) return;
    if (!isOwnerOrAdmin && onRequestAdminLogin) {
      onRequestAdminLogin("ลบครั้งที่ล่าสุด");
      return;
    }
    setShowDeleteLastIterationConfirm(true);
  };

  const handleConfirmDeleteLastIteration = () => {
    if (records.length <= 1) return;
    const contractVal = project.contractAmount || project.budget || 0;
    const newRecords = records.slice(0, records.length - 1);
    setRecords(autoCalculate ? recalculateCumulativeFields(newRecords, contractVal) : newRecords);
    setShowDeleteLastIterationConfirm(false);
  };

  // Open clear table confirmation modal
  const handleOpenClearModal = () => {
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
    if (!isOwnerOrAdmin && onRequestAdminLogin) {
      onRequestAdminLogin("ล้างข้อมูลในตารางแผนงานและผลงานรายครั้ง");
      return;
    }
    setShowClearModal(true);
  };

  // Helper to execute clearing data
  const executeClearData = (mode: "values_only" | "reset_to_single", clearRemarks: boolean) => {
    let clearedRecords: PeriodicProgressRecord[] = [];

    if (mode === "values_only") {
      clearedRecords = records.map((rec) => ({
        periodNo: rec.periodNo,
        startDate: rec.startDate || "-",
        endDate: rec.endDate || "-",
        planMonthlyPercent: 0,
        planCumulativePercent: 0,
        planMonthlyAmount: 0,
        planCumulativeAmount: 0,
        actualMonthlyPercent: 0,
        actualCumulativePercent: 0,
        actualMonthlyAmount: 0,
        actualCumulativeAmount: 0,
      }));
    } else {
      // Reset to 1 fresh period
      const pStart = project.startDate && project.startDate !== "-" ? project.startDate : "2026-03-01";
      const pEnd = addDaysToDate(pStart, 29);
      clearedRecords = [
        {
          periodNo: 1,
          startDate: pStart,
          endDate: pEnd,
          planMonthlyPercent: 0,
          planCumulativePercent: 0,
          planMonthlyAmount: 0,
          planCumulativeAmount: 0,
          actualMonthlyPercent: 0,
          actualCumulativePercent: 0,
          actualMonthlyAmount: 0,
          actualCumulativeAmount: 0,
        },
      ];
    }

    const finalRemarks = clearRemarks ? [] : remarks;
    return { clearedRecords, finalRemarks };
  };

  // Confirm Clear and enter edit mode to inspect/fill new values
  const handleConfirmClearAndEdit = () => {
    const { clearedRecords, finalRemarks } = executeClearData(clearMode, clearRemarksAlso);
    setRecords(clearedRecords);
    setRemarks(finalRemarks);
    try {
      localStorage.setItem(`periodic_${project.sheetName}`, JSON.stringify(clearedRecords));
      localStorage.setItem(`periodic_remarks_${project.sheetName}`, JSON.stringify(finalRemarks));
    } catch (e) {}
    if (clearDisbursementsAlso && onUpdateDisbursements) {
      onUpdateDisbursements(project.sheetName, []).catch((err) => {
        console.error("Failed to clear disbursements during edit clear:", err);
      });
    }
    setShowClearModal(false);
    setIsEditing(true);
  };

  // Confirm Clear and save directly to Google Sheets / Firebase
  const handleConfirmClearAndSave = async () => {
    setIsClearing(true);
    try {
      const { clearedRecords, finalRemarks } = executeClearData(clearMode, clearRemarksAlso);
      setRecords(clearedRecords);
      setRemarks(finalRemarks);
      try {
        localStorage.setItem(`periodic_${project.sheetName}`, JSON.stringify(clearedRecords));
        localStorage.setItem(`periodic_remarks_${project.sheetName}`, JSON.stringify(finalRemarks));
      } catch (e) {}
      if (clearDisbursementsAlso && onUpdateDisbursements) {
        await onUpdateDisbursements(project.sheetName, []);
      }
      await onUpdatePeriodicProgress(project.sheetName, clearedRecords, finalRemarks);
      setShowClearModal(false);
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to clear periodic table", err);
      alert("เกิดข้อผิดพลาดในการบันทึกการล้างข้อมูล กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsClearing(false);
    }
  };

  // Force recalculate cumulative values
  const handleRecalculate = () => {
    const contractVal = project.contractAmount || project.budget || 0;
    setRecords(recalculateCumulativeFields(records, contractVal));
  };

  // Save table changes
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const contractVal = project.contractAmount || project.budget || 0;
      const finalRecords = autoCalculate ? recalculateCumulativeFields(records, contractVal) : records;
      await onUpdatePeriodicProgress(project.sheetName, finalRecords, remarks);
      setIsEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  // Save remarks and table data to Google Sheet
  const handleSaveRemarksAndTable = async () => {
    setIsSaving(true);
    try {
      const contractVal = project.contractAmount || project.budget || 0;
      const finalRecords = autoCalculate ? recalculateCumulativeFields(records, contractVal) : records;
      await onUpdatePeriodicProgress(project.sheetName, finalRecords, remarks);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel edit
  const handleCancelEdit = () => {
    setRecords(getDefaultPeriodicProgress(project));
    setIsEditing(false);
  };

  // Chart data (plot actual progress strictly up to current period)
  const currentInfo = getCurrentProgressInfo({ ...project, periodicProgress: records });
  const chartData = preparePeriodicChartData(records, project.contractAmount || project.budget, currentInfo.periodNo);
  const penaltyResult = calculateLiquidatedDamages(
    { ...project, periodicProgress: records },
    currentInfo.actualPercent || project.progressField
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-7 space-y-6 transition-all font-['Sarabun',sans-serif]">
      {/* SECTION HEADER & CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-100 shrink-0">
            <TableIcon className="h-6 w-6 text-emerald-600 shrink-0" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
              ตารางแผนงานและผลงานรายครั้ง ( Periodic Progress Table )
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 font-normal leading-relaxed">
              บันทึกและติดตาม % แผนงาน, % ผลงาน และแผนการเงินรายงวด/ครั้งที่ เพื่อเปรียบเทียบกราฟแนวโน้มสะสม (S-Curve)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* FONT SIZE ADJUSTER A- [N]px A+ */}
          <div
            className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 border border-slate-200/80 bg-slate-50 text-slate-800 text-xs select-none shadow-2xs"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => changeTableFontSize(tableFontSize - 1)}
              disabled={tableFontSize <= 10}
              className="px-1.5 text-slate-700 hover:text-emerald-700 disabled:opacity-30 cursor-pointer font-semibold transition-colors"
              title="ลดขนาดตัวอักษรในตาราง (A-)"
            >
              A-
            </button>
            <span className="text-xs font-semibold tabular-nums text-amber-700 min-w-[34px] text-center">
              {tableFontSize}px
            </span>
            <button
              type="button"
              onClick={() => changeTableFontSize(tableFontSize + 1)}
              disabled={tableFontSize >= 32}
              className="px-1.5 text-slate-700 hover:text-emerald-700 disabled:opacity-30 cursor-pointer font-semibold transition-colors"
              title="เพิ่มขนาดตัวอักษรในตาราง (A+)"
            >
              A+
            </button>
          </div>

          {/* TOGGLE PIN/UNPIN COLUMNS (ON MOBILE DEFAULTS TO UNPINNED / SCROLLABLE) */}
          <button
            type="button"
            onClick={toggleColsPinned}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 border text-xs font-medium select-none shadow-2xs cursor-pointer transition-all ${
              isColsPinned
                ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                : "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300"
            }`}
            title={
              isColsPinned
                ? "ตรึงคอลัมน์รายการหลัก/ย่อยอยู่ (คลิกเพื่อปลดตรึงให้อนุญาตเลื่อนดูข้อมูลได้อิสระ)"
                : "ไม่ตรึงคอลัมน์รายการหลัก/ย่อย สามารถเลื่อนตารางดูทุกงวดได้อย่างอิสระ (คลิกเพื่อตรึง)"
            }
          >
            {isColsPinned ? (
              <>
                <Pin className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                <span className="hidden sm:inline">ตรึงคอลัมน์</span>
                <span className="sm:hidden">ตรึง</span>
              </>
            ) : (
              <>
                <PinOff className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span className="hidden sm:inline">ไม่ตรึงคอลัมน์ (เลื่อนได้)</span>
                <span className="sm:hidden">เลื่อนได้</span>
              </>
            )}
          </button>

          {/* FULL SCREEN PRESENTATION BUTTON */}
          <button
            type="button"
            onClick={toggleFullScreen}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer hover:shadow-md hover:scale-[1.02] whitespace-nowrap"
            title="เปิดโหมดนำเสนอแบบเต็มจอ (Full Screen) แสดงทั้งกราฟ S-Curve และตารางเปรียบเทียบพร้อมกัน"
          >
            <Maximize2 className="h-4 w-4" />
            <span>โหมดเต็มจอ (Full Screen)</span>
          </button>

          {!isEditing ? (
            <button
              type="button"
              onClick={() => {
                if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
                if (!isOwnerOrAdmin && onRequestAdminLogin) {
                  onRequestAdminLogin("ปรับแก้ไขตารางแผนงานและผลงานรายครั้ง");
                } else {
                  setIsEditing(true);
                }
              }}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>ปรับแก้ไขตาราง/เพิ่มครั้งที่</span>
              {!isOwnerOrAdmin && <span className="text-[10px] bg-emerald-800/60 px-1 py-0.5 rounded text-emerald-200">🔒 Admin</span>}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200"
              >
                <X className="h-3.5 w-3.5" />
                <span>ยกเลิก</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                <span>บันทึกตาราง</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* COMPARISON GRAPH (S-CURVE) */}
      <div className={`border rounded-xl p-4 transition-all ${
        (penaltyResult.isOverdue || penaltyResult.hasFinalInstallmentExceededContract)
          ? "bg-rose-50/40 border-rose-200"
          : "bg-slate-50/70 border-slate-200/80"
      }`}>
        {/* CONTRACT OVERRUN / LIQUIDATED DAMAGES CALLOUT BANNER */}
        {(penaltyResult.isOverdue || penaltyResult.hasFinalInstallmentExceededContract) && (
          <div className={`mb-3 p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
            penaltyResult.isExceedingCap
              ? "bg-rose-600 text-white border-rose-700 animate-pulse shadow-xs"
              : "bg-rose-100/90 text-rose-900 border-rose-300"
          }`}>
            <div className="flex items-center gap-2">
              <Scale className="h-4.5 w-4.5 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold">
                  ⚠️ โครงการเข้าสู่ "ช่วงเกินสัญญา / คิดค่าปรับ" (Contract Overrun Phase):
                </span>{" "}
                <span className="font-normal">
                  {penaltyResult.hasFinalInstallmentExceededContract && penaltyResult.lastPeriodEndDateStr ? (
                    <>ส่งมอบจริง{penaltyResult.lastPeriodNo ? ` (งวดที่ ${penaltyResult.lastPeriodNo})` : ""}: {formatDateDisplay(penaltyResult.lastPeriodEndDateStr)} เกินกำหนดสัญญา {penaltyResult.isOngoingToToday ? `(คิดถึงปัจจุบัน ${penaltyResult.asOfTodayStr}) คิดค่าปรับ ${penaltyResult.overdueDays} วัน` : `คิดค่าปรับ ${penaltyResult.overdueDays} วัน`} (คิดค่าปรับสุทธิ ${penaltyResult.netChargeableDays} วัน)</>
                  ) : (
                    <>สิ้นสุดสัญญามาแล้ว {penaltyResult.overdueDays} วัน (คิดค่าปรับสุทธิ {penaltyResult.netChargeableDays} วัน)</>
                  )}
                </span>
                {penaltyResult.isExceedingCap && (
                  <span className="ml-1.5 bg-white text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                    🚨 ค่าปรับสะสมเกินเกณฑ์ 10%
                  </span>
                )}
              </div>
            </div>
            <div className="text-xs tabular-nums font-semibold shrink-0 bg-white/95 text-rose-800 px-3 py-1 rounded-lg border border-rose-200 shadow-2xs">
              ค่าปรับสะสม: {penaltyResult.totalFineAmount.toLocaleString()} บ. ({penaltyResult.finePercentOfBudget.toFixed(2)}%)
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-200/70">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
            <div>
              <span className="text-xs sm:text-sm font-bold text-slate-800">
                กราฟเปรียบเทียบแนวโน้มสะสม (S-Curve)
              </span>
              <span className="text-[11px] text-slate-500 ml-2 font-normal hidden sm:inline">
                ({records.length} งวด {currentInfo.periodNo ? `• พล็อตถึงงวดที่ ${currentInfo.periodNo}` : ""})
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* GRAPH COMPARISON SELECTOR BUTTONS */}
            <div className="flex bg-slate-200/80 p-1 rounded-xl text-xs font-semibold shadow-2xs">
              <button
                type="button"
                onClick={() => setChartMode("physical")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  chartMode === "physical"
                    ? "bg-white text-emerald-700 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="เปรียบเทียบ แผนงานสะสม (%) กับ ผลงานสะสม (%)"
              >
                <Percent className="h-3.5 w-3.5 text-emerald-600" />
                <span>แผนงาน vs ผลงานสะสม (%)</span>
              </button>
              
              <button
                type="button"
                onClick={() => setChartMode("financial")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  chartMode === "financial"
                    ? "bg-white text-blue-700 shadow-xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="เปรียบเทียบ แผนการเงินสะสม (บาท) กับ ผลการเงินสะสม (บาท)"
              >
                <Coins className="h-3.5 w-3.5 text-blue-600" />
                <span>แผนการเงิน vs ผลการเงินสะสม (บาท)</span>
              </button>

              <button
                type="button"
                onClick={() => setChartMode("both")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  chartMode === "both"
                    ? "bg-white text-indigo-700 shadow-xs font-extrabold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="แสดงเปรียบเทียบทั้ง 2 ด้าน"
              >
                <Layers className="h-3.5 w-3.5 text-indigo-600" />
                <span>เปรียบเทียบทั้งหมด</span>
              </button>
            </div>

            {/* CHART & TABLE CUSTOMIZER BUTTON (OWNER / ADMIN) */}
            <button
              type="button"
              onClick={() => {
                if (!isOwnerOrAdmin && onRequestAdminLogin) {
                  onRequestAdminLogin("ปรับแต่งสีและเส้นตาราง / กราฟ S-Curve");
                } else {
                  setShowStyleModal(true);
                }
              }}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="ปรับแต่งสีตาราง, ชนิดเส้นตาราง และสีเส้นกราฟ S-Curve (โหมด Owner / Admin)"
            >
              <Palette className="h-3.5 w-3.5 text-indigo-600" />
              <span>ปรับแต่งสี/เส้นตาราง & กราฟ</span>
              {!isOwnerOrAdmin && <span className="text-[10px] bg-indigo-200 text-indigo-800 px-1 py-0.2 rounded font-mono">🔒</span>}
            </button>
          </div>
        </div>

        <div className="h-72 w-full text-xs">
          <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={200}>
            <LineChart data={chartData} margin={{ top: 15, right: 45, left: 15, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="#64748b"
                tickLine={false}
                dy={8}
                tick={{ fontSize: 11, fontWeight: 600 }}
                padding={{ left: 0, right: 25 }}
              />
              
              {chartMode === "physical" && (
                <YAxis
                  stroke="#64748b"
                  tickLine={false}
                  domain={[0, 100]}
                  unit="%"
                  ticks={[0, 20, 40, 60, 80, 100]}
                />
              )}

              {chartMode === "financial" && (
                <YAxis
                  stroke="#64748b"
                  tickLine={false}
                  tickFormatter={formatCompactMoney}
                />
              )}

              {chartMode === "both" && (
                <>
                  <YAxis
                    yAxisId="left"
                    stroke="#10b981"
                    tickLine={false}
                    domain={[0, 100]}
                    unit="%"
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#3b82f6"
                    tickLine={false}
                    tickFormatter={formatCompactMoney}
                  />
                </>
              )}

              <Tooltip content={<CustomChartTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />

              {/* LINES FOR PHYSICAL PROGRESS (%) */}
              {(chartMode === "physical" || chartMode === "both") && (
                <>
                  <Line
                    yAxisId={chartMode === "both" ? "left" : undefined}
                    type="monotone"
                    dataKey="แผนงานสะสมประจำเดือน (%)"
                    stroke={chartStyle.planPhysical.color}
                    strokeWidth={chartStyle.planPhysical.strokeWidth}
                    strokeDasharray={chartStyle.planPhysical.dashArray === "0" ? undefined : chartStyle.planPhysical.dashArray}
                    dot={{ r: chartStyle.planPhysical.strokeWidth + 1, fill: chartStyle.planPhysical.color }}
                    activeDot={{ r: chartStyle.planPhysical.strokeWidth + 3 }}
                  />
                  <Line
                    yAxisId={chartMode === "both" ? "left" : undefined}
                    type="monotone"
                    dataKey="ผลงานสะสมประจำเดือน (%)"
                    stroke={chartStyle.actualPhysical.color}
                    strokeWidth={chartStyle.actualPhysical.strokeWidth}
                    strokeDasharray={chartStyle.actualPhysical.dashArray === "0" ? undefined : chartStyle.actualPhysical.dashArray}
                    dot={{ r: chartStyle.actualPhysical.strokeWidth + 1, fill: chartStyle.actualPhysical.color, stroke: "#fff", strokeWidth: 2 }}
                    activeDot={{ r: chartStyle.actualPhysical.strokeWidth + 3 }}
                  />
                </>
              )}

              {/* LINES FOR FINANCIAL PROGRESS (BAHT) */}
              {(chartMode === "financial" || chartMode === "both") && (
                <>
                  <Line
                    yAxisId={chartMode === "both" ? "right" : undefined}
                    type="monotone"
                    dataKey="แผนการเงินสะสมประจำเดือน (บาท)"
                    stroke={chartStyle.planFinancial.color}
                    strokeWidth={chartStyle.planFinancial.strokeWidth}
                    strokeDasharray={chartStyle.planFinancial.dashArray === "0" ? undefined : chartStyle.planFinancial.dashArray}
                    dot={{ r: chartStyle.planFinancial.strokeWidth + 1, fill: chartStyle.planFinancial.color }}
                    activeDot={{ r: chartStyle.planFinancial.strokeWidth + 3 }}
                  />
                  <Line
                    yAxisId={chartMode === "both" ? "right" : undefined}
                    type="monotone"
                    dataKey="ผลการเงินสะสมประจำเดือน (บาท)"
                    stroke={chartStyle.actualFinancial.color}
                    strokeWidth={chartStyle.actualFinancial.strokeWidth}
                    strokeDasharray={chartStyle.actualFinancial.dashArray === "0" ? undefined : chartStyle.actualFinancial.dashArray}
                    dot={{ r: chartStyle.actualFinancial.strokeWidth + 1, fill: chartStyle.actualFinancial.color, stroke: "#fff", strokeWidth: 2 }}
                    activeDot={{ r: chartStyle.actualFinancial.strokeWidth + 3 }}
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CHART & TABLE STYLE CUSTOMIZATION MODAL (OWNER / ADMIN MODE) */}
      {showStyleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <Palette className="h-5 w-5 text-indigo-600" />
                  <span>ปรับแต่งสีและลักษณะเส้นตาราง / กราฟ S-Curve (โหมด Owner)</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  ปรับแต่งโทนสีตาราง และเส้นกราฟเพื่อการนำเสนอภาพรวมโครงการที่สวยงาม
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStyleModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* MODAL TABS */}
            <div className="flex border-b border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setStyleModalTab("chart")}
                className={`pb-2.5 px-4 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                  styleModalTab === "chart"
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <TrendingUp className="h-4 w-4" />
                <span>1. ปรับแต่งเส้นกราฟ S-Curve</span>
              </button>
              <button
                type="button"
                onClick={() => setStyleModalTab("table")}
                className={`pb-2.5 px-4 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                  styleModalTab === "table"
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <TableIcon className="h-4 w-4" />
                <span>2. ปรับแต่งสีตาราง (Table Theme)</span>
              </button>
            </div>

            {/* TAB 1: CHART CONFIGURATIONS */}
            {styleModalTab === "chart" && (
              <div className="space-y-4">
                {[
                  { key: "planPhysical", label: "1. เส้นแผนงานสะสม (%)" },
                  { key: "actualPhysical", label: "2. เส้นผลงานสะสม (%)" },
                  { key: "planFinancial", label: "3. เส้นแผนการเงินสะสม (บาท)" },
                  { key: "actualFinancial", label: "4. เส้นผลการเงินสะสม (บาท)" },
                ].map((item) => {
                  const cfg = chartStyle[item.key as keyof ChartStyleState];
                  const presetColors = ["#64748b", "#10b981", "#3b82f6", "#f59e0b", "#e11d48", "#8b5cf6", "#06b6d4", "#059669", "#d97706", "#2563eb", "#111827"];

                  return (
                    <div key={item.key} className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/70 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-sm">{item.label}</span>
                        {/* PREVIEW SAMPLE */}
                        <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-lg border border-slate-200">
                          <span className="text-xs text-slate-400 font-medium">ตัวอย่าง:</span>
                          <svg width="60" height="12" className="overflow-visible">
                            <line
                              x1="0"
                              y1="6"
                              x2="60"
                              y2="6"
                              stroke={cfg.color}
                              strokeWidth={cfg.strokeWidth}
                              strokeDasharray={cfg.dashArray === "0" ? undefined : cfg.dashArray}
                            />
                            <circle cx="30" cy="6" r={cfg.strokeWidth + 1} fill={cfg.color} />
                          </svg>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        {/* Color */}
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-600 block">เลือกสี (Color):</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={cfg.color}
                              onChange={(e) => {
                                const newStyle = {
                                  ...chartStyle,
                                  [item.key]: { ...cfg, color: e.target.value },
                                };
                                saveChartStyleToStorage(newStyle);
                              }}
                              className="w-8 h-8 rounded border border-slate-300 cursor-pointer p-0.5 bg-white"
                            />
                            <span className="text-xs font-mono font-semibold text-slate-700 uppercase">{cfg.color}</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {presetColors.map((color) => (
                              <button
                                key={color}
                                type="button"
                                onClick={() => {
                                  const newStyle = {
                                    ...chartStyle,
                                    [item.key]: { ...cfg, color },
                                  };
                                  saveChartStyleToStorage(newStyle);
                                }}
                                style={{ backgroundColor: color }}
                                className={`w-4 h-4 rounded-full border border-white shadow-2xs hover:scale-125 transition-all cursor-pointer ${
                                  cfg.color === color ? "ring-2 ring-offset-1 ring-slate-800" : ""
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Stroke Width */}
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-600 block">ความหนาเส้น (Thickness):</label>
                          <div className="flex gap-1 flex-wrap">
                            {[1.5, 2.5, 3, 4, 5].map((w) => (
                              <button
                                key={w}
                                type="button"
                                onClick={() => {
                                  const newStyle = {
                                    ...chartStyle,
                                    [item.key]: { ...cfg, strokeWidth: w },
                                  };
                                  saveChartStyleToStorage(newStyle);
                                }}
                                className={`px-2 py-1 rounded text-xs font-bold transition-all border cursor-pointer ${
                                  cfg.strokeWidth === w
                                    ? "bg-slate-900 text-white border-slate-900"
                                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                                }`}
                              >
                                {w}px
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Dash Array */}
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-600 block">รูปแบบเส้น (Style):</label>
                          <select
                            value={cfg.dashArray}
                            onChange={(e) => {
                              const newStyle = {
                                ...chartStyle,
                                [item.key]: { ...cfg, dashArray: e.target.value },
                              };
                              saveChartStyleToStorage(newStyle);
                            }}
                            className="w-full text-xs font-medium bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                          >
                            <option value="0">━━━ เส้นทึบ (Solid)</option>
                            <option value="4 4">┈ ┈ ┈ เส้นปรุ (Dashed)</option>
                            <option value="2 2">ㆍㆍㆍ เส้นจุด (Dotted)</option>
                            <option value="8 4">━  ━  ━ เส้นปรุยาว (Long Dash)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 2: TABLE THEME CONFIGURATIONS */}
            {styleModalTab === "table" && (
              <div className="space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium">
                  💡 เลือกปรับแต่งโทนสีพื้นหลังหัวกลุ่มงานในตาราง (แผนงาน / ผลงาน / ส่วนต่าง) เพื่อให้สอดคล้องกับสไตล์เอกสารนำเสนอ
                </div>

                {/* Preset Themes Quick Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">เลือกธีมสำเร็จรูป (Presets):</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        saveTableThemeToStorage(DEFAULT_TABLE_THEME);
                      }}
                      className="p-2 bg-white border border-slate-200 hover:border-emerald-500 rounded-xl text-left space-y-1 cursor-pointer transition-all hover:shadow-sm"
                    >
                      <div className="flex gap-1 h-3 rounded overflow-hidden">
                        <div className="w-1/3 bg-amber-200" />
                        <div className="w-1/3 bg-emerald-200" />
                        <div className="w-1/3 bg-sky-200" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-800 block">1. มาตรฐาน (ส้ม/เขียว/ฟ้า)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        saveTableThemeToStorage({
                          planHeaderBg: "#e0e7ff",
                          planHeaderFg: "#312e81",
                          planRowBg: "#eef2ff",
                          actualHeaderBg: "#c7d2fe",
                          actualHeaderFg: "#1e1b4b",
                          actualRowBg: "#f5f3ff",
                          varianceHeaderBg: "#fed7aa",
                          varianceHeaderFg: "#7c2d12",
                          varianceRowBg: "#fff7ed",
                        });
                      }}
                      className="p-2 bg-white border border-slate-200 hover:border-indigo-500 rounded-xl text-left space-y-1 cursor-pointer transition-all hover:shadow-sm"
                    >
                      <div className="flex gap-1 h-3 rounded overflow-hidden">
                        <div className="w-1/3 bg-indigo-200" />
                        <div className="w-1/3 bg-violet-200" />
                        <div className="w-1/3 bg-orange-200" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-800 block">2. อินดิโก & ม่วง</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        saveTableThemeToStorage({
                          planHeaderBg: "#e2e8f0",
                          planHeaderFg: "#0f172a",
                          planRowBg: "#f8fafc",
                          actualHeaderBg: "#cbd5e1",
                          actualHeaderFg: "#020617",
                          actualRowBg: "#f1f5f9",
                          varianceHeaderBg: "#94a3b8",
                          varianceHeaderFg: "#ffffff",
                          varianceRowBg: "#f8fafc",
                        });
                      }}
                      className="p-2 bg-white border border-slate-200 hover:border-slate-500 rounded-xl text-left space-y-1 cursor-pointer transition-all hover:shadow-sm"
                    >
                      <div className="flex gap-1 h-3 rounded overflow-hidden">
                        <div className="w-1/3 bg-slate-200" />
                        <div className="w-1/3 bg-slate-300" />
                        <div className="w-1/3 bg-slate-400" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-800 block">3. สเกลเทา คลาสสิก</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        saveTableThemeToStorage({
                          planHeaderBg: "#fbcfe8",
                          planHeaderFg: "#831843",
                          planRowBg: "#fdf2f8",
                          actualHeaderBg: "#bbf7d0",
                          actualHeaderFg: "#14532d",
                          actualRowBg: "#f0fdf4",
                          varianceHeaderBg: "#bfdbfe",
                          varianceHeaderFg: "#1e3a8a",
                          varianceRowBg: "#eff6ff",
                        });
                      }}
                      className="p-2 bg-white border border-slate-200 hover:border-rose-500 rounded-xl text-left space-y-1 cursor-pointer transition-all hover:shadow-sm"
                    >
                      <div className="flex gap-1 h-3 rounded overflow-hidden">
                        <div className="w-1/3 bg-rose-200" />
                        <div className="w-1/3 bg-emerald-200" />
                        <div className="w-1/3 bg-blue-200" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-800 block">4. ชมพู เขียว ฟ้า</span>
                    </button>
                  </div>
                </div>

                {/* Color Pickers for Theme */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  {/* Plan Theme */}
                  <div className="p-3 rounded-xl border border-slate-200 space-y-2 bg-slate-50">
                    <span className="font-bold text-xs text-slate-800 block">กลุ่ม 1: แผนงาน (Plan)</span>
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600">สีพื้นหัวกลุ่ม:</span>
                        <input
                          type="color"
                          value={tableTheme.planHeaderBg}
                          onChange={(e) => saveTableThemeToStorage({ ...tableTheme, planHeaderBg: e.target.value })}
                          className="w-7 h-7 rounded border border-slate-300 cursor-pointer"
                        />
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600">สีพื้นแถวสะสม:</span>
                        <input
                          type="color"
                          value={tableTheme.planRowBg}
                          onChange={(e) => saveTableThemeToStorage({ ...tableTheme, planRowBg: e.target.value })}
                          className="w-7 h-7 rounded border border-slate-300 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Actual Theme */}
                  <div className="p-3 rounded-xl border border-slate-200 space-y-2 bg-slate-50">
                    <span className="font-bold text-xs text-slate-800 block">กลุ่ม 2: ผลงาน (Actual)</span>
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600">สีพื้นหัวกลุ่ม:</span>
                        <input
                          type="color"
                          value={tableTheme.actualHeaderBg}
                          onChange={(e) => saveTableThemeToStorage({ ...tableTheme, actualHeaderBg: e.target.value })}
                          className="w-7 h-7 rounded border border-slate-300 cursor-pointer"
                        />
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600">สีพื้นแถวสะสม:</span>
                        <input
                          type="color"
                          value={tableTheme.actualRowBg}
                          onChange={(e) => saveTableThemeToStorage({ ...tableTheme, actualRowBg: e.target.value })}
                          className="w-7 h-7 rounded border border-slate-300 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Variance Theme */}
                  <div className="p-3 rounded-xl border border-slate-200 space-y-2 bg-slate-50">
                    <span className="font-bold text-xs text-slate-800 block">กลุ่ม 3: ส่วนต่าง (Variance)</span>
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600">สีพื้นหัวกลุ่ม:</span>
                        <input
                          type="color"
                          value={tableTheme.varianceHeaderBg}
                          onChange={(e) => saveTableThemeToStorage({ ...tableTheme, varianceHeaderBg: e.target.value })}
                          className="w-7 h-7 rounded border border-slate-300 cursor-pointer"
                        />
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600">สีพื้นแถวสะสม:</span>
                        <input
                          type="color"
                          value={tableTheme.varianceRowBg}
                          onChange={(e) => saveTableThemeToStorage({ ...tableTheme, varianceRowBg: e.target.value })}
                          className="w-7 h-7 rounded border border-slate-300 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* FOOTER ACTIONS */}
            <div className="flex justify-between items-center border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => {
                  resetChartStyleToDefault();
                  saveTableThemeToStorage(DEFAULT_TABLE_THEME);
                }}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>คืนค่าเริ่มต้น</span>
              </button>

              <button
                type="button"
                onClick={() => setShowStyleModal(false)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check className="h-4 w-4" />
                <span>ตกลง / ปิดหน้าต่าง</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODE TOP TOOLBAR */}
      {isEditing && (
        <div className="bg-emerald-50/70 border-2 border-emerald-500/30 rounded-2xl p-3 sm:p-4 space-y-3 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-200/60">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs sm:text-sm font-extrabold text-emerald-950">
                ✏️ โหมดปรับแก้ไขตาราง (กำลังแก้ไขข้อมูล {records.length} ครั้ง/งวด)
              </span>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-emerald-950 font-semibold text-xs select-none bg-white/90 px-3 py-1.5 rounded-xl border border-emerald-200 shadow-2xs">
              <input
                type="checkbox"
                checked={autoCalculate}
                onChange={(e) => {
                  setAutoCalculate(e.target.checked);
                  if (e.target.checked) {
                    const contractVal = project.contractAmount || project.budget || 0;
                    setRecords(recalculateCumulativeFields(records, contractVal));
                  }
                }}
                className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
              />
              <span>คำนวณสะสมอัตโนมัติ (Auto-sum cumulative)</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Action Group 1: Manage columns & data */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAddIteration}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                title="เพิ่มครั้งที่ใหม่ต่อท้ายตาราง"
              >
                <Plus className="h-4 w-4" />
                <span>เพิ่มครั้งที่ {records.length + 1}</span>
              </button>

              <button
                type="button"
                onClick={onRequestDeleteLastIteration}
                disabled={records.length <= 1}
                className="px-3 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                title="ลบครั้งที่ล่าสุด (งวดท้ายสุด)"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                <span>ลบครั้งที่ล่าสุด</span>
              </button>

              <button
                type="button"
                onClick={handleOpenClearModal}
                className="px-3 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="ล้างข้อมูลทั้งหมดในตารางหรือรีเซ็ตค่าเป็น 0"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                <span>ล้างข้อมูลตาราง</span>
              </button>
            </div>

            {/* Action Group 2: Automation helpers */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRecalculate}
                className="px-3 py-2 bg-white hover:bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="คำนวณสะสมของทุกแถวอัตโนมัติ"
              >
                <Calculator className="h-3.5 w-3.5 text-amber-600" />
                <span>คำนวณสะสมใหม่</span>
              </button>

              <button
                type="button"
                onClick={handleAutoRun30Days}
                className="px-3 py-2 bg-white hover:bg-sky-50 text-sky-800 border border-sky-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="คำนวณรันวันที่ทุกงวดอัตโนมัติ (30 วัน/งวด) เริ่มจากครั้งที่ 1"
              >
                <span>📅 รันวันที่อัตโนมัติ (30 วัน/งวด)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXCEL-STYLE PERIODIC PROGRESS TABLE WITH STICKY HEADERS & COLUMNS */}
      {(() => {
        const stdCol1Width = Math.max(120, Math.round(tableFontSize * 8.8));
        const stdCol2Width = Math.max(220, Math.round(tableFontSize * 16));
        const stdPeriodMinColWidth = Math.max(130, Math.round(tableFontSize * 9.8));

        const col1Style = {
          minWidth: `${stdCol1Width}px`,
          width: `${stdCol1Width}px`,
          ...(isColsPinned ? { left: 0 } : {}),
        };
        const col2Style = {
          minWidth: `${stdCol2Width}px`,
          width: `${stdCol2Width}px`,
          ...(isColsPinned ? { left: `${stdCol1Width}px` } : {}),
        };
        const col1StickyClass = isColsPinned
          ? "sticky left-0 z-20 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.15)]"
          : "relative";
        const col2StickyClass = isColsPinned
          ? "sticky z-10 shadow-[5px_0_10px_-2px_rgba(0,0,0,0.15)]"
          : "relative";
        const headerCol1StickyClass = isColsPinned
          ? "sticky top-0 left-0 z-40 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.15)]"
          : "relative";
        const headerCol2StickyClass = isColsPinned
          ? "sticky top-0 z-40 shadow-[5px_0_10px_-2px_rgba(0,0,0,0.15)]"
          : "relative";

        return (
          <div
            ref={mainTableRef}
            style={{ fontSize: `${tableFontSize}px` }}
            className="overflow-auto border-2 border-slate-300 rounded-xl shadow-sm bg-white relative z-10 [scrollbar-width:thin] [scrollbar-color:#94a3b8_#f1f5f9] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-track]:rounded-b-xl [&::-webkit-scrollbar-thumb]:bg-slate-400 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-500"
          >
            <table className="w-full border-collapse text-left relative font-['Sarabun',sans-serif]">
              <thead className="sticky top-0 z-30 bg-slate-200 shadow-xs">
                {/* Header Row 1: Iteration Titles */}
                <tr className="bg-slate-200 text-slate-900 border-b border-slate-300">
                  <th
                    rowSpan={4}
                    style={col1Style}
                    className={`p-3 font-semibold border-r-2 border-slate-400 bg-slate-200 text-slate-900 text-center align-middle ${headerCol1StickyClass} select-none text-sm`}
                  >
                    รายการหลัก
                  </th>
                  <th
                    rowSpan={4}
                    style={col2Style}
                    className={`p-3 font-semibold border-r-2 border-slate-400 bg-slate-200 text-slate-900 text-center align-middle ${headerCol2StickyClass} select-none text-sm`}
                  >
                    รายการย่อย
                  </th>
                  {records.map((rec, idx) => (
                    <th
                      key={`th-p-${idx}`}
                      style={{ minWidth: `${stdPeriodMinColWidth}px` }}
                      className="p-2.5 text-center font-semibold border-r border-slate-300 bg-slate-100 text-slate-800 text-sm"
                    >
                      งวดที่ {rec.periodNo}
                    </th>
                  ))}
                </tr>

                {/* Header Row 2: Date Header "วันที่" */}
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 text-xs">
                  {records.map((rec, idx) => (
                    <th key={`th-d1-${idx}`} className="p-1.5 text-center font-medium border-r border-slate-300">
                      {isEditing ? (
                        <input
                          type="date"
                          value={toInputDateFormat(rec.startDate)}
                          onChange={(e) => handleCellChange(idx, "startDate", e.target.value)}
                          className="w-full text-center px-1 py-0.5 border border-slate-300 rounded bg-white text-xs font-semibold focus:outline-emerald-500 tabular-nums cursor-pointer"
                        />
                      ) : (
                        <span className="text-slate-800 tabular-nums text-xs sm:text-[13px] font-medium">{formatDateDisplayTh(rec.startDate)}</span>
                      )}
                    </th>
                  ))}
                </tr>

                {/* Header Row 3: "ถึง" */}
                <tr className="bg-slate-100 text-slate-500 border-b border-slate-300 text-xs font-normal">
                  {records.map((_, idx) => (
                    <th key={`th-to-${idx}`} className="p-0.5 text-center font-normal border-r border-slate-300 text-slate-400 text-[11px]">
                      ถึง
                    </th>
                  ))}
                </tr>

                {/* Header Row 4: End Date "วันที่" */}
                <tr className="bg-slate-100 text-slate-700 border-b-2 border-slate-400 text-xs">
                  {records.map((rec, idx) => (
                    <th key={`th-d2-${idx}`} className="p-1.5 text-center font-medium border-r border-slate-300">
                      {isEditing ? (
                        <input
                          type="date"
                          value={toInputDateFormat(rec.endDate)}
                          onChange={(e) => handleCellChange(idx, "endDate", e.target.value)}
                          className="w-full text-center px-1 py-0.5 border border-slate-300 rounded bg-white text-xs font-semibold focus:outline-emerald-500 tabular-nums cursor-pointer"
                        />
                      ) : (
                        <span className="text-slate-800 tabular-nums text-xs sm:text-[13px] font-medium">{formatDateDisplayTh(rec.endDate)}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {/* GROUP 1: แผนงาน (PLAN) */}
                {/* Row 1: แผนงานประจำเดือน (%) */}
                <tr className="hover:bg-amber-50/20 transition-colors">
                  <td
                    rowSpan={4}
                    style={{ ...col1Style, backgroundColor: tableTheme.planHeaderBg, color: tableTheme.planHeaderFg }}
                    className={`p-3 font-bold border-r-2 border-slate-400 text-center align-middle ${col1StickyClass} select-none text-sm`}
                  >
                    แผนงาน
                  </td>
                  <td
                    style={col2Style}
                    className={`p-2.5 font-normal border-r-2 border-slate-400 text-slate-800 bg-white ${col2StickyClass}`}
                  >
                    แผนงานประจำเดือน (%)
                  </td>
                  {records.map((rec, idx) => (
                    <td key={`p-m-pct-${idx}`} className="p-2 border-r border-slate-300 text-right tabular-nums text-slate-800 font-normal">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={rec.planMonthlyPercent ?? ""}
                          onChange={(e) => handleCellChange(idx, "planMonthlyPercent", e.target.value)}
                          className="w-full text-right px-1.5 py-1 border border-slate-300 rounded bg-white tabular-nums focus:outline-emerald-500"
                        />
                      ) : (
                        formatPercent(rec.planMonthlyPercent)
                      )}
                    </td>
                  ))}
                </tr>

                {/* Row 2: แผนงานสะสมประจำเดือน (%) */}
                <tr style={{ backgroundColor: tableTheme.planRowBg }} className="font-semibold text-slate-900 border-b border-slate-300">
                  <td
                    style={{ ...col2Style, backgroundColor: tableTheme.planRowBg, color: tableTheme.planHeaderFg }}
                    className={`p-2.5 border-r-2 border-slate-400 font-semibold ${col2StickyClass}`}
                  >
                    แผนงานสะสมประจำเดือน (%)
                  </td>
                  {records.map((rec, idx) => (
                    <td key={`p-c-pct-${idx}`} className="p-2 border-r border-slate-300 text-right tabular-nums font-semibold text-amber-950">
                      {rec.planCumulativePercent !== undefined && rec.planCumulativePercent !== null && rec.planCumulativePercent !== ""
                        ? `${formatPercent(rec.planCumulativePercent)}%`
                        : "-"}
                    </td>
                  ))}
                </tr>

                {/* Row 3: แผนการเงินประจำเดือน (บาท) */}
                <tr className="hover:bg-amber-50/20 transition-colors">
                  <td
                    style={col2Style}
                    className={`p-2.5 font-normal border-r-2 border-slate-400 text-slate-800 bg-white ${col2StickyClass}`}
                  >
                    แผนการเงินประจำเดือน (บาท)
                  </td>
                  {records.map((rec, idx) => (
                    <td key={`p-m-amt-${idx}`} className="p-2 border-r border-slate-300 text-right tabular-nums text-slate-800 font-normal">
                      {isEditing ? (
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={rec.planMonthlyAmount ?? ""}
                          onChange={(e) => handleCellChange(idx, "planMonthlyAmount", e.target.value)}
                          className="w-full text-right px-1.5 py-1 border border-slate-300 rounded bg-white tabular-nums focus:outline-emerald-500"
                        />
                      ) : (
                        formatMoney(rec.planMonthlyAmount)
                      )}
                    </td>
                  ))}
                </tr>

                {/* Row 4: แผนการเงินสะสมประจำเดือน (บาท) */}
                <tr style={{ backgroundColor: tableTheme.planRowBg }} className="font-semibold text-slate-900 border-b-2 border-slate-400">
                  <td
                    style={{ ...col2Style, backgroundColor: tableTheme.planRowBg, color: tableTheme.planHeaderFg }}
                    className={`p-2.5 border-r-2 border-slate-400 font-semibold ${col2StickyClass}`}
                  >
                    แผนการเงินสะสมประจำเดือน (บาท)
                  </td>
                  {records.map((rec, idx) => (
                    <td key={`p-c-amt-${idx}`} className="p-2 border-r border-slate-300 text-right tabular-nums font-semibold text-amber-950">
                      {formatMoney(rec.planCumulativeAmount)}
                    </td>
                  ))}
                </tr>


                {/* GROUP 2: ผลงาน (ACTUAL) */}
                {/* Row 1: ผลงานประจำเดือน (%) */}
                <tr className="hover:bg-emerald-50/20 transition-colors">
                  <td
                    rowSpan={4}
                    style={{ ...col1Style, backgroundColor: tableTheme.actualHeaderBg, color: tableTheme.actualHeaderFg }}
                    className={`p-3 font-bold border-r-2 border-slate-400 text-center align-middle ${col1StickyClass} select-none text-sm`}
                  >
                    ผลงาน
                  </td>
                  <td
                    style={col2Style}
                    className={`p-2.5 font-normal border-r-2 border-slate-400 text-slate-800 bg-white ${col2StickyClass}`}
                  >
                    ผลงานประจำเดือน (%)
                  </td>
                  {records.map((rec, idx) => (
                    <td key={`a-m-pct-${idx}`} className="p-2 border-r border-slate-300 text-right tabular-nums text-slate-800 font-normal">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={rec.actualMonthlyPercent ?? ""}
                          onChange={(e) => handleCellChange(idx, "actualMonthlyPercent", e.target.value)}
                          className="w-full text-right px-1.5 py-1 border border-slate-300 rounded bg-white tabular-nums focus:outline-emerald-500"
                        />
                      ) : (
                        formatPercent(rec.actualMonthlyPercent)
                      )}
                    </td>
                  ))}
                </tr>

                {/* Row 2: ผลงานสะสมประจำเดือน (%) */}
                <tr style={{ backgroundColor: tableTheme.actualRowBg }} className="font-semibold border-b border-slate-300">
                  <td
                    style={{ ...col2Style, backgroundColor: tableTheme.actualRowBg, color: tableTheme.actualHeaderFg }}
                    className={`p-2.5 border-r-2 border-slate-400 font-semibold ${col2StickyClass}`}
                  >
                    ผลงานสะสมประจำเดือน (%)
                  </td>
                  {records.map((rec, idx) => (
                    <td key={`a-c-pct-${idx}`} className="p-2 border-r border-slate-300 text-right tabular-nums font-semibold text-emerald-950">
                      {rec.actualCumulativePercent !== undefined && rec.actualCumulativePercent !== null && rec.actualCumulativePercent !== ""
                        ? `${formatPercent(rec.actualCumulativePercent)}%`
                        : "-"}
                    </td>
                  ))}
                </tr>

                {/* Row 3: ผลการเงินประจำเดือน (บาท) - Fixed/read-only, linked from Disbursements */}
                <tr className="hover:bg-slate-100/60 transition-colors bg-slate-50">
                  <td
                    style={col2Style}
                    className={`p-2.5 font-normal border-r-2 border-slate-400 text-slate-800 bg-slate-100 ${col2StickyClass}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>ผลการเงินประจำเดือน (บาท)</span>
                      <span className="text-[10px] font-normal text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded font-sans shrink-0" title="ดึงเฉพาะงวดที่มีสถานะ 'เบิกจ่ายแล้ว' เท่านั้น">
                        ดึงจากงวดเบิกจ่าย
                      </span>
                    </div>
                  </td>
                  {records.map((rec, idx) => (
                    <td key={`a-m-amt-${idx}`} className="p-2 border-r border-slate-300 text-right tabular-nums font-normal text-slate-900 bg-slate-50/50">
                      {formatMoney(rec.actualMonthlyAmount)}
                    </td>
                  ))}
                </tr>

                {/* Row 4: ผลการเงินสะสมประจำเดือน (บาท) */}
                <tr style={{ backgroundColor: tableTheme.actualRowBg }} className="font-semibold border-b-2 border-slate-400">
                  <td
                    style={{ ...col2Style, backgroundColor: tableTheme.actualRowBg, color: tableTheme.actualHeaderFg }}
                    className={`p-2.5 border-r-2 border-slate-400 font-semibold ${col2StickyClass}`}
                  >
                    ผลการเงินสะสมประจำเดือน (บาท)
                  </td>
                  {records.map((rec, idx) => (
                    <td key={`a-c-amt-${idx}`} className="p-2 border-r border-slate-300 text-right tabular-nums font-semibold text-emerald-950">
                      {formatMoney(rec.actualCumulativeAmount)}
                    </td>
                  ))}
                </tr>

                {/* GROUP 3: ส่วนต่าง (VARIANCE) */}
                {/* Row 1: ส่วนต่างงานประจำเดือน (%) */}
                <tr className="hover:bg-sky-50/20 transition-colors">
                  <td
                    rowSpan={3}
                    style={{ ...col1Style, backgroundColor: tableTheme.varianceHeaderBg, color: tableTheme.varianceHeaderFg }}
                    className={`p-3 font-bold border-r-2 border-slate-400 text-center align-middle ${col1StickyClass} select-none text-sm`}
                  >
                    ส่วนต่าง
                  </td>
                  <td
                    style={col2Style}
                    className={`p-2.5 font-normal border-r-2 border-slate-400 text-slate-800 bg-white ${col2StickyClass}`}
                  >
                    ส่วนต่างงานประจำเดือน (%)
                  </td>
                  {records.map((rec, idx) => {
                    const diffM = (rec.actualMonthlyPercent ?? 0) - (rec.planMonthlyPercent ?? 0);
                    return (
                      <td
                        key={`d-m-pct-${idx}`}
                        className={`p-2 border-r border-slate-300 text-right tabular-nums font-normal ${
                          diffM > 0
                            ? "text-emerald-700 bg-emerald-50/50"
                            : diffM < 0
                            ? "text-rose-700 bg-rose-50/50"
                            : "text-slate-600"
                        }`}
                      >
                        {diffM > 0 ? `+${diffM.toFixed(2)}%` : `${diffM.toFixed(2)}%`}
                      </td>
                    );
                  })}
                </tr>

                {/* Row 2: ส่วนต่างงานสะสม (%) */}
                <tr style={{ backgroundColor: tableTheme.varianceRowBg }} className="font-semibold border-b border-slate-300">
                  <td
                    style={{ ...col2Style, backgroundColor: tableTheme.varianceRowBg, color: tableTheme.varianceHeaderFg }}
                    className={`p-2.5 border-r-2 border-slate-400 font-semibold ${col2StickyClass}`}
                  >
                    ส่วนต่างงานสะสม (%)
                  </td>
                  {records.map((rec, idx) => {
                    const diffC = (rec.actualCumulativePercent ?? 0) - (rec.planCumulativePercent ?? 0);
                    return (
                      <td
                        key={`d-c-pct-${idx}`}
                        className={`p-2 border-r border-slate-300 text-right tabular-nums font-semibold ${
                          diffC > 0
                            ? "text-emerald-900 bg-emerald-100/60"
                            : diffC < 0
                            ? "text-rose-900 bg-rose-100/60"
                            : "text-slate-800"
                        }`}
                      >
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{diffC > 0 ? `+${diffC.toFixed(2)}%` : `${diffC.toFixed(2)}%`}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-normal inline-block ${
                              diffC > 0
                                ? "bg-emerald-100 text-emerald-800"
                                : diffC < 0
                                ? "bg-rose-100 text-rose-800"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {diffC > 0 ? "เร็วกว่าแผน" : diffC < 0 ? "ช้ากว่าแผน" : "ตามแผน"}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Row 3: ส่วนต่างการเงินสะสม (บาท) */}
                <tr className="hover:bg-sky-50/20 transition-colors">
                  <td
                    style={col2Style}
                    className={`p-2.5 font-normal border-r-2 border-slate-400 text-slate-800 bg-white ${col2StickyClass}`}
                  >
                    ส่วนต่างการเงินสะสม (บาท)
                  </td>
                  {records.map((rec, idx) => {
                    const diffAmt = (rec.actualCumulativeAmount ?? 0) - (rec.planCumulativeAmount ?? 0);
                    return (
                      <td
                        key={`d-c-amt-${idx}`}
                        className={`p-2 border-r border-slate-300 text-right tabular-nums font-normal ${
                          diffAmt > 0
                            ? "text-emerald-700 bg-emerald-50/40"
                            : diffAmt < 0
                            ? "text-rose-700 bg-rose-50/40"
                            : "text-slate-600"
                        }`}
                      >
                        {diffAmt > 0 ? `+${formatMoney(diffAmt)}` : formatMoney(diffAmt)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Editing Toolbar Footer */}
      {isEditing && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between text-xs gap-2">
          <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
            <input
              type="checkbox"
              checked={autoCalculate}
              onChange={(e) => {
                setAutoCalculate(e.target.checked);
                if (e.target.checked) {
                  const contractVal = project.contractAmount || project.budget || 0;
                  setRecords(recalculateCumulativeFields(records, contractVal));
                }
              }}
              className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
            />
            <span>คำนวณสะสมอัตโนมัติ (Auto-sum cumulative values)</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenClearModal}
              className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors"
              title="ล้างข้อมูลทั้งหมดในตารางหรือรีเซ็ตค่าเป็น 0"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
              <span>ล้างข้อมูลตาราง</span>
            </button>
            <button
              type="button"
              onClick={handleAddIteration}
              className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>เพิ่มครั้งที่ {records.length + 1}</span>
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              disabled={isSaving}
              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              <span>ยกเลิก</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              <span>บันทึกตาราง</span>
            </button>
          </div>
        </div>
      )}

      {/* TABLE REMARKS / NOTES SECTION (หมายเหตุท้ายตาราง) */}
      <div className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200/80">
          <div className="flex items-center gap-2 flex-wrap">
            <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="text-xs font-bold text-slate-800">
              หมายเหตุท้ายตาราง (Table Notes & Remarks)
            </span>
            <span className="text-[10px] text-slate-500 font-normal hidden sm:inline">
              {remarksSortOrder === "asc"
                ? `(เรียงอัตโนมัติจากงวดที่ 1 ➔ ${remarks.length})`
                : "(เรียงข้อมูลล่าสุดอยู่ด้านบน)"}
            </span>
            {remarks.length > 0 && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-200">
                {remarks.length} รายการ
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Sort Order Toggle */}
            <button
              type="button"
              onClick={() => changeRemarksSortOrder(remarksSortOrder === "asc" ? "desc" : "asc")}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
              title={
                remarksSortOrder === "asc"
                  ? "ปัจจุบันเรียงจากงวดที่ 1 ➔ ล่าสุด (คลิกเพื่อสลับเป็นล่าสุดอยู่ด้านบน)"
                  : "ปัจจุบันเรียงล่าสุดอยู่ด้านบน (คลิกเพื่อสลับเป็นเรียงจากงวดที่ 1 2 ...)"
              }
            >
              <ArrowUpDown className="h-3 w-3 text-emerald-600" />
              <span className="text-[11px]">
                {remarksSortOrder === "asc" ? "งวดที่ 1 ➔ ล่าสุด" : "ล่าสุด ➔ งวดที่ 1"}
              </span>
            </button>

            {/* Font Size Scaling Controls */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => changeRemarksFontSize(remarksFontSize - 1)}
                disabled={remarksFontSize <= 9}
                className="px-1.5 py-1 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent rounded text-xs font-bold cursor-pointer transition-colors"
                title="ลดขนาดตัวอักษร (A-)"
              >
                A-
              </button>
              <span className="text-[11px] font-mono font-bold text-slate-700 px-1 min-w-[32px] text-center select-none" title="ขนาดตัวอักษรปัจจุบัน">
                {remarksFontSize}px
              </span>
              <button
                type="button"
                onClick={() => changeRemarksFontSize(remarksFontSize + 1)}
                disabled={remarksFontSize >= 32}
                className="px-1.5 py-1 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent rounded text-xs font-bold cursor-pointer transition-colors"
                title="เพิ่มขนาดตัวอักษร (A+)"
              >
                A+
              </button>
            </div>

            {/* Presentation Full Screen button */}
            <button
              type="button"
              onClick={() => toggleRemarksFullScreen()}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 active:bg-black text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="เปิดโหมดนำเสนอเต็มจอ (Full Screen Presentation)"
            >
              <Maximize2 className="h-3.5 w-3.5 text-amber-400" />
              <span>แสดงโหมดเต็มจอ</span>
            </button>

            {/* Add Remark button */}
            <button
              type="button"
              onClick={() => handleAddRemark()}
              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>เพิ่มรายการหมายเหตุ</span>
            </button>
          </div>
        </div>

        {processedRemarks.length === 0 ? (
          <div className="text-xs text-slate-400 italic py-3 text-center bg-white rounded-lg border border-dashed border-slate-200">
            ยังไม่มีรายการหมายเหตุเพิ่มเติม (กดปุ่ม "เพิ่มรายการหมายเหตุ" ด้านบนเพื่อเพิ่มข้อความ)
          </div>
        ) : (
          <div className="space-y-2.5">
            {processedRemarks.map((item) => {
              const origIdx = item.originalIndex;
              const isEditing = editingRemarkIndex === origIdx;
              return (
                <div
                  key={`remark-${origIdx}`}
                  className="p-3 bg-white border border-slate-200/90 rounded-lg shadow-2xs hover:border-slate-300 transition-all"
                >
                  {isEditing ? (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-700">
                        <span>แก้ไขข้อความหมายเหตุ (งวดที่ {item.periodNo})</span>
                        <span className="text-[10px] text-slate-400 font-normal">กด Ctrl+Enter เพื่อบันทึก</span>
                      </div>

                      {/* Visual WYSIWYG Remark Editor - Direct formatting without showing [color] tags */}
                      <VisualRemarkEditor
                        value={editingRemarkText}
                        onChange={setEditingRemarkText}
                        onSave={() => handleSaveRemark(origIdx)}
                        onCancel={() => setEditingRemarkIndex(null)}
                        fontSize={remarksFontSize}
                        theme="light"
                      />

                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => handleSaveRemark(origIdx)}
                          className="px-3.5 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-md font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>บันทึก</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingRemarkIndex(null)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-xs cursor-pointer transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                          <span>ยกเลิก</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                        <div
                          className="inline-flex items-center font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 rounded-md px-2.5 py-0.5 select-none transition-all shadow-2xs"
                          style={{
                            fontSize: `${Math.max(10, Math.round(remarksFontSize * 0.88))}px`,
                            lineHeight: 1.4,
                          }}
                        >
                          งวดที่ {item.periodNo}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEditRemark(origIdx)}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors cursor-pointer flex items-center gap-1 font-medium"
                            style={{ fontSize: `${Math.max(9, Math.round(remarksFontSize * 0.8))}px` }}
                            title="แก้ไขรายการหมายเหตุนี้"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">แก้ไข</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onRequestDeleteRemark(origIdx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer flex items-center gap-1 font-medium"
                            style={{ fontSize: `${Math.max(9, Math.round(remarksFontSize * 0.8))}px` }}
                            title="ลบรายการหมายเหตุนี้"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">ลบ</span>
                          </button>
                        </div>
                      </div>
                      <FormattedRemarkText
                        text={item.text}
                        theme="light"
                        style={{ fontSize: `${remarksFontSize}px`, lineHeight: 1.65 }}
                        className="text-slate-800 font-medium leading-relaxed break-words whitespace-pre-wrap pl-1 sm:pl-2 w-full"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FULL SCREEN PRESENTATION OVERLAY */}
      {isFullScreen && (
        <div
          className={`fixed inset-0 z-50 p-2 sm:p-3 md:p-4 transition-colors duration-200 flex flex-col h-screen overflow-hidden animate-in fade-in duration-150 ${
            fullScreenTheme === "dark" ? "bg-slate-950 text-slate-100" : "bg-slate-100 text-slate-900"
          }`}
        >
          {/* FLOATING QUICK BAR WHEN HEADER IS COLLAPSED */}
          {!showFullScreenHeader && (
            <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 bg-white/95 dark:bg-slate-900/95 p-1.5 rounded-full border border-slate-200 dark:border-slate-700 shadow-2xl backdrop-blur-md">
              <button
                type="button"
                onClick={() => setShowFullScreenHeader(true)}
                className="px-3.5 py-1.5 rounded-full bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <ChevronDown className="h-4 w-4" />
                <span>แสดงแถบเมนูนำเสนอ</span>
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullScreen();
                }}
                className="px-4 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
                title="ออกจากโหมดเต็มจอ (Esc)"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                <span>ออกจากโหมดเต็มจอ</span>
                <span className="px-1.5 py-0.2 text-[10px] font-mono bg-rose-800 rounded text-rose-100">Esc</span>
              </button>
            </div>
          )}

          {/* TOP PRESENTATION BAR */}
          {showFullScreenHeader && (
            <div
              className={`shrink-0 p-3 sm:p-4 mb-3 rounded-2xl border shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3 backdrop-blur-md transition-all duration-200 z-30 ${
                fullScreenTheme === "dark"
                  ? "bg-slate-900/95 border-slate-800 text-white"
                  : "bg-white/95 border-slate-200/90 text-slate-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-sm shrink-0">
                  <Tv className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      📺 โหมดนำเสนอเต็มจอ (Full Screen Presentation)
                    </span>
                    {project.contractAmount && (
                      <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400">
                        งบสัญญา: {formatMoney(project.contractAmount)} บาท
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg sm:text-xl font-extrabold mt-0.5">
                    ตารางแผนงานและผลงานรายครั้ง (Periodic Progress Table) - {project.sheetName}
                  </h2>
                </div>
              </div>

              {/* CONTROLS IN FULLSCREEN MODE */}
              <div className="flex flex-wrap items-center gap-2">
                {/* SECTION DISPLAY TOGGLES (GRAPH / TABLE / REMARKS) */}
                <div className={`flex items-center p-1 rounded-xl text-xs font-bold border ${
                  fullScreenTheme === "dark" 
                    ? "bg-slate-800/90 border-slate-700" 
                    : "bg-slate-100 border-slate-200/80"
                }`}>
                  <button
                    type="button"
                    onClick={() => setShowFullScreenGraph(!showFullScreenGraph)}
                    className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                      showFullScreenGraph
                        ? "bg-emerald-600 text-white shadow-2xs font-bold"
                        : fullScreenTheme === "dark"
                        ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 line-through opacity-60"
                        : "text-slate-500 hover:text-slate-800 hover:bg-white/60 line-through opacity-60"
                    }`}
                    title={showFullScreenGraph ? "คลิกเพื่อปิดกราฟ S-Curve" : "คลิกเพื่อเปิดแสดงกราฟ S-Curve"}
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span>กราฟ S-Curve</span>
                    {showFullScreenGraph ? <Check className="h-3 w-3 text-emerald-200 ml-0.5" /> : <X className="h-3 w-3 text-slate-400 ml-0.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFullScreenTable(!showFullScreenTable)}
                    className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                      showFullScreenTable
                        ? "bg-blue-600 text-white shadow-2xs font-bold"
                        : fullScreenTheme === "dark"
                        ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 line-through opacity-60"
                        : "text-slate-500 hover:text-slate-800 hover:bg-white/60 line-through opacity-60"
                    }`}
                    title={showFullScreenTable ? "คลิกเพื่อปิดตารางแผนงานและผลงาน" : "คลิกเพื่อเปิดแสดงตารางแผนงานและผลงาน"}
                  >
                    <TableIcon className="h-3.5 w-3.5" />
                    <span>ตาราง</span>
                    {showFullScreenTable ? <Check className="h-3 w-3 text-blue-200 ml-0.5" /> : <X className="h-3 w-3 text-slate-400 ml-0.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFullScreenRemarks(!showFullScreenRemarks)}
                    className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                      showFullScreenRemarks
                        ? "bg-indigo-600 text-white shadow-2xs font-bold"
                        : fullScreenTheme === "dark"
                        ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 line-through opacity-60"
                        : "text-slate-500 hover:text-slate-800 hover:bg-white/60 line-through opacity-60"
                    }`}
                    title={showFullScreenRemarks ? "คลิกเพื่อปิดหมายเหตุท้ายตาราง" : "คลิกเพื่อเปิดแสดงหมายเหตุท้ายตาราง"}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>หมายเหตุ</span>
                    {showFullScreenRemarks ? <Check className="h-3 w-3 text-indigo-200 ml-0.5" /> : <X className="h-3 w-3 text-slate-400 ml-0.5" />}
                  </button>
                </div>

                {/* GRAPH MODE SELECTOR */}
                {showFullScreenGraph && (
                  <div className={`flex p-1 rounded-xl text-xs font-bold border ${
                    fullScreenTheme === "dark" 
                      ? "bg-slate-800/90 border-slate-700" 
                      : "bg-slate-100 border-slate-200/80"
                  }`}>
                    <button
                      type="button"
                      onClick={() => setChartMode("physical")}
                      className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        chartMode === "physical"
                          ? "bg-emerald-600 text-white shadow-2xs font-bold"
                          : fullScreenTheme === "dark"
                          ? "text-slate-300 hover:text-white hover:bg-slate-700/60"
                          : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                      }`}
                      title="เปรียบเทียบ แผนงานสะสม (%) กับ ผลงานสะสม (%)"
                    >
                      <Percent className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="hidden sm:inline">แผน vs ผล (%)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartMode("financial")}
                      className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        chartMode === "financial"
                          ? "bg-blue-600 text-white shadow-2xs font-bold"
                          : fullScreenTheme === "dark"
                          ? "text-slate-300 hover:text-white hover:bg-slate-700/60"
                          : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                      }`}
                      title="เปรียบเทียบ แผนการเงินสะสม (บาท) กับ ผลการเงินสะสม (บาท)"
                    >
                      <Coins className="h-3.5 w-3.5 text-blue-400" />
                      <span className="hidden sm:inline">การเงิน (บาท)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartMode("both")}
                      className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        chartMode === "both"
                          ? "bg-indigo-600 text-white shadow-2xs font-bold"
                          : fullScreenTheme === "dark"
                          ? "text-slate-300 hover:text-white hover:bg-slate-700/60"
                          : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                      }`}
                      title="แสดงเปรียบเทียบทั้ง 2 ด้านพร้อมกัน (% และ บาท)"
                    >
                      <Layers className="h-3.5 w-3.5 text-indigo-400" />
                      <span className="hidden sm:inline">ทั้งหมด</span>
                    </button>
                  </div>
                )}

                {/* TABLE FONT SIZE SELECTOR (A- [N]px A+) */}
                {showFullScreenTable && (
                  <div className={`flex items-center gap-1.5 p-1 rounded-xl text-xs font-bold border ${
                    fullScreenTheme === "dark" ? "bg-slate-800/90 border-slate-700" : "bg-slate-100 border-slate-200/80"
                  }`}>
                    {/* Quick A- [N]px A+ Stepper */}
                    <div className={`flex items-center gap-1 rounded-lg px-2 py-0.5 border text-xs font-mono select-none ${
                      fullScreenTheme === "dark" ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-white border-slate-300/80 text-slate-800"
                    }`}>
                      <button
                        type="button"
                        onClick={() => changeTableFontSize(tableFontSize - 1)}
                        disabled={tableFontSize <= 10}
                        className="px-1 hover:text-emerald-500 disabled:opacity-30 cursor-pointer font-bold transition-colors"
                        title="ลดขนาดตัวอักษรในตาราง (A-)"
                      >
                        A-
                      </button>
                      <span className="text-xs font-bold text-amber-500 dark:text-amber-400 min-w-[34px] text-center">
                        {tableFontSize}px
                      </span>
                      <button
                        type="button"
                        onClick={() => changeTableFontSize(tableFontSize + 1)}
                        disabled={tableFontSize >= 32}
                        className="px-1 hover:text-emerald-500 disabled:opacity-30 cursor-pointer font-bold transition-colors"
                        title="เพิ่มขนาดตัวอักษรในตาราง (A+)"
                      >
                        A+
                      </button>
                    </div>
                  </div>
                )}

                {/* THEME TOGGLE (DARK / LIGHT) */}
                <button
                  type="button"
                  onClick={() => setFullScreenTheme(fullScreenTheme === "dark" ? "light" : "dark")}
                  className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    fullScreenTheme === "dark"
                      ? "bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                  title="สลับโหมดสว่าง / โหมดมืด สำหรับการฉายจอภาพนำเสนอ"
                >
                  {fullScreenTheme === "dark" ? (
                    <>
                      <Sun className="h-4 w-4 text-amber-400" />
                      <span className="hidden sm:inline">โหมดสว่าง</span>
                    </>
                  ) : (
                    <>
                      <Moon className="h-4 w-4 text-indigo-600" />
                      <span className="hidden sm:inline">โหมดมืด</span>
                    </>
                  )}
                </button>

                {/* HIDE HEADER BUTTON */}
                <button
                  type="button"
                  onClick={() => setShowFullScreenHeader(false)}
                  className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    fullScreenTheme === "dark"
                      ? "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                  title="ซ่อนแถบเมนูด้านบนชั่วคราวเพื่อขยายพื้นที่เต็มจอ"
                >
                  <ChevronUp className="h-4 w-4" />
                  <span className="hidden xl:inline">ซ่อนเมนู</span>
                </button>

                {/* EXIT FULL SCREEN BUTTON */}
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFullScreen();
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold rounded-xl text-xs sm:text-sm transition-all flex items-center gap-2 cursor-pointer shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-95 ring-2 ring-rose-500/30 select-none shrink-0"
                  title="คลิกเพื่อออกจากโหมดนำเสนอเต็มจอ (หรือกดปุ่ม Esc บนคีย์บอร์ด)"
                >
                  <Minimize2 className="h-4 w-4 shrink-0" />
                  <span>ออกจากโหมดเต็มจอ</span>
                  <span className="px-1.5 py-0.2 text-[10px] font-mono bg-rose-800/90 rounded border border-rose-400/40 text-rose-100">
                    Esc
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* BOTH GRAPH AND TABLE DISPLAYED SIMULTANEOUSLY */}
          <div className={`flex-1 min-h-0 flex flex-col gap-3 ${
            isGraphPinned ? "overflow-hidden" : "overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-400/60 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600/60 [&::-webkit-scrollbar-thumb]:rounded-full space-y-4"
          }`}>
            {/* ALL CLOSED PLACEHOLDER */}
            {!showFullScreenGraph && !showFullScreenTable && !showFullScreenRemarks && (
              <div className={`flex-1 flex flex-col items-center justify-center p-8 rounded-2xl border text-center my-auto ${
                fullScreenTheme === "dark"
                  ? "bg-slate-900/90 border-slate-800 text-slate-200"
                  : "bg-white/95 border-slate-200 text-slate-800 shadow-md"
              }`}>
                <div className="p-4 rounded-2xl bg-indigo-500/10 text-indigo-500 mb-3 border border-indigo-500/20">
                  <Tv className="h-10 w-10" />
                </div>
                <h3 className="text-lg font-bold mb-1">ปิดการแสดงผลทุกส่วนในโหมดเต็มจออยู่</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mb-5">
                  ท่านสามารถกดเปิดแสดงผลเฉพาะส่วนที่ต้องการนำเสนอด้านล่าง หรือเลือกจากแถบเมนูด้านบน
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowFullScreenGraph(true)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md transition-all hover:scale-105"
                  >
                    <TrendingUp className="h-4 w-4" />
                    <span>เปิดแสดงกราฟ S-Curve</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFullScreenTable(true)}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md transition-all hover:scale-105"
                  >
                    <TableIcon className="h-4 w-4" />
                    <span>เปิดแสดงตารางรายครั้ง</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFullScreenRemarks(true)}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md transition-all hover:scale-105"
                  >
                    <FileText className="h-4 w-4" />
                    <span>เปิดแสดงหมายเหตุท้ายตาราง</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowFullScreenGraph(true);
                      setShowFullScreenTable(true);
                      setShowFullScreenRemarks(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md transition-all hover:scale-105"
                  >
                    <Check className="h-4 w-4" />
                    <span>เปิดแสดงทั้งหมด</span>
                  </button>
                </div>
              </div>
            )}

            {/* SECTION 1: S-CURVE GRAPH */}
            {showFullScreenGraph && (
              <div className={`shrink-0 p-3 sm:p-4 rounded-2xl border transition-all duration-200 backdrop-blur-md w-full shadow-md flex flex-col ${
                fullScreenTheme === "dark"
                  ? (penaltyResult.isOverdue || penaltyResult.hasFinalInstallmentExceededContract)
                    ? "bg-slate-900/95 border-rose-800 text-slate-100"
                    : "bg-slate-900/95 border-slate-800 text-slate-100"
                  : (penaltyResult.isOverdue || penaltyResult.hasFinalInstallmentExceededContract)
                  ? "bg-rose-50/30 border-rose-200 text-slate-900"
                  : "bg-white/95 border-slate-200/90 text-slate-900"
              }`}>
                {/* CONTRACT OVERRUN ZONE CALLOUT BANNER IN FULLSCREEN */}
                {(penaltyResult.isOverdue || penaltyResult.hasFinalInstallmentExceededContract) && (
                  <div className={`mb-2.5 p-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 ${
                    penaltyResult.isExceedingCap
                      ? "bg-rose-600 text-white border-rose-700 animate-pulse"
                      : fullScreenTheme === "dark"
                      ? "bg-rose-950/80 text-rose-200 border-rose-800"
                      : "bg-rose-100 text-rose-900 border-rose-300"
                  }`}>
                    <div className="flex items-center gap-2">
                      <Scale className="h-4 w-4 shrink-0" />
                      <span className="text-xs font-bold">
                        ⚠️ โครงการเข้าสู่ช่วงเกินสัญญา: {penaltyResult.hasFinalInstallmentExceededContract && penaltyResult.lastPeriodEndDateStr
                          ? `ส่งมอบจริง (${formatDateDisplay(penaltyResult.lastPeriodEndDateStr)}) เกินกำหนดสัญญา คิดค่าปรับ ${penaltyResult.overdueDays} วัน (คิดค่าปรับสุทธิ ${penaltyResult.netChargeableDays} วัน)`
                          : `สิ้นสุดสัญญามาแล้ว ${penaltyResult.overdueDays} วัน (คิดค่าปรับสุทธิ ${penaltyResult.netChargeableDays} วัน)`}
                      </span>
                    </div>
                    <div className={`text-xs font-mono font-black px-2.5 py-0.5 rounded-lg border ${
                      fullScreenTheme === "dark"
                        ? "bg-slate-900 text-rose-300 border-rose-700"
                        : "bg-white text-rose-800 border-rose-200"
                    }`}>
                      ค่าปรับสะสม: {penaltyResult.totalFineAmount.toLocaleString()} บาท ({penaltyResult.finePercentOfBudget.toFixed(2)}%)
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 border-slate-200 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 font-extrabold text-sm sm:text-base">
                      <TrendingUp className="h-5 w-5 text-emerald-500" />
                      <span>
                        {chartMode === "physical" && "📈 กราฟเปรียบเทียบแนวโน้ม S-Curve: แผนงานสะสม (%) vs ผลงานสะสม (%)"}
                        {chartMode === "financial" && "💰 กราฟเปรียบเทียบแนวโน้ม S-Curve: แผนการเงินสะสม (บาท) vs ผลการเงินสะสม (บาท)"}
                        {chartMode === "both" && "📊 กราฟเปรียบเทียบแนวโน้มสะสมภาพรวม: แผนงาน/ผลงาน (%) & แผนการเงิน/ผลการเงิน (บาท)"}
                      </span>
                    </div>

                    {/* IN-CARD QUICK SELECTOR FOR FULLSCREEN MODE */}
                    <div className={`flex p-0.5 rounded-lg text-xs font-bold border ${
                      fullScreenTheme === "dark"
                        ? "bg-slate-800/80 border-slate-700"
                        : "bg-slate-100 border-slate-200"
                    }`}>
                      <button
                        type="button"
                        onClick={() => setChartMode("physical")}
                        className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer text-[11px] ${
                          chartMode === "physical"
                            ? "bg-emerald-600 text-white shadow-2xs font-bold"
                            : fullScreenTheme === "dark"
                            ? "text-slate-300 hover:text-white"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        title="แผนงาน vs ผลงานสะสม (%)"
                      >
                        <Percent className="h-3 w-3 text-emerald-400" />
                        <span>แผน vs ผล (%)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartMode("financial")}
                        className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer text-[11px] ${
                          chartMode === "financial"
                            ? "bg-blue-600 text-white shadow-2xs font-bold"
                            : fullScreenTheme === "dark"
                            ? "text-slate-300 hover:text-white"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        title="แผนการเงิน vs ผลการเงินสะสม (บาท)"
                      >
                        <Coins className="h-3 w-3 text-blue-400" />
                        <span>การเงิน (บาท)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartMode("both")}
                        className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer text-[11px] ${
                          chartMode === "both"
                            ? "bg-indigo-600 text-white shadow-2xs font-bold"
                            : fullScreenTheme === "dark"
                            ? "text-slate-300 hover:text-white"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        title="เปรียบเทียบทั้งหมด (% & บาท)"
                      >
                        <Layers className="h-3 w-3 text-indigo-400" />
                        <span>ทั้งหมด</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium hidden md:inline">
                      ({records.length} งวด)
                    </span>

                    {/* TOGGLE COMPACT / EXPAND HEIGHT BUTTON */}
                    <button
                      type="button"
                      onClick={() => setIsGraphCompact(!isGraphCompact)}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700"
                      title={isGraphCompact ? "คลิกเพื่อขยายขนาดกราฟ" : "คลิกเพื่อย่อขนาดกราฟเพื่อให้มีพื้นที่ดูตารางมากขึ้น"}
                    >
                      {isGraphCompact ? (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" />
                          <span>ขยายกราฟ</span>
                        </>
                      ) : (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" />
                          <span>ย่อกราฟ</span>
                        </>
                      )}
                    </button>

                    {/* CLOSE S-CURVE GRAPH BUTTON */}
                    <button
                      type="button"
                      onClick={() => setShowFullScreenGraph(false)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer border border-transparent hover:border-rose-500/20"
                      title="ปิดกราฟ S-Curve (สามารถเปิดใหม่ได้จากแถบเมนูด้านบน)"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

              {/* GRAPH CANVAS */}
              <div
                className={`w-full text-xs ${isResizingGraph ? "select-none" : "transition-[height] duration-200"}`}
                style={{
                  height: isGraphCompact ? "180px" : `${fullScreenGraphHeight}px`,
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 15, right: 45, left: 15, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={fullScreenTheme === "dark" ? "#334155" : "#e2e8f0"} vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke={fullScreenTheme === "dark" ? "#94a3b8" : "#64748b"}
                      tickLine={false}
                      dy={8}
                      tick={{ fontSize: 12, fontWeight: 700 }}
                      padding={{ left: 0, right: 25 }}
                    />
                    
                    {chartMode === "physical" && (
                      <YAxis
                        stroke={fullScreenTheme === "dark" ? "#94a3b8" : "#64748b"}
                        tickLine={false}
                        domain={[0, 100]}
                        unit="%"
                        ticks={[0, 20, 40, 60, 80, 100]}
                      />
                    )}

                    {chartMode === "financial" && (
                      <YAxis
                        stroke={fullScreenTheme === "dark" ? "#94a3b8" : "#64748b"}
                        tickLine={false}
                        tickFormatter={formatCompactMoney}
                      />
                    )}

                    {chartMode === "both" && (
                      <>
                        <YAxis
                          yAxisId="left"
                          stroke="#10b981"
                          tickLine={false}
                          domain={[0, 100]}
                          unit="%"
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke="#3b82f6"
                          tickLine={false}
                          tickFormatter={formatCompactMoney}
                        />
                      </>
                    )}

                    <Tooltip content={<CustomChartTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />

                    {/* LINES FOR PHYSICAL PROGRESS (%) */}
                    {(chartMode === "physical" || chartMode === "both") && (
                      <>
                        <Line
                          yAxisId={chartMode === "both" ? "left" : undefined}
                          type="monotone"
                          dataKey="แผนงานสะสมประจำเดือน (%)"
                          stroke={chartStyle.planPhysical.color}
                          strokeWidth={chartStyle.planPhysical.strokeWidth + 1}
                          strokeDasharray={chartStyle.planPhysical.dashArray === "0" ? undefined : chartStyle.planPhysical.dashArray}
                          dot={{ r: chartStyle.planPhysical.strokeWidth + 2, fill: chartStyle.planPhysical.color }}
                          activeDot={{ r: chartStyle.planPhysical.strokeWidth + 4 }}
                        />
                        <Line
                          yAxisId={chartMode === "both" ? "left" : undefined}
                          type="monotone"
                          dataKey="ผลงานสะสมประจำเดือน (%)"
                          stroke={chartStyle.actualPhysical.color}
                          strokeWidth={chartStyle.actualPhysical.strokeWidth + 1}
                          strokeDasharray={chartStyle.actualPhysical.dashArray === "0" ? undefined : chartStyle.actualPhysical.dashArray}
                          dot={{ r: chartStyle.actualPhysical.strokeWidth + 2, fill: chartStyle.actualPhysical.color, stroke: "#fff", strokeWidth: 2 }}
                          activeDot={{ r: chartStyle.actualPhysical.strokeWidth + 4 }}
                        />
                      </>
                    )}

                    {/* LINES FOR FINANCIAL PROGRESS (BAHT) */}
                    {(chartMode === "financial" || chartMode === "both") && (
                      <>
                        <Line
                          yAxisId={chartMode === "both" ? "right" : undefined}
                          type="monotone"
                          dataKey="แผนการเงินสะสมประจำเดือน (บาท)"
                          stroke={chartStyle.planFinancial.color}
                          strokeWidth={chartStyle.planFinancial.strokeWidth + 1}
                          strokeDasharray={chartStyle.planFinancial.dashArray === "0" ? undefined : chartStyle.planFinancial.dashArray}
                          dot={{ r: chartStyle.planFinancial.strokeWidth + 2, fill: chartStyle.planFinancial.color }}
                          activeDot={{ r: chartStyle.planFinancial.strokeWidth + 4 }}
                        />
                        <Line
                          yAxisId={chartMode === "both" ? "right" : undefined}
                          type="monotone"
                          dataKey="ผลการเงินสะสมประจำเดือน (บาท)"
                          stroke={chartStyle.actualFinancial.color}
                          strokeWidth={chartStyle.actualFinancial.strokeWidth + 1}
                          strokeDasharray={chartStyle.actualFinancial.dashArray === "0" ? undefined : chartStyle.actualFinancial.dashArray}
                          dot={{ r: chartStyle.actualFinancial.strokeWidth + 2, fill: chartStyle.actualFinancial.color, stroke: "#fff", strokeWidth: 2 }}
                          activeDot={{ r: chartStyle.actualFinancial.strokeWidth + 4 }}
                        />
                      </>
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* DRAGGABLE RESIZE HANDLE */}
              <div
                onMouseDown={handleResizeMouseDown}
                onTouchStart={handleResizeTouchStart}
                className={`w-full py-1 mt-1 flex items-center justify-center cursor-row-resize select-none transition-all rounded-b-xl group ${
                  isResizingGraph
                    ? "bg-indigo-500/20 text-indigo-600"
                    : fullScreenTheme === "dark"
                    ? "hover:bg-slate-800/80 text-slate-500 hover:text-indigo-400"
                    : "hover:bg-slate-100/90 text-slate-400 hover:text-indigo-600"
                }`}
                title="ดึงขึ้น-ลง เพื่อปรับขนาดความสูงของกราฟ (Drag to resize graph height)"
              >
                <div className={`flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-bold transition-all shadow-2xs border ${
                  isResizingGraph
                    ? "bg-indigo-600 text-white border-indigo-700 scale-105"
                    : fullScreenTheme === "dark"
                    ? "bg-slate-800/90 border-slate-700/80 text-slate-400 group-hover:text-slate-200 group-hover:border-indigo-500/50"
                    : "bg-slate-100/90 border-slate-300/80 text-slate-600 group-hover:text-indigo-700 group-hover:border-indigo-300"
                }`}>
                  <GripHorizontal className="h-3.5 w-3.5 text-indigo-500" />
                  <span>{isResizingGraph ? `ความสูง: ${fullScreenGraphHeight}px` : "ดึงเมาส์ปรับขนาดความสูงกราฟ"}</span>
                </div>
              </div>
            </div>
            )}

            {/* SECTION 2: PERIODIC PROGRESS TABLE */}
            {showFullScreenTable && (() => {
              const fsCol1Width = Math.max(120, Math.round(tableFontSize * 8.8));
              const fsCol2Width = Math.max(220, Math.round(tableFontSize * 16));
              const fsPeriodMinColWidth = Math.max(130, Math.round(tableFontSize * 9.8));

              const fsCol1Style = {
                minWidth: `${fsCol1Width}px`,
                width: `${fsCol1Width}px`,
                ...(isColsPinned ? { left: 0 } : {}),
              };
              const fsCol2Style = {
                minWidth: `${fsCol2Width}px`,
                width: `${fsCol2Width}px`,
                ...(isColsPinned ? { left: `${fsCol1Width}px` } : {}),
              };
              const fsCol1StickyClass = isColsPinned
                ? "sticky left-0 z-20 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.15)]"
                : "relative";
              const fsCol2StickyClass = isColsPinned
                ? "sticky z-10 shadow-[5px_0_10px_-2px_rgba(0,0,0,0.15)]"
                : "relative";
              const fsHeaderCol1StickyClass = isColsPinned
                ? "sticky top-0 left-0 z-40 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.15)]"
                : "relative";
              const fsHeaderCol2StickyClass = isColsPinned
                ? "sticky top-0 z-40 shadow-[5px_0_10px_-2px_rgba(0,0,0,0.15)]"
                : "relative";

              return (
                <div className={`p-3 sm:p-4 rounded-2xl border shadow-md flex flex-col gap-2 shrink-0 ${
                  fullScreenTheme === "dark"
                    ? "bg-slate-900 border-slate-800"
                    : "bg-white border-slate-200"
                }`}>
                  <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b pb-2 border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2 font-extrabold text-sm sm:text-base">
                      <TableIcon className="h-5 w-5 text-emerald-500 shrink-0" />
                      <span>ตารางแผนงานและผลงานรายครั้ง (Periodic Progress Table)</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                      {/* PIN / UNPIN TOGGLE BUTTON */}
                      <button
                        type="button"
                        onClick={toggleColsPinned}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          isColsPinned
                            ? fullScreenTheme === "dark"
                              ? "bg-indigo-950/80 text-indigo-300 border-indigo-700/80 hover:bg-indigo-900/90"
                              : "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                            : fullScreenTheme === "dark"
                              ? "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
                              : "bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200"
                        }`}
                        title={isColsPinned ? "กำลังตรึงหัวตาราง 2 คอลัมน์แรก (คลิกเพื่อเลิกตรึงให้เลื่อนอิสระ)" : "หัวตารางเลื่อนอิสระ (คลิกเพื่อตรึง 2 คอลัมน์แรก)"}
                      >
                        {isColsPinned ? (
                          <>
                            <Pin className="h-3.5 w-3.5 text-indigo-500 fill-indigo-500/20" />
                            <span>ตรึงรายการ</span>
                          </>
                        ) : (
                          <>
                            <PinOff className="h-3.5 w-3.5 text-slate-400" />
                            <span>เลื่อนอิสระ</span>
                          </>
                        )}
                      </button>

                      {/* TABLE FONT SIZE ADJUSTER (A- 14px A+) */}
                      <div
                        className={`flex items-center gap-1 rounded-lg px-2 py-0.5 border text-xs font-mono select-none ${
                          fullScreenTheme === "dark"
                            ? "bg-slate-800/90 border-slate-700 text-slate-200"
                            : "bg-slate-100 border-slate-300/80 text-slate-800"
                        }`}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => changeTableFontSize(tableFontSize - 1)}
                          disabled={tableFontSize <= 10}
                          className="px-1 hover:text-emerald-500 disabled:opacity-30 cursor-pointer font-bold transition-colors"
                          title="ลดขนาดตัวอักษรในตาราง (A-)"
                        >
                          A-
                        </button>
                        <span className="text-xs font-bold text-amber-500 dark:text-amber-400 min-w-[32px] text-center">
                          {tableFontSize}px
                        </span>
                        <button
                          type="button"
                          onClick={() => changeTableFontSize(tableFontSize + 1)}
                          disabled={tableFontSize >= 32}
                          className="px-1 hover:text-emerald-500 disabled:opacity-30 cursor-pointer font-bold transition-colors"
                          title="เพิ่มขนาดตัวอักษรในตาราง (A+)"
                        >
                          A+
                        </button>
                      </div>

                      <span className="text-xs text-slate-500 font-medium hidden md:inline">
                        (เลื่อนซ้าย-ขวาและขึ้น-ลงเพื่อดูครบทุกครั้ง/งวด)
                      </span>

                      {/* CLOSE TABLE BUTTON */}
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={() => setShowFullScreenTable(false)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer border border-transparent hover:border-rose-500/20"
                        title="ปิดตารางแผนงานและผลงาน (สามารถเปิดใหม่ได้จากแถบเมนูด้านบน)"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* EXCEL-STYLE TABLE IN FULLSCREEN */}
                  <div
                    ref={fullScreenTableRef}
                    style={{ fontSize: `${tableFontSize}px`, height: `${fullScreenTableHeight}px` }}
                    className={`border-2 rounded-xl shadow-xs relative z-10 overflow-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar]:w-3 ${
                      fullScreenTheme === "dark"
                        ? "[scrollbar-color:#64748b_#0f172a] [&::-webkit-scrollbar-track]:bg-slate-900 [&::-webkit-scrollbar-thumb]:bg-slate-600 hover:[&::-webkit-scrollbar-thumb]:bg-slate-500"
                        : "[scrollbar-color:#94a3b8_#f1f5f9] [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-400 hover:[&::-webkit-scrollbar-thumb]:bg-slate-500"
                    } ${
                      fullScreenTheme === "dark" ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-300 bg-white text-slate-900"
                    }`}
                  >
                    <table className="w-full border-collapse text-left relative font-['Sarabun',sans-serif]">
                      <thead className={`sticky top-0 z-30 shadow-xs ${
                        fullScreenTheme === "dark" ? "bg-slate-900" : "bg-slate-200"
                      }`}>
                        <tr className={fullScreenTheme === "dark" ? "bg-slate-800 text-slate-100 border-b border-slate-700" : "bg-slate-200 text-slate-900 border-b border-slate-300"}>
                          <th
                            rowSpan={4}
                            style={fsCol1Style}
                            className={`p-3 font-semibold border-r-2 text-center align-middle ${fsHeaderCol1StickyClass} select-none text-sm ${
                              fullScreenTheme === "dark" ? "border-slate-700 bg-slate-800 text-slate-100" : "border-slate-400 bg-slate-200 text-slate-900"
                            }`}
                          >
                            รายการหลัก
                          </th>
                          <th
                            rowSpan={4}
                            style={fsCol2Style}
                            className={`p-3 font-semibold border-r-2 text-center align-middle ${fsHeaderCol2StickyClass} select-none text-sm ${
                              fullScreenTheme === "dark" ? "border-slate-700 bg-slate-800 text-slate-100" : "border-slate-400 bg-slate-200 text-slate-900"
                            }`}
                          >
                            รายการย่อย
                          </th>
                          {records.map((rec, idx) => (
                            <th
                              key={`fs-th-p-${idx}`}
                              style={{ minWidth: `${fsPeriodMinColWidth}px` }}
                              className={`p-2.5 text-center font-semibold border-r text-sm ${
                                fullScreenTheme === "dark" ? "border-slate-700 bg-slate-800/80 text-slate-200" : "border-slate-300 bg-slate-100 text-slate-800"
                              }`}
                            >
                              งวดที่ {rec.periodNo}
                            </th>
                          ))}
                        </tr>

                        <tr className={fullScreenTheme === "dark" ? "bg-slate-900 text-slate-300 border-b border-slate-700" : "bg-slate-100 text-slate-700 border-b border-slate-300"}>
                          {records.map((rec, idx) => (
                            <th key={`fs-th-d1-${idx}`} className={`p-1.5 text-center font-medium border-r ${fullScreenTheme === "dark" ? "border-slate-700" : "border-slate-300"}`}>
                              <span className={`tabular-nums font-medium tracking-tight text-xs sm:text-[13px] ${fullScreenTheme === "dark" ? "text-slate-200" : "text-slate-800"}`}>{formatDateDisplayTh(rec.startDate)}</span>
                            </th>
                          ))}
                        </tr>

                        <tr className={fullScreenTheme === "dark" ? "bg-slate-900 text-slate-400 border-b border-slate-700 font-normal" : "bg-slate-100 text-slate-500 border-b border-slate-300 font-normal"}>
                          {records.map((_, idx) => (
                            <th key={`fs-th-to-${idx}`} className={`p-0.5 text-center font-normal border-r text-[11px] ${fullScreenTheme === "dark" ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-400"}`}>
                              ถึง
                            </th>
                          ))}
                        </tr>

                        <tr className={fullScreenTheme === "dark" ? "bg-slate-900 text-slate-300 border-b-2 border-slate-700" : "bg-slate-100 text-slate-700 border-b-2 border-slate-400"}>
                          {records.map((rec, idx) => (
                            <th key={`fs-th-d2-${idx}`} className={`p-1.5 text-center font-medium border-r ${fullScreenTheme === "dark" ? "border-slate-700" : "border-slate-300"}`}>
                              <span className={`tabular-nums font-medium tracking-tight text-xs sm:text-[13px] ${fullScreenTheme === "dark" ? "text-slate-200" : "text-slate-800"}`}>{formatDateDisplayTh(rec.endDate)}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody className={fullScreenTheme === "dark" ? "divide-y divide-slate-800" : "divide-y divide-slate-200"}>
                        {/* GROUP 1: แผนงาน (PLAN) */}
                        <tr>
                          <td
                            rowSpan={4}
                            style={{
                              ...fsCol1Style,
                              backgroundColor: fullScreenTheme === "dark" ? "#78350f" : tableTheme.planHeaderBg,
                              color: fullScreenTheme === "dark" ? "#fef3c7" : tableTheme.planHeaderFg,
                            }}
                            className={`p-3 font-bold border-r-2 border-slate-400 text-center align-middle ${fsCol1StickyClass} select-none text-sm`}
                          >
                            แผนงาน
                          </td>
                          <td
                            style={fsCol2Style}
                            className={`p-2.5 font-normal border-r-2 border-slate-400 ${fsCol2StickyClass} ${
                              fullScreenTheme === "dark" ? "bg-slate-900 text-slate-100" : "bg-white text-slate-800"
                            }`}
                          >
                            แผนงานประจำเดือน (%)
                          </td>
                          {records.map((rec, idx) => (
                            <td key={`fs-p-m-pct-${idx}`} className={`p-2 border-r text-right tabular-nums font-normal ${fullScreenTheme === "dark" ? "border-slate-800 text-slate-200" : "border-slate-300 text-slate-800"}`}>
                              {formatPercent(rec.planMonthlyPercent)}
                            </td>
                          ))}
                        </tr>

                        <tr style={{ backgroundColor: fullScreenTheme === "dark" ? "#451a03" : tableTheme.planRowBg }} className="font-semibold border-b border-slate-300">
                          <td
                            style={{
                              ...fsCol2Style,
                              backgroundColor: fullScreenTheme === "dark" ? "#451a03" : tableTheme.planRowBg,
                              color: fullScreenTheme === "dark" ? "#fef3c7" : tableTheme.planHeaderFg,
                            }}
                            className={`p-2.5 border-r-2 border-slate-400 font-semibold ${fsCol2StickyClass}`}
                          >
                            แผนงานสะสมประจำเดือน (%)
                          </td>
                          {records.map((rec, idx) => (
                            <td key={`fs-p-c-pct-${idx}`} className={`p-2 border-r text-right tabular-nums font-semibold ${fullScreenTheme === "dark" ? "border-slate-800 text-amber-200" : "border-slate-300 text-amber-950"}`}>
                              {rec.planCumulativePercent !== undefined && rec.planCumulativePercent !== null && rec.planCumulativePercent !== ""
                                ? `${formatPercent(rec.planCumulativePercent)}%`
                                : "-"}
                            </td>
                          ))}
                        </tr>

                        <tr>
                          <td
                            style={fsCol2Style}
                            className={`p-2.5 font-normal border-r-2 border-slate-400 ${fsCol2StickyClass} ${
                              fullScreenTheme === "dark" ? "bg-slate-900 text-slate-100" : "bg-white text-slate-800"
                            }`}
                          >
                            แผนการเงินประจำเดือน (บาท)
                          </td>
                          {records.map((rec, idx) => (
                            <td key={`fs-p-m-amt-${idx}`} className={`p-2 border-r text-right tabular-nums font-normal ${fullScreenTheme === "dark" ? "border-slate-800 text-slate-200" : "border-slate-300 text-slate-800"}`}>
                              {formatMoney(rec.planMonthlyAmount)}
                            </td>
                          ))}
                        </tr>

                        <tr style={{ backgroundColor: fullScreenTheme === "dark" ? "#451a03" : tableTheme.planRowBg }} className="font-semibold border-b-2 border-slate-400">
                          <td
                            style={{
                              ...fsCol2Style,
                              backgroundColor: fullScreenTheme === "dark" ? "#451a03" : tableTheme.planRowBg,
                              color: fullScreenTheme === "dark" ? "#fef3c7" : tableTheme.planHeaderFg,
                            }}
                            className={`p-2.5 border-r-2 border-slate-400 font-semibold ${fsCol2StickyClass}`}
                          >
                            แผนการเงินสะสมประจำเดือน (บาท)
                          </td>
                          {records.map((rec, idx) => (
                            <td key={`fs-p-c-amt-${idx}`} className={`p-2 border-r text-right tabular-nums font-semibold ${fullScreenTheme === "dark" ? "border-slate-800 text-amber-200" : "border-slate-300 text-amber-950"}`}>
                              {formatMoney(rec.planCumulativeAmount)}
                            </td>
                          ))}
                        </tr>

                        {/* GROUP 2: ผลงาน (ACTUAL) */}
                        <tr>
                          <td
                            rowSpan={4}
                            style={{
                              ...fsCol1Style,
                              backgroundColor: fullScreenTheme === "dark" ? "#064e3b" : tableTheme.actualHeaderBg,
                              color: fullScreenTheme === "dark" ? "#a7f3d0" : tableTheme.actualHeaderFg,
                            }}
                            className={`p-3 font-bold border-r-2 border-slate-400 text-center align-middle ${fsCol1StickyClass} select-none text-sm`}
                          >
                            ผลงาน
                          </td>
                          <td
                            style={fsCol2Style}
                            className={`p-2.5 font-normal border-r-2 border-slate-400 ${fsCol2StickyClass} ${
                              fullScreenTheme === "dark" ? "bg-slate-900 text-slate-100" : "bg-white text-slate-800"
                            }`}
                          >
                            ผลงานประจำเดือน (%)
                          </td>
                          {records.map((rec, idx) => (
                            <td key={`fs-a-m-pct-${idx}`} className={`p-2 border-r text-right tabular-nums font-normal ${fullScreenTheme === "dark" ? "border-slate-800 text-slate-200" : "border-slate-300 text-slate-800"}`}>
                              {formatPercent(rec.actualMonthlyPercent)}
                            </td>
                          ))}
                        </tr>

                        <tr style={{ backgroundColor: fullScreenTheme === "dark" ? "#022c22" : tableTheme.actualRowBg }} className="font-semibold border-b border-slate-300">
                          <td
                            style={{
                              ...fsCol2Style,
                              backgroundColor: fullScreenTheme === "dark" ? "#022c22" : tableTheme.actualRowBg,
                              color: fullScreenTheme === "dark" ? "#a7f3d0" : tableTheme.actualHeaderFg,
                            }}
                            className={`p-2.5 border-r-2 border-slate-400 font-semibold ${fsCol2StickyClass}`}
                          >
                            ผลงานสะสมประจำเดือน (%)
                          </td>
                          {records.map((rec, idx) => (
                            <td key={`fs-a-c-pct-${idx}`} className={`p-2 border-r text-right tabular-nums font-semibold ${fullScreenTheme === "dark" ? "border-slate-800 text-emerald-300" : "border-slate-300 text-emerald-950"}`}>
                              {rec.actualCumulativePercent !== undefined && rec.actualCumulativePercent !== null && rec.actualCumulativePercent !== ""
                                ? `${formatPercent(rec.actualCumulativePercent)}%`
                                : "-"}
                            </td>
                          ))}
                        </tr>

                        <tr>
                          <td
                            style={fsCol2Style}
                            className={`p-2.5 font-normal border-r-2 border-slate-400 ${fsCol2StickyClass} ${
                              fullScreenTheme === "dark" ? "bg-slate-900 text-slate-100" : "bg-white text-slate-800"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span>ผลการเงินประจำเดือน (บาท)</span>
                              <span className={`text-[10px] font-normal px-1.5 py-0.5 rounded shrink-0 ${
                                fullScreenTheme === "dark" ? "bg-slate-800 text-slate-400" : "bg-slate-200/80 text-slate-500"
                              }`} title="ดึงเฉพาะงวดที่มีสถานะ 'เบิกจ่ายแล้ว' เท่านั้น">
                                ดึงจากงวดเบิกจ่าย
                              </span>
                            </div>
                          </td>
                          {records.map((rec, idx) => (
                            <td key={`fs-a-m-amt-${idx}`} className={`p-2 border-r text-right tabular-nums font-normal ${fullScreenTheme === "dark" ? "border-slate-800 text-slate-200" : "border-slate-300 text-slate-800"}`}>
                              {formatMoney(rec.actualMonthlyAmount)}
                            </td>
                          ))}
                        </tr>

                        <tr style={{ backgroundColor: fullScreenTheme === "dark" ? "#022c22" : tableTheme.actualRowBg }} className="font-semibold border-b-2 border-slate-400">
                          <td
                            style={{
                              ...fsCol2Style,
                              backgroundColor: fullScreenTheme === "dark" ? "#022c22" : tableTheme.actualRowBg,
                              color: fullScreenTheme === "dark" ? "#a7f3d0" : tableTheme.actualHeaderFg,
                            }}
                            className={`p-2.5 border-r-2 border-slate-400 font-semibold ${fsCol2StickyClass}`}
                          >
                            ผลการเงินสะสมประจำเดือน (บาท)
                          </td>
                          {records.map((rec, idx) => (
                            <td key={`fs-a-c-amt-${idx}`} className={`p-2 border-r text-right tabular-nums font-semibold ${fullScreenTheme === "dark" ? "border-slate-800 text-emerald-300" : "border-slate-300 text-emerald-950"}`}>
                              {formatMoney(rec.actualCumulativeAmount)}
                            </td>
                          ))}
                        </tr>

                        {/* GROUP 3: ส่วนต่าง (VARIANCE) */}
                        <tr>
                          <td
                            rowSpan={3}
                            style={{
                              ...fsCol1Style,
                              backgroundColor: fullScreenTheme === "dark" ? "#0c4a6e" : tableTheme.varianceHeaderBg,
                              color: fullScreenTheme === "dark" ? "#bae6fd" : tableTheme.varianceHeaderFg,
                            }}
                            className={`p-3 font-bold border-r-2 border-slate-400 text-center align-middle ${fsCol1StickyClass} select-none text-sm`}
                          >
                            ส่วนต่าง
                          </td>
                          <td
                            style={fsCol2Style}
                            className={`p-2.5 font-normal border-r-2 border-slate-400 ${fsCol2StickyClass} ${
                              fullScreenTheme === "dark" ? "bg-slate-900 text-slate-100" : "bg-white text-slate-800"
                            }`}
                          >
                            ส่วนต่างงานประจำเดือน (%)
                          </td>
                          {records.map((rec, idx) => {
                            const diffM = (rec.actualMonthlyPercent ?? 0) - (rec.planMonthlyPercent ?? 0);
                            return (
                              <td
                                key={`fs-d-m-pct-${idx}`}
                                className={`p-2 border-r text-right tabular-nums font-normal ${
                                  fullScreenTheme === "dark" ? "border-slate-800" : "border-slate-300"
                                } ${
                                  diffM > 0
                                    ? "text-emerald-400"
                                    : diffM < 0
                                    ? "text-rose-400"
                                    : "text-slate-400"
                                }`}
                              >
                                {diffM > 0 ? `+${diffM.toFixed(2)}%` : `${diffM.toFixed(2)}%`}
                              </td>
                            );
                          })}
                        </tr>

                        <tr style={{ backgroundColor: fullScreenTheme === "dark" ? "#082f49" : tableTheme.varianceRowBg }} className="font-semibold border-b border-slate-300">
                          <td
                            style={{
                              ...fsCol2Style,
                              backgroundColor: fullScreenTheme === "dark" ? "#082f49" : tableTheme.varianceRowBg,
                              color: fullScreenTheme === "dark" ? "#bae6fd" : tableTheme.varianceHeaderFg,
                            }}
                            className={`p-2.5 border-r-2 border-slate-400 font-semibold ${fsCol2StickyClass}`}
                          >
                            ส่วนต่างงานสะสม (%)
                          </td>
                          {records.map((rec, idx) => {
                            const diffC = (rec.actualCumulativePercent ?? 0) - (rec.planCumulativePercent ?? 0);
                            return (
                              <td
                                key={`fs-d-c-pct-${idx}`}
                                className={`p-2 border-r text-right tabular-nums font-semibold ${
                                  fullScreenTheme === "dark" ? "border-slate-800" : "border-slate-300"
                                }`}
                              >
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className={diffC > 0 ? "text-emerald-400" : diffC < 0 ? "text-rose-400" : "text-slate-300"}>
                                    {diffC > 0 ? `+${diffC.toFixed(2)}%` : `${diffC.toFixed(2)}%`}
                                  </span>
                                  <span
                                    className={`text-[10px] px-1.5 py-0.2 rounded font-normal inline-block ${
                                      diffC > 0
                                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                        : diffC < 0
                                        ? "bg-rose-950 text-rose-300 border border-rose-800"
                                        : "bg-slate-800 text-slate-300"
                                    }`}
                                  >
                                    {diffC > 0 ? "เร็วกว่าแผน" : diffC < 0 ? "ช้ากว่าแผน" : "ตามแผน"}
                                  </span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>

                        <tr>
                          <td
                            style={fsCol2Style}
                            className={`p-2.5 font-normal border-r-2 border-slate-400 ${fsCol2StickyClass} ${
                              fullScreenTheme === "dark" ? "bg-slate-900 text-slate-100" : "bg-white text-slate-800"
                            }`}
                          >
                            ส่วนต่างการเงินสะสม (บาท)
                          </td>
                          {records.map((rec, idx) => {
                            const diffAmt = (rec.actualCumulativeAmount ?? 0) - (rec.planCumulativeAmount ?? 0);
                            return (
                              <td
                                key={`fs-d-c-amt-${idx}`}
                                className={`p-2 border-r text-right tabular-nums font-normal ${
                                  fullScreenTheme === "dark" ? "border-slate-800" : "border-slate-300"
                                } ${
                                  diffAmt > 0
                                    ? "text-emerald-400"
                                    : diffAmt < 0
                                    ? "text-rose-400"
                                    : "text-slate-400"
                                }`}
                              >
                                {diffAmt > 0 ? `+${formatMoney(diffAmt)}` : formatMoney(diffAmt)}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* BOTTOM RESIZE BAR UNDER TABLE */}
                  <div
                    onMouseDown={handleTableResizeMouseDown}
                    onTouchStart={handleTableResizeTouchStart}
                    className="w-full pt-1.5 pb-0.5 cursor-row-resize flex items-center justify-center group select-none transition-all"
                    title="คลิกดึงขึ้น-ลง เพื่อปรับขนาดความสูงของตาราง (สิ้นสุดที่ขอบท้ายตาราง)"
                  >
                    <div className={`h-1.5 w-28 rounded-full transition-all group-hover:w-52 group-hover:h-2 ${
                      isResizingTable ? "bg-emerald-500 w-56 h-2 shadow-xs" : fullScreenTheme === "dark" ? "bg-slate-700 group-hover:bg-emerald-500" : "bg-slate-300 group-hover:bg-emerald-500 shadow-2xs"
                    }`} />
                  </div>
                </div>
              );
            })()}

            {/* REMARKS IN FULLSCREEN MODE */}
            {showFullScreenRemarks && (
            <div
              className={`p-3 sm:p-3.5 rounded-xl border shadow-xs flex flex-col relative overflow-hidden transition-none shrink-0 ${
                fullScreenTheme === "dark"
                  ? "bg-slate-900/90 border-slate-800 text-slate-200"
                  : "bg-slate-50/90 border-slate-200 text-slate-800"
              }`}
            >
              {/* CLEAN HEADER */}
              <div
                className={`w-full px-1 pb-2 mb-2 border-b flex items-center justify-between select-none shrink-0 ${
                  fullScreenTheme === "dark" ? "border-slate-800" : "border-slate-200/80"
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="text-xs sm:text-sm font-bold">
                    หมายเหตุท้ายตาราง (Table Notes & Remarks)
                  </span>
                  <span className="text-[10px] opacity-70 font-normal hidden sm:inline">
                    {remarksSortOrder === "asc"
                      ? `(เรียงจากงวดที่ 1 ➔ ${remarks.length})`
                      : "(เรียงข้อมูลล่าสุดอยู่ด้านบน)"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Sort Order toggle */}
                  <button
                    type="button"
                    onClick={() => changeRemarksSortOrder(remarksSortOrder === "asc" ? "desc" : "asc")}
                    className="flex items-center gap-1 bg-white/20 dark:bg-slate-800/80 rounded px-1.5 py-0.5 border border-slate-300/30 text-[11px] font-semibold hover:bg-white/30 cursor-pointer transition-colors"
                    title={
                      remarksSortOrder === "asc"
                        ? "ปัจจุบันเรียงจากงวดที่ 1 ➔ ล่าสุด (คลิกเพื่อสลับเป็นล่าสุดอยู่ด้านบน)"
                        : "ปัจจุบันเรียงล่าสุดอยู่ด้านบน (คลิกเพื่อสลับเป็นเรียงจากงวดที่ 1 2 ...)"
                    }
                  >
                    <ArrowUpDown className="h-3 w-3 text-emerald-400" />
                    <span className="hidden sm:inline">
                      {remarksSortOrder === "asc" ? "งวดที่ 1 ➔ ล่าสุด" : "ล่าสุด ➔ งวดที่ 1"}
                    </span>
                  </button>

                  {/* Quick font sizing in table fullscreen remarks */}
                  <div
                    className="flex items-center gap-1 bg-white/20 dark:bg-slate-800/80 rounded px-1.5 py-0.5 border border-slate-300/30 text-xs font-mono"
                  >
                    <button
                      type="button"
                      onClick={() => changeRemarksFontSize(remarksFontSize - 1)}
                      disabled={remarksFontSize <= 9}
                      className="px-1 hover:text-emerald-400 disabled:opacity-30 cursor-pointer font-bold"
                      title="ลดขนาดตัวอักษร (A-)"
                    >
                      A-
                    </button>
                    <span className="text-[10px] font-bold text-amber-400 min-w-[28px] text-center select-none">
                      {remarksFontSize}px
                    </span>
                    <button
                      type="button"
                      onClick={() => changeRemarksFontSize(remarksFontSize + 1)}
                      disabled={remarksFontSize >= 32}
                      className="px-1 hover:text-emerald-400 disabled:opacity-30 cursor-pointer font-bold"
                      title="เพิ่มขนาดตัวอักษร (A+)"
                    >
                      A+
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleRemarksFullScreen()}
                    className="p-1 hover:text-amber-400 hover:bg-white/10 rounded cursor-pointer transition-colors"
                    title="เปิดโหมดเต็มจอเฉพาะหมายเหตุ (Dedicated Remarks Fullscreen)"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>

                  {/* CLOSE REMARKS BUTTON */}
                  <button
                    type="button"
                    onClick={() => setShowFullScreenRemarks(false)}
                    className="p-1 hover:text-rose-400 hover:bg-rose-500/20 text-slate-400 rounded cursor-pointer transition-colors border border-transparent hover:border-rose-500/30"
                    title="ปิดหมายเหตุท้ายตาราง (สามารถเปิดใหม่ได้จากแถบเมนูด้านบน)"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div
                style={{ height: `${fullScreenRemarksHeight}px` }}
                className={`overflow-y-auto pr-1.5 space-y-2.5 my-0.5 ${
                  fullScreenTheme === "dark"
                    ? "[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-track]:bg-slate-800/50 [&::-webkit-scrollbar-thumb]:rounded-full"
                    : "[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-200/50 [&::-webkit-scrollbar-thumb]:rounded-full"
                }`}
              >
                {processedRemarks.length === 0 ? (
                  <div
                    className={`text-xs italic py-4 text-center rounded-lg border border-dashed ${
                      fullScreenTheme === "dark"
                        ? "text-slate-400 bg-slate-900/50 border-slate-800"
                        : "text-slate-400 bg-white/80 border-slate-200"
                    }`}
                  >
                    ยังไม่มีรายการหมายเหตุเพิ่มเติม
                  </div>
                ) : (
                  processedRemarks.map((item, idx) => (
                    <div
                      key={`fs-rem-${idx}`}
                      className={`p-3 rounded-lg border shadow-2xs ${
                        fullScreenTheme === "dark"
                          ? "bg-slate-800/80 border-slate-700/80 text-slate-200"
                          : "bg-white border-slate-200/90 text-slate-800"
                      }`}
                    >
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-200/40 dark:border-slate-800/60">
                          <div
                            className={`inline-flex items-center font-bold rounded-md px-2.5 py-0.5 select-none border transition-all ${
                              fullScreenTheme === "dark"
                                ? "bg-emerald-950/80 text-emerald-400 border-emerald-800/80"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                            }`}
                            style={{
                              fontSize: `${Math.max(9, Math.round(remarksFontSize * 0.85))}px`,
                              lineHeight: 1.4,
                            }}
                          >
                            งวดที่ {item.periodNo}
                          </div>
                        </div>
                        <FormattedRemarkText
                          text={item.text}
                          theme={fullScreenTheme === "dark" ? "dark" : "light"}
                          style={{ fontSize: `${remarksFontSize}px`, lineHeight: 1.6 }}
                          className="font-medium leading-relaxed break-words whitespace-pre-wrap w-full pl-1 sm:pl-2"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* BOTTOM RESIZE BAR UNDER REMARKS */}
              <div
                onMouseDown={handleRemarksResizeMouseDown}
                onTouchStart={handleRemarksResizeTouchStart}
                className="w-full pt-1.5 pb-0.5 cursor-row-resize flex items-center justify-center group select-none transition-all"
                title="คลิกดึงขึ้น-ลง เพื่อปรับขนาดความสูงของหมายเหตุท้ายตาราง"
              >
                <div className={`h-1.5 w-28 rounded-full transition-all group-hover:w-52 group-hover:h-2 ${
                  isResizingRemarks ? "bg-emerald-500 w-56 h-2 shadow-xs" : fullScreenTheme === "dark" ? "bg-slate-700 group-hover:bg-emerald-500" : "bg-slate-300 group-hover:bg-emerald-500 shadow-2xs"
                }`} />
              </div>
            </div>
            )}
          </div>
        </div>
      )}

      {/* DEDICATED FULL SCREEN PRESENTATION MODAL FOR TABLE REMARKS & NOTES */}
      {isRemarksFullScreen && (
        <div
          className={`fixed inset-0 z-[110] flex flex-col h-screen overflow-hidden animate-in fade-in duration-150 select-text ${
            remarksTheme === "dark"
              ? "bg-slate-950 text-slate-100"
              : remarksTheme === "navy"
              ? "bg-[#0B1528] text-slate-100"
              : "bg-slate-100 text-slate-900"
          }`}
        >
          {/* STICKY PRESENTATION HEADER */}
          <div
            className={`px-3 sm:px-6 py-2.5 sm:py-3 border-b flex flex-wrap items-center justify-between gap-3 shadow-md shrink-0 ${
              remarksTheme === "dark"
                ? "bg-slate-900/95 border-slate-800 text-slate-100"
                : remarksTheme === "navy"
                ? "bg-[#111F38]/95 border-[#1D2E4E] text-white"
                : "bg-white/95 border-slate-200 text-slate-900"
            }`}
          >
            {/* Title & Project Info */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-bold text-sm sm:text-base tracking-tight">
                    หมายเหตุท้ายตาราง (Table Notes & Remarks)
                  </h2>
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {filteredRemarks.length} {filteredRemarks.length !== remarks.length ? `/ ${remarks.length}` : ""} รายการ
                  </span>
                  <span className="text-[11px] opacity-70 hidden md:inline">
                    {remarksSortOrder === "asc"
                      ? `(เรียงจากงวดที่ 1 ➔ ${remarks.length})`
                      : "(เรียงข้อมูลล่าสุดอยู่ด้านบน)"}
                  </span>
                </div>
                {(project.projectName || project.locationName) && (
                  <p className="text-xs opacity-75 truncate max-w-md">
                    {project.projectName || project.locationName}
                  </p>
                )}
              </div>
            </div>

            {/* Controls Bar: Search + Sort + Font Size + Layout + Theme + Actions */}
            <div className="flex items-center gap-2 flex-wrap ml-auto">
              {/* Search Filter */}
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
                  remarksTheme === "dark"
                    ? "bg-slate-800/80 border-slate-700 text-slate-200"
                    : remarksTheme === "navy"
                    ? "bg-[#1B2B4A] border-[#293E66] text-slate-100"
                    : "bg-slate-50 border-slate-300 text-slate-800"
                }`}
              >
                <Search className="h-3.5 w-3.5 opacity-60 shrink-0" />
                <input
                  type="text"
                  value={remarksSearchQuery}
                  onChange={(e) => setRemarksSearchQuery(e.target.value)}
                  placeholder="ค้นหาข้อความ..."
                  className="bg-transparent border-0 outline-none text-xs w-28 sm:w-36 placeholder:opacity-50"
                />
                {remarksSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setRemarksSearchQuery("")}
                    className="opacity-60 hover:opacity-100 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Sort Order Toggle */}
              <button
                type="button"
                onClick={() => changeRemarksSortOrder(remarksSortOrder === "asc" ? "desc" : "asc")}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors shadow-2xs ${
                  remarksTheme === "dark"
                    ? "bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700"
                    : remarksTheme === "navy"
                    ? "bg-[#1B2B4A] border-[#293E66] text-slate-100 hover:bg-[#253B64]"
                    : "bg-white border-slate-300 text-slate-800 hover:bg-slate-50"
                }`}
                title={
                  remarksSortOrder === "asc"
                    ? "ปัจจุบันเรียงจากงวดที่ 1 ➔ ล่าสุด (คลิกเพื่อสลับเป็นล่าสุดอยู่ด้านบน)"
                    : "ปัจจุบันเรียงล่าสุดอยู่ด้านบน (คลิกเพื่อสลับเป็นเรียงจากงวดที่ 1 2 ...)"
                }
              >
                <ArrowUpDown className="h-3.5 w-3.5 text-emerald-400" />
                <span className="hidden sm:inline">
                  {remarksSortOrder === "asc" ? "งวดที่ 1 ➔ ล่าสุด" : "ล่าสุด ➔ งวดที่ 1"}
                </span>
              </button>

              {/* Font Size Adjuster for Presentation */}
              <div
                className={`flex items-center gap-1 p-1 rounded-lg border shadow-xs ${
                  remarksTheme === "dark"
                    ? "bg-slate-800/90 border-slate-700"
                    : remarksTheme === "navy"
                    ? "bg-[#1B2B4A] border-[#293E66]"
                    : "bg-white border-slate-300"
                }`}
              >
                <span className="text-[10px] font-bold opacity-75 px-1.5 flex items-center gap-1 hidden xl:flex">
                  <Type className="h-3.5 w-3.5 text-emerald-400" />
                  <span>ขนาดอักษร:</span>
                </span>
                <button
                  type="button"
                  onClick={() => changeRemarksFontSize(remarksFontSize - 1)}
                  disabled={remarksFontSize <= 9}
                  className="px-2 py-1 rounded text-xs font-bold hover:bg-emerald-500/20 hover:text-emerald-400 disabled:opacity-30 cursor-pointer transition-colors"
                  title="ลดขนาดตัวอักษร (A- หรือคีย์ -)"
                >
                  A-
                </button>

                {/* Preset quick buttons */}
                <div className="flex items-center gap-0.5">
                  {[
                    { label: "ย่อ", size: 11 },
                    { label: "เล็ก", size: 13 },
                    { label: "ปกติ", size: 15 },
                    { label: "ใหญ่", size: 18 },
                    { label: "ใหญ่มาก", size: 22 },
                    { label: "ยักษ์", size: 26 },
                  ].map((p) => (
                    <button
                      key={p.size}
                      type="button"
                      onClick={() => changeRemarksFontSize(p.size)}
                      className={`px-1.5 py-0.5 text-[10px] font-semibold rounded cursor-pointer transition-all ${
                        remarksFontSize === p.size
                          ? "bg-emerald-600 text-white shadow-2xs font-bold"
                          : "opacity-70 hover:opacity-100 hover:bg-emerald-500/10"
                      }`}
                      title={`ปรับเป็นขนาด ${p.label} (${p.size}px)`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => changeRemarksFontSize(remarksFontSize + 1)}
                  disabled={remarksFontSize >= 32}
                  className="px-2 py-1 rounded text-xs font-bold hover:bg-emerald-500/20 hover:text-emerald-400 disabled:opacity-30 cursor-pointer transition-colors"
                  title="เพิ่มขนาดตัวอักษร (A+ หรือคีย์ +)"
                >
                  A+
                </button>

                <span className="font-mono text-xs font-bold text-amber-400 px-1.5 select-none min-w-[34px] text-center">
                  {remarksFontSize}px
                </span>
              </div>

              {/* Layout Switcher (Single Column vs 2-Col Grid) */}
              <div
                className={`flex items-center p-0.5 rounded-lg border hidden sm:flex ${
                  remarksTheme === "dark"
                    ? "bg-slate-800/80 border-slate-700"
                    : remarksTheme === "navy"
                    ? "bg-[#1B2B4A] border-[#293E66]"
                    : "bg-white border-slate-300"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setRemarksLayout("single")}
                  className={`p-1.5 rounded cursor-pointer transition-colors ${
                    remarksLayout === "single"
                      ? "bg-emerald-600 text-white"
                      : "opacity-60 hover:opacity-100"
                  }`}
                  title="แสดงแบบแถวเดี่ยว (Single Column)"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setRemarksLayout("grid")}
                  className={`p-1.5 rounded cursor-pointer transition-colors ${
                    remarksLayout === "grid"
                      ? "bg-emerald-600 text-white"
                      : "opacity-60 hover:opacity-100"
                  }`}
                  title="แสดงแบบตารางการ์ด 2 คอลัมน์ (2-Columns Grid)"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Theme Switcher */}
              <div
                className={`flex items-center p-0.5 rounded-lg border ${
                  remarksTheme === "dark"
                    ? "bg-slate-800/80 border-slate-700"
                    : remarksTheme === "navy"
                    ? "bg-[#1B2B4A] border-[#293E66]"
                    : "bg-white border-slate-300"
                }`}
              >
                <button
                  type="button"
                  onClick={() => changeRemarksTheme("light")}
                  className={`p-1.5 rounded cursor-pointer transition-colors ${
                    remarksTheme === "light"
                      ? "bg-amber-500 text-white"
                      : "opacity-60 hover:opacity-100"
                  }`}
                  title="โหมดสว่าง (Light Theme)"
                >
                  <Sun className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => changeRemarksTheme("dark")}
                  className={`p-1.5 rounded cursor-pointer transition-colors ${
                    remarksTheme === "dark"
                      ? "bg-indigo-600 text-white"
                      : "opacity-60 hover:opacity-100"
                  }`}
                  title="โหมดมืด (Dark Theme)"
                >
                  <Moon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => changeRemarksTheme("navy")}
                  className={`p-1.5 rounded cursor-pointer transition-colors ${
                    remarksTheme === "navy"
                      ? "bg-blue-600 text-white"
                      : "opacity-60 hover:opacity-100"
                  }`}
                  title="โหมดเนวี่การนำเสนอ (Navy Presentation Theme)"
                >
                  <Tv className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Add Remark button */}
              <button
                type="button"
                onClick={() => handleAddRemark()}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">เพิ่มหมายเหตุ</span>
              </button>

              {/* Exit Fullscreen button */}
              <button
                type="button"
                onClick={() => toggleRemarksFullScreen()}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="ออกจากการนำเสนอเต็มจอ (ESC)"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                <span>ปิดเต็มจอ (ESC)</span>
              </button>
            </div>
          </div>

          {/* MAIN PRESENTATION CONTENT AREA */}
          <div
            className={`flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 ${
              remarksTheme === "dark"
                ? "[&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-track]:bg-slate-900 [&::-webkit-scrollbar-thumb]:rounded-full"
                : remarksTheme === "navy"
                ? "[&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:bg-[#243B66] [&::-webkit-scrollbar-track]:bg-[#0E1B33] [&::-webkit-scrollbar-thumb]:rounded-full"
                : "[&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:rounded-full"
            }`}
          >
            {filteredRemarks.length === 0 ? (
              <div
                className={`max-w-xl mx-auto text-center p-8 sm:p-12 rounded-2xl border border-dashed my-12 ${
                  remarksTheme === "dark"
                    ? "bg-slate-900/60 border-slate-800 text-slate-400"
                    : remarksTheme === "navy"
                    ? "bg-[#111F38]/60 border-[#1D2E4E] text-slate-300"
                    : "bg-white border-slate-300 text-slate-500"
                }`}
              >
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-40 text-emerald-500" />
                <h3 className="font-bold text-base mb-1">
                  {remarksSearchQuery ? "ไม่พบรายการที่ตรงกับคำค้นหา" : "ยังไม่มีรายการหมายเหตุ"}
                </h3>
                <p className="text-xs opacity-75 mb-4">
                  {remarksSearchQuery
                    ? `ไม่มีรายการหมายเหตุที่มีคำว่า "${remarksSearchQuery}"`
                    : "คุณสามารถกดปุ่ม '+ เพิ่มหมายเหตุ' ด้านบนเพื่อสร้างรายการ"}
                </p>
                {remarksSearchQuery ? (
                  <button
                    type="button"
                    onClick={() => setRemarksSearchQuery("")}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    ล้างการค้นหา
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAddRemark()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    + เพิ่มรายการหมายเหตุแรก
                  </button>
                )}
              </div>
            ) : (
              <div
                className={`max-w-6xl mx-auto ${
                  remarksLayout === "grid" ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "flex flex-col space-y-4"
                }`}
              >
                {filteredRemarks.map(({ text, originalIndex, periodNo }) => (
                  <div
                    key={`fs-modal-rem-${originalIndex}`}
                    className={`rounded-xl p-4 sm:p-5 border shadow-sm transition-all relative group ${
                      remarksTheme === "dark"
                        ? "bg-slate-900/90 border-slate-800 text-slate-100 hover:border-slate-700"
                        : remarksTheme === "navy"
                        ? "bg-[#13223D] border-[#1F3358] text-white hover:border-[#2C4675]"
                        : "bg-white border-slate-200/90 text-slate-900 hover:border-slate-300 shadow-xs"
                    }`}
                  >
                    {editingRemarkIndex === originalIndex ? (
                      <div className="flex flex-col gap-2.5">
                        <div className="flex items-center justify-between text-xs font-bold text-emerald-500">
                          <span>แก้ไขข้อความหมายเหตุ (งวดที่ {periodNo})</span>
                          <span className="text-[10px] opacity-70">Ctrl+Enter เพื่อบันทึก</span>
                        </div>

                        {/* Visual WYSIWYG Remark Editor */}
                        <VisualRemarkEditor
                          value={editingRemarkText}
                          onChange={setEditingRemarkText}
                          onSave={() => handleSaveRemark(originalIndex)}
                          onCancel={() => setEditingRemarkIndex(null)}
                          fontSize={remarksFontSize}
                          theme={remarksTheme}
                        />

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveRemark(originalIndex)}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>บันทึก</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingRemarkIndex(null)}
                            className="px-3 py-1.5 opacity-80 hover:opacity-100 text-xs rounded-lg cursor-pointer transition-colors"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {/* Card Header: Period badge & Actions */}
                        <div className="flex items-center justify-between gap-2 border-b pb-2.5 border-slate-200/60 dark:border-slate-800">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-bold px-3 py-1 rounded-lg tracking-wide shadow-2xs border transition-all ${
                                remarksTheme === "dark"
                                  ? "bg-emerald-950/80 text-emerald-300 border-emerald-800/80"
                                  : remarksTheme === "navy"
                                  ? "bg-emerald-900/50 text-emerald-300 border-emerald-700/60"
                                  : "bg-emerald-50 text-emerald-800 border-emerald-200"
                              }`}
                              style={{
                                fontSize: `${Math.max(9, Math.round(remarksFontSize * 0.85))}px`,
                                lineHeight: 1.4,
                              }}
                            >
                              งวดที่ {periodNo}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            {/* Copy button */}
                            <button
                              type="button"
                              onClick={() => handleCopyRemark(text, originalIndex)}
                              className="p-1.5 rounded-md hover:bg-emerald-500/20 text-emerald-500 transition-colors cursor-pointer flex items-center gap-1 font-medium"
                              style={{ fontSize: `${Math.max(9, Math.round(remarksFontSize * 0.8))}px` }}
                              title="คัดลอกข้อความนี้"
                            >
                              {copiedRemarkIdx === originalIndex ? (
                                <>
                                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  <span className="text-emerald-400 font-bold">คัดลอกแล้ว</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">คัดลอก</span>
                                </>
                              )}
                            </button>

                            {/* Edit button */}
                            <button
                              type="button"
                              onClick={() => handleStartEditRemark(originalIndex)}
                              className="p-1.5 rounded-md hover:bg-amber-500/20 text-amber-500 transition-colors cursor-pointer flex items-center gap-1 font-medium"
                              style={{ fontSize: `${Math.max(9, Math.round(remarksFontSize * 0.8))}px` }}
                              title="แก้ไขข้อความ"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">แก้ไข</span>
                            </button>

                            {/* Delete button */}
                            <button
                              type="button"
                              onClick={() => onRequestDeleteRemark(originalIndex)}
                              className="p-1.5 rounded-md hover:bg-rose-500/20 text-rose-500 transition-colors cursor-pointer flex items-center gap-1 font-medium"
                              style={{ fontSize: `${Math.max(9, Math.round(remarksFontSize * 0.8))}px` }}
                              title="ลบรายการนี้"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">ลบ</span>
                            </button>
                          </div>
                        </div>

                        {/* Remark Body with adjustable Font Size & Highlights */}
                        <FormattedRemarkText
                          text={text}
                          theme={remarksTheme}
                          style={{
                            fontSize: `${remarksFontSize}px`,
                            lineHeight: 1.65,
                          }}
                          className="font-medium whitespace-pre-wrap break-words leading-relaxed pl-1"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FOOTER BAR WITH PRESENTATION KEYBOARD HINTS */}
          <div
            className={`px-4 py-2 border-t text-[11px] flex flex-wrap items-center justify-between gap-2 shrink-0 ${
              remarksTheme === "dark"
                ? "bg-slate-900/90 border-slate-800 text-slate-400"
                : remarksTheme === "navy"
                ? "bg-[#111F38] border-[#1D2E4E] text-slate-300"
                : "bg-slate-50 border-slate-200 text-slate-600"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="font-semibold text-emerald-500 flex items-center gap-1">
                <Tv className="h-3.5 w-3.5" />
                <span>โหมดนำเสนอหมายเหตุเต็มจอ</span>
              </span>
              <span className="hidden md:inline opacity-60">•</span>
              <span className="hidden md:inline font-mono">
                ขนาดตัวอักษร: <strong className="text-amber-400">{remarksFontSize}px</strong>
              </span>
            </div>

            <div className="flex items-center gap-3 font-mono opacity-80 text-[10px]">
              <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">ESC</kbd> ออกจากเต็มจอ</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">+</kbd> ขยาย</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">-</kbd> ย่อ</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">0</kbd> รีเซ็ต</span>
            </div>
          </div>
        </div>
      )}
      {/* Delete Remark Confirmation Popup Modal */}
      {remarkToDeleteIndex !== null && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150 text-slate-900">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base sm:text-lg">ยืนยันการลบรายการหมายเหตุ</h3>
                <p className="text-xs text-slate-500">การลบข้อมูลนี้จะมีผลทันทีและไม่สามารถกู้คืนได้</p>
              </div>
            </div>

            <div className="bg-rose-50/60 border border-rose-100 rounded-xl p-3.5 space-y-1.5 text-xs sm:text-sm">
              <div className="font-bold text-rose-800 text-xs">
                งวดที่ {getRemarkPeriodNo(remarks[remarkToDeleteIndex] || "", remarkToDeleteIndex, remarks.length)}
              </div>
              <div className="text-slate-700 font-medium whitespace-pre-wrap break-words max-h-32 overflow-y-auto leading-relaxed border-t border-rose-100/80 pt-1.5">
                {remarks[remarkToDeleteIndex]}
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              คุณแน่ใจหรือไม่ว่าต้องการลบรายการหมายเหตุนี้ออกจากระบบ?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRemarkToDeleteIndex(null)}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRemark}
                className="px-4.5 py-2 text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl transition-colors cursor-pointer shadow-md flex items-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                <span>ยืนยันลบรายการ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Table Data Confirmation & Configuration Modal */}
      {showClearModal && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-[110] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-150 text-slate-900">
            {/* Header */}
            <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl shrink-0 shadow-xs">
                <Trash2 className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-slate-900 text-base sm:text-lg leading-tight">
                    ล้างข้อมูลตารางแผนงานและผลงานรายครั้ง
                  </h3>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-800 rounded-md">
                    🔒 สิทธิ์ {userSession?.role || (isAdmin ? "Admin" : "Owner/Admin")}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  โครงการ: <span className="font-semibold text-slate-700">{project.sheetName}</span> (Periodic Progress Table)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Notice / Warning */}
            <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">โปรดเลือกรูปแบบการล้างข้อมูลที่ต้องการ:</p>
                <p className="text-amber-800 leading-relaxed">
                  ระบบจะทำการล้างตัวเลขแผนงานและผลงานตามตัวเลือกด้านล่าง คุณสามารถเลือกเปิดโหมดแก้ไขเพื่อกรอกต่อ หรือบันทึกลงระบบทันที
                </p>
              </div>
            </div>

            {/* Clear Mode Options */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-slate-700 block">
                รูปแบบการล้างข้อมูล (Clear Mode):
              </label>

              {/* Option 1: Values Only */}
              <label
                onClick={() => setClearMode("values_only")}
                className={`flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                  clearMode === "values_only"
                    ? "border-emerald-500 bg-emerald-50/50 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
                }`}
              >
                <input
                  type="radio"
                  name="clear_mode"
                  checked={clearMode === "values_only"}
                  onChange={() => setClearMode("values_only")}
                  className="mt-1 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <div className="space-y-0.5 flex-1">
                  <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                    <span>1. ล้างเฉพาะตัวเลข/ผลงาน (รีเซ็ตค่าเป็น 0 ทั้งหมด)</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold">แนะนำ</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    คงโครงสร้างจำนวน <strong>{records.length} ครั้ง/งวด</strong> และช่วงวันที่เดิมไว้ แต่ล้างค่า % แผนงาน, % ผลงาน, ยอดเงินแผน และยอดเงินผลงานให้เป็น 0 ทุกช่องเพื่อเริ่มกรอกตัวเลขใหม่
                  </p>
                </div>
              </label>

              {/* Option 2: Reset to 1 Initial Row */}
              <label
                onClick={() => setClearMode("reset_to_single")}
                className={`flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                  clearMode === "reset_to_single"
                    ? "border-rose-500 bg-rose-50/40 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
                }`}
              >
                <input
                  type="radio"
                  name="clear_mode"
                  checked={clearMode === "reset_to_single"}
                  onChange={() => setClearMode("reset_to_single")}
                  className="mt-1 text-rose-600 focus:ring-rose-500 cursor-pointer"
                />
                <div className="space-y-0.5 flex-1">
                  <div className="text-xs font-bold text-slate-900">
                    2. ล้างและรีเซ็ตโครงสร้างตารางใหม่ทั้งหมด (เริ่มต้น 1 งวด)
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    ลบงวดทั้งหมดออก แล้วเริ่มตารางใหม่ตั้งแต่งวดที่ 1 (0% ทุกช่อง) โดยใช้วันที่เริ่มต้นโครงการ
                  </p>
                </div>
              </label>
            </div>

            {/* Clear Disbursements Option */}
            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50/70 border border-blue-200/80 hover:bg-blue-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={clearDisbursementsAlso}
                  onChange={(e) => setClearDisbursementsAlso(e.target.checked)}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer h-4 w-4 shrink-0"
                />
                <div className="space-y-0.5 flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-blue-950">
                    <Coins className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    <span>ล้างข้อมูลในงวดการส่งมอบงานและการเบิกจ่ายเงิน (Disbursements) ด้วย</span>
                    <span className="text-[10px] px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded font-semibold">แนะนำ</span>
                  </div>
                  <p className="text-[11px] text-blue-700 leading-relaxed">
                    เนื่องจาก <strong>"ผลการเงินประจำเดือน (บาท)"</strong> ในตารางคำนวณและดึงข้อมูลมาจากงวดการเบิกจ่าย การเลือกตัวเลือกนี้จะล้างงวดเบิกจ่ายและรีเซ็ตยอดเงินเบิกจ่ายสะสมเป็น 0 เพื่อให้ผลการเงินในตารางเริ่มต้นใหม่ได้อย่างสอดคล้องกัน {project.disbursements && project.disbursements.length > 0 ? `(ปัจจุบันมี ${project.disbursements.length} งวด)` : ""}
                  </p>
                </div>
              </label>
            </div>

            {/* Clear Remarks Option */}
            <div className="pt-1 border-t border-slate-100">
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={clearRemarksAlso}
                  onChange={(e) => setClearRemarksAlso(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-rose-500 cursor-pointer h-4 w-4"
                />
                <span className="text-xs font-medium text-slate-700">
                  ล้างรายการหมายเหตุท้ายตารางด้วย (Table Remarks & Notes {remarks.length > 0 ? `มี ${remarks.length} รายการ` : ""})
                </span>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                disabled={isClearing}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-center"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmClearAndEdit}
                disabled={isClearing}
                className="px-4 py-2 text-xs sm:text-sm font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 active:bg-amber-300 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                title="ล้างข้อมูลในตารางและเปิดโหมดแก้ไขเพื่อให้ตรวจทานหรือกรอกค่าใหม่"
              >
                <Edit3 className="h-3.5 w-3.5 text-amber-700" />
                <span>ล้างข้อมูลและแก้ไขต่อ</span>
              </button>
              <button
                type="button"
                onClick={handleConfirmClearAndSave}
                disabled={isClearing}
                className="px-4 py-2 text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl transition-colors cursor-pointer shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
                title="ล้างข้อมูลและบันทึกลงระบบทันที"
              >
                {isClearing ? (
                  <span className="animate-spin text-sm">⏳</span>
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span>{isClearing ? "กำลังบันทึก..." : "ล้างข้อมูลและบันทึกทันที"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Last Iteration Confirmation Popup Modal */}
      {showDeleteLastIterationConfirm && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150 text-slate-900">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base sm:text-lg">ยืนยันการลบข้อมูลตารางงวดล่าสุด</h3>
                <p className="text-xs text-slate-500">การลบข้อมูลครั้งที่ {records.length} จะนำแถวล่าสุดออกจากตาราง</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลตารางประจำครั้งที่ <strong className="text-rose-600">{records.length}</strong> ออกจากรายการ?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeleteLastIterationConfirm(false)}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteLastIteration}
                className="px-4.5 py-2 text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl transition-colors cursor-pointer shadow-md flex items-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                <span>ยืนยันลบแถวล่าสุด</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
