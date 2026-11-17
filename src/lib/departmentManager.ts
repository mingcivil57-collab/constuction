import { getUsersList, saveUsersList, AppUser } from "./userAuth";
import { getManagedSheets, saveManagedSheets, ManagedSheet } from "./managedSheets";

export interface DepartmentOption {
  id: string;
  value: string; // Internal key, e.g. "สบ.4", "ฝ่ายวิศวกรรม"
  label: string; // Display label with icon, e.g. "🏢 ฝ่ายสำรวจและออกแบบ (สบ.4)"
  isSystem?: boolean; // E.g. "ทุกฝ่าย (*)"
  createdAt?: string;
}

const STORAGE_KEY = "app_custom_departments_v1";

export const DEFAULT_DEPARTMENT_OPTIONS: DepartmentOption[] = [
  {
    id: "dept_all",
    value: "ทุกฝ่าย (*)",
    label: "🌐 ทุกฝ่าย (*)",
    isSystem: true,
  },
  {
    id: "dept_sb4",
    value: "สบ.4",
    label: "🏢 ฝ่ายสำรวจและออกแบบ (สบ.4)",
  },
  {
    id: "dept_other",
    value: "ฝ่ายอื่น",
    label: "🏢 ฝ่ายอื่น",
  },
  {
    id: "dept_eng",
    value: "ฝ่ายวิศวกรรม",
    label: "🏢 ฝ่ายวิศวกรรม",
  },
  {
    id: "dept_maint",
    value: "ฝ่ายซ่อมบำรุง",
    label: "🏢 ฝ่ายซ่อมบำรุง",
  },
  {
    id: "dept_proc",
    value: "ฝ่ายจัดซื้อจัดจ้าง",
    label: "🏢 ฝ่ายจัดซื้อจัดจ้าง",
  },
  {
    id: "dept_fin",
    value: "ฝ่ายการเงินและบัญชี",
    label: "🏢 ฝ่ายการเงินและบัญชี",
  },
];

// Helper to get department options from localStorage or fallback
export function getDepartmentOptions(): DepartmentOption[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure "ทุกฝ่าย (*)" always exists at the beginning
        const hasAll = parsed.some((d) => d.value === "ทุกฝ่าย (*)");
        if (!hasAll) {
          return [
            {
              id: "dept_all",
              value: "ทุกฝ่าย (*)",
              label: "🌐 ทุกฝ่าย (*)",
              isSystem: true,
            },
            ...parsed,
          ];
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Error reading custom departments from storage:", e);
  }

  // Initialize with defaults if empty
  saveDepartmentOptions(DEFAULT_DEPARTMENT_OPTIONS);
  return DEFAULT_DEPARTMENT_OPTIONS;
}

// Helper to save department options
export function saveDepartmentOptions(options: DepartmentOption[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("departments_updated"));
    }
  } catch (e) {
    console.warn("Error saving custom departments to storage:", e);
  }
}

