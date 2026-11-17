import { Project, PeriodicProgressRecord, DisbursementPeriod } from "../types";
import { formatDateDisplay, parseDate } from "./dateUtils";

// Helper to add days to a date string and return YYYY-MM-DD
export function addDaysToDate(dateStr: string, days: number): string {
  if (!dateStr || dateStr === "-") return "-";
  
  const isoStr = toInputDateFormat(dateStr);
  const parts = isoStr.split("-");
  if (parts.length !== 3) return dateStr;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return dateStr;

  const d = new Date(year, month, day);
  d.setDate(d.getDate() + days);

  const resY = d.getFullYear();
  const resM = String(d.getMonth() + 1).padStart(2, "0");
  const resD = String(d.getDate()).padStart(2, "0");

  return `${resY}-${resM}-${resD}`;
}

// Helper to cascade 30-day date ranges automatically starting from startIdx
export function cascadeDatesFrom(
  records: PeriodicProgressRecord[],
  startIdx: number = 0,
  periodDays: number = 30
): PeriodicProgressRecord[] {
  if (!records || records.length === 0) return records;

  const updated = [...records];

  for (let i = startIdx; i < updated.length; i++) {
    let currentStart = updated[i].startDate;

    if (i > startIdx) {
      const prevEnd = updated[i - 1].endDate;
      if (prevEnd && prevEnd !== "-") {
        currentStart = addDaysToDate(prevEnd, 1);
      }
    }

    if (currentStart && currentStart !== "-") {
      const currentEnd = addDaysToDate(currentStart, periodDays - 1);
      updated[i] = {
        ...updated[i],
        startDate: currentStart,
        endDate: currentEnd,
      };
    }
  }

  return updated;
}

// Helper to clean and standardize raw date inputs from Google Sheets/GViz into DD-MM-YYYY in พ.ศ.
export function cleanSheetDate(val: any): string {
  if (val === null || val === undefined || val === "") return "";
  let str = val.toString().trim();
  if (!str || str === "-" || str === "undefined" || str === "null") return "";

  // Handle GViz Date(YYYY, M, D) format
  const gvizMatch = str.match(/^Date\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)$/i);
  if (gvizMatch) {
    let y = parseInt(gvizMatch[1], 10);
    if (y < 2400) y += 543;
    let mNum = parseInt(gvizMatch[2], 10);
    if (mNum <= 11) mNum += 1; // GViz month is 0-indexed
    const m = String(mNum).padStart(2, "0");
    const d = String(parseInt(gvizMatch[3], 10)).padStart(2, "0");
    return `${d}-${m}-${y}`;
  }

  // Handle Excel/Google Sheet 5-digit serial numbers (e.g. 46037)
  if (/^\d{5}$/.test(str)) {
    const serial = parseInt(str, 10);
    const dateObj = new Date((serial - 25569) * 86400 * 1000);
    if (!isNaN(dateObj.getTime())) {
      const d = String(dateObj.getDate()).padStart(2, "0");
      const m = String(dateObj.getMonth() + 1).padStart(2, "0");
      let y = dateObj.getFullYear();
      if (y < 2400) y += 543;
      return `${d}-${m}-${y}`;
    }
  }

  // Remove leading non-digit characters if any (e.g. "-15-01-2026" or " 15-01-2026")
  str = str.replace(/^[^\d]+/, "");
  if (!str) return "";

  // Split hyphen, slash, or dot date strings
  const parts = str.split(/[-/.]/);
  if (parts.length === 3) {
    let p1 = parts[0].trim();
    let p2 = parts[1].trim();
    let p3 = parts[2].trim();

    if (p1.length === 4) {
      // YYYY-MM-DD or YYYY/MM/DD -> DD-MM-YYYY
      let y = parseInt(p1, 10);
      if (y < 2400) y += 543;
      const cleanD = p3.split("T")[0].split(" ")[0].padStart(2, "0");
      const m = p2.padStart(2, "0");
      if (cleanD === "00" || m === "00") return "";
      return `${cleanD}-${m}-${y}`;
    } else if (p3.length === 4) {
      // DD-MM-YYYY or DD/MM/YYYY
      let y = parseInt(p3, 10);
      if (y < 2400) y += 543;
      const d = p1.padStart(2, "0");
      const m = p2.padStart(2, "0");
      if (d === "00" || m === "00") return "";
      return `${d}-${m}-${y}`;
    }
  }

  return str;
}

// Helper to format date into DD-MM-YYYY format in Buddhist Era (พ.ศ.)
export function formatDateDisplayTh(dateStr: string): string {
  if (!dateStr || dateStr === "-") return "-";
  return formatDateDisplay(dateStr);
}

