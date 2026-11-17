import { Project, Task, ProgressUpdate, SuspensionPeriod, DisbursementPeriod, ProjectPhoto, PeriodicProgressRecord } from "../types";
import { calculateProjectTimeline, calculateContractDays, mergeSameDateUpdates } from "./dateUtils";
import { ensureMissingEarlyPeriods, cleanSheetDate, addDaysToDate, hasNonZeroPeriodicProgress, recalculateCumulativeFields, syncPeriodicWithDisbursements, getCurrentProgressInfo } from "./periodicUtils";
import { clearCachedAccessToken, notifyGoogleAuthExpired } from "./auth";
import { getUserSession } from "./userAuth";

export class GoogleAuthError extends Error {
  constructor(message: string = "การเชื่อมต่อกับ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้ง") {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export function isGoogleAuthError(status?: number, message?: string): boolean {
  if (status === 401) return true;
  const msg = (message || "").toLowerCase();
  return (
    msg.includes("invalid authentication credentials") ||
    msg.includes("expected oauth 2 access token") ||
    msg.includes("unauthenticated") ||
    msg.includes("invalid credentials") ||
    msg.includes("login cookie or other valid authentication") ||
    msg.includes("auth/id-token-expired")
  );
}

// Helper to format suspension periods as a readable or JSON string for the spreadsheet cell
export function formatSuspensions(suspensions: SuspensionPeriod[]): string {
  if (!suspensions || suspensions.length === 0) return "";
  try {
    return JSON.stringify(suspensions);
  } catch (e) {
    return suspensions
      .map((s) => `${s.start} ถึง ${s.end || "-"}${s.reason ? ` (${s.reason})` : ""}`)
      .join("; ");
  }
}

// Helper to parse suspension periods from spreadsheet cell string (supports JSON & legacy text)
export function parseSuspensions(val: string): SuspensionPeriod[] {
  if (!val || val === "-" || val.trim() === "") return [];
  const str = val.trim();

  // Try parsing JSON format first
  if (str.startsWith("[") && str.endsWith("]")) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (e) {
      console.warn("Failed to parse suspensions JSON, falling back to string parsing:", e);
    }
  }

  const parts = str.split(";");
  const result: SuspensionPeriod[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    // Pattern: YYYY-MM-DD ถึง YYYY-MM-DD (Reason)
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+ถึง\s+(\d{4}-\d{2}-\d{2}|-)?(?:\s+\(([^)]+)\))?/);
    if (match) {
      result.push({
        start: match[1],
        end: match[2] && match[2] !== "-" ? match[2] : undefined,
        reason: match[3] || undefined,
        reasonCategory: "government",
        isEligibleForExtension: true,
      });
    } else {
      // Fallback: extract simple dates
      const simpleDates = trimmed.match(/(\d{4}-\d{2}-\d{2})/g);
      if (simpleDates && simpleDates.length >= 2) {
        result.push({
          start: simpleDates[0],
          end: simpleDates[1],
          reasonCategory: "government",
          isEligibleForExtension: true,
        });
      } else if (simpleDates && simpleDates.length === 1) {
        result.push({
          start: simpleDates[0],
          reasonCategory: "government",
          isEligibleForExtension: true,
        });
      }
    }
  }
  return result;
}

// Helper to sanitize project name into a valid Google Sheets tab name
export function sanitizeSheetName(name: string, existingNames: string[] = []): string {
  if (!name || !name.trim()) return "โครงการใหม่";
  // Remove Google Sheets invalid characters: \ / ? * : [ ]
  let cleaned = name.replace(/[\\/?*:[\]]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length > 80) {
    cleaned = cleaned.substring(0, 80).trim();
  }
  if (!cleaned) cleaned = "โครงการใหม่";

  let finalName = cleaned;
  let counter = 1;
  while (existingNames.includes(finalName)) {
    counter++;
    const suffix = ` (${counter})`;
    finalName = `${cleaned.substring(0, 80 - suffix.length)}${suffix}`;
  }
  return finalName;
}

/**
 * Format a sheet name and cell range safely for Google Sheets API.
 * Escapes internal single quotes and wraps sheet title in single quotes.
 * e.g. formatSheetRange("โครงการใหม่", "A2:B27") -> "'โครงการใหม่'!A2:B27"
 */
