import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { 
  collection, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  serverTimestamp 
} from "firebase/firestore";
import { 
  db, 
  googleSignIn, 
  googleLogOut, 
  handleFirestoreError, 
  OperationType 
} from "../lib/firebase";
import { 
  googleSheets, 
  googleDocs, 
  gmail, 
  googleDrive,
  GmailMessage 
} from "../lib/workspace";
import { 
  X, 
  Database, 
  FileSpreadsheet, 
  FileText, 
  Mail, 
  Plus, 
  Trash2, 
  RefreshCw, 
  ExternalLink, 
  User as UserIcon, 
  LogOut, 
  Send, 
  Clock, 
  Lock, 
  Search,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface WorkspacePanelProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  accessToken: string | null;
  onSignInSuccess: (user: User, token: string) => void;
  onSignOut: () => void;
  themeColor: string;
}

export function WorkspacePanel({
  isOpen,
  onClose,
  user,
  accessToken,
  onSignInSuccess,
  onSignOut,
  themeColor
}: WorkspacePanelProps) {
  const [activeTab, setActiveTab] = useState<"auth" | "sheets" | "gmail" | "docs">("auth");
  const [logs, setLogs] = useState<any[]>([]);
  const [savedItems, setSavedItems] = useState<any[]>([]);
  const [emails, setEmails] = useState<GmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Sheets Inputs
  const [sheetIdInput, setSheetIdInput] = useState("");
  const [sheetNameInput, setSheetNameInput] = useState("");
  const [viewingSpreadsheetData, setViewingSpreadsheetData] = useState<any[][] | null>(null);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);

  // Docs Inputs
  const [docIdInput, setDocIdInput] = useState("");
  const [docNameInput, setDocNameInput] = useState("");
  const [viewingDocContent, setViewingDocContent] = useState<string | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  // Email Inputs
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const showStatus = (type: "success" | "error", text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 5000);
  };

  // 1. Fetch persistent items from Firestore when user authenticates
  const fetchFirestoreData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      
      // Fetch tracked documents/sheets
      const itemsRef = collection(db, "users", user.uid, "workspace_items");
      const itemsSnap = await getDocs(query(itemsRef, orderBy("addedAt", "desc")));
      const itemsList = itemsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSavedItems(itemsList);

      // Fetch automated interaction logs
      const logsRef = collection(db, "users", user.uid, "workspace_logs");
      const logsSnap = await getDocs(query(logsRef, orderBy("timestamp", "desc")));
      const logsList = logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(logsList);
    } catch (err) {
      console.error("Failed to load saved workspace data:", err);
      showStatus("error", "Failed to fetch cloud records. Rule block or indexing mismatch.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchFirestoreData();
    } else {
      setSavedItems([]);
      setLogs([]);
      setEmails([]);
      setViewingSpreadsheetData(null);
      setViewingDocContent(null);
    }
  }, [user]);

  // 2. Auth Actions
  const handleSignIn = async () => {
    try {
      setLoading(true);
      const res = await googleSignIn();
      if (res) {
        onSignInSuccess(res.user, res.accessToken);
        showStatus("success", `Awakened Workspace connections for ${res.user.displayName}`);
      }
    } catch (err) {
      showStatus("error", "Sign-in popup was cancelled or blocked by browser frame guidelines.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await googleLogOut();
      onSignOut();
      showStatus("success", "De-authorized Google Session. Cloud state cleared safely.");
    } catch (err) {
      showStatus("error", "Sign-out execution failed.");
    }
  };

  // 3. Track New Document Reference
  const handleSaveItem = async (type: "doc" | "sheet", fileId: string, customName: string) => {
    if (!user || !fileId || !customName) return;
    try {
      setLoading(true);
      const itemsRef = collection(db, "users", user.uid, "workspace_items");
      const itemId = Math.random().toString(36).substring(2, 11);
      
      const newItem = {
        id: itemId,
        userId: user.uid,
        name: customName,
        type,
        fileId,
        url: type === "sheet" 
          ? `https://docs.google.com/spreadsheets/d/${fileId}`
          : `https://docs.google.com/document/d/${fileId}`,
        addedAt: serverTimestamp()
      };

      await setDoc(doc(db, "users", user.uid, "workspace_items", itemId), newItem);
      
      // Save logs of this action in Firestore
      await logWorkspaceAction("Reference Saved", `Manually linked Google ${type === "sheet" ? "Sheet" : "Doc"} reference named '${customName}'`);
      
      showStatus("success", `Persisted Google ${type === "sheet" ? "Sheet" : "Doc"} locally and in Firebase.`);
      setSheetIdInput("");
      setSheetNameInput("");
      setDocIdInput("");
      setDocNameInput("");
      fetchFirestoreData();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/workspace_items`);
      showStatus("error", "Could not persist file reference to Firestore rules.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (!user) return;
    if (!window.confirm(`Are you sure you want to stop tracking '${name}'?`)) return;
    try {
      setLoading(true);
      await deleteDoc(doc(db, "users", user.uid, "workspace_items", id));
      await logWorkspaceAction("Reference Deleted", `Removed reference path named '${name}'`);
      showStatus("success", `Removed references for ${name}`);
      fetchFirestoreData();
    } catch (err) {
      showStatus("error", "Firestore rule blocked document deletion.");
    } finally {
      setLoading(false);
    }
  };

  // Write and persist logs into Firestore
  const logWorkspaceAction = async (actionType: string, details: string) => {
    if (!user) return;
    try {
      const logsRef = collection(db, "users", user.uid, "workspace_logs");
      const logId = Math.random().toString(36).substring(2, 11);
      const newLog = {
        id: logId,
        userId: user.uid,
        actionType,
        details,
        timestamp: serverTimestamp()
      };
      await setDoc(doc(db, "users", user.uid, "workspace_logs", logId), newLog);
    } catch (e) {
      console.error("Failed to append audit log:", e);
    }
  };

  // 4. Sheets API Execution
  const handleCreateSheet = async () => {
    if (!accessToken) return;
    const title = window.prompt("Enter Spreadsheet Title:", "Myraa Spreadsheet Tracker");
    if (!title) return;

    try {
      setLoading(true);
      const sheet = await googleSheets.create(accessToken, title);
      await handleSaveItem("sheet", sheet.spreadsheetId, sheet.title);
      showStatus("success", `Spreadsheet '${sheet.title}' created successfully!`);
    } catch (err: any) {
      showStatus("error", err.message || "Failed to create spreadsheet.");
    } finally {
      setLoading(false);
    }
  };

  const handleFetchSheetData = async (spreadsheetId: string) => {
    if (!accessToken) return;
    try {
      setLoading(true);
      setActiveSheetId(spreadsheetId);
      const data = await googleSheets.getData(accessToken, spreadsheetId);
      setViewingSpreadsheetData(data);
    } catch (err: any) {
      showStatus("error", "Sheets scope permission denied or Spreadsheet not found.");
      setViewingSpreadsheetData(null);
    } finally {
      setLoading(false);
    }
  };

  // 5. Docs API Execution
  const handleCreateDoc = async () => {
    if (!accessToken) return;
    const title = window.prompt("Enter Document Title:", "Myraa Document Notes");
    if (!title) return;

    try {
      setLoading(true);
      const docObj = await googleDocs.create(accessToken, title, "Awakened by Myraa AI Assistant.\n");
      await handleSaveItem("doc", docObj.documentId, docObj.title);
      showStatus("success", `Google Doc '${docObj.title}' created successfully!`);
    } catch (err: any) {
      showStatus("error", err.message || "Failed to create Google Doc.");
    } finally {
      setLoading(false);
    }
  };

  const handleFetchDocContent = async (documentId: string) => {
    if (!accessToken) return;
    try {
      setLoading(true);
      setActiveDocId(documentId);
      const content = await googleDocs.getContent(accessToken, documentId);
      setViewingDocContent(content);
    } catch (err: any) {
      showStatus("error", "Docs scope permission denied or Document not found.");
      setViewingDocContent(null);
    } finally {
      setLoading(false);
    }
  };

  // 6. Gmail API Execution
  const handleFetchInbox = async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      const list = await gmail.listEmails(accessToken);
      setEmails(list);
      showStatus("success", `Fetched ${list.length} latest messages from Gmail.`);
    } catch (err: any) {
      showStatus("error", err.message || "Failed to fetch inbox details.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !emailTo || !emailSubject || !emailBody) return;
    try {
      setLoading(true);
      await gmail.sendEmail(accessToken, emailTo, emailSubject, emailBody);
      await logWorkspaceAction("Gmail Sent", `Sent email to <${emailTo}> with subject: "${emailSubject}"`);
      showStatus("success", `Email safely transmitted to <${emailTo}>`);
      setEmailTo("");
      setEmailSubject("");
      setEmailBody("");
      fetchFirestoreData();
    } catch (err: any) {
      showStatus("error", err.message || "Failed to transmit Gmail payload.");
    } finally {
      setLoading(false);
    }
  };

  // Theme Accent Builders
  const getAccentBtn = () => {
    switch (themeColor) {
      case "violet": return "bg-purple-600 hover:bg-purple-500 shadow-purple-950/40";
      case "crimson": return "bg-rose-600 hover:bg-rose-500 shadow-rose-950/40";
      case "emerald": return "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/40";
      case "celestial": return "bg-sky-600 hover:bg-sky-500 shadow-sky-950/40";
      case "gold": return "bg-amber-600 hover:bg-amber-500 shadow-amber-950/40";
      case "rose": return "bg-pink-600 hover:bg-pink-500 shadow-pink-950/40";
      case "charcoal":
      default:
        return "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-950/40";
    }
  };

  const getBorderAccent = () => {
    switch (themeColor) {
      case "violet": return "border-purple-500/20";
      case "crimson": return "border-rose-500/20";
      case "emerald": return "border-emerald-500/20";
      case "celestial": return "border-sky-500/20";
      case "gold": return "border-amber-500/20";
      case "rose": return "border-pink-500/20";
      case "charcoal":
      default:
        return "border-indigo-500/20";
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Frosted Background Masking overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />

          {/* Right Sliding glass sidebar panel container */}
          <motion.div
            initial={{ x: "100%", opacity: 0.8 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.8 }}
            transition={{ type: "spring", damping: 22, stiffness: 150 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-slate-950/85 backdrop-blur-2xl border-l border-white/10 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)] text-slate-100"
          >
            {/* Header portion */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl bg-white/5 border ${getBorderAccent()}`}>
                  <Database className="text-cyan-400" size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-widest font-mono uppercase text-white">WORKSPACE PORTAL</h3>
                  <p className="text-xs text-slate-400">Google Cloud Persistence Core</p>
                </div>
              </div>
              
              <button 
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Diagnostic Status Bar */}
            {statusMsg && (
              <div className={`px-6 py-2.5 flex items-center gap-2 text-xs font-mono font-medium ${
                statusMsg.type === "success" 
                  ? "bg-emerald-500/10 text-emerald-300 border-b border-emerald-500/20" 
                  : "bg-rose-500/10 text-rose-300 border-b border-rose-500/20"
              }`}>
                {statusMsg.type === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                <span>{statusMsg.text}</span>
              </div>
            )}

            {/* Main Content Layout */}
            <div className="flex-1 flex flex-col min-h-0">
              
              {/* Workspace Navigation Tabs */}
              <div className="px-6 py-3 border-b border-white/5 flex gap-1.5 overflow-x-auto scrollbar-none">
                <button
                  onClick={() => setActiveTab("auth")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono tracking-wider transition cursor-pointer flex items-center gap-1.5 ${
                    activeTab === "auth" 
                      ? "bg-white/10 text-white border border-white/10" 
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Lock size={12} />
                  <span>AUTH & LOGS</span>
                </button>
                <button
                  disabled={!accessToken}
                  onClick={() => setActiveTab("sheets")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono tracking-wider transition flex items-center gap-1.5 ${
                    !accessToken ? "opacity-35 cursor-not-allowed" : "cursor-pointer"
                  } ${
                    activeTab === "sheets" 
                      ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" 
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <FileSpreadsheet size={12} />
                  <span>SHEETS</span>
                </button>
                <button
                  disabled={!accessToken}
                  onClick={() => {
                    setActiveTab("gmail");
                    if (emails.length === 0) handleFetchInbox();
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono tracking-wider transition flex items-center gap-1.5 ${
                    !accessToken ? "opacity-35 cursor-not-allowed" : "cursor-pointer"
                  } ${
                    activeTab === "gmail" 
                      ? "bg-rose-500/10 text-rose-300 border border-rose-500/20" 
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Mail size={12} />
                  <span>GMAIL</span>
                </button>
                <button
                  disabled={!accessToken}
                  onClick={() => setActiveTab("docs")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono tracking-wider transition flex items-center gap-1.5 ${
                    !accessToken ? "opacity-35 cursor-not-allowed" : "cursor-pointer"
                  } ${
                    activeTab === "docs" 
                      ? "bg-sky-500/10 text-sky-300 border border-sky-500/20" 
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <FileText size={12} />
                  <span>DOCS</span>
                </button>
              </div>

              {/* Scrolling container area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0">
                {loading && (
                  <div className="py-4 flex justify-center items-center gap-2 text-xs font-mono text-slate-400 animate-pulse">
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Synchronizing Secure Channels...</span>
                  </div>
                )}

                {/* TAB 1: AUTH & SECURITY LOGS */}
                {activeTab === "auth" && (
                  <div className="space-y-6">
                    {/* Access credential card */}
                    <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-xs font-bold font-mono tracking-wide uppercase text-white">Google Integration Token</h4>
                          <p className="text-xs text-slate-400 mt-1">Authenticates Myraa's Workspace actions</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                          accessToken ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25" : "bg-white/10 text-slate-400"
                        }`}>
                          {accessToken ? "LINKED" : "OFFLINE"}
                        </span>
                      </div>

                      {user ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-white/5">
                            <div className="flex items-center gap-2.5">
                              {user.photoURL ? (
                                <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-white/15" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="p-1.5 rounded-full bg-white/5"><UserIcon size={16} /></div>
                              )}
                              <div className="text-left">
                                <p className="text-xs font-bold text-white leading-tight">{user.displayName}</p>
                                <p className="text-[10px] text-slate-400 font-mono mt-0.5">{user.email}</p>
                              </div>
                            </div>
                            
                            <button
                              onClick={handleSignOut}
                              className="p-1.5 rounded bg-white/5 hover:bg-rose-500/10 hover:text-rose-400 text-slate-400 transition cursor-pointer"
                              title="Disconnect Workspace Session"
                            >
                              <LogOut size={14} />
                            </button>
                          </div>
                          {!accessToken && (
                            <button
                              onClick={handleSignIn}
                              className={`w-full py-2.5 rounded-xl text-xs font-bold tracking-wide font-mono text-white transition shadow-lg ${getAccentBtn()} cursor-pointer flex items-center justify-center gap-1.5`}
                            >
                              <UserIcon size={14} />
                              <span>LINK WORKSPACE SESSION (POPUP)</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={handleSignIn}
                          className={`w-full py-2.5 rounded-xl text-xs font-bold tracking-wide font-mono text-white transition shadow-lg ${getAccentBtn()} cursor-pointer flex items-center justify-center gap-1.5`}
                        >
                          <UserIcon size={14} />
                          <span>SECURE WITH GOOGLE POPUP</span>
                        </button>
                      )}
                    </div>

                    {/* Firestore Automated Interactions Logs Block */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">Myraa Workspace Logs</h4>
                        <button 
                          onClick={fetchFirestoreData}
                          className="p-1 hover:bg-white/5 rounded text-slate-400 hover:text-white transition cursor-pointer"
                        >
                          <RefreshCw size={12} />
                        </button>
                      </div>

                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {logs.length === 0 ? (
                          <div className="text-center py-6 text-xs font-mono text-slate-500 border border-dashed border-white/10 rounded-xl">
                            No Workspace transactions logged in Firestore.
                          </div>
                        ) : (
                          logs.map((log) => (
                            <div 
                              key={log.id} 
                              className="p-3 rounded-lg border border-white/5 bg-black/20 text-left space-y-1 text-xs"
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-mono font-bold text-cyan-400 uppercase tracking-wide">
                                  {log.actionType}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                  <Clock size={10} />
                                  {log.timestamp?.seconds 
                                    ? new Date(log.timestamp.seconds * 1000).toLocaleTimeString() 
                                    : new Date(log.timestamp).toLocaleTimeString()
                                  }
                                </span>
                              </div>
                              <p className="text-slate-300 leading-relaxed font-sans">{log.details}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: GOOGLE SHEETS */}
                {activeTab === "sheets" && (
                  <div className="space-y-5">
                    {/* Sheets Controls header */}
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-bold font-mono text-slate-400 tracking-wider">TRACKED SPREADSHEETS</h4>
                      <button
                        onClick={handleCreateSheet}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold font-mono text-white transition flex items-center gap-1 cursor-pointer ${getAccentBtn()}`}
                      >
                        <Plus size={12} />
                        <span>CREATE SHEET</span>
                      </button>
                    </div>

                    {/* Track an existing Sheet reference */}
                    <div className="p-3.5 rounded-xl border border-white/10 bg-white/5 space-y-2">
                      <h5 className="text-[10px] font-bold font-mono tracking-wider text-white uppercase">Link existing Sheet ID</h5>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Spreadsheet ID"
                          value={sheetIdInput}
                          onChange={e => setSheetIdInput(e.target.value)}
                          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Label name"
                          value={sheetNameInput}
                          onChange={e => setSheetNameInput(e.target.value)}
                          className="w-1/3 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
                        />
                        <button
                          onClick={() => handleSaveItem("sheet", sheetIdInput, sheetNameInput)}
                          className="px-3 rounded-lg bg-white/10 hover:bg-white/25 text-white transition cursor-pointer"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Tracked sheets list */}
                    <div className="space-y-2">
                      {savedItems.filter(i => i.type === "sheet").length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-2">No spreadsheets tracked yet. Create or track one above.</p>
                      ) : (
                        savedItems.filter(i => i.type === "sheet").map((item) => (
                          <div 
                            key={item.id}
                            className={`p-3 rounded-xl border flex items-center justify-between text-xs transition ${
                              activeSheetId === item.fileId 
                                ? "bg-emerald-500/5 border-emerald-500/30" 
                                : "bg-black/20 border-white/5 hover:border-white/15"
                            }`}
                          >
                            <div className="flex items-center gap-2 text-left min-w-0">
                              <FileSpreadsheet className="text-emerald-400 flex-shrink-0" size={16} />
                              <div className="min-w-0">
                                <p className="font-bold text-white truncate max-w-[150px]">{item.name}</p>
                                <p className="text-[9px] text-slate-500 font-mono truncate max-w-[150px]">{item.fileId}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleFetchSheetData(item.fileId)}
                                className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition font-mono text-[10px] cursor-pointer"
                              >
                                {activeSheetId === item.fileId ? "ACTIVE" : "VIEW CELLS"}
                              </button>
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-white transition"
                                title="Open Spreadsheet"
                              >
                                <ExternalLink size={12} />
                              </a>
                              <button
                                onClick={() => handleDeleteItem(item.id, item.name)}
                                className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Active sheet viewer matrix */}
                    {viewingSpreadsheetData && (
                      <div className="p-4 rounded-xl border border-emerald-500/10 bg-black/40 space-y-3">
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                          <h5 className="text-xs font-bold font-mono text-emerald-400 uppercase tracking-wide">Sheet View Grid</h5>
                          <button
                            onClick={() => setViewingSpreadsheetData(null)}
                            className="text-[10px] text-slate-400 hover:text-white font-mono"
                          >
                            CLOSE
                          </button>
                        </div>

                        <div className="overflow-x-auto max-h-48 overflow-y-auto border border-white/5 rounded-lg">
                          <table className="w-full text-left border-collapse text-[11px] font-mono">
                            <thead>
                              <tr className="bg-white/5 text-slate-300 border-b border-white/5">
                                {viewingSpreadsheetData[0]?.map((_, colIdx) => (
                                  <th key={colIdx} className="p-2 border-r border-white/5">
                                    {String.fromCharCode(65 + colIdx)}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {viewingSpreadsheetData.slice(0, 15).map((row, rowIdx) => (
                                <tr key={rowIdx} className="border-b border-white/5 hover:bg-white/5 text-slate-200">
                                  {row.map((cell, cellIdx) => (
                                    <td key={cellIdx} className="p-2 border-r border-white/5 truncate max-w-[120px]" title={String(cell)}>
                                      {String(cell)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: GMAIL MANAGER */}
                {activeTab === "gmail" && (
                  <div className="space-y-6">
                    {/* Compose Section */}
                    <form onSubmit={handleSendEmail} className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3.5 text-left">
                      <div className="flex items-center gap-1.5 border-b border-white/5 pb-2">
                        <Mail className="text-rose-400" size={14} />
                        <h4 className="text-xs font-bold font-mono tracking-wide uppercase text-white">Direct Email Transmitter</h4>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] font-mono text-slate-400 block mb-1">To Address</label>
                          <input
                            type="email"
                            required
                            placeholder="recipient@domain.com"
                            value={emailTo}
                            onChange={e => setEmailTo(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-400"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-mono text-slate-400 block mb-1">Subject</label>
                          <input
                            type="text"
                            required
                            placeholder="Brief subject outline"
                            value={emailSubject}
                            onChange={e => setEmailSubject(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-400"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-mono text-slate-400 block mb-1">Message Body</label>
                          <textarea
                            required
                            rows={3}
                            placeholder="Type messages here..."
                            value={emailBody}
                            onChange={e => setEmailBody(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-rose-400 font-sans"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className={`w-full py-2 rounded-lg text-xs font-mono font-bold text-white flex items-center justify-center gap-1.5 transition cursor-pointer ${getAccentBtn()}`}
                      >
                        <Send size={12} />
                        <span>SEND GMAIL VIA MYRAA PROTOCOL</span>
                      </button>
                    </form>

                    {/* Inbox Section */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-widest">Inbox Synchronizer</h4>
                        <button
                          onClick={handleFetchInbox}
                          className="text-[10px] font-mono text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw size={10} />
                          <span>SYNC</span>
                        </button>
                      </div>

                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {emails.length === 0 ? (
                          <div className="text-center py-6 text-xs text-slate-500 italic border border-white/5 rounded-xl bg-black/10">
                            Inbox queue clear. Refresh to fetch letters.
                          </div>
                        ) : (
                          emails.map((msg) => (
                            <div 
                              key={msg.id}
                              className="p-3 rounded-lg border border-white/5 bg-black/20 text-left space-y-1.5 text-xs"
                            >
                              <div className="flex justify-between items-start">
                                <span className="font-bold text-rose-300 truncate max-w-[200px]">{msg.from}</span>
                                <span className="text-[9px] text-slate-500 font-mono truncate">{msg.date ? new Date(msg.date).toLocaleDateString() : ""}</span>
                              </div>
                              <p className="font-bold text-slate-200 truncate leading-tight">{msg.subject}</p>
                              <p className="text-slate-400 leading-normal line-clamp-2">{msg.snippet}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: GOOGLE DOCS */}
                {activeTab === "docs" && (
                  <div className="space-y-5">
                    {/* Docs Controls header */}
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-bold font-mono text-slate-400 tracking-wider">TRACKED DOCUMENTS</h4>
                      <button
                        onClick={handleCreateDoc}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold font-mono text-white transition flex items-center gap-1 cursor-pointer ${getAccentBtn()}`}
                      >
                        <Plus size={12} />
                        <span>CREATE DOC</span>
                      </button>
                    </div>

                    {/* Track document reference */}
                    <div className="p-3.5 rounded-xl border border-white/10 bg-white/5 space-y-2">
                      <h5 className="text-[10px] font-bold font-mono tracking-wider text-white uppercase">Link existing Doc ID</h5>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Google Doc File ID"
                          value={docIdInput}
                          onChange={e => setDocIdInput(e.target.value)}
                          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Label name"
                          value={docNameInput}
                          onChange={e => setDocNameInput(e.target.value)}
                          className="w-1/3 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
                        />
                        <button
                          onClick={() => handleSaveItem("doc", docIdInput, docNameInput)}
                          className="px-3 rounded-lg bg-white/10 hover:bg-white/25 text-white transition cursor-pointer"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Tracked docs list */}
                    <div className="space-y-2">
                      {savedItems.filter(i => i.type === "doc").length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-2">No documents tracked yet. Create or track one above.</p>
                      ) : (
                        savedItems.filter(i => i.type === "doc").map((item) => (
                          <div 
                            key={item.id}
                            className={`p-3 rounded-xl border flex items-center justify-between text-xs transition ${
                              activeDocId === item.fileId 
                                ? "bg-sky-500/5 border-sky-500/30" 
                                : "bg-black/20 border-white/5 hover:border-white/15"
                            }`}
                          >
                            <div className="flex items-center gap-2 text-left min-w-0">
                              <FileText className="text-sky-400 flex-shrink-0" size={16} />
                              <div className="min-w-0">
                                <p className="font-bold text-white truncate max-w-[150px]">{item.name}</p>
                                <p className="text-[9px] text-slate-500 font-mono truncate max-w-[150px]">{item.fileId}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleFetchDocContent(item.fileId)}
                                className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition font-mono text-[10px] cursor-pointer"
                              >
                                {activeDocId === item.fileId ? "ACTIVE" : "READ TEXT"}
                              </button>
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-white transition"
                                title="Open Document"
                              >
                                <ExternalLink size={12} />
                              </a>
                              <button
                                onClick={() => handleDeleteItem(item.id, item.name)}
                                className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Active Doc content viewer */}
                    {viewingDocContent !== null && (
                      <div className="p-4 rounded-xl border border-sky-500/10 bg-black/40 space-y-3">
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                          <h5 className="text-xs font-bold font-mono text-sky-400 uppercase tracking-wide">Document Text View</h5>
                          <button
                            onClick={() => setViewingDocContent(null)}
                            className="text-[10px] text-slate-400 hover:text-white font-mono"
                          >
                            CLOSE
                          </button>
                        </div>

                        <div className="text-left font-sans text-xs leading-relaxed text-slate-200 border border-white/5 rounded-lg bg-black/20 p-3 max-h-48 overflow-y-auto whitespace-pre-wrap font-medium">
                          {viewingDocContent ? viewingDocContent : <p className="italic text-slate-500">Document is completely empty.</p>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
