export type DesktopRuntimeStatus = "unavailable" | "starting" | "ready" | "busy" | "error";

export interface DesktopActionRequest {
  action: string;
  target?: string;
  text?: string;
  path?: string;
  confirm?: boolean;
  keys?: string[];
  shortcut?: string;
  x?: number;
  y?: number;
  button?: string;
  direction?: string;
  amount?: number;
}

export interface DesktopRuntimeBridge {
  getStatus(): Promise<{ status: DesktopRuntimeStatus; message?: string; platform?: string }>;
  getPermissions(): Promise<Record<string, boolean>>;
  setPermissions(permissions: Record<string, boolean>): Promise<Record<string, boolean>>;
  getPreferenceSync(key: string, fallback?: unknown): unknown;
  setPreference(key: string, value: unknown): Promise<unknown>;
  startVisionSession(): Promise<{ result?: string; error?: string }>;
  stopVisionSession(): Promise<{ result?: string; error?: string }>;
  runDesktopAction(request: DesktopActionRequest): Promise<{ result?: string; error?: string }>;
  getLocalDatabaseInfo(): Promise<{ result?: string; error?: string }>;
}

declare global {
  interface Window {
    myraaDesktop?: DesktopRuntimeBridge;
  }
}

export function getNativeDesktopBridge(): DesktopRuntimeBridge | null {
  return typeof window !== "undefined" && window.myraaDesktop ? window.myraaDesktop : null;
}

export async function getDesktopRuntimeStatus() {
  const bridge = getNativeDesktopBridge();
  if (!bridge) {
    return { status: "unavailable" as const, message: "Native desktop bridge not available in this runtime." };
  }
  return bridge.getStatus();
}

export async function getDesktopPermissions() {
  const bridge = getNativeDesktopBridge();
  if (!bridge) {
    return {};
  }
  return bridge.getPermissions();
}

export async function saveDesktopPermissions(permissions: Record<string, boolean>) {
  const bridge = getNativeDesktopBridge();
  if (!bridge) {
    return permissions;
  }
  return bridge.setPermissions(permissions);
}

export function getDesktopPreferenceSync<T>(key: string, fallback: T): T {
  const bridge = getNativeDesktopBridge();
  if (!bridge) {
    return fallback;
  }
  const value = bridge.getPreferenceSync(key, fallback);
  return (value as T) ?? fallback;
}

export async function setDesktopPreference(key: string, value: unknown) {
  const bridge = getNativeDesktopBridge();
  if (!bridge) {
    return value;
  }
  return bridge.setPreference(key, value);
}

export async function startNativeDesktopVision() {
  const bridge = getNativeDesktopBridge();
  if (!bridge) {
    return { error: "Native desktop bridge is unavailable." };
  }
  return bridge.startVisionSession();
}

export async function stopNativeDesktopVision() {
  const bridge = getNativeDesktopBridge();
  if (!bridge) {
    return { error: "Native desktop bridge is unavailable." };
  }
  return bridge.stopVisionSession();
}

export async function runNativeDesktopAction(request: DesktopActionRequest) {
  const bridge = getNativeDesktopBridge();
  if (!bridge) {
    return { error: "Native desktop bridge is unavailable." };
  }
  return bridge.runDesktopAction(request);
}