export function formatSheetRange(sheetName: string, cellRange: string): string {
  const cleanSheet = (sheetName || "").trim().replace(/'/g, "''");
  return `'${cleanSheet}'!${cellRange}`;
}

/**
 * Validates if a project object represents an actual project and not a header row,
 * placeholder label, or internal system tab.
 */
export function isValidProject(p: Partial<Project> | null | undefined): boolean {
  if (!p) return false;
  const sn = (p.sheetName || "").trim();
  const pn = (p.projectName || "").trim();
  const fy = (p.fiscalYear || "").trim();
  const pl = (p.planName || "").trim();

  if (!sn) return false;
  // Exclude literal header strings or common template labels
  if (
    sn === "ชื่อแผ่นงาน" ||
    sn.toLowerCase() === "sheet name" ||
    sn.toLowerCase() === "sheetname" ||
    sn === "แผ่นงาน" ||
    sn === "ชื่อโครงการ"
  ) {
    return false;
  }

  // Exclude internal reserved system sheet tab names
  if (
    sn === "_Master_" ||
    sn === "Users" ||
    sn === "Departments" ||
    sn === "ManagedSheets"
  ) {
    return false;
  }

  // Exclude rows where the project name is literally the column header title
  if (pn === "ชื่อโครงการ" || fy === "ปีงบประมาณ" || pl === "แผนงาน") {
    return false;
  }

  return true;
}

// Map the Thai label names in column A to Project properties
const FIELD_MAPPING: Record<string, keyof Project | string> = {
  "ชื่อโครงการ": "projectName",
  "ปีงบประมาณ": "fiscalYear",
  "แผนงาน": "planName",
  "วงเงิน": "budget",
  "วงเงินตามสัญญา": "contractAmount",
  "เลขที่สัญญา": "contractNumber",
  "ลงนามสัญญา (วันที่)": "signedDate",
  "เริ่มสัญญา (วันที่)": "startDate",
  "สิ้นสุดสัญญา (วันที่)": "endDate",
  "อายุสัญญา (วัน)": "contractDays",
  "หยุดงานระหว่างทำงาน": "suspensions",
  "การสั่งหยุดงานระหว่างปฏิบัติงาน": "suspensions",
  "ประวัติการสั่งหยุดงาน": "suspensions",
  "ข้อมูลการสั่งหยุดงาน": "suspensions",
  "คำสั่งหยุดงาน": "suspensions",
  "สั่งหยุดงาน": "suspensions",
  "ห้างที่รับผิดชอบ": "contractor",
  "ประธานตรวจรับพัสดุ": "chairman",
  "กรรมการคนที่ 1": "committee1",
  "กรรมการคนที่ 2": "committee2",
  "หัวหน้าผู้ควบคุมงาน": "supervisorHead",
  "ผู้ควบคุมงาน": "supervisor",
  "ตรวจรับแล้ว (วันที่)": "acceptedDate",
  "ความคืบหน้าตามแผน (%)": "progressPlan",
  "ความคืบหน้าในสนาม (%)": "progressField",
  "การเบิกจ่าย (บาท)": "disbursedAmount",
  "ละติจูด (Latitude)": "lat",
  "ลองจิจูด (Longitude)": "lng",
  "สถานที่ตั้งโครงการ": "locationName",
  "ละติจูด": "lat",
  "ลองจิจูด": "lng",
  "ชื่อสถานที่": "locationName",
  "รูปแบบหมุดปัก": "pinStyle",
  "สัญลักษณ์หมุด": "pinStyle",
  "วัตถุบนแผนที่": "mapObjects",
  "เครื่องมือวาดแผนที่": "mapObjects",
  "ข้อมูลวาดแผนที่": "mapObjects",
  "ประวัติการขยายเวลาสัญญา": "extensions",
  "ประวัติการขยายระยะเวลาสัญญา": "extensions",
  "ประวัติการขยายสัญญา": "extensions",
  "ประวัติการขยายอายุสัญญา": "extensions",
  "การขยายระยะเวลาสัญญา": "extensions",
  "การขยายอายุสัญญา": "extensions",
  "การขยายสัญญา": "extensions",
  "ขยายอายุสัญญา": "extensions",
  "ขยายเวลาสัญญา": "extensions",
  "ขยายสัญญา": "extensions",
  "อัตราค่าปรับต่อวัน (%)": "penaltyRatePercent",
  "อัตราค่าปรับต่อวัน": "penaltyRatePercent",
  "อัตราค่าปรับ (%)": "penaltyRatePercent",
  "ค่าปรับต่อวัน (บาท/วัน)": "customDailyFine",
  "ค่าปรับต่อวัน": "customDailyFine",
  "ค่าปรับขั้นต่ำต่อวัน": "customDailyFine",
  "จำนวนวันงดหรือลดค่าปรับ": "waivedDays",
  "จำนวนวันงดลดค่าปรับ": "waivedDays",
  "วันงดลดค่าปรับ (วัน)": "waivedDays",
  "วันงดลดค่าปรับ": "waivedDays",
  "เหตุผลการงดลดค่าปรับ": "waivedReason",
  "หนังสืออนุมัติงดลดค่าปรับ": "waivedReason",
  "เหตุผลหรือหนังสืออนุมัติงดลดค่าปรับ": "waivedReason",
  "สถานะการคิดค่าปรับ": "penaltyStatus",
  "ประวัติหนังสือแจ้งเตือนค่าปรับ": "penaltyNoticeDocs",
  "เอกสารแจ้งเตือนค่าปรับ": "penaltyNoticeDocs",
  "หนังสือบริหารสัญญา": "penaltyNoticeDocs",
  "เป้าหมายแล้วเสร็จใหม่": "recoveryTargetDate",
  "บันทึกมาตรการเร่งรัดงาน": "recoveryPlanNotes",
  "แผนเร่งรัดงาน": "recoveryPlanNotes",
  "หมายเหตุ": "projectNotes",
  "หมายเหตุโครงการ": "projectNotes",
  "หมายเหตุเพิ่มเติม": "projectNotes",
  "หมายเหตุ (Admin)": "projectNotes",
  "หมายเหตุ (Owner)": "projectNotes",
};

// Helper to catch network errors & retry on rate limits / quota exceeded (HTTP 429/503 or Quota errors)
async function safeFetch(url: string, options?: RequestInit, maxRetries = 4): Promise<Response> {
  let attempt = 0;
  let delayMs = 1500;

  while (true) {
    try {
      const response = await fetch(url, options);

      // Check if status is 401 (Unauthorized / Expired Google Token)
      if (response.status === 401) {
        clearCachedAccessToken();
        notifyGoogleAuthExpired();
        return response;
      }

      // Check if status is 429 (Too Many Requests) or 503 (Service Unavailable)
      if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
        attempt++;
        console.warn(`Google Sheets API rate limited (HTTP ${response.status}). Retrying in ${delayMs}ms... (Attempt ${attempt}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2; // exponential backoff: 1.5s, 3s, 6s...
        continue;
      }

      // Check if response body mentions quota or write request limits
      if (!response.ok && attempt < maxRetries) {
        const cloned = response.clone();
        try {
          const json = await cloned.json();
          const msg = json.error?.message || "";
          if (
            (msg.toLowerCase().includes("quota") ||
             msg.toLowerCase().includes("rate limit") ||
             msg.toLowerCase().includes("write requests") ||
             msg.toLowerCase().includes("too many requests")) &&
            attempt < maxRetries
          ) {
            attempt++;
            console.warn(`Google Sheets API quota error: ${msg}. Retrying in ${delayMs}ms... (Attempt ${attempt}/${maxRetries})`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            delayMs *= 2;
            continue;
          }
        } catch (e) {
          // ignore non-json body parse error
        }
      }

      return response;
    } catch (err: any) {
      if (
        attempt < maxRetries &&
        (err.name === "TypeError" || err.message?.includes("Failed to fetch") || err.message?.includes("network"))
      ) {
        attempt++;
        console.warn(`Network error calling Google Sheets API. Retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2;
        continue;
      }

      if (err.name === "TypeError" || err.message?.includes("Failed to fetch")) {
        throw new Error("ไม่สามารถเชื่อมต่อ Google Sheets ได้ กรุณาตรวจสอบสิทธิ์การแชร์ไฟล์เป็น 'ทุกคนที่มีลิงก์อ่านได้' หรือใช้งานผ่านโหมดทดลองระบบ (Demo Mode)");
      }
      throw err;
    }
  }
}

// Create a new Google Spreadsheet with template sheets
export async function createTemplateSpreadsheet(
  accessToken: string,
  title: string = "ระบบรายงานโครงการก่อสร้าง 2569-2570"
): Promise<string> {
  // 1. Create Spreadsheet
  const createRes = await safeFetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        { properties: { title: "_Master_" } }, // The main coordination sheet
        { properties: { title: "Users" } }, // Users authorization sheet
      ],
    }),
  });

  if (!createRes.ok) {
    const errorData = await createRes.json();
    throw new Error(errorData.error?.message || "Failed to create spreadsheet");
  }

  const ss = await createRes.json();
  const ssId = ss.spreadsheetId;

  // 2. We'll populate sample projects for 2569 and 2570
  // 2569 (7 projects): Plan 1 (2), Plan 2 (2), Plan 3 (2), Plan 4 (1)
  // 2570 (8 projects): Plan 1 (2), Plan 2 (2), Plan 3 (2), Plan 4 (1), Plan 5 (1)
  const masterRows = [
    ["ปีงบประมาณ", "แผนงาน", "ชื่อโครงการ", "ชื่อแผ่นงาน", "วงเงินงบประมาณ"],
    // FY 2569
    ["2569", "แผนงานที่ 1", "โครงการก่อสร้างทางหลวงชนบทตัดผ่านป่าชุมชน", "โครงการก่อสร้างทางหลวงชนบทตัดผ่านป่าชุมชน", 2400000],
    ["2569", "แผนงานที่ 1", "โครงการติดตั้งไฟส่องสว่างพลังงานแสงอาทิตย์ ตลาดสด", "โครงการติดตั้งไฟส่องสว่างพลังงานแสงอาทิตย์ ตลาดสด", 850000],
    ["2569", "แผนงานที่ 2", "โครงการขุดลอกคลองส่งน้ำเพื่อการเกษตรสายใหญ่", "โครงการขุดลอกคลองส่งน้ำเพื่อการเกษตรสายใหญ่", 3200000],
    ["2569", "แผนงานที่ 2", "โครงการปรับปรุงอาคารสโมสรและลานกีฬาอเนกประสงค์", "โครงการปรับปรุงอาคารสโมสรและลานกีฬาอเนกประสงค์", 1500000],
    ["2569", "แผนงานที่ 3", "โครงการก่อสร้างทำนบดินหัวงานอ่างเก็บน้ำขนาดเล็ก", "โครงการก่อสร้างทำนบดินหัวงานอ่างเก็บน้ำขนาดเล็ก", 4800000],
    ["2569", "แผนงานที่ 3", "โครงการขยายเขตระบบจำหน่ายน้ำประปาหมู่บ้าน", "โครงการขยายเขตระบบจำหน่ายน้ำประปาหมู่บ้าน", 1100000],
    ["2569", "แผนงานที่ 4", "โครงการปรับปรุงผิวจราจรลาดยางแอสฟัลท์ติก", "โครงการปรับปรุงผิวจราจรลาดยางแอสฟัลท์ติก", 3900000],
    // FY 2570
    ["2570", "แผนงานที่ 1", "โครงการก่อสร้างสะพาน คสล. ข้ามคลองเปรมประชากร", "โครงการก่อสร้างสะพาน คสล. ข้ามคลองเปรมประชากร", 5600000],
    ["2570", "แผนงานที่ 1", "โครงการปรับภูมิทัศน์และก่อสร้างทางจักรยานรอบบึง", "โครงการปรับภูมิทัศน์และก่อสร้างทางจักรยานรอบบึง", 2100000],
    ["2570", "แผนงานที่ 2", "โครงการก่อสร้างโรงกรองน้ำดื่มสะอาดระบบออสโมซิส", "โครงการก่อสร้างโรงกรองน้ำดื่มสะอาดระบบออสโมซิส", 3500000],
    ["2570", "แผนงานที่ 2", "โครงการซ่อมแซมฝายกั้นน้ำเพื่อบรรเทาภัยแล้ง", "โครงการซ่อมแซมฝายกั้นน้ำเพื่อบรรเทาภัยแล้ง", 950000],
    ["2570", "แผนงานที่ 3", "โครงการติดตั้งระบบกระจายสัญญาณ Wi-Fi ชุมชนเสาไฟ", "โครงการติดตั้งระบบกระจายสัญญาณ Wi-Fi ชุมชนเสาไฟ", 1200000],
    ["2570", "แผนงานที่ 3", "โครงการพัฒนาศูนย์การเรียนรู้ ICT ชุมชนประจำตำบล", "โครงการพัฒนาศูนย์การเรียนรู้ ICT ชุมชนประจำตำบล", 1800000],
    ["2570", "แผนงาน & ภัยแล้ง", "โครงการเจาะบ่อบาดาลน้ำลึกและถังเก็บน้ำทรงแชมเปญ", "โครงการเจาะบ่อบาดาลน้ำลึกและถังเก็บน้ำทรงแชมเปญ", 2500000],
    ["2570", "แผนงานสิ่งแวดล้อม", "โครงการจัดสร้างศูนย์คัดแยกขยะรีไซเคิลชุมชนต้นแบบ", "โครงการจัดสร้างศูนย์คัดแยกขยะรีไซเคิลชุมชนต้นแบบ", 1600000],
  ];

  // Write Master values
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/_Master_!A1:E16?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: masterRows }),
  });

  // Write Users initial values (Username, Password, Role, Status, Name)
  const usersRows = [
    ["Username", "Password", "Role", "Status", "Name"],
    ["admin", "admin123", "Admin", "Active", "ผู้ดูแลระบบ (Admin)"],
    ["user", "user123", "User", "Active", "ผู้ใช้งานทั่วไป (User)"],
    ["inactive_user", "123456", "User", "Inactive", "ผู้ใช้งานปิดบริการ (Inactive)"],
  ];
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/Users!A1:E5?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: usersRows }),
  });

  // Create individual project sheets in batch
  const createSheetsRequests = masterRows.slice(1).map((row) => ({
    addSheet: {
      properties: { title: row[3] as string },
    },
  }));

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests: createSheetsRequests }),
  });

  // Now write data into each individual project sheet tab!
  // To keep it fast, we can loop or do batch writes. A batchUpdate is great, or write sequentially.
  // Sequential might trigger quota limit if too fast, but we have 15 sheets, so we can do it with structured payloads.
  // Let's write default realistic data for each of these.
  const personnel = {
    chairmen: ["นายสมชาย เข็มทอง", "นางสาววิภา พรอำนวย", "นายประสิทธิ์ รัตนสกุล", "นายธวัชชัย ดำรงดี"],
    comm1: ["นายสุทิน บัวตูม", "นางปราณี ดีใจ", "นายอภิชาติ คล่องแคล่ว", "นายอำนาจ พิทักษ์ไทย"],
    comm2: ["นายมานะ อุดมจิต", "นายวีระ แก้วมณี", "นางสาวสมศรี สดใส", "นายไพโรจน์ กิจเจริญ"],
    heads: ["วิศวกรอาวุโส นายนพดล", "สถาปนิก นายพีระศักดิ์", "วิศวกรโยธา นายอนุชิต", "นายช่างใหญ่ บัญชา"],
    supervisors: ["นายพิชัย ทวีคูณ", "นายชาญชัย ดำเนินการ", "นางสาวธิดา ใฝ่เรียน", "นายอาทิตย์ เรืองรอง"],
    contractors: ["หจก. เมืองไทยการโยธา", "บริษัท เจริญก้าวหน้าก่อสร้าง จำกัด", "หจก. ชลบุรีคอนกรีต", "บริษัท ยูไนเต็ดอินฟรา จำกัด"],
  };

  for (let i = 0; i < masterRows.slice(1).length; i++) {
    const row = masterRows[i + 1];
    const fy = row[0] as string;
    const plan = row[1] as string;
    const pName = row[2] as string;
    const tabName = row[3] as string;
    const budget = row[4] as number;

    const contractAmt = Math.round(budget * 0.95);
    const contractNo = `${Math.floor(Math.random() * 80) + 10}/${parseInt(fy) - 543}`;
    const sigDate = `${parseInt(fy) - 543}-02-15`;
    const stDate = `${parseInt(fy) - 543}-03-01`;
    const edDate = `${parseInt(fy) - 543}-09-01`; // 6 months, 184 days
    const duration = 184;

    const contractor = personnel.contractors[i % personnel.contractors.length];
    const chairman = personnel.chairmen[i % personnel.chairmen.length];
    const comm1 = personnel.comm1[i % personnel.comm1.length];
    const comm2 = personnel.comm2[i % personnel.comm2.length];
    const head = personnel.heads[i % personnel.heads.length];
    const supervisor = personnel.supervisors[i % personnel.supervisors.length];

    // Mock progress based on indices
    let progressP = 100;
    let progressF = 100;
    let disbursed = contractAmt;
    if (fy === "2570") {
      progressP = Math.floor(Math.random() * 50) + 30;
      progressF = progressP + (Math.floor(Math.random() * 11) - 6); // -5 to +5 difference
      disbursed = Math.round(contractAmt * (Math.floor(Math.random() * 30) + 10) / 100);
    } else {
      // 2569 projects: mostly completed, maybe 1 or 2 ongoing
      if (i === 6) {
        progressP = 90;
        progressF = 84;
        disbursed = Math.round(contractAmt * 0.75);
      }
    }

    const cellData = [
      ["ข้อมูลโครงการ", "", "", "งาน/กิจกรรมตามแผน (Tasks)", "", "", "", "", "บันทึกการทำงานและอัปเดต (Updates)", "", "", "", "งวดการเบิกจ่าย (Disbursements)", "", "", "", "", "", "รูปภาพความก้าวหน้าโครงการ (Photos)", "", ""],
      ["ชื่อโครงการ", pName, "", "ชื่องานย่อย", "เริ่มแผน", "สิ้นสุดแผน", "ความก้าวหน้า (%)", "", "วันที่อัปเดต", "รายละเอียดความคืบหน้า/ปัญหา", "ผู้รายงาน", "", "งวดที่", "จำนวนเงิน (บาท)", "วันที่เบิกจ่าย", "สถานะ", "หมายเหตุ", "", "ลิงก์รูปภาพ", "วันที่บันทึกภาพ", "หมายเหตุ/คำอธิบายภาพ"],
      ["ปีงบประมาณ", fy, "", "เตรียมการก่อสร้างและปรับระดับพื้นที่", stDate, `${parseInt(fy) - 543}-03-15`, 100, "", `${parseInt(fy) - 543}-03-10`, "ผู้รับจ้างนำเข้าเครื่องจักรและปรับระดับหน้างาน", supervisor, "", 1, Math.round(contractAmt * 0.25), `${parseInt(fy) - 543}-03-20`, "เบิกจ่ายแล้ว", "เบิกจ่ายงวดเริ่มแรกเตรียมพื้นที่สำเร็จ", "", "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=600&q=80", `${parseInt(fy) - 543}-03-10`, "ผู้รับจ้างปรับระดับดินเสร็จเรียบร้อย"],
      ["แผนงาน", plan, "", "งานขุดเจาะ/ฐานรากเสาเข็ม", `${parseInt(fy) - 543}-03-16`, `${parseInt(fy) - 543}-04-15`, progressP > 60 ? 100 : 80, "", `${parseInt(fy) - 543}-04-05`, "เสร็จสิ้นการตอกเสาเข็มทดสอบและเริ่มตอกจริง", supervisor, "", 2, Math.round(contractAmt * 0.25), progressP > 60 ? `${parseInt(fy) - 543}-04-20` : "-", progressP > 60 ? "เบิกจ่ายแล้ว" : "ยังไม่เบิกจ่าย", "เบิกจ่ายงวดเสาเข็มและคานคอดินสำเร็จ", "", "https://images.unsplash.com/photo-1581094288338-2314dddb7ecc?auto=format&fit=crop&w=600&q=80", `${parseInt(fy) - 543}-04-05`, "เครื่องตอกเสาเข็มเริ่มลงเสาเข็มทดสอบ"],
      ["วงเงิน", budget, "", "งานโครงสร้าง คสล. คาน-เสา", `${parseInt(fy) - 543}-04-16`, `${parseInt(fy) - 543}-06-15`, progressP > 80 ? 100 : 40, "", `${parseInt(fy) - 543}-05-12`, "เทคอนกรีตฐานรากสำเร็จไปแล้ว 80% มีฝนตกสะสม", supervisor, "", 3, Math.round(contractAmt * 0.25), progressP > 80 ? `${parseInt(fy) - 543}-06-25` : "-", progressP > 80 ? "เบิกจ่ายแล้ว" : "ยังไม่เบิกจ่าย", "เบิกจ่ายงวดเทคาน-เสาทั้งหมด", "", "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&w=600&q=80", `${parseInt(fy) - 543}-05-12`, "เทหล่อคานคอดินหลักเสร็จเรียบร้อย"],
      ["วงเงินตามสัญญา", contractAmt, "", "งานโครงสร้างชั้นบนและพื้นคอนกรีต", `${parseInt(fy) - 543}-06-16`, `${parseInt(fy) - 543}-07-31`, progressP > 95 ? 100 : 0, "", `${parseInt(fy) - 543}-06-20`, "งานคานเหล็กเริ่มยกขึ้นประกอบหน้างาน", supervisor, "", 4, Math.round(contractAmt * 0.25), progressP > 95 ? `${parseInt(fy) - 543}-08-10` : "-", progressP > 95 ? "เบิกจ่ายแล้ว" : "ยังไม่เบิกจ่าย", "เบิกจ่ายงวดสุดท้ายหลังส่งมอบและตรวจพัสดุเรียบร้อย", "", "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80", `${parseInt(fy) - 543}-06-20`, "งานคานเหล็กติดตั้งสเปนสำเร็จ"],
      ["เลขที่สัญญา", contractNo, "", "งานเก็บรายละเอียดและระบบระบายน้ำ", `${parseInt(fy) - 543}-08-01`, edDate, progressP === 100 ? 100 : 0, "", `${parseInt(fy) - 543}-07-15`, "ผู้รับจ้างประสานงานขอใบอนุญาตเชื่อมเสาไฟเพิ่ม", supervisor, "", "", "", "", "", "", "", "", "", ""],
      ["ลงนามสัญญา (วันที่)", sigDate, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["เริ่มสัญญา (วันที่)", stDate, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["สิ้นสุดสัญญา (วันที่)", edDate, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["อายุสัญญา (วัน)", duration, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["หยุดงานระหว่างทำงาน", "ไม่มี", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["ห้างที่รับผิดชอบ", contractor, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["ประธานตรวจรับพัสดุ", chairman, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["กรรมการคนที่ 1", comm1, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["กรรมการคนที่ 2", comm2, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["หัวหน้าผู้ควบคุมงาน", head, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["ผู้ควบคุมงาน", supervisor, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["ตรวจรับแล้ว (วันที่)", progressP === 100 ? edDate : "-", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["ความคืบหน้าตามแผน (%)", progressP / 100, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""], // Google sheet decimals for percentage
      ["ความคืบหน้าในสนาม (%)", progressF / 100, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["การเบิกจ่าย (บาท)", disbursed, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["ละติจูด (Latitude)", 13.7563 + (i * 0.05), "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["ลองจิจูด (Longitude)", 100.5018 + (i * 0.05), "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["สถานที่ตั้งโครงการ", `สถานที่ตั้งโครงการ ${pName}`, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ];

    const range = `'${tabName}'!A1:AJ100`;
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: cellData }),
    });
  }

  return ssId;
}

// Fetch spreadsheet metadata, Master rows and individual sheet details
export async function fetchSpreadsheetData(
  spreadsheetId: string,
  accessToken: string
): Promise<Project[]> {
  // 1. Get spreadsheet metadata to check which sheet names exist
  const metaRes = await safeFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`, {
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      "Cache-Control": "no-cache",
    },
    cache: "no-store",
  });

  if (!metaRes.ok) {
    const errorData = await metaRes.json().catch(() => ({}));
    const errMsg = errorData.error?.message || "";
    if (metaRes.status === 401 || isGoogleAuthError(metaRes.status, errMsg)) {
      clearCachedAccessToken();
      notifyGoogleAuthExpired();
      throw new GoogleAuthError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้ง");
    }
    if (metaRes.status === 403) {
      throw new Error("ไม่สามารถเปิดลิงก์ Google Sheets นี้ได้ เนื่องจากสิทธิ์ถูกปฏิเสธ (HTTP 403) กรุณาตรวจสอบว่าบัญชี Google ของคุณได้รับสิทธิ์เข้าถึงไฟล์นี้ หรือตั้งค่าแชร์ไฟล์เป็น 'ทุกคนที่มีลิงก์มีสิทธิ์อ่าน/แก้ไข'");
    }
    if (metaRes.status === 404) {
      throw new Error("ไม่พบไฟล์ Google Sheets ตาม ID/URL ที่ระบุ (HTTP 404) กรุณาตรวจสอบ ID หรือลิงก์ของไฟล์");
    }
    throw new Error(errMsg || "ไม่สามารถเปิดลิงก์ Google Sheets นี้ได้ กรุณาตรวจเช็คสิทธิ์การเข้าถึงไฟล์");
  }

  const metaData = await metaRes.json();
  let sheetNames: string[] = (metaData.sheets || []).map((s: any) => s.properties.title);

  // 1. Locate master tab (case-insensitive or common synonyms)
  let masterTabName = sheetNames.find(
    (name) =>
      name === "_Master_" ||
      name.toLowerCase() === "_master_" ||
      name.toLowerCase() === "master" ||
      name === "สารบัญ" ||
      name === "รายชื่อโครงการ" ||
      name === "โครงการทั้งหมด"
  );

  // If there's no master tab, attempt to automatically create and initialize it
  if (!masterTabName) {
    try {
      const addMasterRes = await safeFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: "_Master_" } } }],
        }),
      });

      if (addMasterRes.ok) {
        await safeFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/_Master_!A1:E1?valueInputOption=USER_ENTERED`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            values: [["ปีงบประมาณ", "แผนงาน", "ชื่อโครงการ", "ชื่อแผ่นงาน", "วงเงินงบประมาณ"]],
          }),
        });
        sheetNames.push("_Master_");
        masterTabName = "_Master_";
        return []; // Successfully initialized new empty master sheet
      }
    } catch (e) {
      console.warn("Could not auto-create _Master_ tab:", e);
    }
  }

  // If still no master tab, check if the first sheet contains project headers
  if (!masterTabName && sheetNames.length > 0) {
    try {
      const firstRes = await safeFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(formatSheetRange(sheetNames[0], "A1:E5"))}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Cache-Control": "no-cache",
          },
          cache: "no-store",
        }
      );
      if (firstRes.ok) {
        const firstData = await firstRes.json();
        const rows = firstData.values || [];
        if (rows.length > 0 && rows[0]) {
          const headerStr = rows[0].join(" ");
          if (
            headerStr.includes("โครงการ") ||
            headerStr.includes("ปีงบประมาณ") ||
            headerStr.includes("แผ่นงาน") ||
            headerStr.includes("แผนงาน")
          ) {
            masterTabName = sheetNames[0];
          }
        }
      }
    } catch (e) {}
  }

  // 2. Read master rows to get list of projects
  let projectList: {
    fiscalYear: string;
    planName: string;
    projectName: string;
    sheetName: string;
    budget: number;
  }[] = [];

  if (masterTabName) {
    const masterRes = await safeFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(masterTabName)}!A1:E200`,
      {
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          "Cache-Control": "no-cache",
        },
        cache: "no-store",
      }
    );

    if (masterRes.ok) {
      const masterData = await masterRes.json();
      const masterValues: string[][] = masterData.values || [];
      const seenTabs = new Set<string>();

      for (let i = 1; i < masterValues.length; i++) {
        const row = masterValues[i];
        if (!row || row.length < 4 || !row[3]) continue; // Ensure we have a sheet tab name
        const rawYear = row[0]?.toString().trim() || "";
        const rawPlan = row[1]?.toString().trim() || "";
        const rawProject = row[2]?.toString().trim() || "";
        const rawSheet = row[3]?.toString().trim() || "";
        const rawBudget = parseFloat(row[4]?.toString().replace(/,/g, "") || "0");

        // Strictly skip header rows, placeholder labels, or dummy projects
        if (!isValidProject({ sheetName: rawSheet, projectName: rawProject, fiscalYear: rawYear, planName: rawPlan })) {
          continue;
        }

        const normalizedSheet = rawSheet.toLowerCase();
        if (seenTabs.has(normalizedSheet)) {
          continue;
        }
        seenTabs.add(normalizedSheet);

        projectList.push({
          fiscalYear: rawYear,
          planName: rawPlan,
          projectName: rawProject,
          sheetName: rawSheet,
          budget: rawBudget,
        });
      }
    }
  }

  // If no master tab or master tab is empty, inspect existing non-system tabs to see if tabs themselves are project sheets
  if (projectList.length === 0) {
    const potentialTabs = sheetNames.filter(
      (s) =>
        !["_master_", "master", "sheet1", "แผ่นงาน1", "users", "managedsheets", "departments"].includes(
          s.trim().toLowerCase()
        )
    );

    if (potentialTabs.length > 0) {
      const sampleTabs = potentialTabs.slice(0, 15);
      const tabRanges = sampleTabs.map((t) => `ranges=${encodeURIComponent(formatSheetRange(t, "A1:B30"))}`).join("&");
      try {
        const batchRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${tabRanges}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Cache-Control": "no-cache",
            },
            cache: "no-store",
          }
        );
        if (batchRes.ok) {
          const batchData = await batchRes.json();
          const ranges = batchData.valueRanges || [];
          for (let i = 0; i < sampleTabs.length; i++) {
            const tabName = sampleTabs[i];
            const values = ranges[i]?.values || [];
            if (values.length > 1) {
              const project = parseProjectFromSheetData(
                {
                  fiscalYear: "2569",
                  planName: "แผนงานทั่วไป",
                  projectName: tabName,
                  sheetName: tabName,
                  budget: 0,
                },
                values
              );
              if (project.projectName && project.projectName !== "ชื่อโครงการ" && project.projectName !== "-") {
                projectList.push({
                  fiscalYear: project.fiscalYear || "2569",
                  planName: project.planName || "แผนงานทั่วไป",
                  projectName: project.projectName,
                  sheetName: tabName,
                  budget: project.budget || 0,
                });
              }
            }
          }
        }
      } catch (e) {}
    }
  }

  // If still no projects found, return empty array without throwing error
  if (projectList.length === 0) {
    return [];
  }

  // Filter project tabs that actually exist in the spreadsheet
  const validProjects = projectList.filter((p) => sheetNames.includes(p.sheetName));
  if (validProjects.length === 0) return [];

  // 3. Batch Get values of all these project sheets to minimize round trips
  const rangesQuery = validProjects
    .map((p) => `ranges=${encodeURIComponent(formatSheetRange(p.sheetName, "A1:AJ150"))}`)
    .join("&");

  let valueRanges: any[] = [];
  try {
    const batchRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${rangesQuery}`, {
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        "Cache-Control": "no-cache",
      },
      cache: "no-store",
    });

    if (batchRes.ok) {
      const batchData = await batchRes.json();
      valueRanges = batchData.valueRanges || [];
    }
  } catch (batchErr) {
    console.warn("values:batchGet encountered an issue, will fallback to individual reads:", batchErr);
  }

  const projects: Project[] = [];

  // 4. Parse values for each project
  for (let index = 0; index < validProjects.length; index++) {
    const meta = validProjects[index];
    let sheetData = valueRanges[index]?.values;

    // Fallback: If batchGet didn't return values for this tab, fetch it individually
    if (!sheetData) {
      try {
        const singleRes = await safeFetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(formatSheetRange(meta.sheetName, "A1:AJ150"))}`,
          { 
            headers: { 
              Authorization: `Bearer ${accessToken}`,
              "Cache-Control": "no-cache",
            },
            cache: "no-store",
          }
        );
        if (singleRes.ok) {
          const singleData = await singleRes.json();
          sheetData = singleData.values || [];
        }
      } catch (singleErr) {
        console.warn(`Could not read sheet tab "${meta.sheetName}":`, singleErr);
        sheetData = [];
      }
    }

    const project = parseProjectFromSheetData(meta, sheetData || []);
    projects.push(project);
  }

  return projects;
}

// Helper to parse a single project sheet tab values array into a Project object
export function parseProjectFromSheetData(
  meta: {
    fiscalYear: string;
    planName: string;
    projectName: string;
    sheetName: string;
    budget: number;
  },
  sheetData: any[][]
): Project {
  // Initialize project with defaults
  const project: Project = {
    fiscalYear: meta.fiscalYear,
    planName: meta.planName,
    projectName: meta.projectName,
    sheetName: meta.sheetName,
    budget: meta.budget,
    contractAmount: 0,
    contractNumber: "-",
    signedDate: "-",
    startDate: "-",
    endDate: "-",
    contractDays: 0,
    elapsedDays: 0,
    remainingDays: 0,
    suspensions: [],
    contractor: "-",
    chairman: "-",
    committee1: "-",
    committee2: "-",
    supervisorHead: "-",
    supervisor: "-",
    acceptedDate: "-",
    progressPlan: 0,
    progressField: 0,
    disbursedAmount: 0,
    disbursedPercent: 0,
    tasks: [],
    updates: [],
    disbursements: [],
    photos: [],
  };

  // Columns A & B contain the key-value attributes (Row 1 is Header)
  // Key-value parsing (Rows 2 to 65)
  for (let r = 1; r < Math.min(sheetData.length, 65); r++) {
    const row = sheetData[r];
    if (!row || row.length < 2) continue;
    const thaiKey = row[0]?.toString().trim();
    const rawValue = row[1]?.toString().trim();

    const mappedField = FIELD_MAPPING[thaiKey];
    if (mappedField) {
      if (mappedField === "suspensions") {
        project.suspensions = parseSuspensions(rawValue);
      } else if (mappedField === "mapObjects") {
        if (rawValue) {
          try {
            const parsed = JSON.parse(rawValue);
            if (Array.isArray(parsed)) {
              project.mapObjects = parsed;
            }
          } catch (e) {
            console.warn("Failed to parse mapObjects JSON from Google Sheet:", e);
          }
        }
      } else if (mappedField === "extensions") {
        if (rawValue && rawValue !== "-" && rawValue !== "[]") {
          try {
            const parsed = JSON.parse(rawValue);
            if (Array.isArray(parsed)) {
              project.extensions = parsed;
            } else if (parsed && typeof parsed === "object") {
              project.extensions = [parsed];
            }
          } catch (e) {
            console.warn("Failed to parse extensions JSON from Google Sheet:", e);
          }
        } else {
          project.extensions = [];
        }
      } else if (mappedField === "penaltyNoticeDocs") {
        if (rawValue) {
          try {
            const parsed = JSON.parse(rawValue);
            if (Array.isArray(parsed)) {
              project.penaltyNoticeDocs = parsed;
            }
          } catch (e) {
            console.warn("Failed to parse penaltyNoticeDocs JSON from Google Sheet:", e);
          }
        }
      } else if (mappedField === "penaltyRatePercent") {
        const cleaned = rawValue.replace(/%/g, "").trim();
        const val = parseFloat(cleaned);
        if (!isNaN(val)) {
          project.penaltyRatePercent = val;
        }
      } else if (mappedField === "customDailyFine") {
        const val = parseFloat(rawValue.replace(/,/g, ""));
        if (!isNaN(val) && val > 0) {
          project.customDailyFine = val;
        }
      } else if (mappedField === "waivedDays") {
        const val = parseInt(rawValue.replace(/,/g, ""), 10);
        if (!isNaN(val)) {
          project.waivedDays = Math.max(0, val);
        }
      } else if (mappedField === "penaltyStatus") {
        if (rawValue) {
          const trimmed = rawValue.trim();
          if (["accumulating", "reserved", "waived", "under_review", "none"].includes(trimmed)) {
            project.penaltyStatus = trimmed as any;
          } else if (trimmed.includes("งด") || trimmed.includes("ลด")) {
            project.penaltyStatus = "waived";
          } else if (trimmed.includes("สงวนสิทธิ์")) {
            project.penaltyStatus = "reserved";
          } else if (trimmed.includes("พิจารณา")) {
            project.penaltyStatus = "under_review";
          } else {
            project.penaltyStatus = "accumulating";
          }
        }
      } else if (mappedField === "waivedReason") {
        if (rawValue && rawValue !== "-") {
          project.waivedReason = rawValue.trim();
        }
      } else if (mappedField === "recoveryTargetDate") {
        if (rawValue && rawValue !== "-") {
          project.recoveryTargetDate = rawValue.trim();
        }
      } else if (mappedField === "recoveryPlanNotes") {
        if (rawValue && rawValue !== "-") {
          project.recoveryPlanNotes = rawValue.trim();
        }
      } else if (mappedField === "lat" || mappedField === "lng") {
        const val = parseFloat(rawValue.replace(/,/g, ""));
        if (!isNaN(val) && val !== 0) {
          project[mappedField] = val;
        }
      } else if (
        mappedField === "budget" ||
        mappedField === "contractAmount" ||
        mappedField === "disbursedAmount" ||
        mappedField === "contractDays"
      ) {
        project[mappedField] = parseFloat(rawValue.replace(/,/g, "")) || 0;
      } else if (mappedField === "progressPlan" || mappedField === "progressField") {
        // If value is stored as % decimals (e.g. 0.85 means 85%), we parse it
        let numeric = parseFloat(rawValue.replace(/%/g, "").trim());
        if (rawValue.includes("%")) {
          project[mappedField] = numeric;
        } else if (numeric > 0 && numeric <= 1.0) {
          project[mappedField] = Math.round(numeric * 100);
        } else {
          project[mappedField] = numeric || 0;
        }
      } else {
        // Strings
        if (mappedField === "planName" || mappedField === "projectName" || mappedField === "fiscalYear") {
          (project as any)[mappedField] = rawValue ? rawValue.trim() : (project as any)[mappedField];
        } else {
          (project as any)[mappedField] = rawValue;
        }
      }
    }
  }

  // Calculated percentage for disbursement
  if (project.contractAmount > 0) {
    project.disbursedPercent = Math.round((project.disbursedAmount / project.contractAmount) * 100);
  } else {
    project.disbursedPercent = 0;
  }

  // Dynamic Calculation of Contract and Elapsed/Remaining Days:
  if (project.startDate && project.startDate !== "-" && project.endDate && project.endDate !== "-") {
    const timeline = calculateProjectTimeline(project.startDate, project.endDate, project.contractDays, project.progressField);
    project.contractDays = timeline.contractDays;
    project.elapsedDays = timeline.elapsedDays;
    project.remainingDays = timeline.remainingDays;
  }

  // Tasks parsing: Columns D to G, starting from row 3 (which is index 2)
  // Row 2 is Header: ["ชื่องานย่อย", "เริ่มแผน", "สิ้นสุดแผน", "ความก้าวหน้า (%)"]
  for (let r = 1; r < sheetData.length; r++) {
    const row = sheetData[r];
    if (!row || !row[3]) continue; // Ensure task name exists in Col D

    const taskName = row[3]?.toString().trim();
    if (taskName === "ชื่องานย่อย" || taskName === "") continue;

    let taskProg = parseFloat(row[6]?.toString().replace(/%/g, "").trim()) || 0;
    if (taskProg > 0 && taskProg <= 1.0 && !row[6]?.toString().includes("%")) {
      taskProg = Math.round(taskProg * 100);
    }

    project.tasks.push({
      id: `t_${r}`,
      name: taskName,
      startDate: row[4]?.toString().trim() || "-",
      endDate: row[5]?.toString().trim() || "-",
      progress: taskProg,
    });
  }

  // Updates parsing: Columns I to K, starting from row 3 (which is index 2)
  // Row 2 is Header: ["วันที่อัปเดต", "รายละเอียดความคืบหน้า/ปัญหา", "ผู้รายงาน"]
  for (let r = 1; r < sheetData.length; r++) {
    const row = sheetData[r];
    if (!row || !row[8]) continue; // Column I (update date)

    const updateDate = row[8]?.toString().trim();
    if (updateDate === "วันที่อัปเดต" || updateDate === "") continue;

    project.updates.push({
      date: updateDate,
      details: row[9]?.toString().trim() || "",
      reporter: row[10]?.toString().trim() || "",
    });
  }
  project.updates = mergeSameDateUpdates(project.updates);

  // Disbursements parsing: Columns M to Q, starting from row 3 (which is index 2)
  // Row 2 is Header: ["งวดที่", "จำนวนเงิน (บาท)", "วันที่เบิกจ่าย", "สถานะ", "หมายเหตุ"]
  for (let r = 1; r < sheetData.length; r++) {
    const row = sheetData[r];
    if (!row || !row[12]) continue; // Column M (period number)

    const periodNoText = row[12]?.toString().trim();
    if (periodNoText === "งวดที่" || periodNoText === "") continue;

    const pNo = /^\d+$/.test(periodNoText) ? parseInt(periodNoText) : periodNoText;
    const rawRemarks = row[16]?.toString().trim() || "-";
    let parsedWorkRound: string | undefined = undefined;
    let cleanRemarks = rawRemarks;

    // Flexible regex supporting [ผลงาน: ครั้งที่ 1], [ผลงาน: 1], [ผลงาน ครั้งที่ 1], [กลุ่มผลงาน: ...], [งวดส่งมอบ: ...], [ครั้งที่ 1]
    const workMatch = rawRemarks.match(/\[(?:ผลงาน|กลุ่มผลงาน|งวดส่งมอบ|งวดงาน|ครั้งที่|งวด)\s*[:=]?\s*([^\]]+)\]/i)
      || rawRemarks.match(/^\[(ครั้งที่\s*\d+)\]/i);

    if (workMatch) {
      const rawMatched = workMatch[1].trim();
      if (!rawMatched.startsWith("ครั้งที่") && !isNaN(Number(rawMatched))) {
        parsedWorkRound = `ครั้งที่ ${rawMatched}`;
      } else if (!rawMatched.startsWith("ครั้งที่") && rawMatched.length > 0) {
        parsedWorkRound = rawMatched.includes("ครั้ง") ? rawMatched : `ครั้งที่ ${rawMatched}`;
      } else {
        parsedWorkRound = rawMatched;
      }
      cleanRemarks = rawRemarks
        .replace(/\[(?:ผลงาน|กลุ่มผลงาน|งวดส่งมอบ|งวดงาน|ครั้งที่|งวด)\s*[:=]?\s*[^\]]+\]\s*/gi, "")
        .replace(/^\[ครั้งที่\s*\d+\]\s*/gi, "")
        .trim() || "-";
    }

    // Check if Column L (row[11]) or other adjacent cells contain explicit work round tag
    if (!parsedWorkRound && row[11]) {
      const colLText = row[11]?.toString().trim();
      if (colLText && colLText !== "-" && (colLText.startsWith("ครั้งที่") || colLText.startsWith("ผลงาน"))) {
        parsedWorkRound = colLText.replace(/^ผลงาน\s*/i, "").trim();
      }
    }

    // Fallback to locally cached group mapping if remote remarks didn't contain explicit tag
    if (!parsedWorkRound) {
      try {
        const savedGroupJson = typeof window !== "undefined" ? localStorage.getItem(`disbursement_groups_${meta.sheetName}`) : null;
        if (savedGroupJson) {
          const groupMap = JSON.parse(savedGroupJson);
          if (groupMap && groupMap[String(pNo)]) {
            parsedWorkRound = groupMap[String(pNo)];
          }
        }
      } catch (e) {}
    }

    project.disbursements.push({
      workRound: parsedWorkRound,
      periodNo: pNo,
      amount: parseFloat(row[13]?.toString().replace(/,/g, "") || "0"),
      disbursedDate: row[14]?.toString().trim() || "-",
      status: row[15]?.toString().trim() === "เบิกจ่ายแล้ว" ? "เบิกจ่ายแล้ว" : "ยังไม่เบิกจ่าย",
      remarks: cleanRemarks,
    });
  }

  // Re-calculate disbursedAmount and disbursedPercent if disbursements exist
  if (project.disbursements.length > 0) {
    const paidTotal = project.disbursements
      .filter((d) => d.status === "เบิกจ่ายแล้ว")
      .reduce((sum, d) => sum + d.amount, 0);
    project.disbursedAmount = paidTotal;
    const denom = project.contractAmount > 0 ? project.contractAmount : (project.budget > 0 ? project.budget : 1);
    project.disbursedPercent = Math.min(100, Math.round((paidTotal / denom) * 100));
  }

  // Photos parsing: Columns S to U, starting from row 3 (which is index 2)
  // Row 2 is Header: ["ลิงก์รูปภาพ", "วันที่บันทึกภาพ", "หมายเหตุ/คำอธิบายภาพ"]
  for (let r = 1; r < sheetData.length; r++) {
    const row = sheetData[r];
    if (!row || !row[18]) continue; // Columns S (photo link)

    const imgUrl = row[18]?.toString().trim();
    if (imgUrl === "ลิงก์รูปภาพ" || imgUrl === "" || imgUrl === "-") continue;

    project.photos.push({
      imageUrl: imgUrl,
      date: row[19]?.toString().trim() || "-",
      remarks: row[20]?.toString().trim() || "-",
    });
  }

  // Periodic progress parsing: Columns W to AG, starting from row 3 (which is index 2)
  // Row 2 Header: ["ครั้งที่", "วันที่เริ่ม", "ถึงวันที่", "แผนงานประจำเดือน (%)", "แผนงานสะสม (%)", "แผนการเงินประจำเดือน (บาท)", "แผนการเงินสะสม (บาท)", "ผลงานประจำเดือน (%)", "ผลงานสะสม (%)", "ผลการเงินประจำเดือน (บาท)", "ผลการเงินสะสม (บาท)"]
  const periodicList: PeriodicProgressRecord[] = [];
  const parseNumPercent = (val: any): number | undefined => {
    if (val === null || val === undefined || val === "") return undefined;
    const str = val.toString().trim();
    if (str === "") return undefined;
    const hasPct = str.includes("%");
    const cleaned = str.replace(/,/g, "").replace(/%/g, "");
    if (cleaned === "" || isNaN(Number(cleaned))) return undefined;
    const num = parseFloat(cleaned);
    if (hasPct) return num;
    if (num > 0 && num <= 1.0) {
      return Number((num * 100).toFixed(2));
    }
    return num;
  };

  const parseNumAmount = (val: any): number | undefined => {
    if (val === null || val === undefined || val === "") return undefined;
    const str = val.toString().trim();
    if (str === "") return undefined;
    const cleaned = str.replace(/,/g, "");
    if (cleaned === "" || isNaN(Number(cleaned))) return undefined;
    return parseFloat(cleaned);
  };

  for (let r = 1; r < sheetData.length; r++) {
    const row = sheetData[r];
    if (!row) continue;

    // Filter out completely blank rows in periodic progress columns (index 22 to 32)
    const hasRowData = row.some((val, idx) => idx >= 22 && idx <= 32 && val !== undefined && val !== null && val.toString().trim() !== "");
    if (!hasRowData) continue;

    const periodNoText = row[22] !== undefined && row[22] !== null ? row[22].toString().trim() : "";
    if (periodNoText === "ครั้งที่" || periodNoText === "งวดที่" || periodNoText === "หมายเหตุท้ายตาราง") continue;

    const startDateVal = row[23] !== undefined && row[23] !== null ? row[23].toString().trim() : "";
    const endDateVal = row[24] !== undefined && row[24] !== null ? row[24].toString().trim() : "";

    const planMonthlyPercent = parseNumPercent(row[25]);
    const planCumulativePercent = parseNumPercent(row[26]);
    const planMonthlyAmount = parseNumAmount(row[27]);
    const planCumulativeAmount = parseNumAmount(row[28]);
    const actualMonthlyPercent = parseNumPercent(row[29]);
    const actualCumulativePercent = parseNumPercent(row[30]);
    const actualMonthlyAmount = parseNumAmount(row[31]);
    const actualCumulativeAmount = parseNumAmount(row[32]);

    let cleanStart = cleanSheetDate(startDateVal);
    let cleanEnd = cleanSheetDate(endDateVal);

    let pNo = NaN;
    if (periodNoText) {
      const match = periodNoText.match(/\d+/);
      if (match) {
        pNo = parseInt(match[0], 10);
      }
    }

    if (isNaN(pNo)) {
      pNo = periodicList.length + 1;
    }

    periodicList.push({
      periodNo: pNo,
      startDate: cleanStart || "-",
      endDate: cleanEnd || "-",
      planMonthlyPercent,
      planCumulativePercent,
      planMonthlyAmount,
      planCumulativeAmount,
      actualMonthlyPercent,
      actualCumulativePercent,
      actualMonthlyAmount,
      actualCumulativeAmount,
    });
  }

  // Ensure dates are complete and sequential for all parsed periods
  for (let i = 0; i < periodicList.length; i++) {
    const item = periodicList[i];
    if (!item.startDate || item.startDate === "-") {
      if (i === 0) {
        item.startDate = project.startDate && project.startDate !== "-" ? cleanSheetDate(project.startDate) : "15-01-2026";
      } else if (periodicList[i - 1].endDate && periodicList[i - 1].endDate !== "-") {
        item.startDate = addDaysToDate(periodicList[i - 1].endDate, 1);
      }
    }
    if (!item.endDate || item.endDate === "-") {
      if (item.startDate && item.startDate !== "-") {
        item.endDate = addDaysToDate(item.startDate, 29);
      }
    }
  }

  if (periodicList.length > 0) {
    const rawPeriodic = ensureMissingEarlyPeriods(periodicList, project.contractAmount || project.budget);
    project.periodicProgress = syncPeriodicWithDisbursements(
      rawPeriodic,
      project.disbursements || [],
      project.contractAmount || project.budget
    );
  } else {
    project.periodicProgress = undefined;
  }

  // Parse periodic remarks from Column AH (index 33), starting from row 3 (index 2)
  const periodicRemarksList: string[] = [];
  for (let r = 1; r < sheetData.length; r++) {
    const row = sheetData[r];
    if (row && row[33]) {
      const remarkVal = row[33].toString().trim();
      if (remarkVal && remarkVal !== "หมายเหตุท้ายตาราง" && remarkVal !== "รายการหมายเหตุ") {
        periodicRemarksList.push(remarkVal);
      }
    }
  }
  project.periodicRemarks = periodicRemarksList.length > 0 ? periodicRemarksList : undefined;

  return project;
}

// Helper to clean and extract Spreadsheet ID from any URL or raw ID string
export function extractSpreadsheetId(input: string): string {
  if (!input) return "";
  let str = String(input).trim();
  if (!str) return "";

  // 1. Remove zero-width characters, quotes, and outer whitespace
  str = str.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/^["']|["']$/g, "").trim();

  // 2. Handle HTML tags or iframe embed code
  const srcMatch = str.match(/(?:src|href)=["']([^"']+)["']/i);
  if (srcMatch && srcMatch[1]) {
    str = srcMatch[1].trim();
  }

  // 3. Handle Demo mode IDs
  if (str.toLowerCase().includes("demo") || str.startsWith("demo_")) return str;

  // 4. Try matching standard Google Drive / Sheets URL patterns with /d/<ID> or /e/<ID>
  const dMatch = str.match(/\/d\/([a-zA-Z0-9-_]{10,})/);
  if (dMatch && dMatch[1]) {
    return dMatch[1];
  }

  const eMatch = str.match(/\/e\/([a-zA-Z0-9-_]{10,})/);
  if (eMatch && eMatch[1]) {
    return eMatch[1];
  }

  // 5. Try matching URL parameter id=...
  const idParamMatch = str.match(/[?&]id=([a-zA-Z0-9-_]{10,})/i);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }

  // 6. If input contains URL components (slashes, google.com, http, etc.)
  if (str.includes("google.com") || str.startsWith("http") || str.includes("/")) {
    // Search for any long contiguous alphanumeric key (typically Google Sheet IDs are >= 15 chars)
    const longKeyMatch = str.match(/([a-zA-Z0-9-_]{15,})/);
    if (longKeyMatch && longKeyMatch[1]) {
      return longKeyMatch[1];
    }
    return "";
  }

  // 7. Fallback: Treat as raw Spreadsheet ID directly
  const cleaned = str.replace(/[^a-zA-Z0-9-_]/g, "");
  if (cleaned.length >= 5) {
    return cleaned;
  }

  return "";
}

// Helper to censor/mask a Spreadsheet ID for privacy & security display (e.g., "1t3unDW0...40lMeDk" or "1t3unDW0... ••••")
export function maskSpreadsheetId(id: string, startVisible = 6, endVisible = 4): string {
  if (!id) return "";
  const clean = id.trim();
  if (!clean || clean.startsWith("demo_") || clean.toLowerCase().includes("demo")) {
    return clean;
  }
  if (clean.length <= startVisible + endVisible + 3) {
    return `${clean.substring(0, 4)}...`;
  }
  const prefix = clean.substring(0, startVisible);
  const suffix = clean.substring(clean.length - endVisible);
  return `${prefix}••••••••${suffix}`;
}


// Convert Google GViz JSON table response to 2D string array
function parseGvizRows(gvizJson: any): string[][] {
  if (!gvizJson?.table) return [];
  
  // Extract column headers (Row 1 of Google Sheets)
  const cols = gvizJson.table.cols
    ? gvizJson.table.cols.map((c: any) => {
        if (!c) return "";
        if (c.label !== undefined && c.label !== null) return c.label.toString();
        if (c.f !== undefined && c.f !== null) return c.f.toString();
        if (c.v !== undefined && c.v !== null) return c.v.toString();
        return "";
      })
    : [];

  // Extract rows (Row 2+ of Google Sheets)
  const rows = gvizJson.table.rows
    ? gvizJson.table.rows.map((r: any) => {
        if (!r || !r.c) return [];
        return r.c.map((cell: any) => {
          if (!cell) return "";
          if (cell.f !== undefined && cell.f !== null) {
            return cell.f.toString();
          }
          if (cell.v !== null && cell.v !== undefined) {
            return cell.v.toString();
          }
          return "";
        });
      })
    : [];

  // Return combined array so that index 0 = Row 1 (Cols), index 1 = Row 2, index 2 = Row 3 (Data row 1)
  return [cols, ...rows];
}

// JSONP helper for cross-origin Google Sheets reading without browser CORS block
export function fetchGvizJsonp(spreadsheetId: string, sheetName: string, timeoutMs = 8000): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      reject(new Error("JSONP is only available in browser environment"));
      return;
    }

    const callbackName = `__gviz_cb_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
    const script = document.createElement("script");

    const cleanup = () => {
      delete (window as any)[callbackName];
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`หมดเวลาเชื่อมต่อแผ่นงาน '${sheetName}'`));
    }, timeoutMs);

    (window as any)[callbackName] = (data: any) => {
      clearTimeout(timer);
      cleanup();
      if (data && data.status === "ok") {
        resolve(data);
      } else if (data && data.status === "error") {
        const msg = data.errors?.[0]?.detailed_message || data.errors?.[0]?.message || "สิทธิ์การเข้าถึงไฟล์ถูกปฏิเสธ";
        reject(new Error(`Google Sheet ปฏิเสธการอ่านแผ่นงาน '${sheetName}': ${msg}`));
      } else {
        reject(new Error("รูปแบบข้อมูลตอบกลับจาก Google Sheet ไม่ถูกต้อง"));
      }
    };

    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error(`ไม่สามารถอ่านแผ่นงาน '${sheetName}' ได้ (กรุณาตั้งสิทธิ์แชร์เป็น 'ทุกคนที่มีลิงก์อ่านได้')`));
    };

    const rndStr = Math.random().toString(36).substring(2, 9);
    const sheetQuery = sheetName ? `sheet=${encodeURIComponent(sheetName)}&` : "";
    script.src = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?${sheetQuery}tqx=responseHandler:${callbackName}&_ts=${Date.now()}&_rnd=${rndStr}`;
    document.head.appendChild(script);
  });
}

// Unified GViz Reader (JSONP first to bypass CORS, safeFetch fallback)
async function fetchGvizSheetData(spreadsheetId: string, sheetName: string): Promise<any> {
  // Method 1: Try JSONP (bypasses browser CORS policy for public sheets)
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    try {
      const jsonpData = await fetchGvizJsonp(spreadsheetId, sheetName);
      if (jsonpData && jsonpData.status === "ok") {
        return jsonpData;
      }
    } catch (jsonpErr) {
      console.warn(`JSONP for '${sheetName || "default"}' missed/failed, trying safeFetch fallback:`, jsonpErr);
    }
  }

  // Method 2: Standard fetch fallback
  const ts = Date.now();
  const rndStr = Math.random().toString(36).substring(2, 9);
  const sheetQuery = sheetName ? `sheet=${encodeURIComponent(sheetName)}&` : "";
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?${sheetQuery}tqx=out:json&_ts=${ts}&_rnd=${rndStr}`;
  const res = await safeFetch(url, { cache: "no-store" });
  if (!res.ok) {
    if (res.status === 404) {
      if (sheetName === "_Master_" || !sheetName) {
        throw new Error(
          `ไม่สามารถเข้าถึงไฟล์ Google Sheet (ID: ${spreadsheetId}) ได้ (HTTP 404) กรุณาตรวจสอบ ID ของไฟล์ และตั้งค่าสิทธิ์แชร์ไฟล์เป็น 'ทุกคนที่มีลิงก์อ่านได้' หรือเข้าสู่ระบบด้วยบัญชี Google`
        );
      }
      throw new Error(`ไม่พบแผ่นงาน '${sheetName}' ในไฟล์ Google Sheet (HTTP 404)`);
    }
    throw new Error(`ไม่สามารถเปิดอ่านแผ่นงาน '${sheetName}' ได้ (HTTP ${res.status})`);
  }

  const text = await res.text();
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
  if (!match || !match[1]) {
    throw new Error(`โครงสร้างตอบกลับจาก Google Sheet แผ่นงาน '${sheetName}' ไม่ถูกต้อง หรือเป็นไฟล์ส่วนตัวที่ต้องตั้งค่า 'ทุกคนที่มีลิงก์อ่านได้'`);
  }

  const gvizData = JSON.parse(match[1]);
  if (gvizData.status !== "ok") {
    throw new Error(`ไม่สามารถอ่านแผ่นงาน '${sheetName}' ได้ (กรุณาตั้งสิทธิ์แชร์เป็น 'ทุกคนที่มีลิงก์อ่านได้')`);
  }

  return gvizData;
}

