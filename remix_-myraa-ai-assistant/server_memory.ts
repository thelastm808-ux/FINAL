import fs from "fs";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { Memory, MemoryTransaction } from "./src/lib/memoryTypes";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, limit, Timestamp } from "firebase/firestore";

// Load Firebase configuration on the server-side
let firebaseConfig: any;
try {
  const configRaw = fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf-8");
  firebaseConfig = JSON.parse(configRaw);
} catch (e) {
  console.error("[Firebase Server] Failed to read firebase-applet-config.json:", e);
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Load memories for a specific user from Firestore
export async function loadMemories(userId: string): Promise<Memory[]> {
  if (!userId || userId === "anonymous") {
    return [];
  }
  try {
    const memoriesRef = collection(db, "users", userId, "memories");
    const snap = await getDocs(query(memoriesRef));
    const memories: Memory[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      memories.push({
        id: docSnap.id,
        category: data.category,
        text: data.text,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt
      });
    });
    return memories;
  } catch (error: any) {
    console.error(`[Memory] Error loading memories from Firestore for user ${userId}:`, error);
    return [];
  }
}

// Sync/Save memories to Firestore for a specific user
export async function saveMemories(userId: string, memories: Memory[]): Promise<void> {
  if (!userId || userId === "anonymous") return;
  try {
    for (const m of memories) {
      const memDocRef = doc(db, "users", userId, "memories", m.id);
      await setDoc(memDocRef, {
        id: m.id,
        userId: userId,
        category: m.category,
        text: m.text,
        createdAt: m.createdAt ? Timestamp.fromDate(new Date(m.createdAt)) : Timestamp.now(),
        updatedAt: Timestamp.now()
      });
    }
    console.log(`[Memory] Successfully saved ${memories.length} memories to Firestore for user ${userId}.`);
  } catch (error) {
    console.error(`[Memory] Error saving memories to Firestore for user ${userId}:`, error);
  }
}

// Delete a memory directly from Firestore
export async function deleteMemoryFromFirestore(userId: string, memoryId: string): Promise<void> {
  if (!userId || userId === "anonymous") return;
  try {
    const memDocRef = doc(db, "users", userId, "memories", memoryId);
    await deleteDoc(memDocRef);
    console.log(`[Memory] Deleted memory document ${memoryId} from Firestore for user ${userId}.`);
  } catch (error) {
    console.error(`[Memory] Error deleting memory document ${memoryId} from Firestore:`, error);
  }
}

// Format memory core to system instruction injections
export function formatSystemInstructionsWithMemories(baseInstruction: string, memories: Memory[]): string {
  if (memories.length === 0) {
    return baseInstruction + 
      "\n\n" +
      "=== MYRAA MEMORY CORE ===\n" +
      "You do not possess any historic recollections of this companion yet. " +
      "As you speak, pay deep attention to who they are, their projects, relationships, and habits so you naturally grow closer over time.\n" +
      "=========================\n";
  }

  // Group by category
  const grouped: Record<string, string[]> = {};
  memories.forEach((m) => {
    grouped[m.category] = grouped[m.category] || [];
    grouped[m.category].push(m.text);
  });

  let memoryBlock = 
    "\n\n" +
    "=== MYRAA PERSISTENT MEMORY CORE (RECOLLECTIONS) ===\n" +
    "You have spoken with this user for a long duration. Below are your persistent recollections of who they are.\n" +
    "CRITICAL BRAND AND COGNITIVE PRINCIPLES:\n" +
    "- INTEGRATE MEMORIES INSTINCTIVELY: Always make conversational references feel completely smooth, natural, and human. NEVER say 'According to my memory files...', 'My recollection database indicates...', or 'As you told me on June 12th...'. Instead, speak of these details casually and supportively as a true friend would (e.g. 'Oh, since you're working on that website project...', 'I hope you're keeping up with your YouTube channel goals too!').\n" +
    "- COMPANIONSHIP DEPTH: Allow your witty and responsive personality to adapt with empathy, based on their goals, life events, emotional milestones, and preferences.\n\n" +
    "CURRENT PERSISTENT KNOWLEDGE CARD:\n";

  const categoriesOrdered = [
    { key: "identity", label: "Identity (Name, nick, profession, background)" },
    { key: "preference", label: "Preferences & Tastes (Likes, dislikes, games, movies)" },
    { key: "goal", label: "Active Goals & Aspirations" },
    { key: "project", label: "Ongoing Projects & Ecosystems" },
    { key: "relationship", label: "Key People & Relationships mentioned" },
    { key: "emotional", label: "Emotional Highlights & Core Milestones" },
    { key: "behavior", label: "Observed Traits & Behavioral Tendencies" },
  ];

  categoriesOrdered.forEach((cat) => {
    const list = grouped[cat.key] || [];
    if (list.length > 0) {
      memoryBlock += `* ${cat.label}:\n` + list.map(t => `  - ${t}`).join("\n") + "\n";
    }
  });

  memoryBlock += "====================================================\n";

  return baseInstruction + memoryBlock;
}

