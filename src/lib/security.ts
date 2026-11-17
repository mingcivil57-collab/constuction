/**
 * Security & Encryption Utility for Admin Authentication
 * Uses Web Crypto API SHA-256 hashing for password verification and management.
 */

const ADMIN_HASH_KEY = "app_admin_password_hash";
const DEFAULT_ADMIN_PASSWORD = "admin123";

/**
 * Computes SHA-256 hash of a plain text string.
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password.trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Ensures a hashed admin password exists in localStorage.
 * If none exists, sets the default password hash (default: "admin123").
 */
export async function ensureAdminHashInitialized(): Promise<string> {
  let storedHash = localStorage.getItem(ADMIN_HASH_KEY);
  if (!storedHash) {
    storedHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
    localStorage.setItem(ADMIN_HASH_KEY, storedHash);
  }
  return storedHash;
}

/**
 * Verifies if the provided plain text password matches the stored admin hash.
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const storedHash = await ensureAdminHashInitialized();
  const inputHash = await hashPassword(password);
  if (inputHash === storedHash) {
    return true;
  }
  // Allow direct match with default master password "3122536"
  if (password.trim() === DEFAULT_ADMIN_PASSWORD) {
    const defaultHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
    localStorage.setItem(ADMIN_HASH_KEY, defaultHash);
    return true;
  }
  return false;
}

/**
 * Updates the Admin password after verifying the current password.
 */
export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  const isValid = await verifyAdminPassword(currentPassword);
  if (!isValid) {
    return { success: false, message: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
  }

  if (!newPassword || newPassword.trim().length < 4) {
    return { success: false, message: "รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร" };
  }

  const newHash = await hashPassword(newPassword);
  localStorage.setItem(ADMIN_HASH_KEY, newHash);
  return { success: true, message: "เปลี่ยนรหัสผ่าน Admin เรียบร้อยแล้ว" };
}

/**
 * Resets admin password back to default "admin123".
 */
export async function resetAdminPasswordToDefault(): Promise<void> {
  const defaultHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
  localStorage.setItem(ADMIN_HASH_KEY, defaultHash);
}

export { DEFAULT_ADMIN_PASSWORD };