// Helper to convert date string into YYYY-MM-DD for HTML <input type="date"> calendar picker
export function toInputDateFormat(dateStr: string): string {
  if (!dateStr || dateStr === "-") return "";
  const dObj = parseDate(dateStr);
  if (!dObj) return "";
  const y = String(dObj.getFullYear()).padStart(4, "0");
  const m = String(dObj.getMonth() + 1).padStart(2, "0");
  const d = String(dObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Helper to load default periodic remarks for table notes section
export function getDefaultPeriodicRemarks(project: Project, ignoreCache = false): string[] {
  if (!ignoreCache) {
    const saved = localStorage.getItem(`periodic_remarks_${project.sheetName}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse saved periodic remarks", e);
      }
    }
  }
  if (Array.isArray(project.periodicRemarks)) {
    return project.periodicRemarks;
  }
  return [];
}

export interface ProcessedPeriodicRemark {
  periodNo: number;
  text: string;
  formattedText: string;
  originalIndex: number;
}

/**
 * Extracts, orders, and formats the periodic remarks from the main project / periodic table section.
 * Automatically aligns with the display in the page before printing (งวดที่ 1 ➔ ล่าสุด).
 */
export function getProcessedPeriodicRemarks(project: Project): ProcessedPeriodicRemark[] {
  const rawRemarks = getDefaultPeriodicRemarks(project);
  if (!rawRemarks || !Array.isArray(rawRemarks) || rawRemarks.length === 0) {
    return [];
  }

  // Check sort order from localStorage (default "asc" to match PeriodicTableSection)
  let sortOrder = "asc";
  try {
    const savedOrder = localStorage.getItem("table_remarks_sort_order");
    if (savedOrder === "desc" || savedOrder === "asc") sortOrder = savedOrder;
  } catch {}

  const total = rawRemarks.length;
  const list = rawRemarks.map((text, originalIndex) => {
    let periodNo = total - originalIndex;
    const match = text.match(/งวดที่\s*(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0) periodNo = num;
    }

    const cleanText = (text || "").trim();
    // Check if cleanText already starts with "งวดที่ X" or "งวดที่X"
    let formattedText = cleanText;
    const startsWithPeriod = new RegExp(`^งวดที่\\s*${periodNo}[:\\s-]*`, "i").test(cleanText);
    if (!startsWithPeriod) {
      formattedText = `งวดที่ ${periodNo}: ${cleanText}`;
    }

    return {
      periodNo,
      text: cleanText,
      formattedText,
      originalIndex,
    };
  });

  return list.sort((a, b) => {
    if (sortOrder === "desc") {
      return b.periodNo - a.periodNo;
    }
    return a.periodNo - b.periodNo; // 1, 2, 3 ...
  });
}

// Helper to check if a set of periodic progress records contains non-zero progress/amounts
export function hasNonZeroPeriodicProgress(records?: PeriodicProgressRecord[]): boolean {
  if (!records || !Array.isArray(records) || records.length === 0) return false;
  return records.some(
    (r) =>
      (typeof r.planMonthlyPercent === "number" && !isNaN(r.planMonthlyPercent) && r.planMonthlyPercent > 0) ||
      (typeof r.planCumulativePercent === "number" && !isNaN(r.planCumulativePercent) && r.planCumulativePercent > 0) ||
      (typeof r.planMonthlyAmount === "number" && !isNaN(r.planMonthlyAmount) && r.planMonthlyAmount > 0) ||
      (typeof r.planCumulativeAmount === "number" && !isNaN(r.planCumulativeAmount) && r.planCumulativeAmount > 0) ||
      (typeof r.actualMonthlyPercent === "number" && !isNaN(r.actualMonthlyPercent) && r.actualMonthlyPercent > 0) ||
      (typeof r.actualCumulativePercent === "number" && !isNaN(r.actualCumulativePercent) && r.actualCumulativePercent > 0) ||
      (typeof r.actualMonthlyAmount === "number" && !isNaN(r.actualMonthlyAmount) && r.actualMonthlyAmount > 0) ||
      (typeof r.actualCumulativeAmount === "number" && !isNaN(r.actualCumulativeAmount) && r.actualCumulativeAmount > 0)
  );
}

// Helper to auto-calculate cumulative fields across periodic records
export function recalculateCumulativeFields(
  records: PeriodicProgressRecord[],
  contractAmount?: number
): PeriodicProgressRecord[] {
  let accumPlanPct = 0;
  let accumPlanAmt = 0;
  let accumActualPct = 0;
  let accumActualAmt = 0;

  return records.map((rec) => {
    let mPlanPct = rec.planMonthlyPercent;
    let cPlanPct = rec.planCumulativePercent;
    let mPlanAmt = rec.planMonthlyAmount;
    let cPlanAmt = rec.planCumulativeAmount;

    let mActualPct = rec.actualMonthlyPercent;
    let cActualPct = rec.actualCumulativePercent;
    let mActualAmt = rec.actualMonthlyAmount;
    let cActualAmt = rec.actualCumulativeAmount;
    mPlanPct = (mPlanPct as any) === "" ? undefined : (mPlanPct !== undefined ? Number(mPlanPct) : undefined);
    cPlanPct = (cPlanPct as any) === "" ? undefined : (cPlanPct !== undefined ? Number(cPlanPct) : undefined);
    mPlanAmt = (mPlanAmt as any) === "" ? undefined : (mPlanAmt !== undefined ? Number(mPlanAmt) : undefined);
    cPlanAmt = (cPlanAmt as any) === "" ? undefined : (cPlanAmt !== undefined ? Number(cPlanAmt) : undefined);

    mActualPct = (mActualPct as any) === "" ? undefined : (mActualPct !== undefined ? Number(mActualPct) : undefined);
    cActualPct = (cActualPct as any) === "" ? undefined : (cActualPct !== undefined ? Number(cActualPct) : undefined);
    mActualAmt = (mActualAmt as any) === "" ? undefined : (mActualAmt !== undefined ? Number(mActualAmt) : undefined);
    cActualAmt = (cActualAmt as any) === "" ? undefined : (cActualAmt !== undefined ? Number(cActualAmt) : undefined);

    // 1. Inter-derive monthly % and monthly amount if contractAmount is available
    if (contractAmount && contractAmount > 0) {
      if ((mPlanPct === undefined) && mPlanAmt !== undefined && mPlanAmt > 0) {
        mPlanPct = Math.round((mPlanAmt / contractAmount) * 10000) / 100;
      } else if ((mPlanAmt === undefined) && mPlanPct !== undefined && mPlanPct > 0) {
        mPlanAmt = Math.round((mPlanPct / 100) * contractAmount);
      }

      if ((mActualPct === undefined) && mActualAmt !== undefined && mActualAmt > 0) {
        mActualPct = Math.round((mActualAmt / contractAmount) * 10000) / 100;
      }
    }

    // 2. Plan %
    if (mPlanPct !== undefined && mPlanPct !== null && !isNaN(mPlanPct) && mPlanPct > 0) {
      accumPlanPct = Math.round((accumPlanPct + mPlanPct) * 100) / 100;
      cPlanPct = accumPlanPct;
    } else if (cPlanPct !== undefined && cPlanPct !== null && !isNaN(cPlanPct) && cPlanPct > accumPlanPct) {
      mPlanPct = Math.max(0, Math.round((cPlanPct - accumPlanPct) * 100) / 100);
      accumPlanPct = cPlanPct;
    } else if (mPlanPct !== undefined && mPlanPct !== null && !isNaN(mPlanPct)) {
      accumPlanPct = Math.round((accumPlanPct + mPlanPct) * 100) / 100;
      cPlanPct = accumPlanPct;
    } else if (cPlanPct !== undefined && cPlanPct !== null && !isNaN(cPlanPct)) {
      mPlanPct = Math.max(0, Math.round((cPlanPct - accumPlanPct) * 100) / 100);
      accumPlanPct = cPlanPct;
    } else {
    mPlanPct = undefined;
    cPlanPct = undefined;
}

    // 3. Plan Amount - auto derive from mPlanPct x contractAmount if missing or 0
    if ((mPlanAmt === undefined || mPlanAmt === 0) && mPlanPct !== undefined && mPlanPct > 0 && contractAmount && contractAmount > 0) {
      mPlanAmt = Math.round((mPlanPct / 100) * contractAmount);
    }

    if (mPlanAmt !== undefined && mPlanAmt !== null && !isNaN(mPlanAmt) && mPlanAmt > 0) {
      accumPlanAmt = accumPlanAmt + mPlanAmt;
      cPlanAmt = accumPlanAmt;
    } else if (cPlanAmt !== undefined && cPlanAmt !== null && !isNaN(cPlanAmt) && cPlanAmt > accumPlanAmt) {
      mPlanAmt = Math.max(0, cPlanAmt - accumPlanAmt);
      accumPlanAmt = cPlanAmt;
    } else if (mPlanAmt !== undefined && mPlanAmt !== null && !isNaN(mPlanAmt)) {
      accumPlanAmt = accumPlanAmt + mPlanAmt;
      cPlanAmt = accumPlanAmt;
    } else if (cPlanAmt !== undefined && cPlanAmt !== null && !isNaN(cPlanAmt)) {
      mPlanAmt = Math.max(0, cPlanAmt - accumPlanAmt);
      accumPlanAmt = cPlanAmt;
    } else {
      mPlanAmt = undefined;
      cPlanAmt = undefined;
    }

    // 4. Actual %
    if (mActualPct !== undefined && mActualPct !== null && !isNaN(mActualPct) && mActualPct > 0) {
      accumActualPct = Math.round((accumActualPct + mActualPct) * 100) / 100;
      cActualPct = accumActualPct;
    } else if (cActualPct !== undefined && cActualPct !== null && !isNaN(cActualPct) && cActualPct > accumActualPct) {
      mActualPct = Math.max(0, Math.round((cActualPct - accumActualPct) * 100) / 100);
      accumActualPct = cActualPct;
    } else if (mActualPct !== undefined && mActualPct !== null && !isNaN(mActualPct)) {
      accumActualPct = Math.round((accumActualPct + mActualPct) * 100) / 100;
      cActualPct = accumActualPct;
    } else if (cActualPct !== undefined && cActualPct !== null && !isNaN(cActualPct)) {
      mActualPct = Math.max(0, Math.round((cActualPct - accumActualPct) * 100) / 100);
      accumActualPct = cActualPct;
    } else {
      mActualPct = undefined;
      cActualPct = undefined;
    }

    // 5. Actual Amount - strictly from disbursements / recorded value
    if (mActualAmt !== undefined && mActualAmt !== null && !isNaN(mActualAmt)) {
      accumActualAmt = accumActualAmt + mActualAmt;
      cActualAmt = accumActualAmt;
    } else if (cActualAmt !== undefined && cActualAmt !== null && !isNaN(cActualAmt) && cActualAmt > accumActualAmt) {
      mActualAmt = Math.max(0, cActualAmt - accumActualAmt);
      accumActualAmt = cActualAmt;
    } else if (cActualAmt !== undefined && cActualAmt !== null && !isNaN(cActualAmt)) {
      mActualAmt = Math.max(0, cActualAmt - accumActualAmt);
      accumActualAmt = cActualAmt;
    } else {
    mActualAmt = undefined;
    cActualAmt = undefined;
}

    return {
      ...rec,
      planMonthlyPercent: mPlanPct,
      planCumulativePercent: cPlanPct,
      planMonthlyAmount: mPlanAmt,
      planCumulativeAmount: cPlanAmt,

      actualMonthlyPercent: mActualPct,
      actualCumulativePercent: cActualPct,
      actualMonthlyAmount: mActualAmt,
      actualCumulativeAmount: cActualAmt,
    };
  });
}

// Helper to extract period numbers from disbursement periodNo string (e.g. "งวดที่ 1" -> [1], "1-3" -> [1, 2, 3])
export function extractPeriodsFromDisbursement(periodNo: number | string): number[] {
  if (periodNo === undefined || periodNo === null || periodNo === "") return [];
  if (typeof periodNo === "number") return [periodNo];

  const str = String(periodNo).trim();
  const periods = new Set<number>();

  // Check for ranges like "1-3" or "0-1" or "1 - 3"
  const rangeMatch = str.match(/(\d+)\s*[\-–—]\s*(\d+)/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    if (!isNaN(start) && !isNaN(end)) {
      for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
        if (i > 0) periods.add(i);
      }
    }
  }

  // Extract all numbers in the string
  const numMatches = str.match(/\d+/g);
  if (numMatches) {
    numMatches.forEach((nm) => {
      const num = parseInt(nm, 10);
      if (!isNaN(num) && num > 0) {
        periods.add(num);
      }
    });
  }

  return Array.from(periods);
}

// Helper to retrieve the actual monthly percent (ผลงานประจำเดือน (%)) from periodic progress table for a given disbursement period
export function getActualMonthlyPercentForPeriod(
  periodNo: number | string | undefined | null,
  records?: PeriodicProgressRecord[]
): number | null {
  if (
    periodNo === undefined ||
    periodNo === null ||
    String(periodNo).trim() === "" ||
    !records ||
    records.length === 0
  ) {
    return null;
  }

  const periods = extractPeriodsFromDisbursement(periodNo);
  if (periods.length > 0) {
    let sum = 0;
    let found = false;
    for (const p of periods) {
      const rec = records.find((r) => {
        if (typeof r.periodNo === "number") return r.periodNo === p;
        const recNum = parseInt(String(r.periodNo).replace(/\D/g, ""), 10);
        return recNum === p;
      });
      if (rec && typeof rec.actualMonthlyPercent === "number" && !isNaN(rec.actualMonthlyPercent)) {
        sum += rec.actualMonthlyPercent;
        found = true;
      }
    }
    if (found) {
      return Number(sum.toFixed(2));
    }
  }

  // Fallback: direct string matching
  const str = String(periodNo).trim();
  const directMatch = records.find((r) => String(r.periodNo).trim() === str);
  if (directMatch && typeof directMatch.actualMonthlyPercent === "number" && !isNaN(directMatch.actualMonthlyPercent)) {
    return Number(directMatch.actualMonthlyPercent.toFixed(2));
  }

  return null;
}

// Helper to sync actualMonthlyAmount in periodicProgress with project disbursements
export function syncPeriodicWithDisbursements(
  records: PeriodicProgressRecord[],
  disbursements: DisbursementPeriod[],
  contractAmount?: number
): PeriodicProgressRecord[] {
  const list = disbursements || [];
  if (!records || records.length === 0) return [];
  const extendedRecords = [...records];

  const updatedRecords = extendedRecords.map((rec) => {
    const recPeriodNum = typeof rec.periodNo === "number"
      ? rec.periodNo
      : parseInt(String(rec.periodNo).replace(/\D/g, ""), 10);

    const strRec = String(rec.periodNo).trim();

    // Find matching disbursements for this period
    const matchingDisbursements = list.filter((d) => {
      if (d.periodNo === undefined || d.periodNo === null || d.periodNo === "") return false;
      const periods = extractPeriodsFromDisbursement(d.periodNo);
      if (recPeriodNum && periods.includes(recPeriodNum)) return true;

      const strD = String(d.periodNo).trim();
      return strD === strRec;
    });

    // Sum amount of matching disbursements that have status "เบิกจ่ายแล้ว"
    const validDisbursements = matchingDisbursements.filter((d) => {
      const status = (d.status || "").trim();
      return status === "เบิกจ่ายแล้ว" || status.toLowerCase() === "paid" || status.toLowerCase() === "disbursed";
    });

    const sumDisbursementAmount = validDisbursements.reduce(
      (sum, d) => sum + (Number(d.amount) || 0),
      0
    );

    let actualMonthlyAmount = 0;
    let actualMonthlyPercent = rec.actualMonthlyPercent;

    if (validDisbursements.length > 0) {
      actualMonthlyAmount = sumDisbursementAmount;
    } else {
      // If no disbursement record exists for this period, set value to 0
      actualMonthlyAmount = 0;
    }

    return {
      ...rec,
      actualMonthlyAmount,
      actualCumulativeAmount: undefined,
      actualMonthlyPercent,
    };
  });

  return recalculateCumulativeFields(updatedRecords, contractAmount);
}

// Helper to automatically fill missing periods 1..(N-1) if records start at period N > 1
export function ensureMissingEarlyPeriods(records: PeriodicProgressRecord[], contractAmount?: number): PeriodicProgressRecord[] {
  if (!records || records.length === 0) return records;

  const sorted = [...records].sort((a, b) => a.periodNo - b.periodNo);
  const firstNo = sorted[0].periodNo;

  if (firstNo <= 1) {
    return recalculateCumulativeFields(sorted, contractAmount);
  }

  const missingCount = firstNo - 1;
  const prepended: PeriodicProgressRecord[] = [];

  let refStart = sorted[0].startDate && sorted[0].startDate !== "-" ? sorted[0].startDate : "2026-03-01";

  for (let i = missingCount; i >= 1; i--) {
    const endDate = addDaysToDate(refStart, -1);
    const startDate = addDaysToDate(endDate, -29);
    refStart = startDate;

    prepended.unshift({
      periodNo: i,
      startDate,
      endDate,
      planMonthlyPercent: 0,
      planCumulativePercent: 0,
      planMonthlyAmount: 0,
      planCumulativeAmount: 0,
      actualMonthlyPercent: 0,
      actualCumulativePercent: 0,
      actualMonthlyAmount: 0,
      actualCumulativeAmount: 0,
    });
  }

  const combined = [...prepended, ...sorted];
  const renumbered = combined.map((rec, idx) => ({
    ...rec,
    periodNo: idx + 1,
  }));

  return recalculateCumulativeFields(renumbered, contractAmount);
}

// Helper to generate default initial periodic progress data matching the user's template
export function getDefaultPeriodicProgress(project: Project, ignoreCache = false): PeriodicProgressRecord[] {
  let baseRecords: PeriodicProgressRecord[] = [];

  // 1. If project object already has non-empty records from remote sheet, use them
  if (Array.isArray(project.periodicProgress) && project.periodicProgress.length > 0) {
    baseRecords = project.periodicProgress;
  } else {
    // 2. Check localStorage if available
    const saved = localStorage.getItem(`periodic_${project.sheetName}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          baseRecords = parsed;
        }
      } catch (e) {
        console.error("Failed to parse saved periodic progress", e);
      }
    }
  }

  if (baseRecords.length > 0) {
    return ensureMissingEarlyPeriods(baseRecords, project.contractAmount || project.budget);
  }

  if (baseRecords.length === 0) {
    // Default 6 iterations matching standard project lifecycle & user image sample
    const contractVal = project.contractAmount || project.budget || 100000;
    
    // Sample initial records matching the user's Excel table
    baseRecords = [
      {
        periodNo: 1,
        startDate: project.startDate && project.startDate !== "-" ? project.startDate : "2026-03-01",
        endDate: "2026-03-31",
        planMonthlyPercent: 1.5,
        planCumulativePercent: 1.5,
        planMonthlyAmount: Math.round(contractVal * 0.015),
        planCumulativeAmount: Math.round(contractVal * 0.015),
        actualMonthlyPercent: 1.0,
        actualCumulativePercent: 1.0,
        actualMonthlyAmount: 0,
        actualCumulativeAmount: 0,
      },
      {
        periodNo: 2,
        startDate: "2026-04-01",
        endDate: "2026-04-30",
        planMonthlyPercent: 2.0,
        planCumulativePercent: 3.5,
        planMonthlyAmount: Math.round(contractVal * 0.02),
        planCumulativeAmount: Math.round(contractVal * 0.035),
        actualMonthlyPercent: 3.0,
        actualCumulativePercent: 4.0,
        actualMonthlyAmount: 0,
        actualCumulativeAmount: 0,
      },
      {
        periodNo: 3,
        startDate: "2026-05-01",
        endDate: "2026-05-31",
        planMonthlyPercent: 15.0,
        planCumulativePercent: 18.5,
        planMonthlyAmount: Math.round(contractVal * 0.15),
        planCumulativeAmount: Math.round(contractVal * 0.185),
        actualMonthlyPercent: 16.0,
        actualCumulativePercent: 20.0,
        actualMonthlyAmount: 0,
        actualCumulativeAmount: 0,
      },
      {
        periodNo: 4,
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        planMonthlyPercent: 25.0,
        planCumulativePercent: 43.5,
        planMonthlyAmount: Math.round(contractVal * 0.25),
        planCumulativeAmount: Math.round(contractVal * 0.435),
        actualMonthlyPercent: 24.0,
        actualCumulativePercent: 44.0,
        actualMonthlyAmount: 0,
        actualCumulativeAmount: 0,
      },
      {
        periodNo: 5,
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        planMonthlyPercent: 30.0,
        planCumulativePercent: 73.5,
        planMonthlyAmount: Math.round(contractVal * 0.30),
        planCumulativeAmount: Math.round(contractVal * 0.735),
        actualMonthlyPercent: 28.0,
        actualCumulativePercent: 72.0,
        actualMonthlyAmount: 0,
        actualCumulativeAmount: 0,
      },
      {
        periodNo: 6,
        startDate: "2026-08-01",
        endDate: project.endDate && project.endDate !== "-" ? project.endDate : "2026-08-31",
        planMonthlyPercent: 26.5,
        planCumulativePercent: 100.0,
        planMonthlyAmount: Math.round(contractVal * 0.265),
        planCumulativeAmount: contractVal,
        actualMonthlyPercent: 28.0,
        actualCumulativePercent: 100.0,
        actualMonthlyAmount: 0,
        actualCumulativeAmount: 0,
      },
    ];
  }

  // Always sync actualMonthlyAmount with current project.disbursements and auto-cascade 30-day date range
  const contractVal = project.contractAmount || project.budget || 0;
  const synced = syncPeriodicWithDisbursements(baseRecords, project.disbursements || [], contractVal);
  return cascadeDatesFrom(synced, 0, 30);
}

