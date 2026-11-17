import { Project } from "../types";
import { getCurrentProgressInfo, getProcessedPeriodicRemarks, getTotalPlanPeriodsFromPeriodicTable, getDefaultPeriodicProgress, getActualMonthlyPercentForPeriod } from "../lib/periodicUtils";
import { formatDateDisplay, formatDateDisplayWithPeriod, calculateProjectTimeline, calculateLiquidatedDamages } from "../lib/dateUtils";
import { ExportOptions } from "./exportDocx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const formatMoney = (val: number) => {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0) + " บาท";
};

export function generatePdfHtml(projects: Project[], options: ExportOptions): string {
  const isLandscape = options.orientation === "landscape";
  const primaryColor = "#0f766e";
  const totalBudget = projects.reduce((s, p) => s + (p.budget || 0), 0);
  const totalContract = projects.reduce((s, p) => s + (p.contractAmount || 0), 0);
  const totalDisbursed = projects.reduce((s, p) => s + (p.disbursedAmount || 0), 0);

  const avgPlan = projects.length > 0
    ? Math.round(projects.reduce((s, p) => s + (getCurrentProgressInfo(p).planPercent || p.progressPlan || 0), 0) / projects.length)
    : 0;
  const avgActual = projects.length > 0
    ? Math.round(projects.reduce((s, p) => s + (getCurrentProgressInfo(p).actualPercent || p.progressField || 0), 0) / projects.length)
    : 0;

  return `
  <!DOCTYPE html>
  <html lang="th">
  <head>
    <meta charset="UTF-8">
    <title>${options.reportTitle || "รายงานสรุปสำหรับผู้บริหาร"}</title>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,300;0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
    <style>
      @page {
        size: A4 ${isLandscape ? "landscape" : "portrait"};
        margin: 15mm;
      }
      * { box-sizing: border-box; }
      body {
        font-family: 'Sarabun', 'Prompt', 'Cordia New', sans-serif;
        color: #1e293b;
        background: #fff;
        margin: 0;
        padding: 0;
        font-size: 13px;
        line-height: 1.5;
      }
      .page-cover {
        height: 90vh;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        page-break-after: always;
        padding: 40px;
        border: 2px solid ${primaryColor};
        border-radius: 16px;
      }
      .cover-agency { font-size: 20px; font-weight: bold; color: ${primaryColor}; margin-bottom: 15px; }
      .cover-title { font-size: 28px; font-weight: bold; color: #0f172a; margin-bottom: 20px; line-height: 1.3; }
      .cover-sub { font-size: 16px; color: #475569; margin-bottom: 30px; }
      .cover-date { font-size: 14px; font-style: italic; color: #64748b; }
      
      .section-title {
        font-size: 18px;
        font-weight: bold;
        color: ${primaryColor};
        border-bottom: 2px solid ${primaryColor};
        padding-bottom: 6px;
        margin-top: 25px;
        margin-bottom: 12px;
        page-break-after: avoid;
        break-after: avoid;
      }
      
      .card-grid {
        display: grid;
        grid-template-columns: repeat(${isLandscape ? 4 : 2}, 1fr);
        gap: 12px;
        margin-bottom: 20px;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .card {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        padding: 12px 16px;
        border-radius: 8px;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .card-label { font-size: 11px; color: #64748b; font-weight: bold; text-transform: uppercase; }
      .card-val { font-size: 18px; font-weight: bold; color: #0f172a; margin-top: 4px; }
      
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
        font-size: 12px;
        page-break-inside: auto;
        break-inside: auto;
      }
      thead {
        display: table-header-group;
      }
      tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      th, td {
        border: 1px solid #cbd5e1;
        padding: 8px 10px;
        text-align: left;
      }
      th { background-color: #f1f5f9; font-weight: bold; color: #0f172a; }
      tr:nth-child(even) { background-color: #f8fafc; }
      
      .photo-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin-bottom: 20px;
      }
      .photo-card {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        overflow: hidden;
        background: #fafafa;
        text-align: center;
        padding: 8px;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .photo-img { width: 100%; height: 120px; object-fit: cover; border-radius: 4px; }
      .photo-rem { font-size: 11px; margin-top: 6px; color: #334155; font-weight: 500; }
      
      .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: bold;
      }
      .badge-green { background: #dcfce7; color: #15803d; }
      .badge-red { background: #fee2e2; color: #b91c1c; }

      @media print {
        body { padding: 0; }
        .no-print { display: none !important; }
        .page-break { page-break-before: always; break-before: page; }
      }
    </style>
  </head>
  <body>
    <!-- COVER PAGE -->
    <div class="page-cover">
      <div class="cover-agency">${options.agencyName || "หน่วยงานบริหารโครงการก่อสร้าง"}</div>
      <div class="cover-title">${options.reportTitle || "รายงานสรุปความก้าวหน้าโครงการก่อสร้างเพื่อนำเสนอผู้บริหาร"}</div>
      <div class="cover-sub">ประจำปีงบประมาณ พ.ศ. ${options.selectedYear} | แผนงาน: ${options.selectedPlan || "ทั้งหมด"}</div>
      <div class="cover-date">วันที่จัดทำรายงาน: ${formatDateDisplay(new Date().toISOString().split("T")[0])}</div>
    </div>

    <!-- SUMMARY SECTION -->
    ${
      options.sections.summary
        ? `
      <div class="section-title">1. สรุปภาพรวมการดำเนินงานโครงการ</div>
      <div class="card-grid">
        <div class="card">
          <div class="card-label">โครงการทั้งหมด</div>
          <div class="card-val">${projects.length} โครงการ</div>
        </div>
        <div class="card">
          <div class="card-label">งบประมาณรวม</div>
          <div class="card-val">${formatMoney(totalBudget)}</div>
        </div>
        <div class="card">
          <div class="card-label">วงเงินตามสัญญารวม</div>
          <div class="card-val">${formatMoney(totalContract)}</div>
        </div>
        <div class="card">
          <div class="card-label">เบิกจ่ายสะสมรวม</div>
          <div class="card-val">${formatMoney(totalDisbursed)}</div>
        </div>
      </div>
      `
        : ""
    }

    <!-- PROJECTS BREAKDOWN -->
    <div class="section-title">2. รายละเอียดผลการดำเนินงานรายโครงการ</div>
    ${projects
      .map(
        (p, idx) => {
          const pCurrentProgress = getCurrentProgressInfo(p);
          const pProgPercent = pCurrentProgress.actualPercent || p.progressField || 0;
          const pPenalty = calculateLiquidatedDamages(p, pProgPercent);
          const pTimeline = calculateProjectTimeline(
            p.startDate,
            p.endDate,
            p.contractDays,
            pProgPercent,
            p.periodicProgress,
            p.sheetName
          );
          const pIsCompleted = Boolean(pTimeline.isCompleted || pProgPercent >= 100);
          const pIsCompletedLate = Boolean(
            pIsCompleted &&
            (
              (pPenalty && pPenalty.statusLevel === "completed" && pPenalty.totalFineAmount > 0) ||
              (pPenalty && pPenalty.overdueDays > 0) ||
              (pTimeline.hasFinalInstallmentExceededContract && pTimeline.overdueDays > 0) ||
              (pTimeline.overdueDays > 0)
            )
          );
          const pOverdueDays = (pPenalty && pPenalty.overdueDays > 0) ? pPenalty.overdueDays : (pTimeline.overdueDays || 0);
          const pActualDeliveryDate = pTimeline.lastPeriodEndDateStr || pPenalty?.lastPeriodEndDateStr || p.acceptedDate;

          return `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:15px; margin-bottom:20px; page-break-inside:avoid;">
        <h3 style="margin:0 0 10px 0; font-size:16px; color:#0f172a;">${idx + 1}. ${p.projectName}</h3>
        
        ${
          options.sections.contractor || options.sections.timeline
            ? `
          <div style="display:flex; flex-wrap:wrap; gap:15px; margin-bottom:10px; font-size:12px;">
            <div><strong>เลขที่สัญญา:</strong> ${p.contractNumber || "-"}</div>
            <div><strong>ผู้รับจ้าง:</strong> ${p.contractor || "-"}</div>
            <div>
              <strong>ระยะเวลาสัญญา:</strong> ${p.contractDays || 0} วัน ${
                pIsCompletedLate
                  ? `<span style="color: #b45309; font-weight: bold;">(ส่งมอบช้ากว่าสัญญา +${pOverdueDays} วัน)</span>`
                  : `(คงเหลือ ${pTimeline.remainingDays !== undefined ? pTimeline.remainingDays : (p.remainingDays ?? 0)} วัน)`
              }<br/>
              ระหว่าง ${formatDateDisplay(p.startDate)} ถึง ${formatDateDisplay(p.endDate)}
              ${pIsCompletedLate && pActualDeliveryDate ? ` • <strong>ส่งมอบจริง:</strong> ${formatDateDisplay(pActualDeliveryDate)}` : ""}
            </div>
          </div>
        `
            : ""
        }

        ${
          options.sections.budget || options.sections.progress
            ? `
          <table style="margin-bottom:10px;">
            <tr>
              <th>วงเงินงบประมาณ</th>
              <th>วงเงินตามสัญญา</th>
              <th>เบิกจ่ายสะสม</th>
              <th>แผนงาน (%)</th>
              <th>ผลงานสนาม (%)</th>
              <th>สถานะ</th>
            </tr>
            <tr>
              <td>${formatMoney(p.budget)}</td>
              <td>${formatMoney(p.contractAmount)}</td>
              <td>${formatMoney(p.disbursedAmount)} (${p.disbursedPercent || 0}%)</td>
              <td>${getCurrentProgressInfo(p).planPercent || p.progressPlan}%</td>
              <td>${getCurrentProgressInfo(p).actualPercent || p.progressField}%</td>
              <td>
                ${
                  pIsCompletedLate
                    ? `<span class="badge" style="background-color:#fef3c7; color:#92400e; border:1px solid #fcd34d;">งานแล้วเสร็จ (ส่งมอบช้ากว่าสัญญา)</span>`
                    : (getCurrentProgressInfo(p).actualPercent || p.progressField) >= (getCurrentProgressInfo(p).planPercent || p.progressPlan)
                    ? `<span class="badge badge-green">ตามแผน / เร็วกว่าแผน</span>`
                    : `<span class="badge badge-red">ล่าช้ากว่าแผน</span>`
                }
              </td>
            </tr>
          </table>
        `
            : ""
        }

        ${
          options.sections.map && (p.locationName || p.lat)
            ? `
          <div style="font-size:12px; margin-bottom:10px; color:#475569;">
            📍 <strong>พิกัดและที่ตั้ง:</strong> ${p.locationName || "-"} ${p.lat && p.lng ? `(lat: ${p.lat}, lng: ${p.lng})` : ""}
          </div>
        `
            : ""
        }

        ${
          options.sections.periodicTable && p.periodicProgress && p.periodicProgress.length > 0
            ? `
          <div style="font-weight:bold; font-size:12px; margin-top:10px; margin-bottom:6px;">ตาราง Progress รายครั้ง:</div>
          <table style="margin-bottom:10px;">
            <tr>
              <th>ครั้งที่</th>
              <th>ช่วงวันที่</th>
              <th>แผนสะสม (%)</th>
              <th>ผลสะสม (%)</th>
            </tr>
            ${p.periodicProgress
              .slice(0, 5)
              .map(
                (rec) => `
              <tr>
                <td>ครั้งที่ ${rec.periodNo}</td>
                <td>${formatDateDisplay(rec.startDate)} - ${formatDateDisplay(rec.endDate)}</td>
                <td>${rec.planCumulativePercent !== undefined && rec.planCumulativePercent !== null ? Number(rec.planCumulativePercent).toFixed(2) + "%" : "-"}</td>
                <td>${rec.actualCumulativePercent !== undefined && rec.actualCumulativePercent !== null ? Number(rec.actualCumulativePercent).toFixed(2) + "%" : "-"}</td>
              </tr>
            `
              )
              .join("")}
          </table>
        `
            : ""
        }

        ${
          options.sections.photos && p.photos && p.photos.length > 0
            ? `
          <div style="font-weight:bold; font-size:12px; margin-top:10px; margin-bottom:6px;">ภาพถ่ายหน้างาน:</div>
          <div class="photo-grid">
            ${p.photos
              .slice(0, 3)
              .map(
                (ph) => `
              <div class="photo-card">
                <img src="${ph.imageUrl}" class="photo-img" alt="ภาพหน้างาน" />
                <div class="photo-rem">${ph.remarks || "ภาพกิจกรรมสนาม"}</div>
              </div>
            `
              )
              .join("")}
          </div>
        `
            : ""
        }

        ${
          options.sections.issues && p.updates && p.updates.length > 0
            ? `
          <div style="font-weight:bold; font-size:12px; margin-top:10px; margin-bottom:6px;">ปัญหา อุปสรรค และอัปเดตหน้างาน:</div>
          <ul style="margin:0; padding-left:20px; font-size:12px;">
            ${p.updates
              .map(
                (u) => `
              <li><strong>[${formatDateDisplayWithPeriod(u.date, p.periodicProgress)}]</strong> ${u.details} <em>(ผู้รายงาน: ${u.reporter || "-"})</em></li>
            `
              )
              .join("")}
          </ul>
        `
            : ""
        }
      </div>
    `;
        }
      )
      .join("")}

    <!-- EXECUTIVE RECOMMENDATIONS -->
    ${
      options.sections.recommendations && options.recommendations
        ? `
      <div class="section-title">3. ข้อเสนอแนะและแนวทางกำกับดูแลสำหรับผู้บริหาร</div>
      <div style="background:#f0fdf4; border:1px solid #a7f3d0; padding:16px; border-radius:10px; font-size:13px; color:#065f46; white-space:pre-line;">
        ${options.recommendations}
      </div>
    `
        : ""
    }
  </body>
  </html>
  `;
}

