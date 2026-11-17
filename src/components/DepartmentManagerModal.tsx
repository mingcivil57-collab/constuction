import React, { useState, useEffect } from "react";
import {
  DepartmentOption,
  getDepartmentOptions,
  addDepartment,
  updateDepartment,
  deleteDepartment,
  resetDepartmentsToDefault,
} from "../lib/departmentManager";
import { getUsersList } from "../lib/userAuth";
import { getManagedSheets } from "../lib/managedSheets";
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Users,
  FileSpreadsheet,
} from "lucide-react";

interface DepartmentManagementContentProps {
  canManage?: boolean;
  onDepartmentSelected?: (deptValue: string) => void;
}

export function DepartmentManagementContent({
  canManage = true,
  onDepartmentSelected,
}: DepartmentManagementContentProps) {
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptIcon, setNewDeptIcon] = useState("🏢");
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("🏢");
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deptToDelete, setDeptToDelete] = useState<DepartmentOption | null>(null);

  // Load departments
  const loadData = () => {
    setDepartments(getDepartmentOptions());
  };

  useEffect(() => {
    loadData();
  }, []);

  // Listen to external department update events
  useEffect(() => {
    const handleUpdate = () => {
      loadData();
    };
    window.addEventListener("departments_updated", handleUpdate);
    return () => {
      window.removeEventListener("departments_updated", handleUpdate);
    };
  }, []);

  // Counts of users and sheets per department
  const users = getUsersList();
  const sheets = getManagedSheets();

  const getUserCount = (deptValue: string) => {
    if (deptValue === "ทุกฝ่าย (*)") {
      return users.filter((u) => !u.department || u.department === "ทุกฝ่าย (*)").length;
    }
    return users.filter((u) => u.department === deptValue || u.allowedDepartments?.includes(deptValue)).length;
  };

  const getSheetCount = (deptValue: string) => {
    if (deptValue === "ทุกฝ่าย (*)") {
      return sheets.filter((s) => !s.department || s.department === "ทุกฝ่าย (*)").length;
    }
    return sheets.filter((s) => s.department === deptValue).length;
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim()) {
      setStatusMsg({ type: "error", text: "กรุณาระบุชื่อฝ่ายที่ต้องการเพิ่ม" });
      return;
    }

    const label = `${newDeptIcon} ${newDeptName.trim()}`;
    const result = addDepartment(newDeptName.trim(), label);
    if (result.success) {
      setStatusMsg({ type: "success", text: result.message });
      setNewDeptName("");
      loadData();
      if (onDepartmentSelected && result.department) {
        onDepartmentSelected(result.department.value);
      }
    } else {
      setStatusMsg({ type: "error", text: result.message });
    }
  };

  const startEdit = (dept: DepartmentOption) => {
    setEditingDeptId(dept.id);
    setEditName(dept.value);
    const firstChar = dept.label.trim().split(" ")[0];
    if (["🏢", "🌐", "📍", "🏗️", "📐", "💼", "📋"].includes(firstChar)) {
      setEditIcon(firstChar);
    } else {
      setEditIcon("🏢");
    }
    setStatusMsg(null);
  };

  const handleSaveEdit = (dept: DepartmentOption) => {
    if (!editName.trim()) {
      setStatusMsg({ type: "error", text: "กรุณาระบุชื่อฝ่าย" });
      return;
    }

    let finalLabel = `${editIcon} ${editName.trim()}`;
    if (dept.value === "ทุกฝ่าย (*)") {
      finalLabel = `🌐 ทุกฝ่าย (*)`;
    }

    const result = updateDepartment(dept.id, editName.trim(), finalLabel);
    if (result.success) {
      setStatusMsg({ type: "success", text: result.message });
      setEditingDeptId(null);
      loadData();
    } else {
      setStatusMsg({ type: "error", text: result.message });
    }
  };

  const handleDeleteConfirm = () => {
    if (!deptToDelete) return;
    const result = deleteDepartment(deptToDelete.id);
    if (result.success) {
      setStatusMsg({ type: "success", text: result.message });
      setDeptToDelete(null);
      loadData();
    } else {
      setStatusMsg({ type: "error", text: result.message });
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm("คุณต้องการคืนค่ารายชื่อฝ่ายทั้งหมดกลับสู่ค่าเริ่มต้นของระบบใช่หรือไม่?")) {
      const res = resetDepartmentsToDefault();
      setStatusMsg({ type: "success", text: res.message });
      loadData();
    }
  };

  const ICON_CHOICES = ["🏢", "🏗️", "📐", "💼", "📋", "📍", "🌐"];

  return (
    <div className="space-y-4">
      {/* Status Message */}
      {statusMsg && (
        <div
          className={`p-3 rounded-2xl flex items-start gap-2 text-xs animate-fade-in ${
            statusMsg.type === "success"
              ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
              : "bg-rose-50 text-rose-900 border border-rose-200"
          }`}
        >
          {statusMsg.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          )}
          <span className="font-medium">{statusMsg.text}</span>
        </div>
      )}

      {/* Form: Add New Department */}
      {canManage && (
        <div className="bg-white border border-emerald-200/80 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Plus className="h-4 w-4 text-emerald-600" />
              เพิ่มฝ่ายใหม่ (Add Department)
            </span>
            <span className="text-[11px] text-slate-500 font-medium">ระบุชื่อและเลือกไอคอน</span>
          </div>

          <form onSubmit={handleAdd} className="space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 shrink-0">
                <span className="text-[11px] font-bold text-slate-500">ไอคอน:</span>
                <div className="flex items-center gap-1">
                  {ICON_CHOICES.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setNewDeptIcon(ic)}
                      className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition-all cursor-pointer ${
                        newDeptIcon === ic
                          ? "bg-emerald-100 border border-emerald-300 scale-110 shadow-2xs font-bold"
                          : "hover:bg-slate-200 text-slate-700"
                      }`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="เช่น ฝ่ายควบคุมอาคาร, สบ.5, ฝ่ายตรวจสอบ ฯลฯ"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 font-bold text-slate-800"
                />
              </div>

              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>เพิ่มฝ่าย</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Department List Section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-slate-500" />
            รายชื่อฝ่ายทั้งหมดในระบบ ({departments.length} ฝ่าย)
          </span>
          {canManage && (
            <button
              type="button"
              onClick={handleResetDefaults}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors cursor-pointer"
              title="คืนค่ารายชื่อฝ่ายเริ่มต้นของระบบ"
            >
              <RotateCcw className="h-3 w-3" />
              คืนค่าเริ่มต้น
            </button>
          )}
        </div>

        <div className="space-y-2">
          {departments.map((dept) => {
            const isEditing = editingDeptId === dept.id;
            const isAllDept = dept.value === "ทุกฝ่าย (*)";
            const uCount = getUserCount(dept.value);
            const sCount = getSheetCount(dept.value);

            return (
              <div
                key={dept.id}
                className={`bg-white border rounded-2xl p-3.5 shadow-2xs transition-all ${
                  isEditing
                    ? "border-amber-300 ring-2 ring-amber-100 bg-amber-50/40"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {isEditing ? (
                  /* Inline Edit Form */
                  <div className="space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                      <span className="flex items-center gap-1.5">
                        <Edit2 className="h-3.5 w-3.5 text-amber-600" />
                        แก้ไขชื่อฝ่าย: {dept.value}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingDeptId(null)}
                        className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="flex items-center gap-1 bg-white border border-amber-200 rounded-xl px-2 py-1 shrink-0">
                        {ICON_CHOICES.map((ic) => (
                          <button
                            key={ic}
                            type="button"
                            onClick={() => setEditIcon(ic)}
                            className={`w-6 h-6 rounded text-xs flex items-center justify-center transition-all cursor-pointer ${
                              editIcon === ic
                                ? "bg-amber-100 border border-amber-300 scale-110"
                                : "hover:bg-slate-100 text-slate-700"
                            }`}
                          >
                            {ic}
                          </button>
                        ))}
                      </div>

                      <div className="flex-1">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          disabled={isAllDept}
                          className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-xl focus:outline-none font-bold text-slate-900 disabled:bg-slate-100"
                          placeholder="ระบุชื่อฝ่ายใหม่..."
                        />
                      </div>

                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingDeptId(null)}
                          className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-colors cursor-pointer"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(dept)}
                          className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3.5 py-1.5 text-xs font-bold rounded-xl shadow-xs flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" />
                          บันทึก
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-amber-800">
                      ℹ️ หากเปลี่ยนชื่อฝ่าย ระบบจะอัปเดตชื่อฝ่ายในบัญชีผู้ใช้ ({uCount} คน) และไฟล์ Google Sheets ({sCount} ไฟล์) ที่เชื่อมโยงให้อัตโนมัติ
                    </p>
                  </div>
                ) : (
                  /* Display Row */
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-base shrink-0 border border-slate-200/80">
                        {dept.label.trim().split(" ")[0] || "🏢"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {dept.label}
                          </span>
                          {dept.value !== dept.label.replace(/^.+?\s/, "") && (
                            <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                              รหัส: {dept.value}
                            </span>
                          )}
                          {isAllDept && (
                            <span className="text-[10px] bg-sky-100 text-sky-800 font-bold px-1.5 py-0.2 rounded">
                              ส่วนกลาง
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-slate-400" />
                            <span>ผู้ใช้: <strong>{uCount}</strong> บัญชี</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <FileSpreadsheet className="h-3 w-3 text-slate-400" />
                            <span>ไฟล์ Sheets: <strong>{sCount}</strong> ไฟล์</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEdit(dept)}
                          className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded-xl transition-colors cursor-pointer"
                          title="แก้ไขชื่อฝ่าย"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>

                        {!isAllDept && (
                          <button
                            type="button"
                            onClick={() => setDeptToDelete(dept)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                            title="ลบฝ่ายนี้"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Delete Department Confirmation Modal */}
      {deptToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-scale-up">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  ยืนยันการลบฝ่าย "{deptToDelete.label}"?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ฝ่ายนี้จะถูกลบออกจากตัวเลือกในระบบทั้งหมด
                </p>
              </div>
            </div>

            {getUserCount(deptToDelete.value) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                ⚠️ มีผู้ใช้งานสังกัดฝ่ายนี้อยู่ <strong>{getUserCount(deptToDelete.value)}</strong> บัญชี — ระบบจะย้ายผู้ใช้กลุ่มนี้ไปยังฝ่าย <strong>"ทุกฝ่าย (*)"</strong> ให้อัตโนมัติ เพื่อไม่ให้เสียสิทธิ์การเข้าใช้งาน
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeptToDelete(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                ยืนยันการลบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface DepartmentManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  canManage?: boolean;
  onDepartmentSelected?: (deptValue: string) => void;
}

export default function DepartmentManagerModal({
  isOpen,
  onClose,
  canManage = true,
  onDepartmentSelected,
}: DepartmentManagerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scale-up">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 rounded-2xl backdrop-blur-xs border border-white/20">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                จัดการรายชื่อฝ่าย (Department Management)
              </h2>
              <p className="text-[11px] text-emerald-100 font-medium">
                เพิ่มฝ่ายใหม่ แก้ไขชื่อฝ่าย หรือลบฝ่าย โดยระบบจะปรับปรุงสิทธิ์อัตโนมัติ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
          <DepartmentManagementContent
            canManage={canManage}
            onDepartmentSelected={(val) => {
              if (onDepartmentSelected) onDepartmentSelected(val);
              onClose();
            }}
          />
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-100/80 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500">
            ระบบจัดเก็บรายชื่อฝ่ายในพื้นที่ส่วนตัวของคุณอย่างปลอดภัย
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-5 py-2 rounded-xl transition-colors cursor-pointer"
          >
            เรียบร้อย
          </button>
        </div>
      </div>
    </div>
  );
}
