import React from "react";
import { User } from "firebase/auth";
import { UserSession } from "../lib/userAuth";
import { PWAInstallButton } from "./PWAInstallButton";
import {
  LogOut,
  FileSpreadsheet,
  UserCheck,
  Eye,
  RotateCw,
  Zap,
} from "lucide-react";

interface HeaderProps {
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  userSession?: UserSession | null;
  onLogoutSession?: () => void;
  spreadsheetId: string;
  setSpreadsheetId: (id: string) => void;
  onLoadData: (id: string) => void;
  onCreateTemplate: () => void;
  isLoggingIn: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  onRequestAdminLogin: () => void;
  onOpenFirebaseStatus?: () => void;
  onRefreshData?: () => void;
  isGoogleTokenExpired?: boolean;
  onReauthenticateGoogle?: () => void;
  isReauthenticating?: boolean;
}

export default function Header({
  user,
  onLogin,
  onLogout,
  userSession,
  onLogoutSession,
  spreadsheetId,
  setSpreadsheetId,
  onLoadData,
  onCreateTemplate,
  isLoggingIn,
  isLoading,
  isAdmin,
  onRequestAdminLogin,
  onOpenFirebaseStatus,
  onRefreshData,
  isGoogleTokenExpired,
  onReauthenticateGoogle,
  isReauthenticating,
}: HeaderProps) {
  return (
    <header className="bg-[#0f172a] text-white shadow-md border-b border-[#1e293b] font-['Sarabun',sans-serif]">
      <div className="max-w-7xl mx-auto px-4 py-2 sm:py-2.5 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 sm:gap-4">
          {/* Logo and Brand Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-emerald-600 p-2 rounded-xl shadow-sm shadow-emerald-600/25 shrink-0">
              <FileSpreadsheet className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm sm:text-base font-bold tracking-tight font-sans truncate text-slate-100">
                Construction Project Dashboard
              </h1>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-[10px] text-emerald-400 font-mono tracking-wide truncate">
                  CONNECTED WITH GOOGLE SHEETS
                </span>
              </div>
            </div>
          </div>

          {/* Authentication & Integration Controls */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <PWAInstallButton />

            {/* 1-Click Fast Re-authorization Button if token is expired */}
            {isGoogleTokenExpired && onReauthenticateGoogle && user && user.uid !== "demo-guest-user" && (
              <button
                type="button"
                onClick={onReauthenticateGoogle}
                disabled={isReauthenticating}
                className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold px-2.5 sm:px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer transition-all animate-pulse active:scale-95 disabled:opacity-60 shrink-0"
                title="คลิกเดียวเพื่อต่ออายุสิทธิ์การเชื่อมต่อ Google Sheets ทันที ไม่ต้องเลือกบัญชีใหม่"
              >
                {isReauthenticating ? (
                  <>
                    <RotateCw className="h-3.5 w-3.5 animate-spin" />
                    <span>กำลังต่อสิทธิ์...</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5 fill-white shrink-0" />
                    <span>⚡ ต่อสิทธิ์ (กดครั้งเดียว)</span>
                  </>
                )}
              </button>
            )}

            {/* User Session / Role Badge */}
            {userSession ? (
              <button
                type="button"
                onClick={() => onRequestAdminLogin()}
                className="flex items-center gap-1.5 bg-[#1e293b] hover:bg-[#283548] px-2.5 sm:px-3 py-1.5 rounded-lg border border-[#334155] transition-colors cursor-pointer text-left shadow-xs shrink-0"
                title="คลิกเพื่อดูข้อมูลผู้ใช้ / สลับสิทธิ์"
              >
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  userSession.role === "Owner"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : userSession.role === "Admin"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                }`}>
                  {userSession.role === "Owner" ? "👑 Owner" : userSession.role === "Admin" ? "🛡️ Admin" : "👤 User"}
                </span>
                <span className="text-xs text-slate-200 font-medium truncate max-w-[90px] sm:max-w-[120px]" title={userSession.name}>
                  {userSession.username}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onRequestAdminLogin()}
                className="bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-xs whitespace-nowrap shrink-0"
                title="สิทธิ์ User: อ่านอย่างเดียว / คลิกเพื่อเข้าสู่ระบบ หรือ สลับสิทธิ์"
              >
                <Eye className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>👁️ ทั่วไป <span className="hidden sm:inline">(อ่านอย่างเดียว)</span></span>
              </button>
            )}

            {/* Firebase Account Status / Connection Trigger */}
            {user && user.uid !== "demo-guest-user" ? (
              <div className="flex items-center gap-1.5 bg-[#1e293b] px-2.5 py-1.5 rounded-lg border border-[#334155] shrink-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || "User"}
                    className="w-4 h-4 rounded-full border border-emerald-400 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span className="text-xs text-slate-200 font-medium truncate max-w-[80px] sm:max-w-[110px]" title={user.email || ""}>
                  {user.displayName || user.email?.split("@")[0] || "Firebase"}
                </span>
                <button
                  type="button"
                  onClick={onLogin}
                  disabled={isLoggingIn}
                  className="text-[10px] text-amber-300 hover:text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 px-1.5 py-0.5 rounded border border-amber-500/30 cursor-pointer transition-colors whitespace-nowrap"
                  title="สลับบัญชี Google / Firebase (เลือกบัญชีใหม่)"
                >
                  สลับบัญชี
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onLogin}
                disabled={isLoggingIn}
                id="google-signin-btn"
                className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-800 border border-slate-200 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer whitespace-nowrap disabled:opacity-60 shrink-0"
                title="คลิกเพื่อเชื่อมต่อบัญชี Google / Firebase (สามารถเลือกบัญชีที่ต้องการได้)"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 48 48">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                <span>
                  {isLoggingIn ? "กำลังเชื่อมต่อ..." : (
                    <>
                      <span className="hidden sm:inline">เชื่อมต่อ </span>Firebase (เลือกบัญชี)
                    </>
                  )}
                </span>
              </button>
            )}

            {/* Dedicated Logout Button — Always present whether Firebase is connected or not */}
            <button
              type="button"
              onClick={onLogoutSession || onLogout}
              title="ออกจากระบบ (Logout)"
              className="bg-rose-500/15 hover:bg-rose-500/25 active:bg-rose-500/35 text-rose-300 hover:text-white border border-rose-500/30 hover:border-rose-400/50 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer whitespace-nowrap active:scale-95 shrink-0"
            >
              <LogOut className="h-3.5 w-3.5 text-rose-400 shrink-0" />
              <span>ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
