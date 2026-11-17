import React, { useState } from "react";
import { User } from "firebase/auth";
import { extractSpreadsheetId, fetchManagedSheetsFromSpreadsheet, maskSpreadsheetId } from "../lib/googleSheets";
import { UserSession } from "../lib/userAuth";
import { ManagedSheet, getManagedSheets, syncAndMergeRemoteManagedSheets, isSheetAllowedForUser } from "../lib/managedSheets";
import {
  FileSpreadsheet,
  X,
  ExternalLink,
  PlusCircle,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Building2,
  Shield,
  LogIn,
  LogOut,
} from "lucide-react";

interface ConnectSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onLogin: () => void;
  onLogoutSession?: () => void;
  spreadsheetId: string;
  setSpreadsheetId: (id: string) => void;
  onLoadData: (id: string, forceRefresh?: boolean) => void;
  onCreateTemplate: () => void;
  isLoading: boolean;
  isLoggingIn: boolean;
  userRole?: string;
  userSession?: UserSession | null;
}

export default function ConnectSheetModal({
  isOpen,
  onClose,
  user,
  onLogin,
  onLogoutSession,
  spreadsheetId,
  setSpreadsheetId,
  onLoadData,
  onCreateTemplate,
  isLoading,
  isLoggingIn,
  userRole,
  userSession,
}: ConnectSheetModalProps) {
  const [inputUrlOrId, setInputUrlOrId] = useState(spreadsheetId);
  const [managedSheets, setManagedSheets] = useState<ManagedSheet[]>([]);
  const [selectedManagedSheetUrlOrId, setSelectedManagedSheetUrlOrId] = useState<string>("");

  // Filter managed sheets based on user department permissions
  const allowedSheets = React.useMemo(() => {
    if (!userSession || userSession.role === "Owner") {
      return managedSheets;
    }
    return managedSheets.filter((sheet) => isSheetAllowedForUser(sheet, userSession));
  }, [managedSheets, userSession]);

  React.useEffect(() => {
    if (isOpen) {
      const localSheets = getManagedSheets();
      setManagedSheets(localSheets);

      const targetSsId =
        !spreadsheetId || spreadsheetId.startsWith("demo_")
          ? "1t3unDWOOzqbqfs8bJW-XK4-9-PlVxnrnGSly40lMeDk"
          : spreadsheetId;

      fetchManagedSheetsFromSpreadsheet(targetSsId)
        .then((remoteList) => {
          if (remoteList && remoteList.length > 0) {
            const merged = syncAndMergeRemoteManagedSheets(remoteList);
            setManagedSheets(merged);
          }
        })
        .catch((e) => {
          console.warn("Failed to fetch remote managed sheets:", e);
          setManagedSheets(getManagedSheets());
        });
    }
  }, [isOpen, spreadsheetId]);

  // Synchronize selection whenever allowedSheets or isOpen or spreadsheetId changes
  React.useEffect(() => {
    if (!isOpen) return;

    // Check if the current spreadsheetId matches an allowed sheet
    const matchingCurrent = allowedSheets.find(
      (s) =>
        s.spreadsheetId === extractSpreadsheetId(spreadsheetId) ||
        s.urlOrId === spreadsheetId
    );

    if (matchingCurrent) {
      const val = matchingCurrent.urlOrId || matchingCurrent.spreadsheetId;
      setSelectedManagedSheetUrlOrId(val);
      setInputUrlOrId(val);
    } else if (allowedSheets.length > 0) {
      // If currently on demo or non-matching, automatically select the first allowed sheet!
      const firstAllowed = allowedSheets[0];
      const targetVal = firstAllowed.urlOrId || firstAllowed.spreadsheetId;
      setSelectedManagedSheetUrlOrId(targetVal);
      // For non-owner, or if owner is currently on demo, pre-fill input with the real allowed sheet
      if (!isOwner || !spreadsheetId || spreadsheetId.startsWith("demo_") || spreadsheetId.toLowerCase().includes("demo")) {
        setInputUrlOrId(targetVal);
      }
    } else {
      setSelectedManagedSheetUrlOrId("");
      if (!isOwner) {
        setInputUrlOrId("");
      }
    }
  }, [isOpen, allowedSheets, spreadsheetId, userRole]);

  if (!isOpen) return null;

  const isDemo = spreadsheetId.startsWith("demo_");
  const isOwner = userRole === "Owner";
  const realUrl = !isDemo
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
    : null;

  const handleOpenExisting = (e: React.FormEvent) => {
    e.preventDefault();

    // Determine target ID/URL to open:
    let target = "";
    if (!isOwner) {
      // For non-owner users, prioritize the dropdown selection or the first allowed sheet
      const foundSheet = allowedSheets.find(
        (s) => s.urlOrId === selectedManagedSheetUrlOrId || s.spreadsheetId === selectedManagedSheetUrlOrId
      ) || (allowedSheets.length > 0 ? allowedSheets[0] : null);

      if (foundSheet) {
        target = foundSheet.urlOrId || foundSheet.spreadsheetId;
      } else {
        target = inputUrlOrId.trim();
      }
    } else {
      // For Owner: if input is filled and not demo, use input; otherwise use selected dropdown
      if (inputUrlOrId.trim() && !inputUrlOrId.startsWith("demo_") && !inputUrlOrId.toLowerCase().includes("demo")) {
        target = inputUrlOrId.trim();
      } else if (selectedManagedSheetUrlOrId) {
        target = selectedManagedSheetUrlOrId;
      } else if (allowedSheets.length > 0) {
        target = allowedSheets[0].urlOrId || allowedSheets[0].spreadsheetId;
      } else {
        target = inputUrlOrId.trim();
      }
    }

    if (!target || target.trim() === "") {
      alert("กรุณาเลือกไฟล์ Google Sheet ที่ต้องการเปิด");
      return;
    }

    const extractedId = extractSpreadsheetId(target.trim());
    if (!extractedId) {
      if (isOwner) {
        alert(
          "ลิงก์ หรือ ID ของ Google Sheet ไม่ถูกต้อง กรุณาคัดลอก URL แบบเต็มที่มี /d/SPREADSHEET_ID เช่น:\nhttps://docs.google.com/spreadsheets/d/1A2B3C... หรือใส่เฉพาะ ID ของไฟล์"
        );
      } else {
        alert("กรุณาเลือกไฟล์ Google Sheet ที่ต้องการเปิดจากรายการ");
      }
      return;
    }

    // Protection: If user is non-owner and extractedId somehow resolved to demo, override with real sheet
    if (!isOwner && (extractedId.startsWith("demo_") || extractedId.toLowerCase().includes("demo"))) {
      if (allowedSheets.length > 0) {
        const realSheet = allowedSheets[0];
        const realId = extractSpreadsheetId(realSheet.urlOrId || realSheet.spreadsheetId);
        setSpreadsheetId(realId);
        onLoadData(realId, true);
        onClose();
        return;
      }
      alert("ไม่พบไฟล์ Google Sheet จริงสำหรับฝ่ายของคุณ กรุณาติดต่อผู้ดูแลระบบ");
      return;
    }

    setSpreadsheetId(extractedId);
    onLoadData(extractedId, true);
    onClose();
  };

  const handleDirectOpenGoogleSheets = () => {
    if (realUrl) {
      window.open(realUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-100 overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/20 p-2 rounded-xl text-emerald-400">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                เชื่อมต่อ / เปิดไฟล์ Google Sheets
              </h3>
              <p className="text-xs text-slate-400">
                {isOwner
                  ? "จัดการไฟล์เอกสารโครงการจริงบน Google Drive"
                  : "เลือกเปิดไฟล์เอกสารโครงการ Google Sheets"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
          {/* Firebase App Connection Status Badge */}
          <div className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs font-semibold ${
            user && user.uid !== "demo-guest-user"
              ? "bg-emerald-50 border-emerald-300 text-emerald-950"
              : "bg-amber-50 border-amber-200 text-amber-900"
          }`}>
            <div className="flex items-center gap-2.5">
              {user && user.uid !== "demo-guest-user" ? (
                <>
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
                  </span>
                  <div>
                    <span className="font-extrabold block text-emerald-950">สถานะระบบ Firebase App: เชื่อมโยงแล้ว ✅</span>
                    <span className="text-[11px] text-emerald-700 font-normal">({user.email || user.displayName})</span>
                  </div>
                </>
              ) : (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0 animate-pulse"></span>
                  <div>
                    <span className="font-extrabold block text-amber-950">สถานะระบบ Firebase App: ยังไม่ได้เชื่อมโยง (โหมด Demo) ⚠️</span>
                    <span className="text-[11px] text-amber-800 font-normal">ลงชื่อเข้าใช้ด้วย Google / Firebase App เพื่อเชื่อมโยงการจัดเก็บข้อมูล</span>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onLogin}
                disabled={isLoggingIn}
                className={`px-3 py-1.5 text-xs font-bold text-white rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50 active:scale-95 ${
                  user && user.uid !== "demo-guest-user"
                    ? "bg-emerald-700 hover:bg-emerald-800"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
                title="เชื่อมต่อหรือสลับบัญชี Google / Firebase"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>
                  {isLoggingIn
                    ? "กำลังเชื่อมต่อ..."
                    : user && user.uid !== "demo-guest-user"
                    ? "สลับบัญชี (เลือกบัญชี)"
                    : "เชื่อมต่อบัญชี Firebase (เลือกบัญชี)"}
                </span>
              </button>

              {onLogoutSession && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogoutSession();
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                  title="ออกจากระบบ"
                >
                  <LogOut className="h-3.5 w-3.5 text-rose-600" />
                  <span>ออกจากระบบ</span>
                </button>
              )}
            </div>
          </div>

          {/* Status Banner */}
          {!isDemo ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-emerald-900">
                    กำลังเชื่อมโยงกับ Google Sheet จริง
                  </h4>
                  <p className="text-xs text-emerald-700 font-mono break-all">
                    ID: {isOwner ? spreadsheetId : maskSpreadsheetId(spreadsheetId)}
                  </p>
                </div>
              </div>
              {isOwner && (
                <a
                  href={realUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer text-center block"
                >
                  <ExternalLink className="h-4 w-4 inline-block mr-1" />
                  <span>คลิกเพื่อเปิดไฟล์จริงใน Google Sheets (แท็บใหม่) ↗</span>
                </a>
              )}
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3 text-emerald-950 shadow-xs">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-extrabold text-emerald-900 text-sm">
                  บันทึกข้อมูลในระบบเรียบร้อยแล้ว (โหมด Demo)
                </p>
                <p className="text-emerald-800 leading-relaxed font-medium">
                  ข้อมูลล่าสุดของคุณถูกจัดเก็บอยู่ในระบบชั่วคราว เพื่อป้องกันการกรอกข้อมูลใหม่ กรุณาเข้าสู่ระบบกับ <strong>Firebase App (Google Account)</strong> ด้านล่างเพื่อเชื่อมต่อและจัดเก็บลง Google Sheets จริง
                </p>
              </div>
            </div>
          )}

          {/* Option 1: Create Real File on Google Drive (Owner Only) */}
          {isOwner && (
            <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Sparkles className="h-4 w-4 text-sky-500" />
                <span>ทางเลือกที่ 1: สร้างไฟล์ Google Sheet ใหม่บน Google Drive (Owner)</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                ระบบจะสร้างไฟล์เอกสารโครงการก่อสร้างพร้อมโครงสร้างตารางเต็มรูปแบบลงใน Google Drive ของคุณโดยอัตโนมัติ
              </p>

              {user ? (
                <button
                  type="button"
                  onClick={onCreateTemplate}
                  disabled={isLoading}
                  className="w-full bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md shadow-sky-500/20 transition-all cursor-pointer disabled:opacity-60"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>
                    {isLoading ? "กำลังสร้างไฟล์บน Google Drive..." : "🚀 สร้างไฟล์ Google Sheet ใหม่บน Google Drive"}
                  </span>
                </button>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={onLogin}
                    disabled={isLoggingIn}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                    <span>{isLoggingIn ? "กำลังเข้าสู่ระบบ..." : "ลงชื่อเข้าใช้ด้วย Google / Firebase App เพื่อเชื่อมต่อบันทึกจริง (ไม่ต้องกรอกใหม่)"}</span>
                  </button>
                  <p className="text-[10px] text-slate-400 text-center">
                    * ต้องลงชื่อเข้าใช้ Google เพื่อขอสิทธิ์สร้างไฟล์ใน Google Drive ของคุณ
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Option 2: Open Existing File */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <FolderOpen className="h-4 w-4 text-emerald-600" />
              <span>
                {isOwner
                  ? "ทางเลือกที่ 2: ระบุ URL หรือ ID ของ Google Sheet ที่มีอยู่แล้ว"
                  : "เลือกไฟล์ Google Sheet ที่ต้องการเปิด"}
              </span>
            </div>

            {/* Department info badge for restricted user/admin */}
            {userSession && userSession.role !== "Owner" && (
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-sky-900 font-semibold">
                  <Building2 className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                  <span>ฝ่ายที่สังกัด: <strong>{userSession.department || "ทุกฝ่าย (*)"}</strong></span>
                </div>
                <span className="text-[10px] bg-sky-200/70 text-sky-900 font-bold px-2 py-0.5 rounded-full">
                  แสดง {allowedSheets.length} จาก {managedSheets.length} ไฟล์
                </span>
              </div>
            )}

            {/* Dropdown selector for saved files */}
            {allowedSheets.length > 0 ? (
              <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 space-y-1.5">
                <label className="text-[11px] font-extrabold text-emerald-950 flex items-center gap-1.5">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>
                    {isOwner
                      ? `ดร็อปดาวน์เลือกไฟล์ที่ Owner ตั้งชื่อไว้ (${allowedSheets.length} ไฟล์):`
                      : `เลือกไฟล์ Google Sheet ที่ฝ่ายของคุณสามารถเข้าถึงได้ (${allowedSheets.length} ไฟล์):`}
                  </span>
                </label>
                <select
                  id="sheet-selector-dropdown"
                  value={
                    selectedManagedSheetUrlOrId ||
                    (allowedSheets.find(
                      (s) =>
                        s.spreadsheetId === extractSpreadsheetId(inputUrlOrId) ||
                        s.urlOrId === inputUrlOrId
                    )?.urlOrId || (allowedSheets[0]?.urlOrId || ""))
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedManagedSheetUrlOrId(val);
                    setInputUrlOrId(val);
                  }}
                  className="w-full px-3 py-2 text-xs bg-white border border-emerald-300 rounded-lg focus:outline-none focus:border-emerald-600 font-medium text-emerald-950 cursor-pointer shadow-2xs"
                >
                  {allowedSheets.map((sheet, sIdx) => (
                    <option key={`${sheet.id || sheet.spreadsheetId}-${sIdx}`} value={sheet.urlOrId || sheet.spreadsheetId}>
                      {sheet.name} {sheet.department && sheet.department !== "ทุกฝ่าย (*)" ? `[ฝ่าย: ${sheet.department}]` : ""} ({sheet.spreadsheetId.substring(0, 10)}...)
                    </option>
                  ))}
                </select>
              </div>
            ) : managedSheets.length > 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  ไม่พบไฟล์ Google Sheet ที่กำหนดสิทธิ์ให้ฝ่าย <strong>"{userSession?.department}"</strong> สามารถเข้าถึงได้ กรุณาติดต่อ Owner เพื่อเพิ่มสิทธิ์ฝ่ายของคุณ
                </p>
              </div>
            ) : null}

            <form onSubmit={handleOpenExisting} className="space-y-2">
              {/* Only Owner can see & type raw URL/ID */}
              {isOwner && (
                <input
                  type="text"
                  placeholder="วาง URL หรือ ID ของ Google Sheet เช่น https://docs.google.com/spreadsheets/d/1A2B..."
                  value={inputUrlOrId}
                  onChange={(e) => setInputUrlOrId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 font-mono text-slate-800"
                />
              )}
              <button
                type="submit"
                disabled={isLoading || (!isOwner && allowedSheets.length === 0)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-700/10"
              >
                <FolderOpen className="h-4 w-4" />
                <span>{isLoading ? "กำลังเปิดและอ่านข้อมูล Google Sheets..." : "เปิดไฟล์ Google Sheet นี้"}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