// Convert periodic records to chart points for S-curve charts
export interface CurrentProgressInfo {
  planPercent: number;
  actualPercent: number;
  delta: number;
  isAhead: boolean;
  periodText?: string;
  periodNo?: number;
}

export function getCurrentProgressInfo(project: Project): CurrentProgressInfo {
  const records = project.periodicProgress;

  const fallbackPlan = project.progressPlan || 0;
  const fallbackActual = project.progressField || 0;

  if (!records || records.length === 0) {
    const rawDelta = fallbackActual - fallbackPlan;
    const delta = Number(rawDelta.toFixed(2));
    return {
      planPercent: fallbackPlan,
      actualPercent: fallbackActual,
      delta,
      isAhead: delta >= 0,
    };
  }

  // Today's date in YYYY-MM-DD format
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const todayISO = `${year}-${month}-${day}`;

  let currentRec: PeriodicProgressRecord | undefined = undefined;

  // 1. Try exact date range match
  currentRec = records.find((r) => {
    const s = toInputDateFormat(r.startDate);
    const e = toInputDateFormat(r.endDate);
    if (!s || !e || e === "-") return false;
    return todayISO >= s && todayISO <= e;
  });

  // 2. If no exact date range match, find the latest record where startDate <= todayISO
  if (!currentRec) {
    const pastRecords = records.filter((r) => {
      const s = toInputDateFormat(r.startDate);
      return s && s !== "-" && s <= todayISO;
    });
    if (pastRecords.length > 0) {
      currentRec = pastRecords[pastRecords.length - 1];
    }
  }

  // 3. If today is after all records
  if (!currentRec && records.length > 0) {
    const lastStart = toInputDateFormat(records[records.length - 1].startDate);
    if (lastStart && todayISO > lastStart) {
      currentRec = records[records.length - 1];
    }
  }

  // 4. Default to first record
  if (!currentRec && records.length > 0) {
    currentRec = records[0];
  }

  let plan = currentRec?.planCumulativePercent ?? 0;
  let actual = currentRec?.actualCumulativePercent ?? 0;
if (plan === 0 && fallbackPlan > 0) {
  plan = fallbackPlan;
}

if (actual === 0 && fallbackActual > 0) {
  actual = fallbackActual;
}
  // Find the highest actual cumulative percent recorded across all periods
  

  // If plan is 0, check if project has fallbackPlan
  if (plan === 0 && fallbackPlan > 0) {
    plan = fallbackPlan;
  }

  // If actual is still 0, fallback to fallbackActual
  if (actual === 0 && fallbackActual > 0) {
    actual = fallbackActual;
  }

  const rawDelta = actual - plan;
  const delta = Number(rawDelta.toFixed(2));

  const sTh = currentRec ? formatDateDisplayTh(currentRec.startDate) : "-";
  const eTh = currentRec ? formatDateDisplayTh(currentRec.endDate) : "-";

  return {
    planPercent: plan,
    actualPercent: actual,
    delta,
    isAhead: delta >= 0,
    periodText: currentRec ? `งวดที่ ${currentRec.periodNo} (${sTh} ถึง ${eTh})` : undefined,
    periodNo: currentRec?.periodNo,
  };
}

