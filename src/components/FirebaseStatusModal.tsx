import React, { useState, useEffect } from "react";
import { X, Flame, CheckCircle2, RefreshCw, ShieldCheck, Database, Server, Wifi, Clock, UserCheck, LogIn, LogOut } from "lucide-react";
import { User } from "firebase/auth";
import { checkFirebaseConnection, FirebaseConnectionStatus } from "../lib/firebaseMonitor";
import firebaseConfig from "../../firebase-applet-config.json";

interface FirebaseStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onLogin?: () => void;
  onLogoutSession?: () => void;
  onFirebaseSignOut?: () => void;
  isLoggingIn?: boolean;
}

export default function FirebaseStatusModal({
  isOpen,
  onClose,
  user,
  onLogin,
  onLogoutSession,
  onFirebaseSignOut,
  isLoggingIn = false,
}: FirebaseStatusModalProps) {
  const [status, setStatus] = useState<FirebaseConnectionStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<string>("");

  const isDemoUser = !user || user.uid === "demo-guest-user";

  const runCheck = async () => {
    setIsRefreshing(true);
    try {
      const res = await checkFirebaseConnection();
      setStatus(res);
      setLastCheckTime(new Date().toLocaleTimeString("th-TH"));
    } catch (e) {
      console.error("Firebase status check failed", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runCheck();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[70] flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-150 text-slate-900">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 px-6 py-4 text-white flex justify-between items-center border-b border-amber-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30 shrink-0">
              <Flame className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">สถานะการเชื่อมโยงระบบ Firebase App</h3>
              <p className="text-xs text-amber-300/80 font-mono">Real-time Connection & Diagnostics</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Main Connection Status Badge */}
          <div className={`border rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xs ${
            isDemoUser
              ? "bg-amber-50/80 border-amber-200/90 text-amber-950"
              : "bg-emerald-50/80 border-emerald-200/80 text-emerald-950"
          }`}>
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isDemoUser ? "bg-amber-400" : "bg-emerald-400"
                }`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${
                  isDemoUser ? "bg-amber-600" : "bg-emerald-600"
                }`}></span>
              </span>
              <div>
                <span className={`font-extrabold text-sm block ${
                  isDemoUser ? "text-amber-950" : "text-emerald-950"
                }`}>
                  {isDemoUser
                    ? "สถานะระบบ: ออฟไลน์ (ยังไม่ได้เชื่อมต่อบัญชี Firebase) ⚠️"
                    : "สถานะระบบ: ออนไลน์ & เชื่อมโยงบัญชี Firebase แล้ว 🟢"}
                </span>
                <span className={`text-xs font-medium ${
                  isDemoUser ? "text-amber-800" : "text-emerald-700"
                }`}>
                  {isDemoUser
                    ? "โหมดจำลอง Demo — เชื่อมต่อ Google Account เพื่อบันทึกข้อมูลถาวร"
                    : (status ? status.statusText : "เชื่อมต่อเซิร์ฟเวอร์เรียบร้อย")}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className={`font-mono text-[11px] font-bold px-2.5 py-1 rounded-lg text-white ${
                isDemoUser ? "bg-amber-600" : "bg-emerald-600"
              }`}>
                {status ? `${status.pingMs} ms` : "-- ms"}
              </span>
            </div>
          </div>

          {/* Quick Connection Action within Modal */}
          <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-2.5">
            <div className="text-xs space-y-0.5">
              <span className="font-bold text-slate-800 block">
                {isDemoUser ? "เชื่อมต่อบัญชีผู้ใช้ Firebase:" : "บัญชี Firebase ที่เชื่อมต่อปัจจุบัน:"}
              </span>
              <span className="text-slate-600 text-[11px]">
                {isDemoUser
                  ? "สามารถเลือกบัญชี Google ที่ต้องการใช้ซิงก์ข้อมูลได้ทันที"
                  : (user?.email || "เชื่อมโยงสำเร็จ")}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {onLogin && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogin();
                  }}
                  disabled={isLoggingIn}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50 active:scale-95 shrink-0"
                  title="คลิกเพื่อเลือกบัญชี Google / Firebase ที่ต้องการ"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>
                    {isLoggingIn
                      ? "กำลังเชื่อมต่อ..."
                      : isDemoUser
                      ? "เชื่อมต่อบัญชี Firebase (เลือกบัญชี)"
                      : "สลับ/เปลี่ยนบัญชี (เลือกบัญชี)"}
                  </span>
                </button>
              )}

              {!isDemoUser && onFirebaseSignOut && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onFirebaseSignOut();
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
                  title="ตัดการเชื่อมต่อ Firebase"
                >
                  <LogOut className="h-3.5 w-3.5 text-slate-500" />
                  <span>ตัด Firebase</span>
                </button>
              )}

              {onLogoutSession && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogoutSession();
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
                  title="ออกจากระบบ"
                >
                  <LogOut className="h-3.5 w-3.5 text-rose-600" />
                  <span>ออกจากระบบ</span>
                </button>
              )}
            </div>
          </div>

          {/* Technical Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-slate-500 font-semibold">
                <Server className="h-3.5 w-3.5 text-amber-600" />
                <span>Project ID:</span>
              </div>
              <p className="font-mono font-bold text-slate-800 break-all">
                {firebaseConfig.projectId || "-"}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-slate-500 font-semibold">
                <Database className="h-3.5 w-3.5 text-indigo-600" />
                <span>Firestore Database ID:</span>
              </div>
              <p className="font-mono font-bold text-slate-800 text-[10px] break-all">
                {(firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId || "default"}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-slate-500 font-semibold">
                <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                <span>Auth Domain:</span>
              </div>
              <p className="font-mono font-bold text-slate-800 break-all">
                {firebaseConfig.authDomain || "firebaseapp.com"}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-slate-500 font-semibold">
                <UserCheck className="h-3.5 w-3.5 text-blue-600" />
                <span>ผู้ใช้งานปัจจุบัน (Auth User):</span>
              </div>
              <p className="font-semibold text-slate-800 truncate">
                {user && user.uid !== "demo-guest-user"
                  ? user.email || user.displayName || user.uid
                  : "โหมดผู้ใช้งานสาธิต (Demo Mode - ยังไม่ได้เชื่อมต่อ)"}
              </p>
            </div>
          </div>

          {/* Realtime Monitoring Notice */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 space-y-1 text-xs">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <Clock className="h-4 w-4 text-amber-600" />
              <span>การตรวจสอบสถานะอัตโนมัติ (Continuous Monitoring)</span>
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              ระบบทำการตรวจสอบสถานะการเชื่อมโยง Firebase App ตลอดเวลาผ่าน Background Health Ping
              เพื่อให้มั่นใจว่าข้อมูลของคุณพร้อมซิงค์และปลอดภัย
            </p>
            {lastCheckTime && (
              <p className="text-[10px] font-mono text-slate-500 pt-1">
                อัปเดตล่าสุด: {lastCheckTime} น.
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runCheck}
              disabled={isRefreshing}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-600 ${isRefreshing ? "animate-spin" : ""}`} />
              <span>{isRefreshing ? "กำลังทดสอบ..." : "ทดสอบส่งสัญญาณปิง"}</span>
            </button>

            {onLogoutSession && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogoutSession();
                }}
                className="px-3.5 py-2 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 active:scale-95"
                title="ออกจากระบบ"
              >
                <LogOut className="h-3.5 w-3.5 text-rose-600" />
                <span>ออกจากระบบ</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 active:bg-slate-950 rounded-xl transition-colors cursor-pointer shadow-md"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
