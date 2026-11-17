import { ProgressUpdate, PeriodicProgressRecord, Project, SuspensionPeriod } from "../types";

export function parseDate(dateStr?: string | null): Date | null {
  if (!dateStr || dateStr === "-" || dateStr.trim() === "") return null;
  let str = dateStr.trim();

  // Strip ISO time or trailing space if present
  if (str.includes("T")) {
    str = str.split("T")[0];
  }
  if (str.includes(" ")) {
    str = str.split(" ")[0];
  }

  let year: number, month: number, day: number;

  if (str.includes("-")) {
    const parts = str.split("-");
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      } else {
        // DD-MM-YYYY
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        year = parseInt(parts[2], 10);
      }
    } else return null;
  } else if (str.includes("/")) {
    const parts = str.split("/");
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY/MM/DD
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      } else {
        // DD/MM/YYYY
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        year = parseInt(parts[2], 10);
      }
    } else return null;
  } else {
    return null;
  }

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  if (year > 2400) {
    year -= 543;
  }
  const date = new Date(year, month, day);
  return isNaN(date.getTime()) ? null : date;
}

export function formatDateYMD(date: Date): string {
  if (!date || isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDateDisplay(dateStr?: string | null): string {
  if (!dateStr || dateStr === "-" || dateStr.trim() === "") return "-";
  const date = parseDate(dateStr);
  if (!date) return dateStr;

  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  let y = date.getFullYear();
  if (y < 2400) {
    y += 543;
  }
  return `${d}-${m}-${y}`;
}

/**
 * ปฏิทินวันหยุดนักขัตฤกษ์/วันหยุดราชการไทยประจำปี (Fixed Official Holidays & Typical Observed Days)
 * ใช้สำหรับตรวจเช็ควันทำการ/วันหยุดราชการตาม ป.พ.พ. มาตรา 193/8
 */
export const THAI_PUBLIC_HOLIDAYS_FIXED: Array<{ month: number; day: number; name: string }> = [
  { month: 1, day: 1, name: "วันขึ้นปีใหม่" },
  { month: 4, day: 6, name: "วันพระบาทสมเด็จพระพุทธยอดฟ้าจุฬาโลกมหาราช และวันที่ระลึกมหาจักรีบรมราชวงศ์" },
  { month: 4, day: 13, name: "วันสงกรานต์" },
  { month: 4, day: 14, name: "วันสงกรานต์" },
  { month: 4, day: 15, name: "วันสงกรานต์" },
  { month: 5, day: 1, name: "วันแรงงานแห่งชาติ" },
  { month: 5, day: 4, name: "วันฉัตรมงคล" },
  { month: 6, day: 3, name: "วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี" },
  { month: 7, day: 28, name: "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว" },
  { month: 8, day: 12, name: "วันแม่แห่งชาติ" },
  { month: 10, day: 13, name: "วันนวมินทรมหาราช" },
  { month: 10, day: 23, name: "วันปิยมหาราช" },
  { month: 12, day: 5, name: "วันคล้ายวันพระบรมราชสมภพ ร.9 / วันพ่อแห่งชาติ" },
  { month: 12, day: 10, name: "วันรัฐธรรมนูญ" },
  { month: 12, day: 31, name: "วันสิ้นปี" },
];

/**
 * ตรวจสอบว่าวันที่กำหนดเป็นวันหยุดราชการหรือไม่ (รวมวันเสาร์-อาทิตย์ และวันหยุดนักขัตฤกษ์)
 */
export function isThaiOfficialHoliday(date: Date): { isHoliday: boolean; reason?: string } {
  if (!date || isNaN(date.getTime())) return { isHoliday: false };
  
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0) {
    return { isHoliday: true, reason: "วันอาทิตย์ (วันหยุดประจำสัปดาห์)" };
  }
  if (dayOfWeek === 6) {
    return { isHoliday: true, reason: "วันเสาร์ (วันหยุดประจำสัปดาห์)" };
  }

  const m = date.getMonth() + 1;
  const d = date.getDate();

  const matched = THAI_PUBLIC_HOLIDAYS_FIXED.find((h) => h.month === m && h.day === d);
  if (matched) {
    return { isHoliday: true, reason: `${matched.name} (วันหยุดราชการ)` };
  }

  return { isHoliday: false };
}

/**
 * คำนวณวันทำการแรกถัดไปตาม ป.พ.พ. มาตรา 193/8
 * หากวันที่ระบุตรงกับวันหยุดราชการ (เสาร์-อาทิตย์ หรือวันหยุดนักขัตฤกษ์) ให้เลื่อนไปยังวันเปิดทำการวันแรก
 */
export function getNextBusinessDay(date: Date): { effectiveDate: Date; wasHoliday: boolean; holidayReason?: string } {
  if (!date || isNaN(date.getTime())) {
    return { effectiveDate: date, wasHoliday: false };
  }

  let curr = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const initialCheck = isThaiOfficialHoliday(curr);

  if (!initialCheck.isHoliday) {
    return { effectiveDate: curr, wasHoliday: false };
  }

  // หากเป็นวันหยุด ให้เดินหน้าทีละวันจนกว่าจะเจอวันทำการปกติ (วันจันทร์-ศุกร์ที่ไม่ใช่วันหยุดราชการ)
  while (isThaiOfficialHoliday(curr).isHoliday) {
    curr.setDate(curr.getDate() + 1);
  }

  return {
    effectiveDate: curr,
    wasHoliday: true,
    holidayReason: initialCheck.reason,
  };
}

/**
 * คำนวณจำนวนวันหยุดงาน (นับรวมวันแรกและวันสุดท้าย)
 * ถ้ายังไม่ระบุวันสิ้นสุด (อยู่ระหว่างหยุดงาน) ให้นับถึงวันปัจจุบัน
 */
export function calculateSuspensionDays(startDateStr?: string | null, endDateStr?: string | null): number {
  if (!startDateStr || startDateStr === "-" || startDateStr.trim() === "") return 0;
  const start = parseDate(startDateStr);
  if (!start) return 0;
  
  let end: Date | null = null;
  if (endDateStr && endDateStr !== "-" && endDateStr.trim() !== "") {
    end = parseDate(endDateStr);
  }
  
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const now = new Date();
  const e = end ? new Date(end.getFullYear(), end.getMonth(), end.getDate()) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const diffMs = e.getTime() - s.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays + 1);
}

/**
 * ตรวจสอบว่าโครงการอยู่ระหว่างมีคำสั่งให้หยุดงานชั่วคราวหรือไม่ (Active Suspension)
 */
export function getActiveSuspension(suspensions?: SuspensionPeriod[]): {
  isSuspended: boolean;
  isSuspendedNow: boolean;
  activeSuspension?: SuspensionPeriod;
  activePeriod?: SuspensionPeriod;
  activeIndex: number;
  suspendedDaysSoFar: number;
  currentActiveDays: number;
} {
  if (!suspensions || suspensions.length === 0) {
    return {
      isSuspended: false,
      isSuspendedNow: false,
      activeIndex: -1,
      suspendedDaysSoFar: 0,
      currentActiveDays: 0,
    };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let idx = 0; idx < suspensions.length; idx++) {
    const s = suspensions[idx];
    if (!s.start || s.start === "-") continue;
    const startDate = parseDate(s.start);
    if (!startDate) continue;
    
    const sDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    
    // If no end date or end is "-" / today is before end date
    if (!s.end || s.end === "-" || s.end.trim() === "") {
      if (today.getTime() >= sDate.getTime()) {
        const days = calculateSuspensionDays(s.start, undefined);
        return {
          isSuspended: true,
          isSuspendedNow: true,
          activeSuspension: s,
          activePeriod: s,
          activeIndex: idx,
          suspendedDaysSoFar: days,
          currentActiveDays: days,
        };
      }
    } else {
      const endDate = parseDate(s.end);
      if (endDate) {
        const eDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        if (today.getTime() >= sDate.getTime() && today.getTime() <= eDate.getTime()) {
          const days = calculateSuspensionDays(s.start, s.end);
          return {
            isSuspended: true,
            isSuspendedNow: true,
            activeSuspension: s,
            activePeriod: s,
            activeIndex: idx,
            suspendedDaysSoFar: days,
            currentActiveDays: days,
          };
        }
      }
    }
  }

  return {
    isSuspended: false,
    isSuspendedNow: false,
    activeIndex: -1,
    suspendedDaysSoFar: 0,
    currentActiveDays: 0,
  };
}

