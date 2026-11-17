import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  BorderStyle,
  ShadingType,
} from "docx";
import { Project } from "../types";
import { getCurrentProgressInfo } from "../lib/periodicUtils";
import { formatDateDisplay, formatDateDisplayWithPeriod, calculateProjectTimeline, calculateLiquidatedDamages } from "../lib/dateUtils";

export interface ExportOptions {
  agencyName: string;
  reportTitle: string;
  selectedYear: string;
  selectedPlan: string;
  orientation: "portrait" | "landscape";
  recommendations: string;
  aiExecutiveSummary?: string;
  targetAudience?: "executive_board" | "governor" | "monthly";
  presentationTheme?: "emerald" | "navy" | "slate";
  sections: {
    summary: boolean;
    budget: boolean;
    progress: boolean;
    periodicTable: boolean;
    photos: boolean;
    map: boolean;
    contractor: boolean;
    timeline: boolean;
    issues: boolean;
    recommendations: boolean;
  };
}

const formatMoney = (val: number) => {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0) + " บาท";
};

export async function generateDocxReport(
  projects: Project[],
  options: ExportOptions
): Promise<Blob> {
  const primaryColor = "0F766E"; // Emerald
  const darkTextColor = "1E293B"; // Slate 800
  const headerBgColor = "F1F5F9"; // Slate 100

  const docChildren: any[] = [];

  // 1. Cover Page
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1000, after: 200 },
      children: [
        new TextRun({
          text: options.agencyName || "หน่วยงานบริหารโครงการก่อสร้าง",
          bold: true,
          size: 32, // 16pt
          color: primaryColor,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 600 },
      children: [
        new TextRun({
          text: options.reportTitle || "รายงานสรุปความก้าวหน้าโครงการก่อสร้างเพื่อนำเสนอผู้บริหาร",
          bold: true,
          size: 44, // 22pt
          color: darkTextColor,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 400 },
      children: [
        new TextRun({
          text: `ประจำปีงบประมาณ พ.ศ. ${options.selectedYear} (${options.selectedPlan || "รวมทุกแผนงาน"})`,
          size: 28, // 14pt
          color: "475569",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 1200 },
      children: [
        new TextRun({
          text: `วันที่จัดทำรายงาน: ${formatDateDisplay(new Date().toISOString().split("T")[0])}`,
          size: 24,
          italics: true,
          color: "64748B",
        }),
      ],
    })
  );

  // Divider Table / Line
  docChildren.push(
    new Paragraph({
      spacing: { before: 200, after: 600 },
      children: [
        new TextRun({
          text: "_________________________________________________________________________________",
          color: primaryColor,
          bold: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
    })
  );

  // Executive Overview Stats
  if (options.sections.summary) {
    const totalProjects = projects.length;
    const totalBudget = projects.reduce((s, p) => s + (p.budget || 0), 0);
    const totalContract = projects.reduce((s, p) => s + (p.contractAmount || 0), 0);
    const totalDisbursed = projects.reduce((s, p) => s + (p.disbursedAmount || 0), 0);
    const avgPlan = projects.length > 0
      ? Math.round(projects.reduce((s, p) => s + (getCurrentProgressInfo(p).planPercent || p.progressPlan || 0), 0) / projects.length)
      : 0;
    const avgActual = projects.length > 0
      ? Math.round(projects.reduce((s, p) => s + (getCurrentProgressInfo(p).actualPercent || p.progressField || 0), 0) / projects.length)
      : 0;

    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
        children: [
          new TextRun({
            text: "1. สรุปภาพรวมการดำเนินงาน (Executive Summary)",
            bold: true,
            size: 28,
            color: primaryColor,
          }),
        ],
      })
    );

    if (options.aiExecutiveSummary) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 150, after: 300 },
          children: [
            new TextRun({
              text: "✨ สรุปเชิงบริหารโดย AI (AI Executive Insights): ",
              bold: true,
              color: primaryColor,
              size: 22,
            }),
            new TextRun({
              text: options.aiExecutiveSummary,
              size: 20,
              color: darkTextColor,
            }),
          ],
        })
      );
    }

    const summaryTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: headerBgColor, type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: "รายการสรุป", bold: true, size: 22 })] })],
            }),
            new TableCell({
              shading: { fill: headerBgColor, type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: "รายละเอียด / มูลค่า", bold: true, size: 22 })] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "จำนวนโครงการทั้งหมด", size: 20 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${totalProjects} โครงการ`, bold: true, size: 20 })] })] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "วงเงินงบประมาณรวม", size: 20 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatMoney(totalBudget), bold: true, size: 20 })] })] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "วงเงินตามสัญญารวม", size: 20 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatMoney(totalContract), size: 20 })] })] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "การเบิกจ่ายงบประมาณสะสม", size: 20 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatMoney(totalDisbursed), size: 20 })] })] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "ความก้าวหน้าสะสมเฉลี่ย (แผน vs ผล)", size: 20 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `แผนงาน ${avgPlan}% | ผลงานจริง ${avgActual}%`, bold: true, color: primaryColor, size: 20 })] })] }),
          ],
        }),
      ],
    });

    docChildren.push(summaryTable);
  }

  // Projects Breakdown Loop
  projects.forEach((proj, index) => {
    const info = getCurrentProgressInfo(proj);
    const planPct = info.planPercent || proj.progressPlan || 0;
    const actualPct = info.actualPercent || proj.progressField || 0;
    const diffPct = actualPct - planPct;

    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 500, after: 200 },
        children: [
          new TextRun({
            text: `โครงการที่ ${index + 1}: ${proj.projectName}`,
            bold: true,
            size: 26,
            color: darkTextColor,
          }),
        ],
      })
    );

    // Project Info & Contractor
    const projProgress = getCurrentProgressInfo(proj);
    const projProgPercent = projProgress.actualPercent || proj.progressField || 0;
    const projPenalty = calculateLiquidatedDamages(proj, projProgPercent);
    const projTimeline = calculateProjectTimeline(
      proj.startDate,
      proj.endDate,
      proj.contractDays,
      projProgPercent,
      proj.periodicProgress,
      proj.sheetName
    );
    const projIsCompleted = Boolean(projTimeline.isCompleted || projProgPercent >= 100);
    const projIsCompletedLate = Boolean(
      projIsCompleted &&
      (
        (projPenalty && projPenalty.statusLevel === "completed" && projPenalty.totalFineAmount > 0) ||
        (projPenalty && projPenalty.overdueDays > 0) ||
        (projTimeline.hasFinalInstallmentExceededContract && projTimeline.overdueDays > 0) ||
        (projTimeline.overdueDays > 0)
      )
    );
    const projOverdueDays = (projPenalty && projPenalty.overdueDays > 0) ? projPenalty.overdueDays : (projTimeline.overdueDays || 0);
    const projDeliveryDate = projTimeline.lastPeriodEndDateStr || projPenalty?.lastPeriodEndDateStr || proj.acceptedDate;

    if (options.sections.contractor || options.sections.timeline) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [
            new TextRun({ text: `• เลขที่สัญญา: `, bold: true, size: 20 }),
            new TextRun({ text: `${proj.contractNumber || "-"}  |  `, size: 20 }),
            new TextRun({ text: `ผู้รับจ้าง: `, bold: true, size: 20 }),
            new TextRun({ text: `${proj.contractor || "-"}`, size: 20 }),
          ],
        }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [
            new TextRun({ text: `• ระยะเวลาสัญญา: `, bold: true, size: 20 }),
            new TextRun({
              text: projIsCompletedLate
                ? `${formatDateDisplay(proj.startDate)} ถึง ${formatDateDisplay(proj.endDate)} (${proj.contractDays || 0} วัน) - ส่งมอบช้ากว่าสัญญา +${projOverdueDays} วัน (ส่งมอบจริง: ${formatDateDisplay(projDeliveryDate)})`
                : `${formatDateDisplay(proj.startDate)} ถึง ${formatDateDisplay(proj.endDate)} (${proj.contractDays || 0} วัน) - เหลือ ${projTimeline.remainingDays !== undefined ? projTimeline.remainingDays : (proj.remainingDays || 0)} วัน`,
              size: 20,
              color: projIsCompletedLate ? "b45309" : undefined,
              bold: projIsCompletedLate,
            }),
          ],
        })
      );
    }

    // Budget & Progress
    if (options.sections.budget || options.sections.progress) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [
            new TextRun({ text: `• วงเงินงบประมาณ: `, bold: true, size: 20 }),
            new TextRun({ text: `${formatMoney(proj.budget)}  |  `, size: 20 }),
            new TextRun({ text: `วงเงินสัญญา: `, bold: true, size: 20 }),
            new TextRun({ text: `${formatMoney(proj.contractAmount)}  |  `, size: 20 }),
            new TextRun({ text: `เบิกจ่ายแล้ว: `, bold: true, size: 20 }),
            new TextRun({ text: `${formatMoney(proj.disbursedAmount)} (${proj.disbursedPercent || 0}%)`, size: 20 }),
          ],
        }),
        new Paragraph({
          spacing: { before: 100, after: 200 },
          children: [
            new TextRun({ text: `• สถานะความก้าวหน้า: `, bold: true, size: 20 }),
            new TextRun({ text: `แผนงาน ${planPct}%  |  ผลงานจริง ${actualPct}%  |  `, size: 20 }),
            new TextRun({
              text: `ส่วนต่าง: ${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}% (${diffPct >= 0 ? "เร็วกว่าแผน" : "ช้ากว่าแผน"})`,
              bold: true,
              color: diffPct >= 0 ? "16A34A" : "DC2626",
              size: 20,
            }),
          ],
        })
      );
    }

    // Map Location
    if (options.sections.map && (proj.locationName || proj.lat)) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [
            new TextRun({ text: `• ที่ตั้งโครงการ: `, bold: true, size: 20 }),
            new TextRun({
              text: `${proj.locationName || "ไม่ระบุ"} ${proj.lat && proj.lng ? `(พิกัด: ${proj.lat}, ${proj.lng})` : ""}`,
              size: 20,
            }),
          ],
        })
      );
    }

    // Periodic Table
    if (options.sections.periodicTable && proj.periodicProgress && proj.periodicProgress.length > 0) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: "ตารางสรุปความก้าวหน้ารายครั้ง:", bold: true, size: 20 })],
        })
      );

      const tableRows = [
        new TableRow({
          children: [
            new TableCell({ shading: { fill: headerBgColor, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: "ครั้งที่", bold: true, size: 18 })] })] }),
            new TableCell({ shading: { fill: headerBgColor, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: "ช่วงวันที่", bold: true, size: 18 })] })] }),
            new TableCell({ shading: { fill: headerBgColor, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: "แผนสะสม (%)", bold: true, size: 18 })] })] }),
            new TableCell({ shading: { fill: headerBgColor, type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: "ผลสะสม (%)", bold: true, size: 18 })] })] }),
          ],
        }),
      ];

      proj.periodicProgress.forEach((rec) => {
        tableRows.push(
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `ครั้งที่ ${rec.periodNo}`, size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${formatDateDisplay(rec.startDate)} - ${formatDateDisplay(rec.endDate)}`, size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${rec.planCumulativePercent}%`, size: 18 })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${rec.actualCumulativePercent}%`, size: 18 })] })] }),
            ],
          })
        );
      });

      docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }));
    }

    // Issues & Updates
    if (options.sections.issues && proj.updates && proj.updates.length > 0) {
      docChildren.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: "บันทึกรายงานความคืบหน้า / ปัญหาอุปสรรคสนาม:", bold: true, size: 20 })],
        })
      );

      proj.updates.forEach((u) => {
        docChildren.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { before: 50, after: 50 },
            children: [
              new TextRun({ text: `[${formatDateDisplayWithPeriod(u.date, proj.periodicProgress)}] `, bold: true, size: 18 }),
              new TextRun({ text: `${u.details} `, size: 18 }),
              new TextRun({ text: `(ผู้รายงาน: ${u.reporter || "-"})`, italics: true, size: 18, color: "64748B" }),
            ],
          })
        );
      });
    }
  });

  // Recommendations Section
  if (options.sections.recommendations && options.recommendations) {
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 500, after: 200 },
        children: [
          new TextRun({
            text: "ข้อเสนอแนะและแนวทางกำกับดูแลสำหรับผู้บริหาร",
            bold: true,
            size: 28,
            color: primaryColor,
          }),
        ],
      }),
      new Paragraph({
        spacing: { before: 100, after: 300 },
        children: [
          new TextRun({
            text: options.recommendations,
            size: 22,
          }),
        ],
      })
    );
  }

  // Create document
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `${options.agencyName || "รายงานผู้บริหาร"} | ปีงบประมาณ ${options.selectedYear}`,
                    size: 16,
                    color: "94A3B8",
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "หน้า ",
                    size: 16,
                    color: "94A3B8",
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    color: "94A3B8",
                  }),
                  new TextRun({
                    text: " จาก ",
                    size: 16,
                    color: "94A3B8",
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 16,
                    color: "94A3B8",
                  }),
                ],
              }),
            ],
          }),
        },
        children: docChildren,
      },
    ],
  });

  return await Packer.toBlob(doc);
}