export function preparePeriodicChartData(
  records: PeriodicProgressRecord[],
  contractAmount: number,
  overrideCurrentPeriodNo?: number
) {
  const totalContract = contractAmount > 0 ? contractAmount : 1;

  // Determine current period (งวดปัจจุบัน)
  let currentPeriodNo = overrideCurrentPeriodNo;

  if (!currentPeriodNo && records && records.length > 0) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const todayISO = `${year}-${month}-${day}`;

    // 1. Try exact date range match
    let currentRec = records.find((r) => {
      const s = toInputDateFormat(r.startDate);
      const e = toInputDateFormat(r.endDate);
      if (!s || !e || e === "-") return false;
      return todayISO >= s && todayISO <= e;
    });

    // 2. If no exact date range match, find latest record where startDate <= todayISO
    if (!currentRec) {
      const pastRecords = records.filter((r) => {
        const s = toInputDateFormat(r.startDate);
        return s && s !== "-" && s <= todayISO;
      });
      if (pastRecords.length > 0) {
        currentRec = pastRecords[pastRecords.length - 1];
      }
    }

    // 3. If today is after all records
    if (!currentRec && records.length > 0) {
      const lastStart = toInputDateFormat(records[records.length - 1].startDate);
      if (lastStart && todayISO > lastStart) {
        currentRec = records[records.length - 1];
      }
    }

    // 4. Default to first record
    if (!currentRec && records.length > 0) {
      currentRec = records[0];
    }

    currentPeriodNo = currentRec?.periodNo || 1;
  }

  // Cutoff is strictly the current period (งวดปัจจุบัน) or override
  const activeCutoff = currentPeriodNo || 1;

  const data = records.map((rec) => {
    const isFuturePeriod = rec.periodNo > activeCutoff;
    const diffCumulativePercent = (rec.actualCumulativePercent ?? 0) - (rec.planCumulativePercent ?? 0);

    return {
      name: `งวดที่ ${rec.periodNo}`,
      periodNo: rec.periodNo,
      dateRange: `${formatDateDisplayTh(rec.startDate)} ถึง ${formatDateDisplayTh(rec.endDate)}`,
      "แผนงานประจำเดือน (%)": rec.planMonthlyPercent,
      "แผนงานสะสมประจำเดือน (%)": rec.planCumulativePercent,
      "ผลงานประจำเดือน (%)": isFuturePeriod ? null : rec.actualMonthlyPercent,
      "ผลงานสะสมประจำเดือน (%)": isFuturePeriod ? null : rec.actualCumulativePercent,
      "ส่วนต่างงานสะสม (%)": isFuturePeriod ? null : Number(diffCumulativePercent.toFixed(2)),
      "แผนการเงินประจำเดือน (บาท)": rec.planMonthlyAmount,
      "แผนการเงินสะสมประจำเดือน (บาท)": rec.planCumulativeAmount,
      "ผลการเงินประจำเดือน (บาท)": isFuturePeriod ? null : rec.actualMonthlyAmount,
      "ผลการเงินสะสมประจำเดือน (บาท)": isFuturePeriod ? null : rec.actualCumulativeAmount,
    };
  });

  if (!data || data.length === 0) return [];

  const startPoint = {
    name: "เริ่มต้น",
    periodNo: 0,
    dateRange: "จุดเริ่มต้นโครงการ",
    "แผนงานประจำเดือน (%)": 0,
    "แผนงานสะสมประจำเดือน (%)": 0,
    "ผลงานประจำเดือน (%)": 0,
    "ผลงานสะสมประจำเดือน (%)": 0,
    "ส่วนต่างงานสะสม (%)": 0,
    "แผนการเงินประจำเดือน (บาท)": 0,
    "แผนการเงินสะสมประจำเดือน (บาท)": 0,
    "ผลการเงินประจำเดือน (บาท)": 0,
    "ผลการเงินสะสมประจำเดือน (บาท)": 0,
  };

  return [startPoint, ...data];
}

