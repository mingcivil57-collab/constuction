import { extractSpreadsheetId } from "./googleSheets";

export interface ManagedSheet {
  id: string;
  name: string;
  urlOrId: string;
  spreadsheetId: string;
  createdAt: string;
  notes?: string;
  department?: string; // เช่น "สบ.4", "ฝ่ายอื่น", "ทั่วไป"
}

const STORAGE_KEY = "owner_managed_google_sheets";

const DELETED_KEYS_STORAGE = "owner_deleted_sheet_ids";

export const DEFAULT_MANAGED_SHEETS: ManagedSheet[] = [
  {
    id: "default_sb4",
    name: "สบ.4 (ไฟล์หลักโครงการ)",
    urlOrId: "1t3unDWOOzqbqfs8bJW-XK4-9-PlVxnrnGSly40lMeDk",
    spreadsheetId: "1t3unDWOOzqbqfs8bJW-XK4-9-PlVxnrnGSly40lMeDk",
    createdAt: "2026-01-01T00:00:00.000Z",
    notes: "ไฟล์หลักที่ใช้ในการติดตามแผนงานโครงการก่อสร้าง (สบ.4)",
    department: "สบ.4",
  },
];

// Helper to determine or normalize a sheet's department
export function getSheetDepartment(sheet: ManagedSheet | null | undefined): string {
  if (!sheet) return "ทั่วไป";
  if (sheet.department && sheet.department.trim()) {
    return sheet.department.trim();
  }
  const name = sheet.name || "";
  if (name.includes("สบ.4")) return "สบ.4";
  if (name.includes("ฝ่ายอื่น")) return "ฝ่ายอื่น";
  return "สบ.4";
}

// Get all unique departments available in the managed sheets list and system configuration
export function getAllDepartments(sheets?: ManagedSheet[]): string[] {
  const currentSheets = sheets && sheets.length > 0 ? sheets : getManagedSheets();
  const set = new Set<string>(["สบ.4", "ฝ่ายอื่น"]);
  
  // Read dynamic departments from localStorage
  try {
    const raw = localStorage.getItem("app_custom_departments_v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((p) => {
          if (p && p.value && p.value !== "ทุกฝ่าย (*)") {
            set.add(p.value);
          }
        });
      }
    }
  } catch (e) {
    // ignore
  }

  for (const s of currentSheets) {
    const d = getSheetDepartment(s);
    if (d && d !== "ทั่วไป" && d !== "ส่วนกลาง" && d !== "ทุกฝ่าย (*)") {
      set.add(d);
    }
  }
  return Array.from(set);
}

// Check if a sheet is allowed for a user based on department access rules
export function isSheetAllowedForUser(
  sheet: ManagedSheet | null | undefined,
  user: { role: string; allowedDepartments?: string[]; department?: string } | null | undefined
): boolean {
  if (!user) return false;
  // Owner has unrestricted access to all departments
  if (user.role === "Owner") return true;

  const sheetDept = getSheetDepartment(sheet);
  const allowed = user.allowedDepartments && user.allowedDepartments.length > 0
    ? user.allowedDepartments
    : (user.department && user.department !== "ทุกฝ่าย (*)" ? [user.department] : ["*"]);

  if (allowed.includes("*") || allowed.includes("ทุกฝ่าย (*)") || allowed.includes("ทุกฝ่าย")) {
    return true;
  }
  if (!sheetDept || sheetDept === "ทั่วไป" || sheetDept === "ส่วนกลาง") {
    return true;
  }
  const cleanTarget = sheetDept.trim().toLowerCase();
  return allowed.some((d) => d.trim().toLowerCase() === cleanTarget);
}