export function printPdfReport(projects: Project[], options: ExportOptions) {
  const htmlContent = generatePdfHtml(projects, options);
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("กรุณายอมรับการเปิด Pop-up เพื่อพิมพ์หรือบันทึกเป็น PDF");
    return;
  }
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
  }, 800);
}

export async function downloadPdfBlob(projects: Project[], options: ExportOptions): Promise<Blob> {
  // Create offscreen container
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "-9999px";
  container.style.width = options.orientation === "landscape" ? "1122px" : "794px"; // A4 px
  container.innerHTML = generatePdfHtml(projects, options);
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 1.5,
      useCORS: true,
      logging: false,
    });
    document.body.removeChild(container);

    const imgData = canvas.toDataURL("image/jpeg", 0.9);
    const pdf = new jsPDF({
      orientation: options.orientation,
      unit: "mm",
      format: "a4",
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    return pdf.output("blob");
  } catch (err) {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
    throw err;
  }
}

// ----------------------------------------------------------------------------
// DISBURSEMENT & PHOTOS DEDICATED PDF REPORT (Print-Ready A4, No Signature)
// ----------------------------------------------------------------------------

/**
 * แปลงตัวเลขไทย (๐-๙) เป็นเลขอารบิก (0-9) ให้ตรงกันทั้งเอกสาร
 */
export function toArabicDigits(str: string | number | undefined | null): string {
  if (str === null || str === undefined) return "";
  const s = String(str);
  return s.replace(/[๐-๙]/g, (d) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(d)));
}

// Helper to format personnel names with an extra spacebar between first name and last name
export function formatPersonnelName(name?: string): string {
  if (!name || name.trim() === "" || name.trim() === "-") return "-";
  return name.trim().replace(/\s+/g, "\u00A0\u00A0");
}

export interface DisbursementsPdfOptions {
  includePhotos?: boolean;
  includePersonnel?: boolean;
  selectedPhotoIndices?: number[];
  includeRemarks?: boolean;
  customRemarks?: string[];
  includeFinancialStrip?: boolean;
}

// Helper to remove any variations of "• (ข้อกำหนดและเงื่อนไขการส่งมอบงาน/เบิกจ่ายเงิน)" from remarks
export const cleanRemarkText = (rawText: string): string => {
  if (!rawText) return "";
  let text = rawText
    .replace(/^[•\s\-\*]*\(?ข้อกำหนดและเงื่อนไข(?:การ)?ส่งมอบงาน(?:\/|และ)?(?:การ)?เบิกจ่ายเงิน\)?[:\s-]*/gmi, "")
    .replace(/[•\s\-\*]*\(?ข้อกำหนดและเงื่อนไข(?:การ)?ส่งมอบงาน(?:\/|และ)?(?:การ)?เบิกจ่ายเงิน\)?/gi, "")
    .trim();
  return text;
};

// Helper to format remark body HTML (preserving period badges, bolding, multi-line tasks, and percentage pill highlights)
export const formatRemarkBodyHtml = (rawText: string): string => {
  if (!rawText) return "";
  let text = cleanRemarkText(rawText);
  if (!text) return "";

  // 1. Clean up duplicate or nested tags in raw text (e.g. [green][yellow]...[/yellow][/green])
  text = text.replace(
    /\[(yellow|green|blue|orange|pink|red|purple)\]\s*\[(yellow|green|blue|orange|pink|red|purple)\]([\s\S]*?)\[\/\2\]\s*\[\/\1\]/gi,
    "[$1]$3[/$1]"
  );

  // 2. Tokenize by formatting tags so highlighted segments and plain text segments are parsed separately
  const tokenRegex =
    /(\[yellow\][\s\S]*?\[\/yellow\]|\[green\][\s\S]*?\[\/green\]|\[blue\][\s\S]*?\[\/blue\]|\[orange\][\s\S]*?\[\/orange\]|\[(?:pink|red)\][\s\S]*?\[\/(?:pink|red)\]|\[purple\][\s\S]*?\[\/purple\]|\[hl:(?:yellow|green|blue|orange|pink|red|purple)\][\s\S]*?\[\/hl\]|==[\s\S]*?==|\*\*[\s\S]*?\*\*)/g;

  const parts = text.split(tokenRegex);

  const formattedParts = parts.map((part) => {
    if (!part) return "";

    // 2.1 Yellow Highlight
    if (
      (part.startsWith("[yellow]") && part.endsWith("[/yellow]")) ||
      (part.startsWith("[hl:yellow]") && part.endsWith("[/hl]")) ||
      (part.startsWith("==") && part.endsWith("==") && part.length >= 4)
    ) {
      let inner = part;
      if (part.startsWith("[yellow]")) inner = part.slice(8, -9);
      else if (part.startsWith("[hl:yellow]")) inner = part.slice(11, -5);
      else if (part.startsWith("==")) inner = part.slice(2, -2);
      // Strip any residual inner tags to completely avoid nesting
      inner = inner.replace(/\[\/?(?:yellow|green|blue|orange|pink|red|purple|hl(?::[a-z]+)?)\]/gi, "").replace(/==/g, "").trim();
      return `<span class="remark-pill-yellow">${toArabicDigits(inner)}</span>`;
    }

    // 2.2 Green Highlight
    if (
      (part.startsWith("[green]") && part.endsWith("[/green]")) ||
      (part.startsWith("[hl:green]") && part.endsWith("[/hl]"))
    ) {
      let inner = part.startsWith("[green]") ? part.slice(7, -8) : part.slice(10, -5);
      inner = inner.replace(/\[\/?(?:yellow|green|blue|orange|pink|red|purple|hl(?::[a-z]+)?)\]/gi, "").trim();
      return `<span class="remark-pill-green">${toArabicDigits(inner)}</span>`;
    }

    // 2.3 Blue Highlight
    if (
      (part.startsWith("[blue]") && part.endsWith("[/blue]")) ||
      (part.startsWith("[hl:blue]") && part.endsWith("[/hl]"))
    ) {
      let inner = part.startsWith("[blue]") ? part.slice(6, -7) : part.slice(9, -5);
      inner = inner.replace(/\[\/?(?:yellow|green|blue|orange|pink|red|purple|hl(?::[a-z]+)?)\]/gi, "").trim();
      return `<span class="remark-pill-blue">${toArabicDigits(inner)}</span>`;
    }

    // 2.4 Orange Highlight
    if (
      (part.startsWith("[orange]") && part.endsWith("[/orange]")) ||
      (part.startsWith("[hl:orange]") && part.endsWith("[/hl]"))
    ) {
      let inner = part.startsWith("[orange]") ? part.slice(8, -9) : part.slice(11, -5);
      inner = inner.replace(/\[\/?(?:yellow|green|blue|orange|pink|red|purple|hl(?::[a-z]+)?)\]/gi, "").trim();
      return `<span class="remark-pill-orange">${toArabicDigits(inner)}</span>`;
    }

    // 2.5 Pink / Red Highlight
    if (
      (part.startsWith("[pink]") && part.endsWith("[/pink]")) ||
      (part.startsWith("[red]") && part.endsWith("[/red]")) ||
      (part.startsWith("[hl:pink]") && part.endsWith("[/hl]")) ||
      (part.startsWith("[hl:red]") && part.endsWith("[/hl]"))
    ) {
      let inner = part;
      if (part.startsWith("[pink]")) inner = part.slice(6, -7);
      else if (part.startsWith("[red]")) inner = part.slice(5, -6);
      else if (part.startsWith("[hl:pink]")) inner = part.slice(9, -5);
      else if (part.startsWith("[hl:red]")) inner = part.slice(8, -5);
      inner = inner.replace(/\[\/?(?:yellow|green|blue|orange|pink|red|purple|hl(?::[a-z]+)?)\]/gi, "").trim();
      return `<span class="remark-pill-pink">${toArabicDigits(inner)}</span>`;
    }

    // 2.6 Purple Highlight
    if (
      (part.startsWith("[purple]") && part.endsWith("[/purple]")) ||
      (part.startsWith("[hl:purple]") && part.endsWith("[/hl]"))
    ) {
      let inner = part.startsWith("[purple]") ? part.slice(8, -9) : part.slice(11, -5);
      inner = inner.replace(/\[\/?(?:yellow|green|blue|orange|pink|red|purple|hl(?::[a-z]+)?)\]/gi, "").trim();
      return `<span class="remark-pill-purple">${toArabicDigits(inner)}</span>`;
    }

    // 2.7 Bold: **...**
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      const inner = part.slice(2, -2);
      return `<strong style="font-weight: 700; color: #0f172a;">${toArabicDigits(inner)}</strong>`;
    }

    // 2.8 Plain text (outside of any formatting tags)
    let plain = toArabicDigits(part);
    // Auto-detect percentage pills ONLY for 100% completed items (e.g. "(100%)" or "(สะสม 100%)")
    // Do NOT auto-convert other percentages (e.g. 86%, 2%, 20%) to yellow pills,
    // so plain text matches the pre-print view (หน้าก่อนพิมพ์) exactly
    plain = plain.replace(
      /\(((?:สะสม\s*)?100%)\)/g,
      '<span class="remark-pill-green">($1)</span>'
    );
    return plain;
  });

  let combined = formattedParts.join("");

  // Fallback safety: Collapse any nested pill spans like <span class="..."><span class="...">...</span></span>
  combined = combined.replace(
    /<span class="(remark-pill-[a-z]+)">\s*<span class="remark-pill-[a-z]+">([\s\S]*?)<\/span>\s*<\/span>/gi,
    '<span class="$1">$2</span>'
  );

  // Safety cleanup: strip any stray, unclosed, or orphan raw tags (e.g. [green], [/green], [yellow], etc.)
  combined = combined.replace(/\[\/?(?:yellow|green|blue|orange|pink|red|purple|hl(?::[a-z]+)?)\]/gi, "");

  // 3. Convert newlines to clean multi-line task rows
  const lines = combined.split(/\r?\n/);
  if (lines.length > 1) {
    return lines
      .map((l, lIdx) => {
        const content = l.trimEnd();
        return `<div style="min-height: 1.45em; ${lIdx > 0 ? 'margin-top: 3px;' : ''}; white-space: pre-wrap; width: 100%; word-break: break-word;">${content || "&nbsp;"}</div>`;
      })
      .join("");
  }
  return combined;
};

