import React from "react";
import { AlertTriangle, RotateCw, X, ShieldAlert, CheckCircle2, Zap, ArrowRight, UserCheck } from "lucide-react";

interface GoogleAuthExpiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReauthenticate: () => Promise<void> | void;
  isReauthenticating?: boolean;
  userEmail?: string | null;
  pendingActionName?: string | null;
}

export default function GoogleAuthExpiredModal({
  isOpen,
  onClose,
  onReauthenticate,
  isReauthenticating = false,
  userEmail,
  pendingActionName,
}: GoogleAuthExpiredModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 sm:py-5 text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-sm shadow-inner">
              <Zap className="h-6 w-6 text-white fill-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span>ต่ออายุสิทธิ์การเชื่อมต่อ</span>
                <span className="text-[10px] bg-white/25 px-2 py-0.5 rounded-full font-mono font-medium uppercase tracking-wider">
                  คลิกเดียว
                </span>
              </h2>
              <p className="text-xs text-amber-100 font-medium">One-Click Google Authorization Renewal</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 bg-amber-50/80 p-4 rounded-xl border border-amber-200/80 text-amber-900">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-bold text-amber-950">
                สิทธิ์การเข้าถึง Google Sheets หมดอายุตามรอบความปลอดภัย
              </p>
              <p className="text-xs text-amber-800 leading-relaxed">
                ตามมาตรฐานความปลอดภัย Google OAuth Token จะมีอายุจำกัดชั่วคราว คุณสามารถต่อสิทธิ์ใหม่ได้ทันทีเพียงกดปุ่มด้านล่างเพียง <strong>1 ครั้ง</strong>
              </p>
            </div>
          </div>

          {/* User Account Quick Hint */}
          {userEmail && (
            <div className="flex items-center gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700">
              <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-slate-500 block text-[11px]">เชื่อมต่อกับบัญชี Google เดิมของคุณอัตโนมัติ:</span>
                <strong className="font-mono text-slate-900 truncate block">{userEmail}</strong>
              </div>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-semibold shrink-0">
                ไม่ต้องเลือกบัญชีใหม่
              </span>
            </div>
          )}

          {/* Pending Action Highlight */}
          {pendingActionName ? (
            <div className="bg-indigo-50/80 border border-indigo-200/80 rounded-xl p-3 text-xs text-indigo-900 flex items-start gap-2.5">
              <ArrowRight className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold text-indigo-950">บันทึกข้อมูลอัตโนมัติทันทีหลังต่อสิทธิ์:</span>
                <p className="text-indigo-800 text-[11px]">
                  ระบบจะดำเนินการ: <strong>"{pendingActionName}"</strong> ลง Google Sheets ให้อัตโนมัติทันที ไม่ต้องกดบันทึกซ้ำ
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1.5">
              <div className="flex items-center gap-2 font-medium text-slate-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>ข้อมูลและสถานะการทำงานปัจจุบันปลอดภัย</span>
              </div>
              <p className="pl-6 text-[11px] text-slate-500">
                ระบบได้สำรองข้อมูลของคุณไว้แล้ว เมื่อต่ออายุสิทธิ์ ข้อมูลจะซิงก์ตรงกับ Google Sheets ได้อย่างต่อเนื่อง
              </p>
            </div>
          )}

          {/* Single-Click Action Buttons */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={isReauthenticating}
              onClick={() => onReauthenticate()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md shadow-emerald-600/25 flex items-center justify-center gap-2 text-sm disabled:opacity-60 cursor-pointer active:scale-[0.99]"
            >
              {isReauthenticating ? (
                <>
                  <RotateCw className="h-4 w-4 animate-spin" />
                  <span>กำลังต่ออายุสิทธิ์ในคลิกเดียว...</span>
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 fill-white" />
                  <span>⚡ ต่ออายุสิทธิ์ทันที (กดแค่ครั้งเดียว)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={isReauthenticating}
              className="w-full py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors text-xs font-medium cursor-pointer text-center"
            >
              ปิดหน้าต่าง / ใช้งานออฟไลน์ชั่วคราว
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