// Background memory consolidation queue lock
let isConsolidating = false;

export async function processConversationSlice(
  apiKey: string,
  dialogueHistory: { role: string; text: string }[],
  userId: string
): Promise<Memory[] | null> {
  if (isConsolidating) {
    console.log("[Memory] Consolidation loop busy, skipping slice processing");
    return null;
  }

  if (dialogueHistory.length < 2) {
    return null;
  }

  if (!userId || userId === "anonymous") {
    return null;
  }

  isConsolidating = true;
  console.log(`[Memory] Initiating pipeline for dialogue slice for user ${userId}, length:`, dialogueHistory.length);

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    const currentMemories = await loadMemories(userId);
    
    // Format memory map to help Gemini understand what to edit
    const memoryContext = currentMemories.map(m => `ID: ${m.id} | Category: ${m.category} | Fact: ${m.text}`).join("\n");
    const dialogueContext = dialogueHistory.map(line => `${line.role === "user" ? "User" : "Myraa"}: ${line.text}`).join("\n");

    const prompt = `You are Myraa's deep cognitive recollection engine. Your task is to analyze the recent conversation piece against previous persistent memories, and output precise update transactions.

### OBJECTIVE
Decide if any statements contain durable, important personal facts, enduring preferences, aspirations, ongoing projects, critical relationships, key historical emotional events, or behavioral trends.
Avoid cataloging small talk, greetings, general chit-chat, or fleeting sentences (e.g., ignore 'hello', 'how are you', 'waking up', 'lol').

### CURRENT USER MEMORIES:
${memoryContext || "(No memory records exist)"}

### RECENT DIALOGUE SLICE:
${dialogueContext}

### RULES
- ACTIONS:
  - "ADD": If new material information is introduced (e.g. user says 'My favorite food is lasagna' and it's not present).
  - "UPDATE": If previous information has evolved or is corrected (e.g. user says 'I changed my major to computer science' when memory says they study history). Provide the exact ID of the memory to replace.
  - "REMOVE": If a memory was explicitly disproven or the user directly asked Myraa to forget it.
- TEXT STYLE: Express the memories as clean, concise, third-person declarative summaries (e.g., 'The user is building a startup named Myraa.', 'The user loves playing GTA 6.', 'The user enjoys technical and fast-paced styling explanations.'). Do not include conversational filler, quotes, or timestamps.
- ID: For ADD, leave blank. For UPDATE or REMOVE, provide the exact 'id' from the "Current user memories" list.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transactions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  action: {
                    type: Type.STRING,
                    description: "ADD, UPDATE, or REMOVE transaction.",
                    enum: ["ADD", "UPDATE", "REMOVE"]
                  },
                  id: {
                    type: Type.STRING,
                    description: "Specific ID of the existing memory being modified or deleted (leave blank/null for ADD)."
                  },
                  category: {
                    type: Type.STRING,
                    description: "The Memory category classification.",
                    enum: ["identity", "preference", "goal", "project", "relationship", "emotional", "behavior"]
                  },
                  text: {
                    type: Type.STRING,
                    description: "The memory summarized as a concise declarative statement in third-person."
                  }
                },
                required: ["action", "category", "text"]
              }
            }
          },
          required: ["transactions"]
        }
      }
    });

    const resultText = response.text?.trim() || "{}";
    const resultObj = JSON.parse(resultText);
    const transactions: MemoryTransaction[] = resultObj.transactions || [];

    if (transactions.length === 0) {
      console.log("[Memory] Zero transactions generated. Ignored routine conversations.");
      isConsolidating = false;
      return null;
    }

    console.log(`[Memory] Processing ${transactions.length} memory updates:`, JSON.stringify(transactions));

    let updatedMemories = [...currentMemories];
    const timestamp = new Date().toISOString();

    for (const trx of transactions) {
      if (trx.action === "ADD") {
        const newMemory: Memory = {
          id: Math.random().toString(36).substring(2, 11),
          category: trx.category,
          text: trx.text,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        updatedMemories.push(newMemory);
      } else if (trx.action === "UPDATE") {
        const tarIndex = updatedMemories.findIndex(m => m.id === trx.id);
        if (tarIndex !== -1) {
          updatedMemories[tarIndex] = {
            ...updatedMemories[tarIndex],
            category: trx.category,
            text: trx.text,
            updatedAt: timestamp
          };
        } else {
          // Fallback, treat as ADD if ID not matched
          const newMemory: Memory = {
            id: Math.random().toString(36).substring(2, 11),
            category: trx.category,
            text: trx.text,
            createdAt: timestamp,
            updatedAt: timestamp
          };
          updatedMemories.push(newMemory);
        }
      } else if (trx.action === "REMOVE") {
        updatedMemories = updatedMemories.filter(m => m.id !== trx.id);
        // Explicitly remove from Firestore too
        await deleteMemoryFromFirestore(userId, trx.id);
      }
    }

    await saveMemories(userId, updatedMemories);
    isConsolidating = false;
    return updatedMemories;

  } catch (error) {
    console.error("[Memory] Consolidation failure:", error);
    isConsolidating = false;
    return null;
  }
}

// Save a single message to Firestore (RAW CONVERSATION HISTORY)
export async function saveMessageToFirestore(
  userId: string,
  conversationId: string,
  sessionId: string,
  role: "user" | "assistant" | "model",
  content: string,
  messageOrder: number
): Promise<void> {
  if (!userId || userId === "anonymous") return;
  try {
    const messageId = "msg_" + Math.random().toString(36).substring(2, 11);
    const msgDocRef = doc(db, "users", userId, "conversations", conversationId, "messages", messageId);
    
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];
    
    const docData = {
      id: messageId,
      userId,
      conversationId,
      sessionId,
      role: role === "model" ? "assistant" : role,
      content,
      timestamp: Timestamp.fromDate(now),
      date: dateStr,
      time: timeStr,
      messageOrder: messageOrder
    };
    
    await setDoc(msgDocRef, docData);
    console.log(`[Memory] Logged message ${messageId} to raw history in Firestore for user ${userId}`);
  } catch (error) {
    console.error("[Memory] Error saving message to raw conversation history:", error);
  }
}

// Search memories, recent history, and summaries for dynamic injection
export async function retrieveRelevantContext(userId: string, queryText: string): Promise<string> {
  if (!userId || userId === "anonymous" || !queryText) return "";
  try {
    // 1. Load long-term memories
    const memories = await loadMemories(userId);
    
    const keywords = queryText.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    if (keywords.length === 0) return "";

    const matchedMemories = memories.filter(m => {
      const textLower = m.text.toLowerCase();
      return keywords.some(k => textLower.includes(k));
    });

    // 2. Load and match summaries
    const matchedSummaries: string[] = [];
    try {
      const summariesRef = collection(db, "users", userId, "summaries");
      const snap = await getDocs(query(summariesRef, orderBy("timestamp", "desc"), limit(5)));
      snap.forEach(docSnap => {
        const data = docSnap.data();
        const summaryText = data.summary || "";
        if (keywords.some(k => summaryText.toLowerCase().includes(k))) {
          matchedSummaries.push(summaryText);
        }
      });
    } catch (e) {
      console.error("[Memory] Error retrieving summaries for relevance check:", e);
    }

    let results = "";
    if (matchedMemories.length > 0) {
      results += "Long-Term Memories:\n" + matchedMemories.map(m => `- ${m.text}`).join("\n") + "\n";
    }
    if (matchedSummaries.length > 0) {
      results += "Past Conversation Summaries:\n" + matchedSummaries.map(s => `- ${s}`).join("\n") + "\n";
    }

    return results.trim();
  } catch (error) {
    console.error("[Memory] Error searching relevant context:", error);
    return "";
  }
}

// Analyze conversation slice and generate summary & extract entities
export async function generateAndStoreSummary(
  userId: string,
  conversationId: string,
  dialogueHistory: { role: string; text: string }[],
  apiKey: string
): Promise<void> {
  if (!userId || userId === "anonymous" || dialogueHistory.length < 2) return;
  console.log(`[Memory] Initiating summary and entity extraction for conversation ${conversationId}`);

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    const dialogueContext = dialogueHistory.map(line => `${line.role === "user" ? "User" : "Myraa"}: ${line.text}`).join("\n");

    const prompt = `Analyze this conversation between User and Myraa, and generate a comprehensive summary and extract structured projects, tasks, and reminders.

### CONVERSATION HISTORY:
${dialogueContext}

### INSTRUCTIONS:
Produce a JSON response conforming to the schema.
Extract:
- Concise, detailed summary of the main discussion.
- Topics discussed (array of strings).
- Decisions made (array of strings).
- Tasks created (array of strings).
- User preferences mentioned (array of strings).
- Personal facts learned (array of strings).
- Questions asked (array of strings).
- Goals discussed (array of strings).
- Follow-up items (array of strings).
- Any named project mentioned: name, description, status (active, completed, planned).
- Any task mentioned: title, description, status (pending, completed).
- Any reminder mentioned: text, datetime (ISO format), status (pending).`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            topics: { type: Type.ARRAY, items: { type: Type.STRING } },
            decisions: { type: Type.ARRAY, items: { type: Type.STRING } },
            tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
            preferences: { type: Type.ARRAY, items: { type: Type.STRING } },
            facts: { type: Type.ARRAY, items: { type: Type.STRING } },
            questions: { type: Type.ARRAY, items: { type: Type.STRING } },
            goals: { type: Type.ARRAY, items: { type: Type.STRING } },
            followUps: { type: Type.ARRAY, items: { type: Type.STRING } },
            projectsExtracted: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  status: { type: Type.STRING }
                },
                required: ["name", "description", "status"]
              }
            },
            tasksExtracted: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  status: { type: Type.STRING }
                },
                required: ["title", "description", "status"]
              }
            },
            remindersExtracted: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  datetime: { type: Type.STRING },
                  status: { type: Type.STRING }
                },
                required: ["text", "datetime", "status"]
              }
            }
          },
          required: ["summary", "topics", "decisions", "tasks", "preferences", "facts", "questions", "goals", "followUps"]
        }
      }
    });

    const resultText = response.text?.trim() || "{}";
    const resultObj = JSON.parse(resultText);

    const summaryId = "sum_" + Math.random().toString(36).substring(2, 11);
    const summaryDocRef = doc(db, "users", userId, "summaries", summaryId);

    const now = new Date();
    await setDoc(summaryDocRef, {
      id: summaryId,
      userId,
      conversationId,
      summary: resultObj.summary,
      topics: resultObj.topics || [],
      decisions: resultObj.decisions || [],
      tasks: resultObj.tasks || [],
      preferences: resultObj.preferences || [],
      facts: resultObj.facts || [],
      questions: resultObj.questions || [],
      goals: resultObj.goals || [],
      followUps: resultObj.followUps || [],
      timestamp: Timestamp.fromDate(now),
      createdAt: Timestamp.fromDate(now)
    });

    console.log(`[Memory] Saved conversation summary ${summaryId} for user ${userId}`);

    // Store Projects
    if (Array.isArray(resultObj.projectsExtracted)) {
      for (const proj of resultObj.projectsExtracted) {
        const projectId = "proj_" + Math.random().toString(36).substring(2, 11);
        await setDoc(doc(db, "users", userId, "projects", projectId), {
          id: projectId,
          userId,
          name: proj.name,
          description: proj.description,
          status: proj.status,
          createdAt: Timestamp.fromDate(now),
          updatedAt: Timestamp.fromDate(now)
        });
      }
    }

    // Store Tasks
    if (Array.isArray(resultObj.tasksExtracted)) {
      for (const t of resultObj.tasksExtracted) {
        const taskId = "task_" + Math.random().toString(36).substring(2, 11);
        await setDoc(doc(db, "users", userId, "tasks", taskId), {
          id: taskId,
          userId,
          title: t.title,
          description: t.description,
          status: t.status,
          createdAt: Timestamp.fromDate(now),
          updatedAt: Timestamp.fromDate(now)
        });
      }
    }

    // Store Reminders
    if (Array.isArray(resultObj.remindersExtracted)) {
      for (const r of resultObj.remindersExtracted) {
        const reminderId = "rem_" + Math.random().toString(36).substring(2, 11);
        let remTime: Date;
        try {
          remTime = new Date(r.datetime);
          if (isNaN(remTime.getTime())) remTime = now;
        } catch {
          remTime = now;
        }
        await setDoc(doc(db, "users", userId, "reminders", reminderId), {
          id: reminderId,
          userId,
          text: r.text,
          datetime: Timestamp.fromDate(remTime),
          status: r.status,
          createdAt: Timestamp.fromDate(now),
          updatedAt: Timestamp.fromDate(now)
        });
      }
    }

  } catch (err) {
    console.error("[Memory] Summary and entity extraction failure:", err);
  }
}