function getDeletedSheetIds(): string[] {
  try {
    const raw = localStorage.getItem(DELETED_KEYS_STORAGE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addDeletedSheetId(idOrSpreadsheetId: string): void {
  try {
    const current = getDeletedSheetIds();
    if (!current.includes(idOrSpreadsheetId)) {
      localStorage.setItem(DELETED_KEYS_STORAGE, JSON.stringify([...current, idOrSpreadsheetId]));
    }
  } catch (e) {
    console.error("Error saving deleted sheet id:", e);
  }
}

export function removeDeletedSheetId(idOrSpreadsheetId: string): void {
  try {
    const current = getDeletedSheetIds();
    if (current.includes(idOrSpreadsheetId)) {
      const updated = current.filter((id) => id !== idOrSpreadsheetId);
      localStorage.setItem(DELETED_KEYS_STORAGE, JSON.stringify(updated));
    }
  } catch (e) {
    console.error("Error removing deleted sheet id:", e);
  }
}

export function mergeManagedSheets(primary: ManagedSheet[], secondary: ManagedSheet[]): ManagedSheet[] {
  const deletedIds = getDeletedSheetIds();
  const map = new Map<string, ManagedSheet>();

  // 1. Add default sheets
  for (const s of DEFAULT_MANAGED_SHEETS) {
    if (!deletedIds.includes(s.spreadsheetId) && !deletedIds.includes(s.id)) {
      map.set(s.spreadsheetId.trim(), s);
    }
  }

  // 2. Add secondary (e.g. local) sheets
  for (const s of secondary || []) {
    if (s && s.spreadsheetId && !deletedIds.includes(s.spreadsheetId) && !deletedIds.includes(s.id)) {
      const existing = map.get(s.spreadsheetId.trim());
      map.set(s.spreadsheetId.trim(), {
        ...existing,
        ...s,
        name: (s.name && s.name.trim()) || existing?.name || "ไฟล์ Google Sheet",
        notes: s.notes !== undefined ? s.notes : existing?.notes,
        department: s.department !== undefined ? s.department : (existing?.department || getSheetDepartment(s)),
      });
    }
  }

  // 3. Add primary (e.g. remote) sheets
  for (const s of primary || []) {
    if (s && s.spreadsheetId && !deletedIds.includes(s.spreadsheetId) && !deletedIds.includes(s.id)) {
      const existing = map.get(s.spreadsheetId.trim());
      map.set(s.spreadsheetId.trim(), {
        ...existing,
        ...s,
        name: (s.name && s.name.trim()) || existing?.name || "ไฟล์ Google Sheet",
        notes: s.notes !== undefined ? s.notes : existing?.notes,
        department: s.department !== undefined ? s.department : (existing?.department || getSheetDepartment(s)),
      });
    }
  }

  return Array.from(map.values());
}

export function syncAndMergeRemoteManagedSheets(remoteList: ManagedSheet[]): ManagedSheet[] {
  const currentLocal = getManagedSheets();
  const merged = mergeManagedSheets(remoteList || [], currentLocal);
  saveManagedSheets(merged);
  return merged;
}

export function getManagedSheets(): ManagedSheet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let list: ManagedSheet[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        list = parsed;
      }
    }

    // Always merge with default sheets so default baseline sheets are preserved unless explicitly deleted
    const mergedList = mergeManagedSheets([], list);

    // Filter out header row artifacts and corrupted sub-sheet tab names
    const cleanList = mergedList.filter((s) => {
      if (!s || !s.spreadsheetId) return false;
      const lowerName = (s.name || "").trim().toLowerCase();
      const lowerId = (s.spreadsheetId || "").trim().toLowerCase();

      // Check header artifacts
      if (
        lowerName === "name" ||
        lowerName === "ชื่อ" ||
        lowerName === "ชื่อไฟล์" ||
        lowerId === "spreadsheet_id" ||
        lowerId === "spreadsheet id" ||
        (s.id && s.id.toLowerCase() === "id")
      ) {
        return false;
      }

      // Must have valid Google Spreadsheet ID format (at least 5 chars, alphanumeric with hyphen/underscore or demo string)
      const isDemo = lowerId.includes("demo") || (s.spreadsheetId && s.spreadsheetId.startsWith("demo_"));
      if (!isDemo && (lowerId.length < 5 || !/^[a-zA-Z0-9_-]+$/.test(s.spreadsheetId))) {
        return false;
      }

      return true;
    });

    return cleanList;
  } catch (e) {
    console.error("Error loading managed sheets:", e);
    return DEFAULT_MANAGED_SHEETS;
  }
}

