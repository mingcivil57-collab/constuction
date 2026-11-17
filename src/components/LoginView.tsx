import React, { useState } from "react";
import { AppUser, UserSession, DEFAULT_USERS, authenticateUserFromList, saveUserSession, getUsersList } from "../lib/userAuth";
import {
  Lock,
  User,
  KeyRound,
  AlertCircle,
  Building2,
  ArrowRight,
  RotateCw,
} from "lucide-react";

interface LoginViewProps {
  onLoginSuccess: (session: UserSession) => void;
  usersList?: AppUser[];
  onRefreshData?: () => void;
  isLoadingData?: boolean;
  isSheetConnected?: boolean;
}

export default function LoginView({ onLoginSuccess, usersList, onRefreshData, isLoadingData, isSheetConnected = true }: LoginViewProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const localUsers = getUsersList();
  const activeUsersList = localUsers && localUsers.length > 0
    ? localUsers
    : (usersList && usersList.length > 0 ? usersList : DEFAULT_USERS);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!username.trim() || !password.trim()) {
      setErrorMessage("กรุณากรอก Username และ Password ให้ครบถ้วน");
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      const result = authenticateUserFromList(username, password, activeUsersList);
      if (result.success && result.user) {
        const session = saveUserSession(result.user);
        onLoginSuccess(session);
      } else {
        setErrorMessage(result.message || "Username หรือ Password ไม่ถูกต้อง");
      }
    }, 300);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Background Decorative Shapes */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-6 z-10">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3.5 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30 shadow-lg shadow-emerald-500/10 mb-1">
            <Building2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            ระบบรายงานโครงการก่อสร้าง
          </h1>
          <p className="text-xs text-slate-400 font-mono">
            CONSTRUCTION PROJECT MANAGEMENT SYSTEM
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-5">
          <div className="border-b border-slate-700/60 pb-3 flex justify-between items-center">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Lock className="h-4 w-4 text-emerald-400" />
              <span>เข้าสู่ระบบ (Sign In)</span>
            </h2>
            <div className="flex items-center gap-2">
              {onRefreshData && (
                <button
                  type="button"
                  onClick={onRefreshData}
                  disabled={isLoadingData}
                  className="text-[10px] bg-slate-900/80 hover:bg-slate-700 text-emerald-300 hover:text-emerald-200 px-2.5 py-1 rounded-full border border-emerald-500/30 font-medium transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  title="คลิกเพื่อดึงข้อมูลผู้ใช้งานและโครงการล่าสุดจาก Google Sheets"
                >
                  <RotateCw className={`h-3 w-3 ${isLoadingData ? "animate-spin text-amber-400" : "text-emerald-400"}`} />
                  <span>{isLoadingData ? "กำลังดึงข้อมูล..." : "ดึงข้อมูลจาก Sheet"}</span>
                </button>
              )}
              {isSheetConnected ? (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-mono font-medium hidden sm:inline flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Sheet Active
                </span>
              ) : (
                <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full border border-rose-500/30 font-mono font-medium hidden sm:inline flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  Sheet Inactive
                </span>
              )}
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="bg-rose-500/15 border border-rose-500/40 text-rose-300 p-3.5 rounded-2xl text-xs flex items-start gap-2.5 animate-shake">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">เข้าสู่ระบบไม่สำเร็จ</p>
                <p className="text-[11px] opacity-90 mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Username (ชื่อผู้ใช้งาน)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="กรอก Username..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Password (รหัสผ่าน)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="กรอก Password..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-slate-900 font-bold py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
            >
              {isLoading ? (
                <span>กำลังตรวจสอบสิทธิ์...</span>
              ) : (
                <>
                  <span>เข้าสู่ระบบ</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-500 font-mono">
          Session expires after 600 minutes of inactivity or browser exit.
        </p>
      </div>
    </div>
  );
}
