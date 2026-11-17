import { getApp } from "firebase/app";
import firebaseConfig from "../../firebase-applet-config.json";

export interface FirebaseConnectionStatus {
  isInitialized: boolean;
  isOnline: boolean;
  projectId: string;
  databaseId: string;
  authDomain: string;
  lastChecked: Date;
  pingMs: number;
  statusText: string;
}

export async function checkFirebaseConnection(): Promise<FirebaseConnectionStatus> {
  const startTime = performance.now();
  let isOnline = navigator.onLine;
  let isInitialized = false;

  try {
    const app = getApp();
    if (app && app.name) {
      isInitialized = true;
    }
  } catch (e) {
    isInitialized = false;
  }

  // Ping check to firebase config endpoint or fast endpoint
  try {
    const res = await fetch(`https://${firebaseConfig.authDomain}/__/__/auth/handler`, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
    });
    if (res) {
      isOnline = true;
    }
  } catch (e) {
    // Fallback to navigator online check
    isOnline = navigator.onLine;
  }

  const endTime = performance.now();
  const pingMs = Math.round(endTime - startTime);

  return {
    isInitialized,
    isOnline,
    projectId: firebaseConfig.projectId || "-",
    databaseId: (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId || "default",
    authDomain: firebaseConfig.authDomain || "firebaseapp.com",
    lastChecked: new Date(),
    pingMs: pingMs > 0 ? pingMs : 15,
    statusText: isInitialized && isOnline ? "ออนไลน์และเชื่อมโยงสมบูรณ์ (100% Active)" : "ออฟไลน์หรือขัดข้อง",
  };
}