export function saveManagedSheets(sheets: ManagedSheet[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sheets));
  } catch (e) {
    console.error("Error saving managed sheets:", e);
  }
}

export function addManagedSheet(name: string, urlOrId: string, notes?: string, department?: string): ManagedSheet | null {
  const cleanUrlOrId = urlOrId.trim();
  const extracted = extractSpreadsheetId(cleanUrlOrId);
  if (!extracted) {
    return null;
  }

  // Remove from deleted list if previously marked deleted
  removeDeletedSheetId(extracted);

  const currentList = getManagedSheets();
  const existingIdx = currentList.findIndex(
    (s) => s.spreadsheetId.trim().toLowerCase() === extracted.toLowerCase()
  );

  const resolvedDept = department?.trim() || (name.includes("สบ.4") ? "สบ.4" : (name.includes("ฝ่ายอื่น") ? "ฝ่ายอื่น" : "สบ.4"));

  let resultSheet: ManagedSheet;
  let updatedList: ManagedSheet[];

  if (existingIdx >= 0) {
    // Update existing sheet in place
    const existing = currentList[existingIdx];
    removeDeletedSheetId(existing.id);
    resultSheet = {
      ...existing,
      name: name.trim() || existing.name || "ไฟล์ Google Sheet",
      urlOrId: cleanUrlOrId,
      spreadsheetId: extracted,
      notes: notes !== undefined ? notes.trim() : existing.notes,
      department: resolvedDept,
    };
    updatedList = [...currentList];
    updatedList[existingIdx] = resultSheet;
  } else {
    // Create new sheet
    resultSheet = {
      id: `sheet_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: name.trim() || "ไฟล์ Google Sheet ไม่ระบุชื่อ",
      urlOrId: cleanUrlOrId,
      spreadsheetId: extracted,
      createdAt: new Date().toISOString(),
      notes: notes?.trim() || "",
      department: resolvedDept,
    };
    updatedList = [resultSheet, ...currentList];
  }

  saveManagedSheets(updatedList);
  return resultSheet;
}

export function updateManagedSheet(id: string, name: string, urlOrId: string, notes?: string, department?: string): boolean {
  const cleanUrlOrId = urlOrId.trim();
  const extracted = extractSpreadsheetId(cleanUrlOrId);
  if (!extracted) {
    return false;
  }

  removeDeletedSheetId(id);
  removeDeletedSheetId(extracted);

  const currentList = getManagedSheets();
  const updatedList = currentList.map((s) => {
    if (s.id === id) {
      const resolvedDept = department !== undefined
        ? department.trim()
        : (s.department || getSheetDepartment(s));
      return {
        ...s,
        name: name.trim() || s.name,
        urlOrId: cleanUrlOrId,
        spreadsheetId: extracted,
        notes: notes !== undefined ? notes.trim() : s.notes,
        department: resolvedDept,
      };
    }
    return s;
  });

  saveManagedSheets(updatedList);
  return true;
}

export function deleteManagedSheet(id: string): ManagedSheet[] {
  const currentList = getManagedSheets();
  const target = currentList.find((s) => s.id === id);
  if (target) {
    addDeletedSheetId(target.id);
    if (target.spreadsheetId) {
      addDeletedSheetId(target.spreadsheetId);
    }
  } else {
    addDeletedSheetId(id);
  }

  const updatedList = currentList.filter((s) => s.id !== id);
  saveManagedSheets(updatedList);
  return updatedList;
}