// Fetch public Google Sheet data via Google Visualization API (GViz) without needing OAuth token
export async function fetchPublicSpreadsheetData(spreadsheetId: string): Promise<Project[]> {
  let gvizData: any;
  try {
    gvizData = await fetchGvizSheetData(spreadsheetId, "_Master_");
  } catch (err: any) {
    // Fallback: If _Master_ tab wasn't found by that explicit name, try reading the workbook's default first sheet
    try {
      gvizData = await fetchGvizSheetData(spreadsheetId, "");
    } catch (e2) {
      throw err;
    }
  }

  const masterRows = parseGvizRows(gvizData);
  if (masterRows.length < 2) return [];

  const projectList: {
    fiscalYear: string;
    planName: string;
    projectName: string;
    sheetName: string;
    budget: number;
  }[] = [];

  const seenTabs = new Set<string>();
  for (let i = 1; i < masterRows.length; i++) {
    const row = masterRows[i];
    if (!row || row.length < 4 || !row[3]) continue;
    const rawYear = row[0]?.toString().trim() || "";
    const rawPlan = row[1]?.toString().trim() || "";
    const rawProject = row[2]?.toString().trim() || "";
    const rawSheet = row[3]?.toString().trim() || "";
    const rawBudget = parseFloat(row[4]?.toString().replace(/,/g, "") || "0");

    // Strictly skip header rows, placeholder labels, or dummy projects
    if (!isValidProject({ sheetName: rawSheet, projectName: rawProject, fiscalYear: rawYear, planName: rawPlan })) {
      continue;
    }

    const normalizedSheet = rawSheet.toLowerCase();
    if (seenTabs.has(normalizedSheet)) {
      continue;
    }
    seenTabs.add(normalizedSheet);

    projectList.push({
      fiscalYear: rawYear,
      planName: rawPlan,
      projectName: rawProject,
      sheetName: rawSheet,
      budget: rawBudget,
    });
  }

  if (projectList.length === 0) return [];

  const projects: Project[] = [];
  for (const meta of projectList) {
    try {
      const tabGviz = await fetchGvizSheetData(spreadsheetId, meta.sheetName);
      const sheetData = parseGvizRows(tabGviz);
      const project = parseProjectFromSheetData(meta, sheetData);
      projects.push(project);
    } catch (e) {
      console.warn(`Failed reading tab ${meta.sheetName} via GViz:`, e);
    }
  }

  return projects;
}

