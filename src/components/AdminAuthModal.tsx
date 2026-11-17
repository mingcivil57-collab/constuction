import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  KeyRound,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  User as UserIcon,
  Shield,
  Users,
  UserPlus,
  Trash2,
  Check,
  Edit2,
  UserCheck,
  UserX,
  LogOut,
  Crown,
  FileSpreadsheet,
  Plus,
  Copy,
  ExternalLink,
  FolderCheck,
  Cloud,
  ShieldAlert,
  Building2,
  Settings,
} from "lucide-react";
import {
  verifyAdminPassword,
  changeAdminPassword,
  resetAdminPasswordToDefault,
  DEFAULT_ADMIN_PASSWORD,
} from "../lib/security";
import {
  AppUser,
  UserSession,
  getUsersList,
  saveUsersList,
  addUserAccount,
  updateUserAccount,
  deleteUserAccount,
  saveUserSession,
  getUserSession,
  clearUserSession,
  authenticateUserFromList,
  SESSION_KEY,
} from "../lib/userAuth";
import {
  syncUsersToSpreadsheet,
  syncManagedSheetsToSpreadsheet,
  fetchManagedSheetsFromSpreadsheet,
} from "../lib/googleSheets";
import {
  ManagedSheet,
  getManagedSheets,
  saveManagedSheets,
  syncAndMergeRemoteManagedSheets,
  addManagedSheet,
  updateManagedSheet,
  deleteManagedSheet,
  getSheetDepartment,
} from "../lib/managedSheets";
import {
  DepartmentOption,
  getDepartmentOptions,
  addDepartment as createDepartmentRecord,
  updateDepartment,
  deleteDepartment,
  resetDepartmentsToDefault,
} from "../lib/departmentManager";
import DepartmentManagerModal, { DepartmentManagementContent } from "./DepartmentManagerModal";

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  userSession?: UserSession | null;
  onLoginSuccess: () => void;
  onLogoutAdmin: () => void;
  targetActionName?: string;
  onUsersUpdated?: () => void;
  onUserSessionChanged?: (session: UserSession | null) => void;
  spreadsheetId?: string;
  accessToken?: string | null;
  sheetUsers?: AppUser[];
  onSelectSpreadsheet?: (id: string) => void;
}

