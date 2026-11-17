import React from "react";
import { Flame, LogIn, LogOut, X, ShieldAlert } from "lucide-react";

interface FirebaseWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
  onLogout?: () => void;
  isLoggingIn?: boolean;
}

export default function FirebaseWarningModal({
  isOpen,
  onClose,
  onLogin,
  onLogout,
  isLoggingIn = false,
}: FirebaseWarningModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[80] flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-150 text-slate-900">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-orange-800 px-6 py-4 text-white flex justify-between items-center border-b border-amber-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 text-white rounded-xl border border-white/30 shrink-0">
              <ShieldAlert className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">แจ้งเตือนการเชื่อมต่อ Firebase</h3>
              <p className="text-xs text-amber-100 font-mono">Firebase App Status: Offline</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-amber-100 hover:text-white hover:bg-black/20 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-600"></span>
              </span>
              <span className="font-extrabold text-amber-950 text-sm">
                สถานะการเชื่อมโยงระบบ Firebase App:
              </span>
            </div>
            <div className="bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 shadow-xs">
              <Flame className="h-4 w-4" />
              <span>• ออฟไลน์ (ยังไม่ได้เชื่อมต่อ) (Demo User)</span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              ในบทบาท <strong>Owner</strong> และ <strong>Admin</strong> คุณจำเป็นต้องเชื่อมต่อบัญชี Firebase ก่อนทำการแก้ไขหรือบันทึกข้อมูลต่างๆ ในรายแผนงานย่อย เพื่อความปลอดภัยและความถูกต้องของฐานข้อมูล
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          {onLogout && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="px-3.5 py-2 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 active:scale-95"
              title="ออกจากระบบ"
            >
              <LogOut className="h-3.5 w-3.5 text-rose-600" />
              <span>ออกจากระบบ</span>
            </button>
          )}

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              ปิด
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogin();
              }}
              disabled={isLoggingIn}
              className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-xl transition-colors cursor-pointer shadow-sm flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
              title="เชื่อมต่อและเลือกบัญชี Google / Firebase"
            >
              <LogIn className="h-4 w-4" />
              <span>{isLoggingIn ? "กำลังเชื่อมต่อ..." : "เชื่อมต่อบัญชี Firebase (เลือกบัญชี)"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
