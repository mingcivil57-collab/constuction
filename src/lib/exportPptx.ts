import PptxGenJS from "pptxgenjs";
import { Project } from "../types";
import { getCurrentProgressInfo } from "../lib/periodicUtils";
import { formatDateDisplay, formatDateDisplayWithPeriod } from "../lib/dateUtils";
import { ExportOptions } from "./exportDocx";

const formatMoney = (val: number) => {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0) + " บาท";
};

export async function generatePptxReport(
  projects: Project[],
  options: ExportOptions
): Promise<Blob> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = options.reportTitle || "รายงานสรุปผู้บริหาร";

  // Presentation Color Themes
  const theme = options.presentationTheme || "emerald";
  let bgDark = "0F172A"; // Slate 900
  let primaryColor = "059669"; // Emerald 600
  let accentColor = "34D399"; // Emerald 400
  let cardBgLight = "E6F4EA";
  let cardBorder = "A7F3D0";

  if (theme === "navy") {
    bgDark = "0B192C";
    primaryColor = "1E3A8A";
    accentColor = "F59E0B";
    cardBgLight = "EFF6FF";
    cardBorder = "BFDBFE";
  } else if (theme === "slate") {
    bgDark = "18181B";
    primaryColor = "334155";
    accentColor = "EAB308";
    cardBgLight = "F8FAFC";
    cardBorder = "E2E8F0";
  }

  const white = "FFFFFF";
  const textDark = "1E293B";
  const textMuted = "64748B";

  const mainProject = projects[0];
  const totalBudget = projects.reduce((s, p) => s + (p.budget || 0), 0);
  const totalContract = projects.reduce((s, p) => s + (p.contractAmount || 0), 0);
  const totalDisbursed = projects.reduce((s, p) => s + (p.disbursedAmount || 0), 0);

  const avgPlan = projects.length > 0
    ? Math.round(projects.reduce((s, p) => s + (getCurrentProgressInfo(p).planPercent || p.progressPlan || 0), 0) / projects.length)
    : 0;
  const avgActual = projects.length > 0
    ? Math.round(projects.reduce((s, p) => s + (getCurrentProgressInfo(p).actualPercent || p.progressField || 0), 0) / projects.length)
    : 0;
  const delta = avgActual - avgPlan;

  // Helper for adding standard slide headers
  const addSlideHeader = (slide: any, titleText: string, subtitleText?: string) => {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: "100%",
      h: 0.9,
      fill: { color: bgDark },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0.9,
      w: "100%",
      h: 0.08,
      fill: { color: primaryColor },
    });
    slide.addText(titleText, {
      x: 0.5,
      y: 0.15,
      w: 8.5,
      h: 0.4,
      fontFace: "Sukhumvit Set, Tahoma, Segoe UI, sans-serif",
      fontSize: 20,
      bold: true,
      color: white,
    });
    if (subtitleText) {
      slide.addText(subtitleText, {
        x: 0.5,
        y: 0.52,
        w: 8.5,
        h: 0.3,
        fontFace: "Sukhumvit Set, Tahoma, Segoe UI, sans-serif",
        fontSize: 12,
        color: "94A3B8",
      });
    }
    slide.addText(`${options.agencyName || "Construction Dashboard"} | พ.ศ. ${options.selectedYear}`, {
      x: 0.5,
      y: 7.1,
      w: 9.0,
      h: 0.3,
      fontFace: "Sukhumvit Set, Tahoma, sans-serif",
      fontSize: 10,
      color: textMuted,
    });
  };

  // SLIDE 1: Cover Page
  const slide1 = pptx.addSlide();
  slide1.background = { color: bgDark };

  slide1.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: 1.2,
    w: 0.15,
    h: 4.8,
    fill: { color: primaryColor },
  });

  slide1.addText(options.agencyName || "หน่วยงานบริหารโครงการก่อสร้าง", {
    x: 1.2,
    y: 1.2,
    w: 11.0,
    h: 0.5,
    fontFace: "Sukhumvit Set, Tahoma, sans-serif",
    fontSize: 22,
    bold: true,
    color: accentColor,
  });

  slide1.addText(options.reportTitle || "รายงานสรุปความก้าวหน้าโครงการก่อสร้าง", {
    x: 1.2,
    y: 1.8,
    w: 11.0,
    h: 1.4,
    fontFace: "Sukhumvit Set, Tahoma, sans-serif",
    fontSize: 30,
    bold: true,
    color: white,
  });

  slide1.addText(`ประจำปีงบประมาณ พ.ศ. ${options.selectedYear} | แผนงาน: ${options.selectedPlan || "รวมทุกแผนงาน"}`, {
    x: 1.2,
    y: 3.4,
    w: 11.0,
    h: 0.5,
    fontFace: "Sukhumvit Set, Tahoma, sans-serif",
    fontSize: 18,
    color: "CBD5E1",
  });

  if (mainProject) {
    slide1.addText(`โครงการ: ${mainProject.projectName}`, {
      x: 1.2,
      y: 4.1,
      w: 11.0,
      h: 0.5,
      fontFace: "Sukhumvit Set, Tahoma, sans-serif",
      fontSize: 16,
      color: "94A3B8",
    });
  }

  slide1.addText(`วันที่รายงาน: ${formatDateDisplay(new Date().toISOString().split("T")[0])} | ผู้จัดทำ: สรุปเชิงบริหารระบบ AI`, {
    x: 1.2,
    y: 5.2,
    w: 11.0,
    h: 0.4,
    fontFace: "Sukhumvit Set, Tahoma, sans-serif",
    fontSize: 13,
    italic: true,
    color: "64748B",
  });

  // SLIDE 2: AI Executive Briefing (สรุปเชิงบริหาร AI)
  const slide2 = pptx.addSlide();
  addSlideHeader(slide2, "Slide 2: สรุปภาพรวมและสาระสำคัญเชิงบริหาร (AI Executive Briefing)", "สรุปวิเคราะห์ข้อมูลการดำเนินงานสำหรับผู้บริหาร");

  slide2.addShape(pptx.ShapeType.roundRect, {
    x: 0.8,
    y: 1.3,
    w: 11.7,
    h: 1.8,
    fill: { color: cardBgLight },
    line: { color: cardBorder, width: 1.5 },
  });

  slide2.addText("✨ สรุปภาพรวมเชิงบริหาร (AI Insights):", {
    x: 1.1,
    y: 1.5,
    w: 11.0,
    h: 0.4,
    fontSize: 16,
    bold: true,
    color: primaryColor,
  });

  const summaryContent = options.aiExecutiveSummary ||
    `โครงการในปีงบประมาณ ${options.selectedYear} (${projects.length} โครงการ) มีวงเงินงบประมาณรวม ${(totalBudget / 1000000).toFixed(2)} ล้านบาท เบิกจ่ายแล้ว ${(totalDisbursed / 1000000).toFixed(2)} ล้านบาท (${totalBudget > 0 ? Math.round((totalDisbursed / totalBudget) * 100) : 0}%) ความก้าวหน้าภาคสนามเฉลี่ยอยู่ที่ ${avgActual}% (แผนงาน ${avgPlan}%)`;

  slide2.addText(summaryContent, {
    x: 1.1,
    y: 1.95,
    w: 11.1,
    h: 1.0,
    fontSize: 14,
    color: textDark,
    lineSpacing: 22,
  });

  // 3 Metric Cards at Bottom
  const cardW = 3.6;
  const gap = 0.45;

  // Metric 1: Budget
  slide2.addShape(pptx.ShapeType.roundRect, {
    x: 0.8,
    y: 3.4,
    w: cardW,
    h: 2.7,
    fill: { color: "F8FAFC" },
    line: { color: "CBD5E1", width: 1 },
  });
  slide2.addText("💰 งบประมาณรวม", { x: 1.0, y: 3.6, w: cardW - 0.4, h: 0.4, fontSize: 14, bold: true, color: textDark });
  slide2.addText(`${(totalBudget / 1000000).toFixed(2)} ลบ.`, { x: 1.0, y: 4.1, w: cardW - 0.4, h: 0.6, fontSize: 22, bold: true, color: primaryColor });
  slide2.addText(`เบิกจ่ายแล้ว ${(totalDisbursed / 1000000).toFixed(2)} ลบ. (${totalBudget > 0 ? Math.round((totalDisbursed / totalBudget) * 100) : 0}%)`, { x: 1.0, y: 4.8, w: cardW - 0.4, h: 0.8, fontSize: 12, color: textMuted });

  // Metric 2: Progress
  slide2.addShape(pptx.ShapeType.roundRect, {
    x: 0.8 + cardW + gap,
    y: 3.4,
    w: cardW,
    h: 2.7,
    fill: { color: "F8FAFC" },
    line: { color: "CBD5E1", width: 1 },
  });
  slide2.addText("📊 ความก้าวหน้าภาคสนาม", { x: 1.0 + cardW + gap, y: 3.6, w: cardW - 0.4, h: 0.4, fontSize: 14, bold: true, color: textDark });
  slide2.addText(`${avgActual}%`, { x: 1.0 + cardW + gap, y: 4.1, w: cardW - 0.4, h: 0.6, fontSize: 22, bold: true, color: delta >= 0 ? "059669" : "DC2626" });
  slide2.addText(`แผนงานสะสม ${avgPlan}% (ส่วนต่าง ${delta > 0 ? "+" : ""}${delta}%)`, { x: 1.0 + cardW + gap, y: 4.8, w: cardW - 0.4, h: 0.8, fontSize: 12, color: textMuted });

  // Metric 3: Project Count
  slide2.addShape(pptx.ShapeType.roundRect, {
    x: 0.8 + (cardW + gap) * 2,
    y: 3.4,
    w: cardW,
    h: 2.7,
    fill: { color: "F8FAFC" },
    line: { color: "CBD5E1", width: 1 },
  });
  slide2.addText("🏗️ จำนวนโครงการ", { x: 1.0 + (cardW + gap) * 2, y: 3.6, w: cardW - 0.4, h: 0.4, fontSize: 14, bold: true, color: textDark });
  slide2.addText(`${projects.length} โครงการ`, { x: 1.0 + (cardW + gap) * 2, y: 4.1, w: cardW - 0.4, h: 0.6, fontSize: 22, bold: true, color: primaryColor });
  slide2.addText(`รวมทุกสัญญาในแผนงาน ${options.selectedPlan || "ทั้งหมด"}`, { x: 1.0 + (cardW + gap) * 2, y: 4.8, w: cardW - 0.4, h: 0.8, fontSize: 12, color: textMuted });

  // SLIDE 3: ข้อมูลโครงการและสัญญา (Project Specs)
  const slide3 = pptx.addSlide();
  addSlideHeader(slide3, "Slide 3: ข้อมูลโครงการและคู่สัญญา", "รายละเอียดผู้รับจ้างและผู้ตรวจรับพัสดุ");

  if (mainProject) {
    const projRows: any[] = [
      [{ text: "ชื่อโครงการ", options: { bold: true, fill: { color: "F1F5F9" } } }, { text: mainProject.projectName }],
      [{ text: "เลขที่สัญญา", options: { bold: true, fill: { color: "F1F5F9" } } }, { text: mainProject.contractNumber || "-" }],
      [{ text: "ผู้รับจ้าง / บริษัท", options: { bold: true, fill: { color: "F1F5F9" } } }, { text: mainProject.contractor || "-" }],
      [{ text: "ระยะเวลาสัญญา", options: { bold: true, fill: { color: "F1F5F9" } } }, { text: `${formatDateDisplay(mainProject.startDate)} ถึง ${formatDateDisplay(mainProject.endDate)} (${mainProject.contractDays || 0} วัน)` }],
      [{ text: "ประธานตรวจรับ", options: { bold: true, fill: { color: "F1F5F9" } } }, { text: mainProject.chairman || "-" }],
      [{ text: "ผู้ควบคุมงาน", options: { bold: true, fill: { color: "F1F5F9" } } }, { text: mainProject.supervisorHead || mainProject.supervisor || "-" }],
    ];

    slide3.addTable(projRows as any, {
      x: 0.8,
      y: 1.3,
      w: 11.7,
      colW: [3.2, 8.5],
      fontFace: "Sukhumvit Set, Tahoma, sans-serif",
      fontSize: 13,
      rowH: 0.6,
      border: { pt: 1, color: "CBD5E1" },
    });
  }

  // SLIDE 4: งบประมาณและการเบิกจ่าย
  const slide4 = pptx.addSlide();
  addSlideHeader(slide4, "Slide 4: สรุปงบประมาณและการเบิกจ่าย", "การบริหารวงเงินสัญญาและงวดเงิน");

  const budRows: any[] = [
    [{ text: "หัวข้อรายการ", options: { bold: true, fill: { color: "0F172A" }, color: white } }, { text: "จำนวนเงิน (บาท)", options: { bold: true, fill: { color: "0F172A" }, color: white } }],
    [{ text: "งบประมาณได้รับอนุมัติรวม", options: { bold: true } }, { text: formatMoney(totalBudget), options: { bold: true } }],
    [{ text: "วงเงินตามสัญญาจัดซื้อจัดจ้าง", options: {} }, { text: formatMoney(totalContract), options: {} }],
    [{ text: "จำนวนเงินเบิกจ่ายสะสม", options: { bold: true, color: "059669" } }, { text: formatMoney(totalDisbursed), options: { bold: true, color: "059669" } }],
    [{ text: "คงเหลือเบิกจ่าย", options: {} }, { text: formatMoney(Math.max(0, totalBudget - totalDisbursed)), options: {} }],
  ];

  slide4.addTable(budRows as any, {
    x: 0.8,
    y: 1.4,
    w: 11.7,
    colW: [6.0, 5.7],
    fontFace: "Sukhumvit Set, Tahoma, sans-serif",
    fontSize: 14,
    rowH: 0.7,
    border: { pt: 1, color: "CBD5E1" },
  });

  // SLIDE 5: ตารางสรุปเปรียบเทียบโครงการ
  const slide5 = pptx.addSlide();
  addSlideHeader(slide5, "Slide 5: ตารางเปรียบเทียบความก้าวหน้ารายโครงการ", "เปรียบเทียบผลงานและงบประมาณแต่ละสัญญา");

  const chartTableRows: any[] = [
    [
      { text: "โครงการ", options: { bold: true, fill: { color: "1E293B" }, color: white } },
      { text: "งบประมาณ", options: { bold: true, fill: { color: "1E293B" }, color: white } },
      { text: "แผน (%)", options: { bold: true, fill: { color: "1E293B" }, color: white } },
      { text: "ผล (%)", options: { bold: true, fill: { color: "1E293B" }, color: white } },
      { text: "ส่วนต่าง", options: { bold: true, fill: { color: "1E293B" }, color: white } },
    ],
  ];

  projects.slice(0, 8).forEach((p) => {
    const pPlan = p.progressPlan || 0;
    const pActual = p.progressField || 0;
    const pDiff = pActual - pPlan;
    chartTableRows.push([
      { text: p.projectName, options: {} },
      { text: (p.budget || 0).toLocaleString() + " ฿", options: {} },
      { text: `${pPlan}%`, options: {} },
      { text: `${pActual}%`, options: { bold: true } },
      { text: `${pDiff > 0 ? "+" : ""}${pDiff}%`, options: { color: pDiff >= 0 ? "059669" : "DC2626", bold: true } },
    ]);
  });

  slide5.addTable(chartTableRows as any, {
    x: 0.8,
    y: 1.3,
    w: 11.7,
    colW: [4.5, 2.4, 1.6, 1.6, 1.6],
    fontFace: "Sukhumvit Set, Tahoma, sans-serif",
    fontSize: 11,
    border: { pt: 1, color: "CBD5E1" },
  });

  // SLIDE 6: ตารางแผนงานรายครั้ง
  const slide6 = pptx.addSlide();
  addSlideHeader(slide6, "Slide 6: ตารางแผนงานและผลงานรายงวด", "บันทึกความก้าวหน้ารายงวด/รายเดือน");

  if (mainProject && mainProject.periodicProgress && mainProject.periodicProgress.length > 0) {
    const periodicRows: any[] = [
      [
        { text: "ครั้งที่", options: { bold: true, fill: { color: "0F766E" }, color: white } },
        { text: "ช่วงวันที่ดำเนินงาน", options: { bold: true, fill: { color: "0F766E" }, color: white } },
        { text: "แผนสะสม (%)", options: { bold: true, fill: { color: "0F766E" }, color: white } },
        { text: "ผลสะสม (%)", options: { bold: true, fill: { color: "0F766E" }, color: white } },
      ],
    ];

    mainProject.periodicProgress.forEach((p) => {
      periodicRows.push([
        { text: `ครั้งที่ ${p.periodNo}`, options: {} },
        { text: `${formatDateDisplay(p.startDate)} - ${formatDateDisplay(p.endDate)}`, options: {} },
        { text: `${p.planCumulativePercent || 0}%`, options: {} },
        { text: `${p.actualCumulativePercent || 0}%`, options: { bold: true, color: "059669" } },
      ]);
    });

    slide6.addTable(periodicRows as any, {
      x: 0.8,
      y: 1.3,
      w: 11.7,
      colW: [1.8, 5.1, 2.4, 2.4],
      fontFace: "Sukhumvit Set, Tahoma, sans-serif",
      fontSize: 12,
      border: { pt: 1, color: "CBD5E1" },
    });
  } else {
    slide6.addText("ไม่มีข้อมูลตาราง Progress รายครั้งสำหรับโครงการนี้", {
      x: 1.0, y: 2.5, w: 11.0, h: 1.0, fontSize: 16, color: textMuted, align: "center",
    });
  }

  // SLIDE 7: รูปภาพกิจกรรมก่อสร้างสนาม
  const slide7 = pptx.addSlide();
  addSlideHeader(slide7, "Slide 7: รูปภาพกิจกรรมการดำเนินงานสนาม", "ภาพถ่ายสถานที่ก่อสร้างและความก้าวหน้าจริง");

  if (mainProject && mainProject.photos && mainProject.photos.length > 0) {
    const photosToShow = mainProject.photos.slice(0, 4);
    photosToShow.forEach((ph, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const posX = 0.8 + col * 5.9;
      const posY = 1.3 + row * 2.8;

      if (ph.imageUrl) {
        try {
          slide7.addImage({ path: ph.imageUrl, x: posX, y: posY, w: 5.5, h: 2.2 });
        } catch {
          slide7.addShape(pptx.ShapeType.rect, { x: posX, y: posY, w: 5.5, h: 2.2, fill: { color: "E2E8F0" } });
        }
      }
      slide7.addText(`${ph.remarks || "ภาพกิจกรรมสนาม"} (${formatDateDisplay(ph.date)})`, {
        x: posX, y: posY + 2.25, w: 5.5, h: 0.4, fontSize: 11, bold: true, color: textDark,
      });
    });
  } else {
    slide7.addText("ไม่มีรูปภาพกิจกรรมสนามที่อัปโหลดในระบบ", {
      x: 1.0, y: 2.5, w: 11.0, h: 1.0, fontSize: 16, color: textMuted, align: "center",
    });
  }

  // SLIDE 8: แผนที่
  const slide8 = pptx.addSlide();
  addSlideHeader(slide8, "Slide 8: แผนที่และพิกัดที่ตั้งโครงการ", "ตำแหน่งพิกัดทางภูมิศาสตร์ (GPS)");

  if (mainProject) {
    slide8.addShape(pptx.ShapeType.roundRect, {
      x: 0.8, y: 1.4, w: 11.7, h: 4.8, fill: { color: "F8FAFC" }, line: { color: "E2E8F0", width: 1.5 },
    });
    slide8.addText(`ชื่อสถานที่ / ที่ตั้ง: ${mainProject.locationName || mainProject.projectName}`, {
      x: 1.2, y: 1.8, w: 10.5, h: 0.5, fontSize: 16, bold: true, color: textDark,
    });
    slide8.addText(`พิกัดละติจูด (Latitude): ${mainProject.lat || "-"}`, {
      x: 1.2, y: 2.5, w: 10.5, h: 0.4, fontSize: 14, color: textMuted,
    });
    slide8.addText(`พิกัดลองจิจูด (Longitude): ${mainProject.lng || "-"}`, {
      x: 1.2, y: 3.0, w: 10.5, h: 0.4, fontSize: 14, color: textMuted,
    });
    if (mainProject.lat && mainProject.lng) {
      slide8.addText(`Google Maps Link: https://maps.google.com/?q=${mainProject.lat},${mainProject.lng}`, {
        x: 1.2, y: 3.7, w: 10.5, h: 0.4, fontSize: 14, color: "2563EB", underline: { style: "sng" },
      });
    }
  }

  // SLIDE 9: ปัญหาและอุปสรรค
  const slide9 = pptx.addSlide();
  addSlideHeader(slide9, "Slide 9: ปัญหา อุปสรรค และบันทึกรายงานหน้างาน", "สรุปประเด็นสนามและข้อจำกัดระหว่างการก่อสร้าง");

  if (mainProject && mainProject.updates && mainProject.updates.length > 0) {
    const issueRows: any[] = [
      [
        { text: "วันที่บันทึก", options: { bold: true, fill: { color: "334155" }, color: white } },
        { text: "รายละเอียดรายงาน / ปัญหาอุปสรรค", options: { bold: true, fill: { color: "334155" }, color: white } },
        { text: "ผู้รายงาน", options: { bold: true, fill: { color: "334155" }, color: white } },
      ],
    ];

    mainProject.updates.slice(0, 6).forEach((u) => {
      issueRows.push([
        { text: formatDateDisplayWithPeriod(u.date, mainProject.periodicProgress), options: {} },
        { text: u.details, options: {} },
        { text: u.reporter || "-", options: {} },
      ]);
    });

    slide9.addTable(issueRows as any, {
      x: 0.8,
      y: 1.3,
      w: 11.7,
      colW: [2.2, 7.3, 2.2],
      fontFace: "Sukhumvit Set, Tahoma, sans-serif",
      fontSize: 12,
      border: { pt: 1, color: "CBD5E1" },
    });
  } else {
    slide9.addText("ไม่มีบันทึกปัญหาอุปสรรคสนามในโครงการนี้", {
      x: 1.0, y: 2.5, w: 11.0, h: 1.0, fontSize: 16, color: textMuted, align: "center",
    });
  }

  // SLIDE 10: ข้อเสนอแนะเชิงบริหารสำหรับผู้บริหาร
  const slide10 = pptx.addSlide();
  addSlideHeader(slide10, "Slide 10: ข้อเสนอแนะเชิงบริหารและการตัดสินใจ", "แนวทางการดำเนินงานและข้อเสนอแนะระดับนโยบาย");

  slide10.addShape(pptx.ShapeType.roundRect, {
    x: 0.8, y: 1.4, w: 11.7, h: 4.8, fill: { color: cardBgLight }, line: { color: cardBorder, width: 1.5 },
  });

  slide10.addText("🎯 ข้อเสนอแนะเชิงกลยุทธ์และการกำกับดูแลสำหรับผู้บริหาร:", {
    x: 1.2, y: 1.8, w: 10.8, h: 0.5, fontSize: 18, bold: true, color: primaryColor,
  });

  slide10.addText(
    options.recommendations ||
      "1. เร่งรัดการดำเนินงานตามแผนงานประจำเดือน เพื่อให้การก่อสร้างเสร็จสิ้นทันตามกำหนดเวลาในสัญญา\n" +
      "2. กำกับดูแลการใช้จ่ายงบประมาณให้เป็นไปตามเป้าหมายของหน่วยงาน\n" +
      "3. ประสานงานอย่างใกล้ชิดระหว่างผู้ควบคุมงานและผู้รับจ้าง เพื่อแก้ไขปัญหาหน้างานทันที",
    {
      x: 1.2, y: 2.5, w: 10.8, h: 3.2, fontSize: 15, color: textDark, lineSpacing: 26,
    }
  );

  return (await pptx.write({ outputType: "blob" })) as Blob;
}
