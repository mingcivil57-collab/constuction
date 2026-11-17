import { useState, useEffect, useMemo, useRef } from "react";
import { User } from "firebase/auth";
import { Project, Task, ProgressUpdate, DisbursementPeriod, ProjectPhoto, PeriodicProgressRecord } from "./types";
import {
  initAuth,
  googleSignIn,
  googleSignOut,
  createDemoUser,
  reauthenticateGoogle,
  isGoogleTokenExpired,
  getStoredUserEmail,
} from "./lib/auth";
import { getMockDemoProjects } from "./lib/demoData";
import {
  fetchSpreadsheetData,
  fetchPublicSpreadsheetData,
  extractSpreadsheetId,
  createTemplateSpreadsheet,
  updateProjectSheetDetails,
  addProjectTask,
  updateProjectTasks,
  addProjectUpdate,
  createNewProject,
  addProjectDisbursement,
  updateProjectDisbursements,
  addProjectPhoto,
  updateProjectPhotos,
  updateProjectUpdates,
  updateProjectPeriodicProgress,
  fetchUsersFromSpreadsheet,
  fetchManagedSheetsFromSpreadsheet,
  deleteProjectFromSpreadsheet,
  batchSaveProjectsToSpreadsheet,
  maskSpreadsheetId,
  GoogleAuthError,
  isGoogleAuthError,
} from "./lib/googleSheets";
import {
  AppUser,
  UserSession,
  getUserSession,
  clearUserSession,
  refreshSessionActivity,
  getUsersList,
  isDepartmentAllowedForUser,
  canUserEditDepartment,
} from "./lib/userAuth";
import LoginView from "./components/LoginView";
import { syncPeriodicWithDisbursements, getDefaultPeriodicProgress, getDefaultPeriodicRemarks, getCurrentProgressInfo, ensureProjectsAutoUpdated } from "./lib/periodicUtils";
import { mergeSameDateUpdates } from "./lib/dateUtils";
import Header from "./components/Header";
import DashboardOverview from "./components/DashboardOverview";
import ProjectDetail from "./components/ProjectDetail";
import AddProjectModal from "./components/AddProjectModal";
import ConnectSheetModal from "./components/ConnectSheetModal";
import AdminAuthModal from "./components/AdminAuthModal";
import FirebaseStatusModal from "./components/FirebaseStatusModal";
import FirebaseWarningModal from "./components/FirebaseWarningModal";
import GoogleAuthExpiredModal from "./components/GoogleAuthExpiredModal";
import {
  syncAndMergeRemoteManagedSheets,
  getManagedSheets,
  getSheetDepartment,
  isSheetAllowedForUser,
  ManagedSheet,
} from "./lib/managedSheets";
import { ensureAdminHashInitialized } from "./lib/security";
import {
  FileSpreadsheet,
  Layers,
  AlertCircle,
  HelpCircle,
  LayoutGrid,
  FileText,
  Smartphone,
  Monitor,
  CheckCircle,
  TrendingUp,
  PlayCircle,
  RotateCw,
  Save,
  Trash2,
  Flame,
  Activity,
  LogIn,
  X,
  ShieldAlert,
  ShieldCheck,
  Plus,
  Sparkles,
  LogOut,
  Zap,
  ExternalLink,
  FolderOpen,
  PlusCircle,
} from "lucide-react";

