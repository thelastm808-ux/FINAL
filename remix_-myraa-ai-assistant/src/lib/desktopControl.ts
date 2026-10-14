import { getNativeDesktopBridge, getDesktopPreferenceSync, saveDesktopPermissions as saveRuntimePermissions } from "./nativeDesktop";

export type DesktopPermissionKey =
  | "screenCapture"
  | "mouseMovement"
  | "mouseClicks"
  | "keyboardTyping"
  | "openingApplications"
  | "closingApplications"
  | "fileAccess"
  | "clipboardAccess"
  | "browserAutomation"
  | "powerShellCommands"
  | "commandPromptCommands"
  | "registryChanges"
  | "administratorActions";

export type DesktopPermissions = Record<DesktopPermissionKey, boolean>;

export const desktopPermissionLabels: Record<DesktopPermissionKey, string> = {
  screenCapture: "Allow Screen Capture",
  mouseMovement: "Allow Mouse Movement",
  mouseClicks: "Allow Mouse Clicks",
  keyboardTyping: "Allow Keyboard Typing",
  openingApplications: "Allow Opening Applications",
  closingApplications: "Allow Closing Applications",
  fileAccess: "Allow File Access",
  clipboardAccess: "Allow Clipboard Access",
  browserAutomation: "Allow Browser Automation",
  powerShellCommands: "Allow PowerShell Commands",
  commandPromptCommands: "Allow Command Prompt Commands",
  registryChanges: "Allow Registry Changes",
  administratorActions: "Allow Administrator Actions",
};

export const defaultDesktopPermissions: DesktopPermissions = {
  screenCapture: true,
  mouseMovement: false,
  mouseClicks: false,
  keyboardTyping: false,
  openingApplications: false,
  closingApplications: false,
  fileAccess: false,
  clipboardAccess: false,
  browserAutomation: false,
  powerShellCommands: false,
  commandPromptCommands: false,
  registryChanges: false,
  administratorActions: false,
};

const desktopVisionTriggers = [
  /can you see my screen/i,
  /what am i looking at/i,
  /read this/i,
  /what error is this/i,
  /explain this code/i,
  /open settings/i,
  /open chrome/i,
  /open file explorer/i,
  /navigate to downloads/i,
  /find the install button/i,
  /click next/i,
  /scroll down/i,
  /help me/i,
  /can you guide me/i,
  /look at this/i,
  /see this/i,
  /inspect this/i,
  /read the screen/i,
];

export function shouldStartDesktopVision(text: string): boolean {
  return desktopVisionTriggers.some((pattern) => pattern.test(text));
}

const highRiskDesktopActions = new Set([
  "deleteFiles",
  "formatDrive",
  "registryChange",
  "administratorAction",
  "uninstallSoftware",
  "purchase",
  "sendEmail",
  "executeScript",
]);

export function isHighRiskDesktopAction(action: string): boolean {
  return highRiskDesktopActions.has(action);
}

export function getDesktopPermissionForAction(action: string): DesktopPermissionKey | null {
  switch (action) {
    case "openApplication":
    case "switchApplication":
    case "openSettings":
    case "openChrome":
    case "openFileExplorer":
    case "openTerminal":
      return "openingApplications";
    case "closeApplication":
    case "closeWindow":
      return "closingApplications";
    case "minimizeWindow":
    case "maximizeWindow":
    case "restoreWindow":
    case "moveWindow":
      return "openingApplications";
    case "click":
      return "mouseClicks";
    case "moveMouse":
    case "dragMouse":
      return "mouseMovement";
    case "type":
    case "press":
    case "hotkey":
    case "keyboardShortcut":
      return "keyboardTyping";
    case "scroll":
      return "mouseMovement";
    case "readScreen":
    case "inspectScreen":
    case "readDialogBox":
    case "readDesktopNotifications":
      return "screenCapture";
    case "fileExplorer":
    case "navigateDownloads":
      return "fileAccess";
    case "clipboardRead":
    case "clipboardWrite":
    case "pasteClipboard":
    case "copyClipboard":
      return "clipboardAccess";
    case "browserAutomation":
      return "browserAutomation";
    case "runPowerShell":
      return "powerShellCommands";
    case "runCommandPrompt":
      return "commandPromptCommands";
    case "registryChange":
      return "registryChanges";
    case "administratorAction":
      return "administratorActions";
    default:
      return null;
  }
}

export function getDesktopActionSummary(action: string, target?: string): string {
  const suffix = target ? ` on ${target}` : "";
  switch (action) {
    case "openApplication":
      return `open an application${suffix}`;
    case "switchApplication":
      return `switch applications${suffix}`;
    case "minimizeWindow":
      return `minimize a window${suffix}`;
    case "maximizeWindow":
      return `maximize a window${suffix}`;
    case "restoreWindow":
      return `restore a window${suffix}`;
    case "closeWindow":
    case "closeApplication":
      return `close a window${suffix}`;
    case "readScreen":
      return `read the screen${suffix}`;
    case "readDialogBox":
      return `read a dialog box${suffix}`;
    case "readDesktopNotifications":
      return `read desktop notifications${suffix}`;
    case "openSettings":
      return `open Settings${suffix}`;
    case "openChrome":
      return `open Chrome${suffix}`;
    case "openFileExplorer":
      return `open File Explorer${suffix}`;
    case "openTerminal":
      return `open Terminal${suffix}`;
    case "deleteFiles":
      return `delete files${suffix}`;
    case "formatDrive":
      return `format a drive${suffix}`;
    case "registryChange":
      return `change the Windows Registry${suffix}`;
    case "administratorAction":
      return `run an administrator action${suffix}`;
    case "hotkey":
    case "keyboardShortcut":
      return `press a keyboard shortcut${suffix}`;
    case "press":
      return `press a key${suffix}`;
    case "moveMouse":
      return `move the mouse${suffix}`;
    case "dragMouse":
      return `drag the mouse${suffix}`;
    case "clipboardRead":
      return `read from the clipboard${suffix}`;
    case "clipboardWrite":
    case "copyClipboard":
    case "pasteClipboard":
      return `use the clipboard${suffix}`;
    default:
      return `${action}${suffix}`;
  }
}

export function loadDesktopPermissions(storageKey = "myraa_desktop_permissions"): DesktopPermissions {
  const runtimePermissions = getDesktopPreferenceSync<Partial<DesktopPermissions> | null>("desktop_permissions", null);
  if (runtimePermissions) {
    return {
      ...defaultDesktopPermissions,
      ...runtimePermissions,
    };
  }
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultDesktopPermissions;
    const parsed = JSON.parse(raw) as Partial<DesktopPermissions>;
    return {
      ...defaultDesktopPermissions,
      ...parsed,
    };
  } catch {
    return defaultDesktopPermissions;
  }
}

export function saveDesktopPermissions(
  permissions: DesktopPermissions,
  storageKey = "myraa_desktop_permissions",
) {
  if (!getNativeDesktopBridge()) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(permissions));
    } catch {}
  }
  void saveRuntimePermissions(permissions);
}
