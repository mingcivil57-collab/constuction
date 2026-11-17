export interface Task {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  progress: number; // 0 - 100
}

export interface ProgressUpdate {
  date: string;
  details: string;
  reporter: string;
}

export interface SuspensionPeriod {
  id?: string;                // รหัสรายการสั่งหยุดงาน e.g. "SUSP-1234"
  start: string;              // วันที่เริ่มสั่งหยุดงาน (YYYY-MM-DD)
  end?: string;               // วันที่ให้เริ่มปฏิบัติงานใหม่ (YYYY-MM-DD) หรือ เว้นว่างหากยังอยู่ระหว่างหยุดงาน
  days?: number;              // จำนวนวันที่สั่งหยุดงานจริง (วัน)
  reasonCategory?: "government" | "force_majeure" | "contractor_fault" | "contractor" | "other"; // สาเหตุการสั่งหยุดงาน
  reason?: string;            // รายละเอียดเหตุผลความจำเป็น
  orderDocNo?: string;        // เลขที่หนังสือสั่งหยุดงาน (เช่น เทศบาล.../ว 123)
  orderDocDate?: string;      // วันที่หนังสือสั่งหยุดงาน (YYYY-MM-DD)
  issuer?: string;            // ผู้ออกคำสั่ง เช่น ผู้ว่าจ้าง / คณะกรรมการตรวจรับพัสดุ
  resumeDocNo?: string;       // เลขที่หนังสือให้เริ่มงานใหม่
  resumeDocDate?: string;     // วันที่หนังสือให้เริ่มงานใหม่ (YYYY-MM-DD)
  isEligibleForExtension?: boolean; // ได้รับสิทธิขยายสัญญา / งดลดค่าปรับตามกฎหมาย
  actionType?: "auto_extend_contract" | "waive_penalty_only" | "waive_penalty" | "under_review" | "extend_contract" | "none" | "no_action"; // แนวทางการบริหารสัญญา
  approvedExtensionDays?: number; // จำนวนวันที่นำไปขยายสัญญาแล้ว (วัน)
  notes?: string;             // หมายเหตุเพิ่มเติม
}

export interface ContractExtension {
  round: number;              // ครั้งที่ขยายสัญญา (1, 2, 3...)
  extensionDays: number;      // จำนวนวันที่ได้รับอนุมัติขยายเพิ่ม (วัน)
  oldEndDate?: string;        // วันสิ้นสุดสัญญาเดิมก่อนขยาย (YYYY-MM-DD)
  newEndDate: string;         // วันสิ้นสุดสัญญาใหม่หลังขยาย (YYYY-MM-DD)
  docNumber?: string;         // เลขที่หนังสืออนุมัติ หรือ สัญญาแก้ไขเพิ่มเติม
  approvedDate?: string;      // วันที่อนุมัติ
  reason?: string;            // เหตุผล/รายละเอียดความจำเป็นในการขยายเวลา
}

export interface PenaltyNoticeDoc {
  id: string;                 // ID หนังสือ
  type: "penalty_reservation" | "fine_warning" | "waiver_request" | "termination_warning" | "addendum" | "other"; // ประเภทหนังสือ
  docNumber: string;          // เลขที่หนังสือ เช่น มท 0808.2/ว 1234
  docDate: string;            // วันที่หนังสือ (YYYY-MM-DD)
  issuer: string;             // ผู้ออกหนังสือ เช่น "ผู้ว่าจ้าง / เทศบาล", "ผู้รับจ้าง"
  subject: string;            // ชื่อเรื่อง
  details?: string;           // สาระสำคัญ / ข้อพิจารณา
  status?: "active" | "resolved" | "pending"; // สถานะการดำเนินการ
}

export interface DisbursementPeriod {
  workRound?: number | string; // ผลงาน (ครั้งที่ เช่น 1, "ครั้งที่ 1", "1")
  periodNo: number | string; // งวดที่ (e.g. 1, "0-1", "1-3")
  amount: number;            // จำนวนเงินที่เบิกจ่าย (บาท)
  disbursedDate: string;     // วันที่เบิกจ่าย (YYYY-MM-DD or "-")
  status: "ยังไม่เบิกจ่าย" | "เบิกจ่ายแล้ว"; // สถานะ
  remarks: string;           // หมายเหตุ
}

export interface ProjectPhoto {
  imageUrl: string;         // ลิงก์รูปภาพ (URL หรือ base64)
  date: string;             // วันที่บันทึกภาพ
  remarks: string;          // หมายเหตุ/คำอธิบายภาพ
}

export interface PeriodicProgressRecord {
  periodNo: number;              // งวดที่ (1, 2, 3...)
  startDate: string;             // วันที่เริ่ม
  endDate: string;               // ถึงวันที่
  
  // แผนงาน (Plan)
  planMonthlyPercent?: number;      // แผนงานประจำเดือน (%)
  planCumulativePercent?: number;   // แผนงานสะสมประจำเดือน (%)
  planMonthlyAmount?: number;       // แผนการเงินประจำเดือน (บาท)
  planCumulativeAmount?: number;    // แผนการเงินสะสมประจำเดือน (บาท)

  // ผลงาน (Actual)
  actualMonthlyPercent?: number;    // ผลงานประจำเดือน (%)
  actualCumulativePercent?: number; // ผลงานสะสมประจำเดือน (%)
  actualMonthlyAmount?: number;     // ผลการเงินประจำเดือน (บาท)
  actualCumulativeAmount?: number;  // ผลการเงินสะสมประจำเดือน (บาท)
}