// Add a new department
export function addDepartment(
  name: string,
  customLabel?: string
): { success: boolean; department?: DepartmentOption; message: string } {
  const cleanName = name.trim();
  if (!cleanName) {
    return { success: false, message: "กรุณาระบุชื่อฝ่าย" };
  }

  const current = getDepartmentOptions();
  const exists = current.some(
    (d) => d.value.toLowerCase() === cleanName.toLowerCase()
  );
  if (exists) {
    return { success: false, message: `มีฝ่ายชื่อ "${cleanName}" อยู่ในระบบแล้ว` };
  }

  let finalLabel = customLabel?.trim();
  if (!finalLabel) {
    // Prefix with building icon if not present
    if (cleanName.startsWith("🏢") || cleanName.startsWith("🌐") || cleanName.startsWith("📍")) {
      finalLabel = cleanName;
    } else {
      finalLabel = `🏢 ${cleanName}`;
    }
  }

  const newDept: DepartmentOption = {
    id: `dept_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    value: cleanName,
    label: finalLabel,
    createdAt: new Date().toISOString(),
  };

  const updated = [...current, newDept];
  saveDepartmentOptions(updated);

  return {
    success: true,
    department: newDept,
    message: `เพิ่มฝ่าย "${cleanName}" เรียบร้อยแล้ว`,
  };
}

// Edit/Rename a department and cascade changes to users and sheets
export function updateDepartment(
  idOrOldValue: string,
  newName: string,
  newLabel?: string
): {
  success: boolean;
  message: string;
  updatedUsersCount: number;
  updatedSheetsCount: number;
} {
  const cleanNewName = newName.trim();
  if (!cleanNewName) {
    return {
      success: false,
      message: "กรุณาระบุชื่อฝ่ายใหม่",
      updatedUsersCount: 0,
      updatedSheetsCount: 0,
    };
  }

  const current = getDepartmentOptions();
  const targetIndex = current.findIndex(
    (d) => d.id === idOrOldValue || d.value === idOrOldValue
  );

  if (targetIndex === -1) {
    return {
      success: false,
      message: "ไม่พบข้อมูลฝ่ายที่ต้องการแก้ไข",
      updatedUsersCount: 0,
      updatedSheetsCount: 0,
    };
  }

  const oldDept = current[targetIndex];
  const oldValue = oldDept.value;

  // Check duplicate if name changed
  if (cleanNewName.toLowerCase() !== oldValue.toLowerCase()) {
    const duplicate = current.some(
      (d, i) => i !== targetIndex && d.value.toLowerCase() === cleanNewName.toLowerCase()
    );
    if (duplicate) {
      return {
        success: false,
        message: `มีฝ่ายชื่อ "${cleanNewName}" อยู่ในระบบแล้ว`,
        updatedUsersCount: 0,
        updatedSheetsCount: 0,
      };
    }
  }

  let finalLabel = newLabel?.trim();
  if (!finalLabel) {
    if (cleanNewName === "ทุกฝ่าย (*)") {
      finalLabel = "🌐 ทุกฝ่าย (*)";
    } else if (cleanNewName.startsWith("🏢") || cleanNewName.startsWith("🌐") || cleanNewName.startsWith("📍")) {
      finalLabel = cleanNewName;
    } else {
      finalLabel = `🏢 ${cleanNewName}`;
    }
  }

  // Update in department list
  current[targetIndex] = {
    ...oldDept,
    value: cleanNewName,
    label: finalLabel,
  };
  saveDepartmentOptions(current);

  let updatedUsersCount = 0;
  let updatedSheetsCount = 0;

  // Cascade to users if value changed
  if (oldValue !== cleanNewName) {
    try {
      const users = getUsersList();
      let usersChanged = false;
      const updatedUsers: AppUser[] = users.map((u) => {
        let changed = false;
        let newDept = u.department;
        let newAllowed = u.allowedDepartments ? [...u.allowedDepartments] : [];

        if (u.department === oldValue) {
          newDept = cleanNewName;
          changed = true;
        }

        if (newAllowed.includes(oldValue)) {
          newAllowed = newAllowed.map((d) => (d === oldValue ? cleanNewName : d));
          changed = true;
        }

        if (changed) {
          updatedUsersCount++;
          usersChanged = true;
          return {
            ...u,
            department: newDept,
            allowedDepartments: newAllowed,
          };
        }
        return u;
      });

      if (usersChanged) {
        saveUsersList(updatedUsers);
      }
    } catch (e) {
      console.warn("Error cascading department update to users:", e);
    }

    // Cascade to managed sheets if value changed
    try {
      const sheets = getManagedSheets();
      let sheetsChanged = false;
      const updatedSheets: ManagedSheet[] = sheets.map((s) => {
        if (s.department === oldValue) {
          updatedSheetsCount++;
          sheetsChanged = true;
          return {
            ...s,
            department: cleanNewName,
          };
        }
        return s;
      });

      if (sheetsChanged) {
        saveManagedSheets(updatedSheets);
      }
    } catch (e) {
      console.warn("Error cascading department update to sheets:", e);
    }
  }

  return {
    success: true,
    message: `แก้ไขชื่อฝ่ายเป็น "${cleanNewName}" สำเร็จ${
      updatedUsersCount > 0 || updatedSheetsCount > 0
        ? ` (อัปเดตผู้ใช้ ${updatedUsersCount} บัญชี, ไฟล์ ${updatedSheetsCount} ไฟล์)`
        : ""
    }`,
    updatedUsersCount,
    updatedSheetsCount,
  };
}

// Delete a department and reassign affected users/sheets
export function deleteDepartment(
  idOrValue: string
): {
  success: boolean;
  message: string;
  affectedUsersCount: number;
  affectedSheetsCount: number;
} {
  const current = getDepartmentOptions();
  const target = current.find(
    (d) => d.id === idOrValue || d.value === idOrValue
  );

  if (!target) {
    return {
      success: false,
      message: "ไม่พบข้อมูลฝ่ายที่ต้องการลบ",
      affectedUsersCount: 0,
      affectedSheetsCount: 0,
    };
  }

  if (target.value === "ทุกฝ่าย (*)") {
    return {
      success: false,
      message: "ไม่สามารถลบฝ่าย 'ทุกฝ่าย (*)' ได้ เนื่องจากเป็นฝ่ายหลักของระบบ",
      affectedUsersCount: 0,
      affectedSheetsCount: 0,
    };
  }

  const targetValue = target.value;
  const filtered = current.filter(
    (d) => d.id !== target.id && d.value !== target.value
  );
  saveDepartmentOptions(filtered);

  let affectedUsersCount = 0;
  let affectedSheetsCount = 0;

  // Reassign users of this department to "ทุกฝ่าย (*)"
  try {
    const users = getUsersList();
    let usersChanged = false;
    const updatedUsers: AppUser[] = users.map((u) => {
      let changed = false;
      let newDept = u.department;
      let newAllowed = u.allowedDepartments ? [...u.allowedDepartments] : [];

      if (u.department === targetValue) {
        newDept = "ทุกฝ่าย (*)";
        changed = true;
      }

      if (newAllowed.includes(targetValue)) {
        newAllowed = newAllowed.filter((d) => d !== targetValue);
        if (newAllowed.length === 0) {
          newAllowed = ["*"];
        }
        changed = true;
      }

      if (changed) {
        affectedUsersCount++;
        usersChanged = true;
        return {
          ...u,
          department: newDept,
          allowedDepartments: newAllowed,
        };
      }
      return u;
    });

    if (usersChanged) {
      saveUsersList(updatedUsers);
    }
  } catch (e) {
    console.warn("Error reassigning deleted department users:", e);
  }

  // Reassign sheets of this department
  try {
    const sheets = getManagedSheets();
    let sheetsChanged = false;
    const updatedSheets: ManagedSheet[] = sheets.map((s) => {
      if (s.department === targetValue) {
        affectedSheetsCount++;
        sheetsChanged = true;
        return {
          ...s,
          department: "สบ.4", // default back to main
        };
      }
      return s;
    });

    if (sheetsChanged) {
      saveManagedSheets(updatedSheets);
    }
  } catch (e) {
    console.warn("Error reassigning deleted department sheets:", e);
  }

  return {
    success: true,
    message: `ลบฝ่าย "${targetValue}" สำเร็จ${
      affectedUsersCount > 0 ? ` (ย้ายผู้ใช้ ${affectedUsersCount} บัญชีไปยัง 'ทุกฝ่าย (*)')` : ""
    }`,
    affectedUsersCount,
    affectedSheetsCount,
  };
}

// Reset departments to defaults
export function resetDepartmentsToDefault(): { success: boolean; message: string } {
  saveDepartmentOptions(DEFAULT_DEPARTMENT_OPTIONS);
  return {
    success: true,
    message: "คืนค่ารายชื่อฝ่ายเริ่มต้นเรียบร้อยแล้ว",
  };
}
