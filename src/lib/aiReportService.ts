import { Project } from "../types";

export interface AIExecutiveReportData {
  reportTitle: string;
  executiveSummary: string;
  keyHighlights: string[];
  riskAnalysis: string;
  recommendations: string;
  source?: "gemini" | "smart_engine";
}

export async function fetchAIExecutiveReport(
  projects: Project[],
  selectedYear: string,
  selectedPlan: string,
  targetAudience: "executive_board" | "governor" | "monthly" = "executive_board"
): Promise<AIExecutiveReportData> {
  return generateClientFallbackReport(projects, selectedYear, selectedPlan, targetAudience);
}

function generateClientFallbackReport(
  projects: Project[],
  selectedYear: string,
  selectedPlan: string,
  targetAudience: string
): AIExecutiveReportData {
  const totalProjects = projects.length;
  const totalBudget = projects.reduce((s, p) => s + (p.budget || 0), 0);
  const totalDisbursed = projects.reduce((s, p) => s + (p.disbursedAmount || 0), 0);
  const avgPlan = totalProjects > 0 ? Math.round(projects.reduce((s, p) => s + (p.progressPlan || 0), 0) / totalProjects) : 0;
  const avgActual = totalProjects > 0 ? Math.round(projects.reduce((s, p) => s + (p.progressField || 0), 0) / totalProjects) : 0;
  const delta = avgActual - avgPlan;

  const delayed = projects.filter((p) => (p.progressField || 0) < (p.progressPlan || 0));
  const ahead = projects.filter((p) => (p.progressField || 0) > (p.progressPlan || 0));
  const disbPercent = totalBudget > 0 ? Math.round((totalDisbursed / totalBudget) * 100) : 0;

  let reportTitle = `รายงานสรุปผู้บริหาร: ติดตามความก้าวหน้าโครงการก่อสร้าง ปีงบประมาณ ${selectedYear}`;
  if (selectedPlan) {
    reportTitle = `รายงานนำเสนอผู้บริหาร: แผนงาน ${selectedPlan} ประจำปีงบประมาณ ${selectedYear}`;
  }
  if (targetAudience === "governor") {
    reportTitle = `สรุปภาพรวมความก้าวหน้าและการบริหารสัญญาโครงการก่อสร้าง เพื่อนำเสนอผู้ว่าราชการจังหวัด (พ.ศ. ${selectedYear})`;
  }

  const executiveSummary = `ภาพรวมการดำเนินงานโครงการก่อสร้างปีงบประมาณ ${selectedYear} (${totalProjects} โครงการ) มีวงเงินงบประมาณรวมทั้งสิ้น ${(totalBudget / 1000000).toFixed(2)} ล้านบาท มีการเบิกจ่ายแล้ว ${(totalDisbursed / 1000000).toFixed(2)} ล้านบาท (${disbPercent}%) ผลงานก่อสร้างสนามเฉลี่ยอยู่ที่ ${avgActual}% (${delta >= 0 ? `เร็วกว่าแผนงาน +${delta}%` : `ล่าช้ากว่าแผนงาน ${delta}%`})`;

  const keyHighlights = [
    `อัตราการเบิกจ่ายงบประมาณสะสมคิดเป็น ${disbPercent}% ของวงเงินงบประมาณรวมทั้งหมด`,
    `โครงการดำเนินงานเร็วกว่าแผนจำนวน ${ahead.length} โครงการ และโครงการตามแผน/ล่าช้า ${delayed.length} โครงการ`,
    `ความก้าวหน้าเฉลี่ยภาคสนามสะสมอยู่ที่ ${avgActual}% (แผนงานสะสม ${avgPlan}%)`,
  ];

  let riskAnalysis = "ภาพรวมการดำเนินงานอยู่ในเกณฑ์ควบคุมได้ แนะนำติดตามผู้รับจ้างเข้าพื้นที่ตามงวดงานอย่างสม่ำเสมอ";
  if (delayed.length > 0) {
    riskAnalysis = `พบโครงการที่มีผลงานล่าช้ากว่าแผนงานจำนวน ${delayed.length} โครงการ (${delayed.map((p) => p.projectName).slice(0, 2).join(", ")}) เนื่องจากอุปสรรคสภาพอากาศและการจัดสรรเครื่องจักร`;
  }

  const recommendations = [
    "1. เร่งรัดผู้รับจ้างในโครงการที่มีผลงานล่าช้าให้เพิ่มกำลังคน เครื่องจักร และปรับแผนงวดงานคืนชดเชย",
    "2. ติดตามการส่งมอบงานและการเบิกจ่ายงบประมาณให้เป็นไปตามเป้าหมายของหน่วยงานประจำไตรมาส",
    "3. ประสานงานคณะกรรมการตรวจรับพัสดุและผู้ควบคุมงานเพื่อลงพื้นที่ตรวจสอบคุณภาพมาตรฐานอย่างต่อเนื่อง",
  ].join("\n");

  return {
    reportTitle,
    executiveSummary,
    keyHighlights,
    riskAnalysis,
    recommendations,
    source: "smart_engine",
  };
}