const DEFAULT_SB4_SPREADSHEET_ID = "1t3unDWOOzqbqfs8bJW-XK4-9-PlVxnrnGSly40lMeDk";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isFirebaseStatusOpen, setIsFirebaseStatusOpen] = useState<boolean>(false);
  const [spreadsheetId, setSpreadsheetId] = useState<string>(() => {
    return localStorage.getItem("construction_ss_id") || "";
  });
  const [isSavingAll, setIsSavingAll] = useState<boolean>(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Sheet Users & User Session State
  const [userSession, setUserSession] = useState<UserSession | null>(() => {
    return getUserSession();
  });
  const [sheetUsers, setSheetUsers] = useState<AppUser[]>([]);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  // Department-based access control and managed sheet resolution
  const managedSheets = useMemo(() => getManagedSheets(), [spreadsheetId]);

  const currentManagedSheet = useMemo(() => {
    return (
      managedSheets.find(
        (s) => s.spreadsheetId === spreadsheetId || s.urlOrId === spreadsheetId
      ) || null
    );
  }, [managedSheets, spreadsheetId]);

  const currentSheetDepartment = useMemo(() => {
    return getSheetDepartment(currentManagedSheet);
  }, [currentManagedSheet]);

  const isCurrentSheetAllowed = useMemo(() => {
    if (!userSession) return true;
    if (userSession.role === "Owner") return true;
    return isSheetAllowedForUser(currentManagedSheet, userSession);
  }, [currentManagedSheet, userSession]);

  const canEditCurrentDepartment = useMemo(() => {
    if (!userSession) return false;
    if (userSession.role === "Owner") return true;
    if (!isCurrentSheetAllowed) return false;
    return canUserEditDepartment(currentSheetDepartment, userSession);
  }, [currentSheetDepartment, isCurrentSheetAllowed, userSession]);

  // If user doesn't have permission for current sheet or is stuck in demo mode, automatically switch them to their first allowed sheet if available
  useEffect(() => {
    const isDemo = !spreadsheetId || spreadsheetId.startsWith("demo_") || spreadsheetId.toLowerCase().includes("demo");
    if (userSession && userSession.role !== "Owner" && (!isCurrentSheetAllowed || isDemo)) {
      const allowed = managedSheets.filter((s) => isSheetAllowedForUser(s, userSession));
      if (allowed.length > 0 && (isDemo || allowed[0].spreadsheetId !== spreadsheetId)) {
        const targetId = allowed[0].spreadsheetId;
        setSpreadsheetId(targetId);
        localStorage.setItem("construction_ss_id", targetId);
        loadSpreadsheetData(targetId, false, undefined, true);
      }
    }
  }, [userSession, isCurrentSheetAllowed, managedSheets, spreadsheetId]);

  // Admin Role derived from Session or Local Storage (Owner and Admin with edit permission can edit)
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    if (userSession) return userSession.role === "Owner" || (userSession.role === "Admin" && canUserEditDepartment(getSheetDepartment(null), userSession));
    return localStorage.getItem("app_is_admin") === "true";
  });

  // Sync isAdmin state whenever userSession or department permissions change and auto update project progress
  useEffect(() => {
    if (userSession) {
      const canEdit = userSession.role === "Owner" || (userSession.role === "Admin" && canEditCurrentDepartment);
      setIsAdmin(canEdit);
      localStorage.setItem("app_is_admin", canEdit ? "true" : "false");

      // Auto-connect & fetch live data from Google Sheets immediately upon logging in / session restore
      const currentSsId = localStorage.getItem("construction_ss_id") || spreadsheetId;
      if (currentSsId) {
        handleRefreshData(true);
      }
    }

    // Auto-update project progress for current period on login/session change
    setProjects((prevProjects) => {
      if (!prevProjects || prevProjects.length === 0) return prevProjects;
      const updated = ensureProjectsAutoUpdated(prevProjects);
      if (selectedProject) {
        const found = updated.find((p) => p.sheetName === selectedProject.sheetName);
        if (found && (found.progressPlan !== selectedProject.progressPlan || found.progressField !== selectedProject.progressField)) {
          setSelectedProject(found);
        }
      }
      return updated;
    });
  }, [userSession, canEditCurrentDepartment]);

  // Periodic Session Timeout Check (600 minutes / 10 hours) and Activity Refresh
  useEffect(() => {
    const interval = setInterval(() => {
      const activeSession = getUserSession();
      if (!activeSession && userSession) {
        setUserSession(null);
        alert("เซสชันการใช้งานของคุณหมดอายุแล้ว (600 นาที) กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
      }
    }, 60000); // Check every minute

    const handleUserActivity = () => {
      if (userSession) {
        refreshSessionActivity();
      }
    };

    window.addEventListener("click", handleUserActivity);
    window.addEventListener("keydown", handleUserActivity);

    return () => {
      clearInterval(interval);
      window.removeEventListener("click", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
    };
  }, [userSession]);

  // Fetch users from "Users" sheet whenever spreadsheet is connected or on initial load
  useEffect(() => {
    const targetSsId =
      !spreadsheetId || spreadsheetId.startsWith("demo_")
        ? DEFAULT_SB4_SPREADSHEET_ID
        : spreadsheetId;

    fetchUsersFromSpreadsheet(targetSsId, accessToken)
      .then((users) => {
        if (users && users.length > 0) {
          setSheetUsers(users);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch users on init:", err);
      });
  }, [spreadsheetId, accessToken]);

  // Fetch managed sheets list on app load (works in demo/guest mode via public GViz too)
  useEffect(() => {
    const targetSsId =
      !spreadsheetId || spreadsheetId.startsWith("demo_")
        ? DEFAULT_SB4_SPREADSHEET_ID
        : spreadsheetId;

    fetchManagedSheetsFromSpreadsheet(targetSsId, accessToken)
      .then((remoteSheets) => {
        syncAndMergeRemoteManagedSheets(remoteSheets || []);
      })
      .catch((e) => console.warn("Could not load managed sheets on init:", e));
  }, [spreadsheetId, accessToken]);
  const [adminAuthModal, setAdminAuthModal] = useState<{
    isOpen: boolean;
    targetActionName?: string;
  }>({ isOpen: false });

  // Ensure initial admin password hash is set up in localStorage
  useEffect(() => {
    ensureAdminHashInitialized();
  }, []);

  const handleRequestAdminLogin = (actionName?: unknown) => {
    // Guard: Do not allow entering User Management & Admin/Owner permissions system until Firebase account is connected
    const isFirebaseOffline = !user || user.uid === "demo-guest-user" || spreadsheetId.startsWith("demo_") || !accessToken;
    if (isFirebaseOffline) {
      setIsFirebaseWarningModalOpen(true);
      return;
    }
    const cleanActionName = typeof actionName === "string" ? actionName : undefined;
    setAdminAuthModal({
      isOpen: true,
      targetActionName: cleanActionName,
    });
  };

  const handleLoginAdminSuccess = () => {
    setIsAdmin(true);
    localStorage.setItem("app_is_admin", "true");
    showTemporarySuccess("เข้าสู่ระบบผู้ดูแลระบบ (Admin) สำเร็จ! ดึงข้อมูลล่าสุดเรียบร้อยแล้ว");
    handleRefreshData(true);
  };

  const handleLogoutAdmin = () => {
    setIsAdmin(false);
    localStorage.setItem("app_is_admin", "false");
    showTemporarySuccess("สลับเป็นโหมดผู้ใช้งานทั่วไป (อ่านได้อย่างเดียว) เรียบร้อยแล้ว");
  };

  // Modal and loading states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isFirebaseWarningModalOpen, setIsFirebaseWarningModalOpen] = useState(false);
  const [isAuthExpiredModalOpen, setIsAuthExpiredModalOpen] = useState(false);
  const [isGoogleTokenExpiredState, setIsGoogleTokenExpiredState] = useState<boolean>(false);
  const [pendingActionName, setPendingActionName] = useState<string | null>(null);
  const pendingActionRef = useRef<(() => Promise<void>) | null>(null);
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSheetConnected, setIsSheetConnected] = useState<boolean>(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState<boolean>(false);

  // Periodic check for token validity
  useEffect(() => {
    const checkTokenState = () => {
      if (user && user.uid !== "demo-guest-user") {
        setIsGoogleTokenExpiredState(isGoogleTokenExpired());
      } else {
        setIsGoogleTokenExpiredState(false);
      }
    };
    checkTokenState();
    const interval = setInterval(checkTokenState, 30000);
    window.addEventListener("focus", checkTokenState);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", checkTokenState);
    };
  }, [user]);

  // Subscribe to google-auth-expired events from low-level API operations
  useEffect(() => {
    const handleAuthExpired = () => {
      setIsGoogleTokenExpiredState(true);
      setIsAuthExpiredModalOpen(true);
      setError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google (กดแค่ครั้งเดียวเพื่อบันทึกต่อ)");
    };
    window.addEventListener("google-auth-expired", handleAuthExpired);
    return () => {
      window.removeEventListener("google-auth-expired", handleAuthExpired);
    };
  }, []);

  const checkFirebaseConnectionForEdit = (): boolean => {
    const role = userSession?.role;
    const isOwnerOrAdmin = role ? (role === "Owner" || role === "Admin") : isAdmin;
    const isFirebaseOffline = !user || user.uid === "demo-guest-user" || spreadsheetId.startsWith("demo_") || !accessToken;

    if (isOwnerOrAdmin && isFirebaseOffline) {
      setIsFirebaseWarningModalOpen(true);
      return true;
    }
    return true;
  };

  // Initialize Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        if (currentUser && currentUser.uid !== "demo-guest-user") {
          const currentSsId = localStorage.getItem("construction_ss_id") || spreadsheetId;
          if (currentSsId) {
            handleRefreshData(true);
          }
        }
      },
      () => {
        // If demo user is already active, don't clear
        if (user?.uid === "demo-guest-user") return;
        setUser(null);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Auto refresh data whenever Firebase user account state updates or connects
  useEffect(() => {
    if (user && user.uid !== "demo-guest-user") {
      const currentSsId = localStorage.getItem("construction_ss_id") || spreadsheetId;
      if (currentSsId) {
        handleRefreshData(true);
      }
    }
  }, [user]);

  // Fetch spreadsheet data whenever Spreadsheet ID or token changes
  useEffect(() => {
    if (spreadsheetId) {
      loadSpreadsheetData(spreadsheetId, false);
    }
  }, [accessToken, spreadsheetId]);

  const handleEnableDemoMode = () => {
    setError(null);
    const { user: demoUser, accessToken: demoToken } = createDemoUser();
    setUser(demoUser);
    setAccessToken(demoToken);

    const mockProjects = ensureProjectsAutoUpdated(getMockDemoProjects());
    setProjects(mockProjects);
    setSpreadsheetId("demo_spreadsheet_2569_2570");
    localStorage.setItem("construction_ss_id", "demo_spreadsheet_2569_2570");

    const years = Array.from(new Set(mockProjects.map((p) => p.fiscalYear))).sort((a, b) => b.localeCompare(a));
    setSelectedYear("2570");
    const plans = Array.from(new Set(mockProjects.filter((p) => p.fiscalYear === "2570").map((p) => p.planName))).sort();
    setSelectedPlan(plans[0] || "แผนงานที่ 1");

    showTemporarySuccess("เข้าสู่ระบบโหมดทดลอง (Demo Mode) พร้อม 15 โครงการตัวอย่างเรียบร้อยแล้ว!");
  };

  const loadSpreadsheetData = async (
    id: string,
    keepSelected = true,
    targetSheetName?: string,
    forceRefresh = false
  ) => {
    if (!id || !id.trim()) return;
    setIsLoading(true);
    setError(null);

    const cleanId = extractSpreadsheetId(id.trim());
    if (!cleanId) {
      setIsLoading(false);
      setError(
        "ลิงก์ หรือ ID ของ Google Sheet ไม่ถูกต้อง/ไม่สมบูรณ์ กรุณาคัดลอก URL แบบเต็ม เช่น https://docs.google.com/spreadsheets/d/1A2B3C... หรือใส่เฉพาะ ID ของไฟล์"
      );
      return;
    }

    localStorage.setItem("construction_ss_id", cleanId);
    setSpreadsheetId(cleanId);

    // If forceRefresh is requested, clear old local cache for this spreadsheet ID
    if (forceRefresh) {
      try {
        localStorage.removeItem(`construction_projects_${cleanId}`);
      } catch (e) {}
    }

    // Demo Mode handling (only for demo IDs)
    if (
      cleanId.startsWith("demo_") ||
      cleanId.toLowerCase().includes("demo") ||
      cleanId === "demo_spreadsheet_2569_2570"
    ) {
      setError(null);
      setIsSheetConnected(true);
      const savedLocal = forceRefresh ? null : localStorage.getItem(`construction_projects_${cleanId}`);
      let mockProjects: Project[] = [];
      if (savedLocal) {
        try {
          mockProjects = ensureProjectsAutoUpdated(JSON.parse(savedLocal), forceRefresh);
        } catch {
          mockProjects = ensureProjectsAutoUpdated(getMockDemoProjects(), forceRefresh);
        }
      } else {
        mockProjects = ensureProjectsAutoUpdated(getMockDemoProjects(), forceRefresh);
      }
      setProjects(mockProjects);

      const activeSheetName = targetSheetName || selectedProject?.sheetName;
      if (keepSelected && activeSheetName) {
        const found = mockProjects.find((p) => p.sheetName === activeSheetName);
        setSelectedProject(found ? { ...found } : null);
      } else if (!keepSelected) {
        setSelectedProject(null);
      }

      const years = Array.from(new Set(mockProjects.map((p) => p.fiscalYear))).sort((a, b) => b.localeCompare(a));
      const activeYear = years.includes("2570") ? "2570" : years[0] || "";
      setSelectedYear(activeYear);

      const plans = Array.from(new Set(mockProjects.filter((p) => p.fiscalYear === activeYear).map((p) => p.planName))).sort();
      setSelectedPlan(plans[0] || "แผนงานที่ 1");

      setIsLoading(false);
      return;
    }

    // Real Google Sheet handling
    try {
      let data: Project[] = [];
      let fetchErrorMsg = "";

      // 1) Try Google Sheets API with accessToken if user is authenticated with Google
      if (accessToken && accessToken !== "demo-access-token") {
        try {
          data = await fetchSpreadsheetData(cleanId, accessToken);
        } catch (apiErr: any) {
          console.warn("API v4 fetch failed, falling back to public GViz reader:", apiErr);
          fetchErrorMsg = apiErr.message || "";
        }
      }

      // 2) Fallback to public GViz endpoint (works for any sheet shared "Anyone with link can view")
      if (!data || data.length === 0) {
        try {
          data = await fetchPublicSpreadsheetData(cleanId);
        } catch (pubErr: any) {
          console.warn("Public GViz fetch failed:", pubErr);
          if (!fetchErrorMsg) fetchErrorMsg = pubErr.message || "";
        }
      }

      if (data && data.length > 0) {
        setError(null);
        setIsSheetConnected(true);
        const autoUpdatedData = ensureProjectsAutoUpdated(data, forceRefresh);
        setProjects(autoUpdatedData);
        // Cache data locally for this spreadsheet ID for smooth offline/re-read fallback
        try {
          localStorage.setItem(`construction_projects_${cleanId}`, JSON.stringify(autoUpdatedData));
        } catch (e) {}

        // Update selected project or clear stale selection
        const activeSheetName = targetSheetName || selectedProject?.sheetName;
        if (keepSelected && activeSheetName) {
          const found = autoUpdatedData.find((p) => p.sheetName === activeSheetName);
          setSelectedProject(found ? { ...found } : null);
        } else if (!keepSelected) {
          setSelectedProject(null);
        }

        // Initialize selectedYear and selectedPlan for the new dataset
        const years = Array.from(new Set(autoUpdatedData.map((p) => p.fiscalYear))).sort((a, b) => b.localeCompare(a));
        const activeYear = years.includes("2570") ? "2570" : years[0] || "";
        setSelectedYear((prev) => (prev && years.includes(prev) ? prev : activeYear));

        const plans = Array.from(new Set(autoUpdatedData.filter((p) => p.fiscalYear === (selectedYear || activeYear)).map((p) => p.planName))).sort();
        setSelectedPlan((prev) => (prev && plans.includes(prev) ? prev : (plans[0] || "")));

        if (targetSheetName) {
          showTemporarySuccess(`รีเฟรชข้อมูลล่าสุดของโครงการ "${targetSheetName}" จาก Google Sheets สำเร็จ`);
        } else {
          showTemporarySuccess(`ดึงข้อมูลล่าสุดจาก Google Sheets สำเร็จเรียบร้อยแล้ว (พบ ${autoUpdatedData.length} โครงการ)`);
        }
      } else if (data && data.length === 0) {
        // Successfully connected to Google Sheet, but 0 projects in this sheet currently
        setError(null);
        setIsSheetConnected(true);
        setProjects([]);
        setSelectedProject(null);
        if (targetSheetName) {
          showTemporarySuccess(`ไม่พบข้อมูลโครงการ "${targetSheetName}" ใน Google Sheets`);
        } else {
          showTemporarySuccess(`เชื่อมต่อกับ Google Sheets สำเร็จเรียบร้อยแล้ว (ยังไม่มีโครงการในไฟล์นี้ สามารถเริ่มเพิ่มโครงการใหม่หรือสร้างเทมเพลตได้ทันที)`);
        }
      } else {
        // Check if there is local cached data for this spreadsheet ID before failing
        const savedCache = forceRefresh ? null : localStorage.getItem(`construction_projects_${cleanId}`);
        if (savedCache) {
          try {
            const cachedProjects: Project[] = ensureProjectsAutoUpdated(JSON.parse(savedCache), forceRefresh);
            if (cachedProjects && cachedProjects.length > 0) {
              setProjects(cachedProjects);
              setError(null);
              setIsSheetConnected(true);
              showTemporarySuccess(`ใช้ข้อมูลโครงการล่าสุดจากระบบสำหรับไฟล์นี้ (พบ ${cachedProjects.length} โครงการ)`);
              return;
            }
          } catch (e) {}
        }

        throw new Error(
          fetchErrorMsg ||
            `ไม่สามารถเข้าถึงไฟล์ Google Sheet นี้ได้ (ID: ${cleanId}) กรุณาตรวจสอบ ID และตั้งค่าสิทธิ์ให้ 'ทุกคนที่มีลิงก์อ่านได้'`
        );
      }
    } catch (err: any) {
      console.error(err);
      const errMsg =
        err.message ||
        "ล้มเหลวในการอ่านข้อมูลโครงการ กรุณาตรวจสอบว่า URL / ID ถูกต้อง และตั้งค่าการแชร์ไฟล์เป็น 'ทุกคนที่มีลิงก์อ่านได้'";
      setError(errMsg);
      setIsSheetConnected(false);

      // Fallback to local cache or mock demo projects so user can continue using the application
      const savedCache = localStorage.getItem(`construction_projects_${cleanId}`);
      let fallbackProjects: Project[] = [];
      if (savedCache) {
        try {
          fallbackProjects = ensureProjectsAutoUpdated(JSON.parse(savedCache));
        } catch (e) {}
      }

      if (!fallbackProjects || fallbackProjects.length === 0) {
        fallbackProjects = ensureProjectsAutoUpdated(getMockDemoProjects());
      }

      setProjects(fallbackProjects);

      const years = Array.from(new Set(fallbackProjects.map((p) => p.fiscalYear))).sort((a, b) => b.localeCompare(a));
      const activeYear = years.includes("2570") ? "2570" : years[0] || "";
      setSelectedYear((prev) => (prev && years.includes(prev) ? prev : activeYear));

      const plans = Array.from(
        new Set(fallbackProjects.filter((p) => p.fiscalYear === (selectedYear || activeYear)).map((p) => p.planName))
      ).sort();
      setSelectedPlan((prev) => (prev && plans.includes(prev) ? prev : plans[0] || ""));

      const activeSheetName = targetSheetName || selectedProject?.sheetName;
      if (keepSelected && activeSheetName) {
        const found = fallbackProjects.find((p) => p.sheetName === activeSheetName);
        setSelectedProject(found ? { ...found } : null);
      } else {
        setSelectedProject(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshData = async (keepSelected = true, targetSheetName?: string) => {
    const currentSsId = localStorage.getItem("construction_ss_id") || spreadsheetId;
    if (!currentSsId) return;

    await loadSpreadsheetData(currentSsId, keepSelected, targetSheetName, true);

    if (currentSsId && !currentSsId.startsWith("demo_")) {
      try {
        const users = await fetchUsersFromSpreadsheet(currentSsId, accessToken);
        if (users && users.length > 0) {
          setSheetUsers(users);
        }
      } catch (e) {
        console.warn("Could not refresh users sheet:", e);
      }

      try {
        const targetSsId =
          !currentSsId || currentSsId.startsWith("demo_")
            ? DEFAULT_SB4_SPREADSHEET_ID
            : currentSsId;

        const remoteSheets = await fetchManagedSheetsFromSpreadsheet(targetSsId, accessToken);
        syncAndMergeRemoteManagedSheets(remoteSheets || []);
      } catch (e) {
        console.warn("Could not refresh managed sheets:", e);
      }
    } else {
      try {
        const remoteSheets = await fetchManagedSheetsFromSpreadsheet(
          DEFAULT_SB4_SPREADSHEET_ID,
          accessToken
        );
        syncAndMergeRemoteManagedSheets(remoteSheets || []);
      } catch (e) {
        console.warn("Could not refresh managed sheets in demo mode:", e);
      }
    }
  };

  const handleSelectProject = async (project: Project) => {
    setSelectedProject(project);
    if (project && project.sheetName) {
      await handleRefreshData(true, project.sheetName);
    }
  };

  const handleSelectYear = (year: string) => {
    setSelectedYear(year);
    const plansInNewYear = Array.from(
      new Set(projects.filter((p) => p.fiscalYear === year).map((p) => p.planName))
    ).sort();
    if (selectedPlan === "ALL_PLANS") {
      // Keep "ALL_PLANS" so user continues viewing all subplans for the newly selected year
      return;
    }
    if (plansInNewYear.length > 0 && !plansInNewYear.includes(selectedPlan)) {
      setSelectedPlan(plansInNewYear[0]);
    }
  };

  const handleSelectPlan = (plan: string) => {
    setSelectedPlan(plan);
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      // Pass promptSelectAccount = true explicitly so Google always shows the account selector
      const result = await googleSignIn(undefined, true);
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        showTemporarySuccess(`เชื่อมต่อบัญชี Google / Firebase สำเร็จ (${result.user.email || ""})!`);
        handleRefreshData(true);
      }
    } catch (err: any) {
      console.warn("Google login popup restricted, fallback to demo mode:", err);
      // Seamlessly activate demo mode without cluttering UI with raw red errors
      handleEnableDemoMode();
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleReauthenticateGoogle = async (customActionToRetry?: () => Promise<void>) => {
    setIsReauthenticating(true);
    setError(null);
    try {
      const emailHint = user?.email || getStoredUserEmail() || undefined;
      const result = await reauthenticateGoogle(emailHint);
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        setIsAuthExpiredModalOpen(false);
        setIsGoogleTokenExpiredState(false);
        showTemporarySuccess("⚡ ต่ออายุสิทธิ์ Google สำเร็จเรียบร้อยแล้วในคลิกเดียว! พร้อมซิงก์ข้อมูลต่อเนื่อง");

        const actionToRun = customActionToRetry || pendingActionRef.current;
        if (actionToRun) {
          pendingActionRef.current = null;
          setPendingActionName(null);
          try {
            await actionToRun();
          } catch (retryErr) {
            console.warn("Auto-retry action after renewal failed:", retryErr);
          }
        } else {
          await handleRefreshData(true);
        }
      }
    } catch (err: any) {
      console.warn("Re-authentication error:", err);
      setError("ไม่สามารถต่ออายุสิทธิ์ Google ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsReauthenticating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await googleSignOut();
      setUser(null);
      setAccessToken(null);
      setProjects([]);
      setSelectedProject(null);
      showTemporarySuccess("ออกจากระบบแล้ว");
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateTemplate = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const id = await createTemplateSpreadsheet(accessToken, "ระบบบันทึกงานก่อสร้าง พ.ศ. 2569-2570");
      setSpreadsheetId(id);
      showTemporarySuccess("สร้างเทมเพลตและข้อมูลจำลอง 15 รายการสำเร็จ!");
    } catch (err: any) {
      console.error(err);
      setError("ไม่สามารถสร้างไฟล์เทมเพลตใหม่ใน Google Drive ของคุณได้");
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to determine if we are connected to a real Google Sheet session
  const isRealGoogleSheetSession =
    Boolean(spreadsheetId) &&
    Boolean(accessToken) &&
    accessToken !== "demo-access-token" &&
    !spreadsheetId?.startsWith("demo_");

  // CRUD Operations with writeback and reloading
  const checkAdminPermission = (): boolean => {
    if (!userSession) {
      alert("กรุณาเข้าสู่ระบบก่อนทำรายการ");
      return false;
    }
    if (userSession.role === "Owner") return true;

    // 1. Check if user is allowed to access this department
    if (!isCurrentSheetAllowed) {
      alert(`การทำงานถูกปฏิเสธ: คุณไม่มีสิทธิ์เข้าถึงข้อมูลของฝ่าย "${currentSheetDepartment}"`);
      return false;
    }

    // 2. Check if user has edit permission for this department
    if (!canEditCurrentDepartment) {
      alert(`การทำงานถูกปฏิเสธ: บัญชีผู้ใช้ของคุณได้รับสิทธิ์ "ดูข้อมูลอย่างเดียว (View Only)" สำหรับฝ่าย "${currentSheetDepartment}" ไม่สามารถทำการเพิ่ม แก้ไข หรือลบข้อมูลได้`);
      return false;
    }

    const role = userSession.role;
    const hasPermission = (role === "Owner" || role === "Admin") && canEditCurrentDepartment;
    if (!hasPermission) {
      alert("การทำงานถูกปฏิเสธ: บัญชีผู้ใช้ของคุณเป็นสิทธิ์ User (อ่านได้อย่างเดียว) ไม่สามารถทำการเพิ่ม แก้ไข หรือลบข้อมูลได้");
      return false;
    }
    return true;
  };

  const handleGoogleOperationError = (
    err: any,
    fallbackSuccessMsg?: string,
    retryAction?: () => Promise<void>,
    actionName?: string
  ) => {
    console.error("Google operation error:", err);
    if (
      err instanceof GoogleAuthError ||
      isGoogleAuthError(err) ||
      (err?.message &&
        (err.message.includes("401") ||
          err.message.includes("invalid authentication credentials") ||
          err.message.includes("ต่ออายุสิทธิ์") ||
          err.message.includes("OAuth 2 access token")))
    ) {
      if (retryAction) {
        pendingActionRef.current = retryAction;
        setPendingActionName(actionName || null);
      }
      setIsGoogleTokenExpiredState(true);
      setIsAuthExpiredModalOpen(true);
      setError("การเชื่อมต่อสิทธิ์ Google Sheets หมดอายุ กรุณาต่ออายุสิทธิ์เข้าสู่ระบบ Google (กดแค่ครั้งเดียวเพื่อบันทึกต่อ)");
    } else if (fallbackSuccessMsg) {
      showTemporarySuccess(fallbackSuccessMsg);
    }
  };

  const handleUpdateProjectMetadata = async (updatedProject: Project) => {
    if (!checkAdminPermission()) return;
    if (!checkFirebaseConnectionForEdit()) return;

    const isOwnerUser = userSession?.role === "Owner";
    const existingProject = projects.find((p) => p.sheetName === updatedProject.sheetName);
    const cleanedProject: Project = {
      ...updatedProject,
      planName: updatedProject.planName?.trim() || "ไม่ระบุแผนงาน",
      fiscalYear: updatedProject.fiscalYear?.trim() || "2569",
      projectName: updatedProject.projectName?.trim() || updatedProject.sheetName,
      // Only Owner can update projectNotes; non-Owner preserves existing note
      projectNotes: isOwnerUser ? updatedProject.projectNotes : existingProject?.projectNotes,
    };

    setProjects((prev) => {
      const nextProjects = prev.map((p) => (p.sheetName === cleanedProject.sheetName ? cleanedProject : p));
      try {
        const currentSsId = localStorage.getItem("construction_ss_id") || spreadsheetId;
        if (currentSsId) {
          localStorage.setItem(`construction_projects_${currentSsId}`, JSON.stringify(nextProjects));
        }
      } catch (e) {
        console.error("Failed to save updated project metadata cache:", e);
      }
      return nextProjects;
    });

    if (selectedProject && selectedProject.sheetName === cleanedProject.sheetName) {
      setSelectedProject(cleanedProject);
    }

    if (isRealGoogleSheetSession) {
      setIsLoading(true);
      setError(null);
      try {
        await updateProjectSheetDetails(spreadsheetId, cleanedProject, accessToken!);
        showTemporarySuccess(`บันทึกการแก้ไขโครงการ "${cleanedProject.projectName}" สำเร็จ`);
      } catch (err: any) {
        handleGoogleOperationError(
          err,
          `บันทึกข้อมูลโครงการในระบบเรียบร้อยแล้ว`,
          () => updateProjectSheetDetails(spreadsheetId, cleanedProject, accessToken!),
          `บันทึกโครงการ "${cleanedProject.projectName}"`
        );
      } finally {
        setIsLoading(false);
      }
    } else {
      showTemporarySuccess(`บันทึกการแก้ไขโครงการ "${cleanedProject.projectName}" สำเร็จ`);
    }
  };

  const handleAddTask = async (sheetName: string, task: Task) => {
    if (!checkAdminPermission()) return;
    if (!checkFirebaseConnectionForEdit()) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.sheetName === sheetName ? { ...p, tasks: [...p.tasks, task] } : p
      )
    );
    if (selectedProject && selectedProject.sheetName === sheetName) {
      setSelectedProject((prev) => (prev ? { ...prev, tasks: [...prev.tasks, task] } : null));
    }

    if (isRealGoogleSheetSession) {
      setIsLoading(true);
      try {
        await addProjectTask(spreadsheetId, sheetName, task, accessToken!);
        showTemporarySuccess(`เพิ่มแผนงานย่อย "${task.name}" เรียบร้อยแล้ว`);
      } catch (err: any) {
        handleGoogleOperationError(
          err,
          `เพิ่มงานย่อย "${task.name}" ในระบบแล้ว`,
          () => addProjectTask(spreadsheetId, sheetName, task, accessToken!),
          `เพิ่มแผนงานย่อย "${task.name}"`
        );
      } finally {
        setIsLoading(false);
      }
    } else {
      showTemporarySuccess(`เพิ่มแผนงานย่อย "${task.name}" เรียบร้อยแล้ว`);
    }
  };

  const handleUpdateTasks = async (sheetName: string, updatedTasks: Task[]) => {
    if (!checkAdminPermission()) return;
    if (!checkFirebaseConnectionForEdit()) return;
    setProjects((prev) =>
      prev.map((p) => (p.sheetName === sheetName ? { ...p, tasks: updatedTasks } : p))
    );
    if (selectedProject && selectedProject.sheetName === sheetName) {
      setSelectedProject((prev) => (prev ? { ...prev, tasks: updatedTasks } : null));
    }

    if (isRealGoogleSheetSession) {
      setIsLoading(true);
      try {
        await updateProjectTasks(spreadsheetId, sheetName, updatedTasks, accessToken!);
        showTemporarySuccess("บันทึกการปรับปรุงรายการงานย่อยสำเร็จ");
      } catch (err: any) {
        handleGoogleOperationError(
          err,
          "ปรับปรุงรายการงานย่อยในระบบเรียบร้อยแล้ว",
          () => updateProjectTasks(spreadsheetId, sheetName, updatedTasks, accessToken!),
          "ปรับปรุงรายการงานย่อย"
        );
      } finally {
        setIsLoading(false);
      }
    } else {
      showTemporarySuccess("ปรับปรุงรายการงานย่อยเรียบร้อยแล้ว");
    }
  };

  const handleAddUpdate = async (sheetName: string, update: ProgressUpdate) => {
    if (!checkAdminPermission()) return;
    if (!checkFirebaseConnectionForEdit()) return;

    let mergedList: ProgressUpdate[] = [];
    setProjects((prev) =>
      prev.map((p) => {
        if (p.sheetName === sheetName) {
          mergedList = mergeSameDateUpdates([update, ...(p.updates || [])]);
          return { ...p, updates: mergedList };
        }
        return p;
      })
    );
    if (selectedProject && selectedProject.sheetName === sheetName) {
      setSelectedProject((prev) => (prev ? { ...prev, updates: mergedList } : null));
    }

    if (isRealGoogleSheetSession) {
      setIsLoading(true);
      try {
        await updateProjectUpdates(spreadsheetId, sheetName, mergedList, accessToken!);
        showTemporarySuccess("บันทึกรายงานความคืบหน้าหน้างานสำเร็จ");
      } catch (err: any) {
        handleGoogleOperationError(err, "บันทึกความคืบหน้าในระบบเรียบร้อยแล้ว");
      } finally {
        setIsLoading(false);
      }
    } else {
      showTemporarySuccess("บันทึกรายงานความคืบหน้าหน้างานสำเร็จ");
    }
  };

  const handleUpdateUpdates = async (sheetName: string, updatedUpdates: ProgressUpdate[]) => {
    if (!checkAdminPermission()) return;
    if (!checkFirebaseConnectionForEdit()) return;

    const mergedList = mergeSameDateUpdates(updatedUpdates);
    setProjects((prev) =>
      prev.map((p) => (p.sheetName === sheetName ? { ...p, updates: mergedList } : p))
    );
    if (selectedProject && selectedProject.sheetName === sheetName) {
      setSelectedProject((prev) => (prev ? { ...prev, updates: mergedList } : null));
    }

    if (isRealGoogleSheetSession) {
      setIsLoading(true);
      try {
        await updateProjectUpdates(spreadsheetId, sheetName, mergedList, accessToken!);
        showTemporarySuccess("ปรับปรุงรายการบันทึกความคืบหน้าสำเร็จ");
      } catch (err: any) {
        handleGoogleOperationError(err, "ปรับปรุงรายการบันทึกความคืบหน้าในระบบเรียบร้อยแล้ว");
      } finally {
        setIsLoading(false);
      }
    } else {
      showTemporarySuccess("ปรับปรุงรายการบันทึกความคืบหน้าเรียบร้อยแล้ว");
    }
  };

  const handleUpdateDisbursements = async (sheetName: string, updatedDisbursements: DisbursementPeriod[]) => {
    if (!checkAdminPermission()) return;
    if (!checkFirebaseConnectionForEdit()) return;

    // Cache workRound groupings to localStorage immediately for instant persistence
    try {
      const groupMap: Record<string, string> = {};
      updatedDisbursements.forEach((d) => {
        if (d.workRound) {
          groupMap[String(d.periodNo)] = String(d.workRound).trim();
        }
      });
      if (Object.keys(groupMap).length > 0) {
        localStorage.setItem(`disbursement_groups_${sheetName}`, JSON.stringify(groupMap));
      }
      localStorage.setItem(`disbursements_${sheetName}`, JSON.stringify(updatedDisbursements));
    } catch (e) {}

    // Calculate new total disbursed amount for items marked "เบิกจ่ายแล้ว"
    const newDisbursedAmt = updatedDisbursements
      .filter((d) => (d.status || "").trim() === "เบิกจ่ายแล้ว")
      .reduce((sum, d) => sum + (d.amount || 0), 0);

    setProjects((prev) =>
      prev.map((p) => {
        if (p.sheetName !== sheetName) return p;
        const contractVal = p.contractAmount || p.budget || 0;
        const denom = contractVal > 0 ? contractVal : 1;
        const newPct = Math.min(100, Math.round((newDisbursedAmt / denom) * 100));
        const basePeriodic = (p.periodicProgress && p.periodicProgress.length > 0)
          ? p.periodicProgress
          : getDefaultPeriodicProgress(p);
        const updatedPeriodic = syncPeriodicWithDisbursements(basePeriodic, updatedDisbursements, contractVal);

        return {
          ...p,
          disbursements: updatedDisbursements,
          disbursedAmount: newDisbursedAmt,
          disbursedPercent: newPct,
          periodicProgress: updatedPeriodic,
        };
      })
    );

    let latestSyncedPeriodic: PeriodicProgressRecord[] = [];
    let targetProjectForSheet: Project | null = null;

    if (selectedProject && selectedProject.sheetName === sheetName) {
      setSelectedProject((prev) => {
        if (!prev) return null;
        const contractVal = prev.contractAmount || prev.budget || 0;
        const denom = contractVal > 0 ? contractVal : 1;
        const newPct = Math.min(100, Math.round((newDisbursedAmt / denom) * 100));
        const basePeriodic = (prev.periodicProgress && prev.periodicProgress.length > 0)
          ? prev.periodicProgress
          : getDefaultPeriodicProgress(prev);
        const updatedPeriodic = syncPeriodicWithDisbursements(basePeriodic, updatedDisbursements, contractVal);
        latestSyncedPeriodic = updatedPeriodic;
        targetProjectForSheet = prev;
        return {
          ...prev,
          disbursements: updatedDisbursements,
          disbursedAmount: newDisbursedAmt,
          disbursedPercent: newPct,
          periodicProgress: updatedPeriodic,
        };
      });
    }

    try {
      const p = targetProjectForSheet || (selectedProject && selectedProject.sheetName === sheetName ? selectedProject : projects.find((item) => item.sheetName === sheetName));
      if (p) {
        const contractVal = p.contractAmount || p.budget || 0;
        const basePeriodic = (p.periodicProgress && p.periodicProgress.length > 0)
          ? p.periodicProgress
          : getDefaultPeriodicProgress(p);
        const updatedPeriodic = latestSyncedPeriodic.length > 0
          ? latestSyncedPeriodic
          : syncPeriodicWithDisbursements(basePeriodic, updatedDisbursements, contractVal);
        latestSyncedPeriodic = updatedPeriodic;
        targetProjectForSheet = p;
        localStorage.setItem(`periodic_${sheetName}`, JSON.stringify(updatedPeriodic));
      }
    } catch (e) {
      console.error(e);
    }

    if (isRealGoogleSheetSession) {
      setIsLoading(true);
      try {
        await updateProjectDisbursements(spreadsheetId, sheetName, updatedDisbursements, newDisbursedAmt, accessToken!);
        
        if (targetProjectForSheet && latestSyncedPeriodic.length > 0) {
          const currInfo = getCurrentProgressInfo({ ...targetProjectForSheet, periodicProgress: latestSyncedPeriodic });
          await updateProjectPeriodicProgress(
            spreadsheetId,
            sheetName,
            latestSyncedPeriodic,
            currInfo.planPercent,
            currInfo.actualPercent,
            accessToken!,
            getDefaultPeriodicRemarks(targetProjectForSheet)
          );
        }
        showTemporarySuccess("ปรับปรุงรายการเบิกจ่ายและตารางแผนงาน/ผลงานเรียบร้อยแล้ว");
      } catch (err: any) {
        handleGoogleOperationError(err, "ปรับปรุงรายการเบิกจ่ายในระบบเรียบร้อยแล้ว");
      } finally {
        setIsLoading(false);
      }
    } else {
      showTemporarySuccess("ปรับปรุงรายการเบิกจ่ายเรียบร้อยแล้ว");
    }
  };

  const handleUpdatePeriodicProgress = async (
    sheetName: string,
    updatedPeriodic: PeriodicProgressRecord[],
    updatedRemarks?: string[]
  ) => {
    if (!checkFirebaseConnectionForEdit()) return;
    let targetProj: Project | null = null;

    setProjects((prev) =>
      prev.map((p) => {
        if (p.sheetName === sheetName) {
          const tempProj = {
            ...p,
            periodicProgress: updatedPeriodic,
            periodicRemarks: updatedRemarks !== undefined ? updatedRemarks : p.periodicRemarks,
          };
          const currInfo = getCurrentProgressInfo(tempProj);
          const updated = {
            ...p,
            periodicProgress: updatedPeriodic,
            periodicRemarks: updatedRemarks !== undefined ? updatedRemarks : p.periodicRemarks,
            progressPlan: currInfo.planPercent,
            progressField: currInfo.actualPercent,
          };
          targetProj = updated;
          return updated;
        }
        return p;
      })
    );

    if (selectedProject && selectedProject.sheetName === sheetName) {
      setSelectedProject((prev) => {
        if (!prev) return null;
        const tempProj = {
          ...prev,
          periodicProgress: updatedPeriodic,
          periodicRemarks: updatedRemarks !== undefined ? updatedRemarks : prev.periodicRemarks,
        };
        const currInfo = getCurrentProgressInfo(tempProj);
        return {
          ...prev,
          periodicProgress: updatedPeriodic,
          periodicRemarks: updatedRemarks !== undefined ? updatedRemarks : prev.periodicRemarks,
          progressPlan: currInfo.planPercent,
          progressField: currInfo.actualPercent,
        };
      });
    }

    try {
      localStorage.setItem(`periodic_${sheetName}`, JSON.stringify(updatedPeriodic));
      if (updatedRemarks) {
        localStorage.setItem(`periodic_remarks_${sheetName}`, JSON.stringify(updatedRemarks));
      }
    } catch (e) {
      console.error(e);
    }

    if (spreadsheetId && accessToken && !spreadsheetId.startsWith("demo_") && accessToken !== "demo-access-token") {
      try {
        const p = targetProj || projects.find((item) => item.sheetName === sheetName);
        const currInfo = p ? getCurrentProgressInfo({ ...p, periodicProgress: updatedPeriodic }) : { planPercent: 0, actualPercent: 0 };
        await updateProjectPeriodicProgress(
          spreadsheetId,
          sheetName,
          updatedPeriodic,
          currInfo.planPercent,
          currInfo.actualPercent,
          accessToken,
          updatedRemarks || (p ? p.periodicRemarks : undefined)
        );
        showTemporarySuccess("บันทึกตารางแผนงาน/ผลงานและหมายเหตุลง Google Sheet สำเร็จเรียบร้อยแล้ว");
      } catch (err: any) {
        handleGoogleOperationError(err);
        if (!(err instanceof GoogleAuthError || isGoogleAuthError(err))) {
          setError(`บันทึกในระบบแล้ว แต่ไม่สามารถอัปเดตลง Google Sheet ได้: ${err?.message || String(err)}`);
        }
      }
    } else {
      showTemporarySuccess("บันทึกตารางแผนงาน/ผลงานรายครั้งสำเร็จ");
    }
  };

  const handleSaveAllToGoogleSheet = async () => {
    if (!isRealGoogleSheetSession) {
      showTemporarySuccess("บันทึกข้อมูลในระบบเรียบร้อยแล้ว (โหมด Demo) — กำลังนำท่านไปหน้าเข้าสู่ระบบ Firebase เพื่อป้องกันการกรอกข้อมูลใหม่");
      setTimeout(() => {
        setIsConnectModalOpen(true);
      }, 400);
      return;
    }
    if (!checkAdminPermission()) return;

    setIsSavingAll(true);
    setError(null);
    try {
      const projectsToProcess = selectedProject ? [selectedProject] : projects;
      if (projectsToProcess.length === 0) {
        showTemporarySuccess("ไม่พบข้อมูลโครงการสำหรับบันทึก");
        return;
      }

      await batchSaveProjectsToSpreadsheet(spreadsheetId, projectsToProcess, accessToken!);

      showTemporarySuccess(`บันทึกจัดเก็บข้อมูลทั้งหมดลงใน Google Sheet สำเร็จเรียบร้อยแล้ว (${projectsToProcess.length} โครงการ)`);
    } catch (err: any) {
      handleGoogleOperationError(err);
      if (!(err instanceof GoogleAuthError || isGoogleAuthError(err))) {
        setError(`ไม่สามารถบันทึกข้อมูลลง Google Sheet ได้: ${err?.message || String(err)}`);
      }
    } finally {
      setIsSavingAll(false);
    }
  };

  const handleAddDisbursement = async (sheetName: string, period: DisbursementPeriod) => {
    const currentDisbursements = selectedProject?.sheetName === sheetName
      ? selectedProject.disbursements || []
      : projects.find((p) => p.sheetName === sheetName)?.disbursements || [];
    
    const newList = [...currentDisbursements, period];
    await handleUpdateDisbursements(sheetName, newList);
  };

  const handleAddPhoto = async (sheetName: string, photo: ProjectPhoto) => {
    if (!checkAdminPermission()) return;
    if (!checkFirebaseConnectionForEdit()) return;
    setProjects((prev) =>
      prev.map((p) => (p.sheetName === sheetName ? { ...p, photos: [...p.photos, photo] } : p))
    );
    if (selectedProject && selectedProject.sheetName === sheetName) {
      setSelectedProject((prev) => (prev ? { ...prev, photos: [...prev.photos, photo] } : null));
    }

    if (isRealGoogleSheetSession) {
      setIsLoading(true);
      try {
        await addProjectPhoto(spreadsheetId, sheetName, photo, accessToken!);
        showTemporarySuccess("เพิ่มรูปภาพความก้าวหน้าโครงการสำเร็จ");
      } catch (err: any) {
        handleGoogleOperationError(err, "เพิ่มรูปภาพในระบบเรียบร้อยแล้ว");
      } finally {
        setIsLoading(false);
      }
    } else {
      showTemporarySuccess("เพิ่มรูปภาพความก้าวหน้าโครงการสำเร็จ");
    }
  };

  const handleUpdatePhotos = async (sheetName: string, updatedPhotos: ProjectPhoto[]) => {
    if (!checkAdminPermission()) return;
    if (!checkFirebaseConnectionForEdit()) return;
    setProjects((prev) =>
      prev.map((p) => (p.sheetName === sheetName ? { ...p, photos: updatedPhotos } : p))
    );
    if (selectedProject && selectedProject.sheetName === sheetName) {
      setSelectedProject((prev) => (prev ? { ...prev, photos: updatedPhotos } : null));
    }

    if (isRealGoogleSheetSession) {
      setIsLoading(true);
      try {
        await updateProjectPhotos(spreadsheetId, sheetName, updatedPhotos, accessToken!);
        showTemporarySuccess("ปรับปรุงอัลบั้มรูปภาพสำเร็จ");
      } catch (err: any) {
        handleGoogleOperationError(err, "ปรับปรุงรูปภาพในระบบเรียบร้อยแล้ว");
      } finally {
        setIsLoading(false);
      }
    } else {
      showTemporarySuccess("ปรับปรุงอัลบั้มรูปภาพเรียบร้อยแล้ว");
    }
  };

  const handleAddProject = async (project: Project) => {
    if (!isAdmin) {
      handleRequestAdminLogin("เพิ่มโครงการใหม่");
      return;
    }

    checkFirebaseConnectionForEdit();

    setProjects((prev) => {
      const nextProjects = [project, ...prev];
      try {
        localStorage.setItem(`construction_projects_${spreadsheetId}`, JSON.stringify(nextProjects));
      } catch (e) {}
      return nextProjects;
    });

    if (project.fiscalYear) {
      setSelectedYear(project.fiscalYear);
    }
    setSelectedPlan("ทั้งหมด");
    setSelectedProject(project);

    if (isRealGoogleSheetSession) {
      setIsLoading(true);
      setError(null);
      try {
        await createNewProject(spreadsheetId, project, accessToken!);
        showTemporarySuccess(`สร้างแผ่นงาน "${project.projectName}" และเชื่อมระบบดัชนีเรียบร้อยแล้ว`);
      } catch (err: any) {
        handleGoogleOperationError(err, `สร้างโครงการ "${project.projectName}" ในระบบเรียบร้อยแล้ว`);
      } finally {
        setIsLoading(false);
      }
    } else {
      showTemporarySuccess(`สร้างโครงการ "${project.projectName}" เรียบร้อยแล้ว`);
    }
  };

  const handleDeleteProject = async (sheetName: string) => {
    // Only Owner role (userSession?.role === "Owner") can delete projects
    if (!userSession || userSession.role !== "Owner") {
      alert("สิทธิ์ไม่เพียงพอ! เฉพาะผู้ใช้งานบทบาท Owner (เจ้าของระบบ) เท่านั้นที่สามารถกดลบโครงการได้");
      handleRequestAdminLogin("ลบโครงการ (ต้องการสิทธิ์ Owner)");
      return;
    }

    const proj = projects.find((p) => p.sheetName === sheetName);
    if (proj) {
      setProjectToDelete(proj);
    }
  };

  const handleConfirmDeleteProject = async () => {
    if (!projectToDelete) return;
    const sheetName = projectToDelete.sheetName;
    const projName = projectToDelete.projectName || sheetName;

    const nextProjects = projects.filter((p) => p.sheetName !== sheetName);
    setProjects(nextProjects);

    if (selectedProject?.sheetName === sheetName) {
      setSelectedProject(null);
    }

    // Clean up local storage items for this project
    try {
      localStorage.removeItem(`periodic_${sheetName}`);
      localStorage.removeItem(`periodic_remarks_${sheetName}`);
      localStorage.removeItem(`chart_style_${sheetName}`);
      localStorage.removeItem(`table_theme_${sheetName}`);

      const currentSsId = localStorage.getItem("construction_ss_id") || spreadsheetId;
      if (currentSsId) {
        localStorage.setItem(`construction_projects_${currentSsId}`, JSON.stringify(nextProjects));
      }
    } catch (e) {}

    // Call Google Sheets API to delete from remote sheet & _Master_ sheet
    if (spreadsheetId && !spreadsheetId.startsWith("demo_")) {
      try {
        setIsLoading(true);
        await deleteProjectFromSpreadsheet(spreadsheetId, sheetName, accessToken);
      } catch (err) {
        console.error("Error deleting project from Google Sheet:", err);
      } finally {
        setIsLoading(false);
      }
    }

    showTemporarySuccess(`ลบโครงการ "${projName}" ออกจากระบบและ Google Sheets เรียบร้อยแล้ว`);
    setProjectToDelete(null);
  };

  const handleLogoutSession = () => {
    clearUserSession();
    setUserSession(null);
    showTemporarySuccess("ออกจากระบบเรียบร้อยแล้ว");
  };

  const handleRequestLogout = () => {
    setIsLogoutConfirmOpen(true);
  };

  const handleConfirmLogout = async () => {
    setIsLogoutConfirmOpen(false);
    if (userSession) {
      clearUserSession();
      setUserSession(null);
    }
    if (user && user.uid !== "demo-guest-user") {
      await handleLogout();
    }
    showTemporarySuccess("ออกจากระบบเรียบร้อยแล้ว");
  };

  const showTemporarySuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg(null);
    }, 4500);
  };

  // IF NO USER SESSION ACTIVE: RENDER LOGIN SCREEN FIRST
  if (!userSession) {
    return (
      <LoginView
        onLoginSuccess={(session) => {
          setUserSession(session);
          const canEdit = session.role === "Owner" || session.role === "Admin";
          setIsAdmin(canEdit);
          localStorage.setItem("app_is_admin", canEdit ? "true" : "false");

          let targetSsId = localStorage.getItem("construction_ss_id") || spreadsheetId;
          if (session.role !== "Owner" && (!targetSsId || targetSsId.startsWith("demo_") || targetSsId.toLowerCase().includes("demo"))) {
            const currentManaged = getManagedSheets();
            const allowed = currentManaged.filter((s) => isSheetAllowedForUser(s, session));
            if (allowed.length > 0) {
              targetSsId = allowed[0].spreadsheetId;
              setSpreadsheetId(targetSsId);
              localStorage.setItem("construction_ss_id", targetSsId);
            }
          }

          showTemporarySuccess(`เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ ${session.name} — กำลังดึงข้อมูลล่าสุดจาก Google Sheets`);
          if (targetSsId && !targetSsId.startsWith("demo_") && !targetSsId.toLowerCase().includes("demo")) {
            loadSpreadsheetData(targetSsId, false, undefined, true);
          } else {
            handleRefreshData(true);
          }
        }}
        usersList={sheetUsers}
        onRefreshData={() => handleRefreshData(true)}
        isLoadingData={isLoading}
        isSheetConnected={isSheetConnected}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col justify-between">
      {/* Top Banner Header */}
      <Header
        user={user}
        onLogin={handleLogin}
        onLogout={handleRequestLogout}
        userSession={userSession}
        onLogoutSession={handleRequestLogout}
        spreadsheetId={spreadsheetId}
        setSpreadsheetId={setSpreadsheetId}
        onLoadData={loadSpreadsheetData}
        onCreateTemplate={handleCreateTemplate}
        isLoggingIn={isLoggingIn}
        isLoading={isLoading}
        isAdmin={isAdmin}
        onRequestAdminLogin={handleRequestAdminLogin}
        onOpenFirebaseStatus={() => setIsFirebaseStatusOpen(true)}
        onRefreshData={() => handleRefreshData(true)}
        isGoogleTokenExpired={isGoogleTokenExpiredState}
        onReauthenticateGoogle={handleReauthenticateGoogle}
        isReauthenticating={isReauthenticating}
      />

      {/* Main Content Arena */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8">
        
        {/* Success Alert Banner */}
        {successMsg && (
          <div className="mb-6 bg-emerald-500 text-white rounded-2xl p-4 shadow-lg shadow-emerald-500/10 flex items-center gap-3 animate-fade-in">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <span className="text-xs sm:text-sm font-semibold">{successMsg}</span>
          </div>
        )}

        {/* Error Alert Banner */}
        {error && (
          <div className="mb-6 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl p-4 shadow-sm space-y-3 animate-fade-in relative">
            <button
              type="button"
              onClick={() => setError(null)}
              className="absolute top-3 right-3 text-rose-400 hover:text-rose-700 p-1 rounded-lg transition-colors cursor-pointer"
              title="ปิดข้อความแจ้งเตือน"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-3 pr-6">
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-500 mt-0.5" />
              <div className="space-y-1">
                <span className="text-xs sm:text-sm font-bold">แจ้งเตือนการเชื่อมต่อ Google Sheets:</span>
                <p className="text-xs text-rose-700 font-medium leading-relaxed">{error}</p>
                <p className="text-[11px] text-rose-600/90 font-medium">
                  💡 ระบบได้สลับแสดงข้อมูลตัวอย่าง (Demo Projects) ชั่วคราว เพื่อให้คุณสามารถดูรายงาน สถิติ และใช้งานส่วนอื่นๆ ได้โดยไม่สะดุด
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rose-200/60">
              {(isGoogleTokenExpiredState || (error && (error.includes("ต่ออายุสิทธิ์") || error.includes("หมดอายุ")))) && (
                <button
                  type="button"
                  disabled={isReauthenticating}
                  onClick={() => handleReauthenticateGoogle()}
                  className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-60"
                  title="ต่ออายุสิทธิ์ Google Sheets ด้วยคลิกเดียวโดยไม่ต้องเลือกบัญชีใหม่"
                >
                  {isReauthenticating ? (
                    <>
                      <RotateCw className="h-3.5 w-3.5 animate-spin" />
                      <span>กำลังต่ออายุสิทธิ์...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-3.5 w-3.5 fill-white" />
                      <span>⚡ ต่ออายุสิทธิ์ Google ทันที (กดแค่ครั้งเดียว)</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={handleEnableDemoMode}
                className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                <span>สลับใช้โหมดทดลองระบบ (Demo Mode)</span>
              </button>
              <button
                type="button"
                onClick={() => setIsConnectModalOpen(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                เปลี่ยนหรือเชื่อมต่อลิงก์ Google Sheet ใหม่
              </button>
            </div>
          </div>
        )}

        {!spreadsheetId ? (
          /* LOGGED IN BUT NO SPREADSHEET LOADED */
          <div className="py-16 max-w-3xl mx-auto space-y-8 animate-fade-in text-center">
            <div className="space-y-2">
              <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest font-mono">
                WELCOME
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800">
                ยินดีต้อนรับ! เลือกวิธีการเริ่มใช้งานกระดานข้อมูลโครงการ
              </h2>
              <p className="text-sm text-slate-400 max-w-lg mx-auto">
                กรุณาระบุไฟล์รายงานของคุณ หรือเลือกสร้างไฟล์ใหม่พร้อมตัวอย่างเพื่อเริ่มใช้งานระบบได้ทันที
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left pt-4">
              {/* Card 1: Paste ID */}
              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="bg-indigo-50 p-3 rounded-xl w-fit">
                    <FileText className="h-6 w-6 text-indigo-500" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">วางลิงก์ Google Sheet ที่มีอยู่</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    หากคุณมีตารางงานก่อสร้างเดิมที่เป็นโครงสร้างแผ่นงาน _Master_ อยู่แล้ว
                    สามารถคัดลอก URL หรือ ID มาใส่ผ่านปุ่ม "เชื่อมต่อไฟล์ Google Sheet"
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConnectModalOpen(true)}
                  className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2.5 font-bold text-xs text-center cursor-pointer transition-colors w-full"
                >
                  เชื่อมต่อไฟล์ Google Sheet
                </button>
              </div>

              {/* Card 2: Create Template / Demo */}
              <div className="bg-white border border-emerald-100 rounded-2xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="bg-emerald-50 p-3 rounded-xl w-fit">
                    <FileSpreadsheet className="h-6 w-6 text-emerald-500" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">เริ่มใช้งานด้วยข้อมูลตัวอย่าง (Demo Mode)</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    ทดลองใช้งานกระดานข้อมูลพร้อมตัวอย่าง 15 โครงการก่อสร้างครบถ้วน บันทึกข้อมูลได้ทันทีโดยไม่ต้องตั้งค่าเพิ่มเติม
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleEnableDemoMode}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 font-bold text-xs text-center cursor-pointer transition-colors w-full flex items-center justify-center gap-2"
                >
                  <PlayCircle className="h-4 w-4" />
                  <span>เริ่มใช้งานโหมดทดลองทันที ✨</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* MAIN APPLICATION CORE */
          <div className="space-y-4">
            
            {/* Unified System & Data Connection Console */}
            {(() => {
              const isDemoUser = !user || user.uid === "demo-guest-user";
              return (
                <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden font-['Sarabun',sans-serif] transition-all divide-y divide-slate-100 dark:divide-slate-800">
                  
                  {/* TIER 1: แถบสถานะการเชื่อมโยงระบบ Firebase */}
                  <div className={`px-3.5 sm:px-5 py-2.5 sm:py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs transition-colors ${
                    isDemoUser ? "bg-amber-50/50 dark:bg-amber-950/20" : "bg-slate-50/80 dark:bg-slate-800/40"
                  }`}>
                    {/* Left: Section Label & Detailed Live Status */}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100 shrink-0">
                        <div className={`p-1 rounded-md ${isDemoUser ? "bg-amber-100 dark:bg-amber-900/60" : "bg-emerald-100 dark:bg-emerald-900/60"}`}>
                          <Flame className={`h-4 w-4 ${isDemoUser ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"} shrink-0 ${isDemoUser ? "" : "animate-pulse"}`} />
                        </div>
                        <span className="text-[13px] tracking-tight">สถานะการเชื่อมโยงระบบ Firebase:</span>
                      </div>

                      {/* Clickable Status Badge with Pulsing Live Dot - Clicking opens system check & diagnostics */}
                      <button
                        type="button"
                        onClick={() => setIsFirebaseStatusOpen(true)}
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-medium border shadow-2xs transition-all cursor-pointer hover:shadow-xs active:scale-95 ${
                          isDemoUser
                            ? "bg-white hover:bg-amber-50 text-amber-900 border-amber-300 dark:bg-slate-800 dark:hover:bg-slate-700/80 dark:text-amber-300 dark:border-amber-700/60"
                            : "bg-white hover:bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-slate-800 dark:hover:bg-slate-700/80 dark:text-emerald-300 dark:border-emerald-700/60"
                        }`}
                        title="คลิกเพื่อตรวจเช็คระบบและดูสถานะการเชื่อมต่อ Firebase"
                      >
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                            isDemoUser ? "bg-amber-400" : "bg-emerald-400"
                          }`}></span>
                          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                            isDemoUser ? "bg-amber-500" : "bg-emerald-500"
                          }`}></span>
                        </span>
                        <span className="font-semibold">
                          {isDemoUser ? "ออฟไลน์ (โหมดจำลอง)" : "ออนไลน์ตลอดเวลา"}
                        </span>
                        {user && user.uid !== "demo-guest-user" ? (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono hidden sm:inline max-w-[160px] lg:max-w-[240px] truncate" title={user.email || ""}>
                            • {user.email}
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-700 dark:text-amber-400 font-normal hidden sm:inline">• โหมด Demo</span>
                        )}
                        <span className={`text-[10.5px] font-medium underline decoration-dotted ml-0.5 ${
                          isDemoUser ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"
                        }`}>
                          (ตรวจเช็คระบบ)
                        </span>
                      </button>
                    </div>

                    {/* Right: Actions (1-Click Re-Auth or Connect if demo) */}
                    {(isGoogleTokenExpiredState || isDemoUser) && (
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap shrink-0">
                        {/* 1-Click Fast Re-Auth if expired */}
                        {isGoogleTokenExpiredState && !isDemoUser && (
                          <button
                            type="button"
                            onClick={() => handleReauthenticateGoogle()}
                            disabled={isReauthenticating}
                            className="inline-flex items-center gap-1.5 text-white font-bold px-2.5 py-1 rounded-lg text-xs cursor-pointer shadow-xs bg-amber-500 hover:bg-amber-600 active:bg-amber-700 animate-pulse disabled:opacity-50 shrink-0"
                            title="ต่ออายุสิทธิ์ Google Sheets ด้วยคลิกเดียว"
                          >
                            <Zap className="h-3.5 w-3.5 fill-white shrink-0" />
                            <span>{isReauthenticating ? "กำลังต่อสิทธิ์..." : "⚡ ต่ออายุสิทธิ์ Google"}</span>
                          </button>
                        )}

                        {/* Connect Firebase (ONLY if in demo mode / not yet connected) */}
                        {isDemoUser && (
                          <button
                            type="button"
                            onClick={handleLogin}
                            disabled={isLoggingIn}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs transition-all disabled:opacity-50 active:scale-95 border bg-amber-600 hover:bg-amber-700 text-white border-amber-700 shadow-amber-600/20 shrink-0"
                            title="เชื่อมต่อและลงชื่อเข้าใช้ด้วยบัญชี Google / Firebase (สามารถเลือกบัญชีที่ต้องการได้)"
                          >
                            <LogIn className="h-3.5 w-3.5 shrink-0" />
                            <span>{isLoggingIn ? "กำลังเชื่อมต่อ..." : "เชื่อมต่อบัญชี Firebase"}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* TIER 2: แถบกำลังเชื่อมโยงกับ Google Sheet */}
                  <div className="px-3.5 sm:px-5 py-2.5 sm:py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs bg-white dark:bg-slate-900">
                    {/* Left: Section Label, Badges & Sheet Identifiers */}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 min-w-0">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100 shrink-0">
                        <div className="p-1 rounded-md bg-emerald-100 dark:bg-emerald-900/60">
                          <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        </div>
                        <span className="text-[13px] tracking-tight">กำลังเชื่อมโยงกับ Google Sheet:</span>
                      </div>

                      {/* Department Badge */}
                      {currentSheetDepartment && (
                        <span className="bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 font-semibold px-2.5 py-0.5 rounded-md text-[11px] border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 shadow-2xs">
                          <span className="text-slate-500 dark:text-slate-400 font-normal">ฝ่าย:</span>
                          <strong>{currentSheetDepartment}</strong>
                        </span>
                      )}

                      {/* User Permission Badge */}
                      {userSession?.role === "Owner" ? (
                        <span className="bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 font-semibold px-2.5 py-0.5 rounded-md text-[11px] border border-amber-200 dark:border-amber-800 flex items-center gap-1 shadow-2xs">
                          <span>👑 สิทธิ์ Owner (แก้ไขได้ทุกฝ่าย)</span>
                        </span>
                      ) : userSession ? (
                        <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-md border flex items-center gap-1 shadow-2xs ${
                          canEditCurrentDepartment
                            ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                            : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                        }`}>
                          {canEditCurrentDepartment ? "✏️ สิทธิ์แก้ไข" : "👁️ ดูอย่างเดียว"}
                        </span>
                      ) : (
                        <span className="bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 font-semibold px-2.5 py-0.5 rounded-md text-[11px] border flex items-center gap-1 shadow-2xs">
                          <span>👁️ ดูอย่างเดียว</span>
                        </span>
                      )}

                      {/* Masked Spreadsheet ID Tag */}
                      <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 rounded-md shadow-2xs" title={`Spreadsheet ID: ${spreadsheetId}`}>
                        ID: {userSession?.role === "Owner" ? `${spreadsheetId.substring(0, 8)}...${spreadsheetId.substring(Math.max(0, spreadsheetId.length - 8))}` : maskSpreadsheetId(spreadsheetId)}
                      </span>
                    </div>

                    {/* Right: Data Operations Toolbar */}
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap shrink-0">
                      {/* Refresh Data Button */}
                      <button
                        type="button"
                        onClick={() => handleRefreshData(true)}
                        disabled={isLoading}
                        className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold px-3 py-1 rounded-lg text-xs cursor-pointer shadow-2xs transition-all disabled:opacity-50 shrink-0"
                        title="กดเพื่อดึงข้อมูลล่าสุดจาก Google Sheets มาอัปเดตบนหน้าจอทันที"
                      >
                        <RotateCw className={`h-3 w-3 shrink-0 ${isLoading ? "animate-spin" : ""}`} />
                        <span>{isLoading ? "กำลังโหลด..." : "รีเฟรชข้อมูล"}</span>
                      </button>

                      {/* Save All to Google Sheet Button */}
                      <button
                        type="button"
                        onClick={handleSaveAllToGoogleSheet}
                        disabled={isSavingAll || isLoading}
                        className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-semibold px-3 py-1 rounded-lg text-xs cursor-pointer shadow-2xs transition-all disabled:opacity-50 shrink-0"
                        title="บันทึกจัดเก็บข้อมูลโครงการทั้งหมดไปยัง Google Sheets"
                      >
                        <Save className={`h-3 w-3 shrink-0 ${isSavingAll ? "animate-spin" : ""}`} />
                        <span>{isSavingAll ? "กำลังบันทึก..." : "บันทึกข้อมูล"}</span>
                      </button>

                      {/* Open Google Sheet Link (Owner & real sheet) */}
                      {userSession?.role === "Owner" && !spreadsheetId.startsWith("demo_") && (
                        <a
                          href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer transition-colors shrink-0 shadow-2xs"
                          title="เปิดไฟล์ Google Sheet ต้นฉบับในแท็บใหม่"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          <span>เปิดไฟล์ ↗</span>
                        </a>
                      )}

                      {/* Create Sample Sheet Template (Owner & demo) */}
                      {userSession?.role === "Owner" && (spreadsheetId.startsWith("demo_") || !spreadsheetId) && (
                        <button
                          type="button"
                          onClick={handleCreateTemplate}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1 bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors shrink-0 disabled:opacity-50 shadow-2xs"
                          title="สร้างไฟล์ Google Sheet ตัวอย่างบน Google Drive"
                        >
                          <PlusCircle className="h-3 w-3 shrink-0" />
                          <span>{isLoading ? "กำลังสร้าง..." : "สร้างชีตบน Drive"}</span>
                        </button>
                      )}

                      {/* Change File Modal Trigger */}
                      <button
                        type="button"
                        onClick={() => setIsConnectModalOpen(true)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0 shadow-2xs"
                        title="เปลี่ยนหรือเลือกไฟล์ Google Sheet อื่น"
                      >
                        <FolderOpen className="h-3 w-3 shrink-0" />
                        <span>เปลี่ยนไฟล์</span>
                      </button>
                    </div>
                  </div>

                </div>
              );
            })()}

            {/* Department Access Protection Shield for Restricted Users */}
            {userSession && userSession.role !== "Owner" && !isCurrentSheetAllowed ? (
              <div className="bg-white border border-rose-200 rounded-3xl p-8 shadow-sm text-center space-y-5 max-w-xl mx-auto my-8 animate-fade-in">
                <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100 shadow-sm">
                  <ShieldAlert className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-900">
                    จำกัดการเข้าถึง: ไม่มีสิทธิ์ดูข้อมูลของฝ่าย "{currentSheetDepartment}"
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    บัญชีผู้ใช้ <strong className="text-slate-800">{userSession?.name || userSession?.username}</strong> ถูกกำหนดสิทธิ์ให้เข้าถึงเฉพาะฝ่าย:{" "}
                    <span className="inline-block font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded border border-rose-200">
                      {userSession?.allowedDepartments && userSession.allowedDepartments.length > 0
                        ? userSession.allowedDepartments.join(", ")
                        : userSession?.department || "ไม่ระบุ"}
                    </span>
                  </p>
                </div>

                <div className="pt-2 flex flex-wrap gap-2.5 justify-center">
                  <button
                    type="button"
                    onClick={() => setIsConnectModalOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition-colors cursor-pointer"
                  >
                    เลือกเปิดไฟล์ Google Sheet ของฝ่ายคุณ
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRequestAdminLogin()}
                    className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
                  >
                    สลับบัญชีผู้ใช้ (Login)
                  </button>
                </div>
              </div>
            ) : (
              <>
            {/* Empty Projects / Connection Diagnostic Recovery Box */}
            {projects.length === 0 && !isLoading && (
              <div className="bg-white border border-amber-200 rounded-2xl p-6 shadow-sm space-y-4 animate-fade-in">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-800">
                      ไม่พบรายการโครงการใน Google Sheet นี้ (ID: {userSession?.role === "Owner" ? spreadsheetId : maskSpreadsheetId(spreadsheetId)})
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      หากนี่เป็นไฟล์ใหม่ของคุณ หรือเป็นไฟล์ Google Sheet ที่เพิ่งเชื่อมต่อ กรุณาตรวจสอบสิทธิ์การแชร์ไฟล์ หรือสลับใช้งานข้อมูลตัวอย่างด้านล่าง
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  {userSession?.role === "Owner" ? (
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 px-3 rounded-xl text-center cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                    >
                      <span>1. เปิดไฟล์ใน Drive เพื่อตั้งสิทธิ์ 'ทุกคนที่มีลิงก์อ่านได้' ↗</span>
                    </a>
                  ) : (
                    <div className="bg-slate-100 text-slate-600 text-xs font-semibold py-2.5 px-3 rounded-xl text-center flex items-center justify-center">
                      <span>1. ตรวจสอบสิทธิ์ไฟล์ Google Sheets กับผู้ดูแลระบบ</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRefreshData(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-3 rounded-xl text-center cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    <span>2. ลองดึงข้อมูลใหม่อีกครั้ง</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleEnableDemoMode}
                    className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2.5 px-3 rounded-xl text-center cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                  >
                    <PlayCircle className="h-3.5 w-3.5" />
                    <span>3. สลับใช้ข้อมูลตัวอย่าง (Demo Mode)</span>
                  </button>
                </div>

                {userSession?.role === "Owner" && (
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-amber-100">
                    <span className="text-xs font-semibold text-slate-600">การดำเนินการสำหรับ Owner:</span>
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-3.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>+ เพิ่มโครงการแรกในไฟล์นี้</span>
                    </button>
                    {accessToken && (
                      <button
                        type="button"
                        onClick={handleCreateTemplate}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-3.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>สร้างเทมเพลตและข้อมูลเริ่มต้น</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedProject ? (
              /* SCREEN 2: PROJECT DETAILS VIEW */
              <ProjectDetail
                project={selectedProject}
                onBack={() => setSelectedProject(null)}
                onUpdateMetadata={handleUpdateProjectMetadata}
                onAddTask={handleAddTask}
                onUpdateTasks={handleUpdateTasks}
                onAddUpdate={handleAddUpdate}
                onAddDisbursement={handleAddDisbursement}
                onUpdateDisbursements={handleUpdateDisbursements}
                onAddPhoto={handleAddPhoto}
                onUpdatePhotos={handleUpdatePhotos}
                onUpdateUpdates={handleUpdateUpdates}
                onUpdatePeriodicProgress={handleUpdatePeriodicProgress}
                onDeleteProject={handleDeleteProject}
                isLoading={isLoading}
                isAdmin={isAdmin}
                onRequestAdminLogin={handleRequestAdminLogin}
                onCheckFirebaseConnection={checkFirebaseConnectionForEdit}
              />
            ) : (
              /* SCREEN 1: PLAN DASHBOARD AND LIST */
              <DashboardOverview
                projects={projects}
                selectedYear={selectedYear}
                setSelectedYear={handleSelectYear}
                selectedPlan={selectedPlan}
                setSelectedPlan={handleSelectPlan}
                onSelectProject={handleSelectProject}
                onAddProjectClick={() => {
                  if (userSession && userSession.role !== "Owner" && !canEditCurrentDepartment) {
                    alert(`การทำงานถูกปฏิเสธ: คุณได้รับสิทธิ์ดูข้อมูลอย่างเดียวสำหรับฝ่าย "${currentSheetDepartment}" ไม่สามารถเพิ่มโครงการได้`);
                    return;
                  }
                  setIsAddModalOpen(true);
                }}
                onDeleteProject={handleDeleteProject}
                isAdmin={isAdmin}
                userRole={userSession?.role || (isAdmin ? "Admin" : "User")}
                onRequestAdminLogin={handleRequestAdminLogin}
                onUpdateProject={handleUpdateProjectMetadata}
              />
            )}
            </>
            )}
          </div>
        )}
      </main>

      {/* Device Viewport presentation guidance bar */}
      <footer className="bg-white border-t border-slate-100 py-6 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="font-medium text-center sm:text-left">
            ออกแบบโครงสร้างและข้อมูลอ้างอิงตรงกับระบบจัดซื้อจัดจ้างภาครัฐ พ.ศ. 2569 - 2570
          </p>
          <div className="flex items-center gap-4 font-semibold text-slate-500">
            <span className="flex items-center gap-1">
              <Monitor className="h-3.5 w-3.5 text-indigo-500" />
              <span>รองรับการนำเสนอจอคอมพิวเตอร์ (Full HD)</span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Smartphone className="h-3.5 w-3.5 text-emerald-500" />
              <span>รองรับดูผ่านสมาร์ทโฟน</span>
            </span>
          </div>
        </div>
      </footer>

      {/* Add Project Modal Popup overlay */}
      <AddProjectModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        defaultYear={selectedYear}
        defaultPlan={selectedPlan === "ALL_PLANS" ? "" : selectedPlan}
        existingSheetNames={projects.map((p) => p.sheetName)}
        onAddProject={handleAddProject}
        isLoading={isLoading}
      />

      {/* Connect Sheet Modal */}
      <ConnectSheetModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        user={user}
        onLogin={handleLogin}
        onLogoutSession={handleRequestLogout}
        spreadsheetId={spreadsheetId}
        setSpreadsheetId={setSpreadsheetId}
        onLoadData={(id, forceRefresh) => loadSpreadsheetData(id, false, undefined, forceRefresh !== false)}
        onCreateTemplate={handleCreateTemplate}
        isLoading={isLoading}
        isLoggingIn={isLoggingIn}
        userRole={userSession?.role}
        userSession={userSession}
      />

      {/* Firebase Warning Modal */}
      <FirebaseWarningModal
        isOpen={isFirebaseWarningModalOpen}
        onClose={() => setIsFirebaseWarningModalOpen(false)}
        onLogin={handleLogin}
        onLogout={handleRequestLogout}
        isLoggingIn={isLoggingIn}
      />

      {/* Admin Authentication & Password Encryption Modal */}
      <AdminAuthModal
        isOpen={adminAuthModal.isOpen}
        onClose={() => setAdminAuthModal({ isOpen: false })}
        isAdmin={isAdmin}
        userSession={userSession}
        onLoginSuccess={handleLoginAdminSuccess}
        onLogoutAdmin={handleLogoutAdmin}
        spreadsheetId={spreadsheetId}
        accessToken={accessToken}
        sheetUsers={sheetUsers}
        onSelectSpreadsheet={(id) => {
          setSpreadsheetId(id);
          loadSpreadsheetData(id, false);
        }}
        onUserSessionChanged={(session) => {
          setUserSession(session);
          if (session) {
            const canEdit = session.role === "Owner" || session.role === "Admin";
            setIsAdmin(canEdit);
            localStorage.setItem("app_is_admin", canEdit ? "true" : "false");
            const currentSsId = localStorage.getItem("construction_ss_id") || spreadsheetId;
            if (currentSsId) {
              loadSpreadsheetData(currentSsId, true);
            }
          } else {
            setIsAdmin(false);
            localStorage.setItem("app_is_admin", "false");
          }
        }}
        targetActionName={adminAuthModal.targetActionName}
        onUsersUpdated={() => {
          setSheetUsers(getUsersList());
        }}
      />

      {/* Delete Project Confirmation Popup Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[60] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150 text-slate-900">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base sm:text-lg">ยืนยันการลบโครงการ</h3>
                <p className="text-xs text-slate-500">การลบโครงการจะมีผลถาวรและไม่สามารถกู้คืนข้อมูลได้</p>
              </div>
            </div>

            <div className="bg-rose-50/60 border border-rose-100 rounded-xl p-3.5 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between items-start gap-2">
                <span className="text-slate-500 shrink-0">ชื่อโครงการ:</span>
                <span className="font-bold text-slate-900 text-right">{projectToDelete.projectName}</span>
              </div>
              {projectToDelete.contractor && (
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-500 shrink-0">ผู้รับจ้าง:</span>
                  <span className="font-medium text-slate-800 text-right truncate max-w-[200px]">{projectToDelete.contractor}</span>
                </div>
              )}
              {projectToDelete.budgetAmount && (
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-500 shrink-0">งบประมาณ:</span>
                  <span className="font-semibold text-emerald-700 font-mono text-right">
                    {Number(projectToDelete.budgetAmount).toLocaleString("th-TH")} บาท
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              คุณแน่ใจหรือไม่ว่าต้องการลบโครงการ <strong className="text-rose-600">"{projectToDelete.projectName}"</strong> ออกจากระบบ?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteProject}
                className="px-4.5 py-2 text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl transition-colors cursor-pointer shadow-md flex items-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                <span>ยืนยันลบโครงการ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Popup Modal */}
      {isLogoutConfirmOpen && (
        <div 
          id="logout-confirm-overlay"
          onClick={() => setIsLogoutConfirmOpen(false)}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[70] flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div 
            id="logout-confirm-dialog"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-sm w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150 text-slate-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-dialog-title"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl shrink-0">
                <LogOut className="h-6 w-6" />
              </div>
              <div>
                <h3 id="logout-dialog-title" className="font-bold text-slate-900 text-base sm:text-lg">
                  ยืนยันการออกจากระบบ
                </h3>
                <p className="text-xs text-slate-500">ระบบบริหารโครงการก่อสร้าง</p>
              </div>
            </div>

            <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between items-center text-slate-600">
                <span className="shrink-0">ผู้ใช้งานปัจจุบัน:</span>
                <span className="font-bold text-slate-900 truncate max-w-[180px]">
                  {userSession?.name || userSession?.username || user?.displayName || "ผู้ใช้ระบบ"}
                </span>
              </div>
              {userSession?.role && (
                <div className="flex justify-between items-center text-slate-600">
                  <span className="shrink-0">สถานะสิทธิ์:</span>
                  <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                    userSession.role === "Owner"
                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                      : userSession.role === "Admin"
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      : "bg-sky-100 text-sky-800 border border-sky-200"
                  }`}>
                    {userSession.role === "Owner" ? "👑 Owner" : userSession.role === "Admin" ? "🛡️ Admin" : "👤 User"}
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบ? เมื่อออกจากระบบแล้ว คุณจะต้องเข้าสู่ระบบใหม่เพื่อดูข้อมูลและจัดการโครงการ
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                id="btn-cancel-logout"
                type="button"
                onClick={() => setIsLogoutConfirmOpen(false)}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                id="btn-confirm-logout"
                type="button"
                onClick={handleConfirmLogout}
                className="px-4.5 py-2 text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl transition-colors cursor-pointer shadow-md shadow-rose-600/20 flex items-center gap-1.5 active:scale-95"
              >
                <LogOut className="h-4 w-4" />
                <span>ยืนยันออกจากระบบ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Firebase App Connection Real-time Status Modal */}
      <FirebaseStatusModal
        isOpen={isFirebaseStatusOpen}
        onClose={() => setIsFirebaseStatusOpen(false)}
        user={user}
        onLogin={handleLogin}
        onLogoutSession={handleRequestLogout}
        onFirebaseSignOut={handleLogout}
        isLoggingIn={isLoggingIn}
      />

      {/* Google Auth Expired Modal */}
      <GoogleAuthExpiredModal
        isOpen={isAuthExpiredModalOpen}
        onClose={() => setIsAuthExpiredModalOpen(false)}
        onReauthenticate={handleReauthenticateGoogle}
        isReauthenticating={isReauthenticating}
        userEmail={user?.email || getStoredUserEmail() || undefined}
        pendingActionName={pendingActionName}
      />
    </div>
  );
}