// Update basic contract details in Columns A & B of a project sheet
export async function updateProjectSheetDetails(
  spreadsheetId: string,
  project: Project,
  accessToken: string
): Promise<void> {
  const sheetName = project.sheetName;

  const cleanPlanName = project.planName?.trim() || "ไม่ระบุแผนงาน";
  const cleanFiscalYear = project.fiscalYear?.trim() || "2569";
  const cleanProjectName = project.projectName?.trim() || project.sheetName;

  // Re-map the project object into cell values for Column A & B (Rows 2 to 25)
  const labelsAndValues = [
    ["ชื่อโครงการ", cleanProjectName],                      // A2, B2
    ["ปีงบประมาณ", cleanFiscalYear],                       // A3, B3
    ["แผนงาน", cleanPlanName],                         // A4, B4
    ["วงเงิน", project.budget],                           // A5, B5
    ["วงเงินตามสัญญา", project.contractAmount],                   // A6, B6
    ["เลขที่สัญญา", project.contractNumber],                   // A7, B7
    ["ลงนามสัญญา (วันที่)", project.signedDate],                       // A8, B8
    ["เริ่มสัญญา (วันที่)", project.startDate],                        // A9, B9
    ["สิ้นสุดสัญญา (วันที่)", project.endDate],                          // A10, B10
    ["อายุสัญญา (วัน)", project.contractDays],                     // A11, B11
    ["หยุดงานระหว่างทำงาน", formatSuspensions(project.suspensions)],   // A12, B12
    ["ห้างที่รับผิดชอบ", project.contractor],                       // A13, B13
    ["ประธานตรวจรับพัสดุ", project.chairman],                         // A14, B14
    ["กรรมการคนที่ 1", project.committee1],                       // A15, B15
    ["กรรมการคนที่ 2", project.committee2],                       // A16, B16
    ["หัวหน้าผู้ควบคุมงาน", project.supervisorHead],                   // A17, B17
    ["ผู้ควบคุมงาน", project.supervisor],                       // A18, B18
    ["ตรวจรับแล้ว (วันที่)", project.acceptedDate],                     // A19, B19
    ["ความคืบหน้าตามแผน (%)", project.progressPlan / 100],               // A20, B20
    ["ความคืบหน้าในสนาม (%)", project.progressField / 100],              // A21, B21
    ["การเบิกจ่าย (บาท)", project.disbursedAmount],                  // A22, B22
    ["ละติจูด (Latitude)", project.lat ?? ""],                 // A23, B23
    ["ลองจิจูด (Longitude)", project.lng ?? ""],                // A24, B24
    ["สถานที่ตั้งโครงการ", project.locationName ?? ""],          // A25, B25
    ["รูปแบบหมุดปัก", project.pinStyle ?? "default"],            // A26, B26
    ["วัตถุบนแผนที่", project.mapObjects && project.mapObjects.length > 0 ? JSON.stringify(project.mapObjects) : ""], // A27, B27
    ["ประวัติการขยายเวลาสัญญา", project.extensions && project.extensions.length > 0 ? JSON.stringify(project.extensions) : ""], // A28, B28
    ["อัตราค่าปรับต่อวัน (%)", project.penaltyRatePercent !== undefined ? project.penaltyRatePercent : 0.05], // A29, B29
    ["ค่าปรับต่อวัน (บาท/วัน)", project.customDailyFine !== undefined && project.customDailyFine > 0 ? project.customDailyFine : ""], // A30, B30
    ["จำนวนวันงดหรือลดค่าปรับ", project.waivedDays !== undefined ? project.waivedDays : 0], // A31, B31
    ["เหตุผลการงดลดค่าปรับ", project.waivedReason ?? ""], // A32, B32
    ["สถานะการคิดค่าปรับ", project.penaltyStatus ?? "accumulating"], // A33, B33
    ["ประวัติหนังสือแจ้งเตือนค่าปรับ", project.penaltyNoticeDocs && project.penaltyNoticeDocs.length > 0 ? JSON.stringify(project.penaltyNoticeDocs) : ""], // A34, B34
    ["เป้าหมายแล้วเสร็จใหม่", project.recoveryTargetDate ?? ""], // A35, B35
    ["บันทึกมาตรการเร่งรัดงาน", project.recoveryPlanNotes ?? ""], // A36, B36
    ["หมายเหตุ", project.projectNotes ?? ""], // A37, B37
  ];

  const rangeA2B36 = `'${sheetName}'!A2:B${1 + labelsAndValues.length}`;
  const updateRes = await safeFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeA2B36)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: labelsAndValues }),
    }
  );

  if (!updateRes.ok) {
    const errorData = await updateRes.json().catch(() => ({}));
    const errMsg = errorData.error?.message || "";
    if (updateRes.status === 401 || isGoogleAuthError(updateRes.status, errMsg)) {
      clearCachedAccessToken();
      notifyGoogleAuthExpired();
      throw new GoogleAuthError(`การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้งเพื่อซิงค์ข้อมูลแผ่นงาน "${sheetName}"`);
    }
    if (errMsg.includes("Unable to parse range") || updateRes.status === 400 || updateRes.status === 404) {
      try {
        await createNewProject(spreadsheetId, project, accessToken);
        return;
      } catch (createErr: any) {
        console.warn("Auto-creating missing sheet tab failed:", createErr);
      }
    }
    throw new Error(errMsg ? `ล้มเหลวในการบันทึกข้อมูลของแผ่นงาน ${sheetName}: ${errMsg}` : `ล้มเหลวในการบันทึกข้อมูลของแผ่นงาน ${sheetName}`);
  }

  // Also update the budget and name in '_Master_' sheet list if they were changed
  // We'll read master, find sheetName, and update it.
  const masterRes = await safeFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/_Master_!A1:E200`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (masterRes.ok) {
    const masterData = await masterRes.json();
    const rows: string[][] = masterData.values || [];
    let foundRowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][3]?.toString().trim() === sheetName.trim()) {
        foundRowIndex = i + 1; // 1-indexed for sheets
        break;
      }
    }

    const updatedMasterRow = [
      [cleanFiscalYear, cleanPlanName, cleanProjectName, project.sheetName.trim(), project.budget],
    ];

    if (foundRowIndex > 0) {
      await safeFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/_Master_!A${foundRowIndex}:E${foundRowIndex}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: updatedMasterRow }),
        }
      );
    } else {
      await safeFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/_Master_!A:E:append?valueInputOption=USER_ENTERED`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: updatedMasterRow }),
        }
      );
    }
  }
}

