// Utility for User Authentication and Session Management using Google Apps Script (google.script.run) & Google Sheets

export interface AppUser {
  username: string;
  password?: string;
  role: "Owner" | "Admin" | "User";
  status: "Active" | "Inactive";
  name?: string;
  department?: string; // ฝ่ายที่สังกัด เช่น "สบ.4", "ฝ่ายอื่น", "ทุกฝ่าย (*)"
  allowedDepartments?: string[]; // รายการฝ่ายที่อนุญาตเข้าถึง เช่น ["สบ.4"], ["ฝ่ายอื่น"], หรือ ["*"]
  permissionLevel?: "view" | "edit"; // ระดับสิทธิ์: "view" (ดูอย่างเดียว) หรือ "edit" (ดูและแก้ไขข้อมูลได้)
}

export interface UserSession {
  username: string;
  role: "Owner" | "Admin" | "User";
  status: "Active" | "Inactive";
  name: string;
  department?: string;
  allowedDepartments?: string[];
  permissionLevel?: "view" | "edit";
  loginTime: number;
  lastActiveTime: number;
}

// Session timeout: 600 minutes = 36,000,000 milliseconds
export const SESSION_TIMEOUT_MS = 600 * 60 * 1000;
export const SESSION_KEY = "construction_app_user_session_v1";
export const USERS_STORAGE_KEY = "construction_app_users_v3";

// Default seed users if Google Sheet Users tab is not yet created or in demo mode
export const DEFAULT_USERS: AppUser[] = [
  {
    username: "owner",
    password: "owner123",
    role: "Owner",
    status: "Active",
    name: "เจ้าของระบบ (Owner)",
    department: "ทุกฝ่าย (*)",
    allowedDepartments: ["*"],
    permissionLevel: "edit",
  },
  {
    username: "admin",
    password: "admin123",
    role: "Admin",
    status: "Active",
    name: "ผู้ดูแลระบบ (Admin)",
    department: "ทุกฝ่าย (*)",
    allowedDepartments: ["*"],
    permissionLevel: "edit",
  },
  {
    username: "user_sb4",
    password: "user123",
    role: "User",
    status: "Active",
    name: "ผู้ใช้งานฝ่าย สบ.4",
    department: "สบ.4",
    allowedDepartments: ["สบ.4"],
    permissionLevel: "view",
  },
  {
    username: "admin_sb4",
    password: "admin123",
    role: "Admin",
    status: "Active",
    name: "ผู้ดูแลฝ่าย สบ.4",
    department: "สบ.4",
    allowedDepartments: ["สบ.4"],
    permissionLevel: "edit",
  },
  {
    username: "user_other",
    password: "user123",
    role: "User",
    status: "Active",
    name: "ผู้ใช้งานฝ่ายอื่น",
    department: "ฝ่ายอื่น",
    allowedDepartments: ["ฝ่ายอื่น"],
    permissionLevel: "view",
  },
  {
    username: "user",
    password: "user123",
    role: "User",
    status: "Active",
    name: "ผู้ใช้งานทั่วไป (User)",
    department: "ทุกฝ่าย (*)",
    allowedDepartments: ["*"],
    permissionLevel: "view",
  },
  {
    username: "inactive_user",
    password: "123456",
    role: "User",
    status: "Inactive",
    name: "ผู้ใช้งานปิดบริการ (Inactive)",
    department: "สบ.4",
    allowedDepartments: ["สบ.4"],
    permissionLevel: "view",
  },
];

// Get stored users from localStorage or default
export function getUsersList(): AppUser[] {
  if (typeof window === "undefined") return DEFAULT_USERS;
  const data = localStorage.getItem(USERS_STORAGE_KEY);
  if (!data) {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }
  try {
    const list: AppUser[] = JSON.parse(data);
    if (Array.isArray(list) && list.length > 0) {
      // Data normalization: Ensure Owner always has edit permission and access to all departments
      const normalized = list.map((u) => {
        if (u.role === "Owner") {
          return {
            ...u,
            permissionLevel: "edit" as const,
            allowedDepartments: ["*"],
          };
        }
        return u;
      });
      return normalized;
    }
  } catch {}
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
  return DEFAULT_USERS;
}

// Save users array to localStorage
export function saveUsersList(users: AppUser[]): void {
  if (typeof window === "undefined") return;
  const normalized = users.map((u) => {
    if (u.role === "Owner") {
      return {
        ...u,
        permissionLevel: "edit" as const,
        allowedDepartments: ["*"],
      };
    }
    return u;
  });
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(normalized));
}

