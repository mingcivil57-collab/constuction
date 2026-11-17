import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Project,
  Task,
  ProgressUpdate,
  SuspensionPeriod,
  DisbursementPeriod,
  ProjectPhoto,
  PeriodicProgressRecord,
  ContractExtension,
  PenaltyNoticeDoc,
} from "../types";
import PeriodicTableSection from "./PeriodicTableSection";
import ProjectMapSection from "./ProjectMapSection";
import PhotoLightboxModal from "./PhotoLightboxModal";
import { VisualRemarkEditor } from "./VisualRemarkEditor";
import { getOrCreateDriveFolder, uploadFileToDrive } from "../lib/googleDrive";
import {
  formatDateDisplay,
  formatDateDisplayWithPeriod,
  calculateProjectTimeline,
  calculateContractDays,
  addDaysToDateStr,
  calculateLiquidatedDamages,
  PenaltyCalculationResult,
  mergeSameDateUpdates,
  groupUpdatesByPeriodAndDate,
  calculateSuspensionDays,
  getActiveSuspension,
  getTotalSuspensionStats,
  parseDate,
  formatDateYMD,
} from "../lib/dateUtils";
import { getCurrentProgressInfo, getDefaultPeriodicProgress, getProcessedPeriodicRemarks, getActualMonthlyPercentForPeriod } from "../lib/periodicUtils";
import { getUserSession } from "../lib/userAuth";
import {
  generateDisbursementsPdfHtml,
  printDisbursementsPdfReport,
  toArabicDigits,
  formatRemarkBodyHtml,
} from "../lib/exportPdf";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Briefcase,
  Users,
  CheckSquare,
  FileText,
  TrendingUp,
  Percent,
  Plus,
  Send,
  Edit,
  Save,
  X,
  AlertTriangle,
  Coins,
  Camera,
  Image as ImageIcon,
  ExternalLink,
  Upload,
  Loader2,
  CheckCircle2,
  Trash2,
  Sliders,
  Check,
  Minus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Pencil,
  LayoutGrid,
  Rows,
  FolderKanban,
  Layers,
  Settings2,
  Sparkles,
  MoveRight,
  CalendarPlus,
  CalendarCheck,
  History,
  AlertOctagon,
  Scale,
  ShieldAlert,
  FileCheck,
  Rocket,
  BookOpen,
  AlertCircle,
  FileBadge2,
  Gauge,
  Zap,
  PauseCircle,
  PlayCircle,
  FilePlus2,
  CalendarRange,
  Info,
  Undo2,
  ArrowUpRight,
  Printer,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Eye,
  ShieldCheck,
  UserCheck,
  HardHat,
} from "lucide-react";

// Helper to format personnel names with an extra spacebar between first name and last name
const formatPersonnelName = (name?: string): string => {
  if (!name || name.trim() === "" || name.trim() === "-") return "-";
  // Replace single/multiple whitespace with 2 non-breaking spaces for reliable rendering
  return name.trim().replace(/\s+/g, "\u00A0\u00A0");
};

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
  onUpdateMetadata: (updated: Project) => Promise<void>;
  onAddTask: (sheetName: string, task: Task) => Promise<void>;
  onUpdateTasks?: (sheetName: string, tasks: Task[]) => Promise<void>;
  onAddUpdate: (sheetName: string, update: ProgressUpdate) => Promise<void>;
  onAddDisbursement: (sheetName: string, period: DisbursementPeriod) => Promise<void>;
  onUpdateDisbursements?: (sheetName: string, disbursements: DisbursementPeriod[]) => Promise<void>;
  onAddPhoto: (sheetName: string, photo: ProjectPhoto) => Promise<void>;
  onUpdatePhotos?: (sheetName: string, photos: ProjectPhoto[]) => Promise<void>;
  onUpdateUpdates?: (sheetName: string, updates: ProgressUpdate[]) => Promise<void>;
  onUpdatePeriodicProgress?: (sheetName: string, records: PeriodicProgressRecord[], remarks?: string[]) => Promise<void>;
  onDeleteProject?: (sheetName: string) => Promise<void>;
  isLoading: boolean;
  isAdmin?: boolean;
  onRequestAdminLogin?: (actionName?: string) => void;
  onCheckFirebaseConnection?: () => boolean;
}

const samplePhotos = [
  {
    title: "ปรับระดับพื้นที่ / เตรียมงาน",
    url: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "งานขุดดิน / ตอกเสาเข็ม",
    url: "https://images.unsplash.com/photo-1581094288338-2314dddb7ecc?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "เทปูนฐานราก / งานคอนกรีต",
    url: "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "โครงสร้างเหล็ก / คานชั้นบน",
    url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "การก่อผนัง / งานปูกระเบื้อง",
    url: "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "ตรวจสอบความเรียบร้อยหน้างาน",
    url: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=600&q=80",
  },
];