export default function AdminAuthModal({
  isOpen,
  onClose,
  isAdmin,
  userSession,
  onLoginSuccess,
  onLogoutAdmin,
  targetActionName,
  onUsersUpdated,
  onUserSessionChanged,
  spreadsheetId,
  accessToken,
  sheetUsers,
  onSelectSpreadsheet,
}: AdminAuthModalProps) {
  const [activeTab, setActiveTab] = useState<"login" | "change_password" | "manage_users" | "manage_files" | "manage_departments">("login");
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>(() => getDepartmentOptions());
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  
  // Managed Sheets state
  const [managedSheets, setManagedSheets] = useState<ManagedSheet[]>([]);
  const [newSheetName, setNewSheetName] = useState("");
  const [newSheetUrlOrId, setNewSheetUrlOrId] = useState("");
  const [newSheetNotes, setNewSheetNotes] = useState("");
  const [newSheetDepartment, setNewSheetDepartment] = useState<string>("สบ.4");
  const [newCustomSheetDept, setNewCustomSheetDept] = useState("");

  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [deletingSheetId, setDeletingSheetId] = useState<string | null>(null);
  const [editSheetName, setEditSheetName] = useState("");
  const [editSheetUrlOrId, setEditSheetUrlOrId] = useState("");
  const [editSheetNotes, setEditSheetNotes] = useState("");
  const [editSheetDepartment, setEditSheetDepartment] = useState<string>("สบ.4");
  const [editCustomSheetDept, setEditCustomSheetDept] = useState("");

  const [copiedSheetId, setCopiedSheetId] = useState<string | null>(null);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);

  const refreshManagedSheetsList = (): ManagedSheet[] => {
    const list = getManagedSheets();
    setManagedSheets(list);
    return list;
  };

  const triggerSyncSheetsToGoogleSheets = async (listToSync?: ManagedSheet[]) => {
    const list = listToSync || getManagedSheets();
    if (!spreadsheetId || !accessToken || accessToken === "demo-access-token") {
      return;
    }
    setIsSyncingSheets(true);
    try {
      await syncManagedSheetsToSpreadsheet(spreadsheetId, accessToken, list);
      console.log("Successfully synced ManagedSheets to Google Sheet");
    } catch (err: any) {
      console.error("Failed to sync ManagedSheets to Google Sheet:", err);
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const triggerFetchSheetsFromGoogleSheets = async () => {
    if (!spreadsheetId || !accessToken || accessToken === "demo-access-token") {
      return;
    }
    setIsSyncingSheets(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const remoteSheets = await fetchManagedSheetsFromSpreadsheet(spreadsheetId, accessToken);
      const merged = syncAndMergeRemoteManagedSheets(remoteSheets || []);
      setManagedSheets(merged);
      
      // Also push merged list to remote sheet to ensure Google Sheet tab ManagedSheets has all files
      await syncManagedSheetsToSpreadsheet(spreadsheetId, accessToken, merged);
      setSuccessMsg(`ดึงและซิงค์ข้อมูลรายการไฟล์ (${merged.length} รายการ) สำเร็จ!`);
    } catch (err: any) {
      console.error("Failed to fetch ManagedSheets from Google Sheet:", err);
      setErrorMsg("ไม่สามารถดึง/ซิงค์รายการไฟล์จาก Google Sheet ได้: " + (err.message || ""));
    } finally {
      setIsSyncingSheets(false);
    }
  };
  
  const [isSavingOnClose, setIsSavingOnClose] = useState(false);

  const handleCloseWithSave = async () => {
    if (spreadsheetId && accessToken && accessToken !== "demo-access-token") {
      setIsSavingOnClose(true);
      try {
        const usersList = getUsersList();
        const sheetsList = getManagedSheets();
        const savePromises: Promise<any>[] = [
          syncManagedSheetsToSpreadsheet(spreadsheetId, accessToken, sheetsList),
        ];
        // In Google Sheet, only Owner is permitted to save data to the Users tab
        if (isOwner) {
          savePromises.push(syncUsersToSpreadsheet(spreadsheetId, accessToken, usersList));
        }
        await Promise.allSettled(savePromises);
      } catch (e) {
        console.warn("Auto save on close error:", e);
      } finally {
        setIsSavingOnClose(false);
      }
    }
    onClose();
  };

  // Account login fields
  const [loginUsername, setLoginUsername] = useState("owner");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Master password login field
  const [masterPassword, setMasterPassword] = useState("");
  const [showMasterPassword, setShowMasterPassword] = useState(false);
  const [loginType, setLoginType] = useState<"account" | "master">("account");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);

  // Change password fields
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  // User Management fields
  const [users, setUsers] = useState<AppUser[]>([]);
  const [addUsername, setAddUsername] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addName, setAddName] = useState("");
  const [addRole, setAddRole] = useState<"Owner" | "Admin" | "User">("User");
  const [addStatus, setAddStatus] = useState<"Active" | "Inactive">("Active");
  const [addDepartment, setAddDepartment] = useState<string>("ทุกฝ่าย (*)");
  const [addCustomDept, setAddCustomDept] = useState("");
  const [addPermissionLevel, setAddPermissionLevel] = useState<"view" | "edit">("view");

  // Determine permissions
  const isOwner = userSession?.role === "Owner";
  // In Google Sheet, only Owner is permitted to save and modify the Users tab
  const canManageUsers = isOwner;
  // Admin and Owner can manage and save other tabs normally
  const canManageFiles = isOwner || userSession?.role === "Admin" || (!userSession && isAdmin);

  // Editing existing user
  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [editPass, setEditPass] = useState("");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<"Owner" | "Admin" | "User">("User");
  const [editDepartment, setEditDepartment] = useState<string>("ทุกฝ่าย (*)");
  const [editCustomDept, setEditCustomDept] = useState("");
  const [editPermissionLevel, setEditPermissionLevel] = useState<"view" | "edit">("view");

  // Confirmation modal state for user deletion
  const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);
  const [showLogoutConfirmModal, setShowLogoutConfirmModal] = useState(false);

  const refreshUsersList = (): AppUser[] => {
    const localList = getUsersList();
    setUsers(localList);
    return localList;
  };

  const handleSyncToGoogleSheet = async (listToSync?: AppUser[]) => {
    if (!isOwner) {
      setErrorMsg("สิทธิ์ไม่เพียงพอ: ในแท็บ Users ของ Google Sheet อนุญาตให้เฉพาะบทบาท 👑 Owner (เจ้าของระบบ) เท่านั้นที่สามารถบันทึกข้อมูลได้ ส่วนแท็บอื่นๆ Admin สามารถบันทึกได้ตามปกติ");
      return;
    }
    const targetList = listToSync || (users.length > 0 ? users : getUsersList());
    if (!spreadsheetId || spreadsheetId.startsWith("demo_") || !accessToken || accessToken === "demo-access-token") {
      return;
    }

    setIsSyncingSheet(true);
    try {
      await syncUsersToSpreadsheet(spreadsheetId, accessToken, targetList);
      setSuccessMsg("ซิงค์บันทึกรายชื่อผู้ใช้งานลงใน Google Sheet (แท็บ Users) เรียบร้อยแล้ว!");
    } catch (err: any) {
      console.warn("Failed to sync users to Google Sheet:", err);
      setErrorMsg(`บันทึกในระบบแล้ว แต่ไม่สามารถซิงค์ลง Google Sheet ได้: ${err?.message || String(err)}`);
    } finally {
      setIsSyncingSheet(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setMasterPassword("");
      setCurrentPass("");
      setNewPass("");
      setConfirmPass("");
      setErrorMsg(null);
      setSuccessMsg(null);
      setUserToDelete(null);

      // Merge sheetUsers into localStorage if present on open
      if (sheetUsers && sheetUsers.length > 0) {
        const localList = getUsersList();
        const combinedMap = new Map<string, AppUser>();
        sheetUsers.forEach((u) => {
          if (u && u.username) combinedMap.set(u.username.trim().toLowerCase(), u);
        });
        localList.forEach((u) => {
          if (u && u.username) combinedMap.set(u.username.trim().toLowerCase(), u);
        });
        const merged = Array.from(combinedMap.values());
        if (merged.length > 0) {
          saveUsersList(merged);
        }
      }

      refreshUsersList();
      refreshManagedSheetsList();
      setDepartmentOptions(getDepartmentOptions());

      setLoginUsername("owner");
      setLoginPassword("");

      if (userSession?.role === "Owner") {
        setActiveTab("manage_users");
      } else {
        setActiveTab("login");
      }
    }
  }, [isOpen]);

  // Ensure manage_users is never accessible or active if not Owner
  useEffect(() => {
    if (!isOwner && activeTab === "manage_users") {
      setActiveTab("login");
    }
  }, [isOwner, activeTab]);

  // Listen to department changes triggered anywhere
  useEffect(() => {
    const onDeptUpdated = () => {
      setDepartmentOptions(getDepartmentOptions());
      refreshUsersList();
      refreshManagedSheetsList();
    };
    window.addEventListener("departments_updated", onDeptUpdated);
    return () => window.removeEventListener("departments_updated", onDeptUpdated);
  }, []);

  // Handlers for Managed Sheets (Owner/Admin)
  const handleAddManagedSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!canManageFiles) {
      setErrorMsg("เฉพาะบทบาท Admin หรือ Owner เท่านั้น ที่สามารถเพิ่มหรือบันทึกรายการไฟล์เข้าสู่ระบบได้");
      return;
    }

    if (!newSheetName.trim()) {
      setErrorMsg("กรุณาระบุชื่อเรียกไฟล์ Google Sheet");
      return;
    }
    if (!newSheetUrlOrId.trim()) {
      setErrorMsg("กรุณาระบุ URL หรือ ID ของ Google Sheet");
      return;
    }

    const resolvedDept = newSheetDepartment === "custom" ? (newCustomSheetDept.trim() || "กำหนดเอง") : newSheetDepartment;
    if (newSheetDepartment === "custom" && newCustomSheetDept.trim()) {
      createDepartmentRecord(newCustomSheetDept.trim());
    }
    const result = addManagedSheet(newSheetName, newSheetUrlOrId, newSheetNotes, resolvedDept);
    if (!result) {
      setErrorMsg("URL หรือ ID ของ Google Sheet ไม่ถูกต้อง กรุณาตรวจสอบลิงก์อีกครั้ง (ต้องเป็น Google Sheet URL หรือ ID ที่ถูกต้อง)");
      return;
    }

    setNewSheetName("");
    setNewSheetUrlOrId("");
    setNewSheetNotes("");
    setNewSheetDepartment("สบ.4");
    setNewCustomSheetDept("");
    const updatedList = refreshManagedSheetsList();

    if (spreadsheetId && accessToken && accessToken !== "demo-access-token") {
      setSuccessMsg(`เพิ่มไฟล์ "${result.name}" เรียบร้อยแล้ว! กำลังซิงค์ลง Google Sheet...`);
      await triggerSyncSheetsToGoogleSheets(updatedList);
      setSuccessMsg(`เพิ่มไฟล์ "${result.name}" และซิงค์ลง Google Sheet เรียบร้อยแล้ว!`);
    } else {
      setSuccessMsg(`เพิ่มไฟล์ "${result.name}" เข้าสู่ระบบเรียบร้อยแล้ว!`);
    }
  };

  const handleUpdateManagedSheet = async (id: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!canManageFiles) {
      setErrorMsg("เฉพาะบทบาท Admin หรือ Owner เท่านั้น ที่สามารถแก้ไขข้อมูลรายการไฟล์ได้");
      return;
    }

    if (!editSheetName.trim()) {
      setErrorMsg("กรุณาระบุชื่อเรียกไฟล์ Google Sheet");
      return;
    }
    if (!editSheetUrlOrId.trim()) {
      setErrorMsg("กรุณาระบุ URL หรือ ID ของ Google Sheet");
      return;
    }

    const resolvedDept = editSheetDepartment === "custom" ? (editCustomSheetDept.trim() || "กำหนดเอง") : editSheetDepartment;
    if (editSheetDepartment === "custom" && editCustomSheetDept.trim()) {
      createDepartmentRecord(editCustomSheetDept.trim());
    }
    const ok = updateManagedSheet(id, editSheetName, editSheetUrlOrId, editSheetNotes, resolvedDept);
    if (!ok) {
      setErrorMsg("URL หรือ ID ของ Google Sheet ไม่ถูกต้อง กรุณาตรวจสอบลิงก์อีกครั้ง");
      return;
    }

    setEditingSheetId(null);
    setEditSheetName("");
    setEditSheetUrlOrId("");
    setEditSheetNotes("");
    setEditSheetDepartment("สบ.4");
    setEditCustomSheetDept("");
    const updatedList = refreshManagedSheetsList();

    if (spreadsheetId && accessToken && accessToken !== "demo-access-token") {
      setSuccessMsg("บันทึกแก้ไขข้อมูลไฟล์เรียบร้อยแล้ว! กำลังซิงค์ลง Google Sheet...");
      await triggerSyncSheetsToGoogleSheets(updatedList);
      setSuccessMsg("บันทึกแก้ไขข้อมูลไฟล์ Google Sheet และซิงค์ลง Google Sheet เรียบร้อยแล้ว!");
    } else {
      setSuccessMsg("บันทึกแก้ไขข้อมูลไฟล์ Google Sheet เรียบร้อยแล้ว!");
    }
  };

  const handleDeleteManagedSheet = async (sheet: ManagedSheet) => {
    if (!canManageFiles) {
      setErrorMsg("เฉพาะบทบาท Admin หรือ Owner เท่านั้น ที่สามารถลบรายการไฟล์ได้");
      return;
    }

    deleteManagedSheet(sheet.id);
    setDeletingSheetId(null);
    const updatedList = refreshManagedSheetsList();

    if (spreadsheetId && accessToken && accessToken !== "demo-access-token") {
      setSuccessMsg(`ลบไฟล์ "${sheet.name}" เรียบร้อยแล้ว! กำลังซิงค์ลง Google Sheet...`);
      await triggerSyncSheetsToGoogleSheets(updatedList);
      setSuccessMsg(`ลบไฟล์ "${sheet.name}" และซิงค์ลง Google Sheet เรียบร้อยแล้ว!`);
    } else {
      setSuccessMsg(`ลบไฟล์ "${sheet.name}" เรียบร้อยแล้ว!`);
    }
  };

  const handleCopySheetId = (sheet: ManagedSheet) => {
    navigator.clipboard.writeText(sheet.spreadsheetId);
    setCopiedSheetId(sheet.id);
    setTimeout(() => setCopiedSheetId(null), 2000);
  };

  const handleActivateSheet = (sheet: ManagedSheet) => {
    if (onSelectSpreadsheet) {
      onSelectSpreadsheet(sheet.spreadsheetId);
      setSuccessMsg(`สลับไปเปิดใช้งานไฟล์ "${sheet.name}" เรียบร้อยแล้ว!`);
    }
  };

  if (!isOpen) return null;

  // Quick switch to Owner account
  const handleQuickLoginOwner = () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    // If currently logged in as Admin, strictly disallow direct 1-click bypass switch to Owner
    if (userSession?.role === "Admin" || (isAdmin && userSession?.role !== "Owner")) {
      setActiveTab("login");
      setLoginType("account");
      setLoginUsername("owner");
      setLoginPassword("");
      setErrorMsg("ในบทบาท Admin ไม่อนุญาตให้สลับเป็น Owner โดยอัตโนมัติ กรุณากรอก Username และ Password ของ Owner เพื่อสลับสิทธิ์");
      return;
    }

    setLoginUsername("owner");
    setLoginPassword("owner123");

    const ownerUser: AppUser = {
      username: "owner",
      password: "owner123",
      role: "Owner",
      status: "Active",
      name: "เจ้าของระบบ (Owner)",
    };
    const session = saveUserSession(ownerUser);
    if (onUserSessionChanged) onUserSessionChanged(session);
    onLoginSuccess();
    setSuccessMsg("เข้าสู่ระบบในฐานะ 👑 Owner (เจ้าของระบบ) สำเร็จ!");
    refreshUsersList();
    setTimeout(() => {
      onClose();
    }, 450);
  };


  // Account login submission
  const handleAccountLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!loginUsername.trim() || !loginPassword.trim()) {
      setErrorMsg("กรุณากรอก Username และ Password ให้ครบถ้วน");
      return;
    }

    setIsSubmitting(true);
    const currentList = users.length > 0 ? users : getUsersList();
    const res = authenticateUserFromList(loginUsername, loginPassword, currentList);

    if (res.success && res.user) {
      if (res.user.status === "Inactive") {
        setErrorMsg("บัญชีผู้ใช้งานนี้ถูกระงับการใช้งาน (Inactive)");
        setIsSubmitting(false);
        return;
      }

      const session = saveUserSession(res.user);
      if (onUserSessionChanged) onUserSessionChanged(session);
      onLoginSuccess();
      setSuccessMsg(`เข้าสู่ระบบสำเร็จ! บทบาท: ${res.user.role === "Owner" ? "👑 Owner" : res.user.role === "Admin" ? "🛡️ Admin" : "👤 User"}`);
      setIsSubmitting(false);
      setTimeout(() => {
        onClose();
      }, 400);
    } else {
      setErrorMsg(res.message || "Username หรือ Password ไม่ถูกต้อง");
      setIsSubmitting(false);
    }
  };

  // Master password submission
  const handleMasterPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!masterPassword) {
      setErrorMsg("กรุณากรอกรหัสผ่าน Admin หรือ Owner");
      return;
    }

    setIsSubmitting(true);
    try {
      if (masterPassword.trim() === "owner123") {
        const ownerUser: AppUser = {
          username: "owner",
          role: "Owner",
          status: "Active",
          name: "เจ้าของระบบ (Owner)",
        };
        const session = saveUserSession(ownerUser);
        if (onUserSessionChanged) onUserSessionChanged(session);
        onLoginSuccess();
        setSuccessMsg("เข้าสู่ระบบในฐานะ Owner สำเร็จ!");
        setTimeout(() => onClose(), 400);
        return;
      }

      const isValid = await verifyAdminPassword(masterPassword);
      if (isValid) {
        const adminUser: AppUser = {
          username: "admin",
          role: "Admin",
          status: "Active",
          name: "ผู้ดูแลระบบ (Admin)",
        };
        const session = saveUserSession(adminUser);
        if (onUserSessionChanged) onUserSessionChanged(session);
        onLoginSuccess();
        setSuccessMsg("เข้าสู่ระบบ Admin สำเร็จ!");
        setTimeout(() => onClose(), 400);
      } else {
        setErrorMsg("รหัสผ่านไม่ถูกต้อง กรุณากรอกรหัสผ่าน Admin หรือ Owner ให้ถูกต้อง");
      }
    } catch (err) {
      setErrorMsg("เกิดข้อผิดพลาดในการตรวจสอบรหัสผ่าน");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirmModal(true);
  };

  const handleConfirmLogout = () => {
    setShowLogoutConfirmModal(false);
    clearUserSession();
    if (onUserSessionChanged) onUserSessionChanged(null);
    onLogoutAdmin();
    setSuccessMsg("ออกจากระบบเรียบร้อยแล้ว");
    onClose();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentPass || !newPass || !confirmPass) {
      setErrorMsg("กรุณากรอกข้อมูลให้ครบทุกช่อง");
      return;
    }

    if (newPass !== confirmPass) {
      setErrorMsg("รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    if (newPass.length < 4) {
      setErrorMsg("รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await changeAdminPassword(currentPass, newPass);
      if (res.success) {
        setSuccessMsg(res.message);
        setCurrentPass("");
        setNewPass("");
        setConfirmPass("");
      } else {
        setErrorMsg(res.message);
      }
    } catch (err) {
      setErrorMsg("เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetDefault = async () => {
    setIsSubmitting(true);
    await resetAdminPasswordToDefault();
    setSuccessMsg("รีเซ็ตรหัสผ่านกลับเป็น admin123 เรียบร้อยแล้ว");
    setIsSubmitting(false);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!isOwner) {
      setErrorMsg("สิทธิ์ไม่เพียงพอ: ในแท็บ Users ของ Google Sheet อนุญาตให้เฉพาะบทบาท 👑 Owner (เจ้าของระบบ) เท่านั้นที่สามารถบันทึกหรือเพิ่มผู้ใช้ได้");
      return;
    }

    if (!addUsername.trim() || !addPassword.trim()) {
      setErrorMsg("กรุณากรอก Username และ Password ให้ครบถ้วน");
      return;
    }

    const resolvedDept = addDepartment === "custom" ? (addCustomDept.trim() || "กำหนดเอง") : addDepartment;
    if (addDepartment === "custom" && addCustomDept.trim()) {
      createDepartmentRecord(addCustomDept.trim());
    }

    const effectiveAddPerm: "view" | "edit" = addRole === "Owner" ? "edit" : addPermissionLevel;
    const result = addUserAccount({
      username: addUsername.trim(),
      password: addPassword.trim(),
      name: addName.trim() || addUsername.trim(),
      role: addRole,
      status: addStatus,
      department: resolvedDept,
      permissionLevel: effectiveAddPerm,
      allowedDepartments: addRole === "Owner" || resolvedDept === "ทุกฝ่าย (*)" || !resolvedDept ? ["*"] : [resolvedDept],
    });

    if (result.success) {
      setSuccessMsg(result.message);
      setAddUsername("");
      setAddPassword("");
      setAddName("");
      setAddRole("User");
      setAddStatus("Active");
      setAddDepartment("ทุกฝ่าย (*)");
      setAddCustomDept("");
      setAddPermissionLevel("view");
      const updatedList = refreshUsersList();
      if (onUsersUpdated) onUsersUpdated();
      await handleSyncToGoogleSheet(updatedList);
    } else {
      setErrorMsg(result.message);
    }
  };

  const handleToggleRole = async (user: AppUser) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!isOwner) {
      setErrorMsg("สิทธิ์ไม่เพียงพอ: ในแท็บ Users ของ Google Sheet อนุญาตให้เฉพาะบทบาท 👑 Owner เท่านั้นที่สามารถแก้ไขข้อมูลผู้ใช้ได้");
      return;
    }
    let newRole: "Owner" | "Admin" | "User" = "User";
    if (user.role === "User") newRole = "Admin";
    else if (user.role === "Admin") newRole = "Owner";
    else if (user.role === "Owner") newRole = "User";

    const newPerm: "view" | "edit" = newRole === "Owner" || newRole === "Admin" ? "edit" : "view";
    const res = updateUserAccount(user.username, {
      role: newRole,
      permissionLevel: newPerm,
      allowedDepartments: newRole === "Owner" ? ["*"] : undefined,
    });
    if (res.success) {
      setSuccessMsg(`เปลี่ยนสิทธิ์บัญชี '${user.username}' เป็น ${newRole} เรียบร้อยแล้ว`);
      const updatedList = refreshUsersList();
      if (onUsersUpdated) onUsersUpdated();
      await handleSyncToGoogleSheet(updatedList);
    } else {
      setErrorMsg(res.message);
    }
  };

  const handleToggleStatus = async (user: AppUser) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!isOwner) {
      setErrorMsg("สิทธิ์ไม่เพียงพอ: ในแท็บ Users ของ Google Sheet อนุญาตให้เฉพาะบทบาท 👑 Owner เท่านั้นที่สามารถเปลี่ยนสถานะผู้ใช้ได้");
      return;
    }
    const newStatus = user.status === "Active" ? "Inactive" : "Active";
    const res = updateUserAccount(user.username, { status: newStatus });
    if (res.success) {
      setSuccessMsg(`เปลี่ยนสถานะบัญชี '${user.username}' เป็น ${newStatus} เรียบร้อยแล้ว`);
      const updatedList = refreshUsersList();
      if (onUsersUpdated) onUsersUpdated();
      await handleSyncToGoogleSheet(updatedList);
    } else {
      setErrorMsg(res.message);
    }
  };

  const handleDeleteUser = async (username: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!isOwner) {
      setErrorMsg("สิทธิ์ไม่เพียงพอ: ในแท็บ Users ของ Google Sheet อนุญาตให้เฉพาะบทบาท 👑 Owner เท่านั้นที่สามารถลบบัญชีผู้ใช้ได้");
      return;
    }
    const res = deleteUserAccount(username);
    if (res.success) {
      setSuccessMsg(res.message);
      const updatedList = refreshUsersList();
      if (onUsersUpdated) onUsersUpdated();
      await handleSyncToGoogleSheet(updatedList);
    } else {
      setErrorMsg(res.message);
    }
  };

  const handleSaveUserEdit = async (username: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!isOwner) {
      setErrorMsg("สิทธิ์ไม่เพียงพอ: ในแท็บ Users ของ Google Sheet อนุญาตให้เฉพาะบทบาท 👑 Owner เท่านั้นที่สามารถบันทึกแก้ไขผู้ใช้ได้");
      return;
    }
    const resolvedDept = editDepartment === "custom" ? (editCustomDept.trim() || "กำหนดเอง") : editDepartment;
    if (editDepartment === "custom" && editCustomDept.trim()) {
      createDepartmentRecord(editCustomDept.trim());
    }

    const effectiveEditPerm: "view" | "edit" = editRole === "Owner" ? "edit" : editPermissionLevel;
    const updateObj: Partial<AppUser> = {
      role: editRole,
      department: resolvedDept,
      permissionLevel: effectiveEditPerm,
      allowedDepartments: editRole === "Owner" || resolvedDept === "ทุกฝ่าย (*)" || !resolvedDept ? ["*"] : [resolvedDept],
    };
    if (editName.trim()) updateObj.name = editName.trim();
    if (editPass.trim()) {
      if (editPass.trim().length < 4) {
        setErrorMsg("รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร");
        return;
      }
      updateObj.password = editPass.trim();
    }

    const res = updateUserAccount(username, updateObj);
    if (res.success) {
      // Sync active session if the edited user is currently logged in
      const currentSession = getUserSession();
      if (currentSession && currentSession.username.toLowerCase() === username.toLowerCase()) {
        if (updateObj.name) currentSession.name = updateObj.name;
        if (updateObj.role) currentSession.role = updateObj.role;
        if (updateObj.department) currentSession.department = updateObj.department;
        if (updateObj.permissionLevel) currentSession.permissionLevel = updateObj.permissionLevel;
        if (updateObj.allowedDepartments) currentSession.allowedDepartments = updateObj.allowedDepartments;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
      }
      setSuccessMsg(`อัปเดตข้อมูลบัญชี '${username}' สำเร็จ`);
      setEditingUsername(null);
      setEditPass("");
      setEditName("");
      const updatedList = refreshUsersList();
      if (onUsersUpdated) onUsersUpdated();
      await handleSyncToGoogleSheet(updatedList);
    } else {
      setErrorMsg(res.message);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-100 overflow-hidden flex flex-col my-auto max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-amber-500/20 p-2.5 rounded-xl text-amber-400 border border-amber-500/30 shrink-0">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base text-white flex items-center gap-1.5 truncate">
                <span>ระบบจัดการผู้ใช้งาน & สิทธิ์ Admin / Owner</span>
              </h3>
              <p className="text-xs text-slate-400 truncate">
                บริหารจัดการบัญชีผู้ใช้งาน Admin / Owner / User และสิทธิ์การใช้งาน
              </p>
            </div>
          </div>
          <button
            onClick={handleCloseWithSave}
            disabled={isSavingOnClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            title="บันทึกและปิดหน้าต่าง"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Action Prompt Banner if triggered by edit attempt */}
        {targetActionName && !isAdmin && (
          <div className="bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-start gap-2.5 text-xs text-amber-900 shrink-0">
            <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">ต้องใช้สิทธิ์ Admin หรือ Owner: </span>
              <span>คุณกำลังพยายามทำการ <strong className="underline">{targetActionName}</strong> กรุณาเข้าสู่ระบบเพื่อดำเนินการ</span>
            </div>
          </div>
        )}

        {/* Top Tab Selection - Always Visible */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("login")}
            className={`flex-1 min-w-fit py-3 px-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "login"
                ? "border-amber-500 text-amber-900 bg-white"
                : "border-transparent hover:bg-slate-100"
            }`}
          >
            <KeyRound className="h-4 w-4 text-amber-600 shrink-0" />
            <span>เข้าสู่ระบบ / สลับบัญชี</span>
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={() => setActiveTab("manage_users")}
              className={`flex-1 min-w-fit py-3 px-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === "manage_users"
                  ? "border-emerald-600 text-emerald-800 bg-white"
                  : "border-transparent hover:bg-slate-100"
              }`}
            >
              <Users className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>จัดการผู้ใช้ ({users.length})</span>
            </button>
          )}
          {canManageFiles && (
            <button
              type="button"
              onClick={() => {
                setActiveTab("manage_files");
                refreshManagedSheetsList();
              }}
              className={`flex-1 min-w-fit py-3 px-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === "manage_files"
                  ? "border-teal-600 text-teal-900 bg-white"
                  : "border-transparent hover:bg-slate-100"
              }`}
            >
              <FileSpreadsheet className="h-4 w-4 text-teal-600 shrink-0" />
              <span>จัดการไฟล์ ({managedSheets.length})</span>
            </button>
          )}
          {canManageFiles && (
            <button
              type="button"
              onClick={() => setActiveTab("manage_departments")}
              className={`flex-1 min-w-fit py-3 px-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === "manage_departments"
                  ? "border-emerald-600 text-emerald-800 bg-white"
                  : "border-transparent hover:bg-slate-100"
              }`}
            >
              <Building2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>จัดการรายชื่อฝ่าย ({departmentOptions.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab("change_password")}
            className={`flex-1 min-w-fit py-3 px-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "change_password"
                ? "border-indigo-600 text-indigo-800 bg-white"
                : "border-transparent hover:bg-slate-100"
            }`}
          >
            <Lock className="h-4 w-4 text-indigo-600 shrink-0" />
            <span>เปลี่ยนรหัสผ่าน</span>
          </button>
        </div>

        {/* Modal Body with Scrollbar */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Error and Success Alert Banners */}
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2 text-xs text-rose-800 animate-fade-in">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="break-words">{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2 text-xs text-emerald-800 animate-fade-in">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="break-words">{successMsg}</span>
            </div>
          )}

          {/* TAB 1: LOGIN / SWITCH ACCOUNT */}
          {activeTab === "login" && (
            <div className="space-y-4">
              {/* Current Login Status Banner if Logged In */}
              {(userSession || isAdmin) && (
                <div className={`border rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-sm ${
                  userSession?.role === "Owner"
                    ? "bg-amber-50/80 border-amber-200"
                    : userSession?.role === "Admin" || isAdmin
                    ? "bg-emerald-50/80 border-emerald-200"
                    : "bg-sky-50/80 border-sky-200"
                }`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-2 rounded-xl shrink-0 ${
                      userSession?.role === "Owner"
                        ? "bg-amber-500/20 text-amber-700"
                        : userSession?.role === "Admin" || isAdmin
                        ? "bg-emerald-500/20 text-emerald-700"
                        : "bg-sky-500/20 text-sky-700"
                    }`}>
                      {userSession?.role === "Owner" ? (
                        <Crown className="h-5 w-5 text-amber-600" />
                      ) : userSession?.role === "Admin" || isAdmin ? (
                        <ShieldCheck className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <UserIcon className="h-5 w-5 text-sky-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-800">สถานะปัจจุบัน:</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                          userSession?.role === "Owner"
                            ? "bg-amber-100 text-amber-900 border border-amber-300"
                            : userSession?.role === "Admin" || isAdmin
                            ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                            : "bg-sky-100 text-sky-900 border border-sky-300"
                        }`}>
                          {userSession?.role === "Owner"
                            ? "👑 โหมด Owner (เจ้าของระบบ)"
                            : userSession?.role === "Admin" || isAdmin
                            ? "🛡️ โหมด Admin (ผู้ดูแลระบบ)"
                            : "👤 ผู้ใช้งานทั่วไป (User)"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 truncate mt-0.5">
                        บัญชี: <strong className="font-mono">{userSession?.name || userSession?.username || "Admin Mode"}</strong>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>ออกจากระบบ</span>
                  </button>
                </div>
              )}

              {/* Toggle Login Method */}
              <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
                <button
                  type="button"
                  onClick={() => setLoginType("account")}
                  className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                    loginType === "account" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900"
                  }`}
                >
                  เข้าใช้งานด้วย Username & Password
                </button>
                <button
                  type="button"
                  onClick={() => setLoginType("master")}
                  className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                    loginType === "master" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900"
                  }`}
                >
                  ใช้รหัสผ่าน Master Admin
                </button>
              </div>

              {/* Login Method 1: Account Username & Password */}
              {loginType === "account" ? (
                <form onSubmit={handleAccountLoginSubmit} className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Username (ชื่อผู้ใช้งาน)
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น owner, admin, user"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Password (รหัสผ่าน)
                    </label>
                    <div className="relative">
                      <input
                        type={showLoginPassword ? "text" : "password"}
                        placeholder="กรอกรหัสผ่าน..."
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full pl-3 pr-10 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:border-amber-500"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showLoginPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs py-2.5 px-5 rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Unlock className="h-4 w-4" />
                      <span>{isSubmitting ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบด้วยบัญชีผู้ใช้"}</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* Login Method 2: Master Password */
                <form onSubmit={handleMasterPasswordSubmit} className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      รหัสผ่าน Master Admin (Admin Password)
                    </label>
                    <div className="relative">
                      <input
                        type={showMasterPassword ? "text" : "password"}
                        placeholder="กรอกรหัสผ่าน Master Admin หรือ Owner..."
                        value={masterPassword}
                        onChange={(e) => setMasterPassword(e.target.value)}
                        autoFocus
                        className="w-full pl-3 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-amber-500 focus:bg-white text-slate-900 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowMasterPassword(!showMasterPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showMasterPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-100/80 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-slate-700">
                      <KeyRound className="h-3.5 w-3.5 text-amber-600" />
                      <span>ระดับสิทธิ์เข้าใช้งาน:</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="bg-white border border-slate-200 rounded px-2 py-0.5 font-bold text-emerald-800">
                        🛡️ สิทธิ์ Admin (แก้ไขข้อมูล)
                      </span>
                      <span className="bg-white border border-slate-200 rounded px-2 py-0.5 font-bold text-amber-800">
                        👑 สิทธิ์ Owner (ผู้ดูแลหลัก)
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-bold text-xs py-2.5 px-5 rounded-xl shadow-md shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Unlock className="h-4 w-4" />
                      <span>{isSubmitting ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบด้วย Master Password"}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TAB 2: USER MANAGEMENT (OWNER PRIVILEGE ONLY) */}
          {activeTab === "manage_users" && isOwner && (
            <div className="space-y-5">
              {!canManageUsers && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-sm block">การจำกัดสิทธิ์ในแท็บ Users ของ Google Sheet:</span>
                      <p className="mt-1 leading-relaxed text-slate-700">
                        ในแท็บ <strong>Users</strong> ของ Google Sheet อนุญาตให้เฉพาะบทบาท <strong>👑 Owner (เจ้าของระบบ)</strong> เท่านั้นที่สามารถบันทึกหรือปรับปรุงข้อมูลผู้ใช้ได้ สำหรับบทบาท <strong>🛡️ Admin</strong> สามารถบันทึกข้อมูลโครงการ จัดการไฟล์ และแท็บอื่นๆ ได้ตามปกติ
                      </p>
                    </div>
                  </div>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("login");
                        setLoginType("account");
                        setLoginUsername("owner");
                        setLoginPassword("");
                        setErrorMsg("กรุณากรอก Username และ Password ของ Owner หากต้องการปลดล็อกสิทธิ์บันทึกแท็บ Users");
                      }}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs py-2 px-3 rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <Crown className="h-4 w-4" />
                      <span>เข้าสู่ระบบเป็น 👑 Owner เพื่อปลดล็อกการบันทึกแท็บ Users</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Add New User Form Card */}
              <div className={`bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 ${!canManageUsers ? "opacity-60 pointer-events-none" : ""}`}>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 border-b border-slate-200 pb-2">
                  <UserPlus className="h-4 w-4 text-emerald-600" />
                  <span>เพิ่มผู้ใช้งานใหม่ / กำหนดบทบาท (Add Owner, Admin or User)</span>
                </div>

                <form onSubmit={handleAddUser} className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Username (ชื่อผู้ใช้) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น engineer1"
                      value={addUsername}
                      onChange={(e) => setAddUsername(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Password (รหัสผ่าน) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="รหัสผ่านอย่างน้อย 4 ตัวอักษร"
                      value={addPassword}
                      onChange={(e) => setAddPassword(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      ชื่อแสดงผล (Full Name)
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น วิศวกรคุมงาน"
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      สิทธิ์บทบาท (Role)
                    </label>
                    <select
                      value={addRole}
                      onChange={(e) => {
                        const newR = e.target.value as "Owner" | "Admin" | "User";
                        setAddRole(newR);
                        if (newR === "Owner" || newR === "Admin") {
                          setAddPermissionLevel("edit");
                        }
                      }}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="Owner">👑 Owner (เจ้าของระบบ)</option>
                      <option value="Admin">🛡️ Admin (ผู้ดูแลระบบ)</option>
                      <option value="User">👤 User (ผู้ใช้งานทั่วไป)</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-600">
                        ฝ่ายที่สังกัด / เข้าถึงได้ (Department)
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsDeptModalOpen(true)}
                        className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                        title="เปิดหน้าต่างจัดการรายชื่อฝ่ายเพื่อเพิ่ม/แก้ไข/ลบ"
                      >
                        <Settings className="h-3 w-3" />
                        <span>จัดการฝ่าย (แก้/ลบ/เพิ่ม)</span>
                      </button>
                    </div>
                    <select
                      value={addDepartment}
                      onChange={(e) => {
                        if (e.target.value === "__manage_departments__") {
                          setIsDeptModalOpen(true);
                          return;
                        }
                        setAddDepartment(e.target.value);
                      }}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      {departmentOptions.map((opt) => (
                        <option key={opt.id} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                      <option value="custom">✏️ กำหนดชื่อฝ่ายเอง...</option>
                      <option value="__manage_departments__">⚙️ จัดการรายชื่อฝ่าย (เพิ่ม / แก้ไข / ลบ)...</option>
                    </select>
                    {addDepartment === "custom" && (
                      <input
                        type="text"
                        placeholder="ระบุชื่อฝ่าย..."
                        value={addCustomDept}
                        onChange={(e) => setAddCustomDept(e.target.value)}
                        className="mt-1.5 w-full px-3 py-1 bg-white border border-emerald-300 rounded-lg text-xs focus:outline-none"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      สิทธิ์ข้อมูล (Data Permission)
                    </label>
                    {addRole === "Owner" ? (
                      <div className="w-full px-3 py-1.5 bg-amber-50 border border-amber-300 rounded-xl text-xs font-bold text-amber-900 flex items-center gap-1">
                        <span>👑 จัดการเต็มสิทธิ์ (แก้ไขได้เสมอ)</span>
                      </div>
                    ) : (
                      <select
                        value={addPermissionLevel}
                        onChange={(e) => setAddPermissionLevel(e.target.value as "view" | "edit")}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        <option value="view">👁️ ดูข้อมูลอย่างเดียว (Read Only)</option>
                        <option value="edit">✏️ ดูและแก้ไขข้อมูลได้ (Read & Write)</option>
                      </select>
                    )}
                  </div>

                  <div className="sm:col-span-2 pt-1 flex items-center justify-end">
                    <button
                      type="submit"
                      className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <UserPlus className="h-4 w-4" />
                      <span>เพิ่มผู้ใช้งาน</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Users List Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-emerald-600" />
                    <span>รายชื่อผู้ใช้งานในระบบ ({users.length} รายการ)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {spreadsheetId && !spreadsheetId.startsWith("demo_") && (
                      <button
                        type="button"
                        onClick={() => handleSyncToGoogleSheet()}
                        disabled={isSyncingSheet || !isOwner}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all shadow-sm ${
                          isOwner
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                        } disabled:opacity-60`}
                        title={
                          isOwner
                            ? "บันทึกรายชื่อผู้ใช้งานทั้งหมดลงใน Google Sheet แท็บ Users"
                            : "ในแท็บ Users อนุญาตให้เฉพาะ Owner เท่านั้นที่สามารถบันทึกข้อมูลได้ (Admin บันทึกแท็บอื่นๆ ได้ปกติ)"
                        }
                      >
                        <RefreshCw className={`h-3 w-3 ${isSyncingSheet ? "animate-spin" : ""}`} />
                        <span>
                          {isSyncingSheet
                            ? "กำลังบันทึก..."
                            : isOwner
                            ? "บันทึกลง Google Sheet (Users)"
                            : "🔒 บันทึก Users (เฉพาะ Owner)"}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={refreshUsersList}
                      className="text-[11px] text-slate-500 hover:text-emerald-700 flex items-center gap-1 cursor-pointer bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>รีเฟรช</span>
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                  {users.map((u) => (
                    <div key={u.username} className="p-3 flex flex-col hover:bg-slate-50/80 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2 rounded-xl shrink-0 ${
                            u.role === "Owner"
                              ? "bg-amber-100 text-amber-800"
                              : u.role === "Admin"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            {u.role === "Owner" ? <Crown className="h-4 w-4" /> : u.role === "Admin" ? <Shield className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-xs text-slate-900 font-mono">{u.username}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                u.role === "Owner"
                                  ? "bg-amber-100 text-amber-900 border border-amber-200"
                                  : u.role === "Admin"
                                  ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                                  : "bg-slate-100 text-slate-700 border border-slate-200"
                              }`}>
                                {u.role === "Owner" ? "👑 Owner" : u.role === "Admin" ? "🛡️ Admin" : "👤 User"}
                              </span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                u.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                              }`}>
                                {u.status === "Active" ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200 flex items-center gap-1">
                                <Building2 className="h-2.5 w-2.5" />
                                <span>{u.department || "ทุกฝ่าย (*)"}</span>
                              </span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                u.role === "Owner"
                                  ? "bg-amber-100 text-amber-900 border-amber-300"
                                  : u.permissionLevel === "edit"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : "bg-slate-50 text-slate-700 border-slate-200"
                              }`}>
                                {u.role === "Owner"
                                  ? "👑 สิทธิ์เต็ม (แก้ไขได้)"
                                  : u.permissionLevel === "edit"
                                  ? "✏️ แก้ไขได้"
                                  : "👁️ ดูอย่างเดียว"}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {u.name || u.username} {isOwner && u.password ? `• รหัสผ่าน: ${u.password}` : ""}
                            </p>
                          </div>
                        </div>

                        {/* Action buttons when not editing */}
                        {editingUsername !== u.username && (
                          <div className="flex items-center gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
                            {canManageUsers && (
                              <button
                                type="button"
                                onClick={() => handleToggleRole(u)}
                                className="text-[11px] font-bold px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                                title="สลับสิทธิ์บทบาท (Owner -> Admin -> User)"
                              >
                                {u.role === "Owner"
                                  ? "เปลี่ยนเป็น Admin"
                                  : u.role === "Admin"
                                  ? "เปลี่ยนเป็น User"
                                  : "ยกระดับเป็น Owner"}
                              </button>
                            )}

                            {canManageUsers && (
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(u)}
                                className={`text-[11px] font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                                  u.status === "Active"
                                    ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                }`}
                                title="สลับสถานะเปิด/ปิดบัญชี"
                              >
                                {u.status === "Active" ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                              </button>
                            )}

                            {canManageUsers && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUsername(u.username);
                                  setEditPass(u.password || "");
                                  setEditName(u.name || "");
                                  setEditRole(u.role);
                                  const isKnownDept = departmentOptions.some(
                                    (d) => d.value !== "custom" && d.value === (u.department || "ทุกฝ่าย (*)")
                                  );
                                  if (isKnownDept) {
                                    setEditDepartment(u.department || "ทุกฝ่าย (*)");
                                    setEditCustomDept("");
                                  } else {
                                    setEditDepartment("custom");
                                    setEditCustomDept(u.department || "");
                                  }
                                  setEditPermissionLevel(u.permissionLevel || (u.role === "User" ? "view" : "edit"));
                                }}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                title="แก้ไขข้อมูลฝ่าย/สิทธิ์/รหัสผ่าน"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {canManageUsers && (
                              <button
                                type="button"
                                onClick={() => setUserToDelete(u)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="ลบบัญชีผู้ใช้"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Inline editing panel */}
                      {editingUsername === u.username && (
                        <div className="w-full bg-amber-50/80 border border-amber-300 rounded-xl p-3 space-y-2.5 mt-2.5 animate-fade-in">
                          <div className="flex items-center justify-between text-xs font-bold text-amber-950 border-b border-amber-200/80 pb-1.5">
                            <span className="flex items-center gap-1">
                              <Edit2 className="h-3.5 w-3.5 text-amber-600" />
                              <span>แก้ไขบัญชี: @{u.username}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingUsername(null)}
                              className="text-slate-500 hover:text-slate-800 text-xs underline cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">ชื่อแสดงผล</label>
                              <input
                                type="text"
                                placeholder="ชื่อแสดงผล"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full px-2.5 py-1 text-xs border border-amber-300 rounded-lg bg-white text-slate-900"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                รหัสผ่านใหม่ (เว้นว่างไว้หากไม่เปลี่ยน)
                              </label>
                              <input
                                type="text"
                                placeholder="รหัสผ่านใหม่"
                                value={editPass}
                                onChange={(e) => setEditPass(e.target.value)}
                                className="w-full px-2.5 py-1 text-xs border border-amber-300 rounded-lg bg-white font-mono text-slate-900"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">สิทธิ์บทบาท (Role)</label>
                              <select
                                value={editRole}
                                onChange={(e) => {
                                  const newR = e.target.value as "Owner" | "Admin" | "User";
                                  setEditRole(newR);
                                  if (newR === "Owner") {
                                    setEditPermissionLevel("edit");
                                  }
                                }}
                                className="w-full px-2.5 py-1 text-xs border border-amber-300 rounded-lg bg-white font-bold text-slate-900"
                              >
                                <option value="Owner">👑 Owner (เจ้าของระบบ)</option>
                                <option value="Admin">🛡️ Admin (ผู้ดูแลระบบ)</option>
                                <option value="User">👤 User (ผู้ใช้งานทั่วไป)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">สิทธิ์ข้อมูล (Data Permission)</label>
                              {editRole === "Owner" ? (
                                <div className="w-full px-2.5 py-1 text-xs border border-amber-300 rounded-lg bg-amber-100/60 font-bold text-amber-900 flex items-center gap-1">
                                  <span>👑 จัดการเต็มสิทธิ์ (แก้ไขได้เสมอ)</span>
                                </div>
                              ) : (
                                <select
                                  value={editPermissionLevel}
                                  onChange={(e) => setEditPermissionLevel(e.target.value as "view" | "edit")}
                                  className="w-full px-2.5 py-1 text-xs border border-amber-300 rounded-lg bg-white font-bold text-slate-900"
                                >
                                  <option value="view">👁️ ดูข้อมูลอย่างเดียว (Read Only)</option>
                                  <option value="edit">✏️ ดูและแก้ไขข้อมูลได้ (Read & Write)</option>
                                </select>
                              )}
                            </div>
                            <div className="sm:col-span-2">
                              <div className="flex items-center justify-between mb-0.5">
                                <label className="block text-[10px] font-bold text-slate-600">ฝ่ายที่สังกัด / เข้าถึงได้ (Department)</label>
                                <button
                                  type="button"
                                  onClick={() => setIsDeptModalOpen(true)}
                                  className="text-[10px] font-bold text-amber-800 hover:text-amber-900 bg-amber-100/80 hover:bg-amber-200 border border-amber-300 px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors cursor-pointer"
                                  title="จัดการรายชื่อฝ่ายเพื่อเพิ่ม/แก้ไข/ลบ"
                                >
                                  <Settings className="h-3 w-3" />
                                  <span>จัดการฝ่าย (แก้/ลบ/เพิ่ม)</span>
                                </button>
                              </div>
                              <select
                                value={editDepartment}
                                onChange={(e) => {
                                  if (e.target.value === "__manage_departments__") {
                                    setIsDeptModalOpen(true);
                                    return;
                                  }
                                  setEditDepartment(e.target.value);
                                }}
                                className="w-full px-2.5 py-1 text-xs border border-amber-300 rounded-lg bg-white font-bold text-slate-900 cursor-pointer"
                              >
                                {departmentOptions.map((opt) => (
                                  <option key={opt.id} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                                <option value="custom">✏️ กำหนดชื่อฝ่ายเอง...</option>
                                <option value="__manage_departments__">⚙️ จัดการรายชื่อฝ่าย (เพิ่ม / แก้ไข / ลบ)...</option>
                              </select>
                              {editDepartment === "custom" && (
                                <input
                                  type="text"
                                  placeholder="ระบุชื่อฝ่าย..."
                                  value={editCustomDept}
                                  onChange={(e) => setEditCustomDept(e.target.value)}
                                  className="mt-1.5 w-full px-2.5 py-1 text-xs border border-amber-300 rounded-lg bg-white text-slate-900"
                                />
                              )}
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingUsername(null)}
                              className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded-lg font-bold cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveUserEdit(u.username)}
                              className="px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-xs cursor-pointer flex items-center gap-1"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>บันทึกการแก้ไข</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CHANGE ADMIN PASSWORD */}
          {activeTab === "change_password" && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-emerald-900 font-bold">
                  <Shield className="h-4 w-4 text-emerald-600" />
                  <span>สถานะปัจจุบัน: {userSession?.role === "Owner" ? "👑 โหมด Owner" : isAdmin ? "🛡️ โหมด Admin" : "👤 ผู้ใช้งาน"}</span>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-xs bg-rose-100 text-rose-800 hover:bg-rose-200 px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer"
                >
                  ออกจากระบบ
                </button>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    รหัสผ่านปัจจุบัน
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPass ? "text" : "password"}
                      placeholder="กรอกรหัสผ่านเดิม..."
                      value={currentPass}
                      onChange={(e) => setCurrentPass(e.target.value)}
                      className="w-full pl-3 pr-10 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 text-slate-900 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPass(!showCurrentPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showCurrentPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    รหัสผ่านใหม่
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPass ? "text" : "password"}
                      placeholder="กรอกรหัสผ่านใหม่ (อย่างน้อย 4 ตัวอักษร)..."
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      className="w-full pl-3 pr-10 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 text-slate-900 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showNewPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    ยืนยันรหัสผ่านใหม่
                  </label>
                  <input
                    type="password"
                    placeholder="กรอกรหัสผ่านใหม่อีกครั้ง..."
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 text-slate-900 font-mono"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleResetDefault}
                    className="text-[11px] text-slate-500 hover:text-rose-600 underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>รีเซ็ตเป็น admin123</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    >
                      ปิด
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
                    >
                      <span>{isSubmitting ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* TAB 4: FILE MANAGEMENT (OWNER) */}
          {activeTab === "manage_files" && (
            <div className="space-y-4">
              {/* Notice for non-Owner roles */}
              {!isOwner && (
                <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-3 text-xs text-amber-900 flex items-center gap-2.5 font-medium shadow-2xs">
                  <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>โหมดดูอย่างเดียว (Admin):</strong> เฉพาะสิทธิ์ 👑 <strong>Owner (เจ้าของระบบ)</strong> เท่านั้น ที่สามารถเพิ่ม บันทึก แก้ไข หรือลบรายการไฟล์ได้ (สิทธิ์ Admin สามารถดูและเลือก "เปิดใช้งาน" ไฟล์ได้)
                  </span>
                </div>
              )}

              {/* Add New Sheet Form */}
              <form
                onSubmit={handleAddManagedSheet}
                className={`bg-slate-50 border border-slate-200/90 rounded-2xl p-4 space-y-3.5 shadow-2xs ${
                  !canManageFiles ? "opacity-60 pointer-events-none" : ""
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Plus className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>เพิ่มไฟล์ Google Sheet ใหม่เข้าสู่ระบบ</span>
                  </div>
                  {!canManageFiles && (
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      <span>สงวนสิทธิ์ Admin / Owner</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">
                      ชื่อเรียกไฟล์ / ชื่อลิงก์ที่ตั้งไว้ <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      disabled={!canManageFiles}
                      placeholder="เช่น ไฟล์หลักโครงการก่อสร้าง (Default Sheet)"
                      value={newSheetName}
                      onChange={(e) => setNewSheetName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 font-medium text-slate-900 disabled:bg-slate-100"
                    />
                    <p className="text-[10px] text-slate-400">ชื่อนี้จะแสดงในดร็อปดาวน์เลือกไฟล์ของผู้ใช้ทั่วไป</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">
                      URL หรือ ID ของ Google Sheet <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      disabled={!canManageFiles}
                      placeholder="วาง URL แบบเต็ม เช่น https://docs.google.com/spreadsheets/d/... หรือใส่ ID"
                      value={newSheetUrlOrId}
                      onChange={(e) => setNewSheetUrlOrId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 font-mono text-slate-800 disabled:bg-slate-100"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">
                        ฝ่ายที่สังกัด / สิทธิ์การเข้าถึงไฟล์นี้
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsDeptModalOpen(true)}
                        className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                        title="จัดการรายชื่อฝ่ายเพื่อเพิ่ม/แก้ไข/ลบ"
                      >
                        <Settings className="h-3 w-3" />
                        <span>จัดการฝ่าย (แก้/ลบ/เพิ่ม)</span>
                      </button>
                    </div>
                    <select
                      disabled={!canManageFiles}
                      value={newSheetDepartment}
                      onChange={(e) => {
                        if (e.target.value === "__manage_departments__") {
                          setIsDeptModalOpen(true);
                          return;
                        }
                        setNewSheetDepartment(e.target.value);
                      }}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 font-bold text-slate-800 disabled:bg-slate-100 cursor-pointer"
                    >
                      {departmentOptions.map((opt) => (
                        <option key={opt.id} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                      <option value="custom">✏️ กำหนดชื่อฝ่ายเอง...</option>
                      <option value="__manage_departments__">⚙️ จัดการรายชื่อฝ่าย (เพิ่ม / แก้ไข / ลบ)...</option>
                    </select>
                    {newSheetDepartment === "custom" && (
                      <input
                        type="text"
                        placeholder="ระบุชื่อฝ่าย..."
                        value={newCustomSheetDept}
                        onChange={(e) => setNewCustomSheetDept(e.target.value)}
                        className="mt-1.5 w-full px-3 py-1.5 text-xs bg-white border border-emerald-300 rounded-xl focus:outline-none"
                      />
                    )}
                    <p className="text-[10px] text-slate-400">
                      เลือกฝ่ายที่สามารถมองเห็นและเปิดไฟล์นี้ได้ (หากเลือก 'ทุกฝ่าย (*)' ทุกคนจะเห็นและเลือกไฟล์นี้ได้)
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    คำอธิบาย / หมายเหตุ (ถ้ามี)
                  </label>
                  <input
                    type="text"
                    disabled={!canManageFiles}
                    placeholder="เช่น ไฟล์สำหรับฝ่ายวิศวกร ใช้ติดตามคืบหน้าประจำเดือน"
                    value={newSheetNotes}
                    onChange={(e) => setNewSheetNotes(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 text-slate-800 disabled:bg-slate-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!canManageFiles}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="h-4 w-4" />
                  <span>{canManageFiles ? "บันทึกเพิ่มไฟล์ Google Sheet เข้าสู่ระบบ" : "บันทึกเพิ่มไฟล์ (สงวนสิทธิ์สำหรับ Admin / Owner)"}</span>
                </button>
              </form>

              {/* List of Managed Sheets */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                    <FileSpreadsheet className="h-4 w-4 text-teal-600" />
                    <span>รายการไฟล์ที่ตั้งชื่อไว้ทั้งหมด ({managedSheets.length} ไฟล์)</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">
                    คลิกเพื่อเปิดใช้งานหรือคัดลอก ID
                  </span>
                </div>

                {managedSheets.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center space-y-2">
                    <FileSpreadsheet className="h-8 w-8 text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-500 font-medium">ยังไม่มีไฟล์ Google Sheet ที่บันทึกไว้</p>
                    <p className="text-[11px] text-slate-400">กรอกแบบฟอร์มด้านบนเพื่อเพิ่มไฟล์ใหม่</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                    {managedSheets.map((sheet) => {
                      const isActive = spreadsheetId === sheet.spreadsheetId;
                      const isEditing = editingSheetId === sheet.id;

                      if (isEditing) {
                        return (
                          <div key={sheet.id} className="bg-amber-50/70 border border-amber-300 rounded-2xl p-3.5 space-y-3">
                            <div className="flex items-center justify-between border-b border-amber-200 pb-1.5">
                              <span className="font-bold text-xs text-amber-950 flex items-center gap-1">
                                <Edit2 className="h-3.5 w-3.5 text-amber-600" />
                                <span>แก้ไขข้อมูลไฟล์</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setEditingSheetId(null)}
                                className="text-xs text-slate-500 hover:text-slate-800 underline"
                              >
                                ยกเลิก
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                type="text"
                                placeholder="ชื่อเรียกไฟล์"
                                value={editSheetName}
                                onChange={(e) => setEditSheetName(e.target.value)}
                                className="px-2.5 py-1.5 text-xs bg-white border border-amber-300 rounded-lg focus:outline-none font-medium text-slate-900"
                              />
                              <input
                                type="text"
                                placeholder="URL หรือ ID"
                                value={editSheetUrlOrId}
                                onChange={(e) => setEditSheetUrlOrId(e.target.value)}
                                className="px-2.5 py-1.5 text-xs bg-white border border-amber-300 rounded-lg focus:outline-none font-mono text-slate-800"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-amber-900">
                                ฝ่ายที่เข้าถึงไฟล์นี้ได้:
                              </label>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] font-bold text-slate-600">ฝ่ายที่เข้าถึงไฟล์นี้ได้:</label>
                                  <button
                                    type="button"
                                    onClick={() => setIsDeptModalOpen(true)}
                                    className="text-[10px] font-bold text-amber-800 hover:text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded flex items-center gap-1 transition-colors cursor-pointer"
                                    title="จัดการรายชื่อฝ่าย"
                                  >
                                    <Settings className="h-3 w-3" />
                                    <span>จัดการฝ่าย</span>
                                  </button>
                                </div>
                                <select
                                  value={editSheetDepartment}
                                  onChange={(e) => {
                                    if (e.target.value === "__manage_departments__") {
                                      setIsDeptModalOpen(true);
                                      return;
                                    }
                                    setEditSheetDepartment(e.target.value);
                                  }}
                                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-amber-300 rounded-lg focus:outline-none font-bold text-slate-800 cursor-pointer"
                                >
                                  {departmentOptions.map((opt) => (
                                    <option key={opt.id} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                  <option value="custom">✏️ กำหนดชื่อฝ่ายเอง...</option>
                                  <option value="__manage_departments__">⚙️ จัดการรายชื่อฝ่าย (เพิ่ม / แก้ไข / ลบ)...</option>
                                </select>
                                {editSheetDepartment === "custom" && (
                                  <input
                                    type="text"
                                    placeholder="ระบุชื่อฝ่าย..."
                                    value={editCustomSheetDept}
                                    onChange={(e) => setEditCustomSheetDept(e.target.value)}
                                    className="mt-1 w-full px-2.5 py-1 text-xs bg-white border border-amber-300 rounded-lg focus:outline-none"
                                  />
                                )}
                              </div>
                            </div>
                            <input
                              type="text"
                              placeholder="หมายเหตุ"
                              value={editSheetNotes}
                              onChange={(e) => setEditSheetNotes(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-amber-300 rounded-lg focus:outline-none text-slate-800"
                            />

                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setEditingSheetId(null)}
                                className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded-lg font-bold cursor-pointer"
                              >
                                ยกเลิก
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateManagedSheet(sheet.id)}
                                className="px-3 py-1 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shadow-xs cursor-pointer"
                              >
                                บันทึกการแก้ไข
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={sheet.id}
                          className={`border rounded-2xl p-3.5 space-y-2.5 transition-all shadow-2xs ${
                            isActive
                              ? "bg-emerald-50/90 border-emerald-300"
                              : "bg-white border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-xs sm:text-sm text-slate-900 break-words">
                                  {sheet.name}
                                </span>
                                {isActive && (
                                  <span className="bg-emerald-600 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs shrink-0">
                                    <FolderCheck className="h-3 w-3" />
                                    <span>กำลังใช้งานอยู่</span>
                                  </span>
                                )}
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200 flex items-center gap-1">
                                  <Building2 className="h-2.5 w-2.5" />
                                  <span>{sheet.department || "ทุกฝ่าย (*)"}</span>
                                </span>
                              </div>
                              {sheet.notes && (
                                <p className="text-xs text-slate-500">{sheet.notes}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {!isActive && onSelectSpreadsheet && (
                                <button
                                  type="button"
                                  onClick={() => handleActivateSheet(sheet)}
                                  className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold px-2.5 py-1 rounded-lg text-xs cursor-pointer transition-all shadow-2xs flex items-center gap-1"
                                  title="สลับไปเปิดใช้งานไฟล์นี้ในกระดานหลัก"
                                >
                                  <span>เปิดใช้งาน</span>
                                </button>
                              )}

                              {isOwner && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingSheetId(sheet.id);
                                      setEditSheetName(sheet.name);
                                      setEditSheetUrlOrId(sheet.urlOrId);
                                      setEditSheetNotes(sheet.notes || "");
                                      const isKnown = departmentOptions.some(
                                        (d) => d.value !== "custom" && d.value === (sheet.department || "ทุกฝ่าย (*)")
                                      );
                                      if (isKnown) {
                                        setEditSheetDepartment(sheet.department || "ทุกฝ่าย (*)");
                                        setEditCustomSheetDept("");
                                      } else {
                                        setEditSheetDepartment("custom");
                                        setEditCustomSheetDept(sheet.department || "");
                                      }
                                    }}
                                    className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                    title="แก้ไขชื่อ/ลิงก์"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setDeletingSheetId(deletingSheetId === sheet.id ? null : sheet.id)}
                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                      deletingSheetId === sheet.id
                                        ? "bg-rose-100 text-rose-700"
                                        : "text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                    }`}
                                    title="ลบออกจากรายการ"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {deletingSheetId === sheet.id && (
                            <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 mt-1 animate-fade-in">
                              <div className="text-xs font-bold text-rose-950 flex items-center gap-1.5">
                                <Trash2 className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                                <span>ยืนยันการลบไฟล์ "{sheet.name}" ออกจากรายการ?</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteManagedSheet(sheet)}
                                  className="px-3 py-1 text-xs bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold rounded-lg cursor-pointer shadow-2xs transition-all"
                                >
                                  ยืนยันลบทันที
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingSheetId(null)}
                                  className="px-2.5 py-1 text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg cursor-pointer transition-all"
                                >
                                  ยกเลิก
                                </button>
                              </div>
                            </div>
                          )}

                          {isOwner && (
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px]">
                              <div className="flex items-center gap-1.5 text-slate-500 font-mono">
                                <span className="text-slate-400 font-sans">ID:</span>
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-800 break-all">
                                  {sheet.spreadsheetId}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopySheetId(sheet)}
                                  className="text-emerald-700 hover:text-emerald-900 hover:underline flex items-center gap-0.5 cursor-pointer font-sans"
                                >
                                  {copiedSheetId === sheet.id ? (
                                    <>
                                      <Check className="h-3 w-3 text-emerald-600" />
                                      <span className="text-emerald-600 font-bold">คัดลอกแล้ว</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3 w-3" />
                                      <span>คัดลอก</span>
                                    </>
                                  )}
                                </button>
                              </div>

                              <a
                                href={`https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-500 hover:text-emerald-700 flex items-center gap-1 hover:underline font-medium"
                              >
                                <span>เปิดใน Google Sheets</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: MANAGE DEPARTMENTS */}
          {activeTab === "manage_departments" && (
            <div className="space-y-4">
              <DepartmentManagementContent canManage={canManageFiles} />
            </div>
          )}
        </div>

        {/* Modal Sticky Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500 font-medium">
            {spreadsheetId && !spreadsheetId.startsWith("demo_")
              ? isOwner
                ? "🟢 เชื่อมต่อ Google Sheet (แท็บ Users)"
                : "🟢 เชื่อมต่อ Google Sheet"
              : "🟡 โหมดทำงานในเครื่อง (Local Storage)"}
          </span>
          <button
            type="button"
            onClick={handleCloseWithSave}
            disabled={isSavingOnClose}
            className="bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold text-xs py-2 px-5 rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {isSavingOnClose ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                <span>กำลังบันทึกและซิงค์ข้อมูล...</span>
              </>
            ) : (
              <span>เสร็จสิ้น / บันทึกและปิดหน้าต่าง</span>
            )}
          </button>
        </div>
      </div>

      {/* Delete User Confirmation Popup Modal */}
      {userToDelete && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[60] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150 text-slate-900">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base sm:text-lg">ยืนยันการลบบัญชีผู้ใช้</h3>
                <p className="text-xs text-slate-500">การลบบัญชีจะมีผลในระบบและซิงค์ไปยัง Google Sheet ทันที</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Username:</span>
                <span className="font-mono font-bold text-slate-900 bg-slate-200/70 px-2 py-0.5 rounded">{userToDelete.username}</span>
              </div>
              {userToDelete.name && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">ชื่อผู้ใช้งาน:</span>
                  <span className="font-medium text-slate-800">{userToDelete.name}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-slate-500">บทบาท (Role):</span>
                <span className="font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{userToDelete.role}</span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              คุณแน่ใจหรือไม่ว่าต้องการลบบัญชี <strong className="text-rose-600">{userToDelete.username}</strong> ออกจากระบบ?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targetUsername = userToDelete.username;
                  setUserToDelete(null);
                  await handleDeleteUser(targetUsername);
                }}
                className="px-4.5 py-2 text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl transition-colors cursor-pointer shadow-md flex items-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                <span>ยืนยันลบบัญชี</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Popup Modal */}
      {showLogoutConfirmModal && (
        <div 
          onClick={() => setShowLogoutConfirmModal(false)}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[80] flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-sm w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150 text-slate-900"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl shrink-0">
                <LogOut className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                  ยืนยันการออกจากระบบ
                </h3>
                <p className="text-xs text-slate-500">ระบบจัดการผู้ใช้และสิทธิ์</p>
              </div>
            </div>

            <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between items-center text-slate-600">
                <span className="shrink-0">ผู้ใช้งานปัจจุบัน:</span>
                <span className="font-bold text-slate-900 truncate max-w-[180px]">
                  {userSession?.name || userSession?.username || "Admin Mode"}
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
              คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบในขณะนี้?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowLogoutConfirmModal(false)}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
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

      {/* Department Management Popup Modal */}
      <DepartmentManagerModal
        isOpen={isDeptModalOpen}
        onClose={() => setIsDeptModalOpen(false)}
        canManage={canManageFiles}
        onDepartmentSelected={(val) => {
          if (activeTab === "manage_users") {
            setAddDepartment(val);
          } else if (activeTab === "manage_files") {
            setNewSheetDepartment(val);
          }
        }}
      />
    </div>
  );
}