export interface MapPointCoordinate {
  lat: number;
  lng: number;
}

export interface MapObject {
  id: string; // e.g., "POINT-001", "LINE-001", "POLYGON-001"
  type: "point" | "line" | "polygon";
  coordinates: MapPointCoordinate | MapPointCoordinate[]; // single coord for point, array for line/polygon
  label?: string;
  color?: string; // รหัสสี Hex เช่น "#ef4444", "#3b82f6", "#10b981"
  size?: number;  // ขนาดรัศมีจุด (Radius) หรือ ความหนาของเส้น (Stroke Weight)
}

export interface Project {
  fiscalYear: string;       // e.g. "2569"
  planName: string;         // e.g. "แผนงานที่ 1"
  projectName: string;      // e.g. "โครงการก่อสร้างถนน คสล."
  sheetName: string;        // Name of the tab in Google Sheet
  
  // Section 2: Contract Details
  lat?: number;             // พิกัดละติจูด (Latitude)
  lng?: number;             // พิกัดลองจิจูด (Longitude)
  locationName?: string;    // ชื่อสถานที่ / ที่ตั้งโครงการ
  pinStyle?: string;        // รูปแบบสัญลักษณ์หมุดปักแผนที่ (Owner customization)
  budget: number;           // วงเงิน (บาท)
  contractAmount: number;   // วงเงินตามสัญญา (บาท)
  contractNumber: string;   // เลขที่สัญญา
  signedDate: string;       // ลงนามสัญญา (วันที่)
  startDate: string;        // เริ่มสัญญา (วันที่)
  endDate: string;          // สิ้นสุดสัญญา (วันที่)
  contractDays: number;     // อายุสัญญา (จำนวนวัน)
  elapsedDays: number;      // ผ่านไปแล้ว (จำนวนวัน)
  remainingDays: number;    // เหลืออายุสัญญา (จำนวนวัน)
  suspensions: SuspensionPeriod[]; // หยุดงานระหว่างทำงาน
  extensions?: ContractExtension[]; // ประวัติการขยายระยะเวลาสัญญา
  contractor: string;       // ห้างที่รับผิดชอบ
  chairman: string;         // ประธานตรวจรับพัสดุ (1คน)
  committee1: string;       // กรรมการตรวจรับพัสดุคนที่ 1
  committee2: string;       // กรรมการตรวจรับพัสดุคนที่ 2
  supervisorHead: string;   // หัวหน้าผู้ควบคุมงาน (1คน)
  supervisor: string;       // ผู้ควบคุมงาน (1คน)
  acceptedDate: string;     // ตรวจรับแล้ว (วันที่)

  // Section 3: Progress
  progressPlan: number;     // ความคืบหน้าตามแผน (%)
  progressField: number;    // ความคืบหน้าในสนาม (%)
  disbursedAmount: number;  // การเบิกจ่าย (จำนวนเงิน บาท)
  disbursedPercent: number; // คิดเป็นกี่% ของวงเงินสัญญา
  
  // Section 4: Penalty, Liquidated Damages & Recovery Plan
  penaltyRatePercent?: number;  // อัตราค่าปรับ (% ต่อวัน เช่น 0.05, 0.10)
  customDailyFine?: number;     // ค่าปรับต่อวันแบบระบุเอง (บาท/วัน)
  waivedDays?: number;          // จำนวนวันที่ได้รับพิจารณางดหรือลดค่าปรับ (วัน ตาม ม.102)
  waivedReason?: string;        // เหตุผลประกอบการงดหรือลดค่าปรับ
  penaltyStatus?: "accumulating" | "reserved" | "waived" | "under_review" | "none"; // สถานะการคิดค่าปรับ
  penaltyNoticeDocs?: PenaltyNoticeDoc[]; // ประวัติหนังสือสงวนสิทธิ์/แจ้งเตือนค่าปรับ/บอกเลิกสัญญา
  recoveryTargetDate?: string;  // เป้าหมายแล้วเสร็จใหม่ (YYYY-MM-DD)
  recoveryPlanNotes?: string;   // บันทึกมาตรการเร่งรัดงาน (Recovery Plan)

  // Section 5: Child tables (not mixed in tasks/updates sheets)
  tasks: Task[];
  updates: ProgressUpdate[];
  disbursements: DisbursementPeriod[]; // งวดงานและการเบิกจ่าย
  photos: ProjectPhoto[];              // ภาพหน้างานก่อสร้างพร้อมหมายเหตุ
  periodicProgress?: PeriodicProgressRecord[]; // ตารางแผนงานและผลงานรายครั้ง/ประจำเดือน
  periodicRemarks?: string[];          // หมายเหตุท้ายตารางแผนงานและผลงานรายครั้ง
  disbursementRemarks?: string[];      // หมายเหตุท้ายตารางงวดงานและการเบิกจ่ายเงิน (Table Notes & Remarks)
  mapObjects?: MapObject[];            // วาด Point, Line, Polygon บนแผนที่
  projectNotes?: string;               // หมายเหตุโครงการ (บันทึกและแสดงเฉพาะ Owner เท่านั้น)
}

export interface MasterPlan {
  fiscalYear: string;
  plans: {
    name: string;
    projectsCount: number;
    budgetTotal: number;
    contractAmountTotal: number;
    disbursedTotal: number;
  }[];
}