export function ensureProjectsAutoUpdated(projects: Project[], ignoreCache = false): Project[] {
  if (!projects || !Array.isArray(projects)) return [];

  // Deduplicate by sheetName (each Google Sheet tab is unique) to prevent duplicate cards and duplicate React keys
  const seenSheets = new Set<string>();
  const uniqueProjects: Project[] = [];
  for (const p of projects) {
    if (!p) continue;
    const key = (p.sheetName || p.projectName || "").trim().toLowerCase();
    if (key && seenSheets.has(key)) {
      continue;
    }
    if (key) {
      seenSheets.add(key);
    }
    uniqueProjects.push(p);
  }

  return uniqueProjects.map((project) => {
    // If remote sheet provided fresh non-empty periodic progress during refresh, clear local cache override
    if (ignoreCache && Array.isArray(project.periodicProgress) && project.periodicProgress.length > 0) {
      try {
        localStorage.removeItem(`periodic_${project.sheetName}`);
      } catch (e) {}
    }
    if (ignoreCache && Array.isArray(project.periodicRemarks) && project.periodicRemarks.length > 0) {
      try {
        localStorage.removeItem(`periodic_remarks_${project.sheetName}`);
      } catch (e) {}
    }

    const rawPeriodic = (Array.isArray(project.periodicProgress) && project.periodicProgress.length > 0)
      ? project.periodicProgress
      : getDefaultPeriodicProgress(project, false);

    const contractVal = project.contractAmount || project.budget || 0;
    const basePeriodic = ensureMissingEarlyPeriods(rawPeriodic, contractVal);
    const syncedPeriodic = syncPeriodicWithDisbursements(basePeriodic, project.disbursements || [], contractVal);

    const remarks = getDefaultPeriodicRemarks(project, ignoreCache);

    const tempProj = {
      ...project,
      periodicProgress: syncedPeriodic,
      periodicRemarks: remarks,
    };

    const info = getCurrentProgressInfo(tempProj);

    const finalPlan =
    info.planPercent ?? project.progressPlan ?? 0;

const finalActual =
    info.actualPercent ?? project.progressField ?? 0;

    return {
      ...tempProj,
      planName: project.planName ? project.planName.trim() : "ไม่ระบุแผนงาน",
      fiscalYear: project.fiscalYear ? project.fiscalYear.trim() : "2569",
      projectName: project.projectName ? project.projectName.trim() : (project.sheetName ? project.sheetName.trim() : ""),
      periodicProgress: syncedPeriodic,
      periodicRemarks: remarks,
      progressPlan: finalPlan,
      progressField: finalActual,
    };
  });
}