export default function ProjectDetail({
  project,
  onBack,
  onUpdateMetadata,
  onAddTask,
  onUpdateTasks,
  onAddUpdate,
  onAddDisbursement,
  onUpdateDisbursements,
  onAddPhoto,
  onUpdatePhotos,
  onUpdateUpdates,
  onUpdatePeriodicProgress,
  onDeleteProject,
  isLoading,
  isAdmin = false,
  onRequestAdminLogin,
  onCheckFirebaseConnection,
}: ProjectDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  
  // Edited form states
  const [editForm, setEditForm] = useState<Project>({ ...project });

  // Sync editForm state whenever project prop updates from live Google Sheet refresh
  useEffect(() => {
    setEditForm({ ...project });
  }, [project]);
  
  // Task form state
  const [taskName, setTaskName] = useState("");
  const [taskStart, setTaskStart] = useState("");
  const [taskEnd, setTaskEnd] = useState("");
  const [taskProgress, setTaskProgress] = useState(0);
  
  // Update form state
  const [updateDetails, setUpdateDetails] = useState("");
  const [updateReporter, setUpdateReporter] = useState("");
  const [updateDate, setUpdateDate] = useState("");
  const [showAddUpdateForm, setShowAddUpdateForm] = useState(false);

  // Confirmation Popup Modal State for Deletions
  const [itemToDelete, setItemToDelete] = useState<{
    type: "suspension" | "photo" | "task" | "update" | "disbursement" | "extension" | "penaltyDoc";
    index: number;
    title: string;
    description?: string;
    extraId?: string;
  } | null>(null);

  const handleConfirmDeleteItem = async () => {
    if (!itemToDelete) return;
    const { type, index, extraId } = itemToDelete;
    setItemToDelete(null);

    if (type === "suspension") {
      const updatedList = (project.suspensions || []).filter((_, i) => i !== index);
      try {
        await onUpdateMetadata({ ...project, suspensions: updatedList });
      } catch (err) {
        console.error(err);
      }
    } else if (type === "photo") {
      const updatedPhotos = (project.photos || []).filter((_, i) => i !== index);
      if (onUpdatePhotos) {
        await onUpdatePhotos(project.sheetName, updatedPhotos);
      } else {
        await onUpdateMetadata({ ...project, photos: updatedPhotos });
      }
    } else if (type === "task") {
      const updatedTasks = project.tasks.filter((_, idx) => idx !== index);
      if (onUpdateTasks) {
        await onUpdateTasks(project.sheetName, updatedTasks);
      }
    } else if (type === "update") {
      const updatedList = displayUpdates.filter((_, i) => i !== index);
      if (onUpdateUpdates) {
        await onUpdateUpdates(project.sheetName, updatedList);
      }
    } else if (type === "disbursement") {
      const updatedList = (project.disbursements || []).filter((_, i) => i !== index);
      if (onUpdateDisbursements) {
        await onUpdateDisbursements(project.sheetName, updatedList);
      }
    } else if (type === "extension") {
      const currentExts = project.extensions || [];
      const targetItem = currentExts[index];
      const remainingExts = currentExts.filter((_, i) => i !== index);

      let initialBaseEndDate = project.endDate;
      if (currentExts.length > 0 && currentExts[0].oldEndDate && currentExts[0].oldEndDate !== "-") {
        initialBaseEndDate = currentExts[0].oldEndDate;
      } else if (targetItem?.oldEndDate && targetItem.oldEndDate !== "-") {
        initialBaseEndDate = targetItem.oldEndDate;
      }

      let currentChainEndDate = initialBaseEndDate;
      const updatedExts: ContractExtension[] = remainingExts.map((ext, i) => {
        const extDays = Number(ext.extensionDays) || 0;
        const oldEnd = currentChainEndDate;
        const newEnd = addDaysToDateStr(oldEnd, extDays);
        currentChainEndDate = newEnd;
        return {
          ...ext,
          round: i + 1,
          oldEndDate: oldEnd,
          newEndDate: newEnd,
        };
      });

      const finalEndDate = remainingExts.length > 0 ? currentChainEndDate : initialBaseEndDate;
      const updatedContractDays = calculateContractDays(project.startDate, finalEndDate);

      try {
        await onUpdateMetadata({
          ...project,
          endDate: finalEndDate,
          contractDays: updatedContractDays > 0 ? updatedContractDays : project.contractDays,
          extensions: updatedExts,
        });
      } catch (err) {
        console.error("Failed to delete contract extension:", err);
        alert("เกิดข้อผิดพลาดในการลบประวัติการขยายอายุสัญญา");
      }
    } else if (type === "penaltyDoc") {
      const updatedDocs = (project.penaltyNoticeDocs || []).filter((d, i) => d.id !== extraId && i !== index);
      try {
        await onUpdateMetadata({
          ...project,
          penaltyNoticeDocs: updatedDocs,
        });
      } catch (err) {
        console.error("Failed to delete penalty document:", err);
        alert("เกิดข้อผิดพลาดในการลบเอกสาร");
      }
    }
  };

  // Work Suspension Management (การบริหารจัดการคำสั่งหยุดงานชั่วคราว) States & Handlers
  const [showSuspensionModal, setShowSuspensionModal] = useState<boolean>(false);
  const [editingSuspensionIndex, setEditingSuspensionIndex] = useState<number | null>(null);
  const [suspensionStart, setSuspensionStart] = useState<string>("");
  const [suspensionEnd, setSuspensionEnd] = useState<string>("");
  const [suspensionOrderDocNo, setSuspensionOrderDocNo] = useState<string>("");
  const [suspensionOrderDocDate, setSuspensionOrderDocDate] = useState<string>("");
  const [suspensionIssuer, setSuspensionIssuer] = useState<string>("");
  const [suspensionReasonCategory, setSuspensionReasonCategory] = useState<"government" | "force_majeure" | "contractor_fault" | "other">("government");
  const [suspensionReason, setSuspensionReason] = useState<string>("");
  const [suspensionIsEligible, setSuspensionIsEligible] = useState<boolean>(true);
  const [suspensionActionType, setSuspensionActionType] = useState<"extend_contract" | "waive_penalty" | "under_review" | "none">("extend_contract");
  const [suspensionResumeDocNo, setSuspensionResumeDocNo] = useState<string>("");
  const [suspensionResumeDocDate, setSuspensionResumeDocDate] = useState<string>("");
  const [suspensionAutoExtendContract, setSuspensionAutoExtendContract] = useState<boolean>(false);
  const [isSavingSuspension, setIsSavingSuspension] = useState<boolean>(false);

  // Quick Resume Work Modal State
  const [showResumeWorkModal, setShowResumeWorkModal] = useState<boolean>(false);
  const [resumeTargetIndex, setResumeTargetIndex] = useState<number | null>(null);
  const [resumeDate, setResumeDate] = useState<string>(new Date().toLocaleDateString("en-CA"));
  const [resumeDocNo, setResumeDocNo] = useState<string>("");
  const [resumeDocDate, setResumeDocDate] = useState<string>(new Date().toLocaleDateString("en-CA"));
  const [resumeAutoExtend, setResumeAutoExtend] = useState<boolean>(true);
  const [isSavingResume, setIsSavingResume] = useState<boolean>(false);

  const handleOpenAddSuspension = () => {
    if (!isOwnerOrAdmin) {
      onRequestAdminLogin?.("บันทึกคำสั่งหยุดงานชั่วคราว");
      return;
    }
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
    setEditingSuspensionIndex(null);
    setSuspensionStart(new Date().toLocaleDateString("en-CA"));
    setSuspensionEnd("");
    setSuspensionOrderDocNo("");
    setSuspensionOrderDocDate(new Date().toLocaleDateString("en-CA"));
    setSuspensionIssuer("ผู้ว่าจ้าง / คณะกรรมการตรวจรับพัสดุ");
    setSuspensionReasonCategory("government");
    setSuspensionReason("");
    setSuspensionIsEligible(true);
    setSuspensionActionType("extend_contract");
    setSuspensionResumeDocNo("");
    setSuspensionResumeDocDate("");
    setSuspensionAutoExtendContract(false);
    setShowSuspensionModal(true);
  };

  const handleOpenEditSuspension = (idx: number) => {
    if (!isOwnerOrAdmin) {
      onRequestAdminLogin?.("แก้ไขข้อมูลการสั่งหยุดงาน");
      return;
    }
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
    const item = (project.suspensions || [])[idx];
    if (!item) return;

    setEditingSuspensionIndex(idx);
    setSuspensionStart(item.start || "");
    setSuspensionEnd(item.end || "");
    setSuspensionOrderDocNo(item.orderDocNo || "");
    setSuspensionOrderDocDate(item.orderDocDate || "");
    setSuspensionIssuer(item.issuer || "");
    setSuspensionReasonCategory(item.reasonCategory || "government");
    setSuspensionReason(item.reason || "");
    setSuspensionIsEligible(item.isEligibleForExtension !== false);
    setSuspensionActionType(item.actionType || (item.approvedExtensionDays ? "extend_contract" : "under_review"));
    setSuspensionResumeDocNo(item.resumeDocNo || "");
    setSuspensionResumeDocDate(item.resumeDocDate || "");
    setSuspensionAutoExtendContract(false);
    setShowSuspensionModal(true);
  };

  const handleOpenQuickResume = (idx: number) => {
    if (!isOwnerOrAdmin) {
      onRequestAdminLogin?.("บันทึกคำสั่งให้เริ่มงานต่อ (Resume Work)");
      return;
    }
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
    const item = (project.suspensions || [])[idx];
    if (!item) return;

    setResumeTargetIndex(idx);
    setResumeDate(new Date().toLocaleDateString("en-CA"));
    setResumeDocNo("");
    setResumeDocDate(new Date().toLocaleDateString("en-CA"));
    setResumeAutoExtend(item.isEligibleForExtension !== false && item.reasonCategory !== "contractor_fault");
    setShowResumeWorkModal(true);
  };

  const handleSaveSuspension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnerOrAdmin) return;
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;

    if (!suspensionStart) {
      alert("กรุณาระบุวันที่เริ่มมีคำสั่งหยุดงาน");
      return;
    }

    const calculatedDays = calculateSuspensionDays(suspensionStart, suspensionEnd);

    setIsSavingSuspension(true);
    try {
      const suspensionRecord: SuspensionPeriod = {
        id: editingSuspensionIndex !== null && project.suspensions?.[editingSuspensionIndex]?.id
          ? project.suspensions[editingSuspensionIndex].id
          : `susp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        start: suspensionStart,
        end: suspensionEnd.trim() && suspensionEnd !== "-" ? suspensionEnd.trim() : undefined,
        days: calculatedDays,
        orderDocNo: suspensionOrderDocNo.trim() || undefined,
        orderDocDate: suspensionOrderDocDate || undefined,
        issuer: suspensionIssuer.trim() || undefined,
        reasonCategory: suspensionReasonCategory,
        reason: suspensionReason.trim() || undefined,
        isEligibleForExtension: suspensionIsEligible,
        actionType: suspensionActionType,
        resumeDocNo: suspensionResumeDocNo.trim() || undefined,
        resumeDocDate: suspensionResumeDocDate || undefined,
        approvedExtensionDays: suspensionAutoExtendContract && calculatedDays > 0 ? calculatedDays : undefined,
      };

      let updatedList = [...(project.suspensions || [])];
      if (editingSuspensionIndex !== null) {
        updatedList[editingSuspensionIndex] = suspensionRecord;
      } else {
        updatedList.push(suspensionRecord);
      }

      let updatedEndDate = project.endDate;
      let updatedContractDays = project.contractDays;
      let updatedExtensions = project.extensions || [];

      // If user selected auto-extend contract and we have a valid end date for suspension with days > 0
      if (suspensionAutoExtendContract && calculatedDays > 0 && suspensionIsEligible && suspensionEnd) {
        const baseEnd = project.endDate && project.endDate !== "-" ? project.endDate : new Date().toLocaleDateString("en-CA");
        const newEndDateCalc = addDaysToDateStr(baseEnd, calculatedDays);
        const nextRound = (project.extensions?.length || 0) + 1;
        const newExt: ContractExtension = {
          round: nextRound,
          extensionDays: calculatedDays,
          oldEndDate: project.endDate,
          newEndDate: newEndDateCalc,
          docNumber: suspensionOrderDocNo.trim() || `คำสั่งหยุดงาน ${suspensionStart}`,
          approvedDate: suspensionOrderDocDate || new Date().toLocaleDateString("en-CA"),
          reason: `ขยายสัญญาเนื่องจากการสั่งหยุดงานชั่วคราว (${calculatedDays} วัน) ${suspensionReason ? `สาเหตุ: ${suspensionReason}` : ""}`,
        };
        updatedExtensions = [...updatedExtensions, newExt];
        updatedEndDate = newEndDateCalc;
        updatedContractDays = calculateContractDays(project.startDate, newEndDateCalc);
      }

      await onUpdateMetadata({
        ...project,
        endDate: updatedEndDate,
        contractDays: updatedContractDays > 0 ? updatedContractDays : project.contractDays,
        extensions: updatedExtensions,
        suspensions: updatedList,
      });

      setShowSuspensionModal(false);
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึกคำสั่งหยุดงาน");
    } finally {
      setIsSavingSuspension(false);
    }
  };

  const handleSaveResumeWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnerOrAdmin || resumeTargetIndex === null) return;
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;

    if (!resumeDate) {
      alert("กรุณาระบุวันที่สิ้นสุดการหยุดงาน / วันที่สั่งให้เริ่มงานต่อ");
      return;
    }

    const currentList = [...(project.suspensions || [])];
    const targetSuspension = currentList[resumeTargetIndex];
    if (!targetSuspension) return;

    setIsSavingResume(true);
    try {
      const calculatedDays = calculateSuspensionDays(targetSuspension.start, resumeDate);
      
      const updatedSuspension: SuspensionPeriod = {
        ...targetSuspension,
        end: resumeDate,
        days: calculatedDays,
        resumeDocNo: resumeDocNo.trim() || undefined,
        resumeDocDate: resumeDocDate || undefined,
        approvedExtensionDays: resumeAutoExtend && calculatedDays > 0 ? calculatedDays : targetSuspension.approvedExtensionDays,
        actionType: resumeAutoExtend ? "extend_contract" : targetSuspension.actionType || "under_review",
      };

      currentList[resumeTargetIndex] = updatedSuspension;

      let updatedEndDate = project.endDate;
      let updatedContractDays = project.contractDays;
      let updatedExtensions = project.extensions || [];

      // Auto-extend contract timeline if enabled
      if (resumeAutoExtend && calculatedDays > 0 && targetSuspension.isEligibleForExtension !== false && targetSuspension.reasonCategory !== "contractor_fault") {
        const baseEnd = project.endDate && project.endDate !== "-" ? project.endDate : new Date().toLocaleDateString("en-CA");
        const newEndDateCalc = addDaysToDateStr(baseEnd, calculatedDays);
        const nextRound = (project.extensions?.length || 0) + 1;
        const newExt: ContractExtension = {
          round: nextRound,
          extensionDays: calculatedDays,
          oldEndDate: project.endDate,
          newEndDate: newEndDateCalc,
          docNumber: resumeDocNo.trim() || targetSuspension.orderDocNo || `หนังสือสั่งเริ่มงานต่อ ${resumeDate}`,
          approvedDate: resumeDocDate || new Date().toLocaleDateString("en-CA"),
          reason: `ขยายระยะเวลาสัญญาตามจำนวนวันสั่งหยุดงานจริง (${calculatedDays} วัน) หนังสือเริ่มงาน ${resumeDocNo || "-"}`,
        };
        updatedExtensions = [...updatedExtensions, newExt];
        updatedEndDate = newEndDateCalc;
        updatedContractDays = calculateContractDays(project.startDate, newEndDateCalc);
      }

      await onUpdateMetadata({
        ...project,
        endDate: updatedEndDate,
        contractDays: updatedContractDays > 0 ? updatedContractDays : project.contractDays,
        extensions: updatedExtensions,
        suspensions: currentList,
      });

      setShowResumeWorkModal(false);
      setResumeTargetIndex(null);
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึกคำสั่งให้เริ่มงานต่อ");
    } finally {
      setIsSavingResume(false);
    }
  };

  const handleDirectExtendFromSuspension = (suspension: SuspensionPeriod, idx: number) => {
    if (!isOwnerOrAdmin) {
      onRequestAdminLogin?.("ขยายอายุสัญญาจากคำสั่งหยุดงาน");
      return;
    }
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;

    const days = suspension.days || calculateSuspensionDays(suspension.start, suspension.end);
    if (days <= 0) {
      alert("ไม่สามารถขยายเวลาได้เนื่องจากจำนวนวันหยุดงานเท่ากับ 0 วัน หรือยังไม่มีการระบุวันสิ้นสุดการหยุดงาน");
      return;
    }

    const baseEnd = project.endDate && project.endDate !== "-" ? project.endDate : new Date().toLocaleDateString("en-CA");
    const newEnd = addDaysToDateStr(baseEnd, days);
    const nextRound = (project.extensions?.length || 0) + 1;

    setExtensionRound(nextRound);
    setExtensionDays(String(days));
    setNewEndDate(newEnd);
    setExtensionDocNumber(suspension.orderDocNo || `คำสั่งหยุดงาน ${suspension.start}`);
    setExtensionApprovedDate(suspension.orderDocDate || new Date().toLocaleDateString("en-CA"));
    setExtensionReason(`ขยายระยะเวลาสัญญาเนื่องจากการสั่งหยุดงานชั่วคราว (${days} วัน) ${suspension.reason ? `สาเหตุ: ${suspension.reason}` : ""}`);
    setShowExtensionModal(true);
  };

  const handleDeletePhoto = async (idx: number) => {
    const updatedPhotos = (project.photos || []).filter((_, i) => i !== idx);
    if (onUpdatePhotos) {
      await onUpdatePhotos(project.sheetName, updatedPhotos);
    } else {
      await onUpdateMetadata({ ...project, photos: updatedPhotos });
    }
  };

  // Contract Extension (ขยายอายุสัญญา) form states & handlers
  const [showExtensionModal, setShowExtensionModal] = useState<boolean>(false);
  const [extensionRound, setExtensionRound] = useState<number>(1);
  const [extensionDays, setExtensionDays] = useState<string>("30");
  const [newEndDate, setNewEndDate] = useState<string>("");
  const [extensionDocNumber, setExtensionDocNumber] = useState<string>("");
  const [extensionApprovedDate, setExtensionApprovedDate] = useState<string>(new Date().toLocaleDateString("en-CA"));
  const [extensionReason, setExtensionReason] = useState<string>("");
  const [isSavingExtension, setIsSavingExtension] = useState<boolean>(false);

  const handleOpenAddExtension = () => {
    if (!isOwnerOrAdmin) {
      onRequestAdminLogin?.("บันทึกการขยายอายุสัญญา");
      return;
    }
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
    const currentExts = project.extensions || [];
    const nextRound = currentExts.length + 1;
    setExtensionRound(nextRound);
    setExtensionDays("30");
    const baseEnd = project.endDate && project.endDate !== "-" ? project.endDate : new Date().toLocaleDateString("en-CA");
    setNewEndDate(addDaysToDateStr(baseEnd, 30));
    setExtensionDocNumber("");
    setExtensionApprovedDate(new Date().toLocaleDateString("en-CA"));
    setExtensionReason("");
    setShowExtensionModal(true);
  };

  const handleExtensionDaysChange = (daysStr: string) => {
    setExtensionDays(daysStr);
    const numDays = parseInt(daysStr, 10);
    const baseEnd = project.endDate && project.endDate !== "-" ? project.endDate : new Date().toLocaleDateString("en-CA");
    if (!isNaN(numDays) && numDays > 0) {
      setNewEndDate(addDaysToDateStr(baseEnd, numDays));
    }
  };

  const handleNewEndDateChange = (targetEndDate: string) => {
    setNewEndDate(targetEndDate);
    const baseEnd = project.endDate && project.endDate !== "-" ? project.endDate : new Date().toLocaleDateString("en-CA");
    if (targetEndDate && baseEnd) {
      const diff = calculateContractDays(baseEnd, targetEndDate) - 1;
      if (diff > 0) {
        setExtensionDays(String(diff));
      }
    }
  };

  const handleAddExtensionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnerOrAdmin) return;
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
    if (!newEndDate) {
      alert("กรุณาระบุวันสิ้นสุดสัญญาใหม่");
      return;
    }
    const daysNum = parseInt(extensionDays, 10) || 0;
    if (daysNum <= 0) {
      alert("กรุณาระบุจำนวนวันที่ขยายเพิ่มมากกว่า 0 วัน");
      return;
    }

    setIsSavingExtension(true);
    try {
      const newExtension: ContractExtension = {
        round: Number(extensionRound) || ((project.extensions?.length || 0) + 1),
        extensionDays: daysNum,
        oldEndDate: project.endDate,
        newEndDate: newEndDate,
        docNumber: extensionDocNumber.trim() || undefined,
        approvedDate: extensionApprovedDate || undefined,
        reason: extensionReason.trim() || undefined,
      };

      const updatedExtensions = [...(project.extensions || []), newExtension];
      const updatedContractDays = calculateContractDays(project.startDate, newEndDate);

      await onUpdateMetadata({
        ...project,
        endDate: newEndDate,
        contractDays: updatedContractDays > 0 ? updatedContractDays : (project.contractDays + daysNum),
        extensions: updatedExtensions,
      });

      setShowExtensionModal(false);
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึกการขยายอายุสัญญา");
    } finally {
      setIsSavingExtension(false);
    }
  };

  const handleDeleteExtension = (idx: number) => {
    if (!isOwnerOrAdmin) {
      onRequestAdminLogin?.("ลบประวัติการขยายอายุสัญญา");
      return;
    }
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;

    const currentExts = project.extensions || [];
    const targetItem = currentExts[idx];
    if (!targetItem) return;

    const roundNum = targetItem.round || idx + 1;
    const days = targetItem.extensionDays || 0;
    const oldEnd = formatDateDisplay(targetItem.oldEndDate);
    const newEnd = formatDateDisplay(targetItem.newEndDate);

    setItemToDelete({
      type: "extension",
      index: idx,
      title: `ยืนยันการลบประวัติขยายสัญญา ครั้งที่ ${roundNum}`,
      description: `รายการขยายระยะเวลาสัญญา (+${days} วัน)\nช่วงวันที่: ${oldEnd} ➜ ${newEnd}\n${targetItem.docNumber ? `เลขที่หนังสือ: ${targetItem.docNumber}\n` : ""}${targetItem.reason ? `เหตุผล: ${targetItem.reason}\n` : ""}\nเมื่อลบแล้ว ระบบจะปรับคำนวณวันสิ้นสุดสัญญาและอายุสัญญาใหม่อัตโนมัติ`,
    });
  };

  // Liquidated Damages & Fine Setup Modal states
  const [showPenaltyConfigModal, setShowPenaltyConfigModal] = useState<boolean>(false);
  const [penaltyRateInput, setPenaltyRateInput] = useState<string>(
    project.penaltyRatePercent !== undefined ? String(project.penaltyRatePercent) : "0.05"
  );
  const [customDailyFineInput, setCustomDailyFineInput] = useState<string>(
    project.customDailyFine !== undefined ? String(project.customDailyFine) : ""
  );
  const [waivedDaysInput, setWaivedDaysInput] = useState<string>(
    project.waivedDays !== undefined ? String(project.waivedDays) : "0"
  );
  const [waivedReasonInput, setWaivedReasonInput] = useState<string>(project.waivedReason || "");
  const [penaltyStatusInput, setPenaltyStatusInput] = useState<"accumulating" | "reserved" | "waived" | "under_review" | "none">(
    project.penaltyStatus || "accumulating"
  );
  const [actualDeliveryDateInput, setActualDeliveryDateInput] = useState<string>(
    project.acceptedDate && project.acceptedDate !== "-" ? project.acceptedDate : ""
  );
  const [isSavingPenaltyConfig, setIsSavingPenaltyConfig] = useState<boolean>(false);

  const handleOpenPenaltyConfig = () => {
    if (!isOwnerOrAdmin) {
      onRequestAdminLogin?.("ตั้งค่าการคิดค่าปรับและงดลดค่าปรับ");
      return;
    }
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
    setPenaltyRateInput(project.penaltyRatePercent !== undefined ? String(project.penaltyRatePercent) : "0.05");
    setCustomDailyFineInput(project.customDailyFine !== undefined ? String(project.customDailyFine) : "");
    setWaivedDaysInput(project.waivedDays !== undefined ? String(project.waivedDays) : "0");
    setWaivedReasonInput(project.waivedReason || "");
    setPenaltyStatusInput(project.penaltyStatus || "accumulating");
    setActualDeliveryDateInput(project.acceptedDate && project.acceptedDate !== "-" ? project.acceptedDate : "");
    setShowPenaltyConfigModal(true);
  };

  const handleSavePenaltyConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnerOrAdmin) return;
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;

    setIsSavingPenaltyConfig(true);
    try {
      const rateNum = parseFloat(penaltyRateInput);
      const customFineNum = parseFloat(customDailyFineInput);
      const waivedDaysNum = parseInt(waivedDaysInput, 10);

      await onUpdateMetadata({
        ...project,
        penaltyRatePercent: !isNaN(rateNum) && rateNum >= 0 ? rateNum : 0.05,
        customDailyFine: !isNaN(customFineNum) && customFineNum > 0 ? customFineNum : undefined,
        waivedDays: !isNaN(waivedDaysNum) && waivedDaysNum >= 0 ? waivedDaysNum : 0,
        waivedReason: waivedReasonInput.trim() || undefined,
        penaltyStatus: penaltyStatusInput,
        acceptedDate: actualDeliveryDateInput.trim() || "-",
      });

      setShowPenaltyConfigModal(false);
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึกการตั้งค่าค่าปรับ");
    } finally {
      setIsSavingPenaltyConfig(false);
    }
  };

  // Penalty Notice Docs Modal states
  const [showPenaltyDocsModal, setShowPenaltyDocsModal] = useState<boolean>(false);
  const [docTypeInput, setDocTypeInput] = useState<PenaltyNoticeDoc["type"]>("penalty_reservation");
  const [docNumberInput, setDocNumberInput] = useState<string>("");
  const [docDateInput, setDocDateInput] = useState<string>(new Date().toLocaleDateString("en-CA"));
  const [docIssuerInput, setDocIssuerInput] = useState<string>("ผู้ว่าจ้าง / เทศบาล");
  const [docSubjectInput, setDocSubjectInput] = useState<string>("แจ้งการสงวนสิทธิ์การเรียกค่าปรับตามสัญญา");
  const [docDetailsInput, setDocDetailsInput] = useState<string>("");
  const [isSavingPenaltyDoc, setIsSavingPenaltyDoc] = useState<boolean>(false);

  const handleOpenPenaltyDocs = () => {
    if (!isOwnerOrAdmin) {
      onRequestAdminLogin?.("บันทึกหนังสือและเอกสารบริหารสัญญา");
      return;
    }
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
    setDocTypeInput("penalty_reservation");
    setDocNumberInput("");
    setDocDateInput(new Date().toLocaleDateString("en-CA"));
    setDocIssuerInput("ผู้ว่าจ้าง / เทศบาล");
    setDocSubjectInput("แจ้งการสงวนสิทธิ์การเรียกค่าปรับตามสัญญา");
    setDocDetailsInput("");
    setShowPenaltyDocsModal(true);
  };

  const handleAddPenaltyDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnerOrAdmin) return;
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
    if (!docNumberInput.trim() || !docSubjectInput.trim()) {
      alert("กรุณากรอกเลขที่หนังสือและชื่อเรื่อง");
      return;
    }

    setIsSavingPenaltyDoc(true);
    try {
      const newDoc: PenaltyNoticeDoc = {
        id: "DOC-" + Date.now(),
        type: docTypeInput,
        docNumber: docNumberInput.trim(),
        docDate: docDateInput || new Date().toLocaleDateString("en-CA"),
        issuer: docIssuerInput.trim() || "ผู้ว่าจ้าง",
        subject: docSubjectInput.trim(),
        details: docDetailsInput.trim() || undefined,
        status: "active",
      };

      const updatedDocs = [...(project.penaltyNoticeDocs || []), newDoc];
      await onUpdateMetadata({
        ...project,
        penaltyNoticeDocs: updatedDocs,
      });

      setDocNumberInput("");
      setDocSubjectInput("");
      setDocDetailsInput("");
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึกเอกสารหนังสือสัญญา");
    } finally {
      setIsSavingPenaltyDoc(false);
    }
  };

  const handleDeletePenaltyDoc = (docId: string) => {
    if (!isOwnerOrAdmin) return;
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
    const doc = (project.penaltyNoticeDocs || []).find((d) => d.id === docId);

    setItemToDelete({
      type: "penaltyDoc",
      index: -1,
      extraId: docId,
      title: "ยืนยันการลบหนังสือและเอกสารสัญญา",
      description: doc ? `${doc.subject} (เลขที่: ${doc.docNumber})` : "หนังสือราชการรายการนี้",
    });
  };

  // Recovery Plan Modal states
  const [showRecoveryModal, setShowRecoveryModal] = useState<boolean>(false);
  const [recoveryTargetDateInput, setRecoveryTargetDateInput] = useState<string>(project.recoveryTargetDate || "");
  const [recoveryNotesInput, setRecoveryNotesInput] = useState<string>(project.recoveryPlanNotes || "");
  const [isSavingRecovery, setIsSavingRecovery] = useState<boolean>(false);

  const handleOpenRecoveryModal = () => {
    if (!isOwnerOrAdmin) {
      onRequestAdminLogin?.("บันทึกแผนเร่งรัดงาน");
      return;
    }
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
    setRecoveryTargetDateInput(
      project.recoveryTargetDate ||
        addDaysToDateStr(project.endDate && project.endDate !== "-" ? project.endDate : new Date().toLocaleDateString("en-CA"), 30)
    );
    setRecoveryNotesInput(project.recoveryPlanNotes || "");
    setShowRecoveryModal(true);
  };

  const handleSaveRecoveryPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnerOrAdmin) return;
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;

    setIsSavingRecovery(true);
    try {
      await onUpdateMetadata({
        ...project,
        recoveryTargetDate: recoveryTargetDateInput || undefined,
        recoveryPlanNotes: recoveryNotesInput.trim() || undefined,
      });
      setShowRecoveryModal(false);
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึกแผนเร่งรัดงาน");
    } finally {
      setIsSavingRecovery(false);
    }
  };

  // Disbursement form states
  const [showAddDisbursementForm, setShowAddDisbursementForm] = useState(false);
  const [workRound, setWorkRound] = useState<string>("ครั้งที่ 1");
  const [periodNo, setPeriodNo] = useState<string>(() => {
    const firstPeriod = project.periodicProgress?.[0]?.periodNo;
    return firstPeriod !== undefined ? `${firstPeriod}` : "1";
  });
  const [disbursedAmt, setDisbursedAmt] = useState<string>("");
  const [disbursedDate, setDisbursedDate] = useState<string>(new Date().toLocaleDateString("en-CA"));
  const [disbursedStatus, setDisbursedStatus] = useState<"เบิกจ่ายแล้ว" | "ยังไม่เบิกจ่าย">("เบิกจ่ายแล้ว");
  const [disbursedRemarks, setDisbursedRemarks] = useState<string>("");

  // Disbursement table font size for presentation (in px)
  const [disbursementFontSize, setDisbursementFontSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("disbursement_table_font_size");
      if (saved) {
        const num = parseInt(saved, 10);
        if (!isNaN(num) && num >= 9 && num <= 32) return num;
      }
    } catch {}
    return 14;
  });

  const changeDisbursementFontSize = (size: number) => {
    const clamped = Math.max(9, Math.min(32, size));
    setDisbursementFontSize(clamped);
    try {
      localStorage.setItem("disbursement_table_font_size", clamped.toString());
    } catch {}
  };

  // Sort order for Disbursements table (default: ascending 1 -> N)
  const [disbursementSortOrder, setDisbursementSortOrder] = useState<"asc" | "desc">(() => {
    try {
      const saved = localStorage.getItem("disbursement_sort_order");
      if (saved === "asc" || saved === "desc") return saved;
    } catch {}
    return "asc";
  });

  const handleToggleDisbursementSort = () => {
    const newOrder = disbursementSortOrder === "asc" ? "desc" : "asc";
    setDisbursementSortOrder(newOrder);
    try {
      localStorage.setItem("disbursement_sort_order", newOrder);
    } catch {}
  };

  // Role and Permission status
  const userSession = getUserSession();
  const isOwnerOrAdmin = Boolean(
    isAdmin ||
    userSession?.role === "Owner" ||
    userSession?.role === "Admin"
  );

  // Disbursement editing row states
  const [editingDisbursementIndex, setEditingDisbursementIndex] = useState<number | null>(null);
  const [editingDisbursementWorkRound, setEditingDisbursementWorkRound] = useState<string>("ครั้งที่ 1");
  const [editingDisbursementPeriodNo, setEditingDisbursementPeriodNo] = useState<string>("1");
  const [editingDisbursementAmount, setEditingDisbursementAmount] = useState<string>("");
  const [editingDisbursementDate, setEditingDisbursementDate] = useState<string>("");
  const [editingDisbursementStatus, setEditingDisbursementStatus] = useState<"เบิกจ่ายแล้ว" | "ยังไม่เบิกจ่าย">("เบิกจ่ายแล้ว");
  const [editingDisbursementRemarks, setEditingDisbursementRemarks] = useState<string>("");
  const [isSavingDisbursement, setIsSavingDisbursement] = useState<boolean>(false);

  // Computed period numbers & options for Disbursements (aligned with project's total periods)
  const disbursementPeriodOptions = useMemo(() => {
    const periodicRecords = project.periodicProgress || [];
    const knownPeriodNumbers = new Set<number>();
    periodicRecords.forEach((rec) => {
      const p = typeof rec.periodNo === "number" ? rec.periodNo : parseInt(String(rec.periodNo), 10);
      if (!isNaN(p) && p > 0) knownPeriodNumbers.add(p);
    });
    (project.disbursements || []).forEach((d) => {
      const p = typeof d.periodNo === "number" ? d.periodNo : parseInt(String(d.periodNo), 10);
      if (!isNaN(p) && p > 0) knownPeriodNumbers.add(p);
    });

    const maxPeriodNum = Math.max(
      periodicRecords.length,
      (project.disbursements || []).length,
      knownPeriodNumbers.size > 0 ? Math.max(...Array.from(knownPeriodNumbers)) : 0,
      1
    );

    const periodNumbersList = Array.from(
      new Set([
        ...Array.from({ length: maxPeriodNum }, (_, i) => i + 1),
        ...Array.from(knownPeriodNumbers),
      ])
    ).sort((a, b) => a - b);

    return periodNumbersList.map((num) => ({
      value: `${num}`,
      label: `งวดที่ ${num}`,
    }));
  }, [project.periodicProgress, project.disbursements]);

  // Dynamic Work Rounds ("กลุ่มผลงาน (ครั้งที่)"): Number of rounds matches the total number of periods (จำนวนงวด)
  const disbursementWorkRoundOptions = useMemo(() => {
    const count = Math.max(disbursementPeriodOptions.length, 1);
    return Array.from({ length: count }, (_, i) => `ครั้งที่ ${i + 1}`);
  }, [disbursementPeriodOptions]);

  // Group Manager Modal states (Admin / Owner can manage/reassign deliverables groups)
  const [showGroupManagerModal, setShowGroupManagerModal] = useState<boolean>(false);
  const [tempWorkRounds, setTempWorkRounds] = useState<{ [index: number]: string }>({});
  const [isSavingGroupManager, setIsSavingGroupManager] = useState<boolean>(false);

  // PDF Export & Print Modal states
  const [showDisbursementPdfModal, setShowDisbursementPdfModal] = useState<boolean>(false);
  const [includePhotosInPdf, setIncludePhotosInPdf] = useState<boolean>(true);
  const [includePersonnelInPdf, setIncludePersonnelInPdf] = useState<boolean>(true);
  const [selectedPhotoIndices, setSelectedPhotoIndices] = useState<number[]>([]);
  const [showPhotoSelectPanel, setShowPhotoSelectPanel] = useState<boolean>(false);

  // Table Notes & Remarks (หมายเหตุท้ายตาราง) states
  const DEFAULT_DISBURSEMENT_REMARKS = useMemo(
    () => [
      "การเบิกจ่ายเงินค่างานงวดต่างๆ เป็นไปตามเงื่อนไขและข้อกำหนดแห่งสัญญาจ้างฯ โดยผ่านการตรวจสอบความถูกต้องจากผู้ควบคุมงานและคณะกรรมการตรวจรับพัสดุเรียบร้อยแล้ว",
      "จำนวนเงินค่างานที่ระบุในรายงานเป็นยอดเงินก่อนหักภาษี ณ ที่จ่าย และเงินประกันผลงาน (ถ้ามี)",
      "การส่งมอบงานในแต่ละงวด/แต่ละครั้ง ผู้รับจ้างได้ดำเนินการตามแบบรูปรายการละเอียดและข้อกำหนดแห่งสัญญาครบถ้วนสมบูรณ์",
    ],
    []
  );

  const [includeRemarksInPdf, setIncludeRemarksInPdf] = useState<boolean>(true);
  const [includeFinancialStripInPdf, setIncludeFinancialStripInPdf] = useState<boolean>(false);
  const [showRemarksPanel, setShowRemarksPanel] = useState<boolean>(false);
  // Helper to remove leading "งวดที่ X:" or "[งวดที่ X]:" from remark body and clean terms bullet
  const stripPeriodPrefix = (text: string): string => {
    let clean = (text || "").replace(/^(?:\[?งวดที่\s*[\d๑-๙]+\]?[:\s-]*)/i, "").trim();
    clean = clean
      .replace(/^[•\s\-\*]*\(?ข้อกำหนดและเงื่อนไข(?:การ)?ส่งมอบงาน(?:\/|และ)?(?:การ)?เบิกจ่ายเงิน\)?[:\s-]*/gmi, "")
      .replace(/[•\s\-\*]*\(?ข้อกำหนดและเงื่อนไข(?:การ)?ส่งมอบงาน(?:\/|และ)?(?:การ)?เบิกจ่ายเงิน\)?/gi, "")
      .trim();
    return clean;
  };

  // Function to pull Table Notes & Remarks (หมายเหตุท้ายตาราง) directly from the page before printing
  const loadRemarksFromMainPage = useCallback((proj: Project): string[] => {
    // 1. Primary priority: Pull from Table Notes & Remarks (หน้าก่อนสั่งพิมพ์)
    const processed = getProcessedPeriodicRemarks(proj);
    if (processed.length > 0) {
      return processed.map((p) => stripPeriodPrefix(p.text || p.formattedText));
    }
    // 2. Saved disbursement remarks in localStorage
    try {
      const saved = localStorage.getItem(`disbursement_remarks_${proj.sheetName}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((r: string) => stripPeriodPrefix(r));
        }
      }
    } catch (e) {
      // ignore
    }
    // 3. Project's disbursementRemarks property
    if (proj.disbursementRemarks && proj.disbursementRemarks.length > 0) {
      return proj.disbursementRemarks.map((r: string) => stripPeriodPrefix(r));
    }
    // 4. Default 3 items
    return DEFAULT_DISBURSEMENT_REMARKS.map((r) => stripPeriodPrefix(r));
  }, [DEFAULT_DISBURSEMENT_REMARKS]);

  const [disbursementRemarks, setDisbursementRemarks] = useState<string[]>(() => {
    return loadRemarksFromMainPage(project);
  });
  const [debouncedDisbursementRemarks, setDebouncedDisbursementRemarks] = useState<string[]>(disbursementRemarks);

  // References to preserve preview iframe scroll position across remarks editing
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const iframeScrollPosRef = useRef<number>(0);
  const isRestoringScrollRef = useRef<boolean>(false);

  // Debounce the remarks passed to the PDF generator so editing doesn't reload/flicker the iframe on every keystroke
  useEffect(() => {
    const handler = setTimeout(() => {
      // Capture current scroll position before state update triggers srcDoc reload
      if (previewIframeRef.current?.contentWindow) {
        const y =
          previewIframeRef.current.contentWindow.scrollY ||
          previewIframeRef.current.contentDocument?.documentElement.scrollTop ||
          0;
        if (y > 0) {
          iframeScrollPosRef.current = y;
        }
      }
      setDebouncedDisbursementRemarks(disbursementRemarks);
    }, 280);

    return () => clearTimeout(handler);
  }, [disbursementRemarks]);

  // Whenever project or modal changes, ensure remarks stay synced with the page before printing
  useEffect(() => {
    setDisbursementRemarks(loadRemarksFromMainPage(project));
  }, [project.sheetName, project.periodicRemarks, loadRemarksFromMainPage]);

  // When opening the print modal, always pull the latest remarks from the page before printing and reset scroll
  useEffect(() => {
    if (showDisbursementPdfModal) {
      const loaded = loadRemarksFromMainPage(project);
      setDisbursementRemarks(loaded);
      setDebouncedDisbursementRemarks(loaded);
      iframeScrollPosRef.current = 0;
    }
  }, [showDisbursementPdfModal, project, loadRemarksFromMainPage]);

  // Restore scroll position after iframe reloads
  const handleIframeLoad = useCallback(() => {
    const iframe = previewIframeRef.current;
    if (!iframe) return;

    const targetY = iframeScrollPosRef.current;
    isRestoringScrollRef.current = true;

    const restore = () => {
      try {
        if (iframe.contentWindow && targetY > 0) {
          iframe.contentWindow.scrollTo({ top: targetY, left: 0, behavior: "instant" as ScrollBehavior });
        }
      } catch (e) {
        // ignore
      }
    };

    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 40);
    setTimeout(restore, 100);
    setTimeout(restore, 200);
    setTimeout(() => {
      isRestoringScrollRef.current = false;
    }, 260);

    // Attach scroll listener to the loaded window to continuously record scroll position
    try {
      const cw = iframe.contentWindow;
      if (cw) {
        cw.addEventListener(
          "scroll",
          () => {
            if (!isRestoringScrollRef.current) {
              const y = cw.scrollY || cw.document?.documentElement?.scrollTop || cw.document?.body?.scrollTop || 0;
              iframeScrollPosRef.current = y;
            }
          },
          { passive: true }
        );
      }
    } catch (e) {
      console.warn("Could not attach scroll listener to preview iframe", e);
    }
  }, []);

  // Quick navigation functions for document preview
  const scrollToRemarksPage = useCallback(() => {
    try {
      const iframe = previewIframeRef.current;
      const cw = iframe?.contentWindow;
      const doc = iframe?.contentDocument;
      if (cw && doc) {
        const page2 = doc.getElementById("page-2");
        if (page2) {
          page2.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => {
            iframeScrollPosRef.current = cw.scrollY || doc.documentElement.scrollTop || 0;
          }, 350);
        }
      }
    } catch (err) {
      // ignore
    }
  }, []);

  const scrollToFirstPage = useCallback(() => {
    try {
      const iframe = previewIframeRef.current;
      const cw = iframe?.contentWindow;
      const doc = iframe?.contentDocument;
      if (cw && doc) {
        const page1 = doc.getElementById("page-1");
        if (page1) {
          page1.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          cw.scrollTo({ top: 0, behavior: "smooth" });
        }
        setTimeout(() => {
          iframeScrollPosRef.current = 0;
        }, 350);
      }
    } catch (err) {
      // ignore
    }
  }, []);

  const scrollToPdfRemark = useCallback((periodNo: number | string) => {
    try {
      const iframe = previewIframeRef.current;
      const cw = iframe?.contentWindow;
      const doc = iframe?.contentDocument;
      if (cw && doc) {
        const el = doc.getElementById(`pdf-remark-${periodNo}`) || doc.getElementById("page-2");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => {
            iframeScrollPosRef.current = cw.scrollY || doc.documentElement.scrollTop || 0;
          }, 350);
        }
      }
    } catch (err) {
      // ignore
    }
  }, []);

  const handleUpdateDisbursementRemarks = (newRemarks: string[]) => {
    const cleaned = newRemarks.map(stripPeriodPrefix);
    setDisbursementRemarks(cleaned);
    project.disbursementRemarks = cleaned;
    try {
      localStorage.setItem(`disbursement_remarks_${project.sheetName}`, JSON.stringify(cleaned));
    } catch (e) {
      console.error("Failed to save remarks to localStorage", e);
    }
  };

  const handleAddRemark = () => {
    const updated = [...disbursementRemarks, ""];
    handleUpdateDisbursementRemarks(updated);
  };

  const handleEditRemarkItem = (index: number, text: string) => {
    const cleaned = stripPeriodPrefix(text);
    const updated = [...disbursementRemarks];
    updated[index] = cleaned;
    handleUpdateDisbursementRemarks(updated);

    // Live-update DOM in preview iframe immediately without waiting or reloading
    try {
      const doc = previewIframeRef.current?.contentDocument;
      if (doc) {
        const periodNo = index + 1;
        const el = doc.getElementById(`pdf-remark-body-${periodNo}`);
        if (el) {
          el.innerHTML = formatRemarkBodyHtml(cleaned);
        }
      }
    } catch (e) {
      // ignore
    }
  };

  const handleDeleteRemarkItem = (index: number) => {
    const updated = disbursementRemarks.filter((_, i) => i !== index);
    handleUpdateDisbursementRemarks(updated);
  };

  const handleMoveRemarkItem = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === disbursementRemarks.length - 1) return;
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    const updated = [...disbursementRemarks];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    handleUpdateDisbursementRemarks(updated);
  };

  const handleResetDefaultRemarks = () => {
    handleUpdateDisbursementRemarks(DEFAULT_DISBURSEMENT_REMARKS);
  };

  const handleAddPresetRemark = (presetText: string) => {
    if (disbursementRemarks.includes(presetText)) return;
    const updated = [...disbursementRemarks, presetText];
    handleUpdateDisbursementRemarks(updated);
  };

  useEffect(() => {
    if (showDisbursementPdfModal) {
      // Select all photos by default on modal open if not yet set or when project photos change
      if (project.photos && project.photos.length > 0) {
        setSelectedPhotoIndices((prev) => (prev.length === 0 ? project.photos!.map((_, i) => i) : prev));
      }
    }
  }, [showDisbursementPdfModal, project.photos]);

  const handleToggleSelectPhoto = (idx: number) => {
    setSelectedPhotoIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx].sort((a, b) => a - b)
    );
  };

  const handleSelectAllPhotos = () => {
    if (!project.photos) return;
    setSelectedPhotoIndices(project.photos.map((_, i) => i));
  };

  const handleDeselectAllPhotos = () => {
    setSelectedPhotoIndices([]);
  };

  // Helper to resolve milestone / work deliverable round ("ผลงาน ครั้งที่ X")
  const getDisbursementWorkRound = (
    d: DisbursementPeriod,
    index: number,
    allDisbursements: DisbursementPeriod[]
  ): string => {
    if (d.workRound !== undefined && d.workRound !== null && String(d.workRound).trim() !== "") {
      const val = String(d.workRound).trim();
      return val.startsWith("ครั้งที่") ? val : (isNaN(Number(val)) ? val : `ครั้งที่ ${val}`);
    }

    // Check local storage cached group mapping if available
    try {
      if (typeof window !== "undefined" && project?.sheetName) {
        const savedGroupJson = localStorage.getItem(`disbursement_groups_${project.sheetName}`);
        if (savedGroupJson) {
          const groupMap = JSON.parse(savedGroupJson);
          if (groupMap && groupMap[String(d.periodNo)]) {
            const val = String(groupMap[String(d.periodNo)]).trim();
            return val.startsWith("ครั้งที่") ? val : (isNaN(Number(val)) ? val : `ครั้งที่ ${val}`);
          }
        }
      }
    } catch (e) {}

    const pNum = typeof d.periodNo === "number" ? d.periodNo : parseInt(String(d.periodNo), 10);

    // Default grouping:
    // Period 1, 2, 3 belong to "ครั้งที่ 1", Period 4 belongs to "ครั้งที่ 2"
    if (allDisbursements.length >= 4) {
      if (pNum === 1 || pNum === 2 || pNum === 3) return "ครั้งที่ 1";
      if (pNum === 4) return "ครั้งที่ 2";
    }

    // If consecutive item shares the exact same disbursement date with a valid date, group together
    if (index > 0 && d.disbursedDate && d.disbursedDate !== "-" && d.disbursedDate === allDisbursements[index - 1].disbursedDate) {
      return getDisbursementWorkRound(allDisbursements[index - 1], index - 1, allDisbursements);
    }

    if (pNum && !isNaN(pNum)) {
      if (pNum <= 3 && allDisbursements.length >= 3) return "ครั้งที่ 1";
      return `ครั้งที่ ${pNum > 3 ? pNum - 2 : pNum}`;
    }

    return `ครั้งที่ ${index + 1}`;
  };

  // Dynamic disbursement calculation for live sync with charts & summary cards
  const totalDisbursedFromList = (project.disbursements || [])
    .filter((d) => d.status === "เบิกจ่ายแล้ว")
    .reduce((sum, d) => sum + (d.amount || 0), 0);

  const effectiveDisbursedAmount = (project.disbursements && project.disbursements.length > 0)
    ? totalDisbursedFromList
    : (project.disbursedAmount || 0);

  const denom = project.contractAmount > 0 ? project.contractAmount : (project.budget > 0 ? project.budget : 1);
  const effectiveDisbursedPercent = Math.min(100, Math.round((effectiveDisbursedAmount / denom) * 100));

  // Photo form states
  const [showAddPhotoForm, setShowAddPhotoForm] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const photosScrollRef = useRef<HTMLDivElement>(null);

  const scrollPhotos = (direction: "left" | "right") => {
    if (photosScrollRef.current) {
      const scrollAmount = 360;
      photosScrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [photoRemarks, setPhotoRemarks] = useState<string>("");
  const [isPhotoSelectorOpen, setIsPhotoSelectorOpen] = useState(false);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  // Photo editing states
  const [editingPhotoIndex, setEditingPhotoIndex] = useState<number | null>(null);
  const [editingPhotoRemarks, setEditingPhotoRemarks] = useState<string>("");
  const [editingPhotoDate, setEditingPhotoDate] = useState<string>("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [draggedPhotoIndex, setDraggedPhotoIndex] = useState<number | null>(null);
  const [dragOverPhotoIndex, setDragOverPhotoIndex] = useState<number | null>(null);

  // Updates editing states
  const [editingUpdateIndex, setEditingUpdateIndex] = useState<number | null>(null);
  const [editingUpdateDate, setEditingUpdateDate] = useState<string>("");
  const [editingUpdateDetails, setEditingUpdateDetails] = useState<string>("");
  const [editingUpdateReporter, setEditingUpdateReporter] = useState<string>("");

  const currentProgress = getCurrentProgressInfo(project);
  const delta = currentProgress.delta;
  const isAhead = currentProgress.isAhead;

  // Formatting Thai currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val || 0) + " บาท";
  };

  // Formatting Thai currency number only (without unit suffix)
  const formatNumberOnly = (val: number) => {
    return new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val || 0);
  };

  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onUpdateMetadata(editForm);
      setIsEditing(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName || !taskStart || !taskEnd) {
      alert("กรุณากรอกข้อมูลงานย่อยให้ครบถ้วน");
      return;
    }

    try {
      const newTask: Task = {
        name: taskName,
        startDate: taskStart,
        endDate: taskEnd,
        progress: Number(taskProgress),
      };
      await onAddTask(project.sheetName, newTask);
      setTaskName("");
      setTaskStart("");
      setTaskEnd("");
      setTaskProgress(0);
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการเพิ่มงานย่อย");
    }
  };

  const handleDeleteTask = async (taskIndex: number) => {
    const updatedTasks = project.tasks.filter((_, idx) => idx !== taskIndex);
    if (onUpdateTasks) {
      await onUpdateTasks(project.sheetName, updatedTasks);
    }
  };

  const handleUpdateTaskProgress = async (taskIndex: number, newProgress: number) => {
    const clamped = Math.min(100, Math.max(0, newProgress));
    const updatedTasks = project.tasks.map((t, idx) =>
      idx === taskIndex ? { ...t, progress: clamped } : t
    );
    if (onUpdateTasks) {
      await onUpdateTasks(project.sheetName, updatedTasks);
    }
  };

  const handleTaskFieldChange = async (taskIndex: number, field: keyof Task, value: any) => {
    const updatedTasks = project.tasks.map((t, idx) =>
      idx === taskIndex ? { ...t, [field]: value } : t
    );
    if (onUpdateTasks) {
      await onUpdateTasks(project.sheetName, updatedTasks);
    }
  };

  const handleAddUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateDetails.trim()) {
      alert("กรุณากรอกข้อความรายงานความคืบหน้า");
      return;
    }

    try {
      const session = getUserSession();
      const currentUserFullName = session?.name || session?.username || (isAdmin ? "ผู้ดูแลระบบ" : "ผู้ใช้งานระบบ");
      const finalReporter = updateReporter.trim() || currentUserFullName;
      const today = new Date();
      const localDateStr = today.toLocaleDateString("en-CA"); // YYYY-MM-DD
      const finalDate = updateDate || localDateStr;
      const newUpdate: ProgressUpdate = {
        date: finalDate,
        details: updateDetails.trim(),
        reporter: finalReporter,
      };
      await onAddUpdate(project.sheetName, newUpdate);
      setUpdateDetails("");
      setUpdateReporter("");
      setUpdateDate("");
      setShowAddUpdateForm(false);
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการเพิ่มบันทึกความคืบหน้า");
    }
  };

  // Updates merged by same date
  const displayUpdates = mergeSameDateUpdates(project.updates || []);

  const handleDeleteUpdate = async (idx: number) => {
    const updatedList = displayUpdates.filter((_, i) => i !== idx);
    if (onUpdateUpdates) {
      await onUpdateUpdates(project.sheetName, updatedList);
    }
  };

  const handleStartEditUpdate = (idx: number, update: ProgressUpdate) => {
    setEditingUpdateIndex(idx);
    setEditingUpdateDate(update.date || new Date().toLocaleDateString("en-CA"));
    setEditingUpdateDetails(update.details || "");
    setEditingUpdateReporter(update.reporter || "");
  };

  const handleSaveEditUpdate = async (idx: number) => {
    if (!editingUpdateDetails.trim()) {
      alert("กรุณากรอกข้อความรายงานความคืบหน้า");
      return;
    }
    if (!onUpdateUpdates) return;

    try {
      const updatedList = displayUpdates.map((u, i) => {
        if (i === idx) {
          return {
            date: editingUpdateDate || u.date || new Date().toLocaleDateString("en-CA"),
            details: editingUpdateDetails.trim(),
            reporter: editingUpdateReporter.trim() || u.reporter || "ผู้ใช้งานระบบ",
          };
        }
        return u;
      });
      await onUpdateUpdates(project.sheetName, updatedList);
      setEditingUpdateIndex(null);
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึกการแก้ไข");
    }
  };

  const handleAddDisbursementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnerOrAdmin) {
      onRequestAdminLogin?.("บันทึกข้อมูลการเบิกจ่ายงวดใหม่");
      return;
    }
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;

    if (disbursedAmt === "" || disbursedAmt === undefined || disbursedAmt === null) {
      alert("กรุณาระบุจำนวนเงินเบิกจ่าย");
      return;
    }
    try {
      const amt = parseFloat(disbursedAmt);
      if (isNaN(amt) || amt < 0) {
        alert("กรุณาระบุจำนวนเงินเบิกจ่ายที่ถูกต้อง (ต้องไม่ต่ำกว่า 0)");
        return;
      }
      const newPeriod: DisbursementPeriod = {
        workRound: workRound.trim() || "ครั้งที่ 1",
        periodNo: periodNo.trim() || "1",
        amount: amt,
        disbursedDate: disbursedStatus === "เบิกจ่ายแล้ว" ? (disbursedDate || "-") : "-",
        status: disbursedStatus,
        remarks: disbursedRemarks || "-",
      };
      
      if (onUpdateDisbursements) {
        await onUpdateDisbursements(project.sheetName, [...(project.disbursements || []), newPeriod]);
      } else {
        await onAddDisbursement(project.sheetName, newPeriod);
      }
      setDisbursedAmt("");
      setDisbursedRemarks("");
      const defaultPeriod = disbursementPeriodOptions[0]?.value || "1";
      setPeriodNo(defaultPeriod);
      setShowAddDisbursementForm(false);
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูลเบิกจ่าย");
    }
  };

  const handleDeleteDisbursement = async (idx: number) => {
    if (!isOwnerOrAdmin) {
      onRequestAdminLogin?.("ลบรายการงวดการเบิกจ่าย");
      return;
    }
    const updatedList = (project.disbursements || []).filter((_, i) => i !== idx);
    if (onUpdateDisbursements) {
      await onUpdateDisbursements(project.sheetName, updatedList);
    }
  };

  const handleStartEditDisbursement = (index: number, d: DisbursementPeriod) => {
    if (!isOwnerOrAdmin) {
      onRequestAdminLogin?.("แก้ไขข้อมูลการเบิกจ่ายเงิน");
      return;
    }
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
    setEditingDisbursementIndex(index);
    const currentWorkRound = getDisbursementWorkRound(d, index, project.disbursements || []);
    setEditingDisbursementWorkRound(currentWorkRound);
    setEditingDisbursementPeriodNo(String(d.periodNo));
    setEditingDisbursementAmount(d.amount !== undefined && d.amount !== null ? String(d.amount) : "0");
    setEditingDisbursementDate(d.disbursedDate && d.disbursedDate !== "-" ? d.disbursedDate : "");
    setEditingDisbursementStatus(d.status || "เบิกจ่ายแล้ว");
    setEditingDisbursementRemarks(d.remarks && d.remarks !== "-" ? d.remarks : "");
  };

  const handleCancelEditDisbursement = () => {
    setEditingDisbursementIndex(null);
    setIsSavingDisbursement(false);
  };

  const handleSaveEditDisbursement = async (index: number) => {
    if (editingDisbursementIndex === null) return;
    setIsSavingDisbursement(true);
    try {
      const rawAmt = editingDisbursementAmount !== undefined && editingDisbursementAmount !== null
        ? String(editingDisbursementAmount).trim()
        : "";
      if (rawAmt === "") {
        alert("กรุณาระบุจำนวนเงินเบิกจ่าย");
        setIsSavingDisbursement(false);
        return;
      }
      const cleanAmount = parseFloat(rawAmt.replace(/,/g, ""));
      if (isNaN(cleanAmount) || cleanAmount < 0) {
        alert("กรุณาระบุจำนวนเงินเบิกจ่ายที่ถูกต้อง (ต้องไม่ต่ำกว่า 0)");
        setIsSavingDisbursement(false);
        return;
      }
      const cleanPeriodNo = parseInt(editingDisbursementPeriodNo, 10) || (index + 1);

      const updatedDisbursements = (project.disbursements || []).map((d, i) => {
        if (i !== index) return d;
        return {
          ...d,
          workRound: editingDisbursementWorkRound.trim() || "ครั้งที่ 1",
          periodNo: cleanPeriodNo,
          amount: cleanAmount,
          disbursedDate: editingDisbursementStatus === "เบิกจ่ายแล้ว"
            ? (editingDisbursementDate && editingDisbursementDate.trim() !== "" && editingDisbursementDate !== "-" ? editingDisbursementDate.trim() : "-")
            : "-",
          status: editingDisbursementStatus,
          remarks: editingDisbursementRemarks.trim() || "-",
        };
      });

      if (onUpdateDisbursements) {
        await onUpdateDisbursements(project.sheetName, updatedDisbursements);
      }
      setEditingDisbursementIndex(null);
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึกการแก้ไขงวดเบิกจ่าย");
    } finally {
      setIsSavingDisbursement(false);
    }
  };

  // Quick switch work round for a single period directly from table
  const handleQuickChangeWorkRound = async (index: number, newRound: string) => {
    if (!isOwnerOrAdmin) {
      onRequestAdminLogin?.("จัดกลุ่มผลงานการส่งมอบงาน");
      return;
    }
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
    try {
      const currentList = project.disbursements || [];
      const updatedDisbursements = currentList.map((d, i) => {
        if (i !== index) return d;
        return {
          ...d,
          workRound: newRound.trim() || "ครั้งที่ 1",
        };
      });
      if (onUpdateDisbursements) {
        await onUpdateDisbursements(project.sheetName, updatedDisbursements);
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการเปลี่ยนกลุ่มผลงาน");
    }
  };

  // Open the Work Deliverable Group Manager modal
  const handleOpenGroupManager = () => {
    if (!isOwnerOrAdmin) {
      onRequestAdminLogin?.("จัดกลุ่มผลงานการส่งมอบงาน");
      return;
    }
    const initialMap: { [index: number]: string } = {};
    (project.disbursements || []).forEach((d, idx) => {
      initialMap[idx] = getDisbursementWorkRound(d, idx, project.disbursements || []);
    });
    setTempWorkRounds(initialMap);
    setShowGroupManagerModal(true);
  };

  // Save all work deliverable round mappings in batch
  const handleSaveGroupManager = async () => {
    if (!isOwnerOrAdmin) return;
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
    setIsSavingGroupManager(true);
    try {
      const updated = (project.disbursements || []).map((d, idx) => {
        const selectedRound = tempWorkRounds[idx] || getDisbursementWorkRound(d, idx, project.disbursements || []);
        return {
          ...d,
          workRound: selectedRound.trim() || "ครั้งที่ 1",
        };
      });
      if (onUpdateDisbursements) {
        await onUpdateDisbursements(project.sheetName, updated);
      }
      setShowGroupManagerModal(false);
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึกการจัดกลุ่มผลงาน");
    } finally {
      setIsSavingGroupManager(false);
    }
  };

  // Presets for quick grouping
  const applyPresetGroupPattern = (pattern: "default4" | "oneToOne" | "allOne") => {
    const newMap: { [index: number]: string } = {};
    (project.disbursements || []).forEach((d, idx) => {
      const pNum = typeof d.periodNo === "number" ? d.periodNo : parseInt(String(d.periodNo), 10) || (idx + 1);
      if (pattern === "default4") {
        if (pNum === 1 || pNum === 2 || pNum === 3) {
          newMap[idx] = "ครั้งที่ 1";
        } else {
          newMap[idx] = "ครั้งที่ 2";
        }
      } else if (pattern === "oneToOne") {
        newMap[idx] = `ครั้งที่ ${pNum}`;
      } else if (pattern === "allOne") {
        newMap[idx] = "ครั้งที่ 1";
      }
    });
    setTempWorkRounds(newMap);
  };

  // Print & PDF Export handlers for Disbursements & Progress Photos
  const handlePrintDisbursementPdf = () => {
    printDisbursementsPdfReport(project, getDisbursementWorkRound, {
      includePhotos: includePhotosInPdf,
      includePersonnel: includePersonnelInPdf,
      selectedPhotoIndices: selectedPhotoIndices,
      includeRemarks: includeRemarksInPdf,
      customRemarks: disbursementRemarks.filter((r) => r.trim().length > 0),
      includeFinancialStrip: includeFinancialStripInPdf,
    });
  };

  const handleDisbursementFieldChange = async (
    idx: number,
    field: keyof DisbursementPeriod,
    value: any
  ) => {
    const updatedList = (project.disbursements || []).map((d, i) => {
      if (i !== idx) return d;
      return { ...d, [field]: value };
    });
    if (onUpdateDisbursements) {
      await onUpdateDisbursements(project.sheetName, updatedList);
    }
  };

  const handleSelectSamplePhoto = async (item: { url: string; title: string }) => {
    const todayStr = new Date().toLocaleDateString("en-CA");
    const newPhoto: ProjectPhoto = {
      imageUrl: item.url,
      date: todayStr,
      remarks: item.title,
    };
    const currentPhotos = project.photos || [];
    const updatedPhotos = [...currentPhotos, newPhoto];

    if (onUpdatePhotos) {
      await onUpdatePhotos(project.sheetName, updatedPhotos);
    } else {
      await onAddPhoto(project.sheetName, newPhoto);
    }
    setIsPhotoSelectorOpen(false);
    setShowAddPhotoForm(false);
  };

  const handleDriveFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploadingToDrive(true);
    setUploadStatus(`กำลังเตรียมอัปโหลดรูปภาพ ${files.length} รายการ...`);

    try {
      const folderName = project.projectName || project.sheetName;
      let folderId = "";
      try {
        folderId = await getOrCreateDriveFolder(folderName);
      } catch (driveErr) {
        console.warn("Drive folder get/create skipped, falling back to local base64:", driveErr);
      }

      const todayStr = new Date().toLocaleDateString("en-CA");
      const uploadedPhotos: ProjectPhoto[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadStatus(`กำลังอัปโหลดรูปที่ ${i + 1}/${files.length}: ${file.name}...`);
        let directUrl = "";

        if (folderId) {
          try {
            const result = await uploadFileToDrive(file, folderId);
            directUrl = result.directUrl;
          } catch (err) {
            console.warn(`Drive upload failed for ${file.name}, using base64 fallback...`, err);
          }
        }

        if (!directUrl) {
          directUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }

        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        uploadedPhotos.push({
          imageUrl: directUrl,
          date: todayStr,
          remarks: nameWithoutExt || `รูปภาพความก้าวหน้า ${i + 1}`,
        });
      }

      const currentPhotos = project.photos || [];
      const updatedPhotos = [...currentPhotos, ...uploadedPhotos];

      if (onUpdatePhotos) {
        await onUpdatePhotos(project.sheetName, updatedPhotos);
      } else {
        for (const photo of uploadedPhotos) {
          await onAddPhoto(project.sheetName, photo);
        }
      }

      setUploadStatus(`อัปโหลดรูปภาพสำเร็จ ${files.length} รูปเรียบร้อยแล้ว!`);
      setPhotoUrl("");
      setPhotoRemarks("");
      setShowAddPhotoForm(false);
    } catch (err: any) {
      console.error("Drive upload error:", err);
      alert(err.message || "เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ");
      setUploadStatus("");
    } finally {
      setIsUploadingToDrive(false);
      e.target.value = "";
    }
  };

  const handleAddPhotoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoUrl.trim()) {
      alert("กรุณาระบุลิงก์รูปภาพ หรือเลือกไฟล์อัปโหลด");
      return;
    }

    const urls = photoUrl
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) {
      alert("กรุณาระบุลิงก์รูปภาพที่ถูกต้อง");
      return;
    }

    try {
      const todayStr = new Date().toLocaleDateString("en-CA");
      const newPhotoItems: ProjectPhoto[] = urls.map((url, idx) => ({
        imageUrl: url,
        date: todayStr,
        remarks: photoRemarks
          ? urls.length > 1
            ? `${photoRemarks} (${idx + 1})`
            : photoRemarks
          : "รูปภาพความก้าวหน้าโครงการ",
      }));

      const currentPhotos = project.photos || [];
      const updatedPhotos = [...currentPhotos, ...newPhotoItems];

      if (onUpdatePhotos) {
        await onUpdatePhotos(project.sheetName, updatedPhotos);
      } else {
        for (const item of newPhotoItems) {
          await onAddPhoto(project.sheetName, item);
        }
      }

      setPhotoUrl("");
      setPhotoRemarks("");
      setUploadStatus("");
      setShowAddPhotoForm(false);
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึกรูปภาพความก้าวหน้า");
    }
  };

  const handleStartEditPhoto = (idx: number, photo: ProjectPhoto) => {
    if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
    setEditingPhotoIndex(idx);
    setEditingPhotoRemarks(photo.remarks || "");
    if (photo.date && photo.date !== "-") {
      const parsed = parseDate(photo.date);
      setEditingPhotoDate(parsed ? formatDateYMD(parsed) : photo.date);
    } else {
      setEditingPhotoDate("");
    }
  };

  const handleSaveEditPhoto = async (idx: number) => {
    if (!project.photos || idx < 0 || idx >= project.photos.length) return;
    const updatedPhotos = [...project.photos];
    const cleanedDate = editingPhotoDate ? editingPhotoDate.trim() : "";
    updatedPhotos[idx] = {
      ...updatedPhotos[idx],
      remarks: editingPhotoRemarks.trim() || "-",
      date: cleanedDate || "-",
    };
    if (onUpdatePhotos) {
      await onUpdatePhotos(project.sheetName, updatedPhotos);
    } else {
      await onUpdateMetadata({ ...project, photos: updatedPhotos });
    }
    setEditingPhotoIndex(null);
    setEditingPhotoRemarks("");
    setEditingPhotoDate("");
  };

  const handleCancelEditPhoto = () => {
    setEditingPhotoIndex(null);
    setEditingPhotoRemarks("");
    setEditingPhotoDate("");
  };

  const handleMovePhoto = async (fromIndex: number, toIndex: number) => {
    if (!project.photos || toIndex < 0 || toIndex >= project.photos.length) return;
    const updatedPhotos = [...project.photos];
    const [movedItem] = updatedPhotos.splice(fromIndex, 1);
    updatedPhotos.splice(toIndex, 0, movedItem);

    if (onUpdatePhotos) {
      await onUpdatePhotos(project.sheetName, updatedPhotos);
    } else {
      await onUpdateMetadata({ ...project, photos: updatedPhotos });
    }
  };

  // Timeline calculation
  const periodicRecordsForTimeline = (project.periodicProgress && project.periodicProgress.length > 0)
    ? project.periodicProgress
    : (typeof window !== "undefined" && window.localStorage?.getItem(`periodic_${project.sheetName}`)
        ? (() => {
            try {
              return JSON.parse(window.localStorage.getItem(`periodic_${project.sheetName}`) || "[]");
            } catch {
              return [];
            }
          })()
        : []);

  const timeline = calculateProjectTimeline(
    project.startDate,
    project.endDate,
    project.contractDays,
    currentProgress.actualPercent || project.progressField,
    periodicRecordsForTimeline,
    project.sheetName
  );

  // Penalty & Liquidated Damages calculation
  const penaltyResult = calculateLiquidatedDamages(
    project,
    currentProgress.actualPercent || project.progressField
  );

  const isWorkCompleted = Boolean(
    timeline.isCompleted || (currentProgress.actualPercent || project.progressField) >= 100
  );

  const isCompletedDeliveredLate = Boolean(
    isWorkCompleted &&
    (
      (penaltyResult && penaltyResult.statusLevel === "completed" && penaltyResult.totalFineAmount > 0) ||
      (penaltyResult && penaltyResult.overdueDays > 0) ||
      (timeline.hasFinalInstallmentExceededContract && timeline.overdueDays > 0) ||
      (timeline.overdueDays > 0)
    )
  );

  const completedOverdueDays =
    (penaltyResult && penaltyResult.overdueDays > 0)
      ? penaltyResult.overdueDays
      : (timeline.overdueDays || 0);

  const actualDeliveryDateStr = timeline.lastPeriodEndDateStr || penaltyResult?.lastPeriodEndDateStr || project.acceptedDate;
  const deliveryDateDisplay = actualDeliveryDateStr ? formatDateDisplay(actualDeliveryDateStr) : "";

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Back button and title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200/90 hover:border-slate-300 shadow-2xs hover:shadow-xs transition-all duration-150 cursor-pointer group text-xs sm:text-sm font-semibold font-['Sarabun',sans-serif]"
          title="กลับไปยังหน้าภาพรวมโครงการทั้งหมด"
        >
          <div className="w-6 h-6 rounded-lg bg-slate-100 group-hover:bg-slate-200/80 flex items-center justify-center transition-colors shrink-0">
            <ArrowLeft className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-900 group-hover:-translate-x-0.5 transition-transform duration-200" />
          </div>
          <span>ย้อนกลับไปภาพรวม</span>
        </button>

        <div className="flex items-center gap-2">
          {!isEditing && isAdmin && (
            <>
              {onDeleteProject && (
                <button
                  type="button"
                  onClick={() => onDeleteProject(project.sheetName)}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="ลบโครงการนี้ออกจากระบบ"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>ลบโครงการนี้</span>
                </button>
              )}
              <button
                onClick={() => {
                  if (onCheckFirebaseConnection && !onCheckFirebaseConnection()) return;
                  setEditForm({ ...project });
                  setIsEditing(true);
                }}
                className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Edit className="h-3.5 w-3.5" />
                <span>แก้ไขข้อมูลสัญญา/บุคลากร</span>
              </button>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        /* EDITING MODE FORM */
        <form onSubmit={handleSaveMetadata} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">แก้ไขข้อมูลรายละเอียดโครงการก่อสร้าง</h2>
              <p className="text-xs text-slate-400 mt-0.5">การบันทึกจะส่งข้อมูลไปอัปเดตแผ่นงาน {project.sheetName} ทันที</p>
            </div>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Project Name */}
            <div className="md:col-span-2 lg:col-span-3 space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">ชื่อโครงการก่อสร้าง</label>
              <input
                type="text"
                required
                value={editForm.projectName}
                onChange={(e) => setEditForm({ ...editForm, projectName: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {/* Plan Name & Fiscal Year */}
            <div className="md:col-span-1 lg:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">ชื่อแผนงานหลัก / แผนงานย่อย</label>
              <input
                type="text"
                required
                value={editForm.planName}
                onChange={(e) => setEditForm({ ...editForm, planName: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            <div className="md:col-span-1 lg:col-span-1 space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">ปีงบประมาณ</label>
              <input
                type="text"
                required
                value={editForm.fiscalYear}
                onChange={(e) => setEditForm({ ...editForm, fiscalYear: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {/* Contractor */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">ห้าง/บริษัทที่รับผิดชอบ</label>
              <input
                type="text"
                value={editForm.contractor}
                onChange={(e) => setEditForm({ ...editForm, contractor: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {/* Contract No */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">เลขที่สัญญา</label>
              <input
                type="text"
                value={editForm.contractNumber}
                onChange={(e) => setEditForm({ ...editForm, contractNumber: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {/* Signed Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">วันที่ลงนามสัญญา</label>
              <input
                type="date"
                value={editForm.signedDate}
                onChange={(e) => setEditForm({ ...editForm, signedDate: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {/* Start Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">วันที่เริ่มสัญญา</label>
              <input
                type="date"
                value={editForm.startDate}
                onChange={(e) => {
                  const newStart = e.target.value;
                  const autoDays = calculateContractDays(newStart, editForm.endDate);
                  setEditForm({
                    ...editForm,
                    startDate: newStart,
                    contractDays: autoDays > 0 ? autoDays : editForm.contractDays,
                  });
                }}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {/* End Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">วันที่สิ้นสุดสัญญา</label>
              <input
                type="date"
                value={editForm.endDate}
                onChange={(e) => {
                  const newEnd = e.target.value;
                  const autoDays = calculateContractDays(editForm.startDate, newEnd);
                  setEditForm({
                    ...editForm,
                    endDate: newEnd,
                    contractDays: autoDays > 0 ? autoDays : editForm.contractDays,
                  });
                }}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {/* Contract Duration Days */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">อายุสัญญา (จำนวนวัน)</label>
              <input
                type="number"
                value={editForm.contractDays}
                onChange={(e) => setEditForm({ ...editForm, contractDays: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {/* Budget */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">วงเงินงบประมาณ (บาท)</label>
              <input
                type="number"
                value={editForm.budget}
                onChange={(e) => setEditForm({ ...editForm, budget: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {/* Contract Amount */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">วงเงินตามสัญญา (บาท)</label>
              <input
                type="number"
                value={editForm.contractAmount}
                onChange={(e) => setEditForm({ ...editForm, contractAmount: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {/* Disbursed Amount */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">ยอดตรวจรับเบิกจ่ายแล้ว (บาท)</label>
              <input
                type="number"
                value={editForm.disbursedAmount}
                onChange={(e) => setEditForm({ ...editForm, disbursedAmount: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {/* Personnel: Chairman */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">ประธานตรวจรับพัสดุ</label>
              <input
                type="text"
                value={editForm.chairman}
                onChange={(e) => setEditForm({ ...editForm, chairman: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {/* Committee 1 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">กรรมการตรวจรับพัสดุ คนที่ 1</label>
              <input
                type="text"
                value={editForm.committee1}
                onChange={(e) => setEditForm({ ...editForm, committee1: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {/* Committee 2 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">กรรมการตรวจรับพัสดุ คนที่ 2</label>
              <input
                type="text"
                value={editForm.committee2}
                onChange={(e) => setEditForm({ ...editForm, committee2: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {/* Supervisor Head */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">หัวหน้าผู้ควบคุมงาน</label>
              <input
                type="text"
                value={editForm.supervisorHead}
                onChange={(e) => setEditForm({ ...editForm, supervisorHead: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {/* Supervisor */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">ผู้ควบคุมงาน</label>
              <input
                type="text"
                value={editForm.supervisor}
                onChange={(e) => setEditForm({ ...editForm, supervisor: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {/* Accepted Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase">ตรวจรับงานแล้วเสร็จ (วันที่)</label>
              <input
                type="text"
                value={editForm.acceptedDate}
                onChange={(e) => setEditForm({ ...editForm, acceptedDate: e.target.value })}
                placeholder="ระบุวันที่ตรวจรับ หรือ '-' หากยังไม่ตรวจรับ"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {/* Suspensions (การหยุดงานระหว่างปฏิบัติงาน) Editor */}
            <div className="md:col-span-2 lg:col-span-3 space-y-2 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span>การหยุดงานระหว่างปฏิบัติงาน (Suspensions)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setEditForm({
                    ...editForm,
                    suspensions: [...(editForm.suspensions || []), { start: "", end: "", reason: "" }]
                  })}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>เพิ่มช่วงหยุดงาน</span>
                </button>
              </div>

              {(!editForm.suspensions || editForm.suspensions.length === 0) ? (
                <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl">ไม่มีรายการหยุดงาน</p>
              ) : (
                <div className="space-y-2">
                  {editForm.suspensions.map((s, idx) => (
                    <div key={idx} className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-amber-50/50 p-2.5 rounded-xl border border-amber-200/60">
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[11px] font-bold text-slate-500">เริ่ม:</span>
                        <input
                          type="date"
                          value={s.start}
                          onChange={(e) => {
                            const updated = [...editForm.suspensions];
                            updated[idx] = { ...updated[idx], start: e.target.value };
                            setEditForm({ ...editForm, suspensions: updated });
                          }}
                          className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono focus:ring-1 focus:ring-amber-400"
                        />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[11px] font-bold text-slate-500">ถึง:</span>
                        <input
                          type="date"
                          value={s.end}
                          onChange={(e) => {
                            const updated = [...editForm.suspensions];
                            updated[idx] = { ...updated[idx], end: e.target.value };
                            setEditForm({ ...editForm, suspensions: updated });
                          }}
                          className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono focus:ring-1 focus:ring-amber-400"
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="ระบุหมายเหตุ / เหตุผลการสั่งหยุดงาน"
                        value={s.reason || ""}
                        onChange={(e) => {
                          const updated = [...editForm.suspensions];
                          updated[idx] = { ...updated[idx], reason: e.target.value };
                          setEditForm({ ...editForm, suspensions: updated });
                        }}
                        className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1 flex-1 focus:ring-1 focus:ring-amber-400 min-w-[180px]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = editForm.suspensions.filter((_, i) => i !== idx);
                          setEditForm({ ...editForm, suspensions: updated });
                        }}
                        title="ลบรายการหยุดงานนี้"
                        className="text-rose-500 hover:text-rose-700 hover:bg-rose-100 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-50">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl px-5 py-2.5 text-xs font-semibold cursor-pointer transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl px-6 py-2.5 text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Save className="h-4 w-4" />
              <span>{isLoading ? "กำลังบันทึก..." : "บันทึกลง Google Sheet"}</span>
            </button>
          </div>
        </form>
      ) : (
        /* PROJECT DETAIL PRESENTATION (NEW ORDERED LAYOUT) */
        <div className="space-y-6 font-['Sarabun',sans-serif]">
          
          {/* Main Title Banner & Progress Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 sm:p-7 flex flex-col md:flex-row justify-between gap-6 items-start md:items-center">
            <div className="space-y-3 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-slate-100 text-slate-700 font-medium tabular-nums text-xs sm:text-[13px] px-3 py-1 rounded-full border border-slate-200/60">
                  ปีงบประมาณ พ.ศ. {project.fiscalYear}
                </span>
                <span className="bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-medium text-xs sm:text-[13px] px-3 py-1 rounded-full">
                  {project.planName}
                </span>
                <span className="bg-indigo-50 text-indigo-800 border border-indigo-200/80 font-medium text-xs sm:text-[13px] px-3 py-1 rounded-full tabular-nums">
                  ปัจจุบันงวดครั้งที่ {currentProgress.periodNo || 1}
                </span>

                {/* Status and Penalty Matrix Badges */}
                {penaltyResult.statusLevel === "suspended" && (
                  <span className="bg-amber-500 text-white border border-amber-600 font-medium text-xs sm:text-[13px] px-3 py-1 rounded-full flex items-center gap-1.5 shadow-xs">
                    <span>⏸️</span>
                    <span>{penaltyResult.statusTitle}</span>
                  </span>
                )}

                {penaltyResult.statusLevel === "completed" && (
                  <span className={`border font-medium text-xs sm:text-[13px] px-3 py-1 rounded-full flex items-center gap-1.5 shadow-2xs ${
                    penaltyResult.totalFineAmount > 0
                      ? "bg-amber-50 text-amber-900 border-amber-300"
                      : "bg-emerald-50 text-emerald-800 border-emerald-300"
                  }`}>
                    <span>{penaltyResult.totalFineAmount > 0 ? "⚖️" : "✅"}</span>
                    <span>{penaltyResult.statusTitle}</span>
                  </span>
                )}

                {penaltyResult.statusLevel === "critical_cap" && (
                  <span className="bg-rose-600 text-white border border-rose-700 font-medium text-xs sm:text-[13px] px-3 py-1 rounded-full flex items-center gap-1.5 shadow-xs">
                    <span>🚨</span>
                    <span>{penaltyResult.statusTitle}</span>
                  </span>
                )}

                {penaltyResult.statusLevel === "under_review" && (
                  <span className="bg-indigo-50 text-indigo-900 border border-indigo-200 font-medium text-xs sm:text-[13px] px-3 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
                    <span>⏳</span>
                    <span>{penaltyResult.statusTitle}</span>
                  </span>
                )}

                {penaltyResult.statusLevel === "waived" && (
                  <span className="bg-teal-50 text-teal-900 border border-teal-200 font-medium text-xs sm:text-[13px] px-3 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
                    <span>🛡️</span>
                    <span>{penaltyResult.statusTitle}</span>
                  </span>
                )}

                {penaltyResult.statusLevel === "overdue_fine" && (
                  <span className="bg-rose-50 text-rose-800 border border-rose-300 font-medium text-xs sm:text-[13px] px-3 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
                    <span>⛔</span>
                    <span>{penaltyResult.statusTitle}</span>
                  </span>
                )}

                {penaltyResult.statusLevel === "warning_30d" && (
                  <span className="bg-amber-50 text-amber-900 border border-amber-200 font-medium text-xs sm:text-[13px] px-3 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
                    <span>⏰</span>
                    <span>{penaltyResult.statusTitle}</span>
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl lg:text-[26px] font-bold text-slate-900 leading-normal tracking-normal">
                {project.projectName}
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:text-base font-normal text-slate-600">
                <span>เลขที่สัญญา: <strong className="font-semibold text-slate-900 tabular-nums">{project.contractNumber}</strong></span>
                <span className="text-slate-300">•</span>
                <span>ห้างที่รับผิดชอบ: <strong className="font-semibold text-slate-900">{project.contractor}</strong></span>
              </div>
            </div>

            {/* Core Circular Delta Indicator */}
            {(() => {
              const isWorkCompleted = Boolean(
                timeline.isCompleted || (currentProgress.actualPercent || project.progressField) >= 100
              );

              const isCompletedDeliveredLate = Boolean(
                isWorkCompleted &&
                (
                  (penaltyResult && penaltyResult.statusLevel === "completed" && penaltyResult.totalFineAmount > 0) ||
                  (penaltyResult && penaltyResult.overdueDays > 0) ||
                  (timeline.hasFinalInstallmentExceededContract && timeline.overdueDays > 0) ||
                  (timeline.overdueDays > 0)
                )
              );

              const completedOverdueDays =
                (penaltyResult && penaltyResult.overdueDays > 0)
                  ? penaltyResult.overdueDays
                  : (timeline.overdueDays || 0);

              if (isCompletedDeliveredLate) {
                return (
                  <div className="px-5 py-4 sm:px-6 sm:py-5 rounded-2xl border shrink-0 text-center flex flex-col items-center justify-center min-w-[220px] max-w-[270px] shadow-2xs bg-amber-50/70 border-amber-300">
                    <span className="text-xs sm:text-[13px] font-semibold text-amber-900/90 flex items-center gap-1.5">
                      <Scale className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                      <span>สถานะงานก่อสร้าง</span>
                    </span>

                    <div className="flex items-center justify-center gap-2 mt-1.5">
                      <span className="inline-block w-3.5 h-3.5 rounded-full bg-amber-500 ring-4 ring-amber-100 shrink-0" />
                      <span className="text-xl sm:text-2xl font-bold tracking-tight text-amber-950">
                        งานแล้วเสร็จ
                      </span>
                    </div>

                    <div className="mt-1.5 px-2.5 py-0.5 rounded-full bg-amber-100/90 text-amber-950 border border-amber-300 text-xs font-semibold flex items-center gap-1 shadow-2xs">
                      <Clock className="h-3 w-3 text-amber-700 shrink-0" />
                      <span>ส่งมอบช้ากว่าสัญญา +{completedOverdueDays} วัน</span>
                    </div>

                    <p className="text-xs text-slate-600 mt-1.5 font-normal">
                      ผลงานสะสมจริง <span className="font-semibold text-slate-800 tabular-nums">100%</span>
                    </p>

                    <div className="mt-2 px-3 py-1 bg-white/95 rounded-lg text-xs sm:text-[13px] font-medium text-slate-700 border border-amber-200/90 shadow-2xs">
                      ส่งมอบครบ: <span className="font-bold text-amber-950 font-mono tabular-nums">งวดที่ {currentProgress.periodNo || 1}</span>
                    </div>
                  </div>
                );
              }

              if (isWorkCompleted) {
                return (
                  <div className="px-5 py-4 sm:px-6 sm:py-5 rounded-2xl border shrink-0 text-center flex flex-col items-center justify-center min-w-[215px] max-w-[270px] shadow-2xs bg-emerald-50/60 border-emerald-200/90">
                    <span className="text-xs sm:text-[13px] font-semibold text-emerald-800 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>สถานะงานก่อสร้าง</span>
                    </span>

                    <div className="flex items-center justify-center gap-2 mt-1.5">
                      <span className="inline-block w-3.5 h-3.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 shrink-0" />
                      <span className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-800">
                        งานแล้วเสร็จ 100%
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm font-medium text-emerald-900/90 mt-1">
                      ส่งมอบตามกำหนดสัญญา
                    </p>

                    <div className="mt-2.5 px-3 py-1 bg-white/95 rounded-lg text-xs sm:text-[13px] font-medium text-slate-700 border border-emerald-200/80 shadow-2xs">
                      ส่งมอบครบ: <span className="font-bold text-emerald-700 font-mono tabular-nums">งวดที่ {currentProgress.periodNo || 1}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div className={`px-6 py-5 rounded-2xl border shrink-0 text-center flex flex-col items-center justify-center min-w-[210px] shadow-2xs ${
                  delta > 0
                    ? "bg-emerald-50/60 border-emerald-200/90"
                    : delta < 0
                    ? "bg-amber-50/60 border-amber-200/90"
                    : "bg-sky-50/60 border-sky-200/90"
                }`}>
                  <span className="text-xs sm:text-[13px] font-medium text-slate-500">สถานะงานก่อสร้าง</span>
                  <div className="flex items-center justify-center gap-2 mt-1.5">
                    <span className={`inline-block w-3.5 h-3.5 rounded-full ${
                      delta > 0 ? "bg-emerald-500 ring-4 ring-emerald-100" : delta < 0 ? "bg-amber-500 ring-4 ring-amber-100" : "bg-sky-500 ring-4 ring-sky-100"
                    }`} />
                    <span className={`text-xl sm:text-2xl font-bold tracking-normal ${
                      delta > 0
                        ? "text-emerald-700"
                        : delta < 0
                        ? "text-amber-700"
                        : "text-sky-700"
                    }`}>
                      {delta > 0 ? "เร็วกว่าแผน" : delta < 0 ? "ช้ากว่าแผน" : "ตามแผน"}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-normal text-slate-600 mt-1">
                    ส่วนต่างงานจริง <span className="font-semibold text-slate-800 tabular-nums">{Math.abs(delta).toFixed(2)}%</span>
                  </p>
                  <div className="mt-2.5 px-3 py-1 bg-white/95 rounded-lg text-xs sm:text-[13px] font-medium text-slate-700 border border-slate-200/80 shadow-2xs">
                    ปัจจุบันงวดครั้งที่: <span className="font-semibold text-indigo-700 tabular-nums">{currentProgress.periodNo || 1}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 1. ข้อมูลสัญญาก่อสร้างและงบประมาณ */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-7 space-y-5 font-['Sarabun',sans-serif] text-slate-900">
            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100 shrink-0">
                  <FileText className="h-5 w-5" />
                </div>
                <span>ข้อมูลสัญญาก่อสร้างและงบประมาณ</span>
              </h3>
              <span className="text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg">
                สัญญาและงบประมาณตามสัญญา
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
              <div className="space-y-1.5 p-4 sm:p-5 bg-slate-50/90 rounded-2xl border border-slate-200/80">
                <span className="text-xs sm:text-sm font-medium text-slate-600 block">วงเงินงบประมาณ</span>
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-xl sm:text-2xl lg:text-[26px] font-semibold text-slate-900 tracking-tight tabular-nums">
                    {formatNumberOnly(project.budget)}
                  </span>
                  <span className="text-xs sm:text-sm font-normal text-slate-500">บาท</span>
                </div>
              </div>
              <div className="space-y-1.5 p-4 sm:p-5 bg-indigo-50/40 rounded-2xl border border-indigo-200/70">
                <span className="text-xs sm:text-sm font-medium text-indigo-900 block">วงเงินตามสัญญา</span>
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-xl sm:text-2xl lg:text-[26px] font-semibold text-indigo-950 tracking-tight tabular-nums">
                    {formatNumberOnly(project.contractAmount)}
                  </span>
                  <span className="text-xs sm:text-sm font-normal text-indigo-700/80">บาท</span>
                </div>
              </div>
              <div className="space-y-1.5 p-4 sm:p-5 bg-emerald-50/40 rounded-2xl border border-emerald-200/70">
                <span className="text-xs sm:text-sm font-medium text-emerald-900 block">เบิกจ่ายแล้วสะสม</span>
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-xl sm:text-2xl lg:text-[26px] font-semibold text-emerald-950 tracking-tight tabular-nums">
                    {formatNumberOnly(effectiveDisbursedAmount)}
                  </span>
                  <span className="text-xs sm:text-sm font-normal text-emerald-700/80">บาท</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm sm:text-base pt-2 border-t border-slate-100">
              <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                <span className="text-slate-600 font-normal">เลขที่สัญญา:</span>
                <span className="font-semibold text-slate-900">{project.contractNumber && project.contractNumber.trim() !== "" ? project.contractNumber : "-"}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                <span className="text-slate-600 font-normal">ลงนามสัญญา:</span>
                <span className="font-semibold text-slate-900 tabular-nums">{formatDateDisplay(project.signedDate)}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2.5 border-b border-slate-100 gap-1 sm:gap-2">
                <span className="text-slate-600 font-normal">ช่วงเวลาสัญญา:</span>
                <div className="text-left sm:text-right">
                  <div className="flex items-center sm:justify-end gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {formatDateDisplay(project.startDate)} ถึง {formatDateDisplay(project.endDate)}
                    </span>
                    <span className="text-xs font-normal text-slate-600 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-md">
                      ({project.contractDays || 0} วัน)
                    </span>
                  </div>
                  {penaltyResult.isEndDateHoliday && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-900 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-lg">
                      <span>💡</span>
                      <span>
                        วันสิ้นสุดสัญญาตรงกับ{penaltyResult.holidayReason || "วันหยุดราชการ"} ขยายสิทธิส่งมอบงานได้ถึงวันทำการแรก <strong>{formatDateDisplay(penaltyResult.effectiveDeliveryDateStr)}</strong> โดยไม่คิดค่าปรับ (ป.พ.พ. ม.193/8)
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                <span className="text-slate-600 font-normal">ปัจจุบันงวดครั้งที่:</span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-indigo-900 bg-indigo-50 border border-indigo-200/80 px-3 py-1 rounded-lg text-xs sm:text-sm tabular-nums">
                  {currentProgress.periodText || `งวดที่ ${currentProgress.periodNo || 1}`}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                <span className="text-slate-600 font-normal">ห้างที่รับผิดชอบ:</span>
                <span className="font-semibold text-slate-900">{project.contractor && project.contractor.trim() !== "" ? project.contractor : "-"}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                <span className="text-slate-600 font-normal">สถานะการตรวจรับ:</span>
                {project.acceptedDate && project.acceptedDate !== "-" ? (
                  <span className="inline-flex items-center gap-1.5 font-semibold px-2.5 py-0.5 rounded-full text-xs sm:text-sm bg-emerald-50 text-emerald-900 border border-emerald-200/90">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>ตรวจรับแล้ว ({formatDateDisplay(project.acceptedDate)})</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-semibold px-2.5 py-0.5 rounded-full text-xs sm:text-sm bg-amber-50 text-amber-950 border border-amber-200/90">
                    <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span>ยังไม่ได้รับการตรวจรับ</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 2. บุคลากรคณะกรรมการและผู้ควบคุมงาน */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-7 space-y-6">
            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2.5 font-['Sarabun',sans-serif]">
                <Users className="h-5.5 w-5.5 text-sky-600" />
                <span>บุคลากรคณะกรรมการและผู้ควบคุมงาน</span>
              </h3>
              <span className="text-xs sm:text-sm font-medium text-slate-500 bg-slate-50 border border-slate-200/80 px-3 py-1 rounded-lg font-['Sarabun',sans-serif]">
                คณะกรรมการตรวจรับพัสดุ และ ผู้ควบคุมงานตามสัญญา
              </span>
            </div>

            <div className="space-y-6">
              {/* กลุ่มที่ 1: คณะกรรมการตรวจรับพัสดุ */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
                  <h4 className="text-sm sm:text-base font-bold text-slate-700 font-['Sarabun',sans-serif]">
                    คณะกรรมการตรวจรับพัสดุ (3 ท่าน)
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {/* Chairman */}
                  <div className="p-4 bg-slate-50/70 hover:bg-slate-50 rounded-xl border border-slate-200/80 transition-colors flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100/80 flex items-center justify-center shrink-0 text-sky-700 shadow-2xs">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <span className="text-sm sm:text-base font-semibold text-slate-600 block font-['Sarabun',sans-serif]">
                        ประธานกรรมการตรวจรับพัสดุ
                      </span>
                      <p className="font-['Sarabun',sans-serif] text-[18px] sm:text-[20px] font-bold text-slate-800 leading-snug break-words">
                        {project.chairman && project.chairman.trim() !== "" && project.chairman.trim() !== "-" ? (
                          formatPersonnelName(project.chairman)
                        ) : (
                          <span className="text-slate-400 font-normal italic text-base">ยังไม่ได้ระบุ</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Committee 1 */}
                  <div className="p-4 bg-slate-50/70 hover:bg-slate-50 rounded-xl border border-slate-200/80 transition-colors flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-100/80 border border-slate-200/60 flex items-center justify-center shrink-0 text-slate-600 shadow-2xs">
                      <UserCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <span className="text-sm sm:text-base font-semibold text-slate-600 block font-['Sarabun',sans-serif]">
                        กรรมการตรวจรับพัสดุ (คนที่ 1)
                      </span>
                      <p className="font-['Sarabun',sans-serif] text-[18px] sm:text-[20px] font-bold text-slate-800 leading-snug break-words">
                        {project.committee1 && project.committee1.trim() !== "" && project.committee1.trim() !== "-" ? (
                          formatPersonnelName(project.committee1)
                        ) : (
                          <span className="text-slate-400 font-normal italic text-base">ยังไม่ได้ระบุ</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Committee 2 */}
                  <div className="p-4 bg-slate-50/70 hover:bg-slate-50 rounded-xl border border-slate-200/80 transition-colors flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-100/80 border border-slate-200/60 flex items-center justify-center shrink-0 text-slate-600 shadow-2xs">
                      <UserCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <span className="text-sm sm:text-base font-semibold text-slate-600 block font-['Sarabun',sans-serif]">
                        กรรมการตรวจรับพัสดุ (คนที่ 2)
                      </span>
                      <p className="font-['Sarabun',sans-serif] text-[18px] sm:text-[20px] font-bold text-slate-800 leading-snug break-words">
                        {project.committee2 && project.committee2.trim() !== "" && project.committee2.trim() !== "-" ? (
                          formatPersonnelName(project.committee2)
                        ) : (
                          <span className="text-slate-400 font-normal italic text-base">ยังไม่ได้ระบุ</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* กลุ่มที่ 2: ผู้ควบคุมงาน */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <h4 className="text-sm sm:text-base font-bold text-slate-700 font-['Sarabun',sans-serif]">
                    ผู้ควบคุมงานก่อสร้าง (2 ท่าน)
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Supervisor Head */}
                  <div className="p-4 bg-slate-50/70 hover:bg-slate-50 rounded-xl border border-slate-200/80 transition-colors flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100/80 flex items-center justify-center shrink-0 text-amber-700 shadow-2xs">
                      <HardHat className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <span className="text-sm sm:text-base font-semibold text-slate-600 block font-['Sarabun',sans-serif]">
                        หัวหน้าผู้ควบคุมงาน
                      </span>
                      <p className="font-['Sarabun',sans-serif] text-[18px] sm:text-[20px] font-bold text-slate-800 leading-snug break-words">
                        {project.supervisorHead && project.supervisorHead.trim() !== "" && project.supervisorHead.trim() !== "-" ? (
                          formatPersonnelName(project.supervisorHead)
                        ) : (
                          <span className="text-slate-400 font-normal italic text-base">ยังไม่ได้ระบุ</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Supervisor */}
                  <div className="p-4 bg-slate-50/70 hover:bg-slate-50 rounded-xl border border-slate-200/80 transition-colors flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100/80 flex items-center justify-center shrink-0 text-amber-700 shadow-2xs">
                      <HardHat className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <span className="text-sm sm:text-base font-semibold text-slate-600 block font-['Sarabun',sans-serif]">
                        ผู้ควบคุมงานหน้างาน
                      </span>
                      <p className="font-['Sarabun',sans-serif] text-[18px] sm:text-[20px] font-bold text-slate-800 leading-snug break-words">
                        {project.supervisor && project.supervisor.trim() !== "" && project.supervisor.trim() !== "-" ? (
                          formatPersonnelName(project.supervisor)
                        ) : (
                          <span className="text-slate-400 font-normal italic text-base">ยังไม่ได้ระบุ</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. กรอบระยะเวลาและอายุสัญญา */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 sm:p-7 space-y-5 font-['Sarabun',sans-serif]">
            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3.5 gap-3">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                <Clock className="h-5 w-5 text-amber-600" />
                <span>กรอบระยะเวลาและอายุสัญญา</span>
              </h3>
              <div className="flex items-center gap-2">
                {project.extensions && project.extensions.length > 0 && (
                  <span className="bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-semibold px-3 py-1 rounded-full font-['Sarabun',sans-serif]">
                    ขยายสัญญา {project.extensions.length} ครั้ง
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleOpenAddExtension}
                  className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs sm:text-sm font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs font-['Sarabun',sans-serif]"
                >
                  <CalendarPlus className="h-4 w-4" />
                  <span>บันทึกขยายอายุสัญญา</span>
                </button>
              </div>
            </div>

            {(() => {
              const isCompletedDeliveredLate = Boolean(
                (timeline.isCompleted || (currentProgress.actualPercent || project.progressField) >= 100) &&
                (
                  (penaltyResult && penaltyResult.statusLevel === "completed" && penaltyResult.totalFineAmount > 0) ||
                  (penaltyResult && penaltyResult.overdueDays > 0) ||
                  (timeline.hasFinalInstallmentExceededContract && timeline.overdueDays > 0) ||
                  (timeline.overdueDays > 0)
                )
              );

              const completedOverdueDays =
                (penaltyResult && penaltyResult.overdueDays > 0)
                  ? penaltyResult.overdueDays
                  : (timeline.overdueDays || 0);

              const totalElapsedDays = timeline.contractDays + completedOverdueDays;
              const actualElapsedPercent = timeline.contractDays > 0
                ? Number(((totalElapsedDays / timeline.contractDays) * 100).toFixed(1))
                : 100;

              const deliveryDateDisplay = formatDateDisplay(
                timeline.lastPeriodEndDateStr || project.acceptedDate
              );

              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                    <div className="border border-slate-200/80 rounded-2xl p-4 sm:p-5 bg-slate-50/80 space-y-1">
                      <span className="text-xs sm:text-sm font-medium text-slate-600 block">เริ่มสัญญา</span>
                      <p className="text-base sm:text-lg font-semibold text-slate-800 tabular-nums mt-1">{formatDateDisplay(project.startDate)}</p>
                    </div>
                    <div className="border border-amber-200 rounded-2xl p-4 sm:p-5 bg-amber-50/60 space-y-1">
                      <span className="text-xs sm:text-sm font-semibold text-amber-900 block">อายุสัญญาก่อสร้าง</span>
                      <p className="text-2xl sm:text-3xl font-bold text-amber-950 mt-1 tracking-tight tabular-nums">
                        {timeline.contractDays} <span className="text-base sm:text-lg font-medium text-amber-900">วัน</span>
                      </p>
                      {isCompletedDeliveredLate && (
                        <span className="text-xs font-medium text-amber-800 block mt-0.5">
                          (ใช้เวลารวม {totalElapsedDays} วัน / เกินสัญญา {completedOverdueDays} วัน)
                        </span>
                      )}
                    </div>
                    <div className="border border-slate-200/80 rounded-2xl p-4 sm:p-5 bg-slate-50/80 space-y-1">
                      <span className="text-xs sm:text-sm font-medium text-slate-600 block">สิ้นสุดสัญญา</span>
                      <p className="text-base sm:text-lg font-semibold text-slate-800 tabular-nums mt-1">{formatDateDisplay(project.endDate)}</p>
                      {isCompletedDeliveredLate && deliveryDateDisplay && (
                        <span className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-md inline-block mt-0.5">
                          ส่งมอบจริง: {deliveryDateDisplay}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar of Time Elapsed */}
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <div className="flex justify-between text-sm sm:text-base items-center flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-700 font-semibold text-xs sm:text-sm">ระยะเวลาผ่านพ้นไปแล้ว:</span>
                        {isCompletedDeliveredLate ? (
                          <span className="font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 text-xs shadow-2xs">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span>โครงการแล้วเสร็จ 100%</span>
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-bold text-slate-900 tabular-nums text-base sm:text-lg">
                          {isCompletedDeliveredLate
                            ? `${totalElapsedDays} / ${timeline.contractDays} วัน`
                            : timeline.isCompleted
                            ? `${timeline.contractDays} / ${timeline.contractDays} วัน`
                            : timeline.isExpired
                            ? `${timeline.contractDays + timeline.overdueDays} / ${timeline.contractDays} วัน`
                            : `${timeline.elapsedDays} / ${timeline.contractDays} วัน`}
                        </span>
                        <span className={`text-xs sm:text-sm font-bold tabular-nums font-mono ${
                          isCompletedDeliveredLate
                            ? "text-amber-800"
                            : timeline.isCompleted
                            ? "text-emerald-700"
                            : timeline.isExpired
                            ? "text-rose-600"
                            : "text-slate-600"
                        }`}>
                          {isCompletedDeliveredLate
                            ? `(${actualElapsedPercent}%)`
                            : timeline.isCompleted
                            ? "(100%)"
                            : `(${timeline.elapsedPercent}%)`}
                        </span>
                      </div>
                    </div>

                    {isCompletedDeliveredLate ? (
                      <div className="space-y-2.5">
                        <div className="h-5.5 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200 shadow-inner flex relative">
                          {/* Segment 1: Contract Days (Green) */}
                          <div
                            style={{
                              width: `${Math.max(65, Math.min(94, (timeline.contractDays / totalElapsedDays) * 100))}%`,
                            }}
                            className="h-full bg-emerald-500 rounded-l-full flex items-center justify-between px-3 text-xs font-semibold text-white transition-all duration-300 shadow-xs"
                            title={`ตามกรอบสัญญา: ${timeline.contractDays} วัน (100%)`}
                          >
                            <span>ตามสัญญา {timeline.contractDays} วัน</span>
                            <span className="text-[11px] opacity-90 hidden sm:inline">100%</span>
                          </div>

                          {/* Contract Deadline Line */}
                          <div className="w-0.5 h-full bg-white z-10 shrink-0" />

                          {/* Segment 2: Overdue / Delayed Days (Amber Striped) */}
                          <div
                            style={{
                              width: `${Math.max(6, Math.min(35, (completedOverdueDays / totalElapsedDays) * 100))}%`,
                            }}
                            className="h-full flex-1 bg-amber-500 rounded-r-full flex items-center justify-center text-xs font-bold text-amber-950 transition-all duration-300 shadow-xs relative bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.25),rgba(255,255,255,0.25)_4px,transparent_4px,transparent_8px)]"
                            title={`ส่งมอบช้ากว่าสัญญา: +${completedOverdueDays} วัน (รวม ${totalElapsedDays} วัน)`}
                          >
                            <span className="truncate px-1 font-mono">+{completedOverdueDays} วัน</span>
                          </div>
                        </div>

                        {/* Milestone indicators under the bar - Single clean un-duplicated row */}
                        <div className="flex flex-wrap justify-between items-center text-xs sm:text-[13px] text-slate-600 pt-1 px-1 font-['Sarabun',sans-serif] gap-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-slate-400 inline-block shrink-0" />
                            <span>เริ่มสัญญา:</span>
                            <strong className="text-slate-800 font-semibold tabular-nums">{formatDateDisplay(project.startDate)}</strong>
                          </div>

                          <div className="flex items-center gap-1.5 text-emerald-800 font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" />
                            <span>ครบกำหนดสัญญา:</span>
                            <strong className="font-semibold tabular-nums">{formatDateDisplay(project.endDate)}</strong>
                            <span className="text-emerald-700 text-xs sm:text-[12px]">({timeline.contractDays} วัน)</span>
                          </div>

                          <div className="flex items-center gap-1.5 text-amber-900 font-medium">
                            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block shrink-0" />
                            <span>ส่งมอบจริง:</span>
                            <strong className="font-bold tabular-nums text-slate-900">{deliveryDateDisplay || "-"}</strong>
                            <span className="bg-amber-100 text-amber-950 border border-amber-300/90 px-2 py-0.5 rounded-md font-semibold text-xs tabular-nums shadow-2xs">
                              +{completedOverdueDays} วัน (รวม {totalElapsedDays} วัน)
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200 shadow-inner">
                          <div
                            style={{ width: `${timeline.elapsedPercent}%` }}
                            className={`h-full rounded-full transition-all duration-300 ${
                              timeline.isCompleted
                                ? "bg-emerald-500"
                                : timeline.isExpired
                                ? "bg-rose-500"
                                : "bg-gradient-to-r from-amber-400 to-amber-500"
                            }`}
                          ></div>
                        </div>

                        <div className="flex flex-wrap justify-between items-center gap-2 text-xs sm:text-sm text-slate-700 font-medium">
                          <span>เริ่มสัญญา: <strong className="text-slate-900 font-semibold tabular-nums">{formatDateDisplay(project.startDate)}</strong></span>
                          {timeline.isCompleted ? (
                            <span className="font-semibold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 flex items-center gap-1.5 text-xs sm:text-sm">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                              <span>โครงการเสร็จสมบูรณ์ (100%)</span>
                            </span>
                          ) : timeline.isExpired ? (
                            <span className="font-semibold text-rose-800 bg-rose-50 px-3 py-1 rounded-lg border border-rose-200 flex items-center gap-1.5 animate-pulse text-xs sm:text-sm">
                              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                              <span>หมดสัญญาแล้ว (เลยกำหนดสัญญา/ล่าช้า {timeline.overdueDays} วัน)</span>
                            </span>
                          ) : (
                            <span className="font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg text-xs sm:text-sm">
                              {timeline.remainingText}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </>
              );
            })()}

            {/* Contract Extensions (ประวัติการขยายระยะเวลาสัญญา) History Box */}
            {project.extensions && project.extensions.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs sm:text-sm font-semibold text-indigo-950 flex items-center gap-2">
                    <History className="h-4 w-4 text-indigo-600" />
                    <span>ประวัติการขยายระยะเวลาสัญญา ({project.extensions.length} ครั้ง)</span>
                  </h4>
                </div>
                <div className="space-y-2.5">
                  {project.extensions.map((ext, idx) => (
                    <div
                      key={idx}
                      className="bg-indigo-50/40 hover:bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs sm:text-sm"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-indigo-600 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full font-['Sarabun',sans-serif]">
                            ครั้งที่ {ext.round || idx + 1}
                          </span>
                          <span className="bg-emerald-100 text-emerald-800 font-semibold text-xs px-2.5 py-0.5 rounded-full font-mono">
                            +{ext.extensionDays} วัน
                          </span>
                          {ext.docNumber && (
                            <span className="text-slate-600 font-medium">
                              เลขที่หนังสือ: <span className="font-semibold text-slate-900">{ext.docNumber}</span>
                            </span>
                          )}
                          {ext.approvedDate && (
                            <span className="text-slate-500 font-normal">
                              (อนุมัติวันที่: {formatDateDisplay(ext.approvedDate)})
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-700 text-xs sm:text-sm">
                          <span>สิ้นสุดสัญญาเดิม: <strong className="text-slate-800 font-semibold font-mono">{formatDateDisplay(ext.oldEndDate)}</strong></span>
                          <span className="text-indigo-400">➜</span>
                          <span>สิ้นสุดสัญญาใหม่: <strong className="text-indigo-800 font-semibold font-mono">{formatDateDisplay(ext.newEndDate)}</strong></span>
                        </div>
                        {ext.reason && (
                          <p className="text-xs text-slate-700 bg-white/80 px-3 py-1.5 rounded-xl border border-indigo-100/60 mt-1 leading-relaxed">
                            <span className="font-semibold text-slate-800">เหตุผลความจำเป็น:</span> {ext.reason}
                          </p>
                        )}
                      </div>

                      {isOwnerOrAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeleteExtension(idx)}
                          className="text-slate-400 hover:text-rose-600 p-2 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer self-end sm:self-center"
                          title="ลบรายการประวัติการขยายสัญญานี้"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 4. การบริหารจัดการค่าปรับและข้อกำหนดสัญญา (Liquidated Damages & Contract Management) - แสดงเมื่อโครงการหมดสัญญา/ล่าช้า/หรือวันที่สุดท้ายของงวดสุดท้ายเกินวันสิ้นสุดสัญญา */}
          {(penaltyResult.isOverdue || penaltyResult.hasFinalInstallmentExceededContract) && (
            <div className="bg-white rounded-2xl border border-rose-200/90 shadow-xs p-6 sm:p-7 space-y-6 font-['Sarabun',sans-serif]">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between border-b border-slate-100 pb-4 gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                      <Scale className="h-5 w-5 text-rose-600" />
                      <span>การบริหารจัดการค่าปรับและข้อกำหนดสัญญา</span>
                    </h3>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border font-['Sarabun',sans-serif] ${penaltyResult.badgeClasses.bg} ${penaltyResult.badgeClasses.text} ${penaltyResult.badgeClasses.border}`}>
                      {penaltyResult.badgeClasses.icon} {penaltyResult.statusTitle}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    ระบบคำนวณค่าปรับและติดตามเพดาน 10% อ้างอิงระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้างฯ พ.ศ. 2560
                    {penaltyResult.hasFinalInstallmentExceededContract && (
                      <span className="ml-1 text-rose-600 font-medium">
                        (ส่งมอบงานจริงเกินวันที่สิ้นสุดสัญญา)
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex flex-nowrap items-center gap-2 shrink-0 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    type="button"
                    onClick={handleOpenPenaltyConfig}
                    className="bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 text-xs sm:text-sm font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 font-['Sarabun',sans-serif]"
                    title="ตั้งค่าอัตราค่าปรับ หรือ บันทึกวันขอยกเว้น/งดลดค่าปรับตาม ม.102"
                  >
                    <Settings2 className="h-4 w-4 text-slate-600" />
                    <span>ตั้งค่าค่าปรับ & งดลดค่าปรับ</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenPenaltyDocs}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200/80 text-xs sm:text-sm font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 font-['Sarabun',sans-serif]"
                    title="บันทึกหนังสือแจ้งสงวนสิทธิ์การเรียกค่าปรับ / สัญญาแก้ไขเพิ่มเติม"
                  >
                    <FileBadge2 className="h-4 w-4 text-indigo-600" />
                    <span>หนังสือสงวนสิทธิ์/เอกสารสัญญา {project.penaltyNoticeDocs && project.penaltyNoticeDocs.length > 0 ? `(${project.penaltyNoticeDocs.length})` : ""}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenRecoveryModal}
                    className="bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-200/80 text-xs sm:text-sm font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 font-['Sarabun',sans-serif]"
                    title="บันทึกแผนเร่งรัดงานและกำหนดวันแล้วเสร็จเป้าหมายใหม่"
                  >
                    <Rocket className="h-4 w-4 text-amber-700" />
                    <span>{project.recoveryTargetDate ? "แผนเร่งรัดงาน (มีแผน)" : "+ แผนเร่งรัดงาน"}</span>
                  </button>
                </div>
              </div>

              {/* Context Alert Banner */}
              <div className={`p-4 sm:p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs sm:text-sm ${penaltyResult.badgeClasses.bg} ${penaltyResult.badgeClasses.border}`}>
                <div className="flex items-start sm:items-center gap-3">
                  <span className="text-2xl shrink-0 mt-0.5 sm:mt-0">{penaltyResult.badgeClasses.icon}</span>
                  <div>
                    <h4 className={`font-semibold text-sm sm:text-base ${penaltyResult.badgeClasses.text}`}>
                      {penaltyResult.statusTitle}
                    </h4>
                    <p className="text-slate-700 text-xs sm:text-sm leading-relaxed mt-0.5">
                      {penaltyResult.statusDescription}
                    </p>
                  </div>
                </div>
                {project.waivedDays !== undefined && project.waivedDays > 0 && (
                  <span className="bg-white/90 text-teal-900 border border-teal-200 text-xs font-semibold px-3 py-1 rounded-xl shrink-0">
                    งด/ลดค่าปรับ: {project.waivedDays} วัน {project.waivedReason ? `(${project.waivedReason})` : ""}
                  </span>
                )}
              </div>

              {/* 4 Financial & Timeline Calculation Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 font-['Sarabun',sans-serif]">
                <div className="p-3.5 sm:p-4.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 flex flex-col justify-between min-h-[144px] shadow-2xs space-y-2">
                  <div>
                    <span className="text-xs sm:text-sm font-medium text-slate-600 block leading-tight">อัตราค่าปรับตามสัญญา</span>
                  </div>
                  <div className="my-auto py-1">
                    <p className="text-2xl sm:text-[26px] font-bold text-slate-900 font-mono tracking-tight leading-none">
                      {penaltyResult.dailyFineAmount.toLocaleString()} <span className="text-sm sm:text-base font-medium text-slate-600 ml-1 font-['Sarabun',sans-serif]">บาท/วัน</span>
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] xl:text-[11.5px] 2xl:text-xs text-slate-600 font-normal leading-normal block whitespace-nowrap tracking-tight">
                      (คิด {penaltyResult.effectiveRatePercent}% / วัน ของวงเงินสัญญา)
                    </span>
                  </div>
                </div>

                <div className="p-3.5 sm:p-4.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 flex flex-col justify-between min-h-[144px] shadow-2xs space-y-2">
                  <div>
                    <span className="text-xs sm:text-sm font-medium text-slate-600 block leading-tight">
                      {penaltyResult.isOverdue ? "วันที่เริ่มคิดค่าปรับวันแรก" : "วันส่งมอบงานวันสุดท้าย"}
                    </span>
                  </div>
                  <div className="my-auto py-1">
                    <p className="text-xl sm:text-2xl font-bold text-indigo-950 font-mono tracking-tight leading-none">
                      {penaltyResult.isOverdue && penaltyResult.penaltyStartDateStr
                        ? formatDateDisplay(penaltyResult.penaltyStartDateStr)
                        : formatDateDisplay(penaltyResult.effectiveDeliveryDateStr)}
                    </p>
                  </div>
                  <div>
                    <div className="text-[10px] sm:text-[10.5px] xl:text-[11px] 2xl:text-xs text-slate-600 font-normal leading-normal">
                      {penaltyResult.hasFinalInstallmentExceededContract && penaltyResult.lastPeriodEndDateStr ? (
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap" title={`ส่งมอบจริง: ${formatDateDisplay(penaltyResult.lastPeriodEndDateStr)}${penaltyResult.lastPeriodNo ? ` (งวด ${penaltyResult.lastPeriodNo})` : ""}`}>
                            <span className="text-slate-600 font-medium text-xs sm:text-[12.5px] shrink-0">ส่งมอบจริง:</span>
                            <span className="font-bold text-amber-950 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-md font-mono text-xs sm:text-[12.5px] shadow-2xs tabular-nums tracking-normal">
                              {formatDateDisplay(penaltyResult.lastPeriodEndDateStr)}
                            </span>
                          </div>
                          {penaltyResult.isOngoingToToday && (
                            <span className="text-amber-800 block text-[9.5px] sm:text-[10px] xl:text-[10.5px] font-medium mt-1 whitespace-nowrap tracking-tight overflow-hidden text-ellipsis">
                              (ผลงานยังไม่ถึง 100% คิดถึงปัจจุบัน {penaltyResult.asOfTodayStr})
                            </span>
                          )}
                        </div>
                      ) : penaltyResult.isEndDateHoliday ? (
                        <span className="whitespace-nowrap tracking-tight block overflow-hidden text-ellipsis">
                          (เลื่อนจากวันหยุด {formatDateDisplay(project.endDate)} ตาม ม.193/8)
                        </span>
                      ) : (
                        <span className="whitespace-nowrap tracking-tight block overflow-hidden text-ellipsis">
                          (นับต่อเนื่องทุกวันตามปฏิทิน รวมวันหยุด)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 sm:p-4.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 flex flex-col justify-between min-h-[144px] shadow-2xs space-y-2">
                  <div>
                    <span className="text-xs sm:text-sm font-medium text-slate-600 block leading-tight">วันที่คิดค่าปรับสุทธิ</span>
                  </div>
                  <div className="my-auto py-1">
                    <p className="text-2xl sm:text-[26px] font-bold text-indigo-950 tracking-tight leading-none">
                      {penaltyResult.netChargeableDays} <span className="text-sm sm:text-base font-medium text-slate-600 ml-1 font-['Sarabun',sans-serif]">วัน</span>
                    </p>
                  </div>
                  <div>
                    <div className="text-[10px] sm:text-[10.5px] xl:text-[11px] 2xl:text-xs text-slate-600 font-normal leading-relaxed">
                      {penaltyResult.hasFinalInstallmentExceededContract && penaltyResult.penaltyStartDateStr && penaltyResult.lastPeriodEndDateStr ? (
                        <span className="whitespace-nowrap tracking-tight block overflow-hidden text-ellipsis" title={
                          penaltyResult.isOngoingToToday
                            ? `(เริ่มปรับ ${formatDateDisplay(penaltyResult.penaltyStartDateStr)} ถึงวันนี้ ${penaltyResult.asOfTodayStr} = ${penaltyResult.overdueDays} วัน${penaltyResult.waivedDays > 0 ? ` - งดลด ${penaltyResult.waivedDays} วัน` : ""})`
                            : `(เริ่มปรับ ${formatDateDisplay(penaltyResult.penaltyStartDateStr)} ถึง ${formatDateDisplay(penaltyResult.lastPeriodEndDateStr)} = ${penaltyResult.overdueDays} วัน${penaltyResult.waivedDays > 0 ? ` - งดลด ${penaltyResult.waivedDays} วัน` : ""})`
                        }>
                          {penaltyResult.isOngoingToToday ? (
                            <span>
                              (เริ่มปรับ {formatDateDisplay(penaltyResult.penaltyStartDateStr)} ถึงวันนี้ {penaltyResult.asOfTodayStr} = {penaltyResult.overdueDays} วัน{penaltyResult.waivedDays > 0 ? ` - งดลด ${penaltyResult.waivedDays} วัน` : ""})
                            </span>
                          ) : (
                            <span>
                              (เริ่มปรับ {formatDateDisplay(penaltyResult.penaltyStartDateStr)} ถึง {formatDateDisplay(penaltyResult.lastPeriodEndDateStr)} = {penaltyResult.overdueDays} วัน{penaltyResult.waivedDays > 0 ? ` - งดลด ${penaltyResult.waivedDays} วัน` : ""})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="whitespace-nowrap tracking-tight block overflow-hidden text-ellipsis">
                          (ล่าช้า {penaltyResult.overdueDays} วัน - งดลด {penaltyResult.waivedDays} วัน)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className={`p-3.5 sm:p-4.5 rounded-2xl border flex flex-col justify-between min-h-[144px] shadow-2xs space-y-2 ${
                  penaltyResult.totalFineAmount > 0
                    ? penaltyResult.isExceedingCap
                      ? "bg-rose-100/80 border-rose-300"
                      : penaltyResult.isApproachingCap
                      ? "bg-amber-50 border-amber-200"
                      : "bg-rose-50/70 border-rose-200/90"
                    : "bg-emerald-50/60 border-emerald-200/80"
                }`}>
                  <div>
                    <span className={`text-xs sm:text-sm font-semibold block leading-tight ${
                      penaltyResult.totalFineAmount > 0 ? "text-rose-900" : "text-emerald-900"
                    }`}>
                      ค่าปรับสะสมปัจจุบัน
                    </span>
                  </div>
                  <div className="my-auto py-1">
                    <p className={`text-2xl sm:text-[26px] font-bold font-mono tracking-tight leading-none ${
                      penaltyResult.totalFineAmount > 0
                        ? penaltyResult.isExceedingCap
                          ? "text-rose-700"
                          : "text-rose-600"
                        : "text-emerald-700"
                    }`}>
                      {penaltyResult.totalFineAmount.toLocaleString()} <span className="text-sm sm:text-base font-medium text-slate-600 ml-1 font-['Sarabun',sans-serif]">บาท</span>
                    </p>
                  </div>
                  <div className={`text-[11px] xl:text-[11.5px] 2xl:text-xs font-normal leading-relaxed space-y-0.5 ${
                    penaltyResult.totalFineAmount > 0 ? "text-rose-800" : "text-emerald-800"
                  }`}>
                    <span className="block font-medium whitespace-nowrap tracking-tight">คิดเป็น {penaltyResult.finePercentOfBudget.toFixed(2)}% ของวงเงินสัญญา</span>
                    <span className="block text-slate-600 whitespace-nowrap tracking-tight">(เพดาน 10% = {penaltyResult.maxCapAmount.toLocaleString()} บ.)</span>
                  </div>
                </div>
              </div>

              {/* 10% Liquidated Damages Termination Threshold Meter */}
              <div className="p-5 sm:p-6 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                      <Gauge className="h-5 w-5" />
                    </div>
                    <span className="font-semibold text-slate-900 text-sm sm:text-base">
                      เกจวัดสัดส่วนค่าปรับเทียบกับเพดาน 10% (Termination Threshold):
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-bold text-slate-900 text-sm sm:text-base">
                      {penaltyResult.totalFineAmount.toLocaleString()} บ. ({penaltyResult.finePercentOfBudget.toFixed(2)}%)
                    </span>
                    <span className="text-slate-400 font-bold">/</span>
                    <span className="text-slate-700 font-medium text-xs sm:text-sm">
                      10% ({penaltyResult.maxCapAmount.toLocaleString()} บ.)
                    </span>
                  </div>
                </div>

                {/* Graphical Visual Bar */}
                <div className="relative pt-2 pb-10">
                  <div className="h-5 w-full bg-slate-200/80 rounded-full overflow-hidden p-0.5 border border-slate-300/60 relative shadow-inner">
                    <div
                      style={{ width: `${Math.min(100, (penaltyResult.finePercentOfBudget / 10) * 100)}%` }}
                      className={`h-full rounded-full transition-all duration-300 shadow-xs ${
                        penaltyResult.isExceedingCap
                          ? "bg-rose-600 animate-pulse"
                          : penaltyResult.isApproachingCap
                          ? "bg-amber-500"
                          : "bg-indigo-600"
                      }`}
                    ></div>
                  </div>

                  {/* Milestone Indicators at 0%, 5%, 10% with enhanced font size and clarity */}
                  <div className="absolute top-8 inset-x-0 flex justify-between">
                    <div className="flex flex-col items-start">
                      <span className="text-xs sm:text-sm font-semibold text-slate-700">
                        0% (เริ่มคิดค่าปรับ)
                      </span>
                      <span className="text-xs sm:text-sm font-normal text-slate-500 font-mono mt-0.5">
                        0 บ.
                      </span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xs sm:text-sm font-semibold text-amber-900 flex items-center gap-1">
                        <span>⚠️</span>
                        <span>5% (โซนเฝ้าระวัง)</span>
                      </span>
                      <span className="text-xs sm:text-sm font-medium text-amber-800 font-mono mt-0.5">
                        {(penaltyResult.maxCapAmount * 0.5).toLocaleString(undefined, { maximumFractionDigits: 0 })} บ.
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs sm:text-sm font-semibold text-rose-900 flex items-center gap-1">
                        <span>🚨</span>
                        <span>10% (เพดานบอกเลิกสัญญา)</span>
                      </span>
                      <span className="text-xs sm:text-sm font-medium text-rose-800 font-mono mt-0.5">
                        {penaltyResult.maxCapAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} บ.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3.5 border-t border-slate-200/80 space-y-2.5 text-xs sm:text-sm text-slate-700">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="h-4.5 w-4.5 text-slate-500 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      <strong className="font-semibold text-slate-900">ข้อพิจารณาทางกฎหมาย (บอกเลิกสัญญา):</strong> ตาม พ.ร.บ. การจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560 มาตรา 103 หากค่าปรับสะสมเกินร้อยละ 10 ของวงเงินค่าจ้างตามสัญญา หน่วยงานของรัฐจะต้องพิจารณาบอกเลิกสัญญา เว้นแต่คู่สัญญายินยอมเสียค่าปรับโดยไม่มีเงื่อนไข
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 pl-0.5">
                    <span className="text-sm shrink-0">⚖️</span>
                    <p className="leading-relaxed text-slate-700">
                      <strong className="font-semibold text-slate-900">หลักการนับวันสิ้นสุดสัญญาและวันคิดค่าปรับ:</strong> ตาม ป.พ.พ. มาตรา 193/8 หากวันสิ้นสุดสัญญาตรงกับวันหยุดราชการ ผู้รับจ้างได้รับสิทธิส่งมอบงานใน <u>วันเปิดทำการวันแรกถัดไป</u> โดยไม่คิดค่าปรับ แต่หากพ้นกำหนดดังกล่าวแล้ว การคิดค่าปรับจะเริ่มนับต่อเนื่อง <u>ทุกวันตามปฏิทิน (รวมวันเสาร์-อาทิตย์ และวันหยุดนักขัตฤกษ์)</u> จนกว่าจะส่งมอบงานแล้วเสร็จ
                    </p>
                  </div>
                </div>
              </div>

              {/* Recovery Plan Summary if set */}
              {project.recoveryTargetDate && (
                <div className="p-4 sm:p-5 bg-amber-50/50 rounded-2xl border border-amber-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-950 font-semibold text-xs sm:text-sm">
                      <Rocket className="h-4 w-4 text-amber-700" />
                      <span>แผนเร่งรัดงานก่อสร้าง (Recovery Plan)</span>
                    </div>
                    <span className="text-xs font-mono font-semibold bg-amber-100 text-amber-950 px-3 py-0.5 rounded-full border border-amber-300">
                      เป้าหมายแล้วเสร็จใหม่: {formatDateDisplay(project.recoveryTargetDate)}
                    </span>
                  </div>
                  {project.recoveryPlanNotes && (
                    <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap pl-6 leading-relaxed">
                      {project.recoveryPlanNotes}
                    </p>
                  )}
                </div>
              )}

              {/* Penalty Notice Docs List */}
              {project.penaltyNoticeDocs && project.penaltyNoticeDocs.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs sm:text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-indigo-600" />
                    <span>หนังสือและเอกสารบริหารสัญญา ({project.penaltyNoticeDocs.length} ฉบับ)</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {project.penaltyNoticeDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 transition-colors flex justify-between items-start gap-2"
                      >
                        <div className="space-y-1 text-xs flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900">{doc.docNumber}</span>
                            <span className="text-slate-400">•</span>
                            <span className="text-slate-500 font-mono">{formatDateDisplay(doc.docDate)}</span>
                          </div>
                          <p className="font-semibold text-indigo-950">{doc.subject}</p>
                          {doc.details && <p className="text-slate-600 text-xs line-clamp-2 leading-relaxed">{doc.details}</p>}
                          <span className="inline-block text-[11px] text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200 font-medium">
                            ออกโดย: {doc.issuer}
                          </span>
                        </div>
                        {isOwnerOrAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeletePenaltyDoc(doc.id)}
                            className="text-slate-400 hover:text-rose-600 p-1.5 rounded hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                            title="ลบเอกสารนี้"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. การบริหารจัดการการสั่งหยุดงานระหว่างปฏิบัติงาน (Work Suspension Management) */}
          <div className="bg-white rounded-2xl border border-amber-200/90 shadow-xs p-6 sm:p-7 space-y-6 font-['Sarabun',sans-serif]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5">
                    <PauseCircle className="h-5 w-5 text-amber-600" />
                    <span>การบริหารจัดการการสั่งหยุดงานระหว่างปฏิบัติงาน</span>
                  </h3>
                  <span className="bg-amber-50 text-amber-950 text-xs font-semibold px-3 py-0.5 rounded-full border border-amber-300">
                    {project.suspensions?.length || 0} รายการ ({getTotalSuspensionStats(project.suspensions).totalSuspensionDays} วัน)
                  </span>
                  {getActiveSuspension(project.suspensions).isSuspendedNow && (
                    <span className="bg-amber-600 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs animate-pulse">
                      <span>⏸️</span>
                      <span>อยู่ระหว่างหยุดงาน</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  ระบบบันทึกและควบคุมคำสั่งสั่งหยุดงานชั่วคราว การเชื่อมโยงสิทธิขยายสัญญา และคำสั่งให้เริ่มงานต่อ (Resume Work) ตามระเบียบฯ
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleOpenAddSuspension}
                  className="bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs font-['Sarabun',sans-serif]"
                >
                  <Plus className="h-4 w-4" />
                  <span>บันทึกคำสั่งหยุดงานชั่วคราว</span>
                </button>
              </div>
            </div>

            {/* Active Suspension Alert Banner */}
            {(() => {
              const activeInfo = getActiveSuspension(project.suspensions);
              if (!activeInfo.isSuspendedNow || !activeInfo.activePeriod) return null;
              const active = activeInfo.activePeriod;
              return (
                <div className="p-4 sm:p-5 rounded-2xl border border-amber-300 bg-amber-50/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xs">
                  <div className="flex items-start gap-3.5">
                    <div className="p-2.5 bg-amber-600 text-white rounded-xl shadow-2xs shrink-0 mt-0.5">
                      <PauseCircle className="h-6 w-6" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="bg-amber-600 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full">
                          อยู่ระหว่างมีคำสั่งให้หยุดงานชั่วคราว
                        </span>
                        <span className="text-xs font-semibold text-amber-950 font-mono">
                          หยุดงานไปแล้ว {activeInfo.currentActiveDays} วัน (นับถึงปัจจุบัน)
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">
                        เริ่มหยุดงานตั้งแต่วันที่: <span className="font-mono text-amber-950 font-bold">{formatDateDisplay(active.start)}</span>
                        {active.orderDocNo && ` • เลขที่หนังสือสั่งการ: ${active.orderDocNo}`}
                      </p>
                      {active.reason && (
                        <p className="text-xs sm:text-sm text-slate-700 bg-white/90 p-2.5 rounded-xl border border-amber-200/70 inline-block leading-relaxed">
                          <span className="font-semibold text-slate-900">สาเหตุ:</span> {active.reason}
                        </p>
                      )}
                    </div>
                  </div>

                  {isOwnerOrAdmin && (
                    <button
                      type="button"
                      onClick={() => handleOpenQuickResume(activeInfo.activeIndex)}
                      className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors cursor-pointer shadow-2xs shrink-0 w-full md:w-auto justify-center font-['Sarabun',sans-serif]"
                    >
                      <PlayCircle className="h-4 w-4" />
                      <span>สั่งเริ่มงานต่อ (Resume Work)</span>
                    </button>
                  )}
                </div>
              );
            })()}

            {/* 3 Summary KPI Metrics Cards */}
            {(() => {
              const stats = getTotalSuspensionStats(project.suspensions);
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="p-4 sm:p-5 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-1.5">
                    <span className="text-xs sm:text-sm font-medium text-slate-600 block">คำสั่งหยุดงานทั้งหมด</span>
                    <p className="text-2xl sm:text-3xl font-bold text-slate-800 font-mono">
                      {stats.totalPeriods} <span className="text-sm sm:text-base font-medium text-slate-600 font-['Sarabun',sans-serif]">รายการ</span>
                    </p>
                    <span className="text-xs sm:text-sm text-slate-600 font-normal block">
                      รวมเวลาสั่งหยุดงาน {stats.totalSuspensionDays} วัน
                    </span>
                  </div>

                  <div className="p-4 sm:p-5 bg-emerald-50/70 rounded-2xl border border-emerald-200/80 space-y-1.5">
                    <span className="text-xs sm:text-sm font-medium text-emerald-900 block">สิทธิที่ขอขยายเวลา/งดค่าปรับได้</span>
                    <p className="text-2xl sm:text-3xl font-bold text-emerald-700 font-mono">
                      {stats.eligibleExtensionDays} <span className="text-sm sm:text-base font-medium text-emerald-700 font-['Sarabun',sans-serif]">วัน</span>
                    </p>
                    <span className="text-xs sm:text-sm text-emerald-800 font-normal block">
                      (เหตุจากหน่วยงานรัฐ/พื้นที่/เหตุสุดวิสัย)
                    </span>
                  </div>

                  <div className="p-4 sm:p-5 bg-rose-50/70 rounded-2xl border border-rose-200/80 space-y-1.5">
                    <span className="text-xs sm:text-sm font-medium text-rose-900 block">ความบกพร่องของผู้รับจ้าง</span>
                    <p className="text-2xl sm:text-3xl font-bold text-rose-700 font-mono">
                      {stats.contractorFaultDays} <span className="text-sm sm:text-base font-medium text-rose-700 font-['Sarabun',sans-serif]">วัน</span>
                    </p>
                    <span className="text-xs sm:text-sm text-rose-800 font-normal block">
                      (สั่งหยุดเพื่อแก้ไขงาน - ไม่มีสิทธิขยายเวลา)
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* List of Suspensions */}
            {(!project.suspensions || project.suspensions.length === 0) ? (
              <div className="p-4 sm:p-5 bg-slate-50/80 rounded-xl border border-slate-200/80 text-center flex items-center justify-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <span className="text-xs sm:text-sm font-medium text-slate-700">ไม่มีรายการคำสั่งหยุดงานระหว่างการปฏิบัติงาน</span>
              </div>
            ) : (
              <div className="space-y-3">
                {project.suspensions.map((s, idx) => {
                  const days = s.days || calculateSuspensionDays(s.start, s.end);
                  const isResolved = !!(s.end && s.end.trim() !== "" && s.end !== "-");
                  const isEligible = s.isEligibleForExtension !== false && s.reasonCategory !== "contractor_fault";

                  let categoryLabel = "🏢 ข้อขัดข้องหน่วยงานรัฐ/พื้นที่";
                  let categoryClass = "bg-sky-50 text-sky-900 border-sky-200";
                  if (s.reasonCategory === "force_majeure") {
                    categoryLabel = "⛈️ เหตุสุดวิสัย/ภัยธรรมชาติ";
                    categoryClass = "bg-amber-50 text-amber-950 border-amber-200";
                  } else if (s.reasonCategory === "contractor_fault") {
                    categoryLabel = "⚠️ ความผิด/บกพร่องของผู้รับจ้าง";
                    categoryClass = "bg-rose-50 text-rose-900 border-rose-200";
                  } else if (s.reasonCategory === "other") {
                    categoryLabel = "📌 เหตุผลความจำเป็นอื่น ๆ";
                    categoryClass = "bg-slate-50 text-slate-800 border-slate-200";
                  }

                  return (
                    <div
                      key={s.id || idx}
                      className="p-4 sm:p-5 bg-slate-50/70 hover:bg-slate-50 rounded-2xl border border-slate-200 transition-colors flex flex-col gap-3.5 text-xs sm:text-sm font-['Sarabun',sans-serif]"
                    >
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200/60 pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-slate-800 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full font-mono">
                            คำสั่งที่ {idx + 1}
                          </span>
                          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${categoryClass}`}>
                            {categoryLabel}
                          </span>
                          {isResolved ? (
                            <span className="bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                              ✅ สิ้นสุดการหยุดงานแล้ว ({days} วัน)
                            </span>
                          ) : (
                            <span className="bg-amber-500 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full animate-pulse">
                              ⏸️ อยู่ระหว่างหยุดงาน ({days} วัน)
                            </span>
                          )}
                          {s.approvedExtensionDays ? (
                            <span className="bg-indigo-50 text-indigo-950 border border-indigo-200 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                              📜 ขยายสัญญาแล้ว (+{s.approvedExtensionDays} วัน)
                            </span>
                          ) : s.actionType === "waive_penalty" ? (
                            <span className="bg-teal-50 text-teal-900 border border-teal-200 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                              🛡️ พิจารณางด/ลดค่าปรับ
                            </span>
                          ) : isEligible && isResolved ? (
                            <span className="bg-amber-50 text-amber-950 border border-amber-200 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                              ⚖️ มีสิทธิขอขยายเวลา {days} วัน (ยังไม่ได้ผูกสัญญา)
                            </span>
                          ) : null}
                        </div>

                        {isOwnerOrAdmin && (
                          <div className="flex items-center gap-1.5 self-end sm:self-center">
                            {!isResolved && (
                              <button
                                type="button"
                                onClick={() => handleOpenQuickResume(idx)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs font-['Sarabun',sans-serif]"
                                title="สั่งเริ่มงานต่อ"
                              >
                                <PlayCircle className="h-3.5 w-3.5" />
                                <span>สั่งเริ่มงาน</span>
                              </button>
                            )}
                            {isResolved && isEligible && !s.approvedExtensionDays && (
                              <button
                                type="button"
                                onClick={() => handleDirectExtendFromSuspension(s, idx)}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs font-['Sarabun',sans-serif]"
                                title="ขยายระยะเวลาสัญญาตามจำนวนวันนี้ทันที"
                              >
                                <CalendarPlus className="h-3.5 w-3.5" />
                                <span>ขยายสัญญา +{days} วัน</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenEditSuspension(idx)}
                              className="text-slate-500 hover:text-indigo-600 p-1.5 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="แก้ไขรายการสั่งหยุดงานนี้"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setItemToDelete({
                                  type: "suspension",
                                  index: idx,
                                  title: "ยืนยันการลบรายการสั่งหยุดงาน",
                                  description: `ช่วงวันที่ ${s.start} ถึง ${s.end || "ปัจจุบัน"}${s.orderDocNo ? ` (หนังสือ: ${s.orderDocNo})` : ""}`,
                                })
                              }
                              className="text-slate-400 hover:text-rose-600 p-1.5 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="ลบรายการสั่งหยุดงานนี้"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Suspension Timeline & Document Info */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        <div className="space-y-1">
                          <span className="text-xs font-medium text-slate-500 block">ช่วงเวลาสั่งหยุดงาน</span>
                          <div className="font-mono text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                            <span className="bg-white px-2.5 py-1 rounded-lg border border-slate-200">{formatDateDisplay(s.start)}</span>
                            <span className="text-slate-400">➜</span>
                            <span className={`px-2.5 py-1 rounded-lg border ${isResolved ? "bg-white border-slate-200 text-slate-800" : "bg-amber-50 border-amber-200 text-amber-950 font-bold"}`}>
                              {isResolved ? formatDateDisplay(s.end!) : "ยังไม่มีกำหนดสิ้นสุด"}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500 block mt-1 font-normal">
                            รวมเวลาหยุดงานจริง: <strong className="font-mono text-slate-800 font-semibold">{days} วัน</strong>
                          </span>
                        </div>

                        <div className="space-y-1">
                          <span className="text-xs font-medium text-slate-500 block">หนังสือคำสั่งสั่งหยุดงาน</span>
                          <p className="text-xs text-slate-800 font-semibold font-mono">
                            {s.orderDocNo || "-"}
                            {s.orderDocDate && <span className="text-slate-500 font-normal"> (ลงวันที่: {formatDateDisplay(s.orderDocDate)})</span>}
                          </p>
                          {s.issuer && <span className="text-xs text-slate-500 block font-normal">ผู้ออกคำสั่ง: {s.issuer}</span>}
                        </div>

                        <div className="space-y-1">
                          <span className="text-xs font-medium text-slate-500 block">หนังสือสั่งให้เริ่มงานต่อ (Resume)</span>
                          <p className="text-xs text-slate-800 font-semibold font-mono">
                            {s.resumeDocNo || (isResolved ? `เริ่มงาน ${formatDateDisplay(s.end!)}` : "อยู่ระหว่างสั่งหยุดงาน")}
                            {s.resumeDocDate && <span className="text-slate-500 font-normal"> (ลงวันที่: {formatDateDisplay(s.resumeDocDate)})</span>}
                          </p>
                          <span className="text-xs text-slate-500 block font-normal">
                            สิทธิการขอขยายเวลา: <strong className={isEligible ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold"}>{isEligible ? "มีสิทธิขอขยายเวลา" : "ไม่มีสิทธิ"}</strong>
                          </span>
                        </div>
                      </div>

                      {s.reason && (
                        <div className="bg-white/90 p-3 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-700 leading-relaxed">
                          <span className="font-semibold text-slate-900">สาเหตุ / บันทึกรายละเอียดคำสั่ง:</span> {s.reason}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 5 & 6. ตารางแผนงานและผลงานรายครั้ง (Periodic Progress Table) และ หมายเหตุท้ายตาราง (Table Notes & Remarks) */}
          <div>
            <PeriodicTableSection
              project={project}
              onUpdatePeriodicProgress={onUpdatePeriodicProgress || (async () => {})}
              onUpdateDisbursements={onUpdateDisbursements}
              isAdmin={isAdmin}
              onRequestAdminLogin={onRequestAdminLogin}
              onCheckFirebaseConnection={onCheckFirebaseConnection}
            />
          </div>

          {/* 7. งวดการส่งมอบงานและการเบิกจ่ายเงิน (Disbursements) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 sm:p-6 lg:p-7 space-y-5 font-['Sarabun',sans-serif]">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 sm:gap-4 border-b border-slate-200/80 pb-3.5 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Coins className="h-5 w-5 text-blue-600 shrink-0" />
                <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                  งวดการส่งมอบงานและการเบิกจ่ายเงิน (Disbursements)
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 max-w-full w-full xl:w-auto justify-start xl:justify-end min-w-0">
                {/* Font Size Adjuster A- 16px A+ for Presentation */}
                <div
                  className="flex items-center gap-1 rounded-lg px-2 py-1 border border-slate-200/80 bg-slate-50 text-slate-800 text-xs font-mono select-none shrink-0"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => changeDisbursementFontSize(disbursementFontSize - 1)}
                    disabled={disbursementFontSize <= 9}
                    className="px-1.5 hover:text-blue-600 disabled:opacity-30 cursor-pointer font-semibold transition-colors"
                    title="ลดขนาดตัวอักษร (A-)"
                  >
                    A-
                  </button>
                  <span className="text-xs font-semibold text-slate-700 min-w-[34px] text-center font-mono">
                    {disbursementFontSize}px
                  </span>
                  <button
                    type="button"
                    onClick={() => changeDisbursementFontSize(disbursementFontSize + 1)}
                    disabled={disbursementFontSize >= 32}
                    className="px-1.5 hover:text-blue-600 disabled:opacity-30 cursor-pointer font-semibold transition-colors"
                    title="เพิ่มขนาดตัวอักษร (A+)"
                  >
                    A+
                  </button>
                </div>

                {/* Sort Order Toggle (งวดที่ 1 ➔ N / ล่าสุด ➔ 1) */}
                <button
                  type="button"
                  onClick={handleToggleDisbursementSort}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer shrink-0 shadow-2xs font-['Sarabun',sans-serif]"
                  title={`สลับลำดับการแสดงผลในคอลัมน์งวดที่ (ปัจจุบัน: ${disbursementSortOrder === "asc" ? "งวดที่ 1 ➔ ล่าสุด" : "งวดล่าสุด ➔ 1"})`}
                >
                  <ArrowUpDown className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span className="hidden sm:inline">เรียง:</span>
                  <span>{disbursementSortOrder === "asc" ? "งวดที่ 1 ➔ N" : "งวดล่าสุด ➔ 1"}</span>
                </button>

                <span className="text-xs sm:text-sm font-semibold bg-blue-50 px-2.5 py-1 rounded-lg text-blue-900 border border-blue-200/80 whitespace-nowrap shrink-0 font-['Sarabun',sans-serif]">
                  {project.disbursements?.length || 0} งวด
                </span>
                <button
                  type="button"
                  onClick={handleOpenGroupManager}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs sm:text-sm font-semibold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer shadow-2xs whitespace-nowrap shrink-0 font-['Sarabun',sans-serif]"
                  title="จัดกลุ่มผลงานการส่งมอบ (Admin / Owner)"
                >
                  <FolderKanban className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                  <span>จัดกลุ่มผลงาน</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDisbursementPdfModal(true)}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs sm:text-sm font-semibold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer shadow-2xs whitespace-nowrap shrink-0 font-['Sarabun',sans-serif]"
                  title="พิมพ์รายงาน / Export เป็น PDF (รวมงวดงาน ผลงานแต่ละครั้ง และภาพถ่ายหน้างาน)"
                >
                  <Printer className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Export PDF / พิมพ์</span>
                </button>
                {!showAddDisbursementForm && (
                  <button
                    type="button"
                    onClick={() => {
                      const defaultPeriod = disbursementPeriodOptions.length > 0
                        ? disbursementPeriodOptions[0].value
                        : "1";
                      setPeriodNo(defaultPeriod);
                      setShowAddDisbursementForm(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-lg flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer shadow-2xs whitespace-nowrap shrink-0 font-['Sarabun',sans-serif]"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span>บันทึกรายการ</span>
                  </button>
                )}
              </div>
            </div>

            {/* Add Disbursement Form */}
            {showAddDisbursementForm && (
              (() => {
                const effectivePeriodNo = disbursementPeriodOptions.some((opt) => opt.value === periodNo)
                  ? periodNo
                  : disbursementPeriodOptions[0]?.value || "1";

                return (
                  <form onSubmit={handleAddDisbursementSubmit} className="bg-slate-50/90 p-4 sm:p-5 rounded-2xl space-y-4 border border-blue-200/80 shadow-2xs animate-in fade-in duration-150 font-['Sarabun',sans-serif]">
                    <div className="flex items-center justify-between border-b border-slate-200/70 pb-2.5">
                      <p className="text-xs sm:text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                        <Plus className="h-4 w-4 text-blue-600" />
                        <span>บันทึก/ส่งรายงานการเบิกจ่ายงวดใหม่</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddDisbursementForm(false);
                          setDisbursedAmt("");
                          setDisbursedRemarks("");
                        }}
                        className="text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 px-2.5 py-1 rounded-lg transition-colors cursor-pointer font-medium"
                      >
                        ยกเลิก
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      <div className="sm:col-span-3 space-y-1">
                        <label className="text-xs font-medium text-slate-600 block">กลุ่มผลงาน (ครั้งที่)</label>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={workRound}
                            onChange={(e) => setWorkRound(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none font-semibold text-blue-800 cursor-pointer shadow-2xs"
                          >
                            {disbursementWorkRoundOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                            {workRound && !disbursementWorkRoundOptions.includes(workRound) && (
                              <option value={workRound}>{workRound}</option>
                            )}
                          </select>
                        </div>
                      </div>
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-xs font-medium text-slate-600 block">งวดที่</label>
                        <select
                          value={effectivePeriodNo}
                          onChange={(e) => setPeriodNo(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none font-semibold text-slate-800 cursor-pointer shadow-2xs"
                        >
                          {disbursementPeriodOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-3 space-y-1">
                        <label className="text-xs font-medium text-slate-600 block">จำนวนเงินเบิกจ่าย (บาท)</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          required
                          placeholder="เช่น 0 หรือ 150000"
                          value={disbursedAmt}
                          onChange={(e) => setDisbursedAmt(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none font-mono"
                        />
                      </div>
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-xs font-medium text-slate-600 block">สถานะ</label>
                        <select
                          value={disbursedStatus}
                          onChange={(e) => setDisbursedStatus(e.target.value as any)}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none cursor-pointer font-medium shadow-2xs"
                        >
                          <option value="เบิกจ่ายแล้ว">เบิกจ่ายแล้ว</option>
                          <option value="ยังไม่เบิกจ่าย">ยังไม่เบิกจ่าย</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-slate-600 block">วันที่เบิกจ่าย</label>
                          {disbursedDate && (
                            <button
                              type="button"
                              onClick={() => setDisbursedDate("")}
                              className="text-[11px] text-rose-600 hover:text-rose-700 font-medium cursor-pointer transition-colors"
                            >
                              ล้างวันที่
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type="date"
                            disabled={disbursedStatus !== "เบิกจ่ายแล้ว"}
                            value={disbursedDate}
                            onChange={(e) => setDisbursedDate(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 font-mono"
                          />
                        </div>
                      </div>
                      <div className="sm:col-span-12 md:col-span-9 space-y-1">
                        <label className="text-xs font-medium text-slate-600 block">หมายเหตุ (เช่น เบิกจ่ายค่าตอกเสาเข็ม/งานคานคอดิน)</label>
                        <input
                          type="text"
                          placeholder="ระบุหมายเหตุงวดการเบิกจ่าย..."
                          value={disbursedRemarks}
                          onChange={(e) => setDisbursedRemarks(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-12 md:col-span-3 flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddDisbursementForm(false);
                            setDisbursedAmt("");
                            setDisbursedRemarks("");
                          }}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs px-3.5 py-2 rounded-lg transition-colors cursor-pointer"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="submit"
                          disabled={isLoading}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg p-2 flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs"
                          title="บันทึกงวดเบิกจ่าย"
                        >
                          <Plus className="h-4 w-4" />
                          <span>บันทึก</span>
                        </button>
                      </div>
                    </div>
                  </form>
                );
              })()
            )}

            {/* Disbursements List Table */}
            {!project.disbursements || project.disbursements.length === 0 ? (
              <p className="text-xs sm:text-sm text-slate-400 text-center py-6 font-normal">ยังไม่มีข้อมูลรายการเบิกจ่ายระบุไว้ในโครงการนี้</p>
            ) : (
              <div className="overflow-x-auto border border-slate-200/90 rounded-2xl shadow-2xs font-['Sarabun',sans-serif]" style={{ fontSize: `${disbursementFontSize}px` }}>
                <table className="w-full text-left border-collapse min-w-[720px]">
                  <thead style={{ fontSize: `${disbursementFontSize}px` }}>
                    <tr className="border-b border-slate-200 text-slate-800 font-semibold bg-slate-100/90 font-['Sarabun',sans-serif]" style={{ fontSize: "inherit" }}>
                      <th className="py-3 px-3 text-center w-28 border-r border-slate-200/90 whitespace-nowrap" style={{ fontSize: "inherit" }}>ผลงาน</th>
                      <th
                        className="py-3 px-3 w-28 text-center cursor-pointer select-none hover:bg-slate-200/70 transition-colors whitespace-nowrap"
                        style={{ fontSize: "inherit" }}
                        onClick={handleToggleDisbursementSort}
                        title={`คลิกเพื่อสลับการเรียงลำดับ (ปัจจุบัน: ${disbursementSortOrder === "asc" ? "งวดที่ 1 ➔ ล่าสุด" : "งวดล่าสุด ➔ 1"})`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>งวดที่</span>
                          <ArrowUpDown className="h-3 w-3 opacity-60 text-blue-600 shrink-0" />
                        </div>
                      </th>
                      <th className="py-3 px-4 text-right whitespace-nowrap" style={{ fontSize: "inherit" }}>จำนวนเงิน (บาท)</th>
                      <th className="py-3 px-3 text-center whitespace-nowrap" style={{ fontSize: "inherit" }}>คิดเป็น %</th>
                      <th className="py-3 px-3 text-center whitespace-nowrap" style={{ fontSize: "inherit" }}>สถานะการเบิกจ่าย</th>
                      <th className="py-3 px-4 text-left whitespace-nowrap min-w-[200px]" style={{ fontSize: "inherit" }}>หมายเหตุ / รายละเอียดงวด</th>
                      <th className="py-3 px-3 text-center w-28 whitespace-nowrap" style={{ fontSize: "inherit" }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {(() => {
                      const allDisbursements = project.disbursements || [];

                      // Retrieve periodic progress records to extract ผลงานประจำเดือน (%) for each period
                      const periodicRecords =
                        Array.isArray(project.periodicProgress) && project.periodicProgress.length > 0
                          ? project.periodicProgress
                          : getDefaultPeriodicProgress(project);

                      const parsePeriodNum = (val: string | number | undefined): number => {
                        if (val === undefined || val === null) return 999999;
                        if (typeof val === "number") return isNaN(val) ? 999999 : val;
                        const match = String(val).match(/\d+(\.\d+)?/);
                        return match ? parseFloat(match[0]) : 999999;
                      };

                      const parseRoundNum = (val: string): number => {
                        const match = String(val).match(/\d+/);
                        return match ? parseInt(match[0], 10) : 999999;
                      };

                      // Map each item with original index and resolved work round
                      const indexedDisbursements = allDisbursements.map((d, i, arr) => ({
                        d,
                        originalIndex: i,
                        workRound: getDisbursementWorkRound(d, i, arr),
                        periodNum: parsePeriodNum(d.periodNo),
                      }));

                      // Automatically sort disbursements by workRound then period number (งวดที่ 1 ➔ 2 ➔ 3...)
                      const sortedDisbursements = [...indexedDisbursements].sort((a, b) => {
                        if (a.workRound === b.workRound) {
                          const diff = a.periodNum - b.periodNum;
                          return disbursementSortOrder === "desc" ? -diff : diff;
                        }
                        const roundA = parseRoundNum(a.workRound);
                        const roundB = parseRoundNum(b.workRound);
                        if (roundA !== roundB) {
                          return disbursementSortOrder === "desc" ? roundB - roundA : roundA - roundB;
                        }
                        const nameDiff = a.workRound.localeCompare(b.workRound, "th");
                        if (nameDiff !== 0) return nameDiff;
                        const diff = a.periodNum - b.periodNum;
                        return disbursementSortOrder === "desc" ? -diff : diff;
                      });

                      const workRounds = sortedDisbursements.map((item) => item.workRound);
                      const isAnyRowEditing = editingDisbursementIndex !== null;
                      const rowSpans: number[] = [];
                      
                      // Calculate group statistics for each workRound
                      const groupStats: Record<
                        string,
                        {
                          totalAmount: number;
                          totalCount: number;
                          disbursedCount: number;
                          disbursedAmount: number;
                          totalActualPercent: number;
                          hasAnyPercent: boolean;
                        }
                      > = {};

                      sortedDisbursements.forEach(({ d, workRound }) => {
                        if (!groupStats[workRound]) {
                          groupStats[workRound] = {
                            totalAmount: 0,
                            totalCount: 0,
                            disbursedCount: 0,
                            disbursedAmount: 0,
                            totalActualPercent: 0,
                            hasAnyPercent: false,
                          };
                        }
                        const amt = Number(d.amount) || 0;
                        groupStats[workRound].totalAmount += amt;
                        groupStats[workRound].totalCount += 1;
                        if ((d.status || "").trim() === "เบิกจ่ายแล้ว") {
                          groupStats[workRound].disbursedCount += 1;
                          groupStats[workRound].disbursedAmount += amt;
                        }
                        const pPct = getActualMonthlyPercentForPeriod(d.periodNo, periodicRecords);
                        if (pPct !== null) {
                          groupStats[workRound].totalActualPercent += pPct;
                          groupStats[workRound].hasAnyPercent = true;
                        }
                      });

                      if (isAnyRowEditing) {
                        // When any row is being edited, render each row individually for clean alignment
                        sortedDisbursements.forEach(() => rowSpans.push(1));
                      } else {
                        let i = 0;
                        while (i < workRounds.length) {
                          let span = 1;
                          while (i + span < workRounds.length && workRounds[i + span] === workRounds[i]) {
                            span++;
                          }
                          // Add 1 to rowSpan to cover the subtotal summary row at the bottom of each group
                          rowSpans.push(span + 1);
                          for (let s = 1; s < span; s++) {
                            rowSpans.push(0);
                          }
                          i += span;
                        }
                      }

                      return sortedDisbursements.map(({ d, originalIndex, workRound }, idx) => {
                        const isEditingRow = editingDisbursementIndex === originalIndex;
                        const rowSpan = rowSpans[idx];
                        const workRoundLabel = workRound;
                        const isLastInGroup = idx === sortedDisbursements.length - 1 || workRounds[idx + 1] !== workRoundLabel;
                        const stats = groupStats[workRoundLabel] || {
                          totalAmount: Number(d.amount) || 0,
                          totalCount: 1,
                          disbursedCount: d.status === "เบิกจ่ายแล้ว" ? 1 : 0,
                          disbursedAmount: d.status === "เบิกจ่ายแล้ว" ? Number(d.amount) || 0 : 0,
                          totalActualPercent: 0,
                          hasAnyPercent: false,
                        };

                        const mainRow = isEditingRow ? (
                          <tr key={`edit-${originalIndex}`} className="bg-blue-50/70 border-y-2 border-blue-400 transition-colors font-['Sarabun',sans-serif]">
                            <td className="py-2.5 px-3 text-center align-middle bg-blue-100/50 border-r border-slate-200">
                              <div className="flex flex-col items-center justify-center gap-1.5 min-w-[120px]">
                                <label className="text-xs font-semibold text-blue-900 flex items-center gap-1">
                                  <Briefcase className="h-3.5 w-3.5" />
                                  <span>กลุ่มผลงาน</span>
                                </label>
                                <select
                                  value={editingDisbursementWorkRound}
                                  onChange={(e) => setEditingDisbursementWorkRound(e.target.value)}
                                  className="w-full bg-white border border-blue-300 rounded-lg px-2 py-1 text-xs text-center font-semibold text-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer"
                                >
                                  {disbursementWorkRoundOptions.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                  {editingDisbursementWorkRound && !disbursementWorkRoundOptions.includes(editingDisbursementWorkRound) && (
                                    <option value={editingDisbursementWorkRound}>{editingDisbursementWorkRound}</option>
                                  )}
                                </select>
                                <input
                                  type="text"
                                  value={editingDisbursementWorkRound}
                                  onChange={(e) => setEditingDisbursementWorkRound(e.target.value)}
                                  placeholder="หรือพิมพ์ชื่อกลุ่ม"
                                  className="w-full bg-white border border-blue-200 rounded-lg px-1.5 py-0.5 text-xs text-center text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 shadow-2xs"
                                />
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-800 text-center" style={{ fontSize: "inherit" }}>
                              <div className="flex items-center justify-center">
                                <select
                                  value={editingDisbursementPeriodNo}
                                  onChange={(e) => setEditingDisbursementPeriodNo(e.target.value)}
                                  className="w-full max-w-[120px] bg-white border border-blue-300 rounded-lg px-2 py-1 font-semibold text-slate-800 text-center focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer"
                                  style={{ fontSize: "inherit" }}
                                >
                                  {disbursementPeriodOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value} className="text-center">
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={editingDisbursementAmount}
                                onChange={(e) => setEditingDisbursementAmount(e.target.value)}
                                className="w-32 bg-white border border-blue-300 rounded-lg px-2 py-1 font-mono font-semibold text-slate-900 text-right focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs tabular-nums"
                                placeholder="0.00"
                                style={{ fontSize: "inherit" }}
                              />
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {(() => {
                                const editPct = getActualMonthlyPercentForPeriod(editingDisbursementPeriodNo, periodicRecords);
                                return editPct !== null ? (
                                  <div className="flex flex-col items-center justify-center gap-0.5">
                                    <span className="bg-emerald-50 text-emerald-900 border border-emerald-200/80 px-2.5 py-0.5 rounded-md font-mono font-bold tabular-nums">
                                      {editPct.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-normal whitespace-nowrap leading-none">(จากตารางแผนงาน)</span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 font-normal">-</span>
                                );
                              })()}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <select
                                value={editingDisbursementStatus}
                                onChange={(e) => setEditingDisbursementStatus(e.target.value as any)}
                                className="px-2.5 py-1 bg-white border border-blue-300 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs"
                                style={{ fontSize: "inherit" }}
                              >
                                <option value="เบิกจ่ายแล้ว">เบิกจ่ายแล้ว</option>
                                <option value="ยังไม่เบิกจ่าย">ยังไม่เบิกจ่าย</option>
                              </select>
                            </td>
                            <td className="py-2.5 px-4 text-left">
                              <input
                                type="text"
                                value={editingDisbursementRemarks}
                                onChange={(e) => setEditingDisbursementRemarks(e.target.value)}
                                placeholder="หมายเหตุ/รายละเอียด..."
                                className="w-full bg-white border border-blue-300 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                                style={{ fontSize: "inherit" }}
                              />
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditDisbursement(originalIndex)}
                                  disabled={isSavingDisbursement || isLoading}
                                  title="บันทึกการแก้ไขงวดนี้"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer transition-colors disabled:opacity-50"
                                  style={{ fontSize: "inherit" }}
                                >
                                  {isSavingDisbursement ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Save className="h-3.5 w-3.5" />
                                  )}
                                  <span>บันทึก</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEditDisbursement}
                                  title="ยกเลิกการแก้ไข"
                                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                                  style={{ fontSize: "inherit" }}
                                >
                                  <X className="h-3.5 w-3.5" />
                                  <span>ยกเลิก</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={`row-${originalIndex}`} className="hover:bg-slate-50/70 transition-colors font-['Sarabun',sans-serif]">
                            {rowSpan > 0 ? (
                              <td
                                rowSpan={rowSpan}
                                className="py-3 px-3 align-middle text-center font-medium text-slate-800 bg-slate-50/70 border-r border-slate-200/90"
                              >
                                <div className="flex flex-col items-center justify-center gap-1.5">
                                  <span
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50/90 text-blue-900 border border-blue-200/90 font-semibold shadow-2xs font-['Sarabun',sans-serif]"
                                    style={{ fontSize: "inherit" }}
                                  >
                                    <Briefcase className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                    <span>{workRoundLabel}</span>
                                  </span>
                                  {stats.totalCount > 1 && (
                                    <span
                                      className="text-slate-500 font-medium font-['Sarabun',sans-serif]"
                                      style={{ fontSize: `${Math.max(10, Math.round(disbursementFontSize * 0.8))}px` }}
                                    >
                                      ({stats.totalCount} งวด)
                                    </span>
                                  )}
                                </div>
                              </td>
                            ) : null}
                            <td className="py-2.5 px-3 text-center" style={{ fontSize: "inherit" }}>
                              <div className="flex items-center justify-center">
                                <span className="bg-slate-100/90 text-slate-800 px-3 py-1 rounded-lg border border-slate-200/90 inline-block font-semibold text-center font-['Sarabun',sans-serif]">
                                  งวดที่ {d.periodNo}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-right font-['Sarabun',sans-serif]">
                              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                                {d.amount ? Number(d.amount).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
                              </span>
                              <span className="ml-1.5 text-slate-600 font-normal font-['Sarabun',sans-serif]">บาท</span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-['Sarabun',sans-serif]">
                              {(() => {
                                const periodPct = getActualMonthlyPercentForPeriod(d.periodNo, periodicRecords);
                                return periodPct !== null ? (
                                  <span className="bg-emerald-50 text-emerald-900 border border-emerald-200/80 px-2.5 py-0.5 rounded-md font-mono tabular-nums font-semibold">
                                    {periodPct.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-normal">-</span>
                                );
                              })()}
                            </td>
                            <td className="py-2.5 px-3 text-center font-['Sarabun',sans-serif]">
                              {d.status === "เบิกจ่ายแล้ว" ? (
                                <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-900 border border-emerald-200/80 px-3 py-1 rounded-full text-[0.92em] font-semibold">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                  <span>เบิกจ่ายแล้ว</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-950 border border-amber-200/80 px-3 py-1 rounded-full text-[0.92em] font-semibold">
                                  <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                  <span>ยังไม่เบิกจ่าย</span>
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-left text-slate-700 font-normal font-['Sarabun',sans-serif] leading-relaxed">
                              {d.remarks && d.remarks !== "-" ? d.remarks : <span className="text-slate-400 font-normal">-</span>}
                            </td>
                            <td className="py-2.5 px-3 text-center font-['Sarabun',sans-serif]">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditDisbursement(originalIndex, d)}
                                  title="แก้ไขงวดนี้"
                                  className="bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer shadow-2xs font-['Sarabun',sans-serif]"
                                  style={{ fontSize: "inherit" }}
                                >
                                  <Pencil className="h-3.5 w-3.5 text-blue-600" />
                                  <span>แก้ไข</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setItemToDelete({
                                      type: "disbursement",
                                      index: originalIndex,
                                      title: "ยืนยันการลบรายการงวดเบิกจ่าย",
                                      description: `งวดที่ ${d.periodNo} - จำนวนเงิน ${Number(d.amount).toLocaleString("th-TH")} บาท (${d.status})`,
                                    })
                                  }
                                  title="ลบรายการเบิกจ่ายนี้"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );

                        // If not the last row in this workRound group, just return the main row
                        if (!isLastInGroup) {
                          return mainRow;
                        }

                        // Subtotal summary row for the workRound group
                        const subtotalRow = (
                          <tr
                            key={`subtotal-${workRoundLabel}-${idx}`}
                            className="bg-blue-50/40 border-y border-blue-200/70 font-['Sarabun',sans-serif] transition-colors"
                          >
                            {isAnyRowEditing && (
                              <td className="py-2.5 px-3 text-center align-middle bg-blue-100/50 border-r border-slate-200 text-blue-900 font-semibold">
                                <span>รวม</span>
                              </td>
                            )}
                            <td className="py-2.5 px-3 text-center" style={{ fontSize: "inherit" }}>
                              <div className="flex items-center justify-center">
                                <span className="bg-blue-50 text-blue-950 px-3 py-1 rounded-lg border border-blue-200/80 inline-flex items-center justify-center gap-1.5 font-semibold whitespace-nowrap shadow-2xs">
                                  <Coins className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                  <span>รวม ({stats.totalCount} งวด)</span>
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <span className="font-mono font-bold text-blue-950 tabular-nums">
                                {stats.totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className="ml-1.5 text-slate-600 font-normal font-['Sarabun',sans-serif]">บาท</span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-['Sarabun',sans-serif]">
                              {stats.hasAnyPercent ? (
                                <span className="bg-blue-100/70 text-blue-950 border border-blue-200/90 px-2.5 py-0.5 rounded-md font-mono tabular-nums font-bold">
                                  {stats.totalActualPercent.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                </span>
                              ) : (
                                <span className="text-slate-400 font-normal">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {stats.disbursedCount === stats.totalCount ? (
                                <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-900 border border-emerald-200/80 px-3 py-1 rounded-full text-[0.92em] font-semibold">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                  <span>เบิกจ่ายครบแล้ว ({stats.totalCount} งวด)</span>
                                </span>
                              ) : stats.disbursedCount === 0 ? (
                                <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-950 border border-amber-200/80 px-3 py-1 rounded-full text-[0.92em] font-semibold">
                                  <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                  <span>ยังไม่เบิกจ่าย ({stats.totalCount} งวด)</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 bg-sky-50 text-sky-950 border border-sky-200/80 px-3 py-1 rounded-full text-[0.92em] font-semibold">
                                  <Clock className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                                  <span>
                                    เบิกแล้ว {stats.disbursedCount}/{stats.totalCount} งวด ({Math.round((stats.disbursedAmount / (stats.totalAmount || 1)) * 100)}%)
                                  </span>
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-slate-700">
                              {stats.disbursedCount > 0 && stats.disbursedCount < stats.totalCount ? (
                                <span className="text-blue-950 font-medium">
                                  เบิกแล้ว {stats.disbursedAmount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ. (คงเหลือ {(stats.totalAmount - stats.disbursedAmount).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.)
                                </span>
                              ) : (
                                <span className="text-blue-900 font-semibold">รวมยอดส่งมอบ {workRoundLabel}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center text-slate-400 font-normal">
                              -
                            </td>
                          </tr>
                        );

                        return (
                          <React.Fragment key={`group-item-${idx}`}>
                            {mainRow}
                            {subtotalRow}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 8. แผนที่ตำแหน่งที่ตั้งโครงการ (Project Location Map) */}
          <ProjectMapSection project={project} onUpdateMetadata={onUpdateMetadata} onCheckFirebaseConnection={onCheckFirebaseConnection} />

          {/* 9. อัลบั้มภาพถ่ายความก้าวหน้าโครงการในสนาม (Progress Photos) */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-50 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Camera className="h-4.5 w-4.5 text-indigo-500" />
                <span>อัลบั้มภาพถ่ายความก้าวหน้าโครงการในสนาม (Progress Photos)</span>
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono font-bold bg-indigo-50 px-2 py-1 rounded text-indigo-600">
                  {project.photos?.length || 0} รูปภาพ
                </span>

                {project.photos && project.photos.length > 1 && (
                  <span
                    className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/80 select-none"
                    title="สามารถใช้เมาส์คลิกค้างแล้วลากการ์ดรูปภาพเพื่อสลับลำดับได้ทันที"
                  >
                    <GripVertical className="h-3.5 w-3.5 text-indigo-500" />
                    <span>ลากรูปเพื่อสลับตำแหน่ง</span>
                  </span>
                )}

                {project.photos && project.photos.length > 0 && (
                  <>
                    {/* Presentation Mode Button */}
                    <button
                      type="button"
                      onClick={() => setLightboxIndex(0)}
                      className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      title="เปิดโหมดนำเสนอภาพสไลด์แบบป๊อปอัพ"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>โหมดนำเสนอรูปภาพ</span>
                    </button>

                    {/* Toggle Horizontal / Grid View Button */}
                    {showAllPhotos ? (
                      <button
                        type="button"
                        onClick={() => setShowAllPhotos(false)}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                        title="แสดงผลแบบแถวเดียวแนวนอน"
                      >
                        <Rows className="h-3.5 w-3.5" />
                        <span>แสดงเป็นแถวเดียว</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowAllPhotos(true)}
                        className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                        title="แสดงรูปทั้งหมดเป็นตาราง"
                      >
                        <LayoutGrid className="h-3.5 w-3.5 text-indigo-600" />
                        <span>แสดงรูปทั้งหมด</span>
                      </button>
                    )}

                    {/* Scroll navigation arrows when in single row view */}
                    {!showAllPhotos && (
                      <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onClick={() => scrollPhotos("left")}
                          className="p-1 text-slate-600 hover:text-indigo-600 hover:bg-white rounded transition-colors cursor-pointer"
                          title="เลื่อนภาพไปทางซ้าย"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => scrollPhotos("right")}
                          className="p-1 text-slate-600 hover:text-indigo-600 hover:bg-white rounded transition-colors cursor-pointer"
                          title="เลื่อนภาพไปทางขวา"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                )}

                {!showAddPhotoForm && (
                  <button
                    type="button"
                    onClick={() => setShowAddPhotoForm(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>บันทึกรูปภาพ</span>
                  </button>
                )}
              </div>
            </div>

            {/* Add Photo Form */}
            {showAddPhotoForm && (
              <div className="bg-slate-50 p-4 rounded-xl space-y-4 border border-indigo-200/80 shadow-2xs animate-in fade-in duration-150">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                  <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Camera className="h-4 w-4 text-indigo-600" />
                    <span>อัปโหลดภาพถ่ายความคืบหน้าหน้างาน</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddPhotoForm(false);
                      setUploadStatus("");
                      setIsPhotoSelectorOpen(false);
                    }}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    ปิด
                  </button>
                </div>

                {uploadStatus && (
                  <div className="bg-emerald-50 border border-emerald-100/80 rounded-xl p-3 text-xs text-emerald-800 font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="flex-1">{uploadStatus}</span>
                  </div>
                )}

                {/* Main Upload Dropzone / Action Area */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* File Picker (Multiple files) */}
                  <label className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                    isUploadingToDrive
                      ? "bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed"
                      : "bg-white hover:bg-emerald-50/50 border-emerald-300 hover:border-emerald-500 text-slate-700 hover:text-emerald-900 shadow-2xs group"
                  }`}>
                    {isUploadingToDrive ? (
                      <Loader2 className="h-8 w-8 text-emerald-600 animate-spin mb-2" />
                    ) : (
                      <div className="p-3 bg-emerald-100 text-emerald-700 rounded-full mb-2 group-hover:scale-110 transition-transform">
                        <Upload className="h-6 w-6" />
                      </div>
                    )}
                    <span className="font-bold text-xs text-center text-slate-800 group-hover:text-emerald-800">
                      {isUploadingToDrive ? "กำลังอัปโหลดรูปภาพ..." : "คลิกเพื่อเลือกอัปโหลดรูปภาพ"}
                    </span>
                    <span className="text-[11px] text-slate-500 text-center mt-1">
                      (รองรับการเลือกหลายรูปพร้อมกันจากเครื่อง หรือ Google Drive)
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={isUploadingToDrive}
                      onChange={handleDriveFileUpload}
                      className="hidden"
                    />
                  </label>

                  {/* Sample Photos Button */}
                  <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-indigo-200 bg-white hover:bg-indigo-50/50 rounded-xl transition-all shadow-2xs group">
                    <button
                      type="button"
                      onClick={() => setIsPhotoSelectorOpen(!isPhotoSelectorOpen)}
                      className="flex flex-col items-center w-full cursor-pointer"
                    >
                      <div className="p-3 bg-indigo-100 text-indigo-700 rounded-full mb-2 group-hover:scale-110 transition-transform">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                      <span className="font-bold text-xs text-slate-800 group-hover:text-indigo-900">
                        {isPhotoSelectorOpen ? "ซ่อนรูปตัวอย่าง" : "เลือกรูปภาพตัวอย่างงานก่อสร้าง"}
                      </span>
                      <span className="text-[11px] text-slate-500 text-center mt-1">
                        (สำหรับทดสอบระบบภาพความก้าวหน้าสนาม)
                      </span>
                    </button>
                  </div>
                </div>

                {isPhotoSelectorOpen && (
                  <div className="bg-white p-3.5 rounded-xl border border-indigo-100 shadow-inner space-y-2">
                    <p className="text-[11px] font-bold text-slate-500 uppercase">คลิกรูปตัวอย่างที่ต้องการเพิ่มลงในอัลบั้ม:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {samplePhotos.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectSamplePhoto(item)}
                          className="group relative h-24 rounded-lg overflow-hidden border border-slate-200 text-left cursor-pointer hover:border-indigo-500 focus:outline-none transition-all hover:shadow-sm"
                        >
                          <img
                            src={item.url}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-slate-900/80 p-1.5 text-[10px] text-white font-bold truncate flex items-center justify-between">
                            <span>{item.title}</span>
                            <Plus className="h-3 w-3 text-indigo-300 shrink-0" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Photos Album View (Horizontal Row vs Grid) */}
            {!project.photos || project.photos.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">ยังไม่มีรูปถ่ายความก้าวหน้าระบุในระบบ</p>
            ) : (
              <div
                ref={photosScrollRef}
                className={
                  showAllPhotos
                    ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2"
                    : "flex overflow-x-auto gap-4 pt-2 pb-4 snap-x snap-mandatory focus:outline-none scroll-smooth"
                }
              >
                {project.photos.map((p, idx) => {
                  const isDraggingThis = draggedPhotoIndex === idx;
                  const isDragOverThis = dragOverPhotoIndex === idx && draggedPhotoIndex !== null && draggedPhotoIndex !== idx;

                  return (
                    <div
                      key={idx}
                      draggable={editingPhotoIndex !== idx}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", String(idx));
                        e.dataTransfer.effectAllowed = "move";
                        setDraggedPhotoIndex(idx);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverPhotoIndex !== idx) {
                          setDragOverPhotoIndex(idx);
                        }
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        if (dragOverPhotoIndex !== idx) {
                          setDragOverPhotoIndex(idx);
                        }
                      }}
                      onDragLeave={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        if (
                          e.clientX < rect.left ||
                          e.clientX >= rect.right ||
                          e.clientY < rect.top ||
                          e.clientY >= rect.bottom
                        ) {
                          if (dragOverPhotoIndex === idx) {
                            setDragOverPhotoIndex(null);
                          }
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const sourceStr = e.dataTransfer.getData("text/plain");
                        const fromIdx = draggedPhotoIndex !== null ? draggedPhotoIndex : parseInt(sourceStr, 10);
                        if (!isNaN(fromIdx) && fromIdx !== idx) {
                          handleMovePhoto(fromIdx, idx);
                        }
                        setDraggedPhotoIndex(null);
                        setDragOverPhotoIndex(null);
                      }}
                      onDragEnd={() => {
                        setDraggedPhotoIndex(null);
                        setDragOverPhotoIndex(null);
                      }}
                      className={`
                        ${showAllPhotos
                          ? "bg-white border rounded-xl overflow-hidden flex flex-col justify-between relative group transition-all duration-150"
                          : "w-[300px] sm:w-[360px] md:w-[400px] shrink-0 snap-start bg-white border rounded-xl overflow-hidden flex flex-col justify-between relative group transition-all duration-150"
                        }
                        ${editingPhotoIndex !== idx ? "cursor-grab active:cursor-grabbing" : ""}
                        ${isDraggingThis ? "opacity-35 scale-[0.98] border-dashed border-2 border-indigo-500 bg-indigo-50/40 shadow-inner" : ""}
                        ${isDragOverThis ? "ring-2 ring-indigo-600 border-indigo-600 scale-[1.02] shadow-xl bg-indigo-50/20 -translate-y-1" : ""}
                        ${!isDraggingThis && !isDragOverThis ? "border-slate-200/80 shadow-2xs hover:shadow-md hover:border-slate-300" : ""}
                      `}
                    >
                      {/* Drop Target Indicator Badge */}
                      {isDragOverThis && (
                        <div className="absolute inset-x-0 top-3 z-30 flex justify-center pointer-events-none animate-in fade-in zoom-in-95 duration-100">
                          <span className="bg-indigo-600 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-1.5 border border-white/20">
                            <GripVertical className="h-3 w-3" />
                            <span>สลับมาที่ตำแหน่ง #{idx + 1}</span>
                          </span>
                        </div>
                      )}

                      {/* Photo Container */}
                      <div
                        onClick={() => setLightboxIndex(idx)}
                        className="relative aspect-video w-full bg-slate-900 overflow-hidden cursor-pointer group/img"
                        title="คลิกเพื่อขยายดูรูปภาพ (หรือคลิกค้างแล้วลากเพื่อสลับตำแหน่ง)"
                      >
                        <img
                          src={p.imageUrl}
                          alt={p.remarks}
                          draggable={false}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300 pointer-events-none select-none"
                        />

                        {/* Photo Index & Drag Handle Badge */}
                        <span
                          className="absolute top-2 left-2 bg-slate-900/85 hover:bg-slate-900 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border border-white/15 flex items-center gap-1 shadow-sm select-none cursor-grab active:cursor-grabbing transition-colors"
                          title="คลิกค้างแล้วลากเพื่อเปลี่ยนตำแหน่งรูปภาพ (Drag & drop)"
                        >
                          <GripVertical className="h-3.5 w-3.5 text-indigo-400 group-hover:text-amber-400 transition-colors" />
                          <span>#{idx + 1}</span>
                        </span>

                        {/* Hover presentation hint badge */}
                        <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <span className="bg-slate-900/90 text-white text-xs font-bold px-3 py-1.5 rounded-xl border border-white/20 backdrop-blur-md flex items-center gap-1.5 shadow-lg">
                            <Camera className="h-3.5 w-3.5 text-amber-400" />
                            <span>คลิกนำเสนอรูปนี้</span>
                          </span>
                        </div>

                        {/* Action buttons overlay (stop propagation so edit/delete/move won't trigger lightbox or drag) */}
                        <div
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="absolute top-2 right-2 flex items-center gap-1 bg-slate-900/75 backdrop-blur-xs p-1 rounded-lg border border-white/10 opacity-90 group-hover:opacity-100 transition-opacity z-10"
                        >
                          {/* Move Left */}
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMovePhoto(idx, idx - 1)}
                            title="เลื่อนสลับรูปไปทางซ้าย"
                            className="p-1 text-white/80 hover:text-white disabled:opacity-30 disabled:hover:text-white/80 hover:bg-white/20 rounded transition-colors cursor-pointer"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>

                          {/* Move Right */}
                          <button
                            type="button"
                            disabled={idx === (project.photos?.length || 0) - 1}
                            onClick={() => handleMovePhoto(idx, idx + 1)}
                            title="เลื่อนสลับรูปไปทางขวา"
                            className="p-1 text-white/80 hover:text-white disabled:opacity-30 disabled:hover:text-white/80 hover:bg-white/20 rounded transition-colors cursor-pointer"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>

                          <span className="w-px h-3 bg-white/20 mx-0.5"></span>

                          {/* Edit Remarks */}
                          <button
                            type="button"
                            onClick={() => handleStartEditPhoto(idx, p)}
                            title="แก้ไขหมายเหตุ/คำอธิบายภาพ"
                            className="p-1 text-indigo-200 hover:text-white hover:bg-indigo-600/60 rounded transition-colors cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() =>
                              setItemToDelete({
                                type: "photo",
                                index: idx,
                                title: "ยืนยันการลบรูปภาพสนาม",
                                description: p.remarks || "รูปภาพผลงานในอัลบั้ม",
                              })
                            }
                            title="ลบรูปภาพนี้ออกจากอัลบั้ม"
                            className="p-1 text-rose-300 hover:text-white hover:bg-rose-600/80 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Card Content & Edit mode */}
                      <div
                        onMouseDown={(e) => {
                          if (editingPhotoIndex === idx) e.stopPropagation();
                        }}
                        className="p-3.5 space-y-2 flex-1 flex flex-col justify-between"
                      >
                        {editingPhotoIndex === idx ? (
                          <div className="space-y-2 animate-in fade-in duration-150">
                            <div>
                              <label className="text-[10px] font-bold text-indigo-600 uppercase">แก้ไขคำอธิบายรูปภาพ</label>
                              <input
                                type="text"
                                value={editingPhotoRemarks}
                                onChange={(e) => setEditingPhotoRemarks(e.target.value)}
                                placeholder="คำอธิบายภาพ..."
                                className="w-full text-xs bg-indigo-50/50 border border-indigo-200 rounded-lg p-1.5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 font-medium"
                                autoFocus
                              />
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">วันที่บันทึกภาพ</label>
                                {editingPhotoDate ? (
                                  <button
                                    type="button"
                                    onClick={() => setEditingPhotoDate("")}
                                    className="text-[10px] text-rose-500 hover:text-rose-700 font-bold flex items-center gap-0.5 hover:underline cursor-pointer transition-colors"
                                    title="ล้างวันที่บันทึกภาพนี้ (ไม่ต้องระบุวันที่)"
                                  >
                                    <X className="h-3 w-3" />
                                    <span>ล้างวันที่</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setEditingPhotoDate(new Date().toLocaleDateString("en-CA"))}
                                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer transition-colors"
                                    title="ตั้งเป็นวันที่ปัจจุบัน"
                                  >
                                    + ใส่วันนี้
                                  </button>
                                )}
                              </div>
                              <div className="relative flex items-center">
                                <input
                                  type="date"
                                  value={editingPhotoDate}
                                  onChange={(e) => setEditingPhotoDate(e.target.value)}
                                  className={`w-full text-xs bg-slate-50 border rounded-lg p-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all ${
                                    editingPhotoDate ? "border-slate-300 pr-7" : "border-slate-200 text-slate-400"
                                  }`}
                                />
                                {editingPhotoDate && (
                                  <button
                                    type="button"
                                    onClick={() => setEditingPhotoDate("")}
                                    className="absolute right-2 text-slate-400 hover:text-rose-600 p-0.5 rounded cursor-pointer transition-colors"
                                    title="ล้างวันที่ (Clear Date)"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              {!editingPhotoDate && (
                                <p className="text-[9px] text-slate-400 mt-0.5 italic">ไม่ระบุวันที่บันทึกภาพ (-)</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 pt-1 justify-end">
                              <button
                                type="button"
                                onClick={handleCancelEditPhoto}
                                className="text-[11px] font-medium text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                              >
                                ยกเลิก
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEditPhoto(idx)}
                                className="text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                              >
                                <Save className="h-3 w-3" />
                                <span>บันทึก</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-1">
                              <div className="flex justify-between items-start gap-2">
                                <p
                                  onClick={() => setLightboxIndex(idx)}
                                  className="text-xs font-semibold text-slate-800 leading-relaxed group-hover:text-indigo-950 transition-colors flex-1 cursor-pointer"
                                  title="คลิกเพื่อนำเสนอรูปภาพ"
                                >
                                  {p.remarks || "ไม่มีคำอธิบายภาพ"}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditPhoto(idx, p)}
                                  title="แก้ไขหมายเหตุ"
                                  className="text-slate-400 hover:text-indigo-600 p-0.5 rounded transition-colors cursor-pointer shrink-0"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </div>
                            </div>

                            {/* Footer info & reorder bar */}
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                              <span className="text-slate-400 font-mono flex items-center gap-1">
                                <span>📅</span>
                                <span>{formatDateDisplay(p.date)}</span>
                              </span>

                              <div className="flex items-center gap-2">
                                {/* Direct Reorder Buttons on Footer */}
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  className="flex items-center gap-0.5 bg-slate-100 rounded-md p-0.5"
                                >
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => handleMovePhoto(idx, idx - 1)}
                                    title="ย้ายไปทางซ้าย"
                                    className="p-0.5 text-slate-500 hover:text-indigo-600 disabled:opacity-30 cursor-pointer"
                                  >
                                    <ChevronLeft className="h-3 w-3" />
                                  </button>
                                  <span className="text-[9px] font-bold text-slate-400 px-0.5 flex items-center gap-0.5" title="ตำแหน่งรูปภาพ (สามารถลากรูปเพื่อสลับลำดับได้)">
                                    <GripVertical className="h-2.5 w-2.5 text-indigo-400" />
                                    <span>{idx + 1}</span>
                                  </span>
                                  <button
                                    type="button"
                                    disabled={idx === (project.photos?.length || 0) - 1}
                                    onClick={() => handleMovePhoto(idx, idx + 1)}
                                    title="ย้ายไปทางขวา"
                                    className="p-0.5 text-slate-500 hover:text-indigo-600 disabled:opacity-30 cursor-pointer"
                                  >
                                    <ChevronRight className="h-3 w-3" />
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxIndex(idx);
                                  }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  className="font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 transition-colors cursor-pointer"
                                >
                                  <span>ขยายดูรูป</span>
                                  <ExternalLink className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Photo Presentation Lightbox Modal */}
          {lightboxIndex !== null && project.photos && project.photos.length > 0 && (
            <PhotoLightboxModal
              photos={project.photos}
              currentIndex={lightboxIndex}
              projectName={project.projectName || project.locationName || "โครงการก่อสร้าง"}
              onClose={() => setLightboxIndex(null)}
              onSelectIndex={(newIdx) => setLightboxIndex(newIdx)}
            />
          )}

          {/* 10. บันทึกความคืบหน้าหน้างาน (Updates) */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-50 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FileText className="h-4.5 w-4.5 text-rose-500" />
                <span>บันทึกความคืบหน้าหน้างาน (Updates)</span>
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                  {displayUpdates.length} บันทึก
                </span>
                {!showAddUpdateForm ? (
                  <button
                    type="button"
                    onClick={() => {
                      const session = getUserSession();
                      const currentName = session?.name || session?.username || (isAdmin ? "ผู้ดูแลระบบ" : "ผู้ใช้งานระบบ");
                      setUpdateReporter(currentName);
                      setUpdateDate(new Date().toLocaleDateString("en-CA"));
                      setShowAddUpdateForm(true);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>บันทึก</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddUpdateForm(false);
                      setUpdateDetails("");
                      setUpdateDate("");
                    }}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>ปิด</span>
                  </button>
                )}
              </div>
            </div>

            {/* Add Log update form */}
            {showAddUpdateForm && (
              <form onSubmit={handleAddUpdateSubmit} className="bg-slate-50 p-4 rounded-xl space-y-3 border border-slate-100 animate-in fade-in duration-150">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-emerald-600" />
                    <span>เขียนรายงานความคืบหน้า/ปัญหา</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 self-start sm:self-auto">
                    <div className="flex items-center gap-1.5">
                      <label className="text-[11px] font-bold text-slate-700 whitespace-nowrap">วันที่:</label>
                      <input
                        type="date"
                        value={updateDate}
                        onChange={(e) => setUpdateDate(e.target.value)}
                        className="px-2.5 py-1 text-xs border border-slate-200 focus:border-emerald-500 rounded-lg bg-white font-bold text-slate-800 focus:ring-1 focus:ring-emerald-500 outline-none shadow-2xs font-mono transition-all"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-[9px] font-bold text-slate-600 whitespace-nowrap">ผู้บันทึก:</label>
                      <input
                        type="text"
                        value={updateReporter !== "" ? updateReporter : (getUserSession()?.name || getUserSession()?.username || (isAdmin ? "ผู้ดูแลระบบ" : "ผู้ใช้งานระบบ"))}
                        onChange={(e) => setUpdateReporter(e.target.value)}
                        placeholder="ชื่อแสดงผล (Full Name)"
                        className="px-2.5 py-1 text-xs border border-slate-200 focus:border-emerald-500 rounded-lg bg-white font-bold text-slate-800 focus:ring-1 focus:ring-emerald-500 outline-none w-40 sm:w-52 shadow-2xs transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <textarea
                    required
                    rows={3}
                    placeholder="ระบุข้อความอัปเดตความคืบหน้า ปัญหา หรืออุปสรรคในสนาม..."
                    value={updateDetails}
                    onChange={(e) => setUpdateDetails(e.target.value)}
                    className="w-full p-3 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none transition-all shadow-2xs"
                  ></textarea>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setUpdateDetails("");
                        setShowAddUpdateForm(false);
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 px-3 py-1.5 rounded-lg transition-colors cursor-pointer font-medium"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || !updateDetails.trim()}
                      className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white rounded-lg px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>บันทึก</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Log stream history list grouped by Period (งวด) and Date (วันที่) */}
            {displayUpdates.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">ยังไม่มีรายงานความคืบหน้าสนามส่งเข้ามา</p>
            ) : (
              <div className="space-y-5 max-h-[500px] overflow-y-auto pr-1">
                {(() => {
                  const periodicRecordsForCheck = (project.periodicProgress && project.periodicProgress.length > 0)
                    ? project.periodicProgress
                    : getDefaultPeriodicProgress(project);

                  const periodGroups = groupUpdatesByPeriodAndDate(displayUpdates, periodicRecordsForCheck);

                  return periodGroups.map((group, pIdx) => {
                    const totalPeriodItems = group.dateGroups.reduce((acc, d) => acc + d.items.length, 0);

                    return (
                      <div key={`pgrp_${group.periodNo || 'unassigned'}_${pIdx}`} className="bg-slate-50/90 border border-slate-200 rounded-2xl p-4 space-y-4 shadow-2xs">
                        {/* Period Header Banner */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="bg-emerald-600 text-white font-extrabold text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-2xs">
                              <Calendar className="h-3.5 w-3.5" />
                              <span>{group.periodLabel}</span>
                            </span>
                          </div>
                          <span className="text-[11px] font-extrabold text-slate-600 bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
                            {totalPeriodItems} รายการบันทึก
                          </span>
                        </div>

                        {/* Date Groups inside this Period */}
                        <div className="space-y-4 pl-1 sm:pl-2">
                          {group.dateGroups.map((dateGrp) => (
                            <div key={`dtgrp_${dateGrp.date}`} className="space-y-2.5">
                              {/* Date Sub-header */}
                              <div className="flex items-center gap-2">
                                <span className="bg-slate-800 text-white font-mono font-bold text-xs px-2.5 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
                                  <Clock className="h-3 w-3 text-emerald-400" />
                                  <span>วันที่ {dateGrp.formattedDate}</span>
                                </span>
                                <div className="h-[1px] bg-slate-200 flex-1"></div>
                              </div>

                              {/* Items for this date */}
                              <div className="space-y-2.5 pl-3 border-l-2 border-emerald-400/80">
                                {dateGrp.items.map(({ update, originalIndex }) => {
                                  const idx = originalIndex;
                                  const isEditing = editingUpdateIndex === idx;

                                  if (isEditing) {
                                    return (
                                      <div key={idx} className="bg-amber-50/80 p-3.5 rounded-xl border border-amber-300 space-y-3 animate-in fade-in duration-150">
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 pb-2">
                                          <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                                            <Pencil className="h-3.5 w-3.5 text-amber-600" />
                                            <span>แก้ไขบันทึกความคืบหน้า #{idx + 1}</span>
                                          </span>
                                          <div className="flex flex-wrap items-center gap-3">
                                            <div className="flex items-center gap-1.5">
                                              <label className="text-[11px] font-bold text-slate-700">วันที่:</label>
                                              <input
                                                type="date"
                                                value={editingUpdateDate}
                                                onChange={(e) => setEditingUpdateDate(e.target.value)}
                                                className="px-2 py-1 text-xs border border-slate-300 rounded-md bg-white font-mono font-bold text-slate-800 focus:ring-1 focus:ring-emerald-500 outline-none shadow-2xs"
                                              />
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                              <label className="text-[11px] font-bold text-slate-700">ผู้บันทึก:</label>
                                              <input
                                                type="text"
                                                value={editingUpdateReporter}
                                                onChange={(e) => setEditingUpdateReporter(e.target.value)}
                                                className="px-2 py-1 text-xs border border-slate-300 rounded-md bg-white font-medium text-slate-800 focus:ring-1 focus:ring-emerald-500 outline-none w-36 shadow-2xs"
                                              />
                                            </div>
                                          </div>
                                        </div>

                                        <div>
                                          <textarea
                                            rows={3}
                                            value={editingUpdateDetails}
                                            onChange={(e) => setEditingUpdateDetails(e.target.value)}
                                            className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none resize-none shadow-2xs text-slate-800 font-medium"
                                            placeholder="ระบุข้อความอัปเดตความคืบหน้า..."
                                          />
                                        </div>

                                        <div className="flex items-center justify-end gap-2 pt-1">
                                          <button
                                            type="button"
                                            onClick={() => setEditingUpdateIndex(null)}
                                            className="px-3 py-1.5 text-xs text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors cursor-pointer font-medium"
                                          >
                                            ยกเลิก
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleSaveEditUpdate(idx)}
                                            className="px-3.5 py-1.5 text-xs text-white bg-emerald-600 hover:bg-emerald-700 font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                                          >
                                            <Check className="h-3.5 w-3.5" />
                                            <span>บันทึกการแก้ไข</span>
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs hover:border-emerald-300 transition-colors space-y-2">
                                      <div className="flex flex-wrap justify-between items-center gap-2">
                                        <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                          ผู้บันทึก: {update.reporter}
                                        </span>
                                        {onUpdateUpdates && (
                                          <div className="flex items-center gap-1">
                                            <button
                                              type="button"
                                              onClick={() => handleStartEditUpdate(idx, update)}
                                              title="แก้ไขบันทึกรายงานความคืบหน้านี้"
                                              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-2 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold"
                                            >
                                              <Pencil className="h-3.5 w-3.5" />
                                              <span>แก้ไข</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setItemToDelete({
                                                  type: "update",
                                                  index: idx,
                                                  title: "ยืนยันการลบบันทึกรายงานความคืบหน้า",
                                                  description: `${formatDateDisplayWithPeriod(update.date, periodicRecordsForCheck)} (โดย ${update.reporter}): ${update.details}`,
                                                })
                                              }
                                              title="ลบบันทึกรายงานความคืบหน้านี้"
                                              className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                      <p className="text-xs text-slate-700 font-medium leading-relaxed whitespace-pre-line">
                                        {update.details}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

        </div>
      )}

      {/* Group Manager Modal for Deliverables Grouping (Disbursements) */}
      {showGroupManagerModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[100] flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150 font-['Sarabun',sans-serif]">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150 text-slate-900 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl shrink-0 border border-indigo-100">
                  <FolderKanban className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-base sm:text-lg">จัดกลุ่มผลงานการส่งมอบงาน</h3>
                    <span className="bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-indigo-200/80">
                      Admin / Owner
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-normal">ย้ายงวดที่ 1, 2, 3 หรืองวดอื่นๆ ไปอยู่ในกลุ่มผลงาน (ครั้งที่) ที่ต้องการได้อย่างอิสระ</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGroupManagerModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Quick Presets */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>จัดกลุ่มด่วน (Presets):</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyPresetGroupPattern("default4")}
                  className="text-xs px-2.5 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700 rounded-lg font-semibold transition-all shadow-2xs cursor-pointer flex items-center gap-1"
                >
                  <span>⚡ จัดกลุ่มมาตรฐาน (งวด 1-3 → ครั้งที่ 1, งวด 4 → ครั้งที่ 2)</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetGroupPattern("oneToOne")}
                  className="text-xs px-2.5 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700 rounded-lg font-semibold transition-all shadow-2xs cursor-pointer flex items-center gap-1"
                >
                  <span>⚡ แยก 1 งวด ต่อ 1 ครั้ง</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetGroupPattern("allOne")}
                  className="text-xs px-2.5 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700 rounded-lg font-semibold transition-all shadow-2xs cursor-pointer flex items-center gap-1"
                >
                  <span>⚡ รวมทุกงวดเป็น ครั้งที่ 1</span>
                </button>
              </div>
            </div>

            {/* Table of periods */}
            <div className="overflow-y-auto flex-1 border border-slate-200/90 rounded-xl max-h-64 shadow-2xs font-['Sarabun',sans-serif]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-800 font-semibold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 w-28 text-center font-semibold">งวดที่</th>
                    <th className="py-2.5 px-3 text-right font-semibold">จำนวนเงิน</th>
                    <th className="py-2.5 px-3 text-center font-semibold">สถานะ</th>
                    <th className="py-2.5 px-3 font-semibold">กลุ่มผลงาน (เลือกครั้งที่)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {(() => {
                    const parsePeriodNum = (val: string | number | undefined): number => {
                      if (val === undefined || val === null) return 999999;
                      if (typeof val === "number") return isNaN(val) ? 999999 : val;
                      const match = String(val).match(/\d+(\.\d+)?/);
                      return match ? parseFloat(match[0]) : 999999;
                    };

                    const modalList = (project.disbursements || []).map((d, origIdx) => ({
                      d,
                      origIdx,
                      periodNum: parsePeriodNum(d.periodNo),
                    }));

                    modalList.sort((a, b) => a.periodNum - b.periodNum);

                    return modalList.map(({ d, origIdx }) => {
                      const currentVal = tempWorkRounds[origIdx] || getDisbursementWorkRound(d, origIdx, project.disbursements || []);
                      return (
                        <tr key={origIdx} className="hover:bg-slate-50/60 transition-colors font-['Sarabun',sans-serif]">
                          <td className="py-2.5 px-3 text-center" style={{ fontSize: "inherit" }}>
                            <div className="flex items-center justify-center">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-semibold text-center border border-slate-200">
                                งวดที่ {d.periodNo}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="font-mono font-semibold text-slate-900 tabular-nums">
                              {d.amount ? Number(d.amount).toLocaleString("th-TH") : "0.00"}
                            </span>
                            <span className="ml-1 text-slate-600 font-normal">บาท</span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${d.status === "เบิกจ่ายแล้ว" ? "bg-emerald-50 text-emerald-900 border border-emerald-200" : "bg-amber-50 text-amber-950 border border-amber-200"}`}>
                              {d.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <select
                                value={currentVal}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setTempWorkRounds((prev) => ({ ...prev, [origIdx]: val }));
                                }}
                                className="px-2.5 py-1 text-xs bg-white border border-indigo-200 rounded-lg font-semibold text-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs cursor-pointer"
                              >
                                {disbursementWorkRoundOptions.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                                {currentVal && !disbursementWorkRoundOptions.includes(currentVal) && (
                                  <option value={currentVal}>{currentVal}</option>
                                )}
                              </select>
                              <input
                                type="text"
                                value={currentVal}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setTempWorkRounds((prev) => ({ ...prev, [origIdx]: val }));
                                }}
                                placeholder="หรือพิมพ์ชื่อกลุ่ม"
                                className="w-28 px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>

            {/* Real-time Group Preview Summaries */}
            {(() => {
              const groupSums: { [group: string]: { count: number; total: number; periods: (string | number)[] } } = {};
              (project.disbursements || []).forEach((d, idx) => {
                const g = tempWorkRounds[idx] || getDisbursementWorkRound(d, idx, project.disbursements || []);
                if (!groupSums[g]) {
                  groupSums[g] = { count: 0, total: 0, periods: [] };
                }
                groupSums[g].count += 1;
                groupSums[g].total += (d.amount || 0);
                groupSums[g].periods.push(d.periodNo);
              });

              return (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5 text-indigo-600" />
                    <span>สรุปผลการจัดกลุ่มที่จะบันทึก:</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(groupSums).map(([gName, data]) => (
                      <div key={gName} className="p-2.5 bg-indigo-50/70 border border-indigo-100 rounded-xl">
                        <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                          <span>{gName}</span>
                          <span className="text-[10px] bg-indigo-200/70 text-indigo-800 px-1.5 py-0.2 rounded-full font-mono">
                            {data.count} งวด
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                          งวดที่ {data.periods.join(", ")}
                        </div>
                        <div className="text-xs font-mono font-bold text-slate-800 mt-1">
                          {data.total.toLocaleString("th-TH")} บาท
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowGroupManagerModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSavingGroupManager || isLoading}
                onClick={handleSaveGroupManager}
                className="px-4.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition-colors cursor-pointer shadow-md flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingGroupManager ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span>บันทึกการจัดกลุ่มผลงาน</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contract Extension (ขยายอายุสัญญา) Modal */}
      {showExtensionModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-150 text-slate-900 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-2xl">
                  <CalendarPlus className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-lg">บันทึกการขยายอายุสัญญา</h3>
                  <p className="text-xs text-slate-500">ปรับปรุงวันสิ้นสุดสัญญาใหม่และบันทึกประวัติการขยายเวลา</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExtensionModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddExtensionSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">ขยายสัญญาครั้งที่</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={extensionRound}
                    onChange={(e) => setExtensionRound(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400 font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">จำนวนวันขยายเพิ่ม (วัน)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={extensionDays}
                    onChange={(e) => handleExtensionDaysChange(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-indigo-50/50 border border-indigo-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400 font-mono font-black text-indigo-900"
                  />
                </div>
              </div>

              {/* Quick Days Selector Chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 mr-1">เลือกด่วน:</span>
                {["15", "30", "45", "60", "90", "120", "180"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleExtensionDaysChange(d)}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                      extensionDays === d
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-slate-50 hover:bg-indigo-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    +{d} วัน
                  </button>
                ))}
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>วันสิ้นสุดสัญญาเดิม:</span>
                  <span className="font-bold text-slate-800 font-mono">{formatDateDisplay(project.endDate)}</span>
                </div>
                <div className="flex justify-between items-center text-indigo-900 pt-1 border-t border-slate-200/60 font-semibold">
                  <span>วันสิ้นสุดสัญญาใหม่:</span>
                  <span className="font-extrabold text-indigo-700 font-mono text-sm">{formatDateDisplay(newEndDate)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">วันสิ้นสุดสัญญาใหม่ (แก้ไขได้)</label>
                  <input
                    type="date"
                    required
                    value={newEndDate}
                    onChange={(e) => handleNewEndDateChange(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">วันที่อนุมัติขยายเวลา</label>
                  <input
                    type="date"
                    value={extensionApprovedDate}
                    onChange={(e) => setExtensionApprovedDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase">เลขที่หนังสืออนุมัติ / สัญญาแก้ไขเพิ่มเติม</label>
                <input
                  type="text"
                  placeholder="เช่น มท 0808.2/ว 1234 หรือ สัญญาแก้ไขเพิ่มเติม ลว. 15 ม.ค. 68"
                  value={extensionDocNumber}
                  onChange={(e) => setExtensionDocNumber(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase">เหตุผลความจำเป็น / รายละเอียดการขยายเวลา</label>
                <textarea
                  rows={2}
                  placeholder="ระบุเหตุผล เช่น ได้รับผลกระทบจากอุทกภัย, การปรับแบบรูปรายการ, ติดปัญหาการเวนคืน ฯลฯ"
                  value={extensionReason}
                  onChange={(e) => setExtensionReason(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowExtensionModal(false)}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSavingExtension}
                  className="px-5 py-2 text-xs sm:text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition-colors cursor-pointer shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingExtension ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CalendarCheck className="h-4 w-4" />
                  )}
                  <span>บันทึกการขยายสัญญา</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Liquidated Damages & Fine Setup Modal */}
      {showPenaltyConfigModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
                  <Scale className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base sm:text-lg">ตั้งค่าการคิดค่าปรับและงด/ลดค่าปรับ</h3>
                  <p className="text-xs text-slate-500">กำหนดอัตราค่าปรับต่อวันและข้อยกเว้นตามระเบียบ พ.ร.บ. พัสดุฯ</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPenaltyConfigModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSavePenaltyConfig} className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                    <span>วันส่งมอบจริง (Actual Delivery Date)</span>
                  </label>
                  {actualDeliveryDateInput ? (
                    <button
                      type="button"
                      onClick={() => setActualDeliveryDateInput("")}
                      className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                    >
                      ล้างวันที่
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActualDeliveryDateInput(new Date().toLocaleDateString("en-CA"))}
                      className="text-[10px] text-indigo-600 hover:underline font-bold cursor-pointer"
                    >
                      + วันนี้
                    </button>
                  )}
                </div>
                <input
                  type="date"
                  value={actualDeliveryDateInput}
                  onChange={(e) => setActualDeliveryDateInput(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400 font-mono"
                />
                <span className="text-[10px] text-slate-500">ระบุวันที่ผู้รับจ้างส่งมอบงานจริง (ใช้ในการคำนวณวันล่าช้าและค่าปรับตามสัญญา)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">อัตราค่าปรับต่อวัน (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={penaltyRateInput}
                    onChange={(e) => setPenaltyRateInput(e.target.value)}
                    placeholder="0.05"
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400 font-mono"
                  />
                  <span className="text-[10px] text-slate-500">ค่าเริ่มต้นงานก่อสร้างทั่วไปคือ 0.05% ต่อวัน (0.01 - 0.20%)</span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">ค่าปรับขั้นต่ำต่อวัน (บาท/วัน)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={customDailyFineInput}
                    onChange={(e) => setCustomDailyFineInput(e.target.value)}
                    placeholder="เช่น 100 หรือปล่อยว่าง"
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400 font-mono"
                  />
                  <span className="text-[10px] text-slate-500">หากงานมีอัตราขั้นต่ำ (เช่น 100 บาท/วัน) ให้ระบุที่นี่</span>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600 font-medium">วงเงินตามสัญญา:</span>
                  <span className="font-bold text-slate-800 font-mono">{formatCurrency(project.contractAmount || project.budget)}</span>
                </div>
                <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200 font-semibold text-indigo-900">
                  <span>ค่าปรับคำนวณเบื้องต้น:</span>
                  <span className="font-bold font-mono">
                    {(((project.contractAmount || project.budget) * (parseFloat(penaltyRateInput) || 0.05)) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} บ./วัน
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-teal-600" />
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">การงดหรือลดค่าปรับ (มาตรา 102)</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 uppercase">จำนวนวันที่ได้รับอนุมัติงด/ลดค่าปรับ</label>
                    <input
                      type="number"
                      min="0"
                      value={waivedDaysInput}
                      onChange={(e) => setWaivedDaysInput(e.target.value)}
                      placeholder="0"
                      className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-400 font-mono"
                    />
                    <span className="text-[10px] text-slate-500">จำนวนวันที่จะนำไปหักลบออกจากวันที่ล่าช้า</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 uppercase">สถานะการคิดค่าปรับทางสัญญา</label>
                    <select
                      value={penaltyStatusInput}
                      onChange={(e) => setPenaltyStatusInput(e.target.value as any)}
                      className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400"
                    >
                      <option value="accumulating">คิดค่าปรับสะสมปกติ (Accumulating)</option>
                      <option value="reserved">สงวนสิทธิ์การเรียกค่าปรับ (Reserved)</option>
                      <option value="under_review">อยู่ระหว่างพิจารณางด/ลดค่าปรับ (Under Review)</option>
                      <option value="waived">ได้รับอนุมัติงด/ลดค่าปรับแล้ว (Waived)</option>
                      <option value="none">ไม่มีการคิดค่าปรับ (None)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">เหตุผล / หนังสืออนุมัติงดลดค่าปรับ</label>
                  <textarea
                    rows={2}
                    value={waivedReasonInput}
                    onChange={(e) => setWaivedReasonInput(e.target.value)}
                    placeholder="เช่น อนุมัติตามมาตรา 102 จากเหตุอุทกภัย ตามหนังสือ มท 0808.2/ว 4567"
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-400 resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPenaltyConfigModal(false)}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSavingPenaltyConfig}
                  className="px-5 py-2 text-xs sm:text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition-colors cursor-pointer shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingPenaltyConfig ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>บันทึกการตั้งค่า</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Penalty Notice Documents Modal */}
      {showPenaltyDocsModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
                  <FileBadge2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base sm:text-lg">หนังสือและเอกสารบริหารสัญญา</h3>
                  <p className="text-xs text-slate-500">บันทึกหนังสือแจ้งสงวนสิทธิ์ค่าปรับ / หนังสือเตือนเร่งรัด / สัญญาแก้ไขเพิ่มเติม</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPenaltyDocsModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Existing Documents List */}
            {project.penaltyNoticeDocs && project.penaltyNoticeDocs.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  รายการหนังสือที่บันทึกแล้ว ({project.penaltyNoticeDocs.length} ฉบับ)
                </span>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {project.penaltyNoticeDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-start gap-2 text-xs"
                    >
                      <div className="space-y-0.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 font-mono">{doc.docNumber}</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-600 font-mono">{formatDateDisplay(doc.docDate)}</span>
                        </div>
                        <p className="font-semibold text-indigo-900">{doc.subject}</p>
                        {doc.details && <p className="text-slate-500 text-[11px]">{doc.details}</p>}
                        <span className="text-[10px] text-slate-500 block">ผู้ออกหนังสือ: {doc.issuer}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeletePenaltyDoc(doc.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                        title="ลบเอกสารนี้"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add New Notice Form */}
            <form onSubmit={handleAddPenaltyDoc} className="pt-3 border-t border-slate-100 space-y-3.5">
              <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="h-4 w-4 text-indigo-600" />
                <span>เพิ่มหนังสือราชการ / เอกสารใหม่</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">ประเภทเอกสาร</label>
                  <select
                    value={docTypeInput}
                    onChange={(e) => {
                      const val = e.target.value as PenaltyNoticeDoc["type"];
                      setDocTypeInput(val);
                      if (val === "penalty_reservation") setDocSubjectInput("แจ้งการสงวนสิทธิ์การเรียกค่าปรับตามสัญญา (มาตรา 102)");
                      else if (val === "fine_warning") setDocSubjectInput("หนังสือแจ้งการคิดค่าปรับรายวันและเร่งรัดงานตามสัญญา");
                      else if (val === "termination_warning") setDocSubjectInput("หนังสือแจ้งเตือนพิจารณาบอกเลิกสัญญาจ้าง (ค่าปรับเกิน 10%)");
                      else if (val === "waiver_request") setDocSubjectInput("หนังสือพิจารณางดหรือลดค่าปรับตามระเบียบฯ");
                      else if (val === "addendum") setDocSubjectInput("บันทึกข้อตกลงแก้ไขเพิ่มเติมสัญญาจ้าง");
                    }}
                    className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400"
                  >
                    <option value="penalty_reservation">หนังสือสงวนสิทธิ์การเรียกค่าปรับ (มาตรา 102)</option>
                    <option value="fine_warning">หนังสือแจ้งคิดค่าปรับรายวัน / เตือนเร่งรัด (Fine Warning)</option>
                    <option value="waiver_request">หนังสือพิจารณางดหรือลดค่าปรับ (Waiver / Mitigation)</option>
                    <option value="termination_warning">หนังสือแจ้งเตือนพิจารณาบอกเลิกสัญญา (Termination Warning)</option>
                    <option value="addendum">สัญญาแก้ไขเพิ่มเติม / บันทึกข้อตกลง (Addendum)</option>
                    <option value="other">เอกสารอื่น ๆ</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">เลขที่หนังสือ *</label>
                  <input
                    type="text"
                    required
                    value={docNumberInput}
                    onChange={(e) => setDocNumberInput(e.target.value)}
                    placeholder="เช่น มท 0808.2/ว 1234"
                    className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">ลงวันที่</label>
                  <input
                    type="date"
                    value={docDateInput}
                    onChange={(e) => setDocDateInput(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">ผู้ออกหนังสือ / หน่วยงาน</label>
                  <input
                    type="text"
                    value={docIssuerInput}
                    onChange={(e) => setDocIssuerInput(e.target.value)}
                    placeholder="ผู้ว่าจ้าง / เทศบาล"
                    className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase">ชื่อเรื่อง / หัวข้อหนังสือ *</label>
                <input
                  type="text"
                  required
                  value={docSubjectInput}
                  onChange={(e) => setDocSubjectInput(e.target.value)}
                  placeholder="เช่น แจ้งการสงวนสิทธิ์การเรียกค่าปรับตามสัญญาจ้าง"
                  className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase">สาระสำคัญ / รายละเอียดเพิ่มเติม</label>
                <textarea
                  rows={2}
                  value={docDetailsInput}
                  onChange={(e) => setDocDetailsInput(e.target.value)}
                  placeholder="ระบุข้อความหรือสรุปสาระสำคัญของหนังสือ..."
                  className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPenaltyDocsModal(false)}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  ปิดหน้าต่าง
                </button>
                <button
                  type="submit"
                  disabled={isSavingPenaltyDoc}
                  className="px-5 py-2 text-xs sm:text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition-colors cursor-pointer shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingPenaltyDoc ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  <span>เพิ่มรายการหนังสือ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recovery Plan Modal */}
      {showRecoveryModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
                  <Rocket className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base sm:text-lg">บันทึกแผนเร่งรัดงาน (Recovery Plan)</h3>
                  <p className="text-xs text-slate-500">กำหนดเป้าหมายวันแล้วเสร็จใหม่และมาตรการเร่งรัดสำหรับโครงการที่เกินสัญญา</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRecoveryModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRecoveryPlan} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase">วันเป้าหมายแล้วเสร็จใหม่ (Target Recovery Date)</label>
                <input
                  type="date"
                  value={recoveryTargetDateInput}
                  onChange={(e) => setRecoveryTargetDateInput(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-400 font-mono"
                />
                <span className="text-[10px] text-slate-500">
                  วันสิ้นสุดสัญญาเดิม: {formatDateDisplay(project.endDate)}
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase">มาตรการเร่งรัดงาน / บันทึกการแก้ไขปัญหา</label>
                <textarea
                  rows={4}
                  value={recoveryNotesInput}
                  onChange={(e) => setRecoveryNotesInput(e.target.value)}
                  placeholder="เช่น ผู้รับจ้างเพิ่มชุดช่าง 2 ทีม, ขยายเวลาทำงานกะกลางคืน, สั่งวัสดุล่วงหน้าเพื่อเร่งงานงวดสุดท้ายให้แล้วเสร็จภายในเป้าหมายใหม่..."
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRecoveryModal(false)}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSavingRecovery}
                  className="px-5 py-2 text-xs sm:text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-xl transition-colors cursor-pointer shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingRecovery ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>บันทึกแผนเร่งรัด</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Work Suspension Order Modal (Add/Edit) */}
      {showSuspensionModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
                  <PauseCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                    {editingSuspensionIndex !== null ? "แก้ไขคำสั่งสั่งหยุดงานชั่วคราว" : "บันทึกคำสั่งสั่งหยุดงานชั่วคราว"}
                  </h3>
                  <p className="text-xs text-slate-500">บันทึกคำสั่งหยุดงาน การเชื่อมโยงสิทธิขยายสัญญา และเหตุผลตามระเบียบฯ</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSuspensionModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSuspension} className="space-y-4 text-slate-900">
              {/* Category & Reason Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase">ประเภทสาเหตุการสั่งหยุดงาน</label>
                <select
                  value={suspensionReasonCategory}
                  onChange={(e) => {
                    const cat = e.target.value as any;
                    setSuspensionReasonCategory(cat);
                    const isElig = cat !== "contractor_fault";
                    setSuspensionIsEligible(isElig);
                    setSuspensionActionType(isElig ? "extend_contract" : "none");
                  }}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-400"
                >
                  <option value="government">🏢 ข้อขัดข้องจากหน่วยงานรัฐ / ส่งมอบพื้นที่ล่าช้า / แก้ไขแบบรูปรายการ (มีสิทธิขยายสัญญา)</option>
                  <option value="force_majeure">⛈️ เหตุสุดวิสัย / ภัยธรรมชาติ / โรคระบาด / อุทกภัย (มีสิทธิขยายสัญญา/งดค่าปรับ)</option>
                  <option value="contractor_fault">⚠️ ความบกพร่อง/ผิดพลาดของผู้รับจ้าง (ไม่มีสิทธิขยายสัญญา)</option>
                  <option value="other">📌 เหตุผลความจำเป็นอื่น ๆ ตามดุลยพินิจของคณะกรรมการ</option>
                </select>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">วันที่เริ่มมีคำสั่งหยุดงาน <span className="text-rose-500">*</span></label>
                  <input
                    type="date"
                    required
                    value={suspensionStart}
                    onChange={(e) => setSuspensionStart(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-400 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">วันที่สิ้นสุด / สั่งให้เริ่มงานต่อ</label>
                  <input
                    type="date"
                    value={suspensionEnd}
                    onChange={(e) => setSuspensionEnd(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-400 font-mono"
                  />
                  <span className="text-[10px] text-slate-400">เว้นว่างไว้หากยังอยู่ระหว่างหยุดงาน (Open-ended)</span>
                </div>
              </div>

              {/* Days preview */}
              {suspensionStart && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 flex items-center justify-between text-xs">
                  <span className="font-semibold text-amber-900">คำนวณจำนวนวันสั่งหยุดงาน:</span>
                  <span className="font-bold text-amber-950 font-mono text-sm">
                    {calculateSuspensionDays(suspensionStart, suspensionEnd)} วัน
                    {!suspensionEnd && <span className="text-xs font-normal text-amber-700 ml-1">(นับถึงปัจจุบัน)</span>}
                  </span>
                </div>
              )}

              {/* Official Orders Meta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-slate-100">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">เลขที่หนังสือคำสั่งสั่งหยุดงาน</label>
                  <input
                    type="text"
                    placeholder="เช่น กท 5401/1234 หรือ ลำดับที่ 1"
                    value={suspensionOrderDocNo}
                    onChange={(e) => setSuspensionOrderDocNo(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-400 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">ลงวันที่หนังสือสั่งหยุดงาน</label>
                  <input
                    type="date"
                    value={suspensionOrderDocDate}
                    onChange={(e) => setSuspensionOrderDocDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-400 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase">ผู้ออกคำสั่ง / ตำแหน่ง</label>
                <input
                  type="text"
                  placeholder="เช่น ผู้ว่าจ้าง / คณะกรรมการตรวจรับพัสดุ / ผู้ควบคุมงาน"
                  value={suspensionIssuer}
                  onChange={(e) => setSuspensionIssuer(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Reason / Details */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase">เหตุผล / รายละเอียดคำสั่งสั่งหยุดงาน <span className="text-rose-500">*</span></label>
                <textarea
                  required
                  rows={2}
                  value={suspensionReason}
                  onChange={(e) => setSuspensionReason(e.target.value)}
                  placeholder="เช่น สั่งให้หยุดงานเนื่องจากติดแนวท่อประปาเดิม ต้องรอสำนักการระบายน้ำเข้าทำการรื้อย้าย"
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>

              {/* Rights and Auto Extension Option */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-800 uppercase">การเชื่อมโยงสิทธิสัญญาและค่าปรับ</span>
                </div>

                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={suspensionIsEligible}
                      onChange={(e) => setSuspensionIsEligible(e.target.checked)}
                      className="mt-0.5 rounded text-amber-600 focus:ring-amber-400"
                    />
                    <span>มีสิทธิขอขยายระยะเวลาสัญญา หรือขอรับการพิจารณางด/ลดค่าปรับตามระเบียบฯ</span>
                  </label>

                  {suspensionEnd && suspensionIsEligible && (
                    <label className="flex items-start gap-2.5 text-xs font-semibold text-indigo-900 bg-indigo-50/80 p-2.5 rounded-lg border border-indigo-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={suspensionAutoExtendContract}
                        onChange={(e) => setSuspensionAutoExtendContract(e.target.checked)}
                        className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-400"
                      />
                      <div>
                        <span>อนุมัติขยายระยะเวลาสิ้นสุดสัญญาอัตโนมัติตามจำนวนวันหยุดงานนี้ (+{calculateSuspensionDays(suspensionStart, suspensionEnd)} วัน)</span>
                        <p className="text-[10px] font-normal text-indigo-700 mt-0.5">
                          วันสิ้นสุดสัญญาปัจจุบัน ({project.endDate ? formatDateDisplay(project.endDate) : "-"}) ➔ ขยายออกไปเป็น ({project.endDate ? formatDateDisplay(addDaysToDateStr(project.endDate, calculateSuspensionDays(suspensionStart, suspensionEnd))) : "-"})
                        </p>
                      </div>
                    </label>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSuspensionModal(false)}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSavingSuspension || isLoading}
                  className="px-5 py-2 text-xs sm:text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-xl transition-colors cursor-pointer shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingSuspension || isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  <span>บันทึกคำสั่ง</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Resume Work Modal */}
      {showResumeWorkModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150 text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl">
                  <PlayCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base sm:text-lg">บันทึกคำสั่งให้เริ่มงานต่อ (Resume Work)</h3>
                  <p className="text-xs text-slate-500">สิ้นสุดการหยุดงานชั่วคราว และคำนวณสิทธิการขยายระยะเวลาสัญญา</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowResumeWorkModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveResumeWork} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase">วันที่สั่งให้เริ่มงานต่อ (วันสิ้นสุดการหยุดงาน) <span className="text-rose-500">*</span></label>
                <input
                  type="date"
                  required
                  value={resumeDate}
                  onChange={(e) => setResumeDate(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-400 font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">เลขที่หนังสือสั่งเริ่มงานต่อ</label>
                  <input
                    type="text"
                    placeholder="เช่น กท 5401/5678"
                    value={resumeDocNo}
                    onChange={(e) => setResumeDocNo(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-400 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">ลงวันที่หนังสือ</label>
                  <input
                    type="date"
                    value={resumeDocDate}
                    onChange={(e) => setResumeDocDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-400 font-mono"
                  />
                </div>
              </div>

              {resumeTargetIndex !== null && project.suspensions && project.suspensions[resumeTargetIndex] && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200/80 space-y-1 text-xs">
                  <div className="flex justify-between items-center text-emerald-950 font-bold">
                    <span>คำนวณจำนวนวันหยุดงานรวม:</span>
                    <span className="font-mono text-sm">
                      {calculateSuspensionDays(project.suspensions[resumeTargetIndex].start, resumeDate)} วัน
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    ตั้งแต่ {formatDateDisplay(project.suspensions[resumeTargetIndex].start)} ถึง {formatDateDisplay(resumeDate)}
                  </p>
                </div>
              )}

              <div className="p-3.5 bg-indigo-50/80 rounded-xl border border-indigo-200 space-y-2">
                <label className="flex items-start gap-2.5 text-xs font-semibold text-indigo-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resumeAutoExtend}
                    onChange={(e) => setResumeAutoExtend(e.target.checked)}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-400"
                  />
                  <div>
                    <span>อนุมัติขยายระยะเวลาสิ้นสุดสัญญาอัตโนมัติตามจำนวนวันหยุดงานจริง</span>
                    <p className="text-[10px] font-normal text-indigo-700 mt-0.5">
                      ระบบจะบวกเพิ่มจำนวนวันที่หยุดงานเข้ากับวันสิ้นสุดสัญญาเดิม ({project.endDate ? formatDateDisplay(project.endDate) : "-"}) และบันทึกประวัติการขยายสัญญาให้อัตโนมัติ
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowResumeWorkModal(false)}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSavingResume || isLoading}
                  className="px-5 py-2 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl transition-colors cursor-pointer shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingResume || isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  <span>ยืนยันคำสั่งให้เริ่มงานต่อ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generic Item Deletion Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150 text-slate-900">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base sm:text-lg">{itemToDelete.title}</h3>
                <p className="text-xs text-slate-500">การลบรายการจะมีผลทันทีและไม่สามารถกู้คืนข้อมูลได้</p>
              </div>
            </div>

            {itemToDelete.description && (
              <div className="bg-rose-50/60 border border-rose-100 rounded-xl p-3.5 text-xs sm:text-sm text-slate-800 font-medium whitespace-pre-wrap break-words leading-relaxed max-h-36 overflow-y-auto">
                {itemToDelete.description}
              </div>
            )}

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้ออกจากระบบ?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteItem}
                className="px-4.5 py-2 text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl transition-colors cursor-pointer shadow-md flex items-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                <span>ยืนยันลบรายการ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Disbursements & Progress Photos PDF Preview & Export Modal */}
      {showDisbursementPdfModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-5xl w-full h-[94vh] flex flex-col shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 overflow-hidden text-slate-900">
            {/* Modal Header */}
            <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-700 rounded-xl shrink-0 border border-blue-100">
                  <Printer className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base md:text-lg flex items-center gap-2">
                    <span>รายงานงวดการส่งมอบงานและการเบิกจ่ายเงิน</span>
                    <span className="hidden sm:inline-block text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                      จัดหน้า A4 พอดีเนื้อหา
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    แบบฟอร์มเอกสารทางการ: ข้อมูลสัญญา, สรุปการเงิน 3 มิติ, ตารางงวดงานแยกกลุ่มผลงาน และภาพถ่ายหน้างาน (จัดหน้าละ 6 รูป)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Toggle Financial Summary Strip (แถบสรุปการเงิน 3 มิติ) */}
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl cursor-pointer select-none transition-colors border border-slate-200">
                  <input
                    type="checkbox"
                    checked={includeFinancialStripInPdf}
                    onChange={(e) => setIncludeFinancialStripInPdf(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>รวมแถบสรุปการเงิน</span>
                </label>

                {/* Toggle Table Notes & Remarks (หมายเหตุท้ายตาราง) */}
                <div className="flex items-center gap-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl cursor-pointer select-none transition-colors border border-slate-200">
                    <input
                      type="checkbox"
                      checked={includeRemarksInPdf}
                      onChange={(e) => setIncludeRemarksInPdf(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>รวมหมายเหตุท้ายตาราง</span>
                  </label>

                  {includeRemarksInPdf && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = !showRemarksPanel;
                        setShowRemarksPanel(nextVal);
                        if (showPhotoSelectPanel) setShowPhotoSelectPanel(false);
                        if (nextVal && iframeScrollPosRef.current < 250) {
                          setTimeout(() => {
                            scrollToRemarksPage();
                          }, 150);
                        }
                      }}
                      className={`text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors border cursor-pointer ${
                        showRemarksPanel
                          ? "bg-blue-700 text-white border-blue-700 shadow-sm"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                      }`}
                      title="คลิกเพื่อดูและแก้ไขข้อความหมายเหตุท้ายตาราง"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>แก้ไขหมายเหตุ</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                          showRemarksPanel
                            ? "bg-white/25 text-white"
                            : disbursementRemarks.filter((r) => r.trim().length > 0).length > 0
                            ? "bg-blue-100 text-blue-800"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {toArabicDigits(disbursementRemarks.filter((r) => r.trim().length > 0).length)} ข้อ
                      </span>
                    </button>
                  )}
                </div>

                {/* Toggle include photos & Photo Selector Button */}
                {project.photos && project.photos.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl cursor-pointer select-none transition-colors border border-slate-200">
                      <input
                        type="checkbox"
                        checked={includePhotosInPdf}
                        onChange={(e) => setIncludePhotosInPdf(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>รวมรูปภาพ</span>
                    </label>

                    {includePhotosInPdf && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowPhotoSelectPanel((prev) => !prev);
                          if (showRemarksPanel) setShowRemarksPanel(false);
                        }}
                        className={`text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors border cursor-pointer ${
                          showPhotoSelectPanel
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                        }`}
                        title="คลิกเพื่อเลือกรูปภาพเฉพาะที่ต้องการสั่งพิมพ์"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>เลือกรูปพิมพ์</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                            showPhotoSelectPanel
                              ? "bg-white/25 text-white"
                              : selectedPhotoIndices.length > 0
                              ? "bg-indigo-100 text-indigo-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {toArabicDigits(selectedPhotoIndices.length)}/{toArabicDigits(project.photos.length)} รูป
                        </span>
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handlePrintDisbursementPdf}
                  className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs sm:text-sm font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-colors cursor-pointer shadow-sm ml-auto sm:ml-0"
                  title="เปิดหน้าต่างสั่งพิมพ์ (สามารถเลือกบันทึกเป็น PDF ได้ทันที)"
                >
                  <Printer className="h-4 w-4" />
                  <span>สั่งพิมพ์ / บันทึก PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowDisbursementPdfModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer ml-1"
                  title="ปิดหน้าต่าง"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Table Remarks Drawer / Panel inside Print Modal */}
            {showRemarksPanel && includeRemarksInPdf && (
              <div className="bg-slate-50 border-b border-slate-200 p-4 sm:p-5 transition-all animate-in fade-in slide-in-from-top-2 duration-200 overflow-y-auto max-h-[48vh]">
                <div className="max-w-4xl mx-auto space-y-3.5">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                          <span>หมายเหตุท้ายตาราง (Table Notes & Remarks)</span>
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            <span>ดึงข้อมูลจากตารางแผนงาน (หน้าก่อนสั่งพิมพ์)</span>
                          </span>
                        </h4>
                        <p className="text-xs text-slate-500">
                          ดึงข้อมูลอัตโนมัติจากหมายเหตุท้ายตารางในหน้าหลัก (เรียงลำดับจากงวดที่ 1 ➔ ล่าสุด) สามารถแก้ไขเพิ่มเติมได้
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          const processed = getProcessedPeriodicRemarks(project);
                          if (processed.length > 0) {
                            handleUpdateDisbursementRemarks(processed.map((p) => stripPeriodPrefix(p.text || p.formattedText)));
                          } else {
                            alert("ไม่พบข้อมูลหมายเหตุท้ายตารางในหน้าหลัก กรุณากรอกหมายเหตุในหน้าตารางแผนงานก่อน");
                          }
                        }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-pointer transition-colors flex items-center gap-1.5 shadow-2xs"
                        title="ดึงข้อมูลหมายเหตุท้ายตารางล่าสุดจากหน้าหลัก"
                      >
                        <RotateCcw className="h-3.5 w-3.5 text-emerald-600" />
                        <span>ดึงข้อมูลจากหน้าหลัก</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAddRemark}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-colors flex items-center gap-1.5 shadow-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>เพิ่มข้อความ</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleResetDefaultRemarks}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 cursor-pointer transition-colors flex items-center gap-1"
                        title="รีเซ็ตเป็นข้อความมาตรฐาน"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>ค่าเริ่มต้น</span>
                      </button>

                      <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                        <button
                          type="button"
                          onClick={scrollToRemarksPage}
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 cursor-pointer transition-colors flex items-center gap-1 shadow-2xs"
                          title="เลื่อนหน้าพรีวิวเอกสารไปที่หน้าหมายเหตุ"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>ดูหน้าหมายเหตุ</span>
                        </button>
                        <button
                          type="button"
                          onClick={scrollToFirstPage}
                          className="text-xs font-medium px-2 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer transition-colors"
                          title="เลื่อนหน้าพรีวิวกลับไปที่หน้า 1 (สรุปโครงการ)"
                        >
                          หน้า 1
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* List of remarks */}
                  <div className="space-y-2">
                    {disbursementRemarks.map((remark, idx) => {
                      const cleanRemark = stripPeriodPrefix(remark);
                      const periodMatch = remark.match(/^\[?งวดที่\s*(\d+)\]?/);
                      const periodNum = periodMatch ? periodMatch[1] : (idx + 1).toString();

                      return (
                        <div
                          key={idx}
                          className="flex flex-col gap-1.5 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                            <div className="flex items-center gap-1.5">
                              <div className="flex items-center gap-1.5 px-2.5 h-6 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs shrink-0 whitespace-nowrap">
                                งวดที่ {toArabicDigits(periodNum)}
                              </div>
                              <button
                                type="button"
                                onClick={() => scrollToPdfRemark(periodNum)}
                                className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-blue-600 px-2 py-0.5 rounded hover:bg-blue-50 transition-colors cursor-pointer"
                                title="เลื่อนดูตำแหน่งของงวดนี้ในตัวอย่างเอกสาร"
                              >
                                <Eye className="h-3 w-3" />
                                <span>ดูในตัวอย่าง</span>
                              </button>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveRemarkItem(idx, "up")}
                                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-slate-100 transition-colors cursor-pointer"
                                title="ย้ายขึ้น"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === disbursementRemarks.length - 1}
                                onClick={() => handleMoveRemarkItem(idx, "down")}
                                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-slate-100 transition-colors cursor-pointer"
                                title="ย้ายลง"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRemarkItem(idx)}
                                className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="ลบหมายเหตุข้อนี้"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <VisualRemarkEditor
                            value={cleanRemark}
                            onChange={(val) => handleEditRemarkItem(idx, stripPeriodPrefix(val))}
                            fontSize={13}
                            theme="light"
                            autoFocus={false}
                            compact={true}
                            placeholder={`ระบุข้อความหมายเหตุงวดที่ ${toArabicDigits(periodNum)}... (ลากคลุมข้อความแล้วเลือกสีไฮไลท์)`}
                          />
                        </div>
                      );
                    })}
                    {disbursementRemarks.length === 0 && (
                      <div className="text-center py-6 bg-white rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                        ยังไม่มีข้อความหมายเหตุท้ายตาราง คลิกปุ่ม &quot;เพิ่มข้อความหมายเหตุ&quot; หรือเลือกข้อความแนะนำด้านล่าง
                      </div>
                    )}
                  </div>

                  {/* Preset Quick Chips */}
                  <div className="pt-2 border-t border-slate-200">
                    <div className="text-[11px] font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      <span>คลิกเพื่อเพิ่มข้อความแนะนำด่วน:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(isCompletedDeliveredLate
                        ? [
                            `ผู้รับจ้างส่งมอบงานงวดสุดท้ายเมื่อวันที่ ${deliveryDateDisplay || formatDateDisplay(project.endDate)} (ส่งมอบช้ากว่ากำหนดสัญญา ${completedOverdueDays} วัน)`,
                            penaltyResult && penaltyResult.totalFineAmount > 0
                              ? `ส่งมอบงานล่าช้ากว่ากำหนดสัญญา ${completedOverdueDays} วัน คิดค่าปรับอัตรา ${penaltyResult.effectiveRatePercent}%/วัน เป็นเงิน ${penaltyResult.totalFineAmount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`
                              : "อยู่ระหว่างกระบวนการตรวจสอบและพิจารณาเหตุขอยกเว้น/งด/ลดค่าปรับตามระเบียบพัสดุฯ",
                            "การเบิกจ่ายเงินค่างานงวดต่างๆ เป็นไปตามเงื่อนไขและข้อกำหนดแห่งสัญญาจ้างฯ",
                            "จำนวนเงินค่างานที่ระบุในรายงานเป็นยอดเงินก่อนหักภาษี ณ ที่จ่าย และเงินประกันผลงาน (ถ้ามี)",
                            "การส่งมอบงานในแต่ละงวด ผู้รับจ้างได้ดำเนินการตามแบบรูปรายการละเอียดครบถ้วนสมบูรณ์",
                          ]
                        : [
                            "การเบิกจ่ายเงินค่างานงวดต่างๆ เป็นไปตามเงื่อนไขและข้อกำหนดแห่งสัญญาจ้างฯ",
                            "จำนวนเงินค่างานที่ระบุในรายงานเป็นยอดเงินก่อนหักภาษี ณ ที่จ่าย และเงินประกันผลงาน (ถ้ามี)",
                            "การส่งมอบงานในแต่ละงวด ผู้รับจ้างได้ดำเนินการตามแบบรูปรายการละเอียดครบถ้วนสมบูรณ์",
                            "อยู่ระหว่างรอผลการตรวจรับพัสดุและจัดทำฎีกาเบิกจ่ายเงินตามระเบียบของทางราชการ",
                            "โครงการนี้ไม่มีการคิดค่าปรับเนื่องจากผู้รับจ้างส่งมอบงานตามกำหนดเวลาแห่งสัญญา",
                          ]
                      ).map((preset, pIdx) => {
                        const isAdded = disbursementRemarks.includes(preset);
                        return (
                          <button
                            key={pIdx}
                            type="button"
                            disabled={isAdded}
                            onClick={() => handleAddPresetRemark(preset)}
                            className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1 text-left ${
                              isAdded
                                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                : "bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border-slate-200 hover:border-blue-300 cursor-pointer shadow-2xs"
                            }`}
                          >
                            <Plus className="h-3 w-3 shrink-0" />
                            <span className="line-clamp-1">{preset}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Photo Selection Drawer / Panel inside Print Modal */}
            {showPhotoSelectPanel && project.photos && project.photos.length > 0 && (
              <div className="bg-slate-50 border-b border-slate-200 p-4 sm:p-5 transition-all animate-in fade-in slide-in-from-top-2 duration-200 overflow-y-auto max-h-[48vh]">
                <div className="max-w-5xl mx-auto space-y-3.5">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                        <ImageIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                          <span>เลือกรูปภาพความก้าวหน้าสำหรับสั่งพิมพ์รายงาน</span>
                          <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                            เลือก {toArabicDigits(selectedPhotoIndices.length)} จาก {toArabicDigits(project.photos.length)} รูป {selectedPhotoIndices.length > 0 ? `(พิมพ์ ${toArabicDigits(Math.ceil(selectedPhotoIndices.length / 6))} หน้า A4)` : "(ไม่พิมพ์รูป)"}
                          </span>
                        </h4>
                        <p className="text-xs text-slate-500">
                          คลิกที่รูปภาพเพื่อเลือก/ยกเลิกรูปที่ต้องการให้ปรากฏในเอกสาร PDF (จัดเรียง 6 รูปต่อหน้า A4)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        onClick={handleSelectAllPhotos}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 cursor-pointer transition-colors"
                      >
                        เลือกทั้งหมด ({toArabicDigits(project.photos.length)})
                      </button>
                      <button
                        type="button"
                        onClick={handleDeselectAllPhotos}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 cursor-pointer transition-colors"
                      >
                        ล้างการเลือก
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-1">
                    {project.photos.map((ph, idx) => {
                      const isSelected = selectedPhotoIndices.includes(idx);
                      return (
                        <div
                          key={idx}
                          onClick={() => handleToggleSelectPhoto(idx)}
                          className={`group relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all duration-150 flex flex-col bg-white select-none ${
                            isSelected
                              ? "border-indigo-600 ring-2 ring-indigo-500/30 shadow-sm"
                              : "border-slate-200 opacity-60 hover:opacity-100 hover:border-slate-300"
                          }`}
                        >
                          <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
                            <img
                              src={ph.imageUrl}
                              alt={`ภาพที่ ${idx + 1}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                            />
                            {/* Selection Checkbox indicator */}
                            <div
                              className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                                isSelected
                                  ? "bg-indigo-600 text-white shadow-xs"
                                  : "bg-black/40 text-transparent border border-white/60 group-hover:border-white"
                              }`}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </div>
                            {/* Photo index label */}
                            <span className="absolute top-1.5 left-1.5 text-[10px] font-bold bg-slate-900/80 text-white px-1.5 py-0.5 rounded">
                              รูปที่ {toArabicDigits(idx + 1)}
                            </span>
                          </div>
                          <div className="p-2 space-y-0.5 bg-white">
                            <p className="text-[10px] font-semibold text-slate-500 truncate">
                              📅 {ph.date ? toArabicDigits(formatDateDisplay(ph.date)) : "ไม่ระบุวันที่"}
                            </p>
                            <p className="text-[11px] font-medium text-slate-800 line-clamp-2 leading-tight" title={ph.remarks}>
                              {ph.remarks ? toArabicDigits(ph.remarks) : "ภาพถ่ายความก้าวหน้า"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Modal Body: Live A4 Document Preview */}
            <div className="flex-1 bg-slate-200/90 p-2 sm:p-4 overflow-y-auto flex justify-center min-h-0">
              <div className="w-full max-w-[850px] bg-white rounded-lg shadow-2xl border border-slate-300 overflow-hidden flex flex-col h-full min-h-[400px]">
                <iframe
                  ref={previewIframeRef}
                  onLoad={handleIframeLoad}
                  title="Disbursement and Progress Photos Report Preview"
                  srcDoc={generateDisbursementsPdfHtml(project, getDisbursementWorkRound, {
                    includePhotos: includePhotosInPdf,
                    includePersonnel: includePersonnelInPdf,
                    selectedPhotoIndices: selectedPhotoIndices,
                    includeRemarks: includeRemarksInPdf,
                    customRemarks: debouncedDisbursementRemarks.filter((r) => r.trim().length > 0),
                    includeFinancialStrip: includeFinancialStripInPdf,
                  })}
                  className="w-full h-full min-h-[400px] border-0 bg-white"
                  style={{ backgroundColor: "#ffffff" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