/**
 * คำนวณสถิติภาพรวมของการสั่งหยุดงานทั้งหมดของโครงการ
 */
export function getTotalSuspensionStats(suspensions?: SuspensionPeriod[]): {
  totalDays: number;
  totalSuspensionDays: number;
  eligibleDays: number;
  eligibleExtensionDays: number;
  contractorFaultDays: number;
  totalCount: number;
  totalPeriods: number;
  activeCount: number;
  isCurrentlySuspended: boolean;
  activeSuspension?: SuspensionPeriod;
  suspendedDaysSoFar: number;
} {
  if (!suspensions || suspensions.length === 0) {
    return {
      totalDays: 0,
      totalSuspensionDays: 0,
      eligibleDays: 0,
      eligibleExtensionDays: 0,
      contractorFaultDays: 0,
      totalCount: 0,
      totalPeriods: 0,
      activeCount: 0,
      isCurrentlySuspended: false,
      suspendedDaysSoFar: 0,
    };
  }

  let totalDays = 0;
  let eligibleDays = 0;
  let contractorFaultDays = 0;
  let activeCount = 0;

  const activeCheck = getActiveSuspension(suspensions);

  for (const s of suspensions) {
    const days = s.days !== undefined && s.days > 0 ? s.days : calculateSuspensionDays(s.start, s.end);
    totalDays += days;

    const isFault = s.reasonCategory === "contractor_fault" || s.reasonCategory === "contractor";
    const isEligible = s.isEligibleForExtension !== false && !isFault;

    if (isEligible) {
      eligibleDays += days;
    } else {
      contractorFaultDays += days;
    }

    if (!s.end || s.end === "-" || s.end.trim() === "") {
      activeCount++;
    }
  }

  return {
    totalDays,
    totalSuspensionDays: totalDays,
    eligibleDays,
    eligibleExtensionDays: eligibleDays,
    contractorFaultDays,
    totalCount: suspensions.length,
    totalPeriods: suspensions.length,
    activeCount,
    isCurrentlySuspended: activeCheck.isSuspended,
    activeSuspension: activeCheck.activeSuspension,
    suspendedDaysSoFar: activeCheck.suspendedDaysSoFar,
  };
}

/**
 * คำนวณอายุสัญญา (จำนวนวัน) อัตโนมัติ โดยให้วันที่เริ่มสัญญาเป็นวันที่ 1 และวันที่สิ้นสุดสัญญาเป็นวันสุดท้าย
 */
export function calculateContractDays(startDateStr?: string | null, endDateStr?: string | null): number {
  if (!startDateStr || !endDateStr) return 0;
  const start = parseDate(startDateStr);
  const end = parseDate(endDateStr);
  if (!start || !end) return 0;

  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  const diffMs = e.getTime() - s.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays + 1 : 0;
}

/**
 * ตรวจสอบและดึงข้อมูลวันที่สุดท้ายของงวดสุดท้าย (Final Installment)
 * เงื่อนไข:
 * 1. วันที่สุดท้ายของงวดสุดท้าย เกิน วันที่สิ้นสุดสัญญา (หรือวันทำการแรกตาม ม.193/8)
 * 2. คำนวณจำนวนวันที่ล่าช้า:
 *    - หากผลงานสะสมประจำเดือน (%) ยังไม่ถึง 100%: ให้คิดค่าปรับเทียบตั้งแต่วันที่เริ่มคิดค่าปรับวันแรก (วันถัดจากวันสิ้นสุดสัญญา) จนถึงวันที่ปัจจุบัน
 *    - หากผลงานสะสมครบ 100%: ให้คิดค่าปรับเทียบตั้งแต่วันที่เริ่มคิดค่าปรับวันแรก จนถึงวันที่สุดท้ายของงวดสุดท้าย
 */
