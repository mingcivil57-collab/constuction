import React, { useState, useRef, useEffect } from "react";
import { Project } from "../types";
import { getCurrentProgressInfo } from "../lib/periodicUtils";
import {
  formatDateDisplay,
  calculateContractDays,
  calculateProjectTimeline,
  calculateLiquidatedDamages,
} from "../lib/dateUtils";
import {
  TrendingUp,
  DollarSign,
  Briefcase,
  Layers,
  CalendarDays,
  Percent,
  PlusCircle,
  BarChart4,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  ListFilter,
  Trash2,
  Palette,
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  PieChart as PieChartIcon,
  RotateCcw,
  Sparkles,
  Scale,
  AlertOctagon,
  ShieldAlert,
  GripHorizontal,
  Target,
  Gauge,
  LayoutGrid,
  BarChart3,
  StickyNote,
  Edit3,
  Check,
  Plus,
  TrendingDown,
  Building2,
  Calendar,
  ChevronRight,
  ChevronDown,
  Coins,
  FileText,
  Crown,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  Treemap,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  FunnelChart,
  Funnel,
  LabelList,
} from "recharts";

interface DashboardOverviewProps {
  projects: Project[];
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedPlan: string;
  setSelectedPlan: (plan: string) => void;
  onSelectProject: (project: Project) => void;
  onAddProjectClick: () => void;
  onDeleteProject?: (sheetName: string) => void;
  isAdmin?: boolean;
  userRole?: string;
  onRequestAdminLogin?: (actionName?: string) => void;
  onUpdateProject?: (updatedProject: Project) => void | Promise<void>;
}

