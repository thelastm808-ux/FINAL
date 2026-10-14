import React, { useState, useEffect, useRef } from "react";
import { MyraaAudioSession, LiveState } from "./lib/audio";
import { MyraaCoreVisualizer, MyraaEmotion } from "./components/MyraaCoreVisualizer";
import { BrowserAgent } from "./components/BrowserAgent";
import { 
  Power, 
  Volume2, 
  Info, 
  Sparkles, 
  Globe, 
  Maximize2, 
  MessageSquareOff, 
  Compass, 
  CircleAlert,
  MicOff,
  Mic,
  X,
  Brain,
  Monitor,
  Play,
  Pause,
  Square,
  RefreshCw,
  Cloud,
  SlidersHorizontal
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Memory, MemoryCategory } from "./lib/memoryTypes";
import { MemoryDashboard } from "./components/MemoryDashboard";
import { WorkspacePanel } from "./components/WorkspacePanel";
import { initAuth, auth, db } from "./lib/firebase";
import { collection, setDoc, doc, serverTimestamp } from "firebase/firestore";
import { googleSheets, googleDocs, gmail, googleDrive } from "./lib/workspace";
import { User } from "firebase/auth";
import {
  DesktopPermissions,
  defaultDesktopPermissions,
  desktopPermissionLabels,
  getDesktopActionSummary,
  getDesktopPermissionForAction,
  isHighRiskDesktopAction,
  loadDesktopPermissions,
  saveDesktopPermissions,
  shouldStartDesktopVision
} from "./lib/desktopControl";
import {
  getDesktopPermissions as getNativeDesktopPermissions,
  getDesktopPreferenceSync,
  getDesktopRuntimeStatus,
  setDesktopPreference,
  runNativeDesktopAction,
  startNativeDesktopVision,
  stopNativeDesktopVision
} from "./lib/nativeDesktop";

