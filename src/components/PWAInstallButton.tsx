import React, { useState } from "react";
import { usePWAInstall } from "../hooks/usePWAInstall";
import { Download, Smartphone, X } from "lucide-react";

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showDesktopGuide, setShowDesktopGuide] = useState(false);

  // If already running as installed PWA, hide button
  if (isInstalled) {
    return null;
  }

  return (
    <>
      {isInstallable ? (
        <button
          type="button"
          onClick={install}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 sm:px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer shrink-0"
          title="ติดตั้งแอปพลิเคชันลงในเครื่อง (PWA)"
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span>ติดตั้งแอป</span>
        </button>
      ) : isIOS ? (
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-2.5 sm:px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer shrink-0"
          title="วิธีติดตั้งบน iOS / iPhone"
        >
          <Smartphone className="h-3.5 w-3.5 shrink-0" />
          <span>ติดตั้งแอป (iOS)</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setShowDesktopGuide(true)}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
          title="ติดตั้งแอปพลิเคชันนี้ใช้งานแบบเดสก์ท็อป/มือถือ"
        >
          <Download className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span>ติดตั้งแอป</span>
        </button>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-slate-900 border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Smartphone className="h-4.5 w-4.5 text-indigo-600" />
                <span>วิธีติดตั้งบน iPhone / iPad (iOS)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="text-xs space-y-2.5 text-slate-600 leading-relaxed font-medium">
              <p>1. เปิดหน้านี้ในแอปพลิเคชัน <strong>Safari</strong></p>
              <p>2. แตะปุ่ม <strong>แชร์ (Share)</strong> ที่แถบด้านล่างของ Safari</p>
              <p>3. เลื่อนลงมาแล้วเลือก <strong>"เพิ่มไปยังหน้าจอโฮม" (Add to Home Screen)</strong></p>
              <p>4. แตะ <strong>"เพิ่ม" (Add)</strong> เพื่อติดตั้งแอปบนหน้าจอหลักของคุณทันที</p>
            </div>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2.5 text-xs font-bold text-white shadow-md transition-colors cursor-pointer"
            >
              เข้าใจแล้ว
            </button>
          </div>
        </div>
      )}

      {showDesktopGuide && (
        <div
          onClick={() => setShowDesktopGuide(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-slate-900 border border-slate-100"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Download className="h-4.5 w-4.5 text-emerald-600" />
                <span>วิธีติดตั้งแอปพลิเคชัน (PWA)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowDesktopGuide(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="text-xs space-y-2.5 text-slate-600 leading-relaxed font-medium">
              <p>1. หากเปิดอยู่ในหน้าต่าง Preview กรุณาเปิดลิงก์แอปในแท็บเบราว์เซอร์โดยตรง (Chrome / Edge)</p>
              <p>2. กดไอคอน <strong>ติดตั้ง (Install)</strong> ที่แถบที่อยู่ด้านขวาบน หรือเปิดเมนู <strong>(...)</strong></p>
              <p>3. เลือก <strong>"ติดตั้งแอป" (Install app)</strong> หรือ <strong>"เพิ่มลงในหน้าจอหลัก" (Add to Home screen)</strong></p>
            </div>
            <button
              type="button"
              onClick={() => setShowDesktopGuide(false)}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 text-xs font-bold text-white shadow-md transition-colors cursor-pointer"
            >
              เข้าใจแล้ว
            </button>
          </div>
        </div>
      )}
    </>
  );
};