// Append a new Subtask into Columns D-G of the project's sheet tab
export async function addProjectTask(
  spreadsheetId: string,
  sheetName: string,
  task: Task,
  accessToken: string
): Promise<void> {
  const rowValue = [[task.name, task.startDate, task.endDate, task.progress / 100]];

  // Appending after row 2 in columns D-G (we use append with a range of D:G)
  const rangeAppend = `'${sheetName}'!D:G`;
  const appendRes = await safeFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeAppend)}:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rowValue }),
    }
  );

  if (!appendRes.ok) {
    const errorData = await appendRes.json().catch(() => ({}));
    const errMsg = errorData.error?.message || "";
    if (appendRes.status === 401 || isGoogleAuthError(appendRes.status, errMsg)) {
      clearCachedAccessToken();
      notifyGoogleAuthExpired();
      throw new GoogleAuthError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้ง");
    }
    throw new Error(errMsg || `ล้มเหลวในการบันทึกงานย่อยลงในแผ่นงาน ${sheetName}`);
  }
}

// Update or clear & overwrite all subtasks in Columns D-G of a project sheet
export async function updateProjectTasks(
  spreadsheetId: string,
  sheetName: string,
  tasks: Task[],
  accessToken: string
): Promise<void> {
  const rowsToPad = Math.max(100, tasks.length);
  const values: any[][] = [];

  for (let i = 0; i < rowsToPad; i++) {
    if (i < tasks.length) {
      const t = tasks[i];
      values.push([t.name, t.startDate, t.endDate, t.progress / 100]);
    } else {
      values.push(["", "", "", ""]);
    }
  }

  const rangeToUpdate = `'${sheetName}'!D3:G${2 + values.length}`;
  const updateRes = await safeFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeToUpdate)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    }
  );

  if (!updateRes.ok) {
    const errorData = await updateRes.json().catch(() => ({}));
    const errMsg = errorData.error?.message || "";
    if (updateRes.status === 401 || isGoogleAuthError(updateRes.status, errMsg)) {
      clearCachedAccessToken();
      notifyGoogleAuthExpired();
      throw new GoogleAuthError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้ง");
    }
    throw new Error(errMsg || `ล้มเหลวในการอัปเดตงานย่อยลงในแผ่นงาน ${sheetName}`);
  }
}

// Append a new Daily Progress Update into Columns I-K of the project's sheet tab
export async function addProjectUpdate(
  spreadsheetId: string,
  sheetName: string,
  update: ProgressUpdate,
  accessToken: string
): Promise<void> {
  const rowValue = [[update.date, update.details, update.reporter]];

  // Appending in columns I-K
  const rangeAppend = `'${sheetName}'!I:K`;
  const appendRes = await safeFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeAppend)}:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rowValue }),
    }
  );

  if (!appendRes.ok) {
    const errorData = await appendRes.json().catch(() => ({}));
    const errMsg = errorData.error?.message || "";
    if (appendRes.status === 401 || isGoogleAuthError(appendRes.status, errMsg)) {
      clearCachedAccessToken();
      notifyGoogleAuthExpired();
      throw new GoogleAuthError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้ง");
    }
    throw new Error(errMsg || `ล้มเหลวในการบันทึกอัปเดตงานลงในแผ่นงาน ${sheetName}`);
  }
}

// Append a new Disbursement Period into Columns M-Q of the project's sheet tab
export async function addProjectDisbursement(
  spreadsheetId: string,
  sheetName: string,
  period: Omit<DisbursementPeriod, "id">,
  accessToken: string
): Promise<void> {
  const workRoundTag = period.workRound ? `[ผลงาน: ${period.workRound}] ` : "";
  const remarkToSave = period.remarks && period.remarks !== "-"
    ? `${workRoundTag}${period.remarks}`
    : (period.workRound ? `[ผลงาน: ${period.workRound}]` : "-");

  const rowValue = [[
    period.periodNo,
    period.amount,
    period.disbursedDate,
    period.status,
    remarkToSave,
  ]];

  const rangeAppend = `'${sheetName}'!M:Q`;
  const appendRes = await safeFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeAppend)}:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rowValue }),
    }
  );

  if (!appendRes.ok) {
    const errorData = await appendRes.json().catch(() => ({}));
    const errMsg = errorData.error?.message || "";
    if (appendRes.status === 401 || isGoogleAuthError(appendRes.status, errMsg)) {
      clearCachedAccessToken();
      notifyGoogleAuthExpired();
      throw new GoogleAuthError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้ง");
    }
    throw new Error(errMsg || `ล้มเหลวในการบันทึกงวดเบิกจ่ายลงในแผ่นงาน ${sheetName}`);
  }
}

// Update or clear & overwrite all disbursements in Columns M-Q of a project sheet
export async function updateProjectDisbursements(
  spreadsheetId: string,
  sheetName: string,
  disbursements: DisbursementPeriod[],
  newDisbursedAmount: number,
  accessToken: string
): Promise<void> {
  const rowsToPad = Math.max(100, disbursements.length);
  const values: any[][] = [];

  for (let i = 0; i < rowsToPad; i++) {
    if (i < disbursements.length) {
      const d = disbursements[i];
      const workRoundTag = d.workRound ? `[ผลงาน: ${d.workRound}] ` : "";
      const remarkToSave = d.remarks && d.remarks !== "-"
        ? `${workRoundTag}${d.remarks}`
        : (d.workRound ? `[ผลงาน: ${d.workRound}]` : "-");

      values.push([d.periodNo, d.amount, d.disbursedDate, d.status, remarkToSave]);
    } else {
      values.push(["", "", "", "", ""]);
    }
  }

  const batchRes = await safeFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: [
          {
            range: `'${sheetName}'!B22`,
            values: [[newDisbursedAmount]],
          },
          {
            range: `'${sheetName}'!M3:Q${2 + values.length}`,
            values,
          },
        ],
      }),
    }
  );

  if (!batchRes.ok) {
    const errorData = await batchRes.json().catch(() => ({}));
    const errMsg = errorData.error?.message || "";
    if (batchRes.status === 401 || isGoogleAuthError(batchRes.status, errMsg)) {
      clearCachedAccessToken();
      notifyGoogleAuthExpired();
      throw new GoogleAuthError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้ง");
    }
    throw new Error(errMsg || `ล้มเหลวในการอัปเดตรายการเบิกจ่ายลงในแผ่นงาน ${sheetName}`);
  }
}

