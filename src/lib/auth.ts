import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let isSigningIn = false;
let cachedAccessToken: string | null = null;

const GOOGLE_ACCESS_TOKEN_KEY = "construction_google_access_token";
const GOOGLE_TOKEN_EXPIRY_KEY = "construction_google_token_expiry";
const GOOGLE_USER_EMAIL_KEY = "construction_user_email";

/**
 * Creates GoogleAuthProvider with scopes and optional prompt/loginHint
 * Default forces account selection so the user can choose which Google account to connect
 */
export const createGoogleProvider = (
  loginHint?: string | null,
  forceSelectAccount: boolean = true
) => {
  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/spreadsheets");
  provider.addScope("https://www.googleapis.com/auth/drive.file");
  provider.addScope("https://www.googleapis.com/auth/drive");

  if (forceSelectAccount) {
    // Forces Google to show the account selection screen so the user can pick any account
    provider.setCustomParameters({ prompt: "select_account" });
  } else {
    const hint =
      loginHint ||
      auth.currentUser?.email ||
      (typeof localStorage !== "undefined" ? localStorage.getItem(GOOGLE_USER_EMAIL_KEY) : null);

    if (hint && hint !== "demo@civil.gov.th") {
      provider.setCustomParameters({ login_hint: hint });
    }
  }
  return provider;
};

export const getStoredAccessToken = (): string | null => {
  try {
    const token = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
    const expiryStr = localStorage.getItem(GOOGLE_TOKEN_EXPIRY_KEY);
    const expiry = expiryStr ? Number(expiryStr) : 0;
    if (token && expiry > Date.now()) {
      return token;
    }
    if (token && expiry > 0 && expiry <= Date.now()) {
      clearCachedAccessToken();
    }
  } catch (e) {
    // localStorage may not be accessible in some environments
  }
  return null;
};

export const isGoogleTokenExpired = (): boolean => {
  try {
    const token = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
    const expiryStr = localStorage.getItem(GOOGLE_TOKEN_EXPIRY_KEY);
    const expiry = expiryStr ? Number(expiryStr) : 0;
    if (!token) return true;
    // Expired or expiring in under 60 seconds
    return expiry <= Date.now() + 60000;
  } catch (e) {
    return false;
  }
};

export const getStoredUserEmail = (): string | null => {
  try {
    return auth.currentUser?.email || localStorage.getItem(GOOGLE_USER_EMAIL_KEY) || null;
  } catch (e) {
    return null;
  }
};

export const setCachedAccessToken = (token: string, expiresInSec = 3500) => {
  cachedAccessToken = token;
  try {
    localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, token);
    localStorage.setItem(GOOGLE_TOKEN_EXPIRY_KEY, String(Date.now() + expiresInSec * 1000));
  } catch (e) {}
};

export const clearCachedAccessToken = () => {
  cachedAccessToken = null;
  try {
    localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
    localStorage.removeItem(GOOGLE_TOKEN_EXPIRY_KEY);
  } catch (e) {}
};

export const notifyGoogleAuthExpired = () => {
  clearCachedAccessToken();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("google-auth-expired"));
  }
};

// Listen to auth state and restore cached token if valid
export const initAuth = (
  onAuthSuccess: (user: User, token: string) => void,
  onAuthFailure: () => void
) => {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      const validToken = cachedAccessToken || getStoredAccessToken();
      if (validToken) {
        cachedAccessToken = validToken;
        if (!isSigningIn) {
          onAuthSuccess(user, validToken);
        }
      } else if (!isSigningIn) {
        onAuthFailure();
      }
    } else if (!isSigningIn) {
      clearCachedAccessToken();
      onAuthFailure();
    }
  });
};

// Create mock Demo User for sandbox / preview testing when Google Popup auth is restricted
export const createDemoUser = (): { user: User; accessToken: string } => {
  const demoUser = {
    uid: "demo-guest-user",
    displayName: "ผู้ใช้งานทดลอง (Demo User)",
    email: "demo@civil.gov.th",
    photoURL: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80",
    emailVerified: true,
    isAnonymous: false,
    metadata: {},
    providerData: [],
    refreshToken: "demo-token",
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => "demo-id-token",
    getIdTokenResult: async () => ({
      authTime: "",
      claims: {},
      issuedAtTime: "",
      expirationTime: "",
      signInProvider: "google.com",
      signInSecondFactor: null,
      token: "demo-id-token",
    }),
    reload: async () => {},
    toJSON: () => ({}),
    phoneNumber: null,
    providerId: "google.com",
  } as unknown as User;

  cachedAccessToken = "demo-access-token";
  return { user: demoUser, accessToken: "demo-access-token" };
};

// Start popup sign in flow
export const googleSignIn = async (
  loginHint?: string,
  promptSelectAccount: boolean = true
): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    // If selecting a new account while already signed in, sign out first to ensure clean selection
    if (promptSelectAccount && auth.currentUser) {
      try {
        await signOut(auth);
      } catch (e) {}
    }

    const provider = createGoogleProvider(loginHint, promptSelectAccount);
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;

    if (!accessToken) {
      throw new Error("Failed to retrieve Google API access token from sign-in.");
    }

    setCachedAccessToken(accessToken);
    if (result.user?.email) {
      try {
        localStorage.setItem(GOOGLE_USER_EMAIL_KEY, result.user.email);
      } catch (e) {}
    }
    return { user: result.user, accessToken };
  } catch (error: any) {
    console.warn("Sign in popup fallback:", error?.code || error?.message);
    if (
      error?.code === "auth/popup-blocked" ||
      error?.code === "auth/popup-closed-by-user" ||
      error?.code === "auth/cancelled-popup-request" ||
      error?.code === "auth/unauthorized-domain" ||
      error?.code === "auth/operation-not-allowed" ||
      error?.code === "auth/network-request-failed" ||
      error?.message?.includes("popup")
    ) {
      throw new Error("NETWORK_FALLBACK_DEMO");
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Re-authenticate when token expires or session becomes invalid
export const reauthenticateGoogle = async (
  loginHint?: string,
  promptSelectAccount: boolean = false
): Promise<{ user: User; accessToken: string } | null> => {
  return await googleSignIn(loginHint, promptSelectAccount);
};

// Retrieve cached access token
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken || getStoredAccessToken();
};

// Sign out
export const googleSignOut = async () => {
  await signOut(auth);
  clearCachedAccessToken();
  try {
    localStorage.removeItem(GOOGLE_USER_EMAIL_KEY);
  } catch (e) {}
};