export function getFinalInstallmentInfo(
  projectEndDateStr?: string | null,
  periodicProgress?: PeriodicProgressRecord[] | null,
  sheetName?: string,
  effectiveDeliveryDate?: Date | null,
  penaltyStartDate?: Date | null,
  actualProgressPercent?: number
): {
  hasFinalInstallmentExceededContract: boolean;
  lastPeriodNo: number | null;
  lastPeriodEndDate: Date | null;
  lastPeriodEndDateStr: string;
  delayedDays: number;
  fullProjectedDelayedDays: number;
  isOngoingToToday: boolean;
  asOfTodayStr: string;
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const asOfTodayStr = formatDateDisplay(formatDateYMD(today));

  let records = periodicProgress;
  if ((!records || records.length === 0) && typeof window !== "undefined" && window.localStorage && sheetName) {
    try {
      const saved = localStorage.getItem(`periodic_${sheetName}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          records = parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  if (!records || !Array.isArray(records) || records.length === 0) {
    return {
      hasFinalInstallmentExceededContract: false,
      lastPeriodNo: null,
      lastPeriodEndDate: null,
      lastPeriodEndDateStr: "",
      delayedDays: 0,
      fullProjectedDelayedDays: 0,
      isOngoingToToday: false,
      asOfTodayStr,
    };
  }

  const validRecords = records.filter(
    (r) => r && r.endDate && r.endDate.trim() !== "" && r.endDate.trim() !== "-"
  );
  if (validRecords.length === 0) {
    return {
      hasFinalInstallmentExceededContract: false,
      lastPeriodNo: null,
      lastPeriodEndDate: null,
      lastPeriodEndDateStr: "",
      delayedDays: 0,
      fullProjectedDelayedDays: 0,
      isOngoingToToday: false,
      asOfTodayStr,
    };
  }

  const sorted = [...validRecords].sort((a, b) => (a.periodNo ?? 0) - (b.periodNo ?? 0));
  const lastPeriod = sorted[sorted.length - 1];
  const lastPeriodEndDateStr = lastPeriod.endDate;
  const lastPeriodEndDate = parseDate(lastPeriodEndDateStr);
  const lastPeriodNo = lastPeriod.periodNo ?? null;

  if (!lastPeriodEndDate) {
    return {
      hasFinalInstallmentExceededContract: false,
      lastPeriodNo,
      lastPeriodEndDate: null,
      lastPeriodEndDateStr,
      delayedDays: 0,
      fullProjectedDelayedDays: 0,
      isOngoingToToday: false,
      asOfTodayStr,
    };
  }

  const contractEndDate = parseDate(projectEndDateStr);
  const effectiveEnd = effectiveDeliveryDate || contractEndDate;

  if (!effectiveEnd) {
    return {
      hasFinalInstallmentExceededContract: false,
      lastPeriodNo,
      lastPeriodEndDate,
      lastPeriodEndDateStr,
      delayedDays: 0,
      fullProjectedDelayedDays: 0,
      isOngoingToToday: false,
      asOfTodayStr,
    };
  }

  // วันที่สุดท้ายของงวดสุดท้าย เกิน วันที่สิ้นสุดสัญญา หรือไม่
  const eMid = new Date(effectiveEnd.getFullYear(), effectiveEnd.getMonth(), effectiveEnd.getDate());
  const pLastMid = new Date(lastPeriodEndDate.getFullYear(), lastPeriodEndDate.getMonth(), lastPeriodEndDate.getDate());

  const hasExceeded = pLastMid.getTime() > eMid.getTime();
  if (!hasExceeded) {
    return {
      hasFinalInstallmentExceededContract: false,
      lastPeriodNo,
      lastPeriodEndDate,
      lastPeriodEndDateStr,
      delayedDays: 0,
      fullProjectedDelayedDays: 0,
      isOngoingToToday: false,
      asOfTodayStr,
    };
  }

  // วันที่เริ่มคิดค่าปรับวันแรก (penaltyStartDate):
  // หากไม่ระบุ ให้ใช้วันถัดจาก effectiveEnd (ป.พ.พ. 193/8)
  const pStart = penaltyStartDate
    ? new Date(penaltyStartDate.getFullYear(), penaltyStartDate.getMonth(), penaltyStartDate.getDate())
    : new Date(eMid.getFullYear(), eMid.getMonth(), eMid.getDate() + 1);

  // คำนวณจำนวนวันที่ล่าช้าเต็มงวด (เทียบกับ วันที่เริ่มคิดค่าปรับวันแรก กับวันที่สุดท้ายของงวดสุดท้าย)
  const fullDiffMs = pLastMid.getTime() - pStart.getTime();
  const fullProjectedDelayedDays = Math.max(1, Math.round(fullDiffMs / (1000 * 60 * 60 * 24)) + 1);

  // เงื่อนไข: กรณีที่ผลงานสะสมประจำเดือน (%) ไม่ถึง 100 %
  // ให้เทียบตั้งแต่วันที่เริ่มคิดค่าปรับวันแรก (วันถัดจากวันสิ้นสุดสัญญา) จนถึงวันที่ปัจจุบัน
  const isCompleted = actualProgressPercent !== undefined && actualProgressPercent >= 100;
  let delayedDays = fullProjectedDelayedDays;
  let isOngoingToToday = false;

  if (!isCompleted) {
    if (today.getTime() < pStart.getTime()) {
      // ยังไม่ถึงวันเริ่มคิดค่าปรับวันแรก
      delayedDays = 0;
      isOngoingToToday = false;
    } else {
      // เทียบตั้งแต่วันที่เริ่มคิดค่าปรับวันแรก (penaltyStartDate) จนถึงวันที่ปัจจุบัน (today)
      const todayDiffMs = today.getTime() - pStart.getTime();
      delayedDays = Math.max(1, Math.round(todayDiffMs / (1000 * 60 * 60 * 24)) + 1);
      isOngoingToToday = true;
    }
  }

  return {
    hasFinalInstallmentExceededContract: true,
    lastPeriodNo,
    lastPeriodEndDate,
    lastPeriodEndDateStr,
    delayedDays,
    fullProjectedDelayedDays,
    isOngoingToToday,
    asOfTodayStr,
  };
}

/**
 * คำนวณกรอบระยะเวลาสัญญา ผ่านไปแล้ว / เหลืออายุสัญญา / สถานะหมดสัญญา / เสร็จสมบูรณ์
 * พร้อมตรวจสอบเงื่อนไขวันสิ้นสุดสัญญาตรงกับวันหยุดราชการ (ป.พ.พ. มาตรา 193/8)
 * และเงื่อนไขวันที่สุดท้ายของงวดสุดท้ายเกินวันที่สิ้นสุดสัญญา
 */
export function calculateProjectTimeline(
  startDateStr?: string | null,
  endDateStr?: string | null,
  storedContractDays?: number,
  actualProgress?: number,
  finalInstallmentInput?: Date | string | PeriodicProgressRecord[] | null,
  sheetName?: string
) {
  const start = parseDate(startDateStr);
  const end = parseDate(endDateStr);

  let contractDays = storedContractDays || 0;
  if (startDateStr && endDateStr) {
    const autoDays = calculateContractDays(startDateStr, endDateStr);
    if (autoDays > 0) {
      contractDays = autoDays;
    }
  }

  const isCompleted = actualProgress !== undefined && actualProgress >= 100;

  if (!start || !end || contractDays <= 0) {
    return {
      contractDays: contractDays || 0,
      elapsedDays: 0,
      remainingDays: 0,
      overdueDays: 0,
      isExpired: false,
      isCompleted,
      remainingText: isCompleted ? "โครงการเสร็จสมบูรณ์ (100%)" : "-",
      elapsedPercent: isCompleted ? 100 : 0,
      rawEndDate: end,
      effectiveDeliveryDate: end,
      isEndDateHoliday: false,
      holidayReason: undefined as string | undefined,
      penaltyStartDate: null as Date | null,
      hasFinalInstallmentExceededContract: false,
      lastPeriodEndDate: null as Date | null,
      lastPeriodEndDateStr: "",
      lastPeriodNo: null as number | null,
    };
  }

  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  // ตรวจสอบวันสิ้นสุดสัญญาตรงกับวันหยุดราชการหรือไม่ (ป.พ.พ. มาตรา 193/8)
  const holidayCheck = isThaiOfficialHoliday(e);
  const nextBiz = getNextBusinessDay(e);
  const effectiveDeliveryDate = nextBiz.effectiveDate;
  const isEndDateHoliday = holidayCheck.isHoliday;
  const holidayReason = holidayCheck.reason;

  // วันเริ่มคิดค่าปรับวันแรก (Penalty Start Date):
  // หากวันสิ้นสุดสัญญาเดิมเป็นวันหยุด ผู้รับจ้างมีสิทธิส่งมอบใน effectiveDeliveryDate (วันทำการแรก)
  // วันเริ่มคิดค่าปรับวันแรก คือ วันถัดจาก effectiveDeliveryDate (ป.พ.พ. 193/8)
  const penaltyStartDate = new Date(effectiveDeliveryDate.getFullYear(), effectiveDeliveryDate.getMonth(), effectiveDeliveryDate.getDate() + 1);

  // ตรวจสอบเงื่อนไขวันที่สุดท้ายของงวดสุดท้ายเกินวันที่สิ้นสุดสัญญาหรือไม่
  let finalInstallmentInfo: ReturnType<typeof getFinalInstallmentInfo> = {
    hasFinalInstallmentExceededContract: false,
    lastPeriodNo: null,
    lastPeriodEndDate: null,
    lastPeriodEndDateStr: "",
    delayedDays: 0,
    fullProjectedDelayedDays: 0,
    isOngoingToToday: false,
    asOfTodayStr: formatDateDisplay(formatDateYMD(new Date())),
  };

  if (Array.isArray(finalInstallmentInput)) {
    finalInstallmentInfo = getFinalInstallmentInfo(
      endDateStr,
      finalInstallmentInput,
      sheetName,
      effectiveDeliveryDate,
      penaltyStartDate,
      actualProgress
    );
  } else if (finalInstallmentInput) {
    const pDate = typeof finalInstallmentInput === "string" ? parseDate(finalInstallmentInput) : finalInstallmentInput;
    if (pDate && pDate instanceof Date && !isNaN(pDate.getTime())) {
      const eMid = new Date(effectiveDeliveryDate.getFullYear(), effectiveDeliveryDate.getMonth(), effectiveDeliveryDate.getDate());
      const pMid = new Date(pDate.getFullYear(), pDate.getMonth(), pDate.getDate());
      if (pMid.getTime() > eMid.getTime()) {
        const pStart = new Date(penaltyStartDate.getFullYear(), penaltyStartDate.getMonth(), penaltyStartDate.getDate());
        const fullDiffMs = pMid.getTime() - pStart.getTime();
        const fullProjectedDelayedDays = Math.max(1, Math.round(fullDiffMs / (1000 * 60 * 60 * 24)) + 1);

        const nowD = new Date();
        const todayD = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate());
        let delayedDays = fullProjectedDelayedDays;
        let isOngoingToToday = false;

        if (!isCompleted) {
          if (todayD.getTime() < pStart.getTime()) {
            delayedDays = 0;
            isOngoingToToday = false;
          } else {
            const todayDiffMs = todayD.getTime() - pStart.getTime();
            delayedDays = Math.max(1, Math.round(todayDiffMs / (1000 * 60 * 60 * 24)) + 1);
            isOngoingToToday = true;
          }
        }

        finalInstallmentInfo = {
          hasFinalInstallmentExceededContract: true,
          lastPeriodNo: null,
          lastPeriodEndDate: pDate,
          lastPeriodEndDateStr: formatDateYMD(pDate),
          delayedDays,
          fullProjectedDelayedDays,
          isOngoingToToday,
          asOfTodayStr: formatDateDisplay(formatDateYMD(todayD)),
        };
      }
    }
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let elapsedDays = 0;
  let remainingDays = 0;
  let overdueDays = 0;
  let isExpired = false;
  let remainingText = "";

  if (finalInstallmentInfo.hasFinalInstallmentExceededContract) {
    // 1. วันที่สุดท้ายของงวดสุดท้ายเกินวันที่สิ้นสุดสัญญา
    // หากผลงานสะสมยังไม่ถึง 100%: ให้คิดค่าปรับเทียบตั้งแต่วันที่เริ่มคิดค่าปรับวันแรก จนถึงวันที่ปัจจุบัน
    isExpired = true;
    overdueDays = finalInstallmentInfo.delayedDays;
    elapsedDays = contractDays;
    remainingDays = 0;
    remainingText = isCompleted
      ? `โครงการแล้วเสร็จ (ส่งมอบช้ากว่าสัญญา ${overdueDays} วัน)`
      : `หมดสัญญา (ล่าช้า ${overdueDays} วัน / คิดค่าปรับ)`;
  } else if (isCompleted) {
    // กรณีผลงานจริงถึง 100% แล้ว: ปิดสถานะหมดสัญญา / ล่าช้า โดยอัตโนมัติ
    isExpired = false;
    overdueDays = 0;
    elapsedDays = contractDays;
    remainingDays = 0;
    remainingText = "โครงการเสร็จสมบูรณ์ (100%)";
  } else if (today.getTime() > effectiveDeliveryDate.getTime()) {
    // เลยกำหนดส่งมอบวันสุดท้ายตามกฎหมาย (effectiveDeliveryDate) และยังไม่เสร็จ 100%:
    // คิดค่าปรับรายวันต่อเนื่องทุกวันตามปฏิทิน (รวมเสาร์-อาทิตย์และวันหยุด) เริ่มตั้งแต่วัน penaltyStartDate
    isExpired = true;
    elapsedDays = contractDays;
    remainingDays = 0;
    const overdueMs = today.getTime() - effectiveDeliveryDate.getTime();
    overdueDays = Math.max(1, Math.round(overdueMs / (1000 * 60 * 60 * 24)));
    remainingText = `หมดสัญญา (ล่าช้า ${overdueDays} วัน)`;
  } else if (today.getTime() < s.getTime()) {
    // ยังไม่ถึงวันเริ่มสัญญา
    elapsedDays = 0;
    remainingDays = contractDays;
    overdueDays = 0;
    remainingText = `เหลืออายุสัญญา: ${contractDays} วัน`;
  } else {
    // กำลังอยู่ในระยะเวลาสัญญา (หรืออยู่ในช่วงอนุโลมส่งมอบวันทำการแรกตาม ม.193/8)
    const elapsedMs = today.getTime() - s.getTime();
    elapsedDays = Math.min(contractDays, Math.round(elapsedMs / (1000 * 60 * 60 * 24)) + 1);
    remainingDays = Math.max(0, Math.round((effectiveDeliveryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    overdueDays = 0;
    if (today.getTime() > e.getTime() && today.getTime() <= effectiveDeliveryDate.getTime()) {
      remainingText = `ส่งมอบภายในวันนี้ (${formatDateDisplay(formatDateYMD(effectiveDeliveryDate))}) ตาม ม.193/8`;
    } else {
      remainingText = `เหลืออายุสัญญา: ${remainingDays} วัน`;
    }
  }

  const elapsedPercent = isCompleted ? 100 : Math.min(100, Math.round((elapsedDays / contractDays) * 100));

  return {
    contractDays,
    elapsedDays,
    remainingDays,
    overdueDays,
    isExpired,
    isCompleted,
    remainingText,
    elapsedPercent,
    rawEndDate: e,
    effectiveDeliveryDate,
    isEndDateHoliday,
    holidayReason,
    penaltyStartDate,
    hasFinalInstallmentExceededContract: finalInstallmentInfo.hasFinalInstallmentExceededContract,
    lastPeriodEndDate: finalInstallmentInfo.lastPeriodEndDate,
    lastPeriodEndDateStr: finalInstallmentInfo.lastPeriodEndDateStr,
    lastPeriodNo: finalInstallmentInfo.lastPeriodNo,
    fullProjectedDelayedDays: finalInstallmentInfo.fullProjectedDelayedDays,
    isOngoingToToday: finalInstallmentInfo.isOngoingToToday,
    asOfTodayStr: finalInstallmentInfo.asOfTodayStr,
  };
}

/**
 * ผลลัพธ์การคำนวณค่าปรับงานก่อสร้าง (Liquidated Damages & Penalty Assessment)
 */
export interface PenaltyCalculationResult {
  budgetBase: number;             // วงเงินสัญญาที่ใช้คิดค่าปรับ (บาท)
  effectiveRatePercent: number;   // อัตราค่าปรับต่อวัน (% เช่น 0.05%, 0.10%)
  dailyFineAmount: number;        // ค่าปรับต่อวัน (บาท/วัน)
  overdueDays: number;            // จำนวนวันทั้งหมดที่เลยกำหนดสัญญา (วัน)
  waivedDays: number;             // จำนวนวันที่ได้รับพิจารณางดหรือลดค่าปรับ (วัน ตาม ม.102)
  netChargeableDays: number;      // จำนวนวันที่คิดค่าปรับสุทธิ (วัน)
  totalFineAmount: number;        // ยอดค่าปรับสะสมสุทธิ (บาท)
  finePercentOfBudget: number;    // % ค่าปรับเทียบกับวงเงินสัญญา
  maxCapAmount: number;           // เพดานค่าปรับ 10% ของสัญญา (บาท)
  maxCapPercent: number;          // 10%
  capUsagePercent: number;        // % การแตะเพดาน 10% (0 - 100%+)
  isOverdue: boolean;             // เลยกำหนดวันสิ้นสุดสัญญาหรือไม่
  isCompleted: boolean;           // งานแล้วเสร็จ 100% หรือไม่
  remainingDays: number;          // จำนวนวันคงเหลือก่อนหมดสัญญา (หากยังไม่หมด)
  isEndDateHoliday: boolean;      // วันสิ้นสุดสัญญาเดิมตรงกับวันหยุดราชการหรือไม่
  holidayReason?: string;         // สาเหตุวันหยุด (เช่น วันเสาร์, วันหยุดสงกรานต์)
  effectiveDeliveryDateStr: string; // วันส่งมอบงานวันสุดท้ายตามกฎหมาย (YYYY-MM-DD หรือ DD-MM-YYYY)
  penaltyStartDateStr: string;    // วันที่ 1 ที่เริ่มคิดค่าปรับ (YYYY-MM-DD หรือ DD-MM-YYYY)
  isApproachingCap: boolean;      // ค่าปรับสะสมแตะ 5% - 9.99% (โซนเฝ้าระวังสีส้ม/แดง)
  isExceedingCap: boolean;        // ค่าปรับสะสมแตะหรือเกิน 10% (เกณฑ์พิจารณาบอกเลิกสัญญา)
  statusLevel: "normal" | "warning_30d" | "overdue_fine" | "under_review" | "waived" | "critical_cap" | "completed" | "suspended";
  statusTitle: string;            // ข้อความพาดหัวสถานะ
  statusDescription: string;      // คำอธิบายบริบททางสัญญา
  badgeClasses: {
    bg: string;
    text: string;
    border: string;
    icon: string;
    pulse?: boolean;
  };
  suspensionStats: {
    totalDays: number;
    eligibleDays: number;
    totalCount: number;
    activeCount: number;
    isCurrentlySuspended: boolean;
    activeSuspension?: SuspensionPeriod;
    suspendedDaysSoFar: number;
  };
  hasFinalInstallmentExceededContract?: boolean; // วันที่สุดท้ายของงวดสุดท้ายเกินวันที่สิ้นสุดสัญญา
  lastPeriodEndDateStr?: string;                 // วันที่สุดท้ายของงวดสุดท้าย (DD-MM-YYYY หรือ YYYY-MM-DD)
  lastPeriodNo?: number | null;                  // งวดที่ของงวดสุดท้าย เช่น 8
  finalInstallmentDelayedDays?: number;          // จำนวนวันที่ล่าช้าโดยเทียบกับวันที่เริ่มคิดค่าปรับวันแรกกับวันที่สุดท้ายของงวดสุดท้าย
  fullProjectedDelayedDays?: number;             // จำนวนวันล่าช้าเต็มงวด (เทียบถึงวันที่สุดท้ายของงวดสุดท้าย)
  isOngoingToToday?: boolean;                    // คำนวณวันล่าช้าเทียบถึงวันที่ปัจจุบัน (กรณีผลงานสะสม < 100%)
  asOfTodayStr?: string;                         // วันที่ปัจจุบันที่ใช้อ้างอิง (DD-MM-YYYY)
  isCompletedWithFine?: boolean;                 // โครงการที่แล้วเสร็จแล้วแต่มีค่าปรับล่าช้า
}

/**
 * คำนวณค่าปรับกรณีงานไม่แล้วเสร็จตามสัญญา (Liquidated Damages Calculator)
 * อ้างอิงระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560
 * พร้อมเงื่อนไข:
 * 1. วันที่สุดท้ายของงวดสุดท้ายเกินวันที่สิ้นสุดสัญญา
 * 2. คำนวณจำนวนวันที่ล่าช้า โดยเทียบกับ วันที่เริ่มคิดค่าปรับวันแรก กับวันที่สุดท้ายของงวดสุดท้าย
 */
export function calculateLiquidatedDamages(
  project: Project,
  currentProgressPercent?: number
): PenaltyCalculationResult {
  const budgetBase = project.contractAmount > 0 ? project.contractAmount : (project.budget > 0 ? project.budget : 0);
  const effectiveRatePercent = project.penaltyRatePercent !== undefined && project.penaltyRatePercent > 0
    ? project.penaltyRatePercent
    : 0.05; // ค่ามาตรฐานทั่วไปสำหรับงานก่อสร้าง = 0.05% ต่อวัน (หรือ 0.01-0.10%)

  // ค่าปรับต่อวัน: ถ้ามี customDailyFine ให้ใช้ค่านั้น มิฉะนั้นคำนวณตาม % ของวงเงินสัญญา (ขั้นต่ำ 100 บาท/วัน ตามระเบียบฯ)
  let dailyFineAmount = 0;
  if (project.customDailyFine && project.customDailyFine > 0) {
    dailyFineAmount = project.customDailyFine;
  } else if (budgetBase > 0) {
    dailyFineAmount = Math.max(100, Math.round(budgetBase * (effectiveRatePercent / 100)));
  }

  const prog = currentProgressPercent !== undefined ? currentProgressPercent : (project.progressField || 0);

  const timeline = calculateProjectTimeline(
    project.startDate,
    project.endDate,
    project.contractDays,
    prog,
    project.periodicProgress,
    project.sheetName
  );

  // ตรวจสอบเงื่อนไขวันที่สุดท้ายของงวดสุดท้ายเกินวันที่สิ้นสุดสัญญา
  const finalInstallmentInfo = getFinalInstallmentInfo(
    project.endDate,
    project.periodicProgress,
    project.sheetName,
    timeline.effectiveDeliveryDate,
    timeline.penaltyStartDate,
    prog
  );

  // หากวันที่สุดท้ายของงวดสุดท้ายเกินวันที่สิ้นสุดสัญญา ให้ใช้จำนวนวันที่ล่าช้าที่เทียบกับวันที่เริ่มคิดค่าปรับวันแรกกับวันที่สุดท้ายของงวดสุดท้าย (หรือถึงปัจจุบันหากงานยังไม่ถึง 100%)
  let overdueDays = timeline.overdueDays;
  if (finalInstallmentInfo.hasFinalInstallmentExceededContract) {
    overdueDays = finalInstallmentInfo.delayedDays;
  } else if (project.acceptedDate && project.acceptedDate !== "-" && timeline.effectiveDeliveryDate && timeline.penaltyStartDate) {
    const accDate = parseDate(project.acceptedDate);
    if (accDate && !isNaN(accDate.getTime())) {
      const eMid = new Date(timeline.effectiveDeliveryDate.getFullYear(), timeline.effectiveDeliveryDate.getMonth(), timeline.effectiveDeliveryDate.getDate());
      const accMid = new Date(accDate.getFullYear(), accDate.getMonth(), accDate.getDate());
      if (accMid.getTime() > eMid.getTime()) {
        const pStart = new Date(timeline.penaltyStartDate.getFullYear(), timeline.penaltyStartDate.getMonth(), timeline.penaltyStartDate.getDate());
        const diffMs = accMid.getTime() - pStart.getTime();
        const accDelayedDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
        if (accDelayedDays > overdueDays) {
          overdueDays = accDelayedDays;
        }
      }
    }
  }

  const waivedDays = Math.max(0, project.waivedDays || 0);
  const netChargeableDays = Math.max(0, overdueDays - waivedDays);
  const totalFineAmount = netChargeableDays * dailyFineAmount;

  const finePercentOfBudget = budgetBase > 0 ? Number(((totalFineAmount / budgetBase) * 100).toFixed(3)) : 0;
  const maxCapAmount = Math.round(budgetBase * 0.10); // 10% เพดานค่าปรับ
  const maxCapPercent = 10;
  const capUsagePercent = maxCapAmount > 0 ? Number(((totalFineAmount / maxCapAmount) * 100).toFixed(1)) : 0;

  const isExceedingCap = budgetBase > 0 && totalFineAmount >= maxCapAmount;
  const isApproachingCap = budgetBase > 0 && !isExceedingCap && finePercentOfBudget >= 5.0;

  const isCompleted = timeline.isCompleted || prog >= 100;

  let statusLevel: PenaltyCalculationResult["statusLevel"] = "normal";
  let statusTitle = "ตามกรอบสัญญาปกติ";
  let statusDescription = "โครงการอยู่ในกรอบระยะเวลาสัญญา";
  let badgeClasses = {
    bg: "bg-slate-50",
    text: "text-slate-700",
    border: "border-slate-200",
    icon: "📅",
    pulse: false,
  };

  const suspensionStats = getTotalSuspensionStats(project.suspensions);

  if (finalInstallmentInfo.hasFinalInstallmentExceededContract) {
    const periodLabel = finalInstallmentInfo.lastPeriodNo ? ` (งวดที่ ${finalInstallmentInfo.lastPeriodNo})` : "";
    const lastDateFormatted = formatDateDisplay(finalInstallmentInfo.lastPeriodEndDateStr);
    const startDateFormatted = formatDateDisplay(timeline.penaltyStartDate ? formatDateYMD(timeline.penaltyStartDate) : "");
    const endDateFormatted = formatDateDisplay(timeline.effectiveDeliveryDate ? formatDateYMD(timeline.effectiveDeliveryDate) : (project.endDate || ""));
    const todayFormatted = finalInstallmentInfo.asOfTodayStr || formatDateDisplay(formatDateYMD(new Date()));

    if (isCompleted) {
      statusLevel = "completed";
      statusTitle = `งานแล้วเสร็จ (ส่งมอบช้ากว่าสัญญา ${overdueDays} วัน)`;
      const fineDetail = waivedDays > 0
        ? `รวม ${overdueDays} วัน (งด/ลด ${waivedDays} วัน สุทธิ ${netChargeableDays} วัน เป็นเงิน ${totalFineAmount.toLocaleString()} บาท)`
        : `รวม ${netChargeableDays} วัน เป็นเงิน ${totalFineAmount.toLocaleString()} บาท`;
      statusDescription = `ส่งมอบจริง: ${lastDateFormatted}${periodLabel} เกินกำหนดสัญญา (${endDateFormatted}) คิดค่าปรับ ${startDateFormatted} ถึง ${lastDateFormatted} ${fineDetail}`;
      badgeClasses = {
        bg: "bg-amber-50",
        text: "text-amber-800",
        border: "border-amber-300",
        icon: "⚖️",
        pulse: false,
      };
    } else if (isExceedingCap) {
      statusLevel = "critical_cap";
      statusTitle = "วิกฤต: ค่าปรับเกิน 10% (เกณฑ์บอกเลิกสัญญา)";
      statusDescription = finalInstallmentInfo.isOngoingToToday
        ? `ค่าปรับสะสม (${finePercentOfBudget.toFixed(2)}%) เกินเพดาน 10% คิดค่าปรับถึงปัจจุบัน (${todayFormatted}) รวม ${overdueDays} วัน จากการส่งมอบงานจริง${periodLabel} (${lastDateFormatted}) เกินสัญญา`
        : `ค่าปรับสะสม (${finePercentOfBudget.toFixed(2)}%) เกินเพดาน 10% จากการส่งมอบงานจริง${periodLabel} (${lastDateFormatted}) เกินสัญญา ${overdueDays} วัน`;
      badgeClasses = {
        bg: "bg-rose-100",
        text: "text-rose-900",
        border: "border-rose-400 shadow-sm",
        icon: "🚨",
        pulse: true,
      };
    } else if (project.penaltyStatus === "under_review" || project.penaltyStatus === "reserved") {
      statusLevel = "under_review";
      statusTitle = "อยู่ระหว่างพิจารณา / สงวนสิทธิ์งดหรือลดค่าปรับ";
      statusDescription = finalInstallmentInfo.isOngoingToToday
        ? `ส่งมอบจริง: ${lastDateFormatted}${periodLabel} เกินกำหนดสัญญา (${endDateFormatted}) คิดค่าปรับถึงปัจจุบัน (${todayFormatted}) รวม ${overdueDays} วัน อยู่ระหว่างพิจารณาคำร้องสงวนสิทธิ์หรือขอผ่อนผัน`
        : `ส่งมอบจริง: ${lastDateFormatted}${periodLabel} เกินกำหนดสัญญา (${endDateFormatted}) รวม ${overdueDays} วัน อยู่ระหว่างพิจารณาคำร้องสงวนสิทธิ์หรือขอผ่อนผัน`;
      badgeClasses = {
        bg: "bg-indigo-50",
        text: "text-indigo-800",
        border: "border-indigo-300",
        icon: "⏳",
        pulse: false,
      };
    } else if (project.penaltyStatus === "waived" || (waivedDays >= overdueDays && overdueDays > 0)) {
      statusLevel = "waived";
      statusTitle = "งด/ลดค่าปรับตามสัญญา";
      statusDescription = `อนุมัติงดหรือลดค่าปรับ ${waivedDays} วัน (คงเหลือคิดค่าปรับ ${netChargeableDays} วัน รวม ${totalFineAmount.toLocaleString()} บาท)`;
      badgeClasses = {
        bg: "bg-teal-50",
        text: "text-teal-800",
        border: "border-teal-300",
        icon: "🛡️",
        pulse: false,
      };
    } else if (isApproachingCap) {
      statusLevel = "overdue_fine";
      statusTitle = `เฝ้าระวัง: ค่าปรับสะสมแตะ ${finePercentOfBudget.toFixed(1)}% (เกิน 5%)`;
      statusDescription = finalInstallmentInfo.isOngoingToToday
        ? `ส่งมอบจริง: ${lastDateFormatted}${periodLabel} เกินกำหนดสัญญา (${endDateFormatted}) คิดค่าปรับถึงปัจจุบัน (${todayFormatted}) รวม ${overdueDays} วัน ค่าปรับสะสมใกล้เพดาน 10%`
        : `ส่งมอบจริง: ${lastDateFormatted}${periodLabel} เกินกำหนดสัญญา (${endDateFormatted}) คิดค่าปรับ ${startDateFormatted} ถึง ${lastDateFormatted} รวม ${overdueDays} วัน ค่าปรับสะสมใกล้เพดาน 10%`;
      badgeClasses = {
        bg: "bg-amber-100",
        text: "text-amber-900",
        border: "border-amber-400",
        icon: "⚠️",
        pulse: true,
      };
    } else {
      statusLevel = "overdue_fine";
      statusTitle = `หมดสัญญา (ล่าช้า ${overdueDays} วัน / คิดค่าปรับ)`;
      statusDescription = finalInstallmentInfo.isOngoingToToday
        ? `ส่งมอบจริง: ${lastDateFormatted}${periodLabel} เกินกำหนดสัญญา (${endDateFormatted}) คิดค่าปรับถึงปัจจุบัน (${todayFormatted}) รวม ${overdueDays} วัน (วันละ ${dailyFineAmount.toLocaleString()} บาท)`
        : `ส่งมอบจริง: ${lastDateFormatted}${periodLabel} เกินกำหนดสัญญา (${endDateFormatted}) คิดค่าปรับ ${startDateFormatted} ถึง ${lastDateFormatted} รวม ${overdueDays} วัน (วันละ ${dailyFineAmount.toLocaleString()} บาท)`;
      badgeClasses = {
        bg: "bg-rose-50",
        text: "text-rose-800",
        border: "border-rose-300",
        icon: "⛔",
        pulse: true,
      };
    }
  } else if (isCompleted) {
    statusLevel = "completed";
    if (overdueDays > 0) {
      statusTitle = `งานแล้วเสร็จ (ส่งมอบช้ากว่าสัญญา ${overdueDays} วัน)`;
      statusDescription = `ส่งมอบงานครบถ้วนแล้วเสร็จ (เกินกำหนดสัญญา ${overdueDays} วัน / คิดค่าปรับสุทธิ ${netChargeableDays} วัน รวม ${totalFineAmount.toLocaleString()} บาท)`;
      badgeClasses = {
        bg: "bg-amber-50",
        text: "text-amber-800",
        border: "border-amber-300",
        icon: "⚖️",
        pulse: false,
      };
    } else {
      statusTitle = "โครงการเสร็จสมบูรณ์ 100%";
      statusDescription = "งานก่อสร้างดำเนินการแล้วเสร็จสมบูรณ์ครบ 100% ภายในกรอบระยะเวลาสัญญา";
      badgeClasses = {
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        border: "border-emerald-200",
        icon: "✅",
        pulse: false,
      };
    }
  } else if (suspensionStats.isCurrentlySuspended && overdueDays === 0) {
    statusLevel = "suspended";
    statusTitle = `หยุดงานชั่วคราว (${suspensionStats.suspendedDaysSoFar} วันแล้ว)`;
    statusDescription = `โครงการอยู่ระหว่างมีคำสั่งให้หยุดงานชั่วคราว (เริ่ม ${formatDateDisplay(suspensionStats.activeSuspension?.start)} ${suspensionStats.activeSuspension?.orderDocNo ? `ตามหนังสือ ${suspensionStats.activeSuspension.orderDocNo}` : ""})`;
    badgeClasses = {
      bg: "bg-amber-100",
      text: "text-amber-900",
      border: "border-amber-400",
      icon: "⏸️",
      pulse: true,
    };
  } else if (overdueDays > 0) {
    if (isExceedingCap) {
      statusLevel = "critical_cap";
      statusTitle = "วิกฤต: ค่าปรับเกิน 10% (เกณฑ์บอกเลิกสัญญา)";
      statusDescription = `ค่าปรับสะสมเกิน 10% (${finePercentOfBudget.toFixed(2)}%) เข้าเงื่อนไขพิจารณาบอกเลิกสัญญาตาม พ.ร.บ. พัสดุฯ`;
      badgeClasses = {
        bg: "bg-rose-100",
        text: "text-rose-900",
        border: "border-rose-400 shadow-sm",
        icon: "🚨",
        pulse: true,
      };
    } else if (project.penaltyStatus === "under_review" || project.penaltyStatus === "reserved") {
      statusLevel = "under_review";
      statusTitle = "อยู่ระหว่างพิจารณา / สงวนสิทธิ์งดหรือลดค่าปรับ";
      statusDescription = "อยู่ระหว่างพิจารณาคำร้องขอขยายเวลา หรือขอสงวนสิทธิ์งด/ลดค่าปรับตามระเบียบฯ (ม.102)";
      badgeClasses = {
        bg: "bg-indigo-50",
        text: "text-indigo-800",
        border: "border-indigo-300",
        icon: "⏳",
        pulse: false,
      };
    } else if (project.penaltyStatus === "waived" || (waivedDays >= overdueDays && overdueDays > 0)) {
      statusLevel = "waived";
      statusTitle = "งด/ลดค่าปรับตามสัญญา";
      statusDescription = `ได้รับการอนุมัติงดหรือลดค่าปรับ ${waivedDays} วัน (คงเหลือค่าปรับ ${totalFineAmount.toLocaleString()} บ.)`;
      badgeClasses = {
        bg: "bg-teal-50",
        text: "text-teal-800",
        border: "border-teal-300",
        icon: "🛡️",
        pulse: false,
      };
    } else if (isApproachingCap) {
      statusLevel = "overdue_fine";
      statusTitle = `เฝ้าระวัง: ค่าปรับสะสมแตะ ${finePercentOfBudget.toFixed(1)}% (เกิน 5%)`;
      statusDescription = `เลยกำหนดสัญญา ${overdueDays} วัน ค่าปรับสะสม ${totalFineAmount.toLocaleString()} บาท กำลังเข้าใกล้เพดาน 10%`;
      badgeClasses = {
        bg: "bg-amber-100",
        text: "text-amber-900",
        border: "border-amber-400",
        icon: "⚠️",
        pulse: true,
      };
    } else {
      statusLevel = "overdue_fine";
      statusTitle = `หมดสัญญา (ล่าช้า ${overdueDays} วัน / คิดค่าปรับ)`;
      statusDescription = `เลยกำหนดสัญญาแล้ว ${overdueDays} วัน อยู่ระหว่างคิดค่าปรับสะสมวันละ ${dailyFineAmount.toLocaleString()} บาท`;
      badgeClasses = {
        bg: "bg-rose-50",
        text: "text-rose-800",
        border: "border-rose-300",
        icon: "⛔",
        pulse: true,
      };
    }
  } else if (timeline.remainingDays <= 30 && timeline.remainingDays > 0 && prog < 85) {
    statusLevel = "warning_30d";
    statusTitle = `เตือนใกล้หมดสัญญา (เหลือ ${timeline.remainingDays} วัน)`;
    statusDescription = `เหลือเวลาอีก ${timeline.remainingDays} วัน ผลงานสะสม ${prog.toFixed(1)}% เฝ้าระวังความเสี่ยงงานล่าช้ากว่าแผน`;
    badgeClasses = {
      bg: "bg-amber-50",
      text: "text-amber-800",
      border: "border-amber-300",
      icon: "⏰",
      pulse: false,
    };
  }

  const effectiveDeliveryDateStr = timeline.effectiveDeliveryDate
    ? formatDateYMD(timeline.effectiveDeliveryDate)
    : project.endDate || "";

  const penaltyStartDateStr = timeline.penaltyStartDate
    ? formatDateYMD(timeline.penaltyStartDate)
    : "";

  return {
    budgetBase,
    effectiveRatePercent,
    dailyFineAmount,
    overdueDays,
    waivedDays,
    netChargeableDays,
    totalFineAmount,
    finePercentOfBudget,
    maxCapAmount,
    maxCapPercent,
    capUsagePercent,
    isOverdue: overdueDays > 0 || !!finalInstallmentInfo.hasFinalInstallmentExceededContract,
    isCompleted,
    isCompletedWithFine: isCompleted && (totalFineAmount > 0 || netChargeableDays > 0),
    remainingDays: timeline.remainingDays,
    isEndDateHoliday: timeline.isEndDateHoliday,
    holidayReason: timeline.holidayReason,
    effectiveDeliveryDateStr,
    penaltyStartDateStr,
    isApproachingCap,
    isExceedingCap,
    statusLevel,
    statusTitle,
    statusDescription,
    badgeClasses,
    suspensionStats,
    hasFinalInstallmentExceededContract: finalInstallmentInfo.hasFinalInstallmentExceededContract,
    lastPeriodEndDateStr: finalInstallmentInfo.lastPeriodEndDateStr,
    lastPeriodNo: finalInstallmentInfo.lastPeriodNo,
    finalInstallmentDelayedDays: finalInstallmentInfo.delayedDays,
    fullProjectedDelayedDays: finalInstallmentInfo.fullProjectedDelayedDays,
    isOngoingToToday: finalInstallmentInfo.isOngoingToToday,
    asOfTodayStr: finalInstallmentInfo.asOfTodayStr,
  };
}

/**
 * บวกจำนวนวันเพิ่มเข้าไปในวันที่ YYYY-MM-DD แล้วคืนค่าเป็น YYYY-MM-DD
 */
export function addDaysToDateStr(baseDateStr: string, days: number): string {
  const parsed = parseDate(baseDateStr);
  if (!parsed || isNaN(days)) return baseDateStr;
  const newDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() + days);
  const yyyy = newDate.getFullYear();
  const mm = String(newDate.getMonth() + 1).padStart(2, "0");
  const dd = String(newDate.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const addDaysToDateString = addDaysToDateStr;

/**
 * Merges updates that have the same date into a single progress update record
 * with multi-line details and combined reporter names.
 */
export function mergeSameDateUpdates(updates?: ProgressUpdate[] | null): ProgressUpdate[] {
  if (!updates || updates.length === 0) return [];

  const merged: ProgressUpdate[] = [];
  const keyMap = new Map<string, number>();

  for (const item of updates) {
    if (!item) continue;
    const rawDate = (item.date || "").trim();
    if (!rawDate) continue;

    // Normalize date key using formatDateDisplay
    const formattedKey = formatDateDisplay(rawDate);
    const key = formattedKey !== "-" ? formattedKey : rawDate;

    if (keyMap.has(key)) {
      const idx = keyMap.get(key)!;
      const existing = merged[idx];

      // Combine details
      const newDetails = (item.details || "").trim();
      if (newDetails) {
        if (!existing.details || existing.details.trim() === "") {
          existing.details = newDetails;
        } else {
          const existingText = existing.details.trim();
          if (!existingText.includes(newDetails)) {
            existing.details = `${existingText}\n${newDetails}`;
          }
        }
      }

      // Combine reporters
      const newReporter = (item.reporter || "").trim();
      if (newReporter) {
        if (!existing.reporter || existing.reporter.trim() === "") {
          existing.reporter = newReporter;
        } else {
          const existingReporters = existing.reporter.split(",").map((r) => r.trim());
          if (!existingReporters.includes(newReporter)) {
            existing.reporter = `${existing.reporter.trim()}, ${newReporter}`;
          }
        }
      }
    } else {
      merged.push({
        date: rawDate,
        details: (item.details || "").trim(),
        reporter: (item.reporter || "").trim(),
      });
      keyMap.set(key, merged.length - 1);
    }
  }

  return merged;
}

/**
 * Checks if a given date string falls within any periodic progress period (งวดที่).
 * Returns the period number (e.g. 1, 2, 3) or null if not found.
 */
export function getPeriodNoForDate(
  dateStr?: string | null,
  records?: PeriodicProgressRecord[] | null
): number | string | null {
  if (!dateStr || !records || records.length === 0) return null;
  const targetDate = parseDate(dateStr);
  if (!targetDate) return null;

  const targetMs = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
    12,
    0,
    0,
    0
  ).getTime();

  for (const rec of records) {
    if (!rec || !rec.startDate || !rec.endDate || rec.startDate === "-" || rec.endDate === "-") continue;
    const start = parseDate(rec.startDate);
    const end = parseDate(rec.endDate);
    if (!start || !end) continue;

    const startMs = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      0,
      0,
      0,
      0
    ).getTime();

    const endMs = new Date(
      end.getFullYear(),
      end.getMonth(),
      end.getDate(),
      23,
      59,
      59,
      999
    ).getTime();

    if (targetMs >= startMs && targetMs <= endMs) {
      return rec.periodNo;
    }
  }

  return null;
}

/**
 * Formats a date string for display, prepending "(งวดที่ X) " if the date falls within period X.
 * Example: "(งวดที่ 1) 03-07-2026" or "03-07-2026" if outside all periods.
 */
export function formatDateDisplayWithPeriod(
  dateStr?: string | null,
  records?: PeriodicProgressRecord[] | null,
  project?: Project | null
): string {
  const formattedDate = formatDateDisplay(dateStr);
  if (formattedDate === "-") return "-";

  let effectiveRecords = records;
  if ((!effectiveRecords || effectiveRecords.length === 0) && project) {
    effectiveRecords = project.periodicProgress || null;
  }

  const periodNo = getPeriodNoForDate(dateStr, effectiveRecords);
  if (periodNo !== null && periodNo !== undefined) {
    return `(งวดที่ ${periodNo}) ${formattedDate}`;
  }

  return formattedDate;
}

export interface GroupedPeriodUpdates {
  periodNo: number | string | null;
  periodLabel: string;
  startDate?: string;
  endDate?: string;
  dateGroups: Array<{
    date: string;
    formattedDate: string;
    items: Array<{
      update: ProgressUpdate;
      originalIndex: number;
    }>;
  }>;
}

/**
 * Groups site progress updates by Period (งวด) first, and then by Date (วันที่).
 */
export function groupUpdatesByPeriodAndDate(
  updates: ProgressUpdate[] = [],
  periodicProgress: PeriodicProgressRecord[] = []
): GroupedPeriodUpdates[] {
  if (!updates || updates.length === 0) return [];

  const periodMap = new Map<string, GroupedPeriodUpdates>();

  // 1. Initialize defined periods
  const validPeriods = (periodicProgress || []).filter(
    (p) => p && p.periodNo !== undefined && p.periodNo !== null
  );

  const sortedPeriods = [...validPeriods].sort((a, b) => {
    const numA = Number(a.periodNo) || 0;
    const numB = Number(b.periodNo) || 0;
    return numA - numB;
  });

  for (const p of sortedPeriods) {
    const key = `period_${p.periodNo}`;
    const startFmt = formatDateDisplay(p.startDate);
    const endFmt = formatDateDisplay(p.endDate);
    const label = `งวดที่ ${p.periodNo}${startFmt !== "-" && endFmt !== "-" ? ` (${startFmt} ถึง ${endFmt})` : ""}`;
    periodMap.set(key, {
      periodNo: p.periodNo,
      periodLabel: label,
      startDate: p.startDate,
      endDate: p.endDate,
      dateGroups: [],
    });
  }

  const unassignedKey = "period_unassigned";

  // 2. Classify updates into periods and dates
  updates.forEach((update, idx) => {
    if (!update) return;
    const periodNo = getPeriodNoForDate(update.date, periodicProgress);
    const key = periodNo !== null && periodNo !== undefined ? `period_${periodNo}` : unassignedKey;

    if (!periodMap.has(key)) {
      if (key === unassignedKey) {
        periodMap.set(key, {
          periodNo: null,
          periodLabel: "บันทึกทั่วไป / นอกงวดงาน",
          dateGroups: [],
        });
      } else {
        periodMap.set(key, {
          periodNo: periodNo,
          periodLabel: `งวดที่ ${periodNo}`,
          dateGroups: [],
        });
      }
    }

    const group = periodMap.get(key)!;
    const updateDate = update.date || "";
    let dateGrp = group.dateGroups.find((d) => d.date === updateDate);

    if (!dateGrp) {
      dateGrp = {
        date: updateDate,
        formattedDate: formatDateDisplay(updateDate),
        items: [],
      };
      group.dateGroups.push(dateGrp);
    }

    dateGrp.items.push({
      update,
      originalIndex: idx,
    });
  });

  // 3. Filter empty groups and sort dateGroups
  const result: GroupedPeriodUpdates[] = [];
  for (const group of periodMap.values()) {
    if (group.dateGroups.length > 0) {
      // Sort date groups descending (newest date first)
      group.dateGroups.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      result.push(group);
    }
  }

  // 4. Sort period groups (newest period first, unassigned last)
  result.sort((a, b) => {
    if (a.periodNo === null) return 1;
    if (b.periodNo === null) return -1;
    const numA = Number(a.periodNo) || 0;
    const numB = Number(b.periodNo) || 0;
    return numB - numA;
  });

  return result;
}