// Append a new Photo Attachment into Columns S-U of the project's sheet tab
export async function addProjectPhoto(
  spreadsheetId: string,
  sheetName: string,
  photo: ProjectPhoto,
  accessToken: string
): Promise<void> {
  const rowValue = [[
    photo.imageUrl,
    photo.date,
    photo.remarks,
  ]];

  const rangeAppend = `'${sheetName}'!S:U`;
  const appendRes = await safeFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeAppend)}:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rowValue }),
    }
  );

  if (!appendRes.ok) {
    const errorData = await appendRes.json().catch(() => ({}));
    const errMsg = errorData.error?.message || "";
    if (appendRes.status === 401 || isGoogleAuthError(appendRes.status, errMsg)) {
      clearCachedAccessToken();
      notifyGoogleAuthExpired();
      throw new GoogleAuthError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้ง");
    }
    throw new Error(errMsg || `ล้มเหลวในการบันทึกรูปภาพลงในแผ่นงาน ${sheetName}`);
  }
}

// Update or clear & overwrite all photos in Columns S-U of a project sheet
export async function updateProjectPhotos(
  spreadsheetId: string,
  sheetName: string,
  photos: ProjectPhoto[],
  accessToken: string
): Promise<void> {
  const rowsToPad = Math.max(100, photos.length);
  const values: any[][] = [];

  for (let i = 0; i < rowsToPad; i++) {
    if (i < photos.length) {
      const p = photos[i];
      values.push([p.imageUrl, p.date, p.remarks]);
    } else {
      values.push(["", "", ""]);
    }
  }

  const rangeToUpdate = `'${sheetName}'!S3:U${2 + values.length}`;
  const updateRes = await safeFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeToUpdate)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    }
  );

  if (!updateRes.ok) {
    const errorData = await updateRes.json().catch(() => ({}));
    const errMsg = errorData.error?.message || "";
    if (updateRes.status === 401 || isGoogleAuthError(updateRes.status, errMsg)) {
      clearCachedAccessToken();
      notifyGoogleAuthExpired();
      throw new GoogleAuthError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้ง");
    }
    throw new Error(errMsg || `ล้มเหลวในการอัปเดตรูปภาพลงในแผ่นงาน ${sheetName}`);
  }
}

// Update or clear & overwrite all updates in Columns I-K of a project sheet
export async function updateProjectUpdates(
  spreadsheetId: string,
  sheetName: string,
  updates: ProgressUpdate[],
  accessToken: string
): Promise<void> {
  const rowsToPad = Math.max(100, updates.length);
  const values: any[][] = [];

  for (let i = 0; i < rowsToPad; i++) {
    if (i < updates.length) {
      const u = updates[i];
      values.push([u.date, u.details, u.reporter]);
    } else {
      values.push(["", "", ""]);
    }
  }

  const rangeToUpdate = `'${sheetName}'!I3:K${2 + values.length}`;
  const updateRes = await safeFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeToUpdate)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    }
  );

  if (!updateRes.ok) {
    const errorData = await updateRes.json().catch(() => ({}));
    const errMsg = errorData.error?.message || "";
    if (updateRes.status === 401 || isGoogleAuthError(updateRes.status, errMsg)) {
      clearCachedAccessToken();
      notifyGoogleAuthExpired();
      throw new GoogleAuthError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้ง");
    }
    throw new Error(errMsg || `ล้มเหลวในการอัปเดตบันทึกความคืบหน้าลงในแผ่นงาน ${sheetName}`);
  }
}

// Update or clear & overwrite Periodic Progress Table in Columns W-AH of a project sheet
export async function updateProjectPeriodicProgress(
  spreadsheetId: string,
  sheetName: string,
  records: PeriodicProgressRecord[],
  planPercent: number,
  actualPercent: number,
  accessToken: string,
  remarks?: string[]
): Promise<void> {
  const headerValues = [
    ["ตารางแผนงานและผลงานรายครั้ง (Periodic Progress)", "", "", "", "", "", "", "", "", "", "", "หมายเหตุท้ายตาราง"],
    ["ครั้งที่", "วันที่เริ่ม", "ถึงวันที่", "แผนงานประจำเดือน (%)", "แผนงานสะสม (%)", "แผนการเงินประจำเดือน (บาท)", "แผนการเงินสะสม (บาท)", "ผลงานประจำเดือน (%)", "ผลงานสะสม (%)", "ผลการเงินประจำเดือน (บาท)", "ผลการเงินสะสม (บาท)", "รายการหมายเหตุ"]
  ];

  const cleanRecords = recalculateCumulativeFields(records);
  const maxRows = Math.max(cleanRecords.length, remarks ? remarks.length : 0);

  const rowsToPad = Math.max(100, maxRows);
  const values: any[][] = [];
  for (let i = 0; i < rowsToPad; i++) {
    const r = i < cleanRecords.length ? cleanRecords[i] : null;
    const remarkText = remarks && remarks[i] !== undefined ? remarks[i] : "";
    if (r) {
      const pMonPct = typeof r.planMonthlyPercent === "number" && !isNaN(r.planMonthlyPercent) ? r.planMonthlyPercent / 100 : 0;
      const pCumPct = typeof r.planCumulativePercent === "number" && !isNaN(r.planCumulativePercent) ? r.planCumulativePercent / 100 : 0;
      const pMonAmt = typeof r.planMonthlyAmount === "number" && !isNaN(r.planMonthlyAmount) ? r.planMonthlyAmount : 0;
      const pCumAmt = typeof r.planCumulativeAmount === "number" && !isNaN(r.planCumulativeAmount) ? r.planCumulativeAmount : 0;
      const aMonPct = typeof r.actualMonthlyPercent === "number" && !isNaN(r.actualMonthlyPercent) ? r.actualMonthlyPercent / 100 : 0;
      const aCumPct = typeof r.actualCumulativePercent === "number" && !isNaN(r.actualCumulativePercent) ? r.actualCumulativePercent / 100 : 0;
      const aMonAmt = typeof r.actualMonthlyAmount === "number" && !isNaN(r.actualMonthlyAmount) ? r.actualMonthlyAmount : 0;
      const aCumAmt = typeof r.actualCumulativeAmount === "number" && !isNaN(r.actualCumulativeAmount) ? r.actualCumulativeAmount : 0;

      values.push([
        r.periodNo,
        r.startDate || "-",
        r.endDate || "-",
        pMonPct,
        pCumPct,
        pMonAmt,
        pCumAmt,
        aMonPct,
        aCumPct,
        aMonAmt,
        aCumAmt,
        remarkText,
      ]);
    } else if (remarkText) {
      values.push(["", "", "", 0, 0, 0, 0, 0, 0, 0, 0, remarkText]);
    } else {
      values.push(["", "", "", "", "", "", "", "", "", "", "", ""]);
    }
  }

  const batchRes = await safeFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: [
          {
            range: `'${sheetName}'!W1:AH2`,
            values: headerValues,
          },
          {
            range: `'${sheetName}'!B20:B21`,
            values: [[planPercent / 100], [actualPercent / 100]],
          },
          {
            range: `'${sheetName}'!W3:AH${2 + values.length}`,
            values,
          },
        ],
      }),
    }
  );

  if (!batchRes.ok) {
    const errorData = await batchRes.json().catch(() => ({}));
    const errMsg = errorData.error?.message || "";
    if (batchRes.status === 401 || isGoogleAuthError(batchRes.status, errMsg)) {
      clearCachedAccessToken();
      notifyGoogleAuthExpired();
      throw new GoogleAuthError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้ง");
    }
    throw new Error(
      errMsg
        ? `ล้มเหลวในการอัปเดตตารางแผนงานและผลงานรายครั้งลงในแผ่นงาน ${sheetName}: ${errMsg}`
        : `ล้มเหลวในการอัปเดตตารางแผนงานและผลงานรายครั้งลงในแผ่นงาน ${sheetName}`
    );
  }
}

