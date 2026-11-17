import React, { useState } from "react";
import { Project } from "../types";
import { sanitizeSheetName } from "../lib/googleSheets";
import { calculateProjectTimeline, calculateContractDays } from "../lib/dateUtils";
import { X, Save, FilePlus } from "lucide-react";

interface AddProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultYear: string;
  defaultPlan: string;
  existingSheetNames?: string[];
  onAddProject: (project: Project) => Promise<void>;
  isLoading: boolean;
}

export default function AddProjectModal({
  isOpen,
  onClose,
  defaultYear,
  defaultPlan,
  existingSheetNames = [],
  onAddProject,
  isLoading,
}: AddProjectModalProps) {
  const [projectName, setProjectName] = useState("");
  const [fiscalYear, setFiscalYear] = useState(defaultYear || "2570");
  const [planName, setPlanName] = useState(defaultPlan || "แผนงานที่ 1");
  const [budget, setBudget] = useState(1500000);
  const [contractAmount, setContractAmount] = useState(1450000);
  const [contractNumber, setContractNumber] = useState("");
  const [contractor, setContractor] = useState("");
  const [signedDate, setSignedDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [chairman, setChairman] = useState("");
  const [committee1, setCommittee1] = useState("");
  const [committee2, setCommittee2] = useState("");
  const [supervisorHead, setSupervisorHead] = useState("");
  const [supervisor, setSupervisor] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      alert("กรุณากรอกชื่อโครงการ");
      return;
    }

    // Auto-generate sheet name directly from project name
    const sheetName = sanitizeSheetName(projectName, existingSheetNames);

    // Compute timeline days (inclusive counting: start date = day 1)
    const timeline = calculateProjectTimeline(startDate, endDate);

    const projectData: Project = {
      fiscalYear,
      planName,
      projectName,
      sheetName,
      budget: Number(budget),
      contractAmount: Number(contractAmount),
      contractNumber: contractNumber.trim() || "-",
      signedDate: signedDate || "-",
      startDate: startDate || "-",
      endDate: endDate || "-",
      contractDays: timeline.contractDays,
      elapsedDays: timeline.elapsedDays,
      remainingDays: timeline.remainingDays,
      suspensions: [],
      contractor: contractor || "-",
      chairman: chairman || "-",
      committee1: committee1 || "-",
      committee2: committee2 || "-",
      supervisorHead: supervisorHead || "-",
      supervisor: supervisor || "-",
      acceptedDate: "-",
      progressPlan: 0,
      progressField: 0,
      disbursedAmount: 0,
      disbursedPercent: 0,
      tasks: [
        {
          name: "เตรียมความพร้อมพื้นที่ปฏิบัติงาน",
          startDate: startDate || "-",
          endDate: startDate ? addDays(startDate, 15) : "-",
          progress: 0,
        },
      ],
      updates: [
        {
          date: new Date().toLocaleDateString("en-CA"),
          details: "จัดเตรียมหน้างานและเริ่มประสานงานผู้ควบคุมสัญญา",
          reporter: supervisor || "ระบบ",
        },
      ],
      disbursements: [],
      photos: [],
    };

    try {
      await onAddProject(projectData);
      onClose();
    } catch (err) {
      console.error("เกิดข้อผิดพลาดในการสร้างโครงการใหม่", err);
    }
  };

  const contractNoFormat = (val: string) => {
    return val.trim() !== "";
  };

  function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "-";
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-CA");
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-[#0f172a] text-white">
          <div className="flex items-center gap-2">
            <FilePlus className="h-5 w-5 text-emerald-400" />
            <h3 className="font-bold text-lg font-sans">เพิ่มโครงการก่อสร้างใหม่ลงระบบ</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            
            {/* Year & Plan */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">ปีงบประมาณ</label>
              <input
                type="text"
                required
                placeholder="เช่น 2570"
                value={fiscalYear}
                onChange={(e) => setFiscalYear(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">แผนงานย่อย</label>
              <input
                type="text"
                required
                placeholder="เช่น แผนงานที่ 1 หรือ โครงสร้างหลัก"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">เลขที่สัญญา</label>
              <input
                type="text"
                required
                placeholder="เช่น 12/2570"
                value={contractNumber}
                onChange={(e) => setValueOrSuggest(e.target.value, setContractNumber)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {/* Project Name (Full row) */}
            <div className="md:col-span-2 lg:col-span-3 space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">ชื่อโครงการก่อสร้าง</label>
              <input
                type="text"
                required
                placeholder="เช่น โครงการก่อสร้างสะพาน คสล. ข้ามแม่น้ำ..."
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {/* Contractor */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">ห้าง/บริษัทผู้รับจัดจ้าง</label>
              <input
                type="text"
                placeholder="เช่น หจก. ก้าวหน้าการช่าง"
                value={contractor}
                onChange={(e) => setContractor(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {/* Budget & Contract Amount */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">วงเงินงบประมาณ (บาท)</label>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">วงเงินตามสัญญา (บาท)</label>
              <input
                type="number"
                value={contractAmount}
                onChange={(e) => setContractAmount(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {/* Dates */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">ลงนามสัญญา (วันที่)</label>
              <input
                type="date"
                value={signedDate}
                onChange={(e) => setSignedDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">วันเริ่มต้นตามสัญญา</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">วันสิ้นสุดตามสัญญา</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            {startDate && endDate && (
              <div className="sm:col-span-3 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-xs text-emerald-800 flex items-center justify-between">
                <span className="font-medium">อายุสัญญา (คำนวณให้อัตโนมัติ):</span>
                <span className="font-mono font-bold text-sm bg-white px-2.5 py-0.5 rounded-lg border border-emerald-300 text-emerald-900">
                  {calculateContractDays(startDate, endDate)} วัน
                </span>
              </div>
            )}

            {/* Personnel */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">ประธานคณะกรรมการตรวจรับ</label>
              <input
                type="text"
                placeholder="ชื่อ-นามสกุล"
                value={chairman}
                onChange={(e) => setChairman(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">กรรมการตรวจรับ คนที่ 1</label>
              <input
                type="text"
                placeholder="ชื่อ-นามสกุล"
                value={committee1}
                onChange={(e) => setCommittee1(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">กรรมการตรวจรับ คนที่ 2</label>
              <input
                type="text"
                placeholder="ชื่อ-นามสกุล"
                value={committee2}
                onChange={(e) => setCommittee2(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">หัวหน้าผู้ควบคุมงาน</label>
              <input
                type="text"
                placeholder="ชื่อ-นามสกุล"
                value={supervisorHead}
                onChange={(e) => setSupervisorHead(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">ผู้ควบคุมงานหน้างาน</label>
              <input
                type="text"
                placeholder="ชื่อ-นามสกุล"
                value={supervisor}
                onChange={(e) => setSupervisor(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

          </div>

          {/* Modal Footer */}
          <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl px-5 py-2.5 font-semibold cursor-pointer transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl px-6 py-2.5 font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-md shadow-emerald-600/10"
            >
              <Save className="h-4 w-4" />
              <span>{isLoading ? "กำลังจัดทำแผ่นงาน..." : "สร้างโครงการใน Google Sheet"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  function setValueOrSuggest(v: string, setFn: (v: string) => void) {
    setFn(v);
  }
}