// Add a new User or Admin account
export function addUserAccount(newUser: AppUser): { success: boolean; message: string } {
  const currentList = getUsersList();
  const cleanUsername = newUser.username.trim().toLowerCase();

  if (!cleanUsername) {
    return { success: false, message: "กรุณาระบุ Username (ชื่อผู้ใช้)" };
  }

  if (currentList.some((u) => u.username.trim().toLowerCase() === cleanUsername)) {
    return { success: false, message: `Username '${newUser.username}' มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น` };
  }

  if (!newUser.password || newUser.password.trim().length < 4) {
    return { success: false, message: "รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร" };
  }

  const defaultAllowedDepts = newUser.role === "Owner"
    ? ["*"]
    : (newUser.allowedDepartments && newUser.allowedDepartments.length > 0
        ? newUser.allowedDepartments
        : (newUser.department && newUser.department !== "ทุกฝ่าย (*)" ? [newUser.department] : ["*"]));

  const defaultPerm = newUser.role === "Owner"
    ? "edit"
    : (newUser.permissionLevel || (newUser.role === "Admin" ? "edit" : "view"));

  const updatedList = [
    ...currentList,
    {
      username: newUser.username.trim(),
      password: newUser.password.trim(),
      role: newUser.role || "User",
      status: newUser.status || "Active",
      name: newUser.name?.trim() || newUser.username.trim(),
      department: newUser.department?.trim() || "ทุกฝ่าย (*)",
      allowedDepartments: defaultAllowedDepts,
      permissionLevel: defaultPerm,
    },
  ];

  saveUsersList(updatedList);
  return { success: true, message: `เพิ่มบัญชี '${newUser.username}' (${newUser.role}) สำเร็จเรียบร้อยแล้ว` };
}

// Update an existing user account (Role, Password, Status, Name, Department, PermissionLevel)
export function updateUserAccount(username: string, updated: Partial<AppUser>): { success: boolean; message: string } {
  const currentList = getUsersList();
  const cleanTarget = username.trim().toLowerCase();
  const idx = currentList.findIndex((u) => u.username.trim().toLowerCase() === cleanTarget);

  if (idx === -1) {
    return { success: false, message: "ไม่พบบัญชีผู้ใช้นี้ในระบบ" };
  }

  // Prevent demoting or deactivating the last active Owner or Admin
  if (updated.role === "User" || updated.status === "Inactive") {
    const activePrivileged = currentList.filter(
      (u) => (u.role === "Owner" || u.role === "Admin") && u.status === "Active"
    );
    if (
      activePrivileged.length <= 1 &&
      (currentList[idx].role === "Owner" || currentList[idx].role === "Admin") &&
      currentList[idx].status === "Active"
    ) {
      return {
        success: false,
        message: "ไม่สามารถระงับหรือเปลี่ยนสิทธิ์บัญชีนี้ได้ เนื่องจากต้องมีบัญชี Owner หรือ Admin อย่างน้อย 1 บัญชีเปิดใช้งานอยู่",
      };
    }
  }

  const existing = currentList[idx];
  const effectiveRole = updated.role !== undefined ? updated.role : existing.role;
  const newDept = updated.department !== undefined ? updated.department : existing.department;
  let newAllowedDepts = effectiveRole === "Owner"
    ? ["*"]
    : (updated.allowedDepartments !== undefined ? updated.allowedDepartments : existing.allowedDepartments);
  if (!newAllowedDepts || newAllowedDepts.length === 0) {
    newAllowedDepts = newDept && newDept !== "ทุกฝ่าย (*)" ? [newDept] : ["*"];
  }

  let effectivePerm: "view" | "edit" = "view";
  if (effectiveRole === "Owner") {
    effectivePerm = "edit";
  } else if (updated.permissionLevel !== undefined) {
    effectivePerm = updated.permissionLevel;
  } else if (updated.role === "Admin" && existing.role !== "Admin") {
    effectivePerm = "edit";
  } else {
    effectivePerm = existing.permissionLevel || (effectiveRole === "Admin" ? "edit" : "view");
  }

  const updatedUser: AppUser = {
    ...existing,
    ...updated,
    role: effectiveRole,
    department: newDept || "ทุกฝ่าย (*)",
    allowedDepartments: newAllowedDepts,
    permissionLevel: effectivePerm,
  };

  currentList[idx] = updatedUser;
  saveUsersList(currentList);
  return { success: true, message: `อัปเดตข้อมูลบัญชี '${username}' สำเร็จ` };
}