export default function DashboardOverview({
  projects,
  selectedYear,
  setSelectedYear,
  selectedPlan,
  setSelectedPlan,
  onSelectProject,
  onAddProjectClick,
  onDeleteProject,
  isAdmin = false,
  userRole,
  onRequestAdminLogin,
  onUpdateProject,
}: DashboardOverviewProps) {
  const isOwner = userRole === "Owner" || userRole === "Owner (เจ้าของระบบ)";

  // Admin Project Notes inline editing state
  const [editingNotesSheet, setEditingNotesSheet] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<string>("");
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false);

  const startEditingNotes = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    if (!isOwner) {
      if (onRequestAdminLogin) onRequestAdminLogin("เข้าสู่ระบบด้วยสิทธิ์ Owner เพื่อแก้ไขหมายเหตุโครงการ");
      return;
    }
    setEditingNotesSheet(project.sheetName);
    setNotesDraft(project.projectNotes || "");
  };

  const handleSaveNotes = async (e: React.MouseEvent | React.KeyboardEvent, project: Project) => {
    e.stopPropagation();
    if (!isOwner) {
      alert("สิทธิ์ไม่เพียงพอ: สงวนสิทธิ์การแก้ไขและบันทึกหมายเหตุโครงการสำหรับ Owner เท่านั้น");
      return;
    }
    setIsSavingNote(true);
    const updated: Project = {
      ...project,
      projectNotes: notesDraft.trim(),
    };
    try {
      if (onUpdateProject) {
        await onUpdateProject(updated);
      }
      setEditingNotesSheet(null);
    } catch (err) {
      console.error("Failed to save project notes:", err);
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleCancelEditingNotes = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setEditingNotesSheet(null);
  };

  // Financial Chart Colors & Bar Order (Owner feature)
  const [financialColors, setFinancialColors] = useState<{
    budget: string;
    contract: string;
    disbursed: string;
  }>(() => {
    try {
      const saved = localStorage.getItem("owner_financial_chart_colors");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      budget: "#94a3b8", // Grey / Slate
      contract: "#3b82f6", // Blue
      disbursed: "#10b981", // Emerald
    };
  });

  const [financialBarOrder, setFinancialBarOrder] = useState<Array<"budget" | "contract" | "disbursed">>(() => {
    try {
      const saved = localStorage.getItem("owner_financial_bar_order");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return ["budget", "contract", "disbursed"];
  });

  const [isFinancialControlOpen, setIsFinancialControlOpen] = useState(false);

  const handleFinancialColorChange = (key: "budget" | "contract" | "disbursed", color: string) => {
    const updated = { ...financialColors, [key]: color };
    setFinancialColors(updated);
    try {
      localStorage.setItem("owner_financial_chart_colors", JSON.stringify(updated));
    } catch (e) {}
  };

  const handleMoveFinancialBar = (index: number, direction: "left" | "right") => {
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= financialBarOrder.length) return;
    const newOrder = [...financialBarOrder];
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;
    setFinancialBarOrder(newOrder);
    try {
      localStorage.setItem("owner_financial_bar_order", JSON.stringify(newOrder));
    } catch (e) {}
  };

  const handleResetFinancialConfig = () => {
    const defaultColors = { budget: "#94a3b8", contract: "#3b82f6", disbursed: "#10b981" };
    const defaultOrder: Array<"budget" | "contract" | "disbursed"> = ["budget", "contract", "disbursed"];
    setFinancialColors(defaultColors);
    setFinancialBarOrder(defaultOrder);
    localStorage.removeItem("owner_financial_chart_colors");
    localStorage.removeItem("owner_financial_bar_order");
  };

  // Progress Chart Colors & Bar Order (Owner feature)
  const [progressColors, setProgressColors] = useState<{
    plan: string;
    actual: string;
    disbursed: string;
  }>(() => {
    try {
      const saved = localStorage.getItem("owner_progress_chart_colors");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      plan: "#94a3b8", // Grey / Slate
      actual: "#10b981", // Emerald / Green
      disbursed: "#f59e0b", // Amber / Yellow
    };
  });

  const [progressBarOrder, setProgressBarOrder] = useState<Array<"plan" | "actual" | "disbursed">>(() => {
    try {
      const saved = localStorage.getItem("owner_progress_bar_order");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return ["plan", "actual", "disbursed"];
  });

  const [isProgressControlOpen, setIsProgressControlOpen] = useState(false);

  const handleProgressColorChange = (key: "plan" | "actual" | "disbursed", color: string) => {
    const updated = { ...progressColors, [key]: color };
    setProgressColors(updated);
    try {
      localStorage.setItem("owner_progress_chart_colors", JSON.stringify(updated));
    } catch (e) {}
  };

  const handleMoveProgressBar = (index: number, direction: "left" | "right") => {
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= progressBarOrder.length) return;
    const newOrder = [...progressBarOrder];
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;
    setProgressBarOrder(newOrder);
    try {
      localStorage.setItem("owner_progress_bar_order", JSON.stringify(newOrder));
    } catch (e) {}
  };

  const handleResetProgressConfig = () => {
    const defaultColors = { plan: "#94a3b8", actual: "#10b981", disbursed: "#f59e0b" };
    const defaultOrder: Array<"plan" | "actual" | "disbursed"> = ["plan", "actual", "disbursed"];
    setProgressColors(defaultColors);
    setProgressBarOrder(defaultOrder);
    localStorage.removeItem("owner_progress_chart_colors");
    localStorage.removeItem("owner_progress_bar_order");
  };
  // Extract all unique fiscal years
  const fiscalYears = Array.from(new Set(projects.map((p) => p.fiscalYear))).sort(
    (a, b) => b.localeCompare(a)
  );

  // Filter projects by selected year
  const projectsInYear = projects.filter((p) => p.fiscalYear === selectedYear);

  // Extract all unique plans for the selected fiscal year
  const plansInYear = Array.from(new Set(projectsInYear.map((p) => p.planName))).sort();

  // Check if viewing all plans for the selected fiscal year
  const isAllPlans = selectedPlan === "ALL_PLANS" || selectedPlan === "" || !selectedPlan;

  // Filter projects in the selected plan of the selected year (or all plans if isAllPlans)
  const filteredProjects = isAllPlans
    ? projectsInYear
    : projectsInYear.filter((p) => p.planName === selectedPlan);

  // Aggregations
  const totalBudget = filteredProjects.reduce((sum, p) => sum + p.budget, 0);
  const totalContract = filteredProjects.reduce((sum, p) => sum + p.contractAmount, 0);
  const totalDisbursed = filteredProjects.reduce((sum, p) => sum + p.disbursedAmount, 0);
  const avgPlanned =
    filteredProjects.length > 0
      ? Math.round(filteredProjects.reduce((sum, p) => sum + (getCurrentProgressInfo(p).planPercent || p.progressPlan), 0) / filteredProjects.length)
      : 0;
  const avgActual =
    filteredProjects.length > 0
      ? Math.round(filteredProjects.reduce((sum, p) => sum + (getCurrentProgressInfo(p).actualPercent || p.progressField), 0) / filteredProjects.length)
      : 0;

  const disbursementPercent = totalContract > 0 ? Math.round((totalDisbursed / totalContract) * 100) : 0;

  // States for sub-plans (tasks) summary and search filters
  const [taskSearch, setTaskSearch] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState<"all" | "not_started" | "in_progress" | "completed">("all");

  // Comparison filter modes for Charts
  const [financialCompareMode, setFinancialCompareMode] = useState<string>("all");
  const [progressCompareMode, setProgressCompareMode] = useState<string>("all");

  // Filter mode for Overdue Alert Banner: "all" | "ongoing" | "completed"
  const [overdueBannerFilter, setOverdueBannerFilter] = useState<"all" | "ongoing" | "completed">("all");

  // Dropdown states for Fiscal Year and Plan / Overview selectors
  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState<boolean>(false);
  const [isPlanDropdownOpen, setIsPlanDropdownOpen] = useState<boolean>(false);
  const yearDropdownRef = useRef<HTMLDivElement>(null);
  const planDropdownRef = useRef<HTMLDivElement>(null);
  const financialScrollContainerRef = useRef<HTMLDivElement>(null);
  const progressScrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(e.target as Node)) {
        setIsYearDropdownOpen(false);
      }
      if (planDropdownRef.current && !planDropdownRef.current.contains(e.target as Node)) {
        setIsPlanDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsYearDropdownOpen(false);
        setIsPlanDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Flatten all tasks from filtered projects under the selected plan
  const allTasks = filteredProjects.flatMap((p) =>
    (p.tasks || []).map((t) => ({
      ...t,
      projectSheetName: p.sheetName,
      projectName: p.projectName,
      projectObj: p,
    }))
  );

  const totalTasksCount = allTasks.length;
  const completedTasksCount = allTasks.filter((t) => t.progress === 100).length;
  const inProgressTasksCount = allTasks.filter((t) => t.progress > 0 && t.progress < 100).length;
  const notStartedTasksCount = allTasks.filter((t) => t.progress === 0).length;

  const completedPct = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;
  const inProgressPct = totalTasksCount > 0 ? Math.round((inProgressTasksCount / totalTasksCount) * 100) : 0;
  const notStartedPct = totalTasksCount > 0 ? Math.round((notStartedTasksCount / totalTasksCount) * 100) : 0;

  const avgTaskProgress = totalTasksCount > 0
    ? Math.round(allTasks.reduce((sum, t) => sum + t.progress, 0) / totalTasksCount)
    : 0;

  // Filter tasks based on search query and status selection
  const filteredTasks = allTasks.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(taskSearch.toLowerCase()) ||
      t.projectName.toLowerCase().includes(taskSearch.toLowerCase());

    if (taskStatusFilter === "not_started") return matchesSearch && t.progress === 0;
    if (taskStatusFilter === "in_progress") return matchesSearch && t.progress > 0 && t.progress < 100;
    if (taskStatusFilter === "completed") return matchesSearch && t.progress === 100;
    return matchesSearch;
  });

  // Formatting Thai currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val || 0) + " บาท";
  };

  const formatNumberOnly = (val: number) => {
    return new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val || 0);
  };

  // Pie Chart State & Color Management (Owner Customizable)
  const DEFAULT_PIE_COLORS = [
    "#3b82f6", // Blue
    "#10b981", // Emerald
    "#f59e0b", // Amber
    "#8b5cf6", // Purple
    "#ec4899", // Pink
    "#06b6d4", // Cyan
    "#f97316", // Orange
    "#6366f1", // Indigo
    "#14b8a6", // Teal
    "#84cc16", // Lime
  ];

  const PRESET_PALETTES = [
    { name: "Emerald Pro", colors: ["#10b981", "#059669", "#047857", "#34d399", "#6ee7b7", "#0284c7"] },
    { name: "Corporate Blue", colors: ["#2563eb", "#3b82f6", "#0284c7", "#0d9488", "#6366f1", "#8b5cf6"] },
    { name: "Sunset Gold", colors: ["#d97706", "#f59e0b", "#fbbf24", "#f97316", "#ef4444", "#84cc16"] },
    { name: "Modern Dark", colors: ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#64748b"] },
    { name: "Neon Cyber", colors: ["#06b6d4", "#10b981", "#f43f5e", "#a855f7", "#eab308", "#3b82f6"] },
  ];

  const [pieCompareMode, setPieCompareMode] = useState<
    | "project_vs_budget"
    | "project_vs_contract"
    | "project_vs_disbursed"
    | "project_vs_progress"
    | "project_vs_duration"
    | "plan_vs_budget"
    | "plan_vs_contract"
    | "plan_vs_disbursed"
    | "plan_vs_progress"
    | "plan_vs_duration"
  >("project_vs_budget");

  // Diverse Chart Styles State (Donut, Solid Pie, Semi-Donut Gauge, Radial Bar, Ranked Bar, Treemap, Nightingale Rose, Radar, Funnel)
  const [pieChartType, setPieChartType] = useState<
    "donut" | "pie" | "semi_donut" | "radial" | "bar" | "treemap" | "rose" | "radar" | "funnel"
  >(() => {
    try {
      const saved = localStorage.getItem("preferred_proportion_chart_type");
      if (
        saved &&
        ["donut", "pie", "semi_donut", "radial", "bar", "treemap", "rose", "radar", "funnel"].includes(saved)
      ) {
        return saved as any;
      }
    } catch (e) {}
    return "donut";
  });

  const handleSelectChartType = (
    type: "donut" | "pie" | "semi_donut" | "radial" | "bar" | "treemap" | "rose" | "radar" | "funnel"
  ) => {
    setPieChartType(type);
    try {
      localStorage.setItem("preferred_proportion_chart_type", type);
    } catch (e) {}
  };

  const [activePieIndex, setActivePieIndex] = useState<number>(0);
  const [isPieControlOpen, setIsPieControlOpen] = useState(false);

  // Owner custom pie colors map or array
  const [pieCustomColors, setPieCustomColors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("owner_pie_chart_colors");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_PIE_COLORS;
  });

  const handleApplyPresetPalette = (colors: string[]) => {
    setPieCustomColors(colors);
    try {
      localStorage.setItem("owner_pie_chart_colors", JSON.stringify(colors));
    } catch (e) {}
  };

  const handleUpdatePieColor = (index: number, newColor: string) => {
    const updated = [...pieCustomColors];
    updated[index] = newColor;
    setPieCustomColors(updated);
    try {
      localStorage.setItem("owner_pie_chart_colors", JSON.stringify(updated));
    } catch (e) {}
  };

  const handleResetPieColors = () => {
    setPieCustomColors(DEFAULT_PIE_COLORS);
    localStorage.removeItem("owner_pie_chart_colors");
  };

  // Resizable Pie & Donut Frame Height State & Handlers
  const DEFAULT_PIE_FRAME_HEIGHT = 560;
  const MIN_PIE_FRAME_HEIGHT = 320;
  const MAX_PIE_FRAME_HEIGHT = 850;

  const [pieFrameHeight, setPieFrameHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("pie_donut_analytics_height");
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= MIN_PIE_FRAME_HEIGHT && val <= MAX_PIE_FRAME_HEIGHT) {
          return val;
        }
      }
    } catch (e) {}
    return DEFAULT_PIE_FRAME_HEIGHT;
  });

  const [isResizingPieFrame, setIsResizingPieFrame] = useState<boolean>(false);
  const resizePieStartYRef = useRef<number>(0);
  const resizePieStartHeightRef = useRef<number>(0);

  const handlePieResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingPieFrame(true);
    resizePieStartYRef.current = e.clientY;
    resizePieStartHeightRef.current = pieFrameHeight;
  };

  const handlePieResizeTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      setIsResizingPieFrame(true);
      resizePieStartYRef.current = e.touches[0].clientY;
      resizePieStartHeightRef.current = pieFrameHeight;
    }
  };

  useEffect(() => {
    if (!isResizingPieFrame) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizePieStartYRef.current;
      const newHeight = Math.max(
        MIN_PIE_FRAME_HEIGHT,
        Math.min(MAX_PIE_FRAME_HEIGHT, Math.round(resizePieStartHeightRef.current + deltaY))
      );
      setPieFrameHeight(newHeight);
      try {
        localStorage.setItem("pie_donut_analytics_height", String(newHeight));
      } catch (err) {}
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const deltaY = e.touches[0].clientY - resizePieStartYRef.current;
        const newHeight = Math.max(
          MIN_PIE_FRAME_HEIGHT,
          Math.min(MAX_PIE_FRAME_HEIGHT, Math.round(resizePieStartHeightRef.current + deltaY))
        );
        setPieFrameHeight(newHeight);
        try {
          localStorage.setItem("pie_donut_analytics_height", String(newHeight));
        } catch (err) {}
      }
    };

    const handleMouseUp = () => {
      setIsResizingPieFrame(false);
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
  }, [isResizingPieFrame]);

  const handleSetPieFramePreset = (height: number) => {
    setPieFrameHeight(height);
    try {
      localStorage.setItem("pie_donut_analytics_height", String(height));
    } catch (e) {}
  };

  // Compute Pie Chart Data based on mode
  const getPieData = () => {
    if (pieCompareMode === "project_vs_budget") {
      return filteredProjects.map((p) => {
        const val = p.budget || 0;
        const info = getCurrentProgressInfo(p);
        const actualVal = info.actualPercent ?? p.progressField;
        const planVal = info.planPercent ?? p.progressPlan;
        const disbursedPct = p.contractAmount > 0 ? ((p.disbursedAmount / p.contractAmount) * 100).toFixed(1) : "0";
        return {
          name: p.projectName,
          fullName: p.projectName,
          project: p,
          actualProgress: actualVal,
          planProgress: planVal,
          disbursedPercent: disbursedPct,
          value: val,
          unit: "บาท",
          formattedValue: formatCurrency(val),
          detailText: `งบประมาณโครงการ: ${formatCurrency(val)}`,
        };
      });
    }

    if (pieCompareMode === "project_vs_contract") {
      return filteredProjects.map((p) => {
        const val = p.contractAmount || 0;
        const info = getCurrentProgressInfo(p);
        const actualVal = info.actualPercent || p.progressField || 0;
        const planVal = info.planPercent || p.progressPlan || 0;
        const disbursedPct = p.contractAmount > 0 ? ((p.disbursedAmount / p.contractAmount) * 100).toFixed(1) : "0";
        return {
          name: p.projectName,
          fullName: p.projectName,
          project: p,
          actualProgress: actualVal,
          planProgress: planVal,
          disbursedPercent: disbursedPct,
          value: val,
          unit: "บาท",
          formattedValue: formatCurrency(val),
          detailText: `วงเงินตามสัญญา: ${formatCurrency(val)}${p.contractNumber ? ` (${p.contractNumber})` : ""}`,
        };
      });
    }

    if (pieCompareMode === "project_vs_disbursed") {
      return filteredProjects.map((p) => {
        const val = p.disbursedAmount || 0;
        const info = getCurrentProgressInfo(p);
        const actualVal = info.actualPercent || p.progressField || 0;
        const planVal = info.planPercent || p.progressPlan || 0;
        const pctOfContract = p.contractAmount > 0 ? ((val / p.contractAmount) * 100).toFixed(1) : "0";
        return {
          name: p.projectName,
          fullName: p.projectName,
          project: p,
          actualProgress: actualVal,
          planProgress: planVal,
          disbursedPercent: pctOfContract,
          value: val,
          unit: "บาท",
          formattedValue: formatCurrency(val),
          detailText: `เบิกจ่ายแล้ว ${pctOfContract}% ของวงเงินสัญญา (${formatCurrency(p.contractAmount || 0)})`,
        };
      });
    }

    if (pieCompareMode === "project_vs_progress") {
      return filteredProjects.map((p) => {
        const info = getCurrentProgressInfo(p);
        const actualVal = info.actualPercent || p.progressField || 0;
        const planVal = info.planPercent || p.progressPlan || 0;
        const disbursedPct = p.contractAmount > 0 ? ((p.disbursedAmount / p.contractAmount) * 100).toFixed(1) : "0";
        return {
          name: p.projectName,
          fullName: p.projectName,
          project: p,
          actualProgress: actualVal,
          planProgress: planVal,
          disbursedPercent: disbursedPct,
          value: actualVal,
          unit: "%",
          formattedValue: `${actualVal}%`,
          detailText: `แผนงาน: ${planVal}% | ผลงานจริงในสนาม: ${actualVal}%`,
        };
      });
    }

    if (pieCompareMode === "project_vs_duration") {
      return filteredProjects.map((p) => {
        const info = getCurrentProgressInfo(p);
        const actualVal = info.actualPercent || p.progressField || 0;
        const planVal = info.planPercent || p.progressPlan || 0;
        const timeline = calculateProjectTimeline(p.startDate, p.endDate, p.contractDays, actualVal, p.periodicProgress, p.sheetName);
        const days = timeline.remainingDays || 0;
        const disbursedPct = p.contractAmount > 0 ? ((p.disbursedAmount / p.contractAmount) * 100).toFixed(1) : "0";
        const startFmt = formatDateDisplay(p.startDate);
        const endFmt = formatDateDisplay(p.endDate);
        return {
          name: p.projectName,
          fullName: p.projectName,
          project: p,
          actualProgress: actualVal,
          planProgress: planVal,
          disbursedPercent: disbursedPct,
          value: days,
          unit: "วัน",
          formattedValue: timeline.isCompleted
            ? "เสร็จสมบูรณ์ 100%"
            : timeline.isExpired
            ? `ล่าช้า ${timeline.overdueDays} วัน`
            : `${days.toLocaleString()} วัน`,
          detailText: timeline.isCompleted
            ? `โครงการดำเนินการแล้วเสร็จสมบูรณ์ 100% (สัญญาเต็ม ${timeline.contractDays.toLocaleString()} วัน, ${startFmt} ถึง ${endFmt})`
            : timeline.isExpired
            ? `หมดสัญญาแล้ว (เลยกำหนดสัญญา/ล่าช้า ${timeline.overdueDays} วัน, สัญญาเต็ม ${timeline.contractDays.toLocaleString()} วัน, ${startFmt} ถึง ${endFmt})`
            : `อายุสัญญาคงเหลือ ${days.toLocaleString()} วัน (จากสัญญาเต็ม ${timeline.contractDays.toLocaleString()} วัน, ${startFmt} ถึง ${endFmt})`,
        };
      });
    }

    if (pieCompareMode === "plan_vs_budget") {
      const planMap = new Map<string, { budget: number; count: number }>();
      projectsInYear.forEach((p) => {
        const planKey = p.planName || "ไม่ระบุแผนงาน";
        const curr = planMap.get(planKey) || { budget: 0, count: 0 };
        planMap.set(planKey, {
          budget: curr.budget + (p.budget || 0),
          count: curr.count + 1,
        });
      });
      return Array.from(planMap.entries()).map(([planKey, data]) => ({
        name: planKey,
        fullName: `แผนงาน: ${planKey}`,
        planKey: planKey,
        value: data.budget,
        unit: "บาท",
        formattedValue: formatCurrency(data.budget),
        detailText: `รวม ${data.count} โครงการในแผนงาน`,
      }));
    }

    if (pieCompareMode === "plan_vs_contract") {
      const planMap = new Map<string, { contract: number; count: number }>();
      projectsInYear.forEach((p) => {
        const planKey = p.planName || "ไม่ระบุแผนงาน";
        const curr = planMap.get(planKey) || { contract: 0, count: 0 };
        planMap.set(planKey, {
          contract: curr.contract + (p.contractAmount || 0),
          count: curr.count + 1,
        });
      });
      return Array.from(planMap.entries()).map(([planKey, data]) => ({
        name: planKey,
        fullName: `แผนงาน: ${planKey}`,
        planKey: planKey,
        value: data.contract,
        unit: "บาท",
        formattedValue: formatCurrency(data.contract),
        detailText: `รวมวงเงินผูกพันสัญญา ${data.count} โครงการ`,
      }));
    }

    if (pieCompareMode === "plan_vs_disbursed") {
      const planMap = new Map<string, { disbursed: number; count: number }>();
      projectsInYear.forEach((p) => {
        const planKey = p.planName || "ไม่ระบุแผนงาน";
        const curr = planMap.get(planKey) || { disbursed: 0, count: 0 };
        planMap.set(planKey, {
          disbursed: curr.disbursed + (p.disbursedAmount || 0),
          count: curr.count + 1,
        });
      });
      return Array.from(planMap.entries()).map(([planKey, data]) => ({
        name: planKey,
        fullName: `แผนงาน: ${planKey}`,
        planKey: planKey,
        value: data.disbursed,
        unit: "บาท",
        formattedValue: formatCurrency(data.disbursed),
        detailText: `รวมเบิกจ่ายสะสม ${data.count} โครงการ`,
      }));
    }

    if (pieCompareMode === "plan_vs_progress") {
      const planMap = new Map<string, { totalActual: number; count: number }>();
      projectsInYear.forEach((p) => {
        const planKey = p.planName || "ไม่ระบุแผนงาน";
        const curr = planMap.get(planKey) || { totalActual: 0, count: 0 };
        const info = getCurrentProgressInfo(p);
        const actualVal = info.actualPercent || p.progressField || 0;
        planMap.set(planKey, {
          totalActual: curr.totalActual + actualVal,
          count: curr.count + 1,
        });
      });
      return Array.from(planMap.entries()).map(([planKey, data]) => {
        const avgActual = data.count > 0 ? Number((data.totalActual / data.count).toFixed(1)) : 0;
        return {
          name: planKey,
          fullName: `แผนงาน: ${planKey}`,
          planKey: planKey,
          value: avgActual,
          unit: "%",
          formattedValue: `${avgActual}%`,
          detailText: `ผลงานเฉลี่ย (${data.count} โครงการในแผนงาน)`,
        };
      });
    }

    if (pieCompareMode === "plan_vs_duration") {
      const planMap = new Map<string, { totalRemainingDays: number; count: number }>();
      projectsInYear.forEach((p) => {
        const planKey = p.planName || "ไม่ระบุแผนงาน";
        const curr = planMap.get(planKey) || { totalRemainingDays: 0, count: 0 };
        const timeline = calculateProjectTimeline(p.startDate, p.endDate, p.contractDays, undefined, p.periodicProgress, p.sheetName);
        const days = timeline.remainingDays || 0;
        planMap.set(planKey, {
          totalRemainingDays: curr.totalRemainingDays + days,
          count: curr.count + 1,
        });
      });
      return Array.from(planMap.entries()).map(([planKey, data]) => {
        const avgDays = data.count > 0 ? Math.round(data.totalRemainingDays / data.count) : 0;
        return {
          name: planKey,
          fullName: `แผนงาน: ${planKey}`,
          planKey: planKey,
          value: data.totalRemainingDays,
          unit: "วัน",
          formattedValue: `${data.totalRemainingDays.toLocaleString()} วัน`,
          detailText: `รวมอายุสัญญาคงเหลือ ${data.totalRemainingDays.toLocaleString()} วัน (เฉลี่ย ${avgDays.toLocaleString()} วัน/โครงการ, รวม ${data.count} โครงการ)`,
        };
      });
    }

    return [];
  };

  const pieData = getPieData();
  const pieTotalVal = pieData.reduce((sum, item) => sum + item.value, 0);
  const dynamicOuterRadius = Math.min(185, Math.max(105, Math.round(pieFrameHeight * 0.33)));
  const dynamicInnerRadius = pieChartType === "donut" ? Math.round(dynamicOuterRadius * 0.63) : 0;
  const donutCenterSize = Math.min(160, Math.max(124, Math.round(dynamicInnerRadius * 1.7)));

  const getModeSummaryLabel = () => {
    if (pieCompareMode.includes("budget")) return "งบประมาณรวม";
    if (pieCompareMode.includes("contract")) return "ผูกพันสัญญารวม";
    if (pieCompareMode.includes("disbursed")) return "เบิกจ่ายสะสมรวม";
    if (pieCompareMode.includes("duration")) return "รวมอายุสัญญาคงเหลือ";
    return "ผลงานสะสมรวม";
  };

  const getModeSummaryValue = () => {
    if (pieCompareMode.includes("progress")) {
      return `${(pieTotalVal / (pieData.length || 1)).toFixed(1)}%`;
    }
    if (pieCompareMode.includes("duration")) {
      return `${pieTotalVal.toLocaleString()} วัน`;
    }
    return formatCurrency(pieTotalVal);
  };

  const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.03) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x}
        y={y}
        fill="#ffffff"
        textAnchor="middle"
        dominantBaseline="central"
        className="font-black text-[11px] sm:text-xs select-none pointer-events-none"
        style={{
          fontWeight: 900,
          filter: "drop-shadow(0px 1px 2px rgba(0,0,0,0.85))",
        }}
      >
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    );
  };

  const renderPieSliceCells = () =>
    pieData.map((item, index) => {
      const sliceColor =
        pieCustomColors[index % pieCustomColors.length] ||
        DEFAULT_PIE_COLORS[index % DEFAULT_PIE_COLORS.length];
      const isSelected = activePieIndex === index;
      return (
        <Cell
          key={`cell-${index}`}
          fill={sliceColor}
          stroke={isSelected ? "#0f172a" : "#ffffff"}
          strokeWidth={isSelected ? 3.5 : 1.5}
          className="transition-all duration-300 cursor-pointer hover:opacity-90"
          style={{
            transform: isSelected ? "scale(1.04)" : "scale(1)",
            transformOrigin: "center center",
          }}
          onClick={() => {
            setActivePieIndex(index);
            if (item.project) {
              onSelectProject(item.project);
            } else if (item.planKey) {
              setSelectedPlan(item.planKey);
            }
          }}
        />
      );
    });

  const renderPieTooltipContent = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const pct = pieTotalVal > 0 ? ((data.value / pieTotalVal) * 100).toFixed(1) : "0";
      return (
        <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-2xl border border-slate-700 text-xs space-y-2 max-w-xs z-[99999]">
          <p className="font-black text-emerald-400 text-sm leading-tight">{data.fullName || data.name}</p>
          <div className="space-y-1 font-mono text-xs pt-1.5 border-t border-slate-800 text-slate-200">
            <p className="flex justify-between gap-3">
              <span className="text-slate-400">มูลค่า/ผลงาน:</span>
              <span className="font-bold text-white">{data.formattedValue}</span>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-slate-400">สัดส่วนในแผนภูมิ:</span>
              <span className="font-black text-amber-300">{pct}%</span>
            </p>
            {data.project && (
              <>
                <p className="flex justify-between gap-3">
                  <span className="text-slate-400">ผลงานจริงในสนาม:</span>
                  <span className="font-bold text-emerald-400">{data.actualProgress}%</span>
                </p>
                <p className="flex justify-between gap-3">
                  <span className="text-slate-400">เบิกจ่ายตามสัญญา:</span>
                  <span className="font-bold text-cyan-300">{data.disbursedPercent}%</span>
                </p>
              </>
            )}
          </div>
          {data.project && (
            <p className="pt-1.5 border-t border-slate-800 text-[10px] font-extrabold text-emerald-400 flex items-center gap-1">
              <span>👉 คลิกเพื่อเปิดดูรายละเอียดโครงการนี้</span>
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Ranked Bar Chart Data
  const rankedBarData = [...pieData]
    .sort((a, b) => b.value - a.value)
    .map((item) => {
      const originalIdx = pieData.findIndex((p) => p.name === item.name);
      return {
        ...item,
        shortName: item.name.length > 20 ? item.name.substring(0, 20) + "..." : item.name,
        fill:
          pieCustomColors[originalIdx % pieCustomColors.length] ||
          DEFAULT_PIE_COLORS[originalIdx % DEFAULT_PIE_COLORS.length],
        pct: pieTotalVal > 0 ? ((item.value / pieTotalVal) * 100).toFixed(1) : "0",
        originalIdx,
      };
    });

  // Radial Bar Data
  const radialData = [...pieData].map((item, idx) => ({
    ...item,
    fill:
      pieCustomColors[idx % pieCustomColors.length] ||
      DEFAULT_PIE_COLORS[idx % DEFAULT_PIE_COLORS.length],
    pct: pieTotalVal > 0 ? ((item.value / pieTotalVal) * 100).toFixed(1) : "0",
    idx,
  }));

  // Treemap Data
  const treemapData = pieData.map((item, idx) => ({
    ...item,
    size: Math.max(item.value, 0.001),
    fill:
      pieCustomColors[idx % pieCustomColors.length] ||
      DEFAULT_PIE_COLORS[idx % DEFAULT_PIE_COLORS.length],
    pct: pieTotalVal > 0 ? ((item.value / pieTotalVal) * 100).toFixed(1) : "0",
    idx,
  }));

  // Radar / Spider Chart Data
  const radarData = pieData.map((item, idx) => ({
    ...item,
    name: item.name.length > 15 ? item.name.substring(0, 15) + "..." : item.name,
    fullName: item.name,
    value: item.value,
    pct: pieTotalVal > 0 ? Number(((item.value / pieTotalVal) * 100).toFixed(1)) : 0,
    fill:
      pieCustomColors[idx % pieCustomColors.length] ||
      DEFAULT_PIE_COLORS[idx % DEFAULT_PIE_COLORS.length],
    idx,
  }));

  // Funnel Data (Hierarchical descending cascade)
  const funnelData = [...pieData]
    .sort((a, b) => b.value - a.value)
    .map((item) => {
      const originalIdx = pieData.findIndex((p) => p.name === item.name);
      return {
        ...item,
        name: item.name.length > 16 ? item.name.substring(0, 16) + "..." : item.name,
        fullName: item.name,
        fill:
          pieCustomColors[originalIdx % pieCustomColors.length] ||
          DEFAULT_PIE_COLORS[originalIdx % DEFAULT_PIE_COLORS.length],
        pct: pieTotalVal > 0 ? ((item.value / pieTotalVal) * 100).toFixed(1) : "0",
        originalIdx,
      };
    });

  // Chart 1: Financial comparison data (Structured for modern executive display & interactive hover popups)
  const financialChartData = filteredProjects.map((p, idx) => ({
    index: idx + 1,
    name: p.projectName.length > 22 ? p.projectName.substring(0, 22) + "..." : p.projectName,
    shortName: `${idx + 1}. ${p.projectName.length > 22 ? p.projectName.substring(0, 22).trim() + "..." : p.projectName}`,
    fullName: p.projectName,
    planName: p.planName,
    fiscalYear: p.fiscalYear,
    contractNumber: p.contractNumber,
    budget: p.budget || 0,
    contractAmount: p.contractAmount || 0,
    disbursedAmount: p.disbursedAmount || 0,
    remainingAmount: Math.max(0, (p.contractAmount || 0) - (p.disbursedAmount || 0)),
    savingsAmount: Math.max(0, (p.budget || 0) - (p.contractAmount || 0)),
    disbursedPercent: p.disbursedPercent || 0,
    "วงเงินโครงการ": p.budget || 0,
    "วงเงินตามสัญญา": p.contractAmount || 0,
    "เบิกจ่ายแล้ว": p.disbursedAmount || 0,
    projectObj: p,
  }));

  // Chart 2: Progress comparison data (Structured for modern executive display & interactive hover popups)
  const progressChartData = filteredProjects.map((p, idx) => {
    const info = getCurrentProgressInfo(p);
    const plan = info.planPercent || p.progressPlan || 0;
    const actual = info.actualPercent || p.progressField || 0;
    const delta = actual - plan;
    return {
      index: idx + 1,
      name: p.projectName.length > 22 ? p.projectName.substring(0, 22) + "..." : p.projectName,
      shortName: `${idx + 1}. ${p.projectName.length > 22 ? p.projectName.substring(0, 22).trim() + "..." : p.projectName}`,
      fullName: p.projectName,
      planName: p.planName,
      fiscalYear: p.fiscalYear,
      contractNumber: p.contractNumber,
      planPercent: plan,
      actualPercent: actual,
      disbursedPercent: p.disbursedPercent || 0,
      delta: delta,
      isAhead: delta >= 0,
      "แผนงาน (%)": plan,
      "ผลงานจริง (%)": actual,
      "เบิกจ่าย (%)": p.disbursedPercent || 0,
      projectObj: p,
    };
  });

  // Overdue and Liquidated Damages Analysis for Dashboard:
  // 1. โครงการสิ้นสุดกรอบระยะเวลาสัญญา / อยู่ระหว่างคิดค่าปรับ (ยังไม่แล้วเสร็จ 100%)
  // 2. โครงการที่แล้วเสร็จ (100%) ที่โดนคิดค่าปรับ (ส่งมอบช้ากว่ากำหนดและมีค่าปรับ)
  const overdueProjectsList = filteredProjects
    .map((p) => {
      const info = getCurrentProgressInfo(p);
      const penalty = calculateLiquidatedDamages(p, info.actualPercent || p.progressField);
      const isCompletedWithFine = !!penalty.isCompletedWithFine || (penalty.isCompleted && (penalty.totalFineAmount > 0 || penalty.netChargeableDays > 0));
      const isOngoingOverdue = !penalty.isCompleted && (penalty.isOverdue || penalty.hasFinalInstallmentExceededContract || penalty.overdueDays > 0);
      return { project: p, penalty, info, isCompletedWithFine, isOngoingOverdue };
    })
    .filter((item) => item.isOngoingOverdue || item.isCompletedWithFine);

  const ongoingCount = overdueProjectsList.filter((item) => item.isOngoingOverdue).length;
  const completedFinedCount = overdueProjectsList.filter((item) => item.isCompletedWithFine).length;
  const ongoingOverdueFines = overdueProjectsList.filter((item) => item.isOngoingOverdue).reduce((sum, item) => sum + item.penalty.totalFineAmount, 0);
  const completedFines = overdueProjectsList.filter((item) => item.isCompletedWithFine).reduce((sum, item) => sum + item.penalty.totalFineAmount, 0);
  const totalOverdueFines = overdueProjectsList.reduce((sum, item) => sum + item.penalty.totalFineAmount, 0);
  const hasCriticalCapProjects = overdueProjectsList.some((item) => item.penalty.isExceedingCap);

  const displayedOverdueProjects = overdueProjectsList.filter((item) => {
    if (overdueBannerFilter === "ongoing") return item.isOngoingOverdue;
    if (overdueBannerFilter === "completed") return item.isCompletedWithFine;
    return true;
  });

  // Render custom legends that dynamically follow bar order (financialBarOrder & progressBarOrder)
  const renderFinancialLegend = () => {
    const labelMap: Record<string, string> = {
      budget: "วงเงินโครงการ",
      contract: "วงเงินตามสัญญา",
      disbursed: "เบิกจ่ายแล้ว",
    };
    return (
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-['Sarabun',sans-serif]">
        {financialBarOrder.map((key) => {
          const isVisible =
            (key === "budget" && (financialCompareMode === "all" || financialCompareMode === "budget_vs_contract" || financialCompareMode === "budget_vs_disbursed" || financialCompareMode === "budget")) ||
            (key === "contract" && (financialCompareMode === "all" || financialCompareMode === "budget_vs_contract" || financialCompareMode === "contract_vs_disbursed" || financialCompareMode === "contract")) ||
            (key === "disbursed" && (financialCompareMode === "all" || financialCompareMode === "contract_vs_disbursed" || financialCompareMode === "budget_vs_disbursed" || financialCompareMode === "disbursed"));

          if (!isVisible) return null;

          return (
            <div key={key} className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 shadow-2xs">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block shrink-0 shadow-2xs border border-black/10"
                style={{ backgroundColor: financialColors[key] }}
              />
              <span className="text-slate-700 font-medium text-xs">{labelMap[key]}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderProgressLegend = () => {
    const labelMap: Record<string, string> = {
      plan: "แผนงานสะสม (%)",
      actual: "ผลงานจริงในสนาม (%)",
      disbursed: "ยอดเบิกจ่าย (%)",
    };
    return (
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-['Sarabun',sans-serif]">
        {progressBarOrder.map((key) => {
          const isVisible =
            (key === "plan" && (progressCompareMode === "all" || progressCompareMode === "plan_vs_actual" || progressCompareMode === "plan_vs_disbursed" || progressCompareMode === "plan")) ||
            (key === "actual" && (progressCompareMode === "all" || progressCompareMode === "plan_vs_actual" || progressCompareMode === "actual_vs_disbursed" || progressCompareMode === "actual")) ||
            (key === "disbursed" && (progressCompareMode === "all" || progressCompareMode === "actual_vs_disbursed" || progressCompareMode === "plan_vs_disbursed" || progressCompareMode === "disbursed"));

          if (!isVisible) return null;

          return (
            <div key={key} className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 shadow-2xs">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block shrink-0 shadow-2xs border border-black/10"
                style={{ backgroundColor: progressColors[key] }}
              />
              <span className="text-slate-700 font-medium text-xs">{labelMap[key]}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // Helper to calculate smart horizontal clamping so tooltip NEVER overflows the visible screen/container
  const getSmartTooltipLayout = (container: HTMLDivElement | null, coordX: number | undefined) => {
    let containerWidth = 360;
    let scrollLeft = 0;
    if (container) {
      containerWidth = container.clientWidth || 360;
      scrollLeft = container.scrollLeft || 0;
    } else if (typeof window !== "undefined") {
      containerWidth = Math.min(window.innerWidth - 32, 360);
    }

    // Safe responsive width that always fits within visible container (with 16px safety padding)
    const maxWidth = Math.min(350, Math.max(200, containerWidth - 16));

    // Visible boundary edges in SVG coordinate space
    const visibleLeft = scrollLeft + 8;
    const visibleRight = scrollLeft + containerWidth - 8;

    if (coordX === undefined) {
      return { width: maxWidth, shiftX: 0 };
    }

    const unshiftedRight = coordX + maxWidth;
    let shiftX = 0;

    if (unshiftedRight > visibleRight) {
      // Overflows right boundary -> shift left by the overflow amount, but keep within visibleLeft
      const overflow = unshiftedRight - visibleRight;
      const maxAllowedShift = Math.max(0, coordX - visibleLeft);
      shiftX = Math.min(overflow, maxAllowedShift);
    } else if (coordX < visibleLeft) {
      // Underflows left boundary (if user scrolled) -> shift right
      shiftX = -(visibleLeft - coordX);
    }

    return { width: maxWidth, shiftX };
  };

  // Interactive Modern Executive Hover Popup Tooltip for Financial Chart
  const CustomFinancialTooltip = ({ active, payload, coordinate }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;

    const budget = data.budget || 0;
    const contract = data.contractAmount || 0;
    const disbursed = data.disbursedAmount || 0;
    const remaining = Math.max(0, contract - disbursed);
    const savings = Math.max(0, budget - contract);
    const disbursedPct = contract > 0 ? ((disbursed / contract) * 100).toFixed(1) : "0.0";
    const contractPct = budget > 0 ? ((contract / budget) * 100).toFixed(1) : "0.0";

    const { width, shiftX } = getSmartTooltipLayout(financialScrollContainerRef.current, coordinate?.x);

    return (
      <div
        style={{
          width: `${width}px`,
          transform: shiftX !== 0 ? `translateX(-${shiftX}px)` : undefined,
        }}
        className="bg-slate-900 text-white rounded-2xl p-3 sm:p-3.5 shadow-2xl border border-slate-700/90 text-xs font-['Sarabun',sans-serif] relative z-[99999] animate-in fade-in zoom-in-95 duration-150 pointer-events-none box-border"
      >
        {/* Header Badges */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-1.5 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="bg-indigo-500/25 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded-md text-[11px] font-semibold font-mono shrink-0">
              ปี {data.fiscalYear}
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-md text-[11px] font-semibold truncate max-w-[140px] sm:max-w-[180px]">
              {data.planName}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono shrink-0">
            #{data.index}
          </span>
        </div>

        {/* Project Title */}
        <h4 className="font-bold text-xs sm:text-[13px] text-white leading-snug mb-1 line-clamp-3 break-words">
          {data.fullName}
        </h4>
        {data.contractNumber && (
          <p className="text-[10px] text-slate-400 mb-1.5 flex items-center gap-1 min-w-0">
            <FileText className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="truncate">สัญญา: <strong className="text-slate-200 font-medium">{data.contractNumber}</strong></span>
          </p>
        )}

        {/* Financial Metrics Breakdown */}
        <div className="space-y-1.5 bg-slate-800/70 rounded-xl p-2.5 border border-slate-700/50 my-1.5">
          {/* 1. วงเงินโครงการ (Budget) */}
          <div className="flex items-center justify-between text-xs gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: financialColors.budget }} />
              <span className="text-slate-300 truncate">วงเงินงบประมาณ:</span>
            </div>
            <span className="font-bold text-white tabular-nums shrink-0 font-mono">
              {formatCurrency(budget)}
            </span>
          </div>

          {/* 2. วงเงินตามสัญญา (Contract) */}
          <div className="flex items-center justify-between text-xs gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: financialColors.contract }} />
              <span className="text-slate-300 truncate">วงเงินตามสัญญา:</span>
            </div>
            <div className="text-right shrink-0">
              <span className="font-bold text-blue-300 tabular-nums block font-mono">
                {formatCurrency(contract)}
              </span>
              <span className="text-[10px] text-slate-400 font-mono block">
                ({contractPct}% ของงบประมาณ)
              </span>
            </div>
          </div>

          {/* 3. เบิกจ่ายแล้ว (Disbursed) */}
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-700/50 gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: financialColors.disbursed }} />
              <span className="text-slate-300 truncate">เบิกจ่ายแล้ว:</span>
            </div>
            <div className="text-right shrink-0">
              <span className="font-bold text-emerald-400 tabular-nums block font-mono">
                {formatCurrency(disbursed)}
              </span>
              <span className="text-[10px] text-emerald-300 font-mono block">
                ({disbursedPct}% ของสัญญา)
              </span>
            </div>
          </div>
        </div>

        {/* Quick Summary Grid */}
        <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
          <div className="bg-slate-800/40 px-2 py-1.5 rounded-lg border border-slate-700/40 min-w-0 overflow-hidden">
            <span className="text-slate-400 block text-[10px] truncate">คงเหลือเบิกจ่าย:</span>
            <span className="font-semibold text-amber-300 tabular-nums font-mono text-[11px] sm:text-xs truncate block" title={formatCurrency(remaining)}>
              {formatCurrency(remaining)}
            </span>
          </div>
          <div className="bg-slate-800/40 px-2 py-1.5 rounded-lg border border-slate-700/40 min-w-0 overflow-hidden">
            <span className="text-slate-400 block text-[10px] truncate">ประหยัดงบ (จัดจ้าง):</span>
            <span className="font-semibold text-sky-300 tabular-nums font-mono text-[11px] sm:text-xs truncate block" title={formatCurrency(savings)}>
              {formatCurrency(savings)}
            </span>
          </div>
        </div>

        <div className="mt-2 pt-1.5 border-t border-slate-700/60 flex items-center justify-center text-[10px] text-slate-400 text-center">
          <span>💡 คลิกหรือแตะแท่งกราฟเพื่อเปิดดูรายละเอียด</span>
        </div>
      </div>
    );
  };

  // Interactive Modern Executive Hover Popup Tooltip for Progress Chart (%)
  const CustomProgressTooltip = ({ active, payload, coordinate }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;

    const plan = data.planPercent || 0;
    const actual = data.actualPercent || 0;
    const disbursed = data.disbursedPercent || 0;
    const delta = data.delta !== undefined ? data.delta : (actual - plan);
    const isAhead = delta >= 0;

    const { width, shiftX } = getSmartTooltipLayout(progressScrollContainerRef.current, coordinate?.x);

    return (
      <div
        style={{
          width: `${width}px`,
          transform: shiftX !== 0 ? `translateX(-${shiftX}px)` : undefined,
        }}
        className="bg-slate-900 text-white rounded-2xl p-3 sm:p-3.5 shadow-2xl border border-slate-700/90 text-xs font-['Sarabun',sans-serif] relative z-[99999] animate-in fade-in zoom-in-95 duration-150 pointer-events-none box-border"
      >
        {/* Header Badges */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-1.5 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="bg-emerald-500/25 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-md text-[11px] font-semibold font-mono shrink-0">
              ปี {data.fiscalYear}
            </span>
            <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded-md text-[11px] font-semibold truncate max-w-[140px] sm:max-w-[180px]">
              {data.planName}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono shrink-0">
            #{data.index}
          </span>
        </div>

        {/* Project Title */}
        <h4 className="font-bold text-xs sm:text-[13px] text-white leading-snug mb-1 line-clamp-3 break-words">
          {data.fullName}
        </h4>
        {data.contractNumber && (
          <p className="text-[10px] text-slate-400 mb-1.5 flex items-center gap-1 min-w-0">
            <FileText className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="truncate">สัญญา: <strong className="text-slate-200 font-medium">{data.contractNumber}</strong></span>
          </p>
        )}

        {/* Progress Breakdown with Visual Bars */}
        <div className="space-y-2 bg-slate-800/70 rounded-xl p-2.5 border border-slate-700/50 my-1.5">
          {/* 1. แผนงานสะสม */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: progressColors.plan }} />
                <span className="text-slate-300 truncate">แผนงานสะสม:</span>
              </div>
              <span className="font-bold text-white tabular-nums font-mono shrink-0">{plan}%</span>
            </div>
            <div className="w-full bg-slate-700/80 rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, plan))}%`, backgroundColor: progressColors.plan }} />
            </div>
          </div>

          {/* 2. ผลงานจริงในสนาม */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: progressColors.actual }} />
                <span className="text-slate-300 truncate">ผลงานจริงในสนาม:</span>
              </div>
              <span className={`font-bold tabular-nums font-mono shrink-0 ${isAhead ? "text-emerald-400" : "text-amber-400"}`}>
                {actual}%
              </span>
            </div>
            <div className="w-full bg-slate-700/80 rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, actual))}%`, backgroundColor: progressColors.actual }} />
            </div>
          </div>

          {/* 3. ยอดการเบิกจ่าย */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: progressColors.disbursed }} />
                <span className="text-slate-300 truncate">ยอดเบิกจ่ายเงิน (%):</span>
              </div>
              <span className="font-bold text-amber-300 tabular-nums font-mono shrink-0">{disbursed}%</span>
            </div>
            <div className="w-full bg-slate-700/80 rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, disbursed))}%`, backgroundColor: progressColors.disbursed }} />
            </div>
          </div>
        </div>

        {/* Delta / Performance Variance Indicator */}
        <div className="flex items-center justify-between bg-slate-800/50 px-2.5 py-1.5 rounded-xl border border-slate-700/40 gap-2 min-w-0">
          <span className="text-[11px] text-slate-300 shrink-0">ดัชนีผลงานเทียบแผน:</span>
          <span className={`px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold flex items-center gap-1 font-mono shrink-0 ${
            isAhead 
              ? "bg-emerald-500/25 text-emerald-300 border border-emerald-400/30" 
              : "bg-rose-500/25 text-rose-300 border border-rose-400/30"
          }`}>
            {isAhead ? "▲ +" : "▼ "}
            {Math.abs(delta).toFixed(1)}% {isAhead ? "(เร็วกว่าแผน)" : "(ช้ากว่าแผน)"}
          </span>
        </div>

        <div className="mt-2 pt-1.5 border-t border-slate-700/60 flex items-center justify-center text-[10px] text-slate-400 text-center">
          <span>💡 คลิกหรือแตะแท่งกราฟเพื่อเปิดดูรายละเอียด</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Fiscal Year & Plan Selector Panel */}
      <div className="bg-white rounded-2xl shadow-2xs border border-slate-200/80 p-5 sm:p-6 flex flex-col lg:flex-row justify-between items-stretch lg:items-end gap-4 font-['Sarabun',sans-serif]">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto">
          {/* Fiscal Year Dropdown */}
          <div className="space-y-1.5 shrink-0" ref={yearDropdownRef}>
            <div className="h-5 flex items-center">
              <label className="block text-xs sm:text-[13px] font-semibold text-slate-600">
                เลือกปีงบประมาณ
              </label>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsYearDropdownOpen(!isYearDropdownOpen);
                  setIsPlanDropdownOpen(false);
                }}
                className={`w-full sm:w-auto min-w-[200px] sm:min-w-[220px] h-[54px] px-3.5 bg-white hover:bg-slate-50 border rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-between gap-3 shadow-2xs ${
                  isYearDropdownOpen
                    ? "border-slate-800 ring-2 ring-slate-800/10 text-slate-900 bg-slate-50/80"
                    : "border-slate-200/90 hover:border-slate-300 text-slate-800"
                }`}
                aria-expanded={isYearDropdownOpen}
                aria-haspopup="listbox"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col items-start min-w-0 text-left">
                    <span className="truncate tabular-nums font-bold text-slate-900 text-xs sm:text-sm leading-tight">
                      พ.ศ. {selectedYear}
                    </span>
                    <span className="text-[10px] text-slate-500 font-normal leading-tight truncate mt-0.5">
                      ปีงบประมาณ ({fiscalYears.length} ปีในระบบ)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    {projectsInYear.length} โครงการ
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                      isYearDropdownOpen ? "rotate-180 text-slate-700" : ""
                    }`}
                  />
                </div>
              </button>

              {/* Year Dropdown Menu */}
              {isYearDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-full sm:w-64 bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-40 animate-fadeIn">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 flex items-center justify-between">
                    <span>ปีงบประมาณ</span>
                    <span className="text-[10px] font-mono">({fiscalYears.length} ปี)</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto custom-scrollbar p-1 space-y-0.5">
                    {fiscalYears.map((year) => {
                      const countForYear = projects.filter((p) => p.fiscalYear === year).length;
                      const isSelected = selectedYear === year;
                      return (
                        <button
                          key={year}
                          type="button"
                          onClick={() => {
                            setSelectedYear(year);
                            // If viewing all plans, maintain ALL_PLANS mode across fiscal years
                            if (selectedPlan !== "ALL_PLANS") {
                              const plans = Array.from(
                                new Set(projects.filter((p) => p.fiscalYear === year).map((p) => p.planName))
                              ).sort();
                              if (plans.length > 0) {
                                setSelectedPlan(plans[0]);
                              } else {
                                setSelectedPlan("");
                              }
                            }
                            setIsYearDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 rounded-lg text-xs sm:text-sm text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-slate-900 text-white font-bold"
                              : "text-slate-700 hover:bg-slate-100 font-medium"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Calendar className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-emerald-400" : "text-slate-400"}`} />
                            <span className="truncate">พ.ศ. {year}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                                isSelected
                                  ? "bg-white/20 text-white"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {countForYear} โครงการ
                            </span>
                            {isSelected && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Plan / Project Overview Dropdown */}
          <div className="space-y-1.5 flex-1 min-w-[260px] sm:min-w-[320px] max-w-xl" ref={planDropdownRef}>
            <div className="h-5 flex items-center justify-between gap-2">
              <label className="block text-xs sm:text-[13px] font-semibold text-slate-600">
                เลือกแผนงาน / ภาพรวมโครงการ
              </label>
              <span className="text-[11px] text-slate-500 font-medium hidden sm:inline-block">
                {isAllPlans
                  ? `รวมทุกแผนงานย่อย (${projectsInYear.length} โครงการ)`
                  : `เฉพาะแผนงาน ${selectedPlan} (${filteredProjects.length} โครงการ)`}
              </span>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsPlanDropdownOpen(!isPlanDropdownOpen);
                  setIsYearDropdownOpen(false);
                }}
                className={`w-full h-[54px] px-3.5 bg-white hover:bg-slate-50 border rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-between gap-2.5 shadow-2xs ${
                  isPlanDropdownOpen
                    ? "border-emerald-600 ring-2 ring-emerald-600/15 text-slate-900 bg-slate-50/80"
                    : isAllPlans
                    ? "border-slate-300 hover:border-slate-400 text-slate-900"
                    : "border-emerald-500/60 hover:border-emerald-600 text-slate-900"
                }`}
                aria-expanded={isPlanDropdownOpen}
                aria-haspopup="listbox"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`p-1.5 rounded-lg shrink-0 ${
                      isAllPlans
                        ? "bg-slate-900 text-emerald-400"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    <Layers className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col items-start min-w-0 text-left">
                    <span className="truncate font-bold text-slate-900 text-xs sm:text-sm">
                      {isAllPlans ? "รวมทุกแผนงานย่อย (ภาพรวมทุกโครงการ)" : selectedPlan}
                    </span>
                    <span className="text-[10px] text-slate-500 font-normal leading-tight truncate">
                      {isAllPlans
                        ? `ประจำปี พ.ศ. ${selectedYear} (${plansInYear.length} แผนงาน)`
                        : `แผนงานย่อยประจำปี พ.ศ. ${selectedYear}`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      isAllPlans
                        ? "bg-slate-900 text-emerald-400"
                        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    }`}
                  >
                    {filteredProjects.length} โครงการ
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                      isPlanDropdownOpen ? "rotate-180 text-slate-700" : ""
                    }`}
                  />
                </div>
              </button>

              {/* Plan Dropdown Menu */}
              {isPlanDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-full bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-40 animate-fadeIn">
                  <div className="p-1 space-y-1 max-h-72 overflow-y-auto custom-scrollbar">
                    {/* Option: All Sub-plans Aggregated */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPlan("ALL_PLANS");
                        setIsPlanDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2.5 rounded-lg text-xs sm:text-sm text-left flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                        isAllPlans
                          ? "bg-slate-900 text-white font-bold"
                          : "text-slate-800 hover:bg-slate-100 font-medium"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`p-1.5 rounded-md shrink-0 ${
                            isAllPlans ? "bg-white/20 text-emerald-300" : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          <Layers className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold truncate">รวมทุกแผนงานย่อย (ภาพรวมทุกโครงการ)</div>
                          <div className={`text-[11px] truncate ${isAllPlans ? "text-slate-300" : "text-slate-500"}`}>
                            วิเคราะห์และเปรียบเทียบทุกแผนงานย่อยของปี พ.ศ. {selectedYear}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                            isAllPlans
                              ? "bg-emerald-500/25 text-emerald-300 border border-emerald-400/30"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {projectsInYear.length} โครงการ
                        </span>
                        {isAllPlans && <Check className="h-4 w-4 text-emerald-400 shrink-0" />}
                      </div>
                    </button>

                    {/* Section Divider */}
                    {plansInYear.length > 0 && (
                      <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-t border-slate-100 flex items-center justify-between">
                        <span>จำแนกตามแผนงานย่อย</span>
                        <span className="text-[10px] font-mono text-slate-400">({plansInYear.length} แผนงาน)</span>
                      </div>
                    )}

                    {/* Individual Sub-plans */}
                    {plansInYear.map((plan) => {
                      const countInPlan = projectsInYear.filter((p) => p.planName === plan).length;
                      const isSelected = !isAllPlans && selectedPlan === plan;
                      return (
                        <button
                          key={plan}
                          type="button"
                          onClick={() => {
                            setSelectedPlan(plan);
                            setIsPlanDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 rounded-lg text-xs sm:text-sm text-left flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-emerald-600 text-white font-bold"
                              : "text-slate-700 hover:bg-slate-50 font-medium"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                isSelected ? "bg-white" : "bg-emerald-500"
                              }`}
                            />
                            <span className="truncate">{plan}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                                isSelected
                                  ? "bg-emerald-700/80 text-white"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {countInPlan} โครงการ
                            </span>
                            {isSelected && <Check className="h-4 w-4 text-white shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons: Add New Project */}
        {isAdmin && (
          <div className="flex items-center gap-2.5 self-stretch lg:self-auto justify-end shrink-0 pt-2 lg:pt-0">
            <button
              onClick={onAddProjectClick}
              className="h-[54px] bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-xs sm:text-sm rounded-xl px-5 flex items-center gap-2 shadow-2xs hover:shadow-xs transition-all cursor-pointer justify-center shrink-0"
            >
              <PlusCircle className="h-4 w-4" />
              <span>เพิ่มโครงการใหม่</span>
            </button>
          </div>
        )}
      </div>

      {/* Aggregation Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 font-['Sarabun',sans-serif]">
        {/* Total Projects */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <span className="text-xs sm:text-[13px] font-semibold text-slate-600 block">
              {isAllPlans ? "โครงการทั้งหมดรายปี" : "โครงการภายใต้แผน"}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight tabular-nums">
                {filteredProjects.length}
              </span>
              <span className="text-xs sm:text-sm font-normal text-slate-500">โครงการ</span>
            </div>
            <p className="text-xs font-normal text-slate-500 truncate">
              แผนงาน: <strong className="font-semibold text-slate-700">{isAllPlans ? `รวมทุกแผนงานย่อย (${plansInYear.length} แผนงาน)` : (selectedPlan || "ทั้งหมด")}</strong>
            </p>
          </div>
          <div className="bg-indigo-50/80 border border-indigo-100 p-3.5 rounded-2xl shrink-0">
            <Briefcase className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600" />
          </div>
        </div>

        {/* Total Budget */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <span className="text-xs sm:text-[13px] font-semibold text-slate-600 block">
              วงเงินงบประมาณรวม
            </span>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-xl sm:text-2xl lg:text-[25px] font-bold text-slate-900 tracking-tight tabular-nums">
                {formatNumberOnly(totalBudget)}
              </span>
              <span className="text-xs sm:text-sm font-normal text-slate-500">บาท</span>
            </div>
            <p className="text-xs font-medium text-emerald-700 flex items-center gap-1">
              <span>✓</span>
              <span>งบประมาณที่กำหนดไว้ทั้งหมด</span>
            </p>
          </div>
          <div className="bg-emerald-50/80 border border-emerald-100 p-3.5 rounded-2xl shrink-0">
            <Layers className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600" />
          </div>
        </div>

        {/* Total Contract Amount */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <span className="text-xs sm:text-[13px] font-semibold text-slate-600 block">
              วงเงินผูกพันสัญญา
            </span>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-xl sm:text-2xl lg:text-[25px] font-bold text-slate-900 tracking-tight tabular-nums">
                {formatNumberOnly(totalContract)}
              </span>
              <span className="text-xs sm:text-sm font-normal text-slate-500">บาท</span>
            </div>
            <p className="text-xs font-normal text-slate-500">
              คิดเป็น <strong className="font-semibold text-slate-800 tabular-nums font-mono">{totalBudget > 0 ? Math.round((totalContract / totalBudget) * 100) : 0}%</strong> ของวงเงินรวม
            </p>
          </div>
          <div className="bg-amber-50/80 border border-amber-100 p-3.5 rounded-2xl shrink-0">
            <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600" />
          </div>
        </div>

        {/* Cumulative Disbursement */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <span className="text-xs sm:text-[13px] font-semibold text-slate-600 block">
              ยอดเบิกจ่ายสะสม
            </span>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-xl sm:text-2xl lg:text-[25px] font-bold text-slate-900 tracking-tight tabular-nums">
                {formatNumberOnly(totalDisbursed)}
              </span>
              <span className="text-xs sm:text-sm font-normal text-slate-500">บาท</span>
            </div>
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-md font-mono tabular-nums">
                {disbursementPercent}%
              </span>
              <span className="text-xs font-normal text-slate-500">ของวงเงินสัญญา</span>
            </div>
          </div>
          <div className="bg-rose-50/80 border border-rose-100 p-3.5 rounded-2xl shrink-0">
            <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-rose-600" />
          </div>
        </div>
      </div>

      {/* Overdue Projects & Liquidated Damages Alert Banner (Rendered when there are projects past contract end date or completed with fine) */}
      {overdueProjectsList.length > 0 && (
        <div className={`p-5 sm:p-6 rounded-2xl border shadow-xs space-y-4 animate-in fade-in duration-200 font-['Sarabun',sans-serif] ${
          hasCriticalCapProjects
            ? "bg-rose-50/70 border-rose-200"
            : "bg-amber-50/60 border-amber-200"
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3.5 border-rose-200/60">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl ${hasCriticalCapProjects ? "bg-rose-600 text-white animate-pulse" : "bg-amber-500 text-white"}`}>
                <Scale className="h-6 w-6" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-base sm:text-lg font-bold text-slate-900">
                    แจ้งเตือนโครงการสิ้นสุดกรอบระยะเวลาสัญญา / อยู่ระหว่างคิดค่าปรับ
                  </h4>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                    hasCriticalCapProjects
                      ? "bg-rose-600 text-white font-mono"
                      : "bg-amber-600 text-white font-mono"
                  }`}>
                    {overdueProjectsList.length} โครงการ
                  </span>
                  {completedFinedCount > 0 && ongoingCount > 0 && (
                    <>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-200">
                        อยู่ระหว่างคิดค่าปรับ {ongoingCount}
                      </span>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-200">
                        แล้วเสร็จ (คิดค่าปรับ) {completedFinedCount}
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">
                  {completedFinedCount > 0
                    ? "โครงการที่เลยกำหนดสิ้นสุดสัญญา (อยู่ระหว่างคิดค่าปรับ) และโครงการที่แล้วเสร็จที่โดนคิดค่าปรับส่งมอบงานล่าช้า ตามระเบียบการจัดซื้อจัดจ้างภาครัฐ"
                    : "โครงการที่เลยกำหนดสิ้นสุดสัญญาแล้วแต่งานยังไม่แล้วเสร็จ 100% ตามระเบียบการจัดซื้อจัดจ้างภาครัฐ"}
                </p>
              </div>
            </div>

            <div className="text-right shrink-0 bg-white/90 px-4 py-2.5 rounded-xl border border-rose-200/80 shadow-2xs">
              <span className="text-xs font-medium text-slate-600 block">
                {completedFinedCount > 0 && ongoingCount > 0
                  ? "ยอดคิดค่าปรับรวมทั้งหมด"
                  : completedFinedCount > 0
                  ? "ยอดคิดค่าปรับแล้วเสร็จรวม"
                  : "ยอดคิดค่าปรับสะสมรวม"}
              </span>
              <p className="text-lg sm:text-xl font-bold text-rose-700 font-mono">
                {totalOverdueFines.toLocaleString()} <span className="text-xs font-semibold font-['Sarabun',sans-serif]">บาท</span>
              </p>
              {completedFinedCount > 0 && ongoingCount > 0 && (
                <div className="text-[11px] text-slate-500 font-normal flex items-center justify-end gap-1.5 mt-0.5">
                  <span>กำลังปรับ {ongoingOverdueFines.toLocaleString()} บ.</span>
                  <span>•</span>
                  <span>แล้วเสร็จ {completedFines.toLocaleString()} บ.</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Filter Tabs inside Banner (when there are completed fined projects) */}
          {completedFinedCount > 0 && (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span className="text-xs font-semibold text-slate-700">ตัวกรองโครงการ:</span>
              <button
                type="button"
                onClick={() => setOverdueBannerFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer font-['Sarabun',sans-serif] ${
                  overdueBannerFilter === "all"
                    ? "bg-slate-900 text-white shadow-2xs"
                    : "bg-white/90 text-slate-700 hover:bg-white border border-slate-200"
                }`}
              >
                ทั้งหมด ({overdueProjectsList.length})
              </button>
              <button
                type="button"
                onClick={() => setOverdueBannerFilter("ongoing")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer font-['Sarabun',sans-serif] ${
                  overdueBannerFilter === "ongoing"
                    ? "bg-rose-700 text-white shadow-2xs"
                    : "bg-white/90 text-slate-700 hover:bg-white border border-slate-200"
                }`}
              >
                ⏳ อยู่ระหว่างคิดค่าปรับ ({ongoingCount})
              </button>
              <button
                type="button"
                onClick={() => setOverdueBannerFilter("completed")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer font-['Sarabun',sans-serif] ${
                  overdueBannerFilter === "completed"
                    ? "bg-amber-700 text-white shadow-2xs"
                    : "bg-white/90 text-slate-700 hover:bg-white border border-slate-200"
                }`}
              >
                ⚖️ แล้วเสร็จ (โดนคิดค่าปรับ) ({completedFinedCount})
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
            {displayedOverdueProjects.map(({ project, penalty, info, isCompletedWithFine }, oIdx) => (
              <div
                key={`overdue-${project.sheetName || project.projectName || "proj"}-${project.fiscalYear || ""}-${project.planName || ""}-${oIdx}`}
                onClick={() => onSelectProject(project)}
                className="bg-white hover:bg-slate-50/90 border border-slate-200/90 hover:border-indigo-300 rounded-2xl p-4 shadow-2xs cursor-pointer transition-all flex flex-col justify-between gap-3 group font-['Sarabun',sans-serif]"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${penalty.badgeClasses.bg} ${penalty.badgeClasses.text} ${penalty.badgeClasses.border}`}>
                      <span>{penalty.badgeClasses.icon}</span>
                      <span>{penalty.statusTitle}</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-rose-600 shrink-0">
                      +{penalty.overdueDays} วัน
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {isCompletedWithFine ? (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-200 shrink-0">
                          ✓ แล้วเสร็จ 100%
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-rose-50 text-rose-900 border border-rose-200 shrink-0">
                          ⌛ ยังไม่แล้วเสร็จ ({info.actualPercent ?? project.progressField}%)
                        </span>
                      )}
                    </div>
                    <h5 className="text-xs sm:text-sm font-semibold text-slate-900 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">
                      {project.projectName}
                    </h5>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs pt-2.5 border-t border-slate-100">
                  <span className="text-slate-500 font-medium">
                    {isCompletedWithFine ? "ยอดคิดค่าปรับสุทธิ:" : "ค่าปรับสะสม:"}
                  </span>
                  <span className="font-mono font-bold text-rose-700">
                    {penalty.totalFineAmount.toLocaleString()} บ. ({penalty.finePercentOfBudget.toFixed(1)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Executive Pie / Donut Chart Analytics Panel - BEFORE OVERALL PHYSICAL WORK PROGRESS */}
      <div className="bg-white p-4 sm:p-6 lg:p-7 rounded-2xl border border-slate-100 shadow-sm space-y-6 overflow-hidden max-w-full font-['Sarabun',sans-serif]">
        {/* Header and Controls */}
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 w-full min-w-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="bg-emerald-50 p-3 rounded-2xl shrink-0 border border-emerald-100">
              <PieChartIcon className="h-6 w-6 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  สรุปสัดส่วนภาพรวม (Visual & Multi-Chart Analytics)
                </h3>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0">
                  EXECUTIVE VIEW
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate sm:whitespace-normal">
                วิเคราะห์สัดส่วนเปรียบเทียบงบประมาณ การเบิกจ่าย และสถานะความก้าวหน้าโครงการ
              </p>
            </div>
          </div>

          {/* Controls: Mode Selector, Type Toggle, Owner Customization */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 w-full min-w-0">
            {/* Mode Select Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200 min-w-0 w-full xl:w-auto shrink-0">
              <span className="text-xs font-medium text-slate-600 pl-1.5 shrink-0 whitespace-nowrap">
                ตัวเปรียบเทียบ:
              </span>
              <select
                value={pieCompareMode}
                onChange={(e) => {
                  setPieCompareMode(e.target.value as any);
                  setActivePieIndex(0);
                }}
                className="bg-white text-slate-900 text-xs sm:text-sm font-medium rounded-lg px-2.5 py-1.5 border border-slate-200 shadow-2xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer w-full xl:w-auto xl:max-w-[340px] truncate min-w-0 flex-1 xl:flex-initial"
              >
                <option value="project_vs_budget">📊 สัดส่วนงบประมาณรายโครงการ เทียบกับ วงเงินงบประมาณรวม</option>
                <option value="project_vs_contract">📝 สัดส่วนงบประมาณรายโครงการ เทียบกับ วงเงินผูกพันสัญญา</option>
                <option value="project_vs_disbursed">💳 สัดส่วนงบประมาณรายโครงการ เทียบกับ ยอดเบิกจ่ายสะสม</option>
                <option value="project_vs_progress">📈 สัดส่วนงบประมาณรายโครงการ เทียบกับ ผลงานสะสม</option>
                <option value="project_vs_duration">⏳ สัดส่วนงบประมาณรายโครงการ เทียบกับ อายุสัญญาคงเหลือ</option>
                <option value="plan_vs_budget">📁 สัดส่วนงบประมาณตามแผนงานประจำปี เทียบกับ วงเงินงบประมาณรวม</option>
                <option value="plan_vs_contract">📂 สัดส่วนงบประมาณตามแผนงานประจำปี เทียบกับ วงเงินผูกพันสัญญา</option>
                <option value="plan_vs_disbursed">💰 สัดส่วนงบประมาณตามแผนงานประจำปี เทียบกับ ยอดเบิกจ่ายสะสม</option>
                <option value="plan_vs_progress">🎯 สัดส่วนงบประมาณตามแผนงานประจำปี เทียบกับ ผลงานสะสม</option>
                <option value="plan_vs_duration">📅 สัดส่วนงบประมาณตามแผนงานประจำปี เทียบกับ อายุสัญญาคงเหลือ</option>
              </select>
            </div>

            <div className="flex items-center gap-2 min-w-0 w-full xl:w-auto">
              {/* Diverse Chart Type Selector */}
              <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/90 shadow-2xs gap-1 overflow-x-auto w-full min-w-0 max-w-full touch-pan-x scrollbar-thin">
                <button
                  type="button"
                  onClick={() => handleSelectChartType("donut")}
                  title="โดนัท (Donut Chart) - วงแหวนพร้อมสรุปยอดตรงกลาง"
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    pieChartType === "donut"
                      ? "bg-white text-emerald-800 shadow-xs font-semibold ring-1 ring-emerald-600/20"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                >
                  <span className="text-sm leading-none">🍩</span>
                  <span>โดนัท</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectChartType("pie")}
                  title="แผนภูมิกลม (Pie Chart) - วงกลมทึบแสดงสัดส่วนร้อยละ"
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    pieChartType === "pie"
                      ? "bg-white text-emerald-800 shadow-xs font-semibold ring-1 ring-emerald-600/20"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                >
                  <span className="text-sm leading-none">🥧</span>
                  <span>วงกลม</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectChartType("semi_donut")}
                  title="กึ่งวงกลม (Semi-Donut Gauge) - เกจวัด 180° สไตล์ผู้บริหาร"
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    pieChartType === "semi_donut"
                      ? "bg-white text-emerald-800 shadow-xs font-semibold ring-1 ring-emerald-600/20"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                >
                  <span className="text-sm leading-none">🧭</span>
                  <span>กึ่งวงกลม</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectChartType("radial")}
                  title="เรเดียลบาร์ (Radial Rings) - วงแหวนซ้อนหลายชั้นเปรียบเทียบสัดส่วน"
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    pieChartType === "radial"
                      ? "bg-white text-emerald-800 shadow-xs font-semibold ring-1 ring-emerald-600/20"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                >
                  <span className="text-sm leading-none">🎯</span>
                  <span>เรเดียล</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectChartType("bar")}
                  title="แท่งจัดอันดับ (Ranking Bars) - กราฟแท่งแนวนอนเรียงลำดับเปรียบเทียบชัดเจน"
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    pieChartType === "bar"
                      ? "bg-white text-emerald-800 shadow-xs font-semibold ring-1 ring-emerald-600/20"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                >
                  <span className="text-sm leading-none">📊</span>
                  <span>แท่งจัดอันดับ</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectChartType("treemap")}
                  title="ทรีแมป (Treemap Area) - พื้นที่สี่เหลี่ยมตามสัดส่วนมูลค่า"
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    pieChartType === "treemap"
                      ? "bg-white text-emerald-800 shadow-xs font-semibold ring-1 ring-emerald-600/20"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                >
                  <span className="text-sm leading-none">🗺️</span>
                  <span>ทรีแมป</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectChartType("rose")}
                  title="กุหลาบไนติงเกล (Nightingale Rose / Polar Area) - สัดส่วนรัศมีความยาวกลีบกุหลาบ"
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    pieChartType === "rose"
                      ? "bg-white text-emerald-800 shadow-xs font-semibold ring-1 ring-emerald-600/20"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                >
                  <span className="text-sm leading-none">🌹</span>
                  <span>ไนติงเกล</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectChartType("radar")}
                  title="เรดาร์ / ใยแมงมุม (Radar / Spider Chart) - เปรียบเทียบกระจายหลายมิติ"
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    pieChartType === "radar"
                      ? "bg-white text-emerald-800 shadow-xs font-semibold ring-1 ring-emerald-600/20"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                >
                  <span className="text-sm leading-none">🕸️</span>
                  <span>เรดาร์</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectChartType("funnel")}
                  title="กรวยสัดส่วน (Funnel / Pyramid Chart) - ลำดับชั้นสัดส่วนจากมากไปน้อย"
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    pieChartType === "funnel"
                      ? "bg-white text-emerald-800 shadow-xs font-semibold ring-1 ring-emerald-600/20"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                >
                  <span className="text-sm leading-none">🔻</span>
                  <span>กรวยสัดส่วน</span>
                </button>
              </div>

              {/* Owner Color Customization Button */}
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setIsPieControlOpen(!isPieControlOpen)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer border shrink-0 whitespace-nowrap ${
                    isPieControlOpen
                      ? "bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-500/20"
                      : "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
                  }`}
                >
                  <Palette className="h-4 w-4" />
                  <span>ปรับแต่งสี (Owner)</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Owner Color Customization Drawer / Panel */}
        {isOwner && isPieControlOpen && (
          <div className="bg-gradient-to-r from-amber-50/90 via-amber-50/50 to-orange-50/90 border border-amber-200/80 rounded-2xl p-4 sm:p-5 shadow-inner space-y-4">
            <div className="flex items-center justify-between border-b border-amber-200/60 pb-3">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-amber-600" />
                <h4 className="text-xs sm:text-sm font-black text-amber-950">
                  🎨 แผงควบคุมโทนสีแผนภูมิกลมสำหรับ Owner
                </h4>
              </div>
              <button
                type="button"
                onClick={handleResetPieColors}
                className="flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-rose-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 hover:border-rose-300 transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>รีเซ็ตสีเริ่มต้น</span>
              </button>
            </div>

            {/* Preset Palettes */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">
                เลือกธีมสีสำเร็จรูป (Preset Palettes):
              </span>
              <div className="flex flex-wrap gap-2">
                {PRESET_PALETTES.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyPresetPalette(preset.colors)}
                    className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-amber-200 hover:border-amber-400 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-800 shadow-2xs transition-all cursor-pointer group"
                  >
                    <span>{preset.name}</span>
                    <div className="flex items-center -space-x-1">
                      {preset.colors.slice(0, 4).map((c, cIdx) => (
                        <div
                          key={cIdx}
                          className="w-3.5 h-3.5 rounded-full border border-white shadow-2xs"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Individual Color Pickers for Slices */}
            <div className="space-y-2 pt-2 border-t border-amber-200/60">
              <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">
                ปรับสีตามส่วนประกอบแผนภูมิ ({pieData.length} รายการ):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {pieData.map((item, idx) => {
                  const currentColor =
                    pieCustomColors[idx % pieCustomColors.length] ||
                    DEFAULT_PIE_COLORS[idx % DEFAULT_PIE_COLORS.length];
                  return (
                    <div
                      key={idx}
                      className="bg-white p-2 rounded-xl border border-amber-200/80 shadow-2xs flex items-center justify-between gap-1.5"
                    >
                      <span className="text-[10px] font-bold text-slate-700 truncate min-w-0" title={item.name}>
                        {item.name}
                      </span>
                      <input
                        type="color"
                        value={currentColor}
                        onChange={(e) => handleUpdatePieColor(idx, e.target.value)}
                        className="w-6 h-6 rounded-md border-0 p-0 cursor-pointer shrink-0"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Main Chart & Side Info Cards Container */}
        {pieData.length > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Pie / Donut Canvas Container */}
              <div
                className="lg:col-span-6 relative flex flex-col items-center justify-center transition-[height] duration-75"
                style={{
                  height: `${pieFrameHeight}px`,
                  minHeight: `${MIN_PIE_FRAME_HEIGHT}px`,
                }}
              >
                <div className="w-full h-full relative flex items-center justify-center">
                  {/* 1. DONUT CHART */}
                  {pieChartType === "donut" && (
                    <div className="w-full h-full relative flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={dynamicInnerRadius}
                            outerRadius={dynamicOuterRadius}
                            paddingAngle={3}
                            dataKey="value"
                            labelLine={false}
                            label={renderPieLabel}
                            onMouseEnter={(_, index) => setActivePieIndex(index)}
                            animationDuration={800}
                          >
                            {renderPieSliceCells()}
                          </Pie>
                          <Tooltip
                            wrapperStyle={{ zIndex: 99999, pointerEvents: "none" }}
                            allowEscapeViewBox={{ x: true, y: true }}
                            offset={25}
                            content={renderPieTooltipContent}
                          />
                        </PieChart>
                      </ResponsiveContainer>

                      {/* Center Overlay Card for Donut */}
                      <div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none bg-white/95 backdrop-blur-md p-3 rounded-full flex flex-col items-center justify-center shadow-md border-2 border-slate-100 z-10 transition-all"
                        style={{
                          width: `${donutCenterSize}px`,
                          height: `${donutCenterSize}px`,
                        }}
                      >
                        <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                          {getModeSummaryLabel()}
                        </p>
                        <p className="text-xs sm:text-base font-black text-slate-900 font-mono tracking-tight mt-1 px-2 text-center leading-tight">
                          {getModeSummaryValue()}
                        </p>
                        <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full mt-1.5 shadow-2xs">
                          100% Total ({pieData.length} รายการ)
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 2. SOLID PIE CHART */}
                  {pieChartType === "pie" && (
                    <div className="w-full h-full relative flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={0}
                            outerRadius={dynamicOuterRadius}
                            paddingAngle={1.5}
                            dataKey="value"
                            labelLine={false}
                            label={renderPieLabel}
                            onMouseEnter={(_, index) => setActivePieIndex(index)}
                            animationDuration={800}
                          >
                            {renderPieSliceCells()}
                          </Pie>
                          <Tooltip
                            wrapperStyle={{ zIndex: 99999, pointerEvents: "none" }}
                            allowEscapeViewBox={{ x: true, y: true }}
                            offset={25}
                            content={renderPieTooltipContent}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* 3. SEMI-DONUT GAUGE (180°) */}
                  {pieChartType === "semi_donut" && (
                    <div className="w-full h-full relative flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="70%"
                            startAngle={180}
                            endAngle={0}
                            innerRadius={Math.round(dynamicOuterRadius * 0.72)}
                            outerRadius={Math.round(dynamicOuterRadius * 1.25)}
                            paddingAngle={2.5}
                            dataKey="value"
                            labelLine={false}
                            label={renderPieLabel}
                            onMouseEnter={(_, index) => setActivePieIndex(index)}
                            animationDuration={800}
                          >
                            {renderPieSliceCells()}
                          </Pie>
                          <Tooltip
                            wrapperStyle={{ zIndex: 99999, pointerEvents: "none" }}
                            allowEscapeViewBox={{ x: true, y: true }}
                            offset={25}
                            content={renderPieTooltipContent}
                          />
                        </PieChart>
                      </ResponsiveContainer>

                      {/* Semi-Donut Bottom Summary Badge */}
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-center pointer-events-none bg-white/95 backdrop-blur-md px-5 py-2.5 rounded-2xl shadow-md border border-slate-200/90 z-10 min-w-[210px]">
                        <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                          {getModeSummaryLabel()}
                        </p>
                        <p className="text-sm sm:text-base font-black text-slate-900 font-mono tracking-tight mt-0.5">
                          {getModeSummaryValue()}
                        </p>
                        <div className="flex items-center justify-center gap-1.5 mt-1">
                          <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            เกจวัดสัดส่วน 180° ({pieData.length} รายการ)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 4. RADIAL BAR RINGS */}
                  {pieChartType === "radial" && (
                    <div className="w-full h-full relative flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart
                          cx="50%"
                          cy="50%"
                          innerRadius="20%"
                          outerRadius="95%"
                          barSize={Math.max(9, Math.min(22, Math.round(pieFrameHeight / (pieData.length * 3.2))))}
                          data={radialData}
                          startAngle={90}
                          endAngle={-270}
                        >
                          <RadialBar
                            background={{ fill: "#f1f5f9" }}
                            dataKey="value"
                            cornerRadius={8}
                            onClick={(entry: any) => {
                              if (entry?.project) onSelectProject(entry.project);
                              else if (entry?.planKey) setSelectedPlan(entry.planKey);
                            }}
                          >
                            {radialData.map((entry, index) => (
                              <Cell
                                key={`radial-cell-${index}`}
                                fill={entry.fill}
                                className="cursor-pointer hover:opacity-90"
                              />
                            ))}
                          </RadialBar>
                          <Tooltip
                            wrapperStyle={{ zIndex: 99999, pointerEvents: "none" }}
                            allowEscapeViewBox={{ x: true, y: true }}
                            offset={25}
                            content={renderPieTooltipContent}
                          />
                        </RadialBarChart>
                      </ResponsiveContainer>

                      {/* Radial Center Ring Icon */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none bg-white/95 backdrop-blur-md p-2 rounded-full shadow-md border border-slate-200 z-10 w-24 h-24 sm:w-28 sm:h-28 flex flex-col items-center justify-center">
                        <Target className="h-5 w-5 text-emerald-600 mb-0.5" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">เรเดียลบาร์</span>
                        <span className="text-xs font-black text-slate-900 font-mono">{pieData.length} รายการ</span>
                      </div>
                    </div>
                  )}

                  {/* 5. RANKING BAR CHART */}
                  {pieChartType === "bar" && (
                    <div className="w-full h-full p-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          layout="vertical"
                          data={rankedBarData}
                          margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                          <XAxis
                            type="number"
                            tick={{ fontSize: 10, fill: "#64748b" }}
                            tickFormatter={(v) => {
                              if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                              if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
                              return String(v);
                            }}
                          />
                          <YAxis
                            type="category"
                            dataKey="shortName"
                            width={115}
                            tick={{ fontSize: 10, fill: "#334155", fontWeight: 700 }}
                          />
                          <Tooltip
                            wrapperStyle={{ zIndex: 99999, pointerEvents: "none" }}
                            allowEscapeViewBox={{ x: true, y: true }}
                            content={renderPieTooltipContent}
                          />
                          <Bar
                            dataKey="value"
                            radius={[0, 8, 8, 0]}
                            onClick={(entry: any) => {
                              if (entry?.project) onSelectProject(entry.project);
                              else if (entry?.planKey) setSelectedPlan(entry.planKey);
                            }}
                          >
                            {rankedBarData.map((entry, index) => (
                              <Cell
                                key={`bar-cell-${index}`}
                                fill={entry.fill}
                                className="cursor-pointer hover:opacity-90 transition-opacity"
                                stroke={activePieIndex === entry.originalIdx ? "#0f172a" : "transparent"}
                                strokeWidth={2}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* 6. TREEMAP AREA */}
                  {pieChartType === "treemap" && (
                    <div className="w-full h-full p-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <Treemap
                          data={treemapData}
                          dataKey="size"
                          aspectRatio={4 / 3}
                          stroke="#ffffff"
                          content={({ x, y, width, height, index, name, fill, pct, formattedValue, project, planKey }: any) => {
                            if (!width || !height || width < 8 || height < 8) return null;
                            const isSelected = activePieIndex === index;
                            const showTitle = width > 50 && height > 28;
                            const showDetails = width > 80 && height > 48;

                            return (
                              <g
                                onClick={() => {
                                  if (typeof index === "number") setActivePieIndex(index);
                                  if (project) onSelectProject(project);
                                  else if (planKey) setSelectedPlan(planKey);
                                }}
                                className="cursor-pointer group"
                              >
                                <rect
                                  x={x + 2}
                                  y={y + 2}
                                  width={width - 4}
                                  height={height - 4}
                                  rx={6}
                                  ry={6}
                                  fill={fill}
                                  stroke={isSelected ? "#0f172a" : "#ffffff"}
                                  strokeWidth={isSelected ? 3 : 1.5}
                                  className="transition-all hover:opacity-90"
                                />
                                {showTitle && (
                                  <text
                                    x={x + width / 2}
                                    y={showDetails ? y + height / 2 - 8 : y + height / 2}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fill="#ffffff"
                                    className="font-bold text-[11px] select-none pointer-events-none"
                                    style={{
                                      fontWeight: 800,
                                      filter: "drop-shadow(0px 1px 2px rgba(0,0,0,0.85))",
                                    }}
                                  >
                                    {name && name.length > Math.floor(width / 9)
                                      ? name.substring(0, Math.floor(width / 9)) + "..."
                                      : name}
                                  </text>
                                )}
                                {showDetails && (
                                  <text
                                    x={x + width / 2}
                                    y={y + height / 2 + 10}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fill="#ffffff"
                                    className="font-black text-[10px] select-none pointer-events-none font-mono"
                                    style={{
                                      fontWeight: 900,
                                      filter: "drop-shadow(0px 1px 2px rgba(0,0,0,0.85))",
                                    }}
                                  >
                                    {pct}%
                                  </text>
                                )}
                              </g>
                            );
                          }}
                        >
                          <Tooltip
                            wrapperStyle={{ zIndex: 99999, pointerEvents: "none" }}
                            allowEscapeViewBox={{ x: true, y: true }}
                            content={renderPieTooltipContent}
                          />
                        </Treemap>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* 7. NIGHTINGALE ROSE CHART (POLAR AREA) */}
                  {pieChartType === "rose" && (
                    <div className="w-full h-full relative flex items-center justify-center p-2">
                      {(() => {
                        const N = pieData.length;
                        if (N === 0) return <div className="text-slate-400 text-xs font-bold">ไม่มีข้อมูลสำหรับแผนภูมิ</div>;
                        const size = Math.min(pieFrameHeight - 40, 480);
                        const cx = size / 2;
                        const cy = size / 2;
                        const maxRadius = Math.max(65, size * 0.42);
                        const minRadius = Math.max(16, size * 0.08);
                        const maxVal = Math.max(...pieData.map((d) => d.value), 1);
                        const sliceAngle = (2 * Math.PI) / N;

                        return (
                          <div className="relative flex items-center justify-center">
                            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible select-none">
                              {/* Concentric Guide Rings */}
                              {[0.25, 0.5, 0.75, 1.0].map((level) => {
                                const r = minRadius + (maxRadius - minRadius) * level;
                                return (
                                  <g key={`guide-${level}`}>
                                    <circle
                                      cx={cx}
                                      cy={cy}
                                      r={r}
                                      fill="none"
                                      stroke="#e2e8f0"
                                      strokeDasharray="3 3"
                                      strokeWidth={1}
                                    />
                                    <text
                                      x={cx + 3}
                                      y={cy - r + 9}
                                      fill="#94a3b8"
                                      fontSize={8}
                                      fontWeight={700}
                                    >
                                      {Math.round(level * 100)}%
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Rose Petal Sectors */}
                              {pieData.map((item, i) => {
                                const val = item.value;
                                const ratio = Math.max(0.08, val / maxVal);
                                const r = minRadius + (maxRadius - minRadius) * ratio;
                                const startAngle = i * sliceAngle - Math.PI / 2;
                                const endAngle = (i + 1) * sliceAngle - Math.PI / 2;
                                const midAngle = (startAngle + endAngle) / 2;

                                const x1 = cx + minRadius * Math.cos(startAngle);
                                const y1 = cy + minRadius * Math.sin(startAngle);
                                const x2 = cx + r * Math.cos(startAngle);
                                const y2 = cy + r * Math.sin(startAngle);
                                const x3 = cx + r * Math.cos(endAngle);
                                const y3 = cy + r * Math.sin(endAngle);
                                const x4 = cx + minRadius * Math.cos(endAngle);
                                const y4 = cy + minRadius * Math.sin(endAngle);

                                const pathD = `M ${x1} ${y1} L ${x2} ${y2} A ${r} ${r} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${minRadius} ${minRadius} 0 0 0 ${x1} ${y1} Z`;

                                const sliceColor =
                                  pieCustomColors[i % pieCustomColors.length] ||
                                  DEFAULT_PIE_COLORS[i % DEFAULT_PIE_COLORS.length];
                                const isSelected = activePieIndex === i;
                                const pct = pieTotalVal > 0 ? ((val / pieTotalVal) * 100).toFixed(1) : "0";

                                const labelRadius = r + 13;
                                const lx = cx + labelRadius * Math.cos(midAngle);
                                const ly = cy + labelRadius * Math.sin(midAngle);

                                return (
                                  <g
                                    key={`rose-slice-${i}`}
                                    className="cursor-pointer transition-all duration-200"
                                    onMouseEnter={() => setActivePieIndex(i)}
                                    onClick={() => {
                                      setActivePieIndex(i);
                                      if (item.project) onSelectProject(item.project);
                                      else if (item.planKey) setSelectedPlan(item.planKey);
                                    }}
                                  >
                                    <path
                                      d={pathD}
                                      fill={sliceColor}
                                      fillOpacity={isSelected ? 0.95 : 0.78}
                                      stroke={isSelected ? "#0f172a" : "#ffffff"}
                                      strokeWidth={isSelected ? 2.5 : 1.5}
                                      className="hover:opacity-100 transition-opacity"
                                    />
                                    {size >= 270 && (
                                      <text
                                        x={lx}
                                        y={ly}
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        className="font-mono font-bold text-[9px] sm:text-[10px] select-none pointer-events-none"
                                        fill="#334155"
                                      >
                                        {pct}%
                                      </text>
                                    )}
                                  </g>
                                );
                              })}

                              {/* Center Hub */}
                              <circle cx={cx} cy={cy} r={minRadius} fill="#ffffff" stroke="#cbd5e1" strokeWidth={2} />
                              <text
                                x={cx}
                                y={cy}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={10}
                                fontWeight={900}
                                fill="#0f172a"
                              >
                                🌹
                              </text>
                            </svg>

                            {/* Floating Summary Badge */}
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center pointer-events-none bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl shadow-xs border border-slate-200/90 z-10 flex items-center gap-2 whitespace-nowrap">
                              <span className="text-[10px] font-bold text-slate-500 uppercase">
                                กุหลาบไนติงเกล ({pieData.length} รายการ):
                              </span>
                              <span className="text-xs font-black text-slate-900 font-mono">
                                {getModeSummaryValue()}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* 8. RADAR / SPIDER CHART */}
                  {pieChartType === "radar" && (
                    <div className="w-full h-full relative flex items-center justify-center p-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart
                          cx="50%"
                          cy="50%"
                          outerRadius={Math.min(170, Math.max(90, Math.round(pieFrameHeight * 0.32)))}
                          data={radarData}
                        >
                          <PolarGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                          <PolarAngleAxis
                            dataKey="name"
                            tick={{ fontSize: 10, fill: "#334155", fontWeight: 700 }}
                          />
                          <PolarRadiusAxis
                            angle={30}
                            tick={{ fontSize: 9, fill: "#94a3b8" }}
                          />
                          <Radar
                            name="สัดส่วน"
                            dataKey="value"
                            stroke="#059669"
                            fill="#10b981"
                            fillOpacity={0.5}
                          />
                          <Tooltip
                            wrapperStyle={{ zIndex: 99999, pointerEvents: "none" }}
                            allowEscapeViewBox={{ x: true, y: true }}
                            content={renderPieTooltipContent}
                          />
                        </RadarChart>
                      </ResponsiveContainer>

                      {/* Radar Bottom Summary Badge */}
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center pointer-events-none bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl shadow-xs border border-slate-200/90 z-10 flex items-center gap-2 whitespace-nowrap">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">
                          เรดาร์ ({radarData.length} รายการ):
                        </span>
                        <span className="text-xs font-black text-slate-900 font-mono">
                          {getModeSummaryValue()}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 9. FUNNEL / PYRAMID HIERARCHICAL FLOW */}
                  {pieChartType === "funnel" && (
                    <div className="w-full h-full relative flex items-center justify-center p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <FunnelChart>
                          <Tooltip
                            wrapperStyle={{ zIndex: 99999, pointerEvents: "none" }}
                            allowEscapeViewBox={{ x: true, y: true }}
                            content={renderPieTooltipContent}
                          />
                          <Funnel
                            dataKey="value"
                            data={funnelData}
                            isAnimationActive
                            onClick={(entry: any) => {
                              if (entry?.project) onSelectProject(entry.project);
                              else if (entry?.planKey) setSelectedPlan(entry.planKey);
                            }}
                          >
                            <LabelList
                              position="right"
                              fill="#0f172a"
                              stroke="none"
                              dataKey="name"
                              style={{ fontSize: 11, fontWeight: 700 }}
                            />
                            {funnelData.map((entry, index) => (
                              <Cell
                                key={`funnel-cell-${index}`}
                                fill={entry.fill}
                                className="cursor-pointer hover:opacity-90 transition-opacity"
                              />
                            ))}
                          </Funnel>
                        </FunnelChart>
                      </ResponsiveContainer>

                      {/* Funnel Bottom Summary Badge */}
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center pointer-events-none bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl shadow-xs border border-slate-200/90 z-10 flex items-center gap-2 whitespace-nowrap">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">
                          กรวยสัดส่วน ({funnelData.length} รายการ):
                        </span>
                        <span className="text-xs font-black text-slate-900 font-mono">
                          {getModeSummaryValue()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: Executive Breakdown List Cards */}
              <div
                className="lg:col-span-6 space-y-3 flex flex-col transition-[height] duration-75"
                style={{
                  height: `${pieFrameHeight}px`,
                }}
              >
                <div className="flex items-center justify-between px-1 shrink-0">
                  <span className="text-xs font-black text-slate-600 uppercase tracking-wider">
                    รายละเอียดสัดส่วนแบบเจาะลึก ({pieData.length} รายการ)
                  </span>
                  <span className="text-[11px] font-bold text-slate-400">
                    คลิกที่รายการเพื่อเปิดดูหน้ารายโครงการ 🔗
                  </span>
                </div>

                <div
                  className="space-y-2.5 overflow-y-auto pr-1 flex-1"
                  style={{
                    maxHeight: `${Math.max(260, pieFrameHeight - 38)}px`,
                  }}
                >
                  {pieData.map((item, idx) => {
                    const sliceColor =
                      pieCustomColors[idx % pieCustomColors.length] ||
                      DEFAULT_PIE_COLORS[idx % DEFAULT_PIE_COLORS.length];
                    const pct = pieTotalVal > 0 ? ((item.value / pieTotalVal) * 100).toFixed(1) : "0";
                    const isSelected = activePieIndex === idx;

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setActivePieIndex(idx);
                          if (item.project) {
                            onSelectProject(item.project);
                          } else if (item.planKey) {
                            setSelectedPlan(item.planKey);
                          }
                        }}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer group ${
                          isSelected
                            ? "bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-emerald-400/40 scale-[1.01]"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200/80"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div
                              className="w-4 h-4 rounded-full shrink-0 shadow-2xs border-2 border-white mt-0.5"
                              style={{ backgroundColor: sliceColor }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className={`text-xs sm:text-sm font-extrabold leading-snug ${isSelected ? "text-white" : "text-slate-900"}`}>
                                  {item.name}
                                </p>
                                {item.project && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-all ${
                                    isSelected
                                      ? "bg-emerald-400/20 text-emerald-300"
                                      : "bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white"
                                  }`}>
                                    เปิดดูโครงการ ➔
                                  </span>
                                )}
                              </div>
                              <p className={`text-[11px] mt-0.5 ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
                                {item.detailText}
                              </p>

                              {/* Additional Project Status Badges if project exists */}
                              {item.project && (
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                                    isSelected ? "bg-slate-800 text-emerald-300" : "bg-emerald-100/80 text-emerald-800"
                                  }`}>
                                    ผลงาน: {item.actualProgress}%
                                  </span>
                                  <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                                    isSelected ? "bg-slate-800 text-cyan-300" : "bg-cyan-100/80 text-cyan-800"
                                  }`}>
                                    เบิกจ่าย: {item.disbursedPercent}%
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <p className={`text-xs sm:text-sm font-black font-mono ${isSelected ? "text-emerald-400" : "text-slate-900"}`}>
                              {item.formattedValue}
                            </p>
                            <span
                              className={`inline-block text-[10px] font-black font-mono px-2 py-0.5 rounded-md mt-1 ${
                                isSelected
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                  : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              }`}
                            >
                              สัดส่วน: {pct}%
                            </span>
                          </div>
                        </div>

                        {/* Percentage Bar */}
                        <div className="w-full bg-slate-200/70 rounded-full h-2 mt-2.5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500 shadow-2xs"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: sliceColor,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RESIZE DRAG HANDLE AT THE BOTTOM OF THE PIE & DONUT FRAME */}
            <div className="pt-3 border-t border-slate-100 flex flex-col items-center select-none">
              <div
                onMouseDown={handlePieResizeMouseDown}
                onTouchStart={handlePieResizeTouchStart}
                className="w-full py-1 cursor-row-resize flex flex-col items-center justify-center group select-none transition-all"
                title="คลิกดึงขึ้น-ลง เพื่อปรับขนาดความสูงของกรอบ (ดึงขยายเพื่อดูรายการเพิ่มเติม)"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                      isResizingPieFrame
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20 scale-105 ring-2 ring-emerald-400"
                        : "bg-slate-100 text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-700 border border-slate-200 group-hover:border-emerald-200"
                    }`}
                  >
                    <GripHorizontal className="h-3.5 w-3.5" />
                    <span>
                      {isResizingPieFrame
                        ? `ความสูง: ${pieFrameHeight}px (กำลังดึงปรับ)`
                        : `ดึงปรับความสูงกรอบ (${pieFrameHeight}px)`}
                    </span>
                  </div>
                </div>

                <div
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    isResizingPieFrame
                      ? "bg-emerald-500 w-64 h-2 shadow-xs"
                      : "bg-slate-300 w-32 group-hover:w-56 group-hover:bg-emerald-400 shadow-2xs"
                  }`}
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-500 flex-wrap justify-center">
                <span className="font-semibold text-slate-400">ขนาดความสูงสำเร็จรูป:</span>
                <button
                  type="button"
                  onClick={() => handleSetPieFramePreset(340)}
                  className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                    pieFrameHeight === 340
                      ? "bg-emerald-100 text-emerald-800 font-extrabold border border-emerald-300"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  กะทัดรัด (340px)
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPieFramePreset(420)}
                  className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                    pieFrameHeight === 420
                      ? "bg-emerald-100 text-emerald-800 font-extrabold border border-emerald-300"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  ปานกลาง (420px)
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPieFramePreset(560)}
                  className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                    pieFrameHeight === 560
                      ? "bg-emerald-100 text-emerald-800 font-extrabold border border-emerald-300"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  ขยาย (560px)
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPieFramePreset(720)}
                  className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                    pieFrameHeight === 720
                      ? "bg-emerald-100 text-emerald-800 font-extrabold border border-emerald-300"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  เต็มจอ (720px)
                </button>
                {pieFrameHeight !== DEFAULT_PIE_FRAME_HEIGHT && (
                  <button
                    type="button"
                    onClick={() => handleSetPieFramePreset(DEFAULT_PIE_FRAME_HEIGHT)}
                    className="flex items-center gap-0.5 px-2 py-0.5 rounded-md font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer ml-1 border border-transparent hover:border-rose-200"
                    title="รีเซ็ตกลับเป็นขนาดเริ่มต้น 560px"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    <span>รีเซ็ต</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-10 text-slate-400 text-xs">
            ไม่มีข้อมูลสำหรับแสดงผลในแผนภูมิกลม
          </div>
        )}
      </div>

      {/* Progress Sync Summary Gauge Panel */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md flex flex-col md:flex-row justify-between items-center gap-6 border border-slate-800 font-['Sarabun',sans-serif]">
        <div className="space-y-2 flex-1 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
            <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              OVERALL PHYSICAL WORK PROGRESS
            </span>
            <span className="text-xs font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
              ปี {selectedYear}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            {isAllPlans
              ? `สรุปภาพรวมแผนงาน: แผนงานเทียบผลงานจริง (รวมทุกแผนงานย่อย ${filteredProjects.length} โครงการ)`
              : `สรุปภาพรวมแผนงาน: แผนงานเทียบผลงานจริง (${selectedPlan})`}
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-lg">
            {isAllPlans
              ? `ค่าเฉลี่ยทางกายภาพในสนามและความก้าวหน้าของโครงการก่อสร้างทั้งหมดรายปี พ.ศ. ${selectedYear} รวมทุกแผนงานย่อย (${plansInYear.length} แผนงาน) เทียบกับสัดส่วนงานเบิกจ่าย`
              : `ตัวเลขนี้แสดงค่าเฉลี่ยทางกายภาพในสนามและความก้าวหน้าของโครงการก่อสร้างทั้งหมดภายใต้แผนงาน ${selectedPlan} ซึ่งควรเทียบควบคู่กับสัดส่วนงานเบิกจ่าย`}
          </p>
        </div>

        <div className="flex items-center gap-8 bg-slate-800/40 px-6 py-4 rounded-xl border border-slate-800 shrink-0">
          <div className="text-center">
            <p className="text-xs text-slate-400 font-sans">แผนงานเฉลี่ย</p>
            <h3 className="text-4xl font-extrabold text-white font-mono mt-1">
              {avgPlanned}<span className="text-lg font-normal text-emerald-400">%</span>
            </h3>
          </div>
          <div className="h-10 w-px bg-slate-700"></div>
          <div className="text-center">
            <p className="text-xs text-slate-400 font-sans">ผลงานจริงในสนาม</p>
            <h3 className={`text-4xl font-extrabold font-mono mt-1 ${avgActual >= avgPlanned ? "text-emerald-400" : "text-amber-400"}`}>
              {avgActual}<span className="text-lg font-normal text-emerald-400">%</span>
            </h3>
          </div>
        </div>
      </div>

      {/* Financial and Progress Charts - Stacked Full Width */}
      {filteredProjects.length > 0 ? (
        <div className="flex flex-col gap-8">
          {/* Chart 1: Finances */}
          <div className="bg-white p-4 sm:p-6 pb-3 sm:pb-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3 font-['Sarabun',sans-serif]">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 sm:gap-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 p-2.5 rounded-xl shrink-0 shadow-2xs">
                  <BarChart4 className="h-5 w-5 text-indigo-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                    เปรียบเทียบงบประมาณ การทำสัญญา และการเบิกจ่าย
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5 leading-normal">
                    {isAllPlans
                      ? `จำแนกรายโครงการก่อสร้างประจำปี พ.ศ. ${selectedYear} (รวมทุกแผนงานย่อย ${filteredProjects.length} โครงการ)`
                      : `จำแนกรายโครงการก่อสร้างภายใต้แผนงาน ${selectedPlan} (${filteredProjects.length} โครงการ)`}
                  </p>
                </div>
              </div>

              {/* Controls: Filter and Owner Customization */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0 w-full xl:w-auto justify-start xl:justify-end">
                {/* Comparison Filter Dropdown */}
                <div className="flex items-center gap-2 bg-slate-50/90 px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs max-w-full">
                  <span className="text-xs font-semibold text-slate-600 whitespace-nowrap shrink-0">ตัวเปรียบเทียบ:</span>
                  <select
                    value={financialCompareMode}
                    onChange={(e) => setFinancialCompareMode(e.target.value)}
                    className="bg-white text-slate-800 text-xs font-bold rounded-lg px-2.5 py-1 border border-slate-200/80 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer max-w-[240px] sm:max-w-xs md:max-w-none truncate"
                  >
                    <option value="all">📊 แสดงเปรียบเทียบทั้งหมด (โครงการ / สัญญา / เบิกจ่าย)</option>
                    <option value="budget_vs_contract">⚖️ วงเงินโครงการ VS วงเงินตามสัญญา</option>
                    <option value="contract_vs_disbursed">⚖️ วงเงินตามสัญญา VS เบิกจ่ายแล้ว</option>
                    <option value="budget_vs_disbursed">⚖️ วงเงินโครงการ VS เบิกจ่ายแล้ว</option>
                    <option value="budget">🔹 เฉพาะวงเงินโครงการ</option>
                    <option value="contract">🔹 เฉพาะวงเงินตามสัญญา</option>
                    <option value="disbursed">🔹 เฉพาะเบิกจ่ายแล้ว</option>
                  </select>
                </div>

                {/* Owner Color/Position Customization Button */}
                {isOwner ? (
                  <button
                    type="button"
                    onClick={() => setIsFinancialControlOpen(!isFinancialControlOpen)}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl border border-indigo-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs whitespace-nowrap"
                    title="ปรับแต่งสีและลำดับแท่งกราฟเฉพาะในสถานะ Owner"
                  >
                    <Palette className="h-4 w-4 text-indigo-600" />
                    <span>{isFinancialControlOpen ? "ปิดตัวปรับแต่ง" : "ปรับแต่งกราฟ (Owner)"}</span>
                  </button>
                ) : (
                  <div className="hidden md:flex items-center gap-1.5 text-[11px] font-medium text-slate-400 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/60 shrink-0 whitespace-nowrap">
                    <Palette className="h-3.5 w-3.5 text-slate-400" />
                    <span>สี/ตำแหน่งปรับแต่งตาม Owner</span>
                  </div>
                )}
              </div>
            </div>

            {/* Owner Customization Panel for Financial Chart */}
            {isOwner && isFinancialControlOpen && (
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 space-y-4 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-indigo-100/80 pb-2">
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-indigo-600" />
                    <span className="text-xs font-bold text-indigo-950">แผงปรับแต่งสีและลำดับตำแหน่งแท่งกราฟการเงิน (เฉพาะ Owner)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetFinancialConfig}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                  >
                    คืนค่าเริ่มต้น
                  </button>
                </div>

                {/* Bar Order Positioning */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <ArrowLeftRight className="h-3.5 w-3.5 text-indigo-600" />
                    <span>1. ปรับตำแหน่งลำดับแท่งกราฟ (เรียงจากซ้ายไปขวา):</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {financialBarOrder.map((key, idx) => {
                      const labelMap = {
                        budget: "วงเงินโครงการ",
                        contract: "วงเงินตามสัญญา",
                        disbursed: "เบิกจ่ายแล้ว",
                      };
                      return (
                        <div key={key} className="bg-white px-3 py-1.5 rounded-xl border border-indigo-100 flex items-center gap-2 shadow-2xs text-xs">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: financialColors[key] }} />
                          <span className="font-bold text-slate-800">{idx + 1}. {labelMap[key]}</span>
                          <div className="flex items-center gap-1 ml-1 border-l border-slate-100 pl-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveFinancialBar(idx, "left")}
                              className="p-1 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                              title="ย้ายไปซ้าย"
                            >
                              <ArrowLeft className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === financialBarOrder.length - 1}
                              onClick={() => handleMoveFinancialBar(idx, "right")}
                              className="p-1 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                              title="ย้ายไปขวา"
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Colors */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Palette className="h-3.5 w-3.5 text-indigo-600" />
                    <span>2. ปรับแต่งสีแสดงผลแท่งกราฟ:</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-white p-2.5 rounded-xl border border-indigo-100/80 flex items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border border-slate-300" style={{ backgroundColor: financialColors.budget }} />
                        <span className="font-semibold text-slate-700">วงเงินโครงการ</span>
                      </div>
                      <input
                        type="color"
                        value={financialColors.budget}
                        onChange={(e) => handleFinancialColorChange("budget", e.target.value)}
                        className="w-7 h-7 rounded border border-slate-200 cursor-pointer bg-transparent"
                      />
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-indigo-100/80 flex items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border border-slate-300" style={{ backgroundColor: financialColors.contract }} />
                        <span className="font-semibold text-slate-700">วงเงินตามสัญญา</span>
                      </div>
                      <input
                        type="color"
                        value={financialColors.contract}
                        onChange={(e) => handleFinancialColorChange("contract", e.target.value)}
                        className="w-7 h-7 rounded border border-slate-200 cursor-pointer bg-transparent"
                      />
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-indigo-100/80 flex items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border border-slate-300" style={{ backgroundColor: financialColors.disbursed }} />
                        <span className="font-semibold text-slate-700">เบิกจ่ายแล้ว</span>
                      </div>
                      <input
                        type="color"
                        value={financialColors.disbursed}
                        onChange={(e) => handleFinancialColorChange("disbursed", e.target.value)}
                        className="w-7 h-7 rounded border border-slate-200 cursor-pointer bg-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-bar: Unit & Legend for Formal Executive Presentation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/75 rounded-xl px-3.5 py-2 border border-slate-200/60 font-['Sarabun',sans-serif]">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-bold text-slate-700">หน่วยข้อมูล:</span>
                <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-700 font-mono text-[11px] font-bold shadow-2xs">
                  ล้านบาท (THB)
                </span>
              </div>
              {renderFinancialLegend()}
            </div>

            {/* Scrollable container for responsive clarity when many projects */}
            <div ref={financialScrollContainerRef} className="w-full overflow-x-auto custom-scrollbar pb-3 pt-1">
              <div style={{ minWidth: financialChartData.length > 6 ? `${Math.max(720, financialChartData.length * 115)}px` : "100%", height: 370 }}>
                <ResponsiveContainer key={`fin-chart-${financialBarOrder.join("-")}-${financialCompareMode}-${selectedPlan}`} width="100%" height="100%">
                  <BarChart
                    data={financialChartData}
                    barGap={4}
                    barCategoryGap={financialChartData.length <= 2 ? "36%" : financialChartData.length <= 5 ? "26%" : "20%"}
                    margin={{ top: 15, right: 25, left: 10, bottom: 45 }}
                  >
                    <defs>
                      <linearGradient id="finBudgetGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={financialColors.budget} stopOpacity={1} />
                        <stop offset="100%" stopColor={financialColors.budget} stopOpacity={0.82} />
                      </linearGradient>
                      <linearGradient id="finContractGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={financialColors.contract} stopOpacity={1} />
                        <stop offset="100%" stopColor={financialColors.contract} stopOpacity={0.82} />
                      </linearGradient>
                      <linearGradient id="finDisbursedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={financialColors.disbursed} stopOpacity={1} />
                        <stop offset="100%" stopColor={financialColors.disbursed} stopOpacity={0.82} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.8} />
                    <XAxis
                      dataKey="shortName"
                      stroke="#94a3b8"
                      tickLine={false}
                      interval={0}
                      tick={{ fontSize: 11, fontWeight: 500, fill: "#334155", fontFamily: "Sarabun, sans-serif" }}
                      angle={-30}
                      textAnchor="end"
                      height={75}
                      dy={8}
                      dx={-2}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tickLine={false}
                      width={62}
                      tickFormatter={(v) => {
                        if (v === 0) return "0";
                        if (v >= 1000000) return `${(v / 1000000).toLocaleString("th-TH", { maximumFractionDigits: 1 })} ลบ.`;
                        if (v >= 1000) return `${(v / 1000).toLocaleString("th-TH")} พัน`;
                        return v.toLocaleString("th-TH");
                      }}
                      tick={{ fontSize: 11, fill: "#64748b", fontFamily: "Sarabun, sans-serif" }}
                    />
                    {financialBarOrder.map((key) => {
                      if (key === "budget" && (financialCompareMode === "all" || financialCompareMode === "budget_vs_contract" || financialCompareMode === "budget_vs_disbursed" || financialCompareMode === "budget")) {
                        return (
                          <Bar
                            key="fin-budget"
                            dataKey="วงเงินโครงการ"
                            fill="url(#finBudgetGrad)"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={36}
                            className="cursor-pointer hover:opacity-85 transition-opacity"
                            onClick={(entry: any) => {
                              if (entry?.projectObj) onSelectProject(entry.projectObj);
                            }}
                          />
                        );
                      }
                      if (key === "contract" && (financialCompareMode === "all" || financialCompareMode === "budget_vs_contract" || financialCompareMode === "contract_vs_disbursed" || financialCompareMode === "contract")) {
                        return (
                          <Bar
                            key="fin-contract"
                            dataKey="วงเงินตามสัญญา"
                            fill="url(#finContractGrad)"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={36}
                            className="cursor-pointer hover:opacity-85 transition-opacity"
                            onClick={(entry: any) => {
                              if (entry?.projectObj) onSelectProject(entry.projectObj);
                            }}
                          />
                        );
                      }
                      if (key === "disbursed" && (financialCompareMode === "all" || financialCompareMode === "contract_vs_disbursed" || financialCompareMode === "budget_vs_disbursed" || financialCompareMode === "disbursed")) {
                        return (
                          <Bar
                            key="fin-disbursed"
                            dataKey="เบิกจ่ายแล้ว"
                            fill="url(#finDisbursedGrad)"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={36}
                            className="cursor-pointer hover:opacity-85 transition-opacity"
                            onClick={(entry: any) => {
                              if (entry?.projectObj) onSelectProject(entry.projectObj);
                            }}
                          />
                        );
                      }
                      return null;
                    })}
                    <Tooltip
                      content={<CustomFinancialTooltip />}
                      cursor={{ fill: "#f8fafc", opacity: 0.8 }}
                      wrapperStyle={{ zIndex: 99999, pointerEvents: "none" }}
                      position={{ y: 15 }}
                      allowEscapeViewBox={{ x: true, y: true }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Chart 2: Physical & Disbursement Progress % (Bar Chart) */}
          <div className="bg-white p-4 sm:p-6 pb-3 sm:pb-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3 font-['Sarabun',sans-serif]">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 sm:gap-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-2.5 rounded-xl shrink-0 shadow-2xs">
                  <Percent className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                    เปรียบเทียบดัชนีความก้าวหน้าโครงการ (%)
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5 leading-normal">
                    {isAllPlans
                      ? `แผนงานสะสม ผลงานในสนามจริง และยอดการเบิกจ่าย (%) ประจำปี พ.ศ. ${selectedYear} (รวมทุกแผนงานย่อย)`
                      : `แผนงานสะสม ผลงานในสนามจริง และยอดการเบิกจ่าย (%) ภายใต้แผนงาน ${selectedPlan}`}
                  </p>
                </div>
              </div>

              {/* Controls: Filter and Owner Customization */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0 w-full xl:w-auto justify-start xl:justify-end">
                {/* Comparison Filter Dropdown */}
                <div className="flex items-center gap-2 bg-slate-50/90 px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs max-w-full">
                  <span className="text-xs font-semibold text-slate-600 whitespace-nowrap shrink-0">ตัวเปรียบเทียบ:</span>
                  <select
                    value={progressCompareMode}
                    onChange={(e) => setProgressCompareMode(e.target.value)}
                    className="bg-white text-slate-800 text-xs font-bold rounded-lg px-2.5 py-1 border border-slate-200/80 shadow-2xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer max-w-[240px] sm:max-w-xs md:max-w-none truncate"
                  >
                    <option value="all">📊 แสดงเปรียบเทียบทั้งหมด (แผนงาน / ผลงานจริง / เบิกจ่าย %)</option>
                    <option value="plan_vs_actual">⚖️ แผนงาน (%) VS ผลงานจริง (%)</option>
                    <option value="actual_vs_disbursed">⚖️ ผลงานจริง (%) VS เบิกจ่าย (%)</option>
                    <option value="plan_vs_disbursed">⚖️ แผนงาน (%) VS เบิกจ่าย (%)</option>
                    <option value="actual">🔹 เฉพาะผลงานจริง (%)</option>
                    <option value="plan">🔹 เฉพาะแผนงาน (%)</option>
                    <option value="disbursed">🔹 เฉพาะเบิกจ่าย (%)</option>
                  </select>
                </div>

                {/* Owner Customization Button */}
                {isOwner ? (
                  <button
                    type="button"
                    onClick={() => setIsProgressControlOpen(!isProgressControlOpen)}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs whitespace-nowrap"
                    title="ปรับแต่งสีและลำดับแท่งกราฟเฉพาะในสถานะ Owner"
                  >
                    <Palette className="h-4 w-4 text-emerald-600" />
                    <span>{isProgressControlOpen ? "ปิดตัวปรับแต่ง" : "ปรับแต่งกราฟ (Owner)"}</span>
                  </button>
                ) : (
                  <div className="hidden md:flex items-center gap-1.5 text-[11px] font-medium text-slate-400 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/60 shrink-0 whitespace-nowrap">
                    <Palette className="h-3.5 w-3.5 text-slate-400" />
                    <span>สี/ตำแหน่งปรับแต่งตาม Owner</span>
                  </div>
                )}
              </div>
            </div>

            {/* Owner Customization Panel for Progress Chart */}
            {isOwner && isProgressControlOpen && (
              <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-4 space-y-4 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-emerald-100/80 pb-2">
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-950">แผงปรับแต่งสีและลำดับตำแหน่งแท่งกราฟความก้าวหน้า (%) (เฉพาะ Owner)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetProgressConfig}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                  >
                    คืนค่าเริ่มต้น
                  </button>
                </div>

                {/* Bar Order Positioning */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <ArrowLeftRight className="h-3.5 w-3.5 text-emerald-600" />
                    <span>1. ปรับตำแหน่งลำดับแท่งกราฟ (เรียงจากซ้ายไปขวา):</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {progressBarOrder.map((key, idx) => {
                      const labelMap = {
                        plan: "แผนงาน (%)",
                        actual: "ผลงานจริง (%)",
                        disbursed: "เบิกจ่าย (%)",
                      };
                      return (
                        <div key={key} className="bg-white px-3 py-1.5 rounded-xl border border-emerald-100 flex items-center gap-2 shadow-2xs text-xs">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: progressColors[key] }} />
                          <span className="font-bold text-slate-800">{idx + 1}. {labelMap[key]}</span>
                          <div className="flex items-center gap-1 ml-1 border-l border-slate-100 pl-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveProgressBar(idx, "left")}
                              className="p-1 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                              title="ย้ายไปซ้าย"
                            >
                              <ArrowLeft className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === progressBarOrder.length - 1}
                              onClick={() => handleMoveProgressBar(idx, "right")}
                              className="p-1 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                              title="ย้ายไปขวา"
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Colors */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Palette className="h-3.5 w-3.5 text-emerald-600" />
                    <span>2. ปรับแต่งสีแสดงผลแท่งกราฟ:</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100/80 flex items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border border-slate-300" style={{ backgroundColor: progressColors.plan }} />
                        <span className="font-semibold text-slate-700">แผนงาน (%)</span>
                      </div>
                      <input
                        type="color"
                        value={progressColors.plan}
                        onChange={(e) => handleProgressColorChange("plan", e.target.value)}
                        className="w-7 h-7 rounded border border-slate-200 cursor-pointer bg-transparent"
                      />
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100/80 flex items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border border-slate-300" style={{ backgroundColor: progressColors.actual }} />
                        <span className="font-semibold text-slate-700">ผลงานจริง (%)</span>
                      </div>
                      <input
                        type="color"
                        value={progressColors.actual}
                        onChange={(e) => handleProgressColorChange("actual", e.target.value)}
                        className="w-7 h-7 rounded border border-slate-200 cursor-pointer bg-transparent"
                      />
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100/80 flex items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border border-slate-300" style={{ backgroundColor: progressColors.disbursed }} />
                        <span className="font-semibold text-slate-700">เบิกจ่าย (%)</span>
                      </div>
                      <input
                        type="color"
                        value={progressColors.disbursed}
                        onChange={(e) => handleProgressColorChange("disbursed", e.target.value)}
                        className="w-7 h-7 rounded border border-slate-200 cursor-pointer bg-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-bar: Unit & Legend for Formal Executive Presentation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/75 rounded-xl px-3.5 py-2 border border-slate-200/60 font-['Sarabun',sans-serif]">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-bold text-slate-700">หน่วยข้อมูล:</span>
                <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-700 font-mono text-[11px] font-bold shadow-2xs">
                  ร้อยละ (%)
                </span>
              </div>
              {renderProgressLegend()}
            </div>

            {/* Scrollable container for responsive clarity when many projects */}
            <div ref={progressScrollContainerRef} className="w-full overflow-x-auto custom-scrollbar pb-3 pt-1">
              <div style={{ minWidth: progressChartData.length > 6 ? `${Math.max(720, progressChartData.length * 115)}px` : "100%", height: 370 }}>
                <ResponsiveContainer key={`prog-chart-${progressBarOrder.join("-")}-${progressCompareMode}-${selectedPlan}`} width="100%" height="100%">
                  <BarChart
                    data={progressChartData}
                    barGap={4}
                    barCategoryGap={progressChartData.length <= 2 ? "36%" : progressChartData.length <= 5 ? "26%" : "20%"}
                    margin={{ top: 15, right: 25, left: 10, bottom: 45 }}
                  >
                    <defs>
                      <linearGradient id="progPlanGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={progressColors.plan} stopOpacity={1} />
                        <stop offset="100%" stopColor={progressColors.plan} stopOpacity={0.82} />
                      </linearGradient>
                      <linearGradient id="progActualGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={progressColors.actual} stopOpacity={1} />
                        <stop offset="100%" stopColor={progressColors.actual} stopOpacity={0.82} />
                      </linearGradient>
                      <linearGradient id="progDisbursedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={progressColors.disbursed} stopOpacity={1} />
                        <stop offset="100%" stopColor={progressColors.disbursed} stopOpacity={0.82} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.8} />
                    <XAxis
                      dataKey="shortName"
                      stroke="#94a3b8"
                      tickLine={false}
                      interval={0}
                      tick={{ fontSize: 11, fontWeight: 500, fill: "#334155", fontFamily: "Sarabun, sans-serif" }}
                      angle={-30}
                      textAnchor="end"
                      height={75}
                      dy={8}
                      dx={-2}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tickLine={false}
                      width={48}
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 11, fill: "#64748b", fontFamily: "Sarabun, sans-serif" }}
                    />
                    {progressBarOrder.map((key) => {
                      if (key === "plan" && (progressCompareMode === "all" || progressCompareMode === "plan_vs_actual" || progressCompareMode === "plan_vs_disbursed" || progressCompareMode === "plan")) {
                        return (
                          <Bar
                            key="prog-plan"
                            dataKey="แผนงาน (%)"
                            fill="url(#progPlanGrad)"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={36}
                            className="cursor-pointer hover:opacity-85 transition-opacity"
                            onClick={(entry: any) => {
                              if (entry?.projectObj) onSelectProject(entry.projectObj);
                            }}
                          />
                        );
                      }
                      if (key === "actual" && (progressCompareMode === "all" || progressCompareMode === "plan_vs_actual" || progressCompareMode === "actual_vs_disbursed" || progressCompareMode === "actual")) {
                        return (
                          <Bar
                            key="prog-actual"
                            dataKey="ผลงานจริง (%)"
                            fill="url(#progActualGrad)"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={36}
                            className="cursor-pointer hover:opacity-85 transition-opacity"
                            onClick={(entry: any) => {
                              if (entry?.projectObj) onSelectProject(entry.projectObj);
                            }}
                          />
                        );
                      }
                      if (key === "disbursed" && (progressCompareMode === "all" || progressCompareMode === "actual_vs_disbursed" || progressCompareMode === "plan_vs_disbursed" || progressCompareMode === "disbursed")) {
                        return (
                          <Bar
                            key="prog-disbursed"
                            dataKey="เบิกจ่าย (%)"
                            fill="url(#progDisbursedGrad)"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={36}
                            className="cursor-pointer hover:opacity-85 transition-opacity"
                            onClick={(entry: any) => {
                              if (entry?.projectObj) onSelectProject(entry.projectObj);
                            }}
                          />
                        );
                      }
                      return null;
                    })}
                    <Tooltip
                      content={<CustomProgressTooltip />}
                      cursor={{ fill: "#f8fafc", opacity: 0.8 }}
                      wrapperStyle={{ zIndex: 99999, pointerEvents: "none" }}
                      position={{ y: 15 }}
                      allowEscapeViewBox={{ x: true, y: true }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      ) : null}



      {/* Projects List Grid */}
      <div className="space-y-4 font-['Sarabun',sans-serif]">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-200/90">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-1.5 h-5 bg-blue-700 rounded-full" />
            <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              {isAllPlans
                ? `โครงการทั้งหมดในปีงบประมาณ พ.ศ. ${selectedYear} (รวมทุกแผนงานย่อย)`
                : `โครงการทั้งหมดในแผนงาน ${selectedPlan}`}
            </h3>
            <span className="px-2.5 py-0.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-full border border-slate-200/80">
              {filteredProjects.length} รายการ
            </span>
          </div>
          <span className="text-xs text-slate-500 font-normal hidden sm:inline-block">
            คลิกที่การ์ดเพื่อดูรายละเอียดโครงการและตารางความคืบหน้า
          </span>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center text-slate-500">
            <Briefcase className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold">ไม่มีรายการโครงการในแผนงานนี้</p>
            <p className="text-xs text-slate-400 mt-1">คลิกปุ่ม "เพิ่มโครงการใหม่" ด้านบนเพื่อเพิ่มแผ่นงานและรายงานของคุณ</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
            {filteredProjects.map((p, pIndex) => {
              const currentProgress = getCurrentProgressInfo(p);
              const delta = currentProgress.delta;
              const isAhead = currentProgress.isAhead;

              return (
                <div
                  key={`proj-${p.sheetName || p.projectName || "proj"}-${p.fiscalYear || ""}-${p.planName || ""}-${pIndex}`}
                  onClick={() => onSelectProject(p)}
                  className="bg-white border border-slate-200/90 hover:border-blue-400 rounded-xl p-4 sm:p-5 shadow-2xs hover:shadow-md cursor-pointer transition-all duration-200 flex flex-col justify-between group relative overflow-hidden"
                >
                  {/* Subtle top indicator bar */}
                  <div
                    className={`absolute top-0 left-0 right-0 h-1 transition-colors ${
                      delta > 0
                        ? "bg-emerald-500"
                        : delta < 0
                        ? "bg-rose-500"
                        : "bg-sky-500"
                    }`}
                  />

                  <div className="space-y-3 pt-1">
                    {/* Status Badges Header */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Progress vs Plan Badge */}
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-md border flex items-center gap-1.5 ${
                            delta > 0
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200/90"
                              : delta < 0
                              ? "bg-rose-50 text-rose-800 border-rose-200/90"
                              : "bg-sky-50 text-sky-800 border-sky-200/90"
                          }`}
                        >
                          {delta > 0 ? (
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          ) : delta < 0 ? (
                            <TrendingDown className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                          )}
                          <span className="tabular-nums font-mono font-bold">
                            {Math.abs(delta).toFixed(2)}%
                          </span>
                          <span>{delta > 0 ? "เร็วกว่าแผน" : delta < 0 ? "ช้ากว่าแผน" : "ตามแผน"}</span>
                        </span>

                        {/* Contract Timeline / Penalty Badges */}
                        {(() => {
                          const penalty = calculateLiquidatedDamages(
                            p,
                            currentProgress.actualPercent || p.progressField
                          );
                          if (penalty.statusLevel === "completed") {
                            return (
                              <span
                                className={`text-xs font-semibold px-2.5 py-1 rounded-md border flex items-center gap-1.5 ${
                                  penalty.totalFineAmount > 0
                                    ? "bg-amber-50 text-amber-800 border-amber-300"
                                    : "bg-emerald-50 text-emerald-800 border-emerald-200/90"
                                }`}
                              >
                                {penalty.totalFineAmount > 0 ? (
                                  <Scale className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                )}
                                <span>{penalty.statusTitle}</span>
                              </span>
                            );
                          }
                          if (penalty.statusLevel === "critical_cap") {
                            return (
                              <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-rose-600 text-white border border-rose-700 flex items-center gap-1.5 shadow-2xs">
                                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                                <span>{penalty.statusTitle}</span>
                              </span>
                            );
                          }
                          if (penalty.statusLevel === "under_review" || penalty.statusLevel === "waived") {
                            return (
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border flex items-center gap-1.5 ${penalty.badgeClasses.bg} ${penalty.badgeClasses.text} ${penalty.badgeClasses.border}`}>
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                <span>{penalty.statusTitle}</span>
                              </span>
                            );
                          }
                          if (penalty.statusLevel === "overdue_fine") {
                            return (
                              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-rose-50 text-rose-800 border border-rose-200/90 flex items-center gap-1.5">
                                <AlertOctagon className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                                <span>หมดสัญญา (+{penalty.overdueDays} วัน / ปรับ {penalty.totalFineAmount.toLocaleString()} บ.)</span>
                              </span>
                            );
                          }
                          if (penalty.statusLevel === "warning_30d") {
                            return (
                              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200/90 flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                <span>ใกล้หมดสัญญา (เหลือ {penalty.remainingDays} วัน)</span>
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>

                      {isAdmin && onDeleteProject && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteProject(p.sheetName);
                          }}
                          title="ลบโครงการนี้"
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Project Name & Sub-plan Tag */}
                    <div className="space-y-1 pt-0.5">
                      {isAllPlans && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                          <Layers className="h-3 w-3 text-indigo-500 shrink-0" />
                          <span>แผนงาน: {p.planName}</span>
                        </span>
                      )}
                      <h4
                        className="text-[15px] font-bold text-slate-900 group-hover:text-blue-700 transition-colors line-clamp-2 leading-relaxed tracking-tight"
                        title={p.projectName}
                      >
                        {p.projectName}
                      </h4>
                    </div>

                    {/* Structured Metadata Box */}
                    <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-200/70 space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-slate-500 font-medium shrink-0 flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          <span>ห้างที่รับผิดชอบ:</span>
                        </span>
                        <span className="text-slate-800 font-semibold text-right leading-snug break-words">
                          {p.contractor || "-"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60">
                        <span className="text-slate-500 font-medium shrink-0 flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>ช่วงเวลาสัญญา:</span>
                        </span>
                        <span className="text-slate-800 font-medium font-mono text-[11.5px] tabular-nums text-right">
                          {formatDateDisplay(p.startDate)} ถึง {formatDateDisplay(p.endDate)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60">
                        <span className="text-slate-500 font-medium shrink-0 flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-slate-400" />
                          <span>ปัจจุบันงวดครั้งที่:</span>
                        </span>
                        <span className="text-slate-800 font-semibold text-[11px] bg-white px-2.5 py-0.5 rounded border border-slate-200 shadow-2xs">
                          {currentProgress.periodNo ? `งวดที่ ${currentProgress.periodNo}` : "งวดที่ 1"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60">
                        <span className="text-slate-500 font-medium shrink-0 flex items-center gap-1.5">
                          <Coins className="h-3.5 w-3.5 text-slate-400" />
                          <span>วงเงินสัญญา:</span>
                        </span>
                        <span className="text-slate-900 font-bold font-mono text-xs tabular-nums">
                          {formatCurrency(p.contractAmount)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Visual Progress Bars */}
                  <div className="mt-4 space-y-3">
                    {/* Progress Field */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600 font-medium">ความคืบหน้าในสนาม</span>
                        <span className="text-slate-900 font-bold font-mono tabular-nums bg-slate-100 px-2 py-0.5 rounded border border-slate-200/80 text-[11px]">
                          {currentProgress.actualPercent}%
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full border border-slate-200/60 overflow-hidden">
                        <div
                          style={{ width: `${Math.min(100, Math.max(0, currentProgress.actualPercent))}%` }}
                          className={`h-full rounded-full transition-all duration-300 ${
                            isAhead ? "bg-emerald-600" : "bg-amber-500"
                          }`}
                        />
                      </div>
                    </div>

                    {/* Progress Disbursements */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600 font-medium">การเบิกจ่ายงบประมาณ</span>
                        <span className="text-slate-900 font-bold font-mono tabular-nums bg-slate-100 px-2 py-0.5 rounded border border-slate-200/80 text-[11px]">
                          {p.disbursedPercent}%
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full border border-slate-200/60 overflow-hidden">
                        <div
                          style={{ width: `${Math.min(100, Math.max(0, p.disbursedPercent))}%` }}
                          className="h-full rounded-full bg-blue-600 transition-all duration-300"
                        />
                      </div>
                    </div>

                    {/* หมายเหตุโครงการ (แสดงและแก้ไขได้เฉพาะในโหมด Owner เท่านั้น) */}
                    {isOwner && (
                      <div
                        className="pt-3 mt-3 border-t border-slate-200/80 space-y-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                            <FileText className="h-3.5 w-3.5 text-amber-600" />
                            <span>หมายเหตุโครงการ</span>
                            <span className="text-[9.5px] font-medium text-amber-800 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Crown className="h-3 w-3 text-amber-600" />
                              <span>เฉพาะ Owner</span>
                            </span>
                          </div>
                          {editingNotesSheet === p.sheetName ? (
                            <span className="text-[10px] text-slate-400 font-mono">Ctrl+Enter บันทึก</span>
                          ) : p.projectNotes ? (
                            <button
                              type="button"
                              onClick={(e) => startEditingNotes(e, p)}
                              className="text-xs text-amber-800 hover:text-amber-950 font-medium flex items-center gap-1 hover:underline cursor-pointer"
                              title="แก้ไขหมายเหตุ (เฉพาะ Owner)"
                            >
                              <Edit3 className="h-3 w-3" />
                              <span>แก้ไข</span>
                            </button>
                          ) : null}
                        </div>

                        {editingNotesSheet === p.sheetName ? (
                          <div className="space-y-2 animate-in fade-in duration-150">
                            <textarea
                              value={notesDraft}
                              onChange={(e) => setNotesDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                                  e.preventDefault();
                                  handleSaveNotes(e, p);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  handleCancelEditingNotes(e);
                                }
                              }}
                              placeholder="ระบุข้อความหมายเหตุสำหรับโครงการนี้ (แสดงเฉพาะในโหมด Owner)..."
                              rows={2}
                              autoFocus
                              className="w-full text-xs p-2.5 rounded-lg border border-amber-300 bg-amber-50/40 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-900 placeholder:text-slate-400 resize-none transition-all shadow-2xs leading-relaxed"
                            />
                            <div className="flex items-center justify-between gap-1">
                              {notesDraft ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNotesDraft("");
                                  }}
                                  className="text-[11px] text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
                                  title="ล้างข้อความทั้งหมด"
                                >
                                  ล้างข้อความ
                                </button>
                              ) : (
                                <span />
                              )}
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={handleCancelEditingNotes}
                                  className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                                >
                                  ยกเลิก
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleSaveNotes(e, p)}
                                  disabled={isSavingNote}
                                  className="px-3 py-1 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 active:bg-amber-900 rounded-md shadow-2xs transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  <Check className="h-3 w-3" />
                                  <span>{isSavingNote ? "กำลังบันทึก..." : "บันทึก"}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : p.projectNotes ? (
                          <div
                            onClick={(e) => startEditingNotes(e, p)}
                            className="p-2.5 rounded-lg bg-amber-50/70 hover:bg-amber-100/60 border border-amber-200/90 text-xs text-amber-950 leading-relaxed cursor-pointer transition-colors"
                            title="คลิกเพื่อแก้ไขหมายเหตุ (เฉพาะ Owner)"
                          >
                            <p className="line-clamp-3 whitespace-pre-wrap break-words">{p.projectNotes}</p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => startEditingNotes(e, p)}
                            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-dashed border-slate-300 hover:border-amber-400 bg-slate-50/80 hover:bg-amber-50/50 text-slate-600 hover:text-amber-900 text-xs font-medium transition-colors cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5 text-slate-500" />
                            <span>เพิ่มหมายเหตุโครงการ (เฉพาะ Owner)</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Card Footer Interactive Cue */}
                    <div className="pt-2.5 mt-2.5 border-t border-slate-100 flex items-center justify-between text-[11.5px] text-slate-400 group-hover:text-blue-700 transition-colors">
                      <span className="font-medium">ดูข้อมูลโครงการและงวดงาน</span>
                      <ChevronRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
