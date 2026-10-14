import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  signOut
} from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize the Firebase app
const app = initializeApp(firebaseConfig);

// Initialize Firestore with the database ID specified in the configuration
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Auth
export const auth = getAuth(app);

// Setup the Google Auth Provider with our requested Workspace scopes
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("https://www.googleapis.com/auth/drive.readonly");
googleProvider.addScope("https://www.googleapis.com/auth/drive.file");
googleProvider.addScope("https://www.googleapis.com/auth/spreadsheets");
googleProvider.addScope("https://mail.google.com/");
googleProvider.addScope("https://www.googleapis.com/auth/documents");

// In-memory access token cache
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Helper to manage secure-ish local session
const SESSION_KEY = "workspace_session_data";

function saveSession(accessToken: string) {
  const expiresAt = Date.now() + 3500 * 1000; // 3500 seconds (Google tokens expire in 3600)
  localStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken, expiresAt }));
}

function loadSession(): string | null {
  try {
    const data = localStorage.getItem(SESSION_KEY);
    if (!data) return null;
    const { accessToken, expiresAt } = JSON.parse(data);
    if (Date.now() < expiresAt) {
      return accessToken;
    }
    // Expired
    localStorage.removeItem(SESSION_KEY);
    return null;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (!cachedAccessToken) {
        // Try to restore from session storage
        const restoredToken = loadSession();
        if (restoredToken) {
          cachedAccessToken = restoredToken;
        }
      }

      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        clearSession();
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      clearSession();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Sign in with Google Popup and cache access token in memory
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Failed to retrieve Google OAuth access token.");
    }
    cachedAccessToken = credential.accessToken;
    saveSession(cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err) {
    console.error("Firebase/Google Sign-In Error:", err);
    throw err;
  } finally {
    isSigningIn = false;
  }
};

// Log out and wipe the cached in-memory access token
export const googleLogOut = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  clearSession();
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

// Connection validation
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    console.log("[Firebase] Firestore connection validation successful.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("[Firebase] Please check your Firebase configuration or internet connection.");
    }
  }
}

// ----------------------------------------------------------------------------
// Firestore Error Handling and Diagnostics Enforcer
// ----------------------------------------------------------------------------
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error("Firestore Hardened Error Diagnostics:", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