export default function App() {
  const [state, setState] = useState<LiveState>("disconnected");

  // Real-time Screen Sharing states
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [isScreenSharingPaused, setIsScreenSharingPaused] = useState<boolean>(false);
  const [screenVisionMode, setScreenVisionMode] = useState<boolean>(true);
  const [showDesktopControls, setShowDesktopControls] = useState<boolean>(false);
  const [desktopPermissions, setDesktopPermissions] = useState<DesktopPermissions>(() => loadDesktopPermissions());
  const [desktopRuntimeStatus, setDesktopRuntimeStatus] = useState<{ status: string; message?: string }>({
    status: "starting",
  });
  const [desktopVisionPrompt, setDesktopVisionPrompt] = useState<string | null>(null);
  const [pendingDesktopAction, setPendingDesktopAction] = useState<{
    action: string;
    args: any;
    callback: (res: any) => void;
  } | null>(null);
  const [pendingVisionStop, setPendingVisionStop] = useState<boolean>(false);

  // References to preserve state across intervals
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenIntervalRef = useRef<any>(null);

  const isPausedRef = useRef<boolean>(false);
  const screenVisionRef = useRef<boolean>(true);
  const stateRef = useRef<LiveState>("disconnected");
  const screenIdleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentFrameRef = useRef<string | null>(null);
  const desktopAutoStartLockRef = useRef<boolean>(false);

  const resetScreenIdleTimer = () => {
    if (screenIdleTimeoutRef.current) clearTimeout(screenIdleTimeoutRef.current);
    screenIdleTimeoutRef.current = setTimeout(() => {
      if (screenStreamRef.current && sessionRef.current) {
        console.log("[Desktop Vision] Idle timeout reached. Asking to continue.");
        setDesktopVisionPrompt("Would you like me to look at anything else before I stop Desktop Vision?");
        setPendingVisionStop(true);
        sessionRef.current.sendTextMessage("[System Notification: Desktop Vision has been idle for 90 seconds. Please ask the user: 'Would you like me to look at anything else before I stop Desktop Vision?']");
      }
    }, 90000); // 90 seconds timeout
  };

  const persistDesktopPermissions = (nextPermissions: DesktopPermissions) => {
    setDesktopPermissions(nextPermissions);
    saveDesktopPermissions(nextPermissions);
  };

  const maybeAutoStartDesktopVision = async (text: string) => {
    if (!shouldStartDesktopVision(text) || desktopAutoStartLockRef.current || screenStreamRef.current) {
      return;
    }

    desktopAutoStartLockRef.current = true;
    setDesktopVisionPrompt("I’ll need to briefly see your desktop for that. Starting Desktop Vision now.");

    try {
      await startScreenSharing();
      setDesktopVisionPrompt(null);
      setPendingVisionStop(false);
    } finally {
      desktopAutoStartLockRef.current = false;
    }
  };

  const resolvePendingDesktopAction = (approved: boolean) => {
    if (!pendingDesktopAction) return;

    const { action, args, callback } = pendingDesktopAction;
    const summaryTarget = args?.target || args?.shortcut || (Array.isArray(args?.keys) ? args.keys.join("+") : undefined);
    const summary = getDesktopActionSummary(action, summaryTarget);

    if (approved) {
      void runNativeDesktopAction({
        action,
        target: args?.target,
        text: args?.text,
        path: args?.path,
        keys: args?.keys,
        shortcut: args?.shortcut,
        x: args?.x,
        y: args?.y,
        button: args?.button,
        direction: args?.direction,
        amount: args?.amount,
        confirm: true,
      }).then((result) => {
        if (result?.error) {
          callback({ error: result.error });
          setDesktopVisionPrompt(`Could not ${summary}.`);
          return;
        }
        callback({
          result: result?.result || `Completed ${summary}.`
        });
        setDesktopVisionPrompt(`Completed: ${summary}.`);
      }).catch((error) => {
        callback({ error: error?.message || `Could not ${summary}.` });
        setDesktopVisionPrompt(`Could not ${summary}.`);
      });
    } else {
      callback({
        error: `Cancelled ${summary}.`
      });
      setDesktopVisionPrompt(`Cancelled: ${summary}.`);
    }

    setPendingDesktopAction(null);
    window.setTimeout(() => setDesktopVisionPrompt(null), 1800);
  };

  const runDesktopBridgeAction = (
    action: string,
    args: Record<string, any>,
    callback: (res: any) => void,
  ) => {
    const permissionKey = getDesktopPermissionForAction(action);
    const summaryTarget = args?.target || args?.shortcut || (Array.isArray(args?.keys) ? args.keys.join("+") : undefined);
    const summary = getDesktopActionSummary(action, summaryTarget);

    if (permissionKey && !desktopPermissions[permissionKey]) {
      callback({
        error: `${desktopPermissionLabels[permissionKey]} is currently off. Open Desktop Controls to allow this capability.`
      });
      return;
    }

    if (isHighRiskDesktopAction(action)) {
      setPendingDesktopAction({ action, args, callback });
      setDesktopVisionPrompt(`I am about to ${summary}. Would you like me to continue?`);
      return;
    }

    if (!screenStreamRef.current && desktopPermissions.screenCapture) {
      void startScreenSharing();
    }

    setDesktopVisionPrompt(`Desktop Vision is ready to ${summary}.`);
    void runNativeDesktopAction({
      action,
      target: args?.target,
      text: args?.text,
      path: args?.path,
      keys: args?.keys,
      shortcut: args?.shortcut,
      x: args?.x,
      y: args?.y,
      button: args?.button,
      direction: args?.direction,
      amount: args?.amount,
      confirm: false,
    }).then((result) => {
      if (result?.error) {
        callback({ error: result.error });
        setDesktopVisionPrompt(`Could not ${summary}.`);
        return;
      }
      callback({
        result: result?.result || `Completed ${summary}.`
      });
      setDesktopVisionPrompt(`Completed: ${summary}.`);
    }).catch((error) => {
      callback({ error: error?.message || `Could not ${summary}.` });
      setDesktopVisionPrompt(`Could not ${summary}.`);
    });
  };

  // Sync state changes with refs to totally prevent stale closures in callbacks
  useEffect(() => {
    isPausedRef.current = isScreenSharingPaused;
  }, [isScreenSharingPaused]);

  useEffect(() => {
    screenVisionRef.current = screenVisionMode;
  }, [screenVisionMode]);

  useEffect(() => {
    void getDesktopRuntimeStatus()
      .then((status) => {
        setDesktopRuntimeStatus(status);
      })
      .catch(() => {
        setDesktopRuntimeStatus({
          status: "unavailable",
          message: "Native desktop bridge is not available.",
        });
      });
  }, []);

  useEffect(() => {
    saveDesktopPermissions(desktopPermissions);
  }, [desktopPermissions]);

  useEffect(() => {
    void getNativeDesktopPermissions()
      .then((permissions) => {
        const keys = Object.keys(defaultDesktopPermissions) as (keyof DesktopPermissions)[];
        if (permissions && Object.keys(permissions).length > 0) {
          const merged = { ...defaultDesktopPermissions } as DesktopPermissions;
          keys.forEach((key) => {
            if (typeof permissions[key] === "boolean") {
              merged[key] = permissions[key];
            }
          });
          setDesktopPermissions(merged);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Clean up streaming intervals on unmount
  useEffect(() => {
    return () => {
      if (screenIntervalRef.current) {
        clearInterval(screenIntervalRef.current);
      }
    };
  }, []);

  const captureFrameAndSend = () => {
    const video = screenVideoRef.current;
    if (!video || isPausedRef.current || !screenVisionRef.current) {
      return;
    }

    if (stateRef.current === "disconnected" || stateRef.current === "speaking") {
      return;
    }

    try {
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      if (!screenCanvasRef.current) {
        screenCanvasRef.current = document.createElement("canvas");
      }
      const canvas = screenCanvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Restrict maximum resolution size to keep payload light for Gemini Live
      const maxDim = 960;
      let width = video.videoWidth;
      let height = video.videoHeight;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(video, 0, 0, width, height);

      // Highly compressed JPEG standard is optimized and preserves details perfectly
      const dataUrl = canvas.toDataURL("image/jpeg", 0.55);
      const base64 = dataUrl.split(",")[1];

      // Avoid sending duplicate frames to save tokens
      if (lastSentFrameRef.current === base64) {
        return;
      }
      lastSentFrameRef.current = base64;

      if (sessionRef.current && stateRef.current !== "disconnected") {
        sessionRef.current.sendVideoFrame(base64);
      }
    } catch (err) {
      console.error("[Screen Capture] Failed drawing frame to canvas:", err);
    }
  };

  const startScreenSharing = async () => {
    setErrorText(null);
    setDesktopVisionPrompt("Starting Desktop Vision...");
    try {
      const response = await startNativeDesktopVision();
      if (response.error) {
        throw new Error(response.error);
      }

      setIsScreenSharing(true);
      setIsScreenSharingPaused(false);
      setPendingVisionStop(false);
      setDesktopVisionPrompt(null);
      resetScreenIdleTimer();
      return true;

    } catch (e: any) {
      console.error("Native Desktop Vision startup failed:", e);
      setErrorText(`Could not start Desktop Vision: ${e.message || e}`);
      setDesktopVisionPrompt(null);
      return false;
    }
  };

  const stopScreenSharing = () => {
    if (screenIntervalRef.current) {
      clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
    }

    if (screenIdleTimeoutRef.current) {
      clearTimeout(screenIdleTimeoutRef.current);
      screenIdleTimeoutRef.current = null;
    }

    lastSentFrameRef.current = null;
    void stopNativeDesktopVision();
    screenStreamRef.current = null;
    screenVideoRef.current = null;

    setIsScreenSharing(false);
    setIsScreenSharingPaused(false);
    setPendingVisionStop(false);
    if (pendingDesktopAction) {
      pendingDesktopAction.callback({ error: "Desktop Vision stopped before the pending action could be confirmed." });
    }
    setPendingDesktopAction(null);
    setDesktopVisionPrompt(null);
  };

  const pauseScreenSharing = () => {
    setIsScreenSharingPaused(true);
  };

  const resumeScreenSharing = () => {
    setIsScreenSharingPaused(false);
    // Refresh first frame immediately
    setTimeout(() => {
      captureFrameAndSend();
    }, 100);
  };

  const switchScreenShare = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
    }
    await startScreenSharing();
  };

  const [activeEmotion, setActiveEmotion] = useState<MyraaEmotion>("idle");
  const [themeColor, setThemeColor] = useState<string>("charcoal");
  const [userCaption, setUserCaption] = useState<string>("");
  const [characterState, setCharacterState] = useState<"idle" | "thinking" | "talking">("idle");

  const detectEmotionFromText = (text: string): MyraaEmotion => {
    const lower = text.toLowerCase();
    if (lower.includes("haha") || lower.includes("lol") || lower.includes("funny") || lower.includes("joke") || lower.includes("hehe") || lower.includes("wink")) return "playful";
    if (lower.includes("happy") || lower.includes("harmony") || lower.includes("glad") || lower.includes("joy") || lower.includes("wonderful") || lower.includes("love") || lower.includes("smile")) return "happy";
    if (lower.includes("wow") || lower.includes("awesome") || lower.includes("excited") || lower.includes("amazing") || lower.includes("yay") || lower.includes("incredible") || lower.includes("hype")) return "excited";
    if (lower.includes("really?") || lower.includes("curious") || lower.includes("interest") || lower.includes("tell me more") || lower.includes("why") || lower.includes("how") || lower.includes("wonder")) return "curious";
    if (lower.includes("think") || lower.includes("calculat") || lower.includes("analyz") || lower.includes("hmmm") || lower.includes("process") || lower.includes("let me see") || lower.includes("conclude")) return "thinking";
    if (lower.includes("proud") || lower.includes("achieved") || lower.includes("expert") || lower.includes("skill") || lower.includes("confidence") || lower.includes("succeed")) return "proud";
    if (lower.includes("sad") || lower.includes("sorry") || lower.includes("unfortunate") || lower.includes("grief") || lower.includes("bad") || lower.includes("regret") || lower.includes("alas") || lower.includes("cry")) return "sad";
    if (lower.includes("shock") || lower.includes("surprise") || lower.includes("gasp") || lower.includes("unexpected") || lower.includes("seriously") || lower.includes("oh my")) return "surprised";
    if (lower.includes("blush") || lower.includes("shy") || lower.includes("embarrass") || lower.includes("nervous") || lower.includes("oops") || lower.includes("sorry about")) return "embarrassed";
    if (lower.includes("what?") || lower.includes("confus") || lower.includes("puzzled") || lower.includes("dont know") || lower.includes("not sure") || lower.includes("wait")) return "confused";
    return "idle";
  };
  const [modelCaption, setModelCaption] = useState<string>("");
  const [activeProjectorUrl, setActiveProjectorUrl] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Myraa Autopilot system controller state
  const [browserTrigger, setBrowserTrigger] = useState<{
    type: string;
    args: any;
    id: string;
    callback: (res: any) => void;
  } | null>(null);

  // Myraa recollections database core state
  const [memories, setMemories] = useState<Memory[]>([]);
  const [showMemoryDashboard, setShowMemoryDashboard] = useState<boolean>(false);

  const [sessionId] = useState(() => {
    const runtimeId = getDesktopPreferenceSync<string | null>("myraa_session_id", null);
    if (runtimeId) return runtimeId;
    let sId = sessionStorage.getItem("myraa_session_id");
    if (!sId) {
      sId = "sess_" + Math.random().toString(36).substring(2, 11);
      sessionStorage.setItem("myraa_session_id", sId);
    }
    void setDesktopPreference("myraa_session_id", sId);
    return sId;
  });

  const [conversationId] = useState(() => {
    const runtimeId = getDesktopPreferenceSync<string | null>("myraa_conversation_id", null);
    if (runtimeId) return runtimeId;
    let cId = localStorage.getItem("myraa_conversation_id");
    if (!cId) {
      cId = "conv_" + Math.random().toString(36).substring(2, 11);
      localStorage.setItem("myraa_conversation_id", cId);
    }
    void setDesktopPreference("myraa_conversation_id", cId);
    return cId;
  });

  // Google Workspace & Firebase States
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [showWorkspacePanel, setShowWorkspacePanel] = useState<boolean>(false);

  const [voiceName, setVoiceName] = useState<string>("Kore");

  useEffect(() => {
    const runtimeVoice = getDesktopPreferenceSync<string | null>("myraa_voice", null);
    const savedVoice = runtimeVoice || localStorage.getItem("myraa_voice");
    if (savedVoice) {
      setVoiceName(savedVoice);
    }
  }, []);

  const handleVoiceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVoice = e.target.value;
    setVoiceName(newVoice);
    if (!getDesktopPreferenceSync<string | null>("myraa_voice", null)) {
      localStorage.setItem("myraa_voice", newVoice);
    }
    void setDesktopPreference("myraa_voice", newVoice);
    
    // Transparently restart if connected
    if (state !== "disconnected" && sessionRef.current) {
      sessionRef.current.disconnect();
      // Wait for disconnect to complete before reconnecting
      setTimeout(async () => {
        const uId = firebaseUser?.uid || "anonymous";
        if (sessionRef.current) await sessionRef.current.connect(newVoice, uId, conversationId, sessionId);
      }, 300);
    }
  };

  const googleAccessTokenRef = useRef<string | null>(null);
  const firebaseUserRef = useRef<User | null>(null);

  useEffect(() => {
    googleAccessTokenRef.current = googleAccessToken;
  }, [googleAccessToken]);

  useEffect(() => {
    firebaseUserRef.current = firebaseUser;
  }, [firebaseUser]);

  const sessionRef = useRef<MyraaAudioSession | null>(null);

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setFirebaseUser(user);
        setGoogleAccessToken(token);
      },
      () => {
        setFirebaseUser(null);
        setGoogleAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Helper functions for Workspace Tools to interact with Firebase
  const handleAddWorkspaceItem = async (type: "doc" | "sheet", fileId: string, customName: string) => {
    if (!auth.currentUser || !fileId || !customName) return;
    try {
      const itemsRef = collection(db, "users", auth.currentUser.uid, "workspace_items");
      const itemId = Math.random().toString(36).substring(2, 11);
      const newItem = {
        id: itemId,
        userId: auth.currentUser.uid,
        name: customName,
        type,
        fileId,
        url: type === "sheet" 
          ? `https://docs.google.com/spreadsheets/d/${fileId}`
          : `https://docs.google.com/document/d/${fileId}`,
        addedAt: serverTimestamp()
      };
      await setDoc(doc(db, "users", auth.currentUser.uid, "workspace_items", itemId), newItem);
      await logWorkspaceAction("Reference Saved", `Automatically linked Google ${type === "sheet" ? "Sheet" : "Doc"} named '${customName}'`);
    } catch (err) {
      console.error("Failed to auto save reference in Firestore:", err);
    }
  };

  const logWorkspaceAction = async (actionType: string, details: string) => {
    if (!auth.currentUser) return;
    try {
      const logsRef = collection(db, "users", auth.currentUser.uid, "workspace_logs");
      const logId = Math.random().toString(36).substring(2, 11);
      const newLog = {
        id: logId,
        userId: auth.currentUser.uid,
        actionType,
        details,
        timestamp: serverTimestamp()
      };
      await setDoc(doc(db, "users", auth.currentUser.uid, "workspace_logs", logId), newLog);
    } catch (e) {
      console.error("Failed to append automatic audit log:", e);
    }
  };

  // Fetch initial recollections from backend database
  useEffect(() => {
    const userId = firebaseUser?.uid || "anonymous";
    fetch(`/api/memories?userId=${encodeURIComponent(userId)}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMemories(data);
        }
      })
      .catch(err => console.error("Initial persistent recollections load failure:", err));
  }, [firebaseUser]);

  const handleAddManualMemory = async (category: MemoryCategory, text: string) => {
    try {
      const userId = firebaseUser?.uid || "anonymous";
      const resp = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, text, userId })
      });
      const saved = await resp.json();
      if (saved && saved.id) {
        setMemories((prev) => [...prev, saved]);
      }
    } catch (err) {
      console.error("Manual database recollect upload error:", err);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      const userId = firebaseUser?.uid || "anonymous";
      const resp = await fetch(`/api/memories/${id}?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE"
      });
      const resObj = await resp.json();
      if (resObj && resObj.success) {
        setMemories((prev) => prev.filter(m => m.id !== id));
      }
    } catch (err) {
      console.error("Manual memory delete execution failed:", err);
    }
  };

  // Initialize the audio session handlers once on mount
  useEffect(() => {
    sessionRef.current = new MyraaAudioSession({
      onStateChange: (newState) => {
        setState(newState);
        if (newState === "disconnected") {
          // Reset captions on disconnect
          setUserCaption("");
          setModelCaption("");
          setActiveEmotion("idle");
          setCharacterState("idle");
        } else if (newState === "listening") {
          // Return to receptive resting state
          setActiveEmotion("idle");
          setCharacterState("idle");
        } else if (newState === "speaking") {
          setCharacterState("talking");
        }
      },
      onTranscription: (role, text) => {
        resetScreenIdleTimer();
        if (role === "user") {
          setUserCaption(text);
          // Auto-clear the other caption when user starts talking
          setModelCaption("");
          setCharacterState("thinking");
          void maybeAutoStartDesktopVision(text);
          const lower = text.toLowerCase();
          if (screenStreamRef.current && /that's all|thank you|stop looking|stop desktop vision|stop vision|done/i.test(lower)) {
            setDesktopVisionPrompt("Would you like me to look at anything else before I stop Desktop Vision?");
            setPendingVisionStop(true);
          }
        } else if (role === "model") {
          setModelCaption((prev) => {
            const next = prev + text;
            const newEmotion = detectEmotionFromText(next);
            setActiveEmotion(newEmotion);
            return next;
          });
          // Clear user caption when model replies
          setUserCaption("");
        }
      },
      onToolCall: (name, args, callback) => {
        console.log(`[App] Tool call triggered: ${name}`, args);
        
        const browserTools = [
          "browserOpen",
          "browserSearch",
          "browserClick",
          "browserMediaControl",
          "browserScroll",
          "browserType",
          "browserGoBack",
          "browserTabAction",
          "openWebsite"
        ];

        if (browserTools.includes(name)) {
          // Bring up the Holographic Browser Controller if it is not active
          if (!activeProjectorUrl) {
            let startingUrl = "https://youtube.com";
            if ((name === "browserOpen" || name === "openWebsite") && args.url) {
              startingUrl = args.url;
            }
            setActiveProjectorUrl(startingUrl);
          }

          // Map instructions directly onto Browser Agent
          setBrowserTrigger({
            type: name === "openWebsite" ? "browserOpen" : name,
            args,
            id: Math.random().toString(),
            callback: (res) => {
              callback(res);
              setBrowserTrigger(null);
            }
          });
        } else if (name === "changeBackground") {
          const colorName = args.color?.toLowerCase();
          const validColors = ["violet", "crimson", "emerald", "celestial", "gold", "rose", "charcoal"];
          
          if (colorName && validColors.includes(colorName)) {
            setThemeColor(colorName);
            callback({ result: `Successfully shifted aesthetic atmosphere to ${colorName}.` });
          } else {
            callback({ error: `Unsupported color '${colorName}'. Supported themes are: ${validColors.join(", ")}` });
          }
        } else if (name === "startVisionSession") {
          if (!screenStreamRef.current) {
            startScreenSharing().then((success) => {
              if (success) {
                callback({ result: "Desktop Vision session started successfully. Myraa can now see the desktop." });
              } else {
                callback({ error: "Failed to start Desktop Vision. The user may have denied the permission." });
              }
            }).catch((err) => {
              callback({ error: `Failed to start Desktop Vision: ${err.message || err}` });
            });
          } else {
            callback({ result: "Desktop Vision is already active." });
          }
        } else if (name === "stopVisionSession") {
          if (screenStreamRef.current) {
            stopScreenSharing();
            callback({ result: "Desktop Vision session stopped successfully." });
          } else {
            callback({ result: "Desktop Vision is already stopped." });
          }
        } else if (name === "desktopHotkey") {
          runDesktopBridgeAction("hotkey", {
            keys: Array.isArray(args.keys) ? args.keys : undefined,
            shortcut: args.shortcut,
            target: args.target,
          }, callback);
        } else if (name === "desktopMouse") {
          const mouseAction = String(args.action || "move").toLowerCase();
          const mappedAction =
            mouseAction === "move" ? "moveMouse" :
            mouseAction === "click" ? "click" :
            mouseAction === "drag" ? "dragMouse" :
            mouseAction === "scroll" ? "scroll" :
            mouseAction;
          runDesktopBridgeAction(mappedAction, {
            x: args.x,
            y: args.y,
            button: args.button,
            direction: args.direction,
            amount: args.amount,
            target: args.target,
          }, callback);
        } else if (name === "desktopClipboard") {
          const clipboardAction = String(args.action || "read").toLowerCase() === "write" ? "clipboardWrite" : "clipboardRead";
          runDesktopBridgeAction(clipboardAction, {
            text: args.text,
            target: args.target,
          }, callback);
        } else if (name === "desktopAction") {
          const action = args.action || args.command || "unknown";
          runDesktopBridgeAction(action, args, callback);
        } else if ([
          "createSpreadsheet",
          "getSpreadsheetData",
          "appendSpreadsheetRow",
          "listGmailEmails",
          "getGmailEmail",
          "sendGmailEmail",
          "createGoogleDoc",
          "getGoogleDocContent",
          "appendGoogleDocText",
          "searchGoogleDrive"
        ].includes(name)) {
          const currentToken = googleAccessTokenRef.current;
          if (!currentToken) {
            callback({ error: "TECH is currently offline. Please ask TECH to securely link their Google Account via the visual Workspace Panel first, so I can access their workspace files!" });
          } else {
            if (name === "searchGoogleDrive") {
              googleDrive.listFiles(currentToken, args.q, args.maxResults)
                .then((res) => callback({ result: res }))
                .catch((err) => callback({ error: err.message || "Failed to search Google Drive." }));
            } else if (name === "createSpreadsheet") {
              googleSheets.create(currentToken, args.title)
                .then((res) => {
                  handleAddWorkspaceItem("sheet", res.spreadsheetId, res.title);
                  callback({ result: `Spreadsheet '${res.title}' created successfully! Spreadsheet ID: ${res.spreadsheetId}. Link: ${res.spreadsheetUrl}` });
                })
                .catch((err) => callback({ error: err.message || "Failed to create spreadsheet." }));
            } else if (name === "getSpreadsheetData") {
              googleSheets.getData(currentToken, args.spreadsheetId, args.range)
                .then((res) => callback({ result: res }))
                .catch((err) => callback({ error: err.message || "Failed to fetch spreadsheet data." }));
            } else if (name === "appendSpreadsheetRow") {
              googleSheets.appendRow(currentToken, args.spreadsheetId, args.values, args.range)
                .then(() => {
                  logWorkspaceAction("Row Appended", `Automatically appended row values: [${args.values.join(", ")}]`);
                  callback({ result: "Row appended successfully." });
                })
                .catch((err) => callback({ error: err.message || "Failed to append row." }));
            } else if (name === "listGmailEmails") {
              gmail.listEmails(currentToken, args.query, args.maxResults)
                .then((res) => callback({ result: res }))
                .catch((err) => callback({ error: err.message || "Failed to list emails." }));
            } else if (name === "getGmailEmail") {
              gmail.getEmail(currentToken, args.messageId)
                .then((res) => callback({ result: res }))
                .catch((err) => callback({ error: err.message || "Failed to fetch email content." }));
            } else if (name === "sendGmailEmail") {
              gmail.sendEmail(currentToken, args.to, args.subject, args.body)
                .then(() => {
                  logWorkspaceAction("Gmail Sent", `Sent email to <${args.to}> with subject: "${args.subject}"`);
                  callback({ result: `Email sent successfully to ${args.to}!` });
                })
                .catch((err) => callback({ error: err.message || "Failed to send email." }));
            } else if (name === "createGoogleDoc") {
              googleDocs.create(currentToken, args.title, args.initialText)
                .then((res) => {
                  handleAddWorkspaceItem("doc", res.documentId, res.title);
                  callback({ result: `Google Doc '${res.title}' created successfully! Document ID: ${res.documentId}` });
                })
                .catch((err) => callback({ error: err.message || "Failed to create document." }));
            } else if (name === "getGoogleDocContent") {
              googleDocs.getContent(currentToken, args.documentId)
                .then((res) => callback({ result: res }))
                .catch((err) => callback({ error: err.message || "Failed to fetch document content." }));
            } else if (name === "appendGoogleDocText") {
              googleDocs.appendText(currentToken, args.documentId, args.text)
                .then(() => {
                  logWorkspaceAction("Google Doc Appended", `Appended text: "${args.text}"`);
                  callback({ result: "Text successfully appended." });
                })
                .catch((err) => callback({ error: err.message || "Failed to append text." }));
            }
          }
        } else {
          callback({ error: `Tool ${name} is not implemented.` });
        }
      },
      onError: (err) => {
        setErrorText(err);
      },
      onMemorySync: (updatedMemories) => {
        console.log("[App] WebSocket memories sync triggered:", updatedMemories);
        if (Array.isArray(updatedMemories)) {
          setMemories(updatedMemories);
        }
      }
    });

    return () => {
      if (sessionRef.current) {
        sessionRef.current.disconnect();
      }
    };
  }, []);

  const handleToggleConnection = async () => {
    setErrorText(null);
    if (!sessionRef.current) return;

    if (state === "disconnected") {
      const uId = firebaseUser?.uid || "anonymous";
      await sessionRef.current.connect(voiceName, uId, conversationId, sessionId);
    } else {
      sessionRef.current.disconnect();
    }
  };

  // Maps theme colors to CSS ambient light spots
  const getAmbientStyles = () => {
    switch (themeColor) {
      case "violet":
        return "from-purple-950/40 via-violet-950/20 to-slate-950";
      case "crimson":
        return "from-red-950/40 via-orange-950/20 to-slate-950";
      case "emerald":
        return "from-emerald-950/40 via-teal-950/20 to-slate-950";
      case "celestial":
        return "from-sky-950/45 via-indigo-950/25 to-slate-950";
      case "gold":
        return "from-amber-950/30 via-yellow-950/15 to-slate-950";
      case "rose":
        return "from-rose-950/40 via-pink-950/20 to-slate-950";
      case "charcoal":
      default:
        return "from-slate-900/50 via-slate-950/30 to-slate-950";
    }
  };

  const getThemeTextGlow = () => {
    switch (themeColor) {
      case "violet": return "text-purple-400 drop-shadow-[0_0_12px_rgba(168,85,247,0.5)]";
      case "crimson": return "text-rose-400 drop-shadow-[0_0_12px_rgba(244,63,94,0.5)]";
      case "emerald": return "text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.5)]";
      case "celestial": return "text-sky-400 drop-shadow-[0_0_12px_rgba(14,165,233,0.5)]";
      case "gold": return "text-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.5)]";
      case "rose": return "text-pink-400 drop-shadow-[0_0_12px_rgba(244,63,94,0.5)]";
      case "charcoal":
      default:
        return "text-indigo-400 drop-shadow-[0_0_12px_rgba(99,102,241,0.5)]";
    }
  };

  const getOrbRingColor = () => {
    switch (state) {
      case "listening": return "border-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.3)] bg-indigo-500/10";
      case "speaking": return "border-purple-500/70 shadow-[0_0_40px_rgba(168,85,247,0.4)] bg-purple-500/10";
      case "connecting": return "border-amber-500/50 animate-pulse bg-amber-500/10";
      case "disconnected":
      default:
        return "border-white/10 hover:border-indigo-500/30 bg-white/5";
    }
  };

  return (
    <div
      id="myraa-holographic-desktop"
      className={`relative w-full h-screen overflow-hidden bg-[#020205] text-white ${getAmbientStyles()} theme-transition flex flex-col justify-between p-6 sm:p-10 select-none`}
    >
      {/* Ambient Background Gradients matching Frosted Glass theme */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-900/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-cyan-900/15 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute top-[20%] right-[10%] w-[300px] h-[300px] bg-indigo-800/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Decorative grid pattern background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none opacity-40" />

      {/* FULL VIEWPORT HOLOGRAPHIC STAGE: Myraa materializes across the entire screen */}
      <div className="absolute inset-0 z-0 pointer-events-none select-none">
        <MyraaCoreVisualizer
          session={sessionRef.current}
          state={state}
          themeColor={themeColor}
          activeEmotion={activeEmotion}
          characterState={characterState}
        />
      </div>

      {/* HEADER SECTION - Minimalist typography */}
      <header className="relative z-30 flex items-center justify-between w-full max-w-5xl mx-auto select-none">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-[0.4em] text-white/50 uppercase font-sans">
            Myraa
          </span>
          <div className={`w-1.5 h-1.5 rounded-full ${
            state === "listening" || state === "speaking" 
              ? "bg-cyan-400" 
              : "bg-white/10"
          }`} />
        </div>

        <div className="flex items-center gap-5">
          <div className="relative group">
            <button className="flex items-center gap-1 opacity-25 hover:opacity-100 text-white transition text-xs font-mono tracking-widest cursor-pointer">
              <Mic size={14} />
              <span className="hidden sm:inline">VOICE: {voiceName.toUpperCase()}</span>
            </button>
            <div className="absolute right-0 mt-2 p-1.5 w-32 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              {['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede'].map(v => (
                <button
                  key={v}
                  onClick={() => handleVoiceChange({ target: { value: v } } as any)}
                  className={`block w-full text-left px-3 py-1.5 text-xs font-mono rounded-md transition-colors ${
                    voiceName === v ? "bg-cyan-500/20 text-cyan-300" : "text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-500/15 bg-cyan-500/5 text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-300">
            <span className={`w-2 h-2 rounded-full ${desktopRuntimeStatus.status === "ready" ? "bg-cyan-400" : desktopRuntimeStatus.status === "error" ? "bg-rose-400" : "bg-amber-400 animate-pulse"}`} />
            <span>Desktop Runtime {desktopRuntimeStatus.status}</span>
          </div>

          {/* Faint utilities hidden in margin */}
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center gap-1 opacity-25 hover:opacity-100 text-white transition text-xs font-mono tracking-widest cursor-pointer"
            title="Sway Themes and Info"
          >
            <Compass size={14} />
            <span className="hidden sm:inline">TOPICS</span>
          </button>

          <button
            onClick={() => setShowWorkspacePanel(!showWorkspacePanel)}
            className="flex items-center gap-1 opacity-25 hover:opacity-100 text-white transition text-xs font-mono tracking-widest cursor-pointer"
            title="Google Workspace & Firebase Logs"
          >
            <Cloud size={14} />
            <span className="hidden sm:inline">WORKSPACE</span>
          </button>
          
          <button
            onClick={() => setShowMemoryDashboard(!showMemoryDashboard)}
            className="flex items-center gap-1 opacity-25 hover:opacity-100 text-white transition text-xs font-mono tracking-widest cursor-pointer"
            title="Recollections Database"
          >
            <Brain size={14} />
            <span className="hidden sm:inline">RECALLS</span>
          </button>

          <button
            onClick={() => setShowDesktopControls(!showDesktopControls)}
            className="flex items-center gap-1 opacity-25 hover:opacity-100 text-white transition text-xs font-mono tracking-widest cursor-pointer"
            title="Desktop Vision Permissions"
          >
            <SlidersHorizontal size={14} />
            <span className="hidden sm:inline">DESKTOP</span>
          </button>

          {/* Desktop Vision fallback toggle for the browser prototype */}
          <button 
            onClick={isScreenSharing ? stopScreenSharing : startScreenSharing}
            className={`flex items-center gap-1.5 transition text-xs font-mono tracking-widest cursor-pointer ${
              isScreenSharing 
                ? "text-cyan-400 opacity-100 font-semibold" 
                : "opacity-25 hover:opacity-100 text-white"
            }`}
            title="Start Desktop Vision"
          >
            <Monitor size={14} className={isScreenSharing && !isScreenSharingPaused ? "animate-pulse text-cyan-400" : ""} />
            <span>{isScreenSharing ? "VISION ON" : "VISION"}</span>
          </button>
        </div>
      </header>

      {/* CORE AVATAR AND VISUALS */}
      <main className="relative z-10 flex-1 w-full max-w-4xl mx-auto flex flex-col items-center justify-between py-6">
        
        {/* Holographic Projection Screen Widget (if website opened) */}
        <AnimatePresence>
          {activeProjectorUrl && (
            <div className="absolute inset-x-0 top-0 z-30 flex justify-center p-2">
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                className="flex items-center justify-between gap-4 p-3.5 rounded-2xl border border-indigo-500/20 bg-indigo-950/45 backdrop-blur-xl shadow-lg w-full max-w-md"
              >
                <div className="flex items-center gap-3 overflow-hidden text-left">
                  <div className="p-2 ml-1 rounded-xl bg-indigo-500/20 text-indigo-300">
                    <Globe size={18} />
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-xs font-bold font-mono tracking-wide text-indigo-200 uppercase">Holographic Projection Broadcast</h4>
                    <p className="text-xs text-indigo-400 truncate max-w-[200px]">{activeProjectorUrl}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveProjectorUrl(activeProjectorUrl)}
                    className="p-2 rounded-xl bg-indigo-500 text-white hover:bg-indigo-400 transition"
                    title="View Frame"
                  >
                    <Maximize2 size={14} />
                  </button>
                  <button
                    onClick={() => setActiveProjectorUrl(null)}
                    className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Space Spacer to avoid head area */}
        <div className="h-10 sm:h-20" />

        <AnimatePresence>
          {desktopVisionPrompt && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              className="w-full max-w-xl mx-auto mb-4 px-4"
            >
              <div className="rounded-2xl border border-cyan-500/20 bg-slate-950/80 backdrop-blur-xl shadow-xl px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2.5 h-2.5 rounded-full ${isScreenSharing ? "bg-cyan-400 animate-pulse" : "bg-amber-400"}`} />
                  <p className="text-xs sm:text-sm text-slate-100 font-medium leading-relaxed">{desktopVisionPrompt}</p>
                </div>
                {pendingVisionStop && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setPendingVisionStop(false);
                        setDesktopVisionPrompt("Continuing Desktop Vision.");
                      }}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 text-[10px] font-mono uppercase tracking-widest"
                    >
                      Keep Looking
                    </button>
                    <button
                      onClick={() => stopScreenSharing()}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 text-[10px] font-mono uppercase tracking-widest"
                    >
                      Stop Vision
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cinematic dialogue layer overlay - Smooth, delicate text transitions with soft focus blur */}
        <div id="cinematic-subtitles" className="w-full max-w-3xl flex flex-col items-center justify-center text-center px-6 relative z-25 mt-auto mb-6 pointer-events-none min-h-[6rem]">
          <AnimatePresence mode="wait">
            {(() => {
              const textType = modelCaption 
                ? "model" 
                : userCaption 
                  ? "user" 
                  : "status";

              const activeText = modelCaption 
                ? modelCaption 
                : userCaption 
                  ? userCaption 
                  : state === "listening" 
                    ? "I am listening. Say the word..." 
                    : state === "connecting" 
                      ? "Starting the desktop voice link..." 
                      : "Myraa is ready. Press the power button or speak to begin.";

              return (
                <motion.div
                  key={textType}
                  initial={{ opacity: 0, y: 15, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -15, filter: "blur(6px)" }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col items-center justify-center w-full"
                >
                  {textType === "model" && (
                    <h2 className="text-xl sm:text-2xl font-light text-white leading-relaxed tracking-wide font-display max-w-2xl drop-shadow-[0_2px_20px_rgba(0,0,0,0.9)]">
                      {activeText}
                    </h2>
                  )}

                  {textType === "user" && (
                    <p className="text-cyan-300 font-mono text-sm sm:text-base tracking-wider flex items-center justify-center gap-2 drop-shadow-[0_1px_10px_rgba(0,0,0,0.85)] font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span>&ldquo;{activeText}&rdquo;</span>
                    </p>
                  )}

                  {textType === "status" && (
                    <span className="text-xs sm:text-sm uppercase tracking-[0.3em] font-medium text-white/30 font-sans tracking-widest drop-shadow-[0_1px_4px_rgba(0, 0, 0, 0.5)]">
                      {activeText}
                    </span>
                  )}
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>

        {/* Interactive suggestions prompt guide */}
        <AnimatePresence>
          {showGuide && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="mt-6 p-5 rounded-2xl border border-white/10 bg-slate-900/85 backdrop-blur-2xl max-w-md text-left w-full absolute z-40 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-3 text-white">
                <div className="flex items-center gap-1.5 font-display text-sm font-bold tracking-wide">
                  <Compass size={16} className="text-indigo-400" />
                  <span>PLAYFUL CORE SUGGESTIONS</span>
                </div>
                <button 
                  onClick={() => setShowGuide(false)}
                  className="text-slate-400 hover:text-white transition"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-4 font-mono leading-relaxed">
                Myraa is equipped with dynamic visual modules and standard text browser projectors. Here are clever triggers to try speaking aloud:
              </p>
              <div className="space-y-2 text-xs font-serif italic text-indigo-300">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition cursor-pointer font-sans normal-case text-slate-200">
                  ⚡ &quot;Myraa, change atmosphere of your core to crimson&quot; <span className="text-[10px] font-mono text-indigo-400 block mt-0.5 font-medium">Shifts theme color background</span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition cursor-pointer font-sans normal-case text-slate-200">
                  ⚡ &quot;Open youtube.com on my screen please&quot; <span className="text-[10px] font-mono text-indigo-400 block mt-0.5 font-medium">Invokes browser projector panel</span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition cursor-pointer font-sans normal-case text-slate-200">
                  ⚡ &quot;Tell me a witty joke and change background to gold&quot; <span className="text-[10px] font-mono text-indigo-400 block mt-0.5 font-medium">Combines tools & voice</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showDesktopControls && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="mt-6 p-5 rounded-2xl border border-cyan-500/15 bg-slate-950/90 backdrop-blur-2xl max-w-2xl text-left w-full absolute z-40 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-3 text-white">
                <div className="flex items-center gap-1.5 font-display text-sm font-bold tracking-wide">
                  <SlidersHorizontal size={16} className="text-cyan-400" />
                  <span>DESKTOP CONTROL PERMISSIONS</span>
                </div>
                <button
                  onClick={() => setShowDesktopControls(false)}
                  className="text-slate-400 hover:text-white transition"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-4 font-mono leading-relaxed">
                These controls are the policy layer for Myraa&apos;s future Windows desktop bridge. Screen capture is enabled by default; everything else can be switched on independently.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Object.keys(desktopPermissions) as (keyof DesktopPermissions)[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      const next = { ...desktopPermissions, [key]: !desktopPermissions[key] };
                      persistDesktopPermissions(next);
                    }}
                    className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-xs font-mono transition ${
                      desktopPermissions[key]
                        ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-200"
                        : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    <span className="text-left">{desktopPermissionLabels[key]}</span>
                    <span className="text-[9px] uppercase tracking-[0.28em]">
                      {desktopPermissions[key] ? "On" : "Off"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                <span>High-risk actions will still ask for confirmation.</span>
                <button
                  onClick={() => persistDesktopPermissions(defaultDesktopPermissions)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300"
                >
                  Reset Defaults
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Error Banner */}
        <AnimatePresence>
          {errorText && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="mt-6 flex items-start gap-3 p-4 rounded-2xl border border-rose-500/20 bg-rose-950/40 backdrop-blur-xl max-w-md w-full text-left"
            >
              <CircleAlert className="text-rose-400 shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-rose-300 font-mono">Core Error Protocol</h4>
                <p className="text-xs text-rose-200 mt-1 leading-relaxed">{errorText}</p>
                <button
                  onClick={() => setErrorText(null)}
                  className="mt-2 text-[10px] font-bold text-rose-400 underline font-mono uppercase"
                >
                  Dismiss Code
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {pendingDesktopAction && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              className="mt-4 p-4 rounded-2xl border border-amber-500/20 bg-slate-950/90 backdrop-blur-xl max-w-md w-full text-left shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse mt-1.5 shrink-0" />
                <div className="flex-1">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-amber-300 font-mono">Confirmation Required</h4>
                  <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                    {`Myraa is about to ${getDesktopActionSummary(pendingDesktopAction.action, pendingDesktopAction.args?.target)}.`}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    The native desktop bridge will only proceed after you confirm.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => resolvePendingDesktopAction(true)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/20 text-amber-200 text-[10px] font-mono uppercase tracking-widest"
                    >
                      Continue
                    </button>
                    <button
                      onClick={() => resolvePendingDesktopAction(false)}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-mono uppercase tracking-widest"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* FOOTER INTERFACE WITH WAVEFORM AND CONTROLS */}
      <footer className="relative z-10 w-full max-w-2xl mx-auto flex flex-col items-center gap-5 mt-auto">
        
        {/* Dynamic Minimalist Waveform Visualizer */}
        <div className="flex items-center justify-center gap-1 h-8 w-44">
          {[12, 28, 16, 32, 20, 8].map((baseHeight, idx) => {
            let heightFactor = 0.35;
            if (state === "speaking") {
              heightFactor = 0.35 + Math.sin(Date.now() * 0.02 + idx * 0.9) * 0.65;
            } else if (state === "listening") {
              heightFactor = 0.2 + Math.sin(Date.now() * 0.01 + idx * 0.5) * 0.4;
            } else {
              heightFactor = idx % 2 === 0 ? 0.25 : 0.12;
            }
            const calculatedHeight = Math.max(3, baseHeight * heightFactor);

            return (
              <div
                key={idx}
                className={`w-0.5 rounded-full transition-all duration-300 ${
                  state === "speaking" ? "bg-purple-400" : state === "listening" ? "bg-cyan-400" : "bg-white/10"
                }`}
                style={{ height: `${calculatedHeight}px` }}
              />
            );
          })}
        </div>

        {/* Glossy Beautiful Primary Connector Core Node */}
        <div className="flex items-center justify-center relative mb-4">
          <button 
            onClick={handleToggleConnection}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 cursor-pointer ${
              state === "disconnected"
                ? "bg-white/10 hover:bg-white/15 border border-white/15 text-white shadow-[0_0_20px_rgba(255,255,255,0.02)] hover:scale-105 active:scale-95"
                : state === "listening"
                ? "bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/80 text-cyan-200 shadow-[0_0_35px_rgba(34,211,238,0.3)] animate-pulse scale-105"
                : state === "speaking"
                ? "bg-purple-500/90 hover:bg-purple-600 border border-purple-400/95 text-white shadow-[0_0_35px_rgba(168,85,247,0.4)] scale-105"
                : "bg-amber-600 border border-amber-300 text-white animate-spin"
            }`}
            title={state === "disconnected" ? "Awake Myraa" : "Sleep core"}
          >
            {state === "disconnected" ? (
              <Power className="opacity-80" size={24} />
            ) : state === "connecting" ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : state === "listening" ? (
              <Mic size={24} className="text-cyan-200" />
            ) : (
              <Volume2 size={24} className="text-white" />
            )}
          </button>

          {/* Quiet Reset Projection Anchor */}
          {(activeProjectorUrl || errorText) && (
            <button 
              onClick={() => {
                if (activeProjectorUrl) setActiveProjectorUrl(null);
                setErrorText(null);
              }}
              className="absolute right-[-60px] p-2 rounded-full hover:bg-white/5 text-slate-400 hover:text-white transition duration-150 cursor-pointer"
              title="Reset Desktop Broadcasts"
            >
              <X size={16} />
            </button>
          )}
        </div>

      </footer>

      {/* Holographic Website frame projections */}
      <AnimatePresence>
        {activeProjectorUrl && (
          <BrowserAgent
            url={activeProjectorUrl}
            onClose={() => {
              setActiveProjectorUrl(null);
              setBrowserTrigger(null);
            }}
            actionTrigger={browserTrigger}
          />
        )}
      </AnimatePresence>

      {/* Dynamic Floating Glassmorphic Screen Sharing Control Hub */}
      <AnimatePresence>
        {isScreenSharing && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, x: 50 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.85, x: 50 }}
            className={`absolute bottom-6 md:bottom-10 right-6 md:right-10 z-50 w-72 p-4 rounded-2xl border ${
              isScreenSharingPaused 
                ? "border-amber-500/20 bg-slate-950/70" 
                : "border-cyan-500/20 bg-slate-950/70"
            } backdrop-blur-2xl shadow-2xl overflow-hidden`}
          >
            {/* Header / Indicator */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isScreenSharingPaused ? "bg-amber-400" : "bg-cyan-400 animate-pulse"}`} />
                <span className="text-[10px] font-bold font-mono tracking-widest text-slate-200">
                  {isScreenSharingPaused ? "DESKTOP VISION PAUSED" : "DESKTOP VISION ACTIVE"}
                </span>
              </div>
              <button 
                onClick={stopScreenSharing}
                className="text-slate-400 hover:text-white transition-colors duration-150 p-1 rounded-lg hover:bg-white/5 cursor-pointer"
                title="Stop Sharing"
              >
                <X size={14} />
              </button>
            </div>

            {/* Smart Video PIP Preview Holder */}
            <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900 border border-white/5 mb-3 flex items-center justify-center group select-none">
              <video
                ref={(el) => {
                  if (el && screenStreamRef.current && el.srcObject !== screenStreamRef.current) {
                    el.srcObject = screenStreamRef.current;
                    el.muted = true;
                    el.play().catch(err => console.log("Mini preview stream play issue:", err));
                  }
                }}
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  isScreenSharingPaused ? "opacity-30 blur-sm" : "opacity-90"
                }`}
                autoPlay
                playsInline
                muted
              />

              {isScreenSharingPaused && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] uppercase tracking-widest font-mono text-amber-400 font-bold px-2 py-1 bg-amber-950/40 border border-amber-500/20 rounded-md">
                    Vision Paused
                  </span>
                </div>
              )}
              
              {!isScreenSharingPaused && screenVisionMode && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-950/50 border border-cyan-400/20 text-[9px] font-mono text-cyan-300">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
                  <span>Desktop Vision: live preview</span>
                </div>
              )}
            </div>

            {/* Quick Action Control Strip */}
            <div className="flex items-center justify-between gap-1.5 mb-2.5">
              {isScreenSharingPaused ? (
                <button
                  onClick={resumeScreenSharing}
                  className="flex-1 py-1.5 px-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-lg text-xs font-mono font-medium text-cyan-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Resume Desktop Vision"
                >
                  <Play size={10} />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  onClick={pauseScreenSharing}
                  className="flex-1 py-1.5 px-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg text-xs font-mono font-medium text-amber-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Pause Desktop Vision"
                >
                  <Pause size={10} />
                  <span>Pause</span>
                </button>
              )}

              <button
                onClick={switchScreenShare}
                className="py-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-mono text-slate-300 hover:text-white flex items-center justify-center gap-1 transition-all cursor-pointer"
                title="Choose Another Screen or Window"
              >
                <RefreshCw size={11} />
                <span>Switch</span>
              </button>

              <button
                onClick={stopScreenSharing}
                className="py-1.5 px-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg text-xs font-mono text-rose-400 flex items-center justify-center gap-1 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                title="Stop Desktop Vision"
              >
                <Square size={9} />
                <span>Stop</span>
              </button>
            </div>

            {/* Core Mode Configuration Toggle */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-left">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold font-mono text-slate-200">DESKTOP VISION MODE</span>
                <span className="text-[8px] text-slate-400 uppercase font-mono max-w-[150px]">Capture and analyze as needed</span>
              </div>
              <button
                onClick={() => setScreenVisionMode(!screenVisionMode)}
                className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer ${
                  screenVisionMode ? "bg-cyan-500" : "bg-white/10"
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-200 ease-in-out ${
                    screenVisionMode ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recollections sliding core panel */}
      <MemoryDashboard
        isOpen={showMemoryDashboard}
        onClose={() => setShowMemoryDashboard(false)}
        memories={memories}
        onAddMemory={handleAddManualMemory}
        onDeleteMemory={handleDeleteMemory}
        themeColor={themeColor}
      />

      {/* Google Workspace and Firestore dashboard core panel */}
      <WorkspacePanel
        isOpen={showWorkspacePanel}
        onClose={() => setShowWorkspacePanel(false)}
        user={firebaseUser}
        accessToken={googleAccessToken}
        onSignInSuccess={(usr, tok) => {
          setFirebaseUser(usr);
          setGoogleAccessToken(tok);
        }}
        onSignOut={() => {
          setFirebaseUser(null);
          setGoogleAccessToken(null);
        }}
        themeColor={themeColor}
      />
    </div>
  );
}