// Create and insert a new project with its own sheet tab
export async function createNewProject(
  spreadsheetId: string,
  project: Project,
  accessToken: string
): Promise<void> {
  const sheetName = project.sheetName;

  // 1. Create a new sheet tab with title = sheetName
  const addSheetRes = await safeFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: { title: sheetName },
          },
        },
      ],
    }),
  });

  if (!addSheetRes.ok) {
    const errorData = await addSheetRes.json().catch(() => ({}));
    const errMsg = errorData.error?.message || "";
    if (addSheetRes.status === 401 || isGoogleAuthError(addSheetRes.status, errMsg)) {
      clearCachedAccessToken();
      notifyGoogleAuthExpired();
      throw new GoogleAuthError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้ง");
    }
    if (!errMsg.toLowerCase().includes("already exists")) {
      throw new Error(errMsg || `ไม่สามารถเพิ่มแผ่นงานชื่อ ${sheetName} ได้ (อาจเพราะชื่อซ้ำ)`);
    }
  }

  // 2. Populate cell content template for this project
  const cellData: any[][] = [
    [
      "ข้อมูลโครงการ", "", "",
      "งาน/กิจกรรมตามแผน (Tasks)", "", "", "", "",
      "บันทึกการทำงานและอัปเดต (Updates)", "", "", "",
      "งวดการเบิกจ่าย (Disbursements)", "", "", "", "", "",
      "รูปภาพความก้าวหน้าโครงการ (Photos)", "", "", "",
      "ตารางแผนงานและผลงานรายครั้ง (Periodic Progress)", "", "", "", "", "", "", "", "", "", "",
      "หมายเหตุท้ายตาราง"
    ],
    [
      "ชื่อโครงการ", project.projectName ?? "", "",
      "ชื่องานย่อย", "เริ่มแผน", "สิ้นสุดแผน", "ความก้าวหน้า (%)", "",
      "วันที่อัปเดต", "รายละเอียดความคืบหน้า/ปัญหา", "ผู้รายงาน", "",
      "งวดที่", "จำนวนเงิน (บาท)", "วันที่เบิกจ่าย", "สถานะ", "หมายเหตุ", "",
      "ลิงก์รูปภาพ", "วันที่บันทึกภาพ", "หมายเหตุ/คำอธิบายภาพ", "",
      "ครั้งที่", "วันที่เริ่ม", "ถึงวันที่", "แผนงานประจำเดือน (%)", "แผนงานสะสม (%)", "แผนการเงินประจำเดือน (บาท)", "แผนการเงินสะสม (บาท)", "ผลงานประจำเดือน (%)", "ผลงานสะสม (%)", "ผลการเงินประจำเดือน (บาท)", "ผลการเงินสะสม (บาท)",
      "รายการหมายเหตุ"
    ],
    ["ปีงบประมาณ", project.fiscalYear ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["แผนงาน", project.planName ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["วงเงิน", project.budget ?? 0, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["วงเงินตามสัญญา", project.contractAmount ?? 0, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["เลขที่สัญญา", project.contractNumber ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["ลงนามสัญญา (วันที่)", project.signedDate ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["เริ่มสัญญา (วันที่)", project.startDate ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["สิ้นสุดสัญญา (วันที่)", project.endDate ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["อายุสัญญา (วัน)", project.contractDays ?? 0, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["หยุดงานระหว่างทำงาน", formatSuspensions(project.suspensions), "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["ห้างที่รับผิดชอบ", project.contractor ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["ประธานตรวจรับพัสดุ", project.chairman ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["กรรมการคนที่ 1", project.committee1 ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["กรรมการคนที่ 2", project.committee2 ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["หัวหน้าผู้ควบคุมงาน", project.supervisorHead ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["ผู้ควบคุมงาน", project.supervisor ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["ตรวจรับแล้ว (วันที่)", project.acceptedDate ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["ความคืบหน้าตามแผน (%)", (project.progressPlan || 0) / 100, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["ความคืบหน้าในสนาม (%)", (project.progressField || 0) / 100, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["การเบิกจ่าย (บาท)", project.disbursedAmount ?? 0, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["ละติจูด (Latitude)", project.lat ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["ลองจิจูด (Longitude)", project.lng ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["สถานที่ตั้งโครงการ", project.locationName ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["รูปแบบหมุดปัก", project.pinStyle ?? "default", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["วัตถุบนแผนที่", project.mapObjects && project.mapObjects.length > 0 ? JSON.stringify(project.mapObjects) : "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["ประวัติการขยายเวลาสัญญา", project.extensions && project.extensions.length > 0 ? JSON.stringify(project.extensions) : "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["อัตราค่าปรับต่อวัน (%)", project.penaltyRatePercent !== undefined ? project.penaltyRatePercent : 0.05, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["ค่าปรับต่อวัน (บาท/วัน)", project.customDailyFine !== undefined && project.customDailyFine > 0 ? project.customDailyFine : "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["จำนวนวันงดหรือลดค่าปรับ", project.waivedDays !== undefined ? project.waivedDays : 0, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["เหตุผลการงดลดค่าปรับ", project.waivedReason ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["สถานะการคิดค่าปรับ", project.penaltyStatus ?? "accumulating", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["ประวัติหนังสือแจ้งเตือนค่าปรับ", project.penaltyNoticeDocs && project.penaltyNoticeDocs.length > 0 ? JSON.stringify(project.penaltyNoticeDocs) : "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["เป้าหมายแล้วเสร็จใหม่", project.recoveryTargetDate ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["บันทึกมาตรการเร่งรัดงาน", project.recoveryPlanNotes ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["หมายเหตุ", project.projectNotes ?? "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ];

  const rangeA1AJ100 = `'${sheetName}'!A1:AJ100`;
  const writeRes = await safeFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeA1AJ100)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: cellData }),
  });

  if (!writeRes.ok && (writeRes.status === 401 || isGoogleAuthError(writeRes.status))) {
    clearCachedAccessToken();
    notifyGoogleAuthExpired();
    throw new GoogleAuthError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้ง");
  }

  // 3. Append to the master coordinate list '_Master_' sheet if not already listed
  const masterRes = await safeFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/_Master_!A1:E200`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  let inMaster = false;
  if (masterRes.ok) {
    const masterData = await masterRes.json();
    const rows: string[][] = masterData.values || [];
    inMaster = rows.some((r) => r[3] === sheetName);
  }

  if (!inMaster) {
    const masterRow = [[project.fiscalYear, project.planName, project.projectName, project.sheetName, project.budget]];
    await safeFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/_Master_!A:E:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: masterRow }),
      }
    );
  }
}

// Fetch users from "Users" sheet
export async function fetchUsersFromSpreadsheet(
  spreadsheetId: string,
  accessToken?: string
): Promise<Array<{ username: string; password?: string; role: "Owner" | "Admin" | "User"; status: "Active" | "Inactive"; name?: string; department?: string; permissionLevel?: "view" | "edit" }>> {
  if (!spreadsheetId || spreadsheetId.startsWith("demo_")) {
    return [];
  }

  // 1) Try API v4 if accessToken is present and valid
  if (accessToken && accessToken !== "demo-access-token") {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("Users!A1:G100")}`;
      const res = await safeFetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        const rows: string[][] = data.values || [];
        if (rows.length >= 2) {
          const usersList: Array<{ username: string; password?: string; role: "Owner" | "Admin" | "User"; status: "Active" | "Inactive"; name?: string; department?: string; permissionLevel?: "view" | "edit" }> = [];

          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[0]) continue;

            const username = row[0]?.toString().trim();
            const password = row[1]?.toString().trim() || "";
            const rawRole = row[2]?.toString().trim().toLowerCase();
            const rawStatus = row[3]?.toString().trim();
            const name = row[4]?.toString().trim() || username;
            const department = row[5]?.toString().trim() || "ทุกฝ่าย (*)";
            const rawPerm = row[6]?.toString().trim().toLowerCase();

            if (username.toLowerCase() === "username" || username.toLowerCase() === "ชื่อผู้ใช้") {
              continue;
            }

            let role: "Owner" | "Admin" | "User" = "User";
            if (rawRole === "owner" || rawRole.includes("owner") || rawRole.includes("เจ้าของ")) role = "Owner";
            else if (rawRole === "admin" || rawRole.includes("admin") || rawRole.includes("ผู้ดูแล")) role = "Admin";

            const status: "Active" | "Inactive" = rawStatus?.toLowerCase() === "inactive" ? "Inactive" : "Active";
            const permissionLevel: "view" | "edit" = role === "Owner" || role === "Admin" || rawPerm === "edit" ? "edit" : "view";

            usersList.push({
              username,
              password,
              role,
              status,
              name,
              department,
              permissionLevel,
            });
          }

          if (usersList.length > 0) return usersList;
        }
      }
    } catch (err) {
      console.warn("API v4 fetch for Users failed, trying public GViz:", err);
    }
  }

  // 2) Public GViz reader fallback (works for any browser / guest without OAuth)
  try {
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=Users&tqx=out:json`;
    const res = await fetch(gvizUrl);
    if (!res.ok) return [];

    const text = await res.text();
    const jsonString = text.replace(/^[^\(]*\(/, "").replace(/\);?\s*$/, "");
    const parsed = JSON.parse(jsonString);
    const rows = parsed?.table?.rows;
    if (!rows || !Array.isArray(rows) || rows.length < 1) return [];

    const usersList: Array<{ username: string; password?: string; role: "Owner" | "Admin" | "User"; status: "Active" | "Inactive"; name?: string; department?: string; permissionLevel?: "view" | "edit" }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cells = row?.c || [];
      const username = String(cells[0]?.v || "").trim();
      const password = String(cells[1]?.v || "").trim();
      const rawRole = String(cells[2]?.v || "").trim().toLowerCase();
      const rawStatus = String(cells[3]?.v || "").trim();
      const name = String(cells[4]?.v || "").trim() || username;
      const department = String(cells[5]?.v || "").trim() || "ทุกฝ่าย (*)";
      const rawPerm = String(cells[6]?.v || "").trim().toLowerCase();

      if (!username || username.toLowerCase() === "username" || username.toLowerCase() === "ชื่อผู้ใช้") {
        continue;
      }

      let role: "Owner" | "Admin" | "User" = "User";
      if (rawRole === "owner" || rawRole.includes("owner") || rawRole.includes("เจ้าของ")) role = "Owner";
      else if (rawRole === "admin" || rawRole.includes("admin") || rawRole.includes("ผู้ดูแล")) role = "Admin";

      const status: "Active" | "Inactive" = rawStatus?.toLowerCase() === "inactive" ? "Inactive" : "Active";
      const permissionLevel: "view" | "edit" = role === "Owner" || role === "Admin" || rawPerm === "edit" ? "edit" : "view";

      usersList.push({
        username,
        password,
        role,
        status,
        name,
        department,
        permissionLevel,
      });
    }

    return usersList;
  } catch (err) {
    console.warn("Public GViz read for Users failed:", err);
    return [];
  }
}

// Fetch managed sheets list from "ManagedSheets" tab in Google Spreadsheet
export async function fetchManagedSheetsFromSpreadsheet(
  spreadsheetId: string,
  accessToken?: string
): Promise<Array<{ id: string; name: string; urlOrId: string; spreadsheetId: string; createdAt: string; notes?: string; department?: string }>> {
  if (!spreadsheetId || spreadsheetId.startsWith("demo_")) {
    return [];
  }

  // 1) Try API v4 if accessToken is present
  if (accessToken && accessToken !== "demo-access-token") {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("ManagedSheets!A1:G200")}`;
      const res = await safeFetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        const rows: string[][] = data.values || [];
        if (rows.length >= 2) {
          const result: Array<{ id: string; name: string; urlOrId: string; spreadsheetId: string; createdAt: string; notes?: string; department?: string }> = [];
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[0]) continue;

            const id = row[0]?.toString().trim() || `sheet_${Date.now()}_${i}`;
            const name = row[1]?.toString().trim() || "ไฟล์ Google Sheet";
            const urlOrId = row[2]?.toString().trim() || row[3]?.toString().trim() || "";
            const extractedId = row[3]?.toString().trim() || extractSpreadsheetId(urlOrId) || "";
            const notes = row[4]?.toString().trim() || "";
            const createdAt = row[5]?.toString().trim() || new Date().toISOString();
            const rawDept = row[6]?.toString().trim() || "";
            const department = rawDept || (name.includes("สบ.4") ? "สบ.4" : (name.includes("ฝ่ายอื่น") ? "ฝ่ายอื่น" : "สบ.4"));

            if (
              !extractedId ||
              id.toLowerCase() === "id" ||
              name.toLowerCase() === "name" ||
              extractedId.toLowerCase() === "spreadsheet_id" ||
              extractedId.toLowerCase().includes("spreadsheet_id")
            ) {
              continue;
            }

            result.push({
              id,
              name,
              urlOrId: urlOrId || extractedId,
              spreadsheetId: extractedId,
              notes,
              createdAt,
              department,
            });
          }
          if (result.length > 0) return result;
        }
      }
    } catch (err) {
      console.warn("API v4 fetch for ManagedSheets failed, trying public GViz:", err);
    }
  }

  // 2) Public GViz reader fallback (works for any browser / guest without OAuth)
  try {
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=ManagedSheets&tqx=out:json`;
    const res = await fetch(gvizUrl);
    if (!res.ok) return [];

    const text = await res.text();
    const jsonString = text.replace(/^[^\(]*\(/, "").replace(/\);?\s*$/, "");
    const parsed = JSON.parse(jsonString);
    const rows = parsed?.table?.rows;
    if (!rows || !Array.isArray(rows) || rows.length < 1) return [];

    // Verify header signature to ensure this response comes from the "ManagedSheets" tab
    // (GViz returns the 1st sheet tab if "ManagedSheets" tab doesn't exist)
    const firstRowCells = rows[0]?.c || [];
    const cell0 = String(firstRowCells[0]?.v || "").toLowerCase();
    const cell1 = String(firstRowCells[1]?.v || "").toLowerCase();
    const cell2 = String(firstRowCells[2]?.v || "").toLowerCase();
    const cell3 = String(firstRowCells[3]?.v || "").toLowerCase();

    const isGenuineManagedHeader =
      cell0.includes("id") ||
      cell1.includes("name") ||
      cell1.includes("ชื่อ") ||
      cell2.includes("url") ||
      cell3.includes("spreadsheet");

    if (!isGenuineManagedHeader) {
      return [];
    }

    const result: Array<{ id: string; name: string; urlOrId: string; spreadsheetId: string; createdAt: string; notes?: string; department?: string }> = [];
    for (let i = 0; i < rows.length; i++) {
      const c = rows[i]?.c;
      if (!c) continue;

      const id = c[0]?.v ? String(c[0].v).trim() : `sheet_${Date.now()}_${i}`;
      const name = c[1]?.v ? String(c[1].v).trim() : "ไฟล์ Google Sheet";
      const urlOrId = c[2]?.v ? String(c[2].v).trim() : (c[3]?.v ? String(c[3].v).trim() : "");
      const extractedId = c[3]?.v ? String(c[3].v).trim() : extractSpreadsheetId(urlOrId) || "";
      const notes = c[4]?.v ? String(c[4].v).trim() : "";
      const createdAt = c[5]?.v ? String(c[5].v).trim() : new Date().toISOString();
      const rawDept = c[6]?.v ? String(c[6].v).trim() : "";
      const department = rawDept || (name.includes("สบ.4") ? "สบ.4" : (name.includes("ฝ่ายอื่น") ? "ฝ่ายอื่น" : "สบ.4"));

      const lowerName = name.toLowerCase();
      const lowerExtracted = extractedId.toLowerCase();

      if (
        !extractedId ||
        extractedId.length < 15 ||
        !/^[a-zA-Z0-9_-]+$/.test(extractedId) ||
        id.toLowerCase() === "id" ||
        lowerName === "name" ||
        lowerName === "ชื่อ" ||
        lowerName === "ชื่อไฟล์" ||
        lowerExtracted === "spreadsheet_id" ||
        lowerExtracted === "spreadsheet id"
      ) {
        continue;
      }

      result.push({
        id,
        name,
        urlOrId: urlOrId || extractedId,
        spreadsheetId: extractedId,
        notes,
        createdAt,
        department,
      });
    }
    return result;
  } catch (err) {
    console.warn("Error fetching ManagedSheets via GViz:", err);
    return [];
  }
}

// Save / sync managed sheets list to "ManagedSheets" tab in Google Spreadsheet
export async function syncManagedSheetsToSpreadsheet(
  spreadsheetId: string,
  accessToken: string,
  managedSheetsList: Array<{ id: string; name: string; urlOrId: string; spreadsheetId: string; createdAt: string; notes?: string; department?: string }>
): Promise<void> {
  if (!spreadsheetId || spreadsheetId.startsWith("demo_") || !accessToken || accessToken === "demo-access-token") {
    return;
  }

  // 1. Try to ensure sheet tab "ManagedSheets" exists, add if not present
  try {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: { title: "ManagedSheets" },
            },
          },
        ],
      }),
    });
  } catch (e) {
    // Tab "ManagedSheets" likely already exists, ignore error
  }

  // 2. Clear range ManagedSheets!A2:G200
  try {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("ManagedSheets!A2:G200")}:clear`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
  } catch (e) {
    console.warn("Could not clear ManagedSheets range:", e);
  }

  // 3. Write Headers + Rows
  const values = [
    ["ID", "Name", "URL_or_ID", "Spreadsheet_ID", "Notes", "Created_At", "Department"],
    ...managedSheetsList.map((s) => [
      s.id,
      s.name,
      s.urlOrId,
      s.spreadsheetId,
      s.notes || "",
      s.createdAt || new Date().toISOString(),
      s.department || (s.name.includes("สบ.4") ? "สบ.4" : (s.name.includes("ฝ่ายอื่น") ? "ฝ่ายอื่น" : "สบ.4")),
    ]),
  ];

  const range = `ManagedSheets!A1:G${values.length}`;
  const res = await safeFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.error?.message || "";
    if (res.status === 401 || isGoogleAuthError(res.status, errMsg)) {
      clearCachedAccessToken();
      notifyGoogleAuthExpired();
      throw new GoogleAuthError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้ง");
    }
    throw new Error(errMsg || "ล้มเหลวในการบันทึกรายการจัดการไฟล์ลง Google Sheet (แท็บ ManagedSheets)");
  }
}

// Save / sync users list to "Users" sheet in Google Spreadsheet (Owner only)
export async function syncUsersToSpreadsheet(
  spreadsheetId: string,
  accessToken: string,
  usersList: Array<{ username: string; password?: string; role: "Owner" | "Admin" | "User"; status: "Active" | "Inactive"; name?: string; department?: string; permissionLevel?: "view" | "edit" }>
): Promise<void> {
  if (!spreadsheetId || spreadsheetId.startsWith("demo_") || !accessToken || accessToken === "demo-access-token") {
    return;
  }

  // Security check: Only Owner is permitted to save data to "Users" sheet in Google Spreadsheet
  const session = getUserSession();
  if (session && session.role !== "Owner") {
    throw new Error("สิทธิ์ไม่เพียงพอ: ในแท็บ Users ของ Google Sheet อนุญาตให้เฉพาะบทบาท 👑 Owner เท่านั้นที่สามารถบันทึกข้อมูลได้ (Admin สามารถบันทึกแท็บอื่นๆ ได้ตามปกติ)");
  }

  // 1. Try to ensure sheet tab "Users" exists, add if not present
  try {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: { title: "Users" },
            },
          },
        ],
      }),
    });
  } catch (e) {
    // Sheet tab "Users" likely already exists, ignore error
  }

  // 2. Clear range Users!A2:G200
  try {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("Users!A2:G200")}:clear`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
  } catch (e) {
    console.warn("Could not clear Users sheet range:", e);
  }

  // 3. Write Headers + User Rows
  const values = [
    ["Username", "Password", "Role", "Status", "Name", "Department", "PermissionLevel"],
    ...usersList.map((u) => [
      u.username,
      u.password || "",
      u.role,
      u.status,
      u.name || u.username,
      u.department || "ทุกฝ่าย (*)",
      u.role === "Owner" ? "edit" : (u.permissionLevel || (u.role === "Admin" ? "edit" : "view")),
    ]),
  ];

  const range = `Users!A1:G${values.length}`;
  const res = await safeFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.error?.message || "";
    if (res.status === 401 || isGoogleAuthError(res.status, errMsg)) {
      clearCachedAccessToken();
      notifyGoogleAuthExpired();
      throw new GoogleAuthError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้ง");
    }
    throw new Error(errMsg || "ล้มเหลวในการบันทึกข้อมูลผู้ใช้งานลง Google Sheet (แท็บ Users)");
  }
}

// Delete a project from Google Sheets (removes row from _Master_ and deletes the sheet tab)
export async function deleteProjectFromSpreadsheet(
  spreadsheetId: string,
  sheetName: string,
  accessToken?: string | null
): Promise<void> {
  if (!spreadsheetId || spreadsheetId.startsWith("demo_")) {
    return;
  }

  const cleanSheetName = sheetName.trim();

  // 1. Remove row from '_Master_' sheet if accessToken is present
  if (accessToken && accessToken !== "demo-access-token") {
    try {
      const masterRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/_Master_!A1:E200`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (masterRes.ok) {
        const masterData = await masterRes.json();
        const rows: string[][] = masterData.values || [];
        if (rows.length > 0) {
          const header = rows[0];
          const remainingRows = rows.slice(1).filter((r) => r[3]?.toString().trim() !== cleanSheetName);

          // Clear range _Master_!A2:E200
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("_Master_!A2:E200")}:clear`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );

          if (remainingRows.length > 0) {
            const writeValues = [header, ...remainingRows];
            const rangeToUpdate = `_Master_!A1:E${writeValues.length}`;
            await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeToUpdate)}?valueInputOption=USER_ENTERED`,
              {
                method: "PUT",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ values: writeValues }),
              }
            );
          }
        }
      }
    } catch (err) {
      console.warn("Could not remove row from _Master_ sheet:", err);
    }

    // 2. Find sheetId for the sheetName tab and delete the tab via batchUpdate
    try {
      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (metaRes.ok) {
        const metaData = await metaRes.json();
        const sheetsList: Array<{ properties: { sheetId: number; title: string } }> = metaData.sheets || [];
        const targetSheet = sheetsList.find(
          (s) => s.properties?.title?.trim().toLowerCase() === cleanSheetName.toLowerCase()
        );

        if (targetSheet && targetSheet.properties?.sheetId !== undefined) {
          const targetSheetId = targetSheet.properties.sheetId;
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requests: [
                {
                  deleteSheet: {
                    sheetId: targetSheetId,
                  },
                },
              ],
            }),
          });
        }
      }
    } catch (err) {
      console.warn(`Could not delete sheet tab ${cleanSheetName}:`, err);
    }
  }
}