// Delete a user account
export function deleteUserAccount(username: string): { success: boolean; message: string } {
  const currentList = getUsersList();
  const cleanTarget = username.trim().toLowerCase();
  const targetUser = currentList.find((u) => u.username.trim().toLowerCase() === cleanTarget);

  if (!targetUser) {
    return { success: false, message: "ไม่พบบัญชีผู้ใช้นี้ในระบบ" };
  }

  if ((targetUser.role === "Owner" || targetUser.role === "Admin") && targetUser.status === "Active") {
    const activePrivileged = currentList.filter(
      (u) => (u.role === "Owner" || u.role === "Admin") && u.status === "Active"
    );
    if (activePrivileged.length <= 1) {
      return {
        success: false,
        message: "ไม่สามารถลบบัญชีนี้ได้ เนื่องจากต้องมีบัญชี Owner หรือ Admin อย่างน้อย 1 บัญชีอยู่ในระบบ",
      };
    }
  }

  const updatedList = currentList.filter((u) => u.username.trim().toLowerCase() !== cleanTarget);
  saveUsersList(updatedList);
  return { success: true, message: `ลบบัญชี '${username}' เรียบร้อยแล้ว` };
}

// Helper to save session to sessionStorage (cleared automatically when browser/tab closes)
export function saveUserSession(user: AppUser): UserSession {
  const now = Date.now();
  const userDept = user.department || "ทุกฝ่าย (*)";
  const allowedDepts = user.allowedDepartments && user.allowedDepartments.length > 0
    ? user.allowedDepartments
    : (userDept && userDept !== "ทุกฝ่าย (*)" ? [userDept] : ["*"]);

  const session: UserSession = {
    username: user.username,
    role: user.role,
    status: user.status,
    name: user.name || user.username,
    department: userDept,
    allowedDepartments: user.role === "Owner" ? ["*"] : allowedDepts,
    permissionLevel: user.role === "Owner" ? "edit" : (user.permissionLevel || (user.role === "Admin" ? "edit" : "view")),
    loginTime: now,
    lastActiveTime: now,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

// Check if a department is allowed for the user to view
export function isDepartmentAllowedForUser(
  deptName: string | undefined,
  user: UserSession | AppUser | null | undefined
): boolean {
  if (!user) return false;
  if (user.role === "Owner") return true;
  const allowed = user.allowedDepartments && user.allowedDepartments.length > 0
    ? user.allowedDepartments
    : (user.department && user.department !== "ทุกฝ่าย (*)" ? [user.department] : ["*"]);
  if (allowed.includes("*") || allowed.includes("ทุกฝ่าย (*)") || allowed.includes("ทุกฝ่าย")) {
    return true;
  }
  if (!deptName || deptName === "ทั่วไป" || deptName === "ส่วนกลาง") {
    return true;
  }
  const cleanTarget = deptName.trim().toLowerCase();
  return allowed.some((d) => d.trim().toLowerCase() === cleanTarget);
}

// Check if a user has EDIT permission for a department
export function canUserEditDepartment(
  deptName: string | undefined,
  user: UserSession | AppUser | null | undefined
): boolean {
  if (!user) return false;
  if (user.role === "Owner") return true;
  if (!isDepartmentAllowedForUser(deptName, user)) return false;
  const perm = user.permissionLevel || (user.role === "Admin" ? "edit" : "view");
  return perm === "edit";
}

// Get and validate existing session from sessionStorage
export function getUserSession(): UserSession | null {
  const data = sessionStorage.getItem(SESSION_KEY);
  if (!data) return null;

  try {
    const session: UserSession = JSON.parse(data);
    const now = Date.now();

    // Check 600-minute inactivity limit
    if (now - session.lastActiveTime > SESSION_TIMEOUT_MS) {
      clearUserSession();
      return null;
    }

    // Refresh last active timestamp and normalize Owner permissions
    session.lastActiveTime = now;
    if (session.role === "Owner") {
      session.permissionLevel = "edit";
      session.allowedDepartments = ["*"];
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  } catch {
    clearUserSession();
    return null;
  }
}

// Update activity timestamp to keep session alive
export function refreshSessionActivity(): void {
  const data = sessionStorage.getItem(SESSION_KEY);
  if (data) {
    try {
      const session: UserSession = JSON.parse(data);
      session.lastActiveTime = Date.now();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {}
  }
}

// Clear user session (Logout)
export function clearUserSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

// Verification function for Username & Password against Users table
export function authenticateUserFromList(
  usernameInput: string,
  passwordInput: string,
  usersList?: AppUser[]
): { success: boolean; user?: AppUser; message?: string } {
  const cleanUsername = usernameInput.trim().toLowerCase();
  const cleanPassword = passwordInput.trim();
  const activeList = usersList && usersList.length > 0 ? usersList : getUsersList();

  const foundUser = activeList.find(
    (u) => u.username.trim().toLowerCase() === cleanUsername && u.password === cleanPassword
  );

  if (!foundUser) {
    return {
      success: false,
      message: "Username หรือ Password ไม่ถูกต้อง",
    };
  }

  if (foundUser.status === "Inactive") {
    return {
      success: false,
      message: "บัญชีผู้ใช้นี้ถูกระงับการใช้งาน (Status: Inactive) กรุณาติดต่อผู้ดูแลระบบ",
    };
  }

  return {
    success: true,
    user: foundUser,
  };
}