/**
 * ดึงจำนวนงวดทั้งหมดของสัญญาจากตารางแผนงานและผลงานรายครั้ง (Periodic Progress Table)
 * โดยค้นหางวดในแถว 'แผนงานสะสมประจำเดือน (%)' ที่มีค่าเท่ากับ 100%
 */
export function getTotalPlanPeriodsFromPeriodicTable(project: Project): number {
  if (!project) return 0;

  // 1. นำข้อมูลงวดงานรายครั้งจาก project หรือ localStorage
  let records: PeriodicProgressRecord[] = [];
  if (Array.isArray(project.periodicProgress) && project.periodicProgress.length > 0) {
    records = project.periodicProgress;
  } else {
    try {
      records = getDefaultPeriodicProgress(project);
    } catch (e) {
      records = project.periodicProgress || [];
    }
  }

  if (!records || !Array.isArray(records) || records.length === 0) {
    return project.disbursements && project.disbursements.length > 0
      ? project.disbursements.length
      : 0;
  }

  // กรองเฉพาะงวดที่มี periodNo และเรียงลำดับจากงวดที่ 1 เป็นต้นไป
  const sorted = [...records]
    .filter((r) => r && typeof r.periodNo === "number")
    .sort((a, b) => a.periodNo - b.periodNo);

  if (sorted.length === 0) {
    return project.disbursements && project.disbursements.length > 0
      ? project.disbursements.length
      : 0;
  }

  const parsePercent = (val: any): number => {
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const cleaned = String(val)
      .replace(/[๐-๙]/g, (d) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(d)))
      .replace(/[%,\s]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  // 2. ค้นหางวดแรกในแถว "แผนงานสะสมประจำเดือน (%)" ที่ถึง 100%
  const hundredRec = sorted.find((r) => {
    const pct = parsePercent(r.planCumulativePercent);
    return pct >= 99.95 || Math.abs(pct - 100) < 0.05;
  });

  if (hundredRec && hundredRec.periodNo > 0) {
    return hundredRec.periodNo;
  }

  // 3. กรณีที่ยังไม่มีงวดใดถึง 100% หรือกรอกไม่ถึง ให้ใช้งวดที่ค่าแผนงานสะสมสูงสุด
  let maxPct = 0;
  let maxPeriodNo = 0;
  for (const r of sorted) {
    const pct = parsePercent(r.planCumulativePercent);
    if (pct > maxPct) {
      maxPct = pct;
      maxPeriodNo = r.periodNo;
    }
  }

  if (maxPeriodNo > 0 && maxPct > 0) {
    return maxPeriodNo;
  }

  // 4. สำรองกรณีไม่มีข้อมูลในตาราง ให้ใช้จำนวนงวดที่มีในงวดเบิกจ่าย หรือจำนวนงวดในตาราง
  return project.disbursements && project.disbursements.length > 0
    ? project.disbursements.length
    : sorted.length;
}