/**
 * Ensures that the required project sheet tabs and _Master_ sheet exist in the spreadsheet.
 * If any tabs are missing, automatically creates them via batchUpdate addSheet.
 * Returns a Set of existing sheet titles.
 */
export async function ensureSpreadsheetTabsExist(
  spreadsheetId: string,
  requiredTabNames: string[],
  accessToken: string
): Promise<Set<string>> {
  const existingTitles = new Set<string>();
  try {
    const metaRes = await safeFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!metaRes.ok) return existingTitles;
    const metaData = await metaRes.json();
    (metaData.sheets || []).forEach((s: any) => {
      if (s?.properties?.title) existingTitles.add(s.properties.title.trim());
    });
  } catch (e) {
    console.warn("Could not query existing sheets metadata:", e);
    return existingTitles;
  }

  const requests: any[] = [];
  if (!existingTitles.has("_Master_")) {
    requests.push({ addSheet: { properties: { title: "_Master_" } } });
  }

  for (const name of requiredTabNames) {
    const trimmed = (name || "").trim();
    if (!trimmed || trimmed === "ชื่อแผ่นงาน" || trimmed === "_Master_" || trimmed === "Users" || trimmed === "Departments" || trimmed === "ManagedSheets") {
      continue;
    }
    if (!existingTitles.has(trimmed)) {
      requests.push({ addSheet: { properties: { title: trimmed } } });
      existingTitles.add(trimmed); // prevent duplicates in request list
    }
  }

  if (requests.length > 0) {
    try {
      const addRes = await safeFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
      });
      if (addRes.ok) {
        // If _Master_ was newly added, initialize its header row
        await safeFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/_Master_!A1:E1?valueInputOption=USER_ENTERED`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            values: [["ปีงบประมาณ", "แผนงาน", "ชื่อโครงการ", "ชื่อแผ่นงาน", "วงเงินงบประมาณ"]],
          }),
        }).catch(() => {});
      }
    } catch (createErr) {
      console.warn("Auto-creation of missing sheet tabs encountered warning:", createErr);
    }
  }

  return existingTitles;
}

/**
 * Batch saves projects to Google Sheets in high-performance single HTTP requests.
 * Consolidates Details, Tasks, Updates, Disbursements, Photos, and Periodic Progress
 * into batchUpdate payloads, eliminating quota errors and reducing save time from ~60s to ~2s.
 */
export async function batchSaveProjectsToSpreadsheet(
  spreadsheetId: string,
  projects: Project[],
  accessToken: string,
  onProgress?: (completed: number, total: number) => void
): Promise<void> {
  const cleanProjects = (projects || []).filter(isValidProject) as Project[];
  if (cleanProjects.length === 0) return;

  // 1. Ensure all project tabs and _Master_ exist in the Google Spreadsheet
  const requiredTabNames = cleanProjects.map((p) => p.sheetName.trim());
  const existingTitles = await ensureSpreadsheetTabsExist(spreadsheetId, requiredTabNames, accessToken);

  // 2. Prepare and synchronize full _Master_ table
  try {
    const masterRowsPayload = [
      ["ปีงบประมาณ", "แผนงาน", "ชื่อโครงการ", "ชื่อแผ่นงาน", "วงเงินงบประมาณ"],
      ...cleanProjects.map((p) => {
        const fyMatch = p.projectName ? p.projectName.match(/พ\.ศ\.\s*(\d{4})/) : null;
        const fy = fyMatch ? `พ.ศ. ${fyMatch[1]}` : (p.fiscalYear || "พ.ศ. 2569");
        return [
          fy,
          p.planName || "แผนงานตามยุทธศาสตร์",
          p.projectName || p.sheetName,
          p.sheetName.trim(),
          p.budget || 0,
        ];
      }),
    ];

    await safeFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/_Master_!A1:E${masterRowsPayload.length}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: masterRowsPayload }),
      }
    );
  } catch (mErr) {
    console.warn("Could not synchronize _Master_ list during batchSave:", mErr);
  }

  // Header for Periodic Progress
  const periodicHeaderValues = [
    ["ตารางแผนงานและผลงานรายครั้ง (Periodic Progress)", "", "", "", "", "", "", "", "", "", "", "หมายเหตุท้ายตาราง"],
    ["ครั้งที่", "วันที่เริ่ม", "ถึงวันที่", "แผนงานประจำเดือน (%)", "แผนงานสะสม (%)", "แผนการเงินประจำเดือน (บาท)", "แผนการเงินสะสม (บาท)", "ผลงานประจำเดือน (%)", "ผลงานสะสม (%)", "ผลการเงินประจำเดือน (บาท)", "ผลการเงินสะสม (บาท)", "รายการหมายเหตุ"]
  ];

  // Process projects in batches of 5 projects per HTTP batch request to keep payloads lightweight
  const BATCH_SIZE = 5;
  for (let i = 0; i < cleanProjects.length; i += BATCH_SIZE) {
    const chunk = cleanProjects.slice(i, i + BATCH_SIZE);
    let dataRanges: any[] = [];

    for (const project of chunk) {
      const sheetName = project.sheetName.trim();
      if (!sheetName) continue;

      // Only include ranges if the sheet tab actually exists in the spreadsheet
      if (existingTitles.size > 0 && !existingTitles.has(sheetName)) {
        continue;
      }

      const fiscalYearMatch = project.projectName ? project.projectName.match(/พ\.ศ\.\s*(\d{4})/) : null;
      const cleanFiscalYear = fiscalYearMatch ? `พ.ศ. ${fiscalYearMatch[1]}` : (project.fiscalYear || "พ.ศ. 2569");
      const cleanPlanName = project.planName || "แผนงานตามยุทธศาสตร์";
      const cleanProjectName = project.projectName || sheetName;

      const currInfo = getCurrentProgressInfo(project);
      const planPercent = currInfo.planPercent;
      const actualPercent = currInfo.actualPercent;

      const totalDisbursed = (project.disbursements || [])
        .filter((d) => d.status === "เบิกจ่ายแล้ว")
        .reduce((sum, d) => sum + d.amount, 0);

      // 1. Details (A2:B27)
      const detailsRows = [
        ["ชื่อโครงการ", cleanProjectName],                      // A2, B2
        ["ปีงบประมาณ", cleanFiscalYear],                       // A3, B3
        ["แผนงาน", cleanPlanName],                         // A4, B4
        ["วงเงิน", project.budget],                           // A5, B5
        ["วงเงินตามสัญญา", project.contractAmount],                   // A6, B6
        ["เลขที่สัญญา", project.contractNumber],                   // A7, B7
        ["ลงนามสัญญา (วันที่)", project.signedDate],                       // A8, B8
        ["เริ่มสัญญา (วันที่)", project.startDate],                        // A9, B9
        ["สิ้นสุดสัญญา (วันที่)", project.endDate],                          // A10, B10
        ["อายุสัญญา (วัน)", project.contractDays],                     // A11, B11
        ["หยุดงานระหว่างทำงาน", formatSuspensions(project.suspensions)],   // A12, B12
        ["ห้างที่รับผิดชอบ", project.contractor],                       // A13, B13
        ["ประธานตรวจรับพัสดุ", project.chairman],                         // A14, B14
        ["กรรมการคนที่ 1", project.committee1],                       // A15, B15
        ["กรรมการคนที่ 2", project.committee2],                       // A16, B16
        ["หัวหน้าผู้ควบคุมงาน", project.supervisorHead],                   // A17, B17
        ["ผู้ควบคุมงาน", project.supervisor],                       // A18, B18
        ["ตรวจรับแล้ว (วันที่)", project.acceptedDate],                     // A19, B19
        ["ความคืบหน้าตามแผน (%)", planPercent / 100],               // A20, B20
        ["ความคืบหน้าในสนาม (%)", actualPercent / 100],              // A21, B21
        ["การเบิกจ่าย (บาท)", totalDisbursed],                  // A22, B22
        ["ละติจูด (Latitude)", project.lat ?? ""],                 // A23, B23
        ["ลองจิจูด (Longitude)", project.lng ?? ""],                // A24, B24
        ["สถานที่ตั้งโครงการ", project.locationName ?? ""],          // A25, B25
        ["รูปแบบหมุดปัก", project.pinStyle ?? "default"],            // A26, B26
        ["วัตถุบนแผนที่", project.mapObjects && project.mapObjects.length > 0 ? JSON.stringify(project.mapObjects) : ""], // A27, B27
      ];
      dataRanges.push({ range: formatSheetRange(sheetName, "A2:B27"), values: detailsRows });

      // 2. Tasks (D3:G102)
      const tasks = project.tasks || [];
      const taskRowsToPad = Math.max(100, tasks.length);
      const taskValues: any[][] = [];
      for (let tIdx = 0; tIdx < taskRowsToPad; tIdx++) {
        if (tIdx < tasks.length) {
          const t = tasks[tIdx];
          taskValues.push([t.name, t.startDate, t.endDate, t.progress / 100]);
        } else {
          taskValues.push(["", "", "", ""]);
        }
      }
      dataRanges.push({ range: formatSheetRange(sheetName, `D3:G${2 + taskValues.length}`), values: taskValues });

      // 3. Updates (I3:K102)
      const updates = project.updates || [];
      const updateRowsToPad = Math.max(100, updates.length);
      const updateValues: any[][] = [];
      for (let uIdx = 0; uIdx < updateRowsToPad; uIdx++) {
        if (uIdx < updates.length) {
          const u = updates[uIdx];
          updateValues.push([u.date, u.details, u.reporter]);
        } else {
          updateValues.push(["", "", ""]);
        }
      }
      dataRanges.push({ range: formatSheetRange(sheetName, `I3:K${2 + updateValues.length}`), values: updateValues });

      // 4. Disbursements (M3:Q102)
      const disbursements = project.disbursements || [];
      const disbRowsToPad = Math.max(100, disbursements.length);
      const disbValues: any[][] = [];
      for (let dIdx = 0; dIdx < disbRowsToPad; dIdx++) {
        if (dIdx < disbursements.length) {
          const d = disbursements[dIdx];
          const workRoundTag = d.workRound ? `[ผลงาน: ${d.workRound}] ` : "";
          const remarkToSave = d.remarks && d.remarks !== "-"
            ? `${workRoundTag}${d.remarks}`
            : (d.workRound ? `[ผลงาน: ${d.workRound}]` : "-");
          disbValues.push([d.periodNo, d.amount, d.disbursedDate, d.status, remarkToSave]);
        } else {
          disbValues.push(["", "", "", "", ""]);
        }
      }
      dataRanges.push({ range: formatSheetRange(sheetName, `M3:Q${2 + disbValues.length}`), values: disbValues });

      // 5. Photos (S3:U102)
      const photos = project.photos || [];
      const photoRowsToPad = Math.max(100, photos.length);
      const photoValues: any[][] = [];
      for (let pIdx = 0; pIdx < photoRowsToPad; pIdx++) {
        if (pIdx < photos.length) {
          const p = photos[pIdx];
          photoValues.push([p.imageUrl, p.date, p.remarks]);
        } else {
          photoValues.push(["", "", ""]);
        }
      }
      dataRanges.push({ range: formatSheetRange(sheetName, `S3:U${2 + photoValues.length}`), values: photoValues });

      // 6. Periodic Progress & Remarks (W1:AH102)
      dataRanges.push({ range: formatSheetRange(sheetName, "W1:AH2"), values: periodicHeaderValues });

      const records = project.periodicProgress || [];
      const remarks = project.periodicRemarks || [];
      const cleanRecords = recalculateCumulativeFields(records);
      const maxRows = Math.max(cleanRecords.length, remarks ? remarks.length : 0);
      const periodicRowsToPad = Math.max(100, maxRows);

      const periodicValues: any[][] = [];
      for (let prIdx = 0; prIdx < periodicRowsToPad; prIdx++) {
        const r = prIdx < cleanRecords.length ? cleanRecords[prIdx] : null;
        const remarkText = remarks && remarks[prIdx] !== undefined ? remarks[prIdx] : "";
        if (r) {
          const pMonPct = typeof r.planMonthlyPercent === "number" && !isNaN(r.planMonthlyPercent) ? r.planMonthlyPercent / 100 : 0;
          const pCumPct = typeof r.planCumulativePercent === "number" && !isNaN(r.planCumulativePercent) ? r.planCumulativePercent / 100 : 0;
          const pMonAmt = typeof r.planMonthlyAmount === "number" && !isNaN(r.planMonthlyAmount) ? r.planMonthlyAmount : 0;
          const pCumAmt = typeof r.planCumulativeAmount === "number" && !isNaN(r.planCumulativeAmount) ? r.planCumulativeAmount : 0;
          const aMonPct = typeof r.actualMonthlyPercent === "number" && !isNaN(r.actualMonthlyPercent) ? r.actualMonthlyPercent / 100 : 0;
          const aCumPct = typeof r.actualCumulativePercent === "number" && !isNaN(r.actualCumulativePercent) ? r.actualCumulativePercent / 100 : 0;
          const aMonAmt = typeof r.actualMonthlyAmount === "number" && !isNaN(r.actualMonthlyAmount) ? r.actualMonthlyAmount : 0;
          const aCumAmt = typeof r.actualCumulativeAmount === "number" && !isNaN(r.actualCumulativeAmount) ? r.actualCumulativeAmount : 0;

          periodicValues.push([
            r.periodNo || (prIdx + 1),
            r.startDate || "",
            r.endDate || "",
            pMonPct,
            pCumPct,
            pMonAmt,
            pCumAmt,
            aMonPct,
            aCumPct,
            aMonAmt,
            aCumAmt,
            remarkText,
          ]);
        } else if (remarkText) {
          periodicValues.push(["", "", "", 0, 0, 0, 0, 0, 0, 0, 0, remarkText]);
        } else {
          periodicValues.push(["", "", "", "", "", "", "", "", "", "", "", ""]);
        }
      }
      dataRanges.push({ range: formatSheetRange(sheetName, `W3:AH${2 + periodicValues.length}`), values: periodicValues });
    }

    // Execute batchUpdate POST
    if (dataRanges.length > 0) {
      const batchRes = await safeFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            valueInputOption: "USER_ENTERED",
            data: dataRanges,
          }),
        }
      );

      if (!batchRes.ok) {
        const errJson = await batchRes.json().catch(() => ({}));
        const errMsg = errJson.error?.message || "";
        if (batchRes.status === 401 || isGoogleAuthError(batchRes.status, errMsg)) {
          clearCachedAccessToken();
          notifyGoogleAuthExpired();
          throw new GoogleAuthError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google ใหม่อีกครั้ง");
        }

        // Automatic retry if "Unable to parse range" occurs: remove offending ranges and proceed
        const parseRangeMatch = errMsg.match(/Unable to parse range:\s*['"]?([^!'"]+)['"]?!/i);
        if (parseRangeMatch && parseRangeMatch[1]) {
          const badSheetName = parseRangeMatch[1].trim();
          console.warn(`Encountered unparseable sheet tab '${badSheetName}', filtering and retrying batchUpdate...`);
          const filteredRanges = dataRanges.filter((r) => !r.range.includes(badSheetName));
          if (filteredRanges.length > 0) {
            const retryRes = await safeFetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  valueInputOption: "USER_ENTERED",
                  data: filteredRanges,
                }),
              }
            );
            if (retryRes.ok) {
              if (onProgress) {
                onProgress(Math.min(i + BATCH_SIZE, cleanProjects.length), cleanProjects.length);
              }
              continue; // Successfully recovered!
            }
          }
        }

        throw new Error(errMsg || "ล้มเหลวในการบันทึกข้อมูลแบบ Batch ลง Google Sheets");
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + BATCH_SIZE, cleanProjects.length), cleanProjects.length);
    }
  }
}