export function generateDisbursementsPdfHtml(
  project: Project,
  getWorkRound?: (d: any, index: number, arr: any[]) => string,
  options?: DisbursementsPdfOptions
): string {
  const disbursements = project.disbursements || [];
  const photos = project.photos || [];
  const includePhotos = options?.includePhotos !== false;
  const includePersonnel = options?.includePersonnel !== false;
  const selectedPhotoIndices = options?.selectedPhotoIndices;
  const includeRemarks = options?.includeRemarks !== false;
  const includeFinancialStrip = options?.includeFinancialStrip !== false;

  const defaultRemarksList = [
    "การเบิกจ่ายเงินค่างานงวดต่างๆ เป็นไปตามเงื่อนไขและข้อกำหนดแห่งสัญญาจ้างฯ โดยผ่านการตรวจสอบความถูกต้องจากผู้ควบคุมงานและคณะกรรมการตรวจรับพัสดุเรียบร้อยแล้ว",
    "จำนวนเงินค่างานที่ระบุในรายงานเป็นยอดเงินก่อนหักภาษี ณ ที่จ่าย และเงินประกันผลงาน (ถ้ามี)",
    "การส่งมอบงานในแต่ละงวด/แต่ละครั้ง ผู้รับจ้างได้ดำเนินการตามแบบรูปรายการละเอียดและข้อกำหนดแห่งสัญญาครบถ้วนสมบูรณ์",
  ];

  // Pull remarks from Table Notes & Remarks (หน้าก่อนสั่งพิมพ์) as primary source
  const processedFromTable = getProcessedPeriodicRemarks(project);
  const remarksToDisplay =
    options?.customRemarks && options.customRemarks.length > 0
      ? options.customRemarks
      : processedFromTable && processedFromTable.length > 0
      ? processedFromTable.map((p) => p.formattedText)
      : project.disbursementRemarks && project.disbursementRemarks.length > 0
      ? project.disbursementRemarks
      : defaultRemarksList;

  // Helper backward-compatible formatPdfRemarkHtml
  const formatPdfRemarkHtml = (rawText: string): string => {
    return formatRemarkBodyHtml(rawText);
  };

  // Resolve work rounds (ensuring Arabic numerals)
  const resolveRound = (d: any, idx: number, arr: any[]): string => {
    let raw = "";
    if (getWorkRound) raw = getWorkRound(d, idx, arr);
    else if (d.workRound && String(d.workRound).trim() !== "") {
      const val = String(d.workRound).trim();
      raw = val.startsWith("ครั้งที่") ? val : `ครั้งที่ ${val}`;
    } else {
      raw = `ครั้งที่ ${idx + 1}`;
    }
    return toArabicDigits(raw);
  };

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

  // Map each item with original resolved round
  const indexedDisbursements = disbursements.map((d, i, arr) => ({
    d,
    workRound: resolveRound(d, i, arr),
    periodNum: parsePeriodNum(d.periodNo),
  }));

  // Automatically sort by work round and period number (งวดที่ 1 ➔ 2 ➔ 3...)
  indexedDisbursements.sort((a, b) => {
    if (a.workRound === b.workRound) {
      return a.periodNum - b.periodNum;
    }
    const roundA = parseRoundNum(a.workRound);
    const roundB = parseRoundNum(b.workRound);
    if (roundA !== roundB) return roundA - roundB;
    const nameDiff = a.workRound.localeCompare(b.workRound, "th");
    if (nameDiff !== 0) return nameDiff;
    return a.periodNum - b.periodNum;
  });

  const sortedDisbursements = indexedDisbursements.map((item) => item.d);
  const workRounds = indexedDisbursements.map((item) => item.workRound);

  // Retrieve periodic records for pulling actual monthly percentages (ผลงานประจำเดือน (%))
  const periodicRecords =
    project.periodicProgress && project.periodicProgress.length > 0
      ? project.periodicProgress
      : getDefaultPeriodicProgress(project);

  // Compute group stats and period ranges for clear group display
  const groupStats: Record<
    string,
    {
      totalAmount: number;
      totalCount: number;
      disbursedCount: number;
      disbursedAmount: number;
      firstPeriod: string | number;
      lastPeriod: string | number;
      totalActualPercent: number;
      hasAnyPercent: boolean;
    }
  > = {};

  sortedDisbursements.forEach((d, i) => {
    const round = workRounds[i];
    if (!groupStats[round]) {
      groupStats[round] = {
        totalAmount: 0,
        totalCount: 0,
        disbursedCount: 0,
        disbursedAmount: 0,
        firstPeriod: d.periodNo,
        lastPeriod: d.periodNo,
        totalActualPercent: 0,
        hasAnyPercent: false,
      };
    }
    const amt = Number(d.amount) || 0;
    groupStats[round].totalAmount += amt;
    groupStats[round].totalCount += 1;
    groupStats[round].lastPeriod = d.periodNo;
    if (d.status === "เบิกจ่ายแล้ว") {
      groupStats[round].disbursedCount += 1;
      groupStats[round].disbursedAmount += amt;
    }
    const pPct = getActualMonthlyPercentForPeriod(d.periodNo, periodicRecords);
    if (pPct !== null) {
      groupStats[round].totalActualPercent += pPct;
      groupStats[round].hasAnyPercent = true;
    }
  });

  // Calculate grand total actual percent from all disbursements
  const grandTotalActualPercent = sortedDisbursements.reduce((sum, d) => {
    const pPct = getActualMonthlyPercentForPeriod(d.periodNo, periodicRecords);
    return sum + (pPct !== null ? pPct : 0);
  }, 0);

  // Financial summary
  const totalContract = project.contractAmount || project.budget || 0;
  const totalDisbursed =
    project.disbursedAmount ||
    disbursements.reduce((s, d) => s + (d.status === "เบิกจ่ายแล้ว" ? Number(d.amount) || 0 : 0), 0);
  const remainingDisbursed = Math.max(0, totalContract - totalDisbursed);
  const disbursedPercent = totalContract > 0 ? ((totalDisbursed / totalContract) * 100).toFixed(2) : "0.00";
  const remainingPercent = totalContract > 0 ? ((remainingDisbursed / totalContract) * 100).toFixed(2) : "0.00";
  const disbursedCount = disbursements.filter((d) => (d.status || "").trim() === "เบิกจ่ายแล้ว").length;
  // จำนวนงวดทั้งหมดของสัญญา: อิงจากงวดงานจริงในตารางการเบิกจ่ายเงิน (disbursements) เท่านั้น
  // ห้ามนำจำนวนเดือนของตารางความก้าวหน้ารายครั้ง/รายเดือน (periodicProgress) มาแสดงเป็นงวดเงินของสัญญา
  const maxDisbursementPeriodNo = disbursements.reduce((max, d) => {
    const pNum =
      typeof d.periodNo === "number"
        ? d.periodNo
        : parseInt(String(d.periodNo || "").replace(/\D/g, ""), 10);
    return !isNaN(pNum) && pNum > max ? pNum : max;
  }, 0);
  const actualDisbursementsCount = Math.max(disbursements.length, maxDisbursementPeriodNo);
  const totalContractPeriodsCount = actualDisbursementsCount > 0 ? actualDisbursementsCount : 0;

  const pendingDisbursedCount = disbursements.filter(
    (d) => (d.status || "").trim() !== "เบิกจ่ายแล้ว"
  ).length;

  const remainingCount =
    actualDisbursementsCount > 0
      ? (pendingDisbursedCount > 0 ? pendingDisbursedCount : Math.max(0, totalContractPeriodsCount - disbursedCount))
      : 0;

  // Timeline & contract period calculation
  const currentProgress = getCurrentProgressInfo(project);
  const currentProgPercent = currentProgress.actualPercent || project.progressField || 0;

  const timeline = calculateProjectTimeline(
    project.startDate,
    project.endDate,
    project.contractDays,
    currentProgPercent,
    project.periodicProgress,
    project.sheetName
  );

  const penaltyResult = calculateLiquidatedDamages(project, currentProgPercent);

  const isWorkCompleted = Boolean(
    timeline.isCompleted || currentProgPercent >= 100
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

  const totalElapsedDays = (timeline.contractDays || project.contractDays || 0) + completedOverdueDays;
  const actualDeliveryDateStr = timeline.lastPeriodEndDateStr || penaltyResult?.lastPeriodEndDateStr || project.acceptedDate;

  const contractDaysVal = timeline.contractDays || project.contractDays || 0;
  const remainingDaysVal =
    timeline.remainingDays !== undefined ? timeline.remainingDays : (project.remainingDays ?? 0);

  let contractPeriodStatusText = "";
  if (isCompletedDeliveredLate) {
    contractPeriodStatusText = `ส่งมอบช้ากว่าสัญญา +${toArabicDigits(completedOverdueDays)} วัน`;
  } else if (isWorkCompleted) {
    contractPeriodStatusText = `งานแล้วเสร็จตามกำหนดสัญญา`;
  } else if (timeline.isExpired || (timeline.overdueDays && timeline.overdueDays > 0)) {
    contractPeriodStatusText = `เกินกำหนดสัญญา ${toArabicDigits(timeline.overdueDays)} วัน`;
  } else {
    contractPeriodStatusText = `คงเหลือ ${toArabicDigits(remainingDaysVal)} วัน`;
  }
  const remainingDaysText = contractPeriodStatusText;

  const printTimeStr = toArabicDigits(
    new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date())
  );

  // Calculate rowSpan for grouped 'ผลงาน' column to match the interactive UI table
  const rowSpans: number[] = [];
  let rIdx = 0;
  while (rIdx < workRounds.length) {
    let span = 1;
    while (rIdx + span < workRounds.length && workRounds[rIdx + span] === workRounds[rIdx]) {
      span++;
    }
    // Add 1 to rowSpan to cover the subtotal summary row at the bottom of each group
    rowSpans.push(span + 1);
    for (let s = 1; s < span; s++) {
      rowSpans.push(0);
    }
    rIdx += span;
  }

  // Generate Table Rows grouped by work deliverable rounds matching the Disbursements table
  let tableRowsHtml = "";

  sortedDisbursements.forEach((d, idx) => {
    const rowSpan = rowSpans[idx];
    const currentRound = workRounds[idx];
    const stats = groupStats[currentRound];
    const isDisbursed = d.status === "เบิกจ่ายแล้ว";
    const amt = Number(d.amount) || 0;
    const periodActualPercent = getActualMonthlyPercentForPeriod(d.periodNo, periodicRecords);

    // Pull directly from the disbursement record's remarks ("หมายเหตุ / รายละเอียดงวด" from before print)
    const rawRemarks = d.remarks ? String(d.remarks).trim() : "";
    const cleanRemarks = rawRemarks
      .replace(/\[(?:ผลงาน|กลุ่มผลงาน|งวดส่งมอบ|งวดงาน|ครั้งที่|งวด)\s*[:=]?\s*[^\]]+\]\s*/gi, "")
      .replace(/^\[ครั้งที่\s*\d+\]\s*/gi, "")
      .trim();

    const isFinalPeriodRow =
      idx === sortedDisbursements.length - 1 ||
      (penaltyResult?.lastPeriodNo !== undefined && d.periodNo === penaltyResult.lastPeriodNo);

    let displayRemarks =
      cleanRemarks !== "" && cleanRemarks !== "-"
        ? toArabicDigits(cleanRemarks).replace(/\n/g, "<br/>")
        : "-";

    if (isCompletedDeliveredLate && isFinalPeriodRow && actualDeliveryDateStr) {
      const lateNoteHtml = `<span style="display: inline-block; margin-top: 2px; font-size: 10.5px; font-weight: 700; color: #9a3412; background: #fffbeb; border: 1px solid #fde68a; padding: 1px 6px; border-radius: 4px;">ส่งมอบจริง: ${toArabicDigits(formatDateDisplay(actualDeliveryDateStr))} (ช้ากว่าสัญญา +${toArabicDigits(completedOverdueDays)} วัน)</span>`;
      if (displayRemarks === "-") {
        displayRemarks = lateNoteHtml;
      } else {
        displayRemarks += `<br/>${lateNoteHtml}`;
      }
    }

    const isLastInGroup = idx === sortedDisbursements.length - 1 || workRounds[idx + 1] !== currentRound;

    // Individual period row
    tableRowsHtml += `
      <tr style="background-color: ${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
        ${
          rowSpan > 0
            ? `
          <td rowspan="${rowSpan}" style="border: 1px solid #cbd5e1; padding: 6px 3px; text-align: center; vertical-align: middle; background-color: #f8fafc; box-sizing: border-box;">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;">
              <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2.5px 6px; border-radius: 6px; background-color: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; font-weight: 700; font-size: 11px; white-space: nowrap; box-sizing: border-box;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px;"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                <span>${toArabicDigits(currentRound)}</span>
              </span>
              ${
                stats && stats.totalCount > 1
                  ? `<span style="font-size: 10px; color: #2563eb; font-weight: 700; font-family: 'Sarabun', 'Prompt', sans-serif;">(${toArabicDigits(stats.totalCount)} งวด)</span>`
                  : ""
              }
            </div>
          </td>
        `
            : ""
        }
        <td style="border: 1px solid #cbd5e1; padding: 6px 4px; text-align: center; vertical-align: middle; box-sizing: border-box;">
          <span style="display: inline-block; background-color: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; padding: 2px 7px; border-radius: 6px; font-weight: 700; font-size: 11px; white-space: nowrap; box-sizing: border-box;">
            งวดที่ ${toArabicDigits(d.periodNo)}
          </span>
        </td>
        <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px 8px; font-family: 'Sarabun', 'Prompt', sans-serif; font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 700; color: #0f172a; white-space: nowrap; vertical-align: middle; box-sizing: border-box;">
          ${amt.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท
        </td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px 4px; color: #065f46; font-size: 11.5px; font-family: 'Sarabun', 'Prompt', sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; vertical-align: middle; box-sizing: border-box;">
          ${
            periodActualPercent !== null
              ? `<span style="display: inline-block; background-color: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; padding: 1.5px 6px; border-radius: 4px; font-weight: 700; font-size: 11px; white-space: nowrap; box-sizing: border-box;">${toArabicDigits(periodActualPercent.toFixed(2))}%</span>`
              : `<span style="color: #94a3b8; font-weight: 400;">-</span>`
          }
        </td>
        <td style="border: 1px solid #cbd5e1; padding: 5px 4px; text-align: center; vertical-align: middle; box-sizing: border-box;">
          ${
            isDisbursed
              ? `<span style="display: inline-flex; align-items: center; gap: 3px; background-color: #ecfdf5; color: #065f46; border: 1px solid #86efac; padding: 2px 6px; border-radius: 9999px; font-size: 10.5px; font-weight: 700; white-space: nowrap; box-sizing: border-box;">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px;"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                  <span>เบิกจ่ายแล้ว</span>
                </span>`
              : `<span style="display: inline-flex; align-items: center; gap: 3px; background-color: #fffbeb; color: #92400e; border: 1px solid #fcd34d; padding: 2px 6px; border-radius: 9999px; font-size: 10.5px; font-weight: 700; white-space: nowrap; box-sizing: border-box;">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span>ยังไม่เบิกจ่าย</span>
                </span>`
          }
        </td>
        <td style="border: 1px solid #cbd5e1; padding: 6px 10px; font-size: 12px; color: #334155; line-height: 1.4; vertical-align: middle; word-break: break-word; overflow-wrap: break-word; box-sizing: border-box;">
          ${displayRemarks}
        </td>
      </tr>
    `;

    // Subtotal Row after the last row of each work deliverable group
    if (isLastInGroup && stats) {
      const isAllDisbursed = stats.disbursedCount === stats.totalCount;
      const isNoneDisbursed = stats.disbursedCount === 0;

      tableRowsHtml += `
        <tr style="background-color: #eff6ff; border-top: 1.5px solid #bfdbfe; border-bottom: 2px solid #93c5fd; font-weight: 700;">
          <td style="border: 1px solid #cbd5e1; padding: 6px 4px; text-align: center; background-color: #eff6ff; vertical-align: middle; box-sizing: border-box;">
            <span style="display: inline-flex; align-items: center; justify-content: center; gap: 3px; background-color: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; padding: 2px 6px; border-radius: 6px; font-weight: 700; font-size: 11px; white-space: nowrap; box-sizing: border-box;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px;"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>
              <span>รวม (${toArabicDigits(stats.totalCount)} งวด)</span>
            </span>
          </td>
          <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px 8px; font-family: 'Sarabun', 'Prompt', sans-serif; font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 800; color: #1e3a8a; background-color: #eff6ff; white-space: nowrap; vertical-align: middle; box-sizing: border-box;">
            ${stats.totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท
          </td>
          <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px 4px; color: #1e40af; background-color: #eff6ff; font-size: 11.5px; font-family: 'Sarabun', 'Prompt', sans-serif; font-variant-numeric: tabular-nums; vertical-align: middle; box-sizing: border-box;">
            ${
              stats.hasAnyPercent
                ? `<span style="display: inline-block; background-color: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; padding: 1.5px 6px; border-radius: 4px; font-weight: 800; font-size: 11px; white-space: nowrap; box-sizing: border-box;">${toArabicDigits(stats.totalActualPercent.toFixed(2))}%</span>`
                : `<span style="color: #94a3b8; font-weight: 400;">-</span>`
            }
          </td>
          <td style="border: 1px solid #cbd5e1; padding: 5px 4px; text-align: center; background-color: #eff6ff; vertical-align: middle; box-sizing: border-box;">
            ${
              isAllDisbursed
                ? `<span style="display: inline-flex; align-items: center; gap: 3px; background-color: #ecfdf5; color: #065f46; border: 1px solid #86efac; padding: 2px 6px; border-radius: 9999px; font-size: 10.5px; font-weight: 700; white-space: nowrap; box-sizing: border-box;">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px;"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                    <span>เบิกจ่ายครบแล้ว</span>
                  </span>`
                : isNoneDisbursed
                ? `<span style="display: inline-flex; align-items: center; gap: 3px; background-color: #fffbeb; color: #92400e; border: 1px solid #fcd34d; padding: 2px 6px; border-radius: 9999px; font-size: 10.5px; font-weight: 700; white-space: nowrap; box-sizing: border-box;">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span>ยังไม่เบิกจ่าย</span>
                  </span>`
                : `<span style="display: inline-flex; align-items: center; gap: 3px; background-color: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; padding: 2px 6px; border-radius: 9999px; font-size: 10.5px; font-weight: 700; white-space: nowrap; box-sizing: border-box;">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span>เบิกแล้ว ${toArabicDigits(stats.disbursedCount)}/${toArabicDigits(stats.totalCount)} งวด</span>
                  </span>`
            }
          </td>
          <td style="border: 1px solid #cbd5e1; padding: 6px 10px; background-color: #eff6ff; font-size: 11px; vertical-align: middle; box-sizing: border-box; text-align: left; line-height: 1.35;">
            ${
              stats.disbursedCount > 0 && stats.disbursedCount < stats.totalCount
                ? `<span style="color: #1e3a8a; font-weight: 600;">เบิกแล้ว ${stats.disbursedAmount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ. <span style="color: #64748b; font-weight: normal;">(คงเหลือ ${(stats.totalAmount - stats.disbursedAmount).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.)</span></span>`
                : `<span style="color: #1e40af; font-weight: 700;">รวมยอดส่งมอบ ${toArabicDigits(currentRound)}</span>`
            }
          </td>
        </tr>
      `;
    }
  });

  // Filter photos if specific photos are selected, otherwise use all project photos
  let targetPhotos = includePhotos ? photos : [];
  if (includePhotos && selectedPhotoIndices) {
    const selectedSet = new Set(selectedPhotoIndices);
    targetPhotos = photos.filter((_, idx) => selectedSet.has(idx));
  }

  // Chunk photos into EXACTLY 6 photos per page (2 columns x 3 rows) for A4 page layout
  const PHOTOS_PER_PAGE = 6;
  const photoPages: (typeof photos)[] = [];
  for (let p = 0; p < targetPhotos.length; p += PHOTOS_PER_PAGE) {
    photoPages.push(targetPhotos.slice(p, p + PHOTOS_PER_PAGE));
  }

  // Parse and paginate remarks for the dedicated Table Notes & Remarks page(s)
  interface ParsedPdfRemarkItem {
    periodNo: number | null;
    periodLabel: string;
    isPeriod: boolean;
    cleanText: string;
    formattedHtml: string;
    lineCount: number;
  }

  const cleanedRemarksSource = (includeRemarks ? remarksToDisplay : [])
    .map((raw) => cleanRemarkText(raw))
    .filter((raw) => raw.trim().length > 0 && !/^[\s•\-\*]*$/.test(raw.trim()));

  const parsedRemarksList: ParsedPdfRemarkItem[] = cleanedRemarksSource.map((raw, idx) => {
    const rawTrimmed = (raw || "").trim();
    const normalizedRaw = toArabicDigits(rawTrimmed);
    let periodNo: number | null = null;
    let periodLabel = `งวดที่ ${toArabicDigits(idx + 1)}`;
    let isPeriod = true;
    let bodyText = cleanRemarkText(rawTrimmed);

    const periodMatch = normalizedRaw.match(/^(?:\[?งวดที่\s*(\d+)\]?[:\s-]*)([\s\S]*)$/);
    if (periodMatch && periodMatch[1] && periodMatch[2].trim().length > 0) {
      periodNo = parseInt(periodMatch[1], 10);
      periodLabel = `งวดที่ ${toArabicDigits(periodNo)}`;
      bodyText = cleanRemarkText(rawTrimmed.replace(/^(?:\[?งวดที่\s*[\d๑-๙]+\]?[:\s-]*)/, "")).trim();
      isPeriod = true;
    } else {
      const numMatch = normalizedRaw.match(/^(?:\[?ข้อที่\s*(\d+)\]?[:\s-]*)([\s\S]*)$/);
      if (numMatch && numMatch[1] && numMatch[2].trim().length > 0) {
        periodNo = parseInt(numMatch[1], 10);
        periodLabel = `ข้อที่ ${toArabicDigits(periodNo)}`;
        bodyText = cleanRemarkText(rawTrimmed.replace(/^(?:\[?ข้อที่\s*[\d๑-๙]+\]?[:\s-]*)/, "")).trim();
        isPeriod = false;
      } else {
        periodNo = idx + 1;
        periodLabel = `งวดที่ ${toArabicDigits(idx + 1)}`;
        bodyText = cleanRemarkText(rawTrimmed.replace(/^(?:\[?งวดที่\s*[\d๑-๙]+\]?[:\s-]*)/, "")).trim();
        isPeriod = true;
      }
    }

    const formattedHtml = formatRemarkBodyHtml(bodyText);
    const lineCount = Math.max(1, bodyText.split(/\r?\n/).length);

    return {
      periodNo,
      periodLabel,
      isPeriod,
      cleanText: bodyText,
      formattedHtml,
      lineCount,
    };
  }).filter((item) => item.cleanText.length > 0);

  const remarksPages: ParsedPdfRemarkItem[][] = [];
  if (includeRemarks && parsedRemarksList.length > 0) {
    let currentPage: ParsedPdfRemarkItem[] = [];
    let currentWeight = 0;
    const MAX_PAGE_WEIGHT = 780; // approximate height budget in pixels for remarks content per A4 page

    for (const item of parsedRemarksList) {
      const itemWeight = 36 + item.lineCount * 20 + 8;
      if (
        currentPage.length > 0 &&
        (currentWeight + itemWeight > MAX_PAGE_WEIGHT || currentPage.length >= 8)
      ) {
        remarksPages.push(currentPage);
        currentPage = [item];
        currentWeight = itemWeight;
      } else {
        currentPage.push(item);
        currentWeight += itemWeight;
      }
    }
    if (currentPage.length > 0) {
      remarksPages.push(currentPage);
    }
  }

  const totalPages = 1 + remarksPages.length + photoPages.length;

  return `
  <!DOCTYPE html>
  <html lang="th" style="background-color: #f1f5f9; color-scheme: light;">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light">
    <title>รายงานสรุปงวดการส่งมอบงานและการเบิกจ่ายเงิน - ${project.projectName}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700;800&family=Prompt:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      :root {
        color-scheme: light !important;
        forced-color-adjust: none !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      @page {
        size: A4 portrait;
        margin: 10mm 12mm 10mm 12mm;
      }
      * {
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        font-family: 'Sarabun', 'Prompt', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        color: #0f172a !important;
        margin: 0 !important;
        padding: 0 !important;
        font-size: 12.5px;
        line-height: 1.45;
        background-color: #f1f5f9;
        font-feature-settings: 'tnum' 1;
      }

      /* SCREEN / MODAL PREVIEW: Realistic A4 Paper Sheets floating on canvas */
      @media screen {
        body {
          background-color: #e2e8f0;
          padding: 20px 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          min-height: 100vh;
        }
        .pdf-page {
          background: #ffffff;
          width: 210mm;
          min-height: 297mm;
          padding: 11mm 12mm 10mm 12mm;
          box-shadow: 0 4px 20px rgba(15, 23, 42, 0.12);
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-sizing: border-box;
          position: relative;
        }
      }

      /* PRINT MODE: Native A4 Print Engine */
      @media print {
        html, body {
          background: #ffffff !important;
          background-color: #ffffff !important;
          color: #0f172a !important;
          padding: 0 !important;
          margin: 0 !important;
          width: auto !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .no-print {
          display: none !important;
        }
        .pdf-page {
          width: 100% !important;
          min-height: 275mm !important;
          padding: 0 !important;
          margin: 0 !important;
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          page-break-after: always !important;
          break-after: page !important;
        }
        .pdf-page:last-child {
          page-break-after: avoid !important;
          break-after: avoid !important;
        }
      }

      .pdf-page-content {
        flex: 1 0 auto;
      }

      /* FORMAL REPORT HEADER */
      .report-header {
        border-bottom: 2px solid #1e3a8a;
        padding-bottom: 8px;
        margin-bottom: 12px;
        page-break-after: avoid;
        break-after: avoid;
      }
      .header-meta-row {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 12px;
        margin-bottom: 3px;
      }
      .print-date {
        font-size: 11px;
        color: #64748b;
      }
      .doc-title {
        font-size: 19px;
        font-weight: 800;
        color: #0f172a;
        margin: 0 0 3px 0;
        line-height: 1.3;
      }
      .doc-subtitle {
        font-size: 11.5px;
        color: #475569;
        margin: 0;
      }

      /* STRUCTURED PROJECT SPEC SHEET */
      .spec-card {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        margin-bottom: 12px;
        overflow: hidden;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .spec-row-project {
        padding: 8px 12px;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        gap: 8px;
        align-items: baseline;
      }
      .spec-row-project .label {
        font-weight: 700;
        color: #475569;
        font-size: 13px;
        white-space: nowrap;
        min-width: 72px;
      }
      .spec-row-project .val {
        font-weight: 800;
        color: #1e3a8a;
        font-size: 14.5px;
        line-height: 1.4;
      }

      .spec-grid-details {
        display: grid;
        grid-template-columns: 1fr 1.05fr 1.55fr;
        padding: 8px 12px;
        gap: 10px;
        border-bottom: 1px solid #e2e8f0;
        background: #ffffff;
        font-size: 12.5px;
        line-height: 1.45;
        align-items: center;
      }
      .spec-grid-details .detail-item {
        color: #1e293b;
      }
      .spec-grid-details strong {
        color: #475569;
        font-weight: 700;
      }

      /* FINANCIAL STRIP (3 HORIZONTAL COLUMNS) */
      .financial-summary-strip {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        background: #f8fafc;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .fin-col {
        padding: 8px 12px;
        border-right: 1px solid #e2e8f0;
      }
      .fin-col:last-child {
        border-right: none;
      }
      .fin-title {
        font-size: 11.5px;
        font-weight: 700;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .fin-val-wrap {
        display: flex;
        align-items: baseline;
        gap: 4px;
        margin: 3px 0 1px 0;
      }
      .fin-val {
        font-size: 18px;
        font-weight: 800;
        font-family: 'Sarabun', 'Prompt', sans-serif !important;
        font-variant-numeric: tabular-nums;
        line-height: 1.2;
      }
      .fin-unit {
        font-size: 12px;
        font-weight: 600;
      }
      .fin-sub {
        font-size: 11px;
      }
      .fin-col.total { background-color: #f8fafc; }
      .fin-col.total .fin-title { color: #1e3a8a; }
      .fin-col.total .fin-val { color: #1e3a8a; }
      .fin-col.total .fin-unit { color: #1e3a8a; }

      .fin-col.paid { background-color: #f0fdf4; border-right-color: #dcfce7; }
      .fin-col.paid .fin-title { color: #15803d; }
      .fin-col.paid .fin-val { color: #16a34a; }
      .fin-col.paid .fin-unit { color: #16a34a; }

      .fin-col.remaining { background-color: #fefce8; }
      .fin-col.remaining .fin-title { color: #a16207; }
      .fin-col.remaining .fin-val { color: #ca8a04; }
      .fin-col.remaining .fin-unit { color: #ca8a04; }

      /* PERSONNEL & SUPERVISION SPEC ROW */
      .spec-personnel-row {
        display: grid;
        grid-template-columns: 1.15fr 1fr;
        background: #ffffff;
        border-top: 1px solid #e2e8f0;
        font-size: 13.5px;
        line-height: 1.5;
        box-sizing: border-box;
      }
      .personnel-block {
        padding: 8px 14px;
        box-sizing: border-box;
      }
      .personnel-block.committee-block {
        border-right: 1px solid #e2e8f0;
      }
      .personnel-block-header {
        margin-bottom: 6px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .personnel-badge {
        font-size: 12.5px;
        font-weight: 800;
        padding: 2px 8px;
        border-radius: 4px;
        display: inline-block;
      }
      .personnel-badge.committee-badge {
        background: #e0f2fe;
        color: #0369a1;
        border: 1px solid #bae6fd;
      }
      .personnel-badge.supervisor-badge {
        background: #fef3c7;
        color: #92400e;
        border: 1px solid #fde68a;
      }
      .personnel-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .personnel-item {
        display: flex;
        align-items: baseline;
        gap: 6px;
      }
      .personnel-role {
        color: #334155;
        font-weight: 700;
        min-width: 130px;
        flex-shrink: 0;
        font-size: 13.5px;
      }
      .personnel-name {
        color: #0f172a;
        font-weight: 600;
        word-break: break-word;
        font-size: 13.5px;
      }

      /* SECTION TITLE */
      .section-heading {
        font-size: 14.5px;
        font-weight: 800;
        color: #1e3a8a;
        margin: 12px 0 8px 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-left: 4px solid #1e3a8a;
        padding-left: 8px;
        page-break-after: avoid;
        break-after: avoid;
      }
      .section-count {
        font-size: 12px;
        font-weight: 700;
        color: #334155;
        background: #f1f5f9;
        padding: 2.5px 10px;
        border-radius: 9999px;
        border: 1px solid #cbd5e1;
      }

      /* STRICT FIXED TABLE LAYOUT PREVENTS DISTORTION IN EXPORT */
      table.report-table {
        width: 100% !important;
        max-width: 100% !important;
        border-collapse: collapse !important;
        border-spacing: 0 !important;
        table-layout: fixed !important;
        margin-bottom: 10px !important;
        font-size: 12px !important;
        page-break-inside: auto;
        break-inside: auto;
        box-sizing: border-box !important;
      }
      table.report-table thead {
        display: table-header-group;
      }
      table.report-table tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      table.report-table th {
        background-color: #1e3a8a !important;
        color: #ffffff !important;
        font-weight: 700 !important;
        padding: 7px 6px !important;
        border: 1px solid #1e40af !important;
        font-size: 12.5px !important;
        vertical-align: middle !important;
        white-space: nowrap !important;
        box-sizing: border-box !important;
      }
      table.report-table th.th-center { text-align: center !important; }
      table.report-table th.th-left { text-align: left !important; padding-left: 10px !important; }
      table.report-table th.th-right { text-align: right !important; padding-right: 10px !important; }
      table.report-table td {
        padding: 6px 8px;
        border: 1px solid #cbd5e1 !important;
        font-size: 12px !important;
        vertical-align: middle !important;
        box-sizing: border-box !important;
      }
      .group-header-row td {
        padding: 6px 10px !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        box-sizing: border-box !important;
      }
      .grand-total-row td {
        background-color: #f1f5f9 !important;
        font-weight: 800 !important;
        border: 1px solid #cbd5e1 !important;
        border-top: 2px solid #64748b !important;
        border-bottom: 2px solid #1e293b !important;
        padding: 6px 6px !important;
        color: #0f172a !important;
        font-size: 12px !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        box-sizing: border-box !important;
      }

      /* DEDICATED TABLE NOTES & REMARKS PAGE (MATCHING หน้าก่อนสั่งพิมพ์) */
      .remarks-page-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 6px;
      }
      .remark-card {
        background-color: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 8px !important;
        padding: 7px 12px 8px 12px !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 3px !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        box-sizing: border-box !important;
        width: 100% !important;
      }
      .remark-header {
        display: flex !important;
        align-items: center !important;
        justify-content: flex-start !important;
        border-bottom: 1px solid #f1f5f9 !important;
        padding-bottom: 3px !important;
        margin-bottom: 4px !important;
      }
      .remark-badge {
        display: inline-flex !important;
        align-items: center !important;
        font-weight: 700 !important;
        color: #047857 !important;
        background-color: #ecfdf5 !important;
        border: 1px solid #a7f3d0 !important;
        border-radius: 6px !important;
        padding: 2px 8px !important;
        font-size: 12px !important;
        line-height: 1.4 !important;
        letter-spacing: -0.2px !important;
        user-select: none !important;
      }
      .remark-badge.remark-badge-item {
        color: #1e40af !important;
        background-color: #eff6ff !important;
        border-color: #bfdbfe !important;
      }
      .remark-body {
        width: 100% !important;
        font-size: 12px !important;
        color: #1e293b !important;
        font-weight: 500 !important;
        line-height: 1.6 !important;
        letter-spacing: -0.12px !important;
        word-break: break-word !important;
        white-space: pre-wrap !important;
        box-sizing: border-box !important;
        padding-left: 2px !important;
        padding-right: 2px !important;
      }
      .remark-pill-green {
        display: inline-block !important;
        background-color: #a7f3d0 !important;
        color: #022c22 !important;
        border: 1px solid #6ee7b7 !important;
        border-radius: 4px !important;
        font-weight: 700 !important;
        font-size: 11px !important;
        padding: 0.5px 5px !important;
        line-height: 1.35 !important;
        margin: 0 1.5px !important;
        vertical-align: baseline !important;
        white-space: nowrap !important;
      }
      .remark-pill-yellow {
        display: inline-block !important;
        background-color: #fde68a !important;
        color: #451a03 !important;
        border: 1px solid #fcd34d !important;
        border-radius: 4px !important;
        font-weight: 700 !important;
        font-size: 11px !important;
        padding: 0.5px 5px !important;
        line-height: 1.35 !important;
        margin: 0 1.5px !important;
        vertical-align: baseline !important;
        white-space: nowrap !important;
      }
      .remark-pill-blue {
        display: inline-block !important;
        background-color: #bae6fd !important;
        color: #082f49 !important;
        border: 1px solid #7dd3fc !important;
        border-radius: 4px !important;
        font-weight: 700 !important;
        font-size: 11px !important;
        padding: 0.5px 5px !important;
        line-height: 1.35 !important;
        margin: 0 1.5px !important;
        vertical-align: baseline !important;
        white-space: nowrap !important;
      }
      .remark-pill-orange {
        display: inline-block !important;
        background-color: #fed7aa !important;
        color: #431407 !important;
        border: 1px solid #fdba74 !important;
        border-radius: 4px !important;
        font-weight: 700 !important;
        font-size: 11px !important;
        padding: 0.5px 5px !important;
        line-height: 1.35 !important;
        margin: 0 1.5px !important;
        vertical-align: baseline !important;
        white-space: nowrap !important;
      }
      .remark-pill-pink {
        display: inline-block !important;
        background-color: #fecdd3 !important;
        color: #4c0519 !important;
        border: 1px solid #fda4af !important;
        border-radius: 4px !important;
        font-weight: 700 !important;
        font-size: 11px !important;
        padding: 0.5px 5px !important;
        line-height: 1.35 !important;
        margin: 0 1.5px !important;
        vertical-align: baseline !important;
        white-space: nowrap !important;
      }
      .remark-pill-purple {
        display: inline-block !important;
        background-color: #e9d5ff !important;
        color: #3b0764 !important;
        border: 1px solid #d8b4fe !important;
        border-radius: 4px !important;
        font-weight: 700 !important;
        font-size: 11px !important;
        padding: 0.5px 5px !important;
        line-height: 1.35 !important;
        margin: 0 1.5px !important;
        vertical-align: baseline !important;
        white-space: nowrap !important;
      }
      /* Ensure nested pills never create overlapping borders or nested frames */
      [class*="remark-pill-"] [class*="remark-pill-"] {
        border: none !important;
        background: transparent !important;
        padding: 0 !important;
        margin: 0 !important;
        box-shadow: none !important;
      }

      /* 6 PHOTOS GRID PER A4 PAGE (2 COLUMNS x 3 ROWS) */
      .photo-grid-6 {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px 14px;
        margin-top: 8px;
      }
      .photo-card {
        border: 1.5px solid #cbd5e1;
        border-radius: 6px;
        overflow: hidden;
        background: #ffffff;
        box-sizing: border-box;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        display: flex;
        flex-direction: column;
        height: 270px;
      }
      .photo-img {
        width: 100%;
        height: 218px;
        object-fit: cover;
        display: block;
        background: #f1f5f9;
      }
      .photo-meta {
        padding: 5px 8px 6px 8px;
        background: #f8fafc;
        border-top: 1px solid #e2e8f0;
        flex: 1 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        box-sizing: border-box;
        min-height: 48px;
      }
      .photo-caption-single {
        font-size: 12.5px;
        color: #1e293b;
        text-align: center;
        width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.75;
        padding-top: 2px;
        padding-bottom: 2px;
        box-sizing: content-box;
      }
      .photo-icon {
        display: inline-block;
        font-size: 11px;
        vertical-align: 0;
        margin-right: 3px;
      }
      .photo-num {
        font-weight: 800;
        color: #1e3a8a;
      }
      .photo-sep {
        color: #64748b;
        font-weight: 700;
        margin: 0 4px;
      }
      .photo-desc {
        font-weight: 600;
        color: #0f172a;
      }

      /* FOOTER PINNED TO PAGE BOTTOM */
      .page-footer {
        margin-top: 10px;
        padding-top: 7px;
        border-top: 1px solid #e2e8f0;
        font-size: 10.5px;
        color: #64748b;
        display: flex;
        justify-content: space-between;
        align-items: center;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .page-footer .page-no {
        font-weight: 700;
        color: #1e3a8a;
      }
    </style>
  </head>
  <body>
    <!-- PAGE 1: PROJECT SPEC SHEET & DISBURSEMENTS TABLE -->
    <div class="pdf-page" id="page-1">
      <div class="pdf-page-content">
        <!-- HEADER -->
        <div class="report-header">
          <div class="header-meta-row">
            <span class="print-date">สัญญาเลขที่: ${project.contractNumber ? toArabicDigits(project.contractNumber) : "-"}</span>
          </div>
          <h1 class="doc-title">รายงานสรุปงวดการส่งมอบงานและการเบิกจ่ายเงิน</h1>
          <p class="doc-subtitle">Project Milestone Deliverables & Disbursement Progress Report</p>
        </div>

        <!-- STRUCTURED SPEC SHEET -->
        <div class="spec-card">
          <div class="spec-row-project">
            <span class="label">ชื่อโครงการ:</span>
            <span class="val">${project.projectName}</span>
          </div>

          <div class="spec-grid-details">
            <div class="detail-item">
              <strong>ผู้รับจ้าง:</strong> ${project.contractor || "-"}
            </div>
            <div class="detail-item">
              <strong>สัญญาเลขที่:</strong> ${project.contractNumber ? toArabicDigits(project.contractNumber) : "-"}
            </div>
            <div class="detail-item">
              ${
                isCompletedDeliveredLate
                  ? `
                <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 4px; flex-wrap: wrap;">
                  <div>
                    <strong>ระยะเวลาสัญญา:</strong> ${contractDaysVal > 0 ? `${toArabicDigits(contractDaysVal)} วัน` : "- วัน"}
                  </div>
                  <span style="display: inline-flex; align-items: center; gap: 3px; background-color: #fef3c7; color: #92400e; border: 1px solid #fcd34d; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; font-weight: 700; white-space: nowrap;">
                    ส่งมอบช้ากว่าสัญญา +${toArabicDigits(completedOverdueDays)} วัน
                  </span>
                </div>
                <div style="color: #475569; font-size: 11px; margin-top: 2px;">
                  ระหว่าง ${project.startDate ? toArabicDigits(formatDateDisplay(project.startDate)) : "-"} ถึง ${project.endDate ? toArabicDigits(formatDateDisplay(project.endDate)) : "-"}
                </div>
                ${
                  actualDeliveryDateStr
                    ? `
                  <div style="margin-top: 3px; font-size: 11.5px; color: #9a3412; font-weight: 700; display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                    <span>ส่งมอบจริง:</span>
                    <span style="background-color: #fffbeb; color: #78350f; border: 1px solid #fde68a; padding: 1px 6px; border-radius: 4px; font-family: 'Sarabun', 'Prompt', sans-serif; font-variant-numeric: tabular-nums;">
                      ${toArabicDigits(formatDateDisplay(actualDeliveryDateStr))}
                    </span>
                    <span style="color: #64748b; font-weight: 600; font-size: 10.5px;">
                      (รวม ${toArabicDigits(totalElapsedDays)} วัน)
                    </span>
                  </div>
                `
                    : ""
                }
              `
                  : `
                <div>
                  <strong>ระยะเวลาสัญญา:</strong> ${contractDaysVal > 0 ? `${toArabicDigits(contractDaysVal)} วัน` : "- วัน"} (${contractPeriodStatusText})
                </div>
                <div style="color: #475569; font-size: 11.5px; margin-top: 1.5px;">
                  ระหว่าง ${project.startDate ? toArabicDigits(formatDateDisplay(project.startDate)) : "-"} ถึง ${project.endDate ? toArabicDigits(formatDateDisplay(project.endDate)) : "-"}
                </div>
              `
              }
            </div>
          </div>

          <!-- 3-Column Balanced Financial Strip -->
          ${
            includeFinancialStrip
              ? `
          <div class="financial-summary-strip">
            <div class="fin-col total">
              <div class="fin-title">
                <span>วงเงินตามสัญญา</span>
                <span style="font-size: 11px; background: #e0e7ff; color: #1e3a8a; padding: 1.5px 7px; border-radius: 4px; font-weight: 700;">100%</span>
              </div>
              <div class="fin-val-wrap">
                <span class="fin-val">${totalContract.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span class="fin-unit">บาท</span>
              </div>
              <div class="fin-sub" style="color: #64748b;">${totalContractPeriodsCount > 0 ? `รวมทั้งสิ้น ${toArabicDigits(totalContractPeriodsCount)} งวดงาน` : `ตามสัญญาจ้าง`}</div>
            </div>

            <div class="fin-col paid">
              <div class="fin-title">
                <span>เบิกจ่ายสะสมแล้ว</span>
                <span style="font-size: 11px; background: #dcfce7; color: #166534; padding: 1.5px 7px; border-radius: 4px; font-weight: 700;">${toArabicDigits(disbursedPercent)}%</span>
              </div>
              <div class="fin-val-wrap">
                <span class="fin-val">${totalDisbursed.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span class="fin-unit">บาท</span>
              </div>
              <div class="fin-sub" style="color: #166534; font-weight: 600;">เบิกจ่ายแล้ว ${toArabicDigits(disbursedCount)} งวด</div>
            </div>

            <div class="fin-col remaining">
              <div class="fin-title">
                <span>คงเหลือรอเบิกจ่าย</span>
                <span style="font-size: 11px; background: #fef3c7; color: #92400e; padding: 1.5px 7px; border-radius: 4px; font-weight: 700;">${toArabicDigits(remainingPercent)}%</span>
              </div>
              <div class="fin-val-wrap">
                <span class="fin-val">${remainingDisbursed.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span class="fin-unit">บาท</span>
              </div>
              <div class="fin-sub" style="color: #92400e; font-weight: 600;">คงเหลือรอเบิก ${toArabicDigits(remainingCount)} งวด</div>
            </div>
          </div>
          `
              : ""
          }

          <!-- Personnel & Supervisory Overview Row -->
          ${
            includePersonnel
              ? `
          <div class="spec-personnel-row">
            <div class="personnel-block committee-block">
              <div class="personnel-block-header">
                <span class="personnel-badge committee-badge">คณะกรรมการตรวจรับพัสดุ</span>
              </div>
              <div class="personnel-list">
                <div class="personnel-item">
                  <span class="personnel-role">ประธานกรรมการ:</span>
                  <span class="personnel-name">${formatPersonnelName(project.chairman)}</span>
                </div>
                <div class="personnel-item">
                  <span class="personnel-role">กรรมการคนที่ 1:</span>
                  <span class="personnel-name">${formatPersonnelName(project.committee1)}</span>
                </div>
                <div class="personnel-item">
                  <span class="personnel-role">กรรมการคนที่ 2:</span>
                  <span class="personnel-name">${formatPersonnelName(project.committee2)}</span>
                </div>
              </div>
            </div>

            <div class="personnel-block supervisor-block">
              <div class="personnel-block-header">
                <span class="personnel-badge supervisor-badge">ผู้ควบคุมงาน</span>
              </div>
              <div class="personnel-list">
                <div class="personnel-item">
                  <span class="personnel-role">หัวหน้าผู้ควบคุมงาน:</span>
                  <span class="personnel-name">${formatPersonnelName(project.supervisorHead)}</span>
                </div>
                <div class="personnel-item">
                  <span class="personnel-role">ผู้ควบคุมงานหน้างาน:</span>
                  <span class="personnel-name">${formatPersonnelName(project.supervisor)}</span>
                </div>
              </div>
            </div>
          </div>
          `
              : ""
          }
        </div>

        <!-- SECTION 1: DISBURSEMENTS TABLE -->
        <div class="section-heading">
          <span>1. ตารางงวดงานและการเบิกจ่ายเงินค่างาน</span>
          <span class="section-count">รวมทั้งหมด ${toArabicDigits(disbursements.length)} งวดงาน</span>
        </div>

        <table class="report-table">
          <colgroup>
            <col style="width: 75px;" />
            <col style="width: 95px;" />
            <col style="width: 125px;" />
            <col style="width: 80px;" />
            <col style="width: 120px;" />
            <col style="width: auto;" />
          </colgroup>
          <thead>
            <tr>
              <th class="th-center" style="width: 75px;">ผลงาน</th>
              <th class="th-center" style="width: 95px;">งวดที่</th>
              <th class="th-right" style="width: 125px;">จำนวนเงิน (บาท)</th>
              <th class="th-center" style="width: 80px;">คิดเป็น %</th>
              <th class="th-center" style="width: 120px;">สถานะการเบิกจ่าย</th>
              <th class="th-left">หมายเหตุ / รายละเอียดงวด</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml || '<tr><td colspan="6" style="text-align:center; padding: 18px; color: #94a3b8;">ยังไม่มีรายการงวดงานในระบบ</td></tr>'}
            <!-- GRAND TOTAL ROW -->
            <tr class="grand-total-row">
              <td colspan="2" style="text-align: left; padding: 6px 8px !important; vertical-align: middle; box-sizing: border-box;">
                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <div style="font-weight: 800; font-size: 12px; color: #0f172a; white-space: nowrap;">
                    สรุปรวมทั้งสิ้น (${toArabicDigits(disbursements.length)} งวด)
                  </div>
                  <div style="font-size: 10px; font-weight: 600; color: #475569; white-space: nowrap;">
                    เบิกแล้ว ${toArabicDigits(disbursedCount)} งวด / รอเบิก ${toArabicDigits(remainingCount)} งวด
                  </div>
                </div>
              </td>
              <td style="text-align: right; font-family: 'Sarabun', 'Prompt', sans-serif; font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 800; color: #0f172a; white-space: nowrap; vertical-align: middle; padding: 6px 8px !important; box-sizing: border-box;">
                ${totalContract.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท
              </td>
              <td style="text-align: center; color: #1e3a8a; font-size: 11.5px; font-family: 'Sarabun', 'Prompt', sans-serif; font-variant-numeric: tabular-nums; vertical-align: middle; box-sizing: border-box; padding: 6px 4px !important;">
                ${
                  grandTotalActualPercent > 0
                    ? `<span style="display: inline-block; background: #e0e7ff; color: #1e3a8a; border: 1px solid #c7d2fe; padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 11px; white-space: nowrap; box-sizing: border-box;">${toArabicDigits(grandTotalActualPercent.toFixed(2))}%</span>`
                    : `<span style="color: #94a3b8; font-weight: 400;">-</span>`
                }
              </td>
              <td style="text-align: center; vertical-align: middle; padding: 5px 4px !important; box-sizing: border-box;">
                <span style="background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; padding: 2px 6px; border-radius: 9999px; display: inline-block; font-size: 10.5px; font-weight: 800; white-space: nowrap; box-sizing: border-box; max-width: 100%;">
                  เบิกจ่ายสะสม ${toArabicDigits(disbursedPercent)}%
                </span>
              </td>
              <td style="text-align: left; font-size: 11px; color: #475569; padding: 6px 10px !important; vertical-align: middle; box-sizing: border-box; line-height: 1.35;">
                ${
                  remainingDisbursed > 0
                    ? `คงเหลือยังไม่เบิกจ่าย: <span style="font-weight: 700; color: #0f172a; font-family: 'Sarabun', 'Prompt', sans-serif;">${remainingDisbursed.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> บาท (${toArabicDigits(remainingPercent)}%)`
                    : `<span style="color: #059669; font-weight: 700;">เบิกจ่ายครบถ้วนตามสัญญา 100%</span>`
                }
              </td>
            </tr>
          </tbody>
        </table>

        ${
          includePhotos && (photos.length === 0 || targetPhotos.length === 0)
            ? `
          <div style="margin-top: 8px; text-align: center; padding: 8px 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; color: #64748b; font-size: 11px;">
            ${photos.length === 0 ? "📷 หมายเหตุ: ยังไม่มีการบันทึกภาพถ่ายหน้างานสำหรับโครงการนี้" : "📷 หมายเหตุ: ไม่ได้เลือกรูปภาพสำหรับพิมพ์รายงาน"}
          </div>
        `
            : ""
        }
      </div>

      <!-- PAGE 1 FOOTER -->
      <div class="page-footer">
        <span>รายงานสรุปงวดการส่งมอบงานและการเบิกจ่ายเงิน</span>
        <span class="page-no">หน้า 1 จาก ${toArabicDigits(totalPages)} • วันที่พิมพ์: ${printTimeStr}</span>
      </div>
    </div>

    <!-- DEDICATED TABLE NOTES & REMARKS PAGES (หน้าถัดไป พร้อมจัดตำแหน่งและรูปแบบเหมือนหน้าก่อนสั่งพิมพ์) -->
    ${
      includeRemarks && remarksPages.length > 0
        ? remarksPages
            .map((pageItems, rIdx) => {
              const currentPageNo = 1 + rIdx + 1;
              return `
    <div class="pdf-page" id="page-${currentPageNo}">
      <div class="pdf-page-content">
        <div class="report-header">
          <div class="header-meta-row">
            <span class="print-date">สัญญาเลขที่: ${project.contractNumber ? toArabicDigits(project.contractNumber) : "-"}</span>
          </div>
          <div class="section-heading" style="margin: 2px 0 6px 0;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="white-space: nowrap;">2. หมายเหตุท้ายตาราง (Table Notes & Remarks) ${remarksPages.length > 1 ? `(ชุดที่ ${toArabicDigits(rIdx + 1)}/${toArabicDigits(remarksPages.length)})` : ""}</span>
            </div>
            <span class="section-count">รวมทั้งหมด ${toArabicDigits(parsedRemarksList.length)} รายการ</span>
          </div>
          <p class="doc-subtitle" style="margin-bottom: 10px;">
            โครงการ: <strong>${project.projectName}</strong>
          </p>
        </div>

        <!-- CARDS CONTAINER (MATCHING หน้าก่อนสั่งพิมพ์) -->
        <div class="remarks-page-container">
          ${pageItems
            .map(
              (item) => `
            <div class="remark-card" id="pdf-remark-${item.periodNo || ""}" data-period="${item.periodNo || ""}">
              <div class="remark-header">
                <div class="remark-badge ${item.isPeriod ? "" : "remark-badge-item"}">
                  ${item.periodLabel}
                </div>
              </div>
              <div class="remark-body" id="pdf-remark-body-${item.periodNo || ""}">${item.formattedHtml}</div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>

      <!-- REMARKS PAGE FOOTER -->
      <div class="page-footer">
        <span>รายงานสรุปงวดการส่งมอบงานและการเบิกจ่ายเงิน</span>
        <span class="page-no">หน้า ${toArabicDigits(currentPageNo)} จาก ${toArabicDigits(totalPages)} • วันที่พิมพ์: ${printTimeStr}</span>
      </div>
    </div>
          `;
            })
            .join("")
        : ""
    }

    <!-- PROGRESS PHOTOS PAGES (PAGINATED: EXACTLY 6 PHOTOS PER A4 PAGE IN 2x3 GRID) -->
    ${
      includePhotos && photoPages.length > 0
        ? photoPages
            .map((chunk, pIdx) => {
              const startIdx = pIdx * PHOTOS_PER_PAGE;
              const endIdx = Math.min(targetPhotos.length, (pIdx + 1) * PHOTOS_PER_PAGE);
              const currentPageNo = 1 + remarksPages.length + pIdx + 1;
              const sectionNumber = remarksPages.length > 0 ? "3" : "2";

              return `
        <div class="pdf-page" id="page-${currentPageNo}">
          <div class="pdf-page-content">
            <div class="report-header">
              <div class="header-meta-row">
                <span class="print-date">สัญญาเลขที่: ${project.contractNumber ? toArabicDigits(project.contractNumber) : "-"}</span>
              </div>
              <div class="section-heading" style="margin: 2px 0 4px 0;">
                <span style="white-space: nowrap;">${sectionNumber}. ภาพถ่ายความก้าวหน้าและการปฏิบัติงานหน้างานก่อสร้าง ${photoPages.length > 1 ? `(ชุดที่ ${toArabicDigits(pIdx + 1)}/${toArabicDigits(photoPages.length)})` : ""}</span>
              </div>
              <p class="doc-subtitle">โครงการ: <strong>${project.projectName}</strong> | ภาพที่ ${toArabicDigits(startIdx + 1)} ถึง ${toArabicDigits(endIdx)}</p>
            </div>

            <div class="photo-grid-6">
              ${chunk
                .map(
                  (ph, idx) => {
                    const globalIdx = startIdx + idx;
                    const remarksRaw = (ph.remarks || "").trim();
                    const hasRemarks = remarksRaw.length > 0 && remarksRaw !== "-";
                    const remarksClean = hasRemarks
                      ? toArabicDigits(remarksRaw).replace(/ภาพที(\s|\d|:|$)/g, "ภาพที่$1")
                      : "";
                    const fullTitle = remarksClean
                      ? `ภาพที่ ${toArabicDigits(globalIdx + 1)} : ${remarksClean}`
                      : `ภาพที่ ${toArabicDigits(globalIdx + 1)}`;
                    return `
                <div class="photo-card">
                  <img src="${ph.imageUrl}" class="photo-img" alt="ภาพถ่ายหน้างานที่ ${toArabicDigits(globalIdx + 1)}" crossOrigin="anonymous" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'400\\' height=\\'200\\' viewBox=\\'0 0 400 200\\'><rect fill=\\'%23f1f5f9\\' width=\\'400\\' height=\\'200\\'/><text fill=\\'%2394a3b8\\' font-family=\\'sans-serif\\' font-size=\\'14\\' x=\\'50%\\' y=\\'50%\\' text-anchor=\\'middle\\'>ภาพถ่ายหน้างานที่ ${toArabicDigits(globalIdx + 1)}</text></svg>'" />
                  <div class="photo-meta">
                    <div class="photo-caption-single" title="${fullTitle}">
                      <span class="photo-icon">📷</span> <span class="photo-num">ภาพที่ ${toArabicDigits(globalIdx + 1)}</span>${remarksClean ? `<span class="photo-sep">:</span><span class="photo-desc">${remarksClean}</span>` : ""}
                    </div>
                  </div>
                </div>
              `;
                  }
                )
                .join("")}
            </div>
          </div>

          <!-- PHOTO PAGE FOOTER -->
          <div class="page-footer">
            <span>รายงานสรุปงวดการส่งมอบงานและการเบิกจ่ายเงิน</span>
            <span class="page-no">หน้า ${toArabicDigits(currentPageNo)} จาก ${toArabicDigits(totalPages)} • วันที่พิมพ์: ${printTimeStr}</span>
          </div>
        </div>
      `;
            })
            .join("")
        : ""
    }
  </body>
  </html>
  `;
}

export function printDisbursementsPdfReport(
  project: Project,
  getWorkRound?: (d: any, index: number, arr: any[]) => string,
  options?: DisbursementsPdfOptions
) {
  const htmlContent = generateDisbursementsPdfHtml(project, getWorkRound, options);
  
  // Try using an invisible iframe first for smooth in-page printing without popup blockers
  let iframe = document.getElementById("pdf-print-iframe") as HTMLIFrameElement;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "pdf-print-iframe";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);
  }

  try {
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      }, 500);
      return;
    }
  } catch (e) {
    console.warn("Iframe print failed, falling back to window.open", e);
  }

  // Fallback to window.open if iframe is blocked
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 600);
  }
}

export async function downloadDisbursementsPdfBlob(
  project: Project,
  getWorkRound?: (d: any, index: number, arr: any[]) => string,
  options?: DisbursementsPdfOptions
): Promise<Blob> {
  const htmlContent = generateDisbursementsPdfHtml(project, getWorkRound, options);

  // Create an offscreen iframe so that all styles (Sarabun font, table styles, fixed layout)
  // are completely isolated from the React/Tailwind main window, ensuring 100% fidelity to the preview!
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.top = "0";
  iframe.style.left = "0";
  iframe.style.width = "794px"; // 210mm in 96 DPI CSS pixels
  iframe.style.height = "1123px"; // 297mm in 96 DPI CSS pixels
  iframe.style.border = "none";
  iframe.style.opacity = "0.01";
  iframe.style.pointerEvents = "none";
  iframe.style.zIndex = "-9999";
  document.body.appendChild(iframe);

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) throw new Error("Unable to access iframe document");

    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();

    // 1. Wait for Google Fonts to be fully ready in the iframe window
    if (iframe.contentWindow?.document?.fonts?.ready) {
      await iframe.contentWindow.document.fonts.ready;
    }

    // 2. Wait for any images in the document to complete loading
    const images = Array.from(iframeDoc.images);
    await Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(resolve, 2000); // 2s timeout fallback
        });
      })
    );

    // 3. Short settle time for paint
    await new Promise((resolve) => setTimeout(resolve, 350));

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    // Query all discrete .pdf-page elements in the isolated document
    const pageEls = iframeDoc.querySelectorAll<HTMLElement>(".pdf-page");

    if (pageEls.length > 0) {
      for (let i = 0; i < pageEls.length; i++) {
        const pageEl = pageEls[i];

        // Clean borderless flat rendering for capture
        const origShadow = pageEl.style.boxShadow;
        const origRadius = pageEl.style.borderRadius;
        pageEl.style.boxShadow = "none";
        pageEl.style.borderRadius = "0";

        const canvas = await html2canvas(pageEl, {
          scale: 2, // High resolution for ultra-sharp typography
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: "#ffffff",
          windowWidth: 794,
        });

        pageEl.style.boxShadow = origShadow;
        pageEl.style.borderRadius = origRadius;

        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        // Calculate true proportional height in mm: NEVER distort or squish vertically!
        const imgHeightMm = (canvas.height * pdfWidth) / canvas.width;

        if (i > 0) {
          pdf.addPage();
        }

        if (imgHeightMm <= pdfHeight + 2) {
          pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, imgHeightMm);
        } else {
          // If page content exceeds 297mm, slice gracefully across pages instead of squishing
          let heightLeft = imgHeightMm;
          let position = 0;
          pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeightMm);
          heightLeft -= pdfHeight;
          while (heightLeft > 0) {
            position = heightLeft - imgHeightMm;
            pdf.addPage();
            pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeightMm);
            heightLeft -= pdfHeight;
          }
        }
      }
    } else {
      // Fallback
      const canvas = await html2canvas(iframeDoc.body, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: 794,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const imgHeightMm = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, imgHeightMm);
    }

    document.body.removeChild(iframe);
    return pdf.output("blob");
  } catch (err) {
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
    throw err;
  }
}
