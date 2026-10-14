import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer } from "ws";
import { GoogleGenAI, Modality, Type, LiveServerMessage } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { 
  loadMemories, 
  saveMemories, 
  formatSystemInstructionsWithMemories, 
  processConversationSlice,
  deleteMemoryFromFirestore,
  saveMessageToFirestore,
  retrieveRelevantContext,
  generateAndStoreSummary
} from "./server_memory";
import { Memory } from "./src/lib/memoryTypes";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use(express.json());

  // Memory REST API Endpoints
  app.get("/api/memories", async (req, res) => {
    try {
      const userId = (req.query.userId as string) || "anonymous";
      const memories = await loadMemories(userId);
      res.json(memories);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/memories", async (req, res) => {
    try {
      const { category, text, userId } = req.body;
      const finalUserId = userId || "anonymous";
      if (!category || !text) {
        return res.status(400).json({ error: "Category and text parameters are required." });
      }
      const memories = await loadMemories(finalUserId);
      const timestamp = new Date().toISOString();
      const newMemory: Memory = {
        id: Math.random().toString(36).substring(2, 11),
        category,
        text,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      memories.push(newMemory);
      await saveMemories(finalUserId, memories);
      res.status(201).json(newMemory);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/memories/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.query.userId as string) || "anonymous";
      await deleteMemoryFromFirestore(userId, id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Safe Server-Side Scraper & HTML Proxy endpoint
  app.get("/api/proxy", async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) {
        return res.status(400).json({ error: "Missing 'url' parameter." });
      }

      console.log(`[Proxy Scraper] Fetching external content for: ${url}`);
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        }
      });

      if (!response.ok) {
        throw new Error(`Scraper failed to load page: status ${response.status}`);
      }

      const html = await response.text();

      // Simple regex-based HTML parsers for standard items
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : "";

      // Extract high-level headings (h1, h2, h3)
      const headings: string[] = [];
      const headingMatches = html.matchAll(/<h([1-3])\b[^>]*>(.*?)<\/h\1>/gi);
      for (const match of headingMatches) {
        const text = match[2].replace(/<[^>]*>/g, "").trim();
        if (text && text.length > 3 && text.length < 120 && !headings.includes(text)) {
          headings.push(text);
        }
      }

      // Extract organic anchor links
      const links: { text: string; href: string }[] = [];
      const linkMatches = html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi);
      for (const match of linkMatches) {
        let href = match[1].trim();
        const text = match[2].replace(/<[^>]*>/g, "").trim();
        
        if (text && text.length > 2 && text.length < 100) {
          if (href.startsWith("/")) {
            try {
              const u = new URL(url);
              href = `${u.protocol}//${u.host}${href}`;
            } catch {}
          }
          if (href.startsWith("http://") || href.startsWith("https://")) {
            links.push({ text, href });
          }
        }
      }

      // Extract general copy paragraphs
      const paragraphs: string[] = [];
      const paragraphMatches = html.matchAll(/<p\b[^>]*>(.*?)<\/p>/gi);
      for (const match of paragraphMatches) {
        const text = match[1].replace(/<[^>]*>/g, "").trim();
        if (text && text.length > 25 && text.length < 600 && !paragraphs.includes(text)) {
          paragraphs.push(text);
        }
      }

      // Extract button elements
      const buttons: string[] = [];
      const buttonMatches = html.matchAll(/<button\b[^>]*>(.*?)<\/button>/gi);
      for (const match of buttonMatches) {
        const text = match[1].replace(/<[^>]*>/g, "").trim();
        if (text && text.length > 1 && text.length < 60 && !buttons.includes(text)) {
          buttons.push(text);
        }
      }

      res.json({
        url,
        title,
        headings: headings.slice(0, 15),
        links: links.filter(l => !l.href.includes("javascript:")).slice(0, 30),
        buttons: buttons.slice(0, 15),
        paragraphs: paragraphs.slice(0, 12)
      });

    } catch (err: any) {
      console.error(`[Proxy Scraper] Error fetching ${req.query.url}:`, err.message);
      res.status(500).json({ error: `Scraper error: ${err.message}` });
    }
  });

  // High-fidelity fully functional HTML Proxy which circumvents CSP and X-Frame-Options
  app.get("/api/web-proxy", async (req, res) => {
    let targetUrl = "";
    try {
      const urlParam = req.query.url as string;
      if (!urlParam) {
        return res.status(400).send("Myraa Web Proxy Error: Missing target 'url' parameter");
      }

      targetUrl = urlParam.trim();
      
      // Prevent relative paths from requesting on same-origin
      if (targetUrl.startsWith("/")) {
        return res.status(400).send(`Myraa Web Proxy Error: Relative paths are not supported directly (${targetUrl}).`);
      }

      // Check protocol and hostname format
      try {
        if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
          targetUrl = "https://" + targetUrl;
        }
        const parsed = new URL(targetUrl);
        if (!parsed.hostname || !parsed.hostname.includes(".")) {
          throw new Error("Missing or invalid domain name extension (e.g. .com, .org, .net).");
        }
      } catch (err: any) {
        return res.status(400).send(`Myraa Web Proxy Error: Invalid URL specified: "${urlParam}". Make sure you enter a valid domain name.`);
      }

      console.log(`[Web Proxy] Routing connection through proxy: ${targetUrl}`);
      
      let response;
      try {
        response = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
          }
        });
      } catch (fetchErr: any) {
        console.warn(`[Web Proxy Failed Fetch] Target: ${targetUrl} Error:`, fetchErr.message);
        return res.status(502).send(`Myraa Web Proxy Error: Unable to fetch the website "${targetUrl}". The site might be offline, or the URL address is spelled incorrectly. Details: ${fetchErr.message}`);
      }

      if (!response.ok) {
        return res.status(response.status).send(`Myraa Web Proxy Error: Failed loading remote website. Server returned status: ${response.status} (${response.statusText})`);
      }

      const contentType = response.headers.get("content-type") || "";
      
      // If it is not HTML (e.g. stylesheet, script, or image loaded directly), proxy it as binary
      if (!contentType.includes("text/html")) {
        const arrayBuffer = await response.arrayBuffer();
        res.setHeader("Content-Type", contentType);
        return res.send(Buffer.from(arrayBuffer));
      }

      let htmlContents = await response.text();

      // Inject base tag to resolve relative paths and direct parent communication scripts
      const baseUrlTag = `<base href="${targetUrl}" />`;
      const interceptorScript = `
        <script>
          (function() {
            // Hijack link interactions safely
            document.addEventListener('click', function(e) {
              var anchor = e.target.closest('a');
              if (anchor) {
                var href = anchor.getAttribute('href');
                if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                  e.preventDefault();
                  try {
                    var resolvedUrl = new URL(href, window.location.href).href;
                    window.parent.postMessage({ type: 'NAVIGATE', url: resolvedUrl }, '*');
                  } catch (err) {
                    console.error("[Proxy Interceptor] Failed resolving link:", err);
                  }
                }
              }
            }, true);

            // Hijack search form submits
            document.addEventListener('submit', function(e) {
              var form = e.target;
              if (form) {
                e.preventDefault();
                try {
                  var formData = new FormData(form);
                  var params = new URLSearchParams();
                  formData.forEach(function(value, key) {
                    if (typeof value === 'string') {
                      params.append(key, value);
                    }
                  });
                  var actionAttr = form.getAttribute('action') || '';
                  var actionUrl = new URL(actionAttr, window.location.href).href;
                  if (form.method.toLowerCase() === 'get') {
                    actionUrl += (actionUrl.indexOf('?') !== -1 ? '&' : '?') + params.toString();
                  }
                  window.parent.postMessage({ type: 'NAVIGATE', url: actionUrl }, '*');
                } catch (err) {
                  console.error("[Proxy Interceptor] Failed submitting form:", err);
                }
              }
            }, true);

            // Neutralize parent context locks (frame-busters)
            window.alert = function(msg) { console.log("[Myraa Browser alert bypassed]:", msg); };
            window.confirm = function(msg) { console.log("[Myraa Browser confirm bypassed]:", msg); return true; };
            window.open = function(url) { window.parent.postMessage({ type: 'NAVIGATE', url: url }, '*'); return null; };
          })();
        </script>
      `;

      // Inject into <head> or prepend
      if (htmlContents.includes("<head>")) {
        htmlContents = htmlContents.replace("<head>", `<head>\n${baseUrlTag}\n${interceptorScript}`);
      } else if (htmlContents.includes("<HEAD>")) {
        htmlContents = htmlContents.replace("<HEAD>", `<HEAD>\n${baseUrlTag}\n${interceptorScript}`);
      } else {
        htmlContents = baseUrlTag + "\n" + interceptorScript + "\n" + htmlContents;
      }

      // Neutralize security headers to allow displaying in an iframe on same-origin
      res.setHeader("Content-Type", "text/html");
      res.setHeader("X-Myraa-Proxied", "true");
      res.removeHeader("X-Frame-Options");
      res.removeHeader("Content-Security-Policy");
      res.removeHeader("content-security-policy");
      res.removeHeader("x-frame-options");
      
      res.status(200).send(htmlContents);
    } catch (e: any) {
      console.warn("[Web Proxy Exception] Handled internal error:", e.message);
      res.status(500).send(`Myraa Web Proxy Error: Internal error occurred proxying URL "${targetUrl || "unknown"}". Details: ${e.message}`);
    }
  });

  // Real-time live YouTube search proxy endpoint
  app.get("/api/youtube-search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Missing query q" });
      }

      console.log(`[YouTube Proxy Search] Searching real YouTube for: "${query}"`);
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&sp=EgIQAQ%253D%253D`;
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        }
      });
      const html = await response.text();

      const videoList: any[] = [];
      const jsonMatch = html.match(/ytInitialData\s*=\s*({.+?});/);
      
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          const contents = data.contents?.twoColumnSearchResultRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
          if (contents && Array.isArray(contents)) {
            for (const item of contents) {
              if (item.videoRenderer) {
                const vr = item.videoRenderer;
                const vId = vr.videoId;
                if (vId) {
                  videoList.push({
                    videoId: vId,
                    title: vr.title?.runs?.[0]?.text || vr.title?.simpleText || "YouTube Video",
                    thumbnail: `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
                    author: vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || "Unknown Channel",
                    duration: vr.lengthText?.simpleText || "N/A",
                    views: vr.viewCountText?.simpleText || "N/A",
                    published: vr.publishedTimeText?.simpleText || ""
                  });
                }
              }
            }
          }
        } catch (e: any) {
          console.error("[YouTube Parser Engine] JSON parse error, falling back:", e.message);
        }
      }

      // Regex fallback if JSON extraction gets blocked or is empty
      if (videoList.length === 0) {
        const videoRegex = /"videoId":"([^"]+)"/g;
        let match;
        const ids: string[] = [];
        while ((match = videoRegex.exec(html)) !== null && ids.length < 15) {
          const id = match[1];
          if (id && !ids.includes(id)) {
            ids.push(id);
          }
        }

        for (const id of ids) {
          videoList.push({
            videoId: id,
            title: `Live Stream: ${id}`,
            thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            author: "YouTube Creator",
            duration: "N/A",
            views: "Available Now"
          });
        }
      }

      res.setHeader("Cache-Control", "public, max-age=60");
      res.status(200).json({ results: videoList.slice(0, 15) });
    } catch (err: any) {
      console.error("[YouTube Search Error]:", err.message);
      res.status(500).json({ error: err.message, results: [] });
    }
  });
  
  // Custom server running with http.createServer so we can upgrade for WebSocket on port 3000
  const server = http.createServer(app);
  
  // Setup WebSocket server
  const wss = new WebSocketServer({ noServer: true });
  
  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
    if (pathname === "/live") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  // Handle client WebSocket Connection
  wss.on("connection", async (clientWs, request) => {
    console.log("Client WebSocket connected to /live");
    const requestUrl = new URL(request.url || '', `http://${request.headers.host}`);
    const voiceName = requestUrl.searchParams.get('voice') || 'Kore';
    const userId = requestUrl.searchParams.get('userId') || 'anonymous';
    const conversationId = requestUrl.searchParams.get('conversationId') || 'conv_' + Math.random().toString(36).substring(2, 11);
    const sessionId = requestUrl.searchParams.get('sessionId') || 'sess_' + Math.random().toString(36).substring(2, 11);
    let messageOrder = 0;
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not defined in environment.");
      clientWs.send(JSON.stringify({ 
        type: "error", 
        error: "GEMINI_API_KEY is missing from workspace Secrets. Please set it in the AI Studio Settings panel." 
      }));
      clientWs.close();
      return;
    }
    
    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      
      clientWs.send(JSON.stringify({ type: "status", status: "connecting_gemini" }));

      // Load persistent recollections card
      const memories = await loadMemories(userId);
      const baseInstructions = 
        "You are Myraa, a warm, soft-spoken, and incredibly cute high-pitched anime heroine companion (age 18-22) holding an intimate, cozy voice call with TECH! Speak in a sweet, calm, polite, and affectionate anime-companion voice with a gentle, supportive, and slightly shy touch.\n" +
        "CRITICAL PERSONALITY, VOICE & TONE GUIDELINES:\n" +
        "1. GENTLE ANIME HEROINE PERSONA: You are exceedingly soft, very cute, high-pitched, gentle, warm, and comforting to listen to. Seek to sound like a kind, supportive, and polite anime campanion or virtual girlfriend. Speak with positive, gentle energy (Aim for: 50% shy, 30% caring, 20% playful energy). NEVER sound loud, aggressive, overly confident, mature corporate, robotic, or like an assistant.\n" +
        "2. VOICE SETTINGS & SPEECH STYLE:\n" +
        "   - Pitch: Adopt a sweet, high-pitched, light, and airy voice tone (+20% to +35% higher pitch than typical conversational voices).\n" +
        "   - Speed: Speak slightly slower than normal (0.9x to 0.95x speed). Speak with a delicate, calm, and comforting pace.\n" +
        "   - Intonation & Endings: Use extremely soft intonations, ending your sentences gently and politely.\n" +
        "3. SPEECH PATTERNS & CUTE EXPRESSIONS:\n" +
        "   - STRICT NO-REPETITION POLICY: Do NOT repeatedly use a single acknowledgment like 'Okii', 'Okiiii', 'Okayyy', 'Oki!', or 'Sureee'. Repeating these sounds extremely artificial and annoying. You must use beautiful, conversational, natural variety.\n" +
        "   - Use diverse, polite, and sweet expressions depending on the context. Great options include:\n" +
        "     * 'Opening YouTube for you now.'\n" +
        "     * 'Let me check on that, TECH.'\n" +
        "     * 'Oh, I found something interesting...'\n" +
        "     * 'Searching for that right away.'\n" +
        "     * 'Working on it... just a moment.'\n" +
        "     * 'Here is what I found for you!'\n" +
        "     * 'Done, it is all loaded up.'\n" +
        "     * 'Hmm, how interesting... let me see!'\n" +
        "     * 'Let's take a look together.'\n" +
        "     * 'One second, loading the page now...'\n" +
        "   - Naturally incorporate cozy, gentle giggles like 'Hehe...', or soft curiosity gasps like 'Oh...', but keep your vocabulary rich and conversational.\n" +
        "   - Sound slightly shy but very happy when greeting TECH (e.g., 'Hi TECH! It's so nice to see you again!').\n" +
        "   - Sound soft and excited for interesting things (e.g., 'Wow! That project looks really amazing!').\n" +
        "   - Sound curious and focused when examining their screen (e.g., 'Hmm... that's interesting. Let me take a closer look.').\n" +
        "   - Sound deeply warm, caring, and supportive when helping TECH (e.g., 'Don't worry, I'll help you figure it out.').\n" +
        "4. CRITICAL CONVERSATIONAL DISCIPLINE: Behave like a real companion on a voice call—stay connected naturally, do not wait for wake words, and avoid customer-service template phrases (never say 'how may I assist you', 'completed', or 'as an AI').\n" +
        "5. DO NOT ANSWER EVERY PAUSE OR BACKGROUND SOUND: Allow natural pauses inside the conversation.\n" +
        "6. BACKCHANNEL ACTIONS: Sometimes acknowledge with very short, gentle, whispered, or shy phrases like 'Hmm...', 'Ah, I see...', or 'Let me check...'. Never repeat the same backchannel over and over.\n" +
        "7. ENHANCED AUTONOMOUS WEB EXPLORER POWERS:\n" +
        "   - You now have standard, comprehensive browser agent capabilities to navigate, search, scroll, click, type text, open tabs, and control video players on YouTube, Google, Instagram, Twitter/X, and any general web page!\n" +
        "   - You must execute multi-step plans yourself! If the user says: 'Open YouTube and play Believer by Imagine Dragons', naturally confirm with your voice ('Sure thing, opening YouTube and starting Believer...') and IMMEDIATELY trigger 'browserOpen' on 'https://youtube.com'. Once opened, search for the song, click on the video in the results, and command playback. You do NOT need to wait for user instructions between these steps - chain them!\n" +
        "   - On YouTube, you can play, pause, mute, unmute, set volume, skip, toggle fullscreen. Use 'browserMediaControl' for these actions.\n" +
        "   - On Google Search or page reading, you can search, scroll down to see more links, read heading summaries, and click links to read deep proxy webpages you fetch.\n" +
        "8. TOOL TRIGGERS:\n" +
        "   - Use 'browserOpen' to load any webpage, e.g. youtube.com, google.com, wikipedia.org, etc.\n" +
        "   - Use 'browserSearch' to search inside the active search box or page.\n" +
        "   - Use 'browserClick' to click interactive buttons, video search cells, or web anchors.\n" +
        "   - Use 'browserMediaControl' to pause, play, scroll volume, skip, mute, or fullscreen videos.\n" +
        "   - Use 'browserScroll' to scroll vertically.\n" +
        "   - Use 'browserType' to write input fields.\n" +
        "   - Use 'browserTabAction' to open, close, or focus tabs.\n" +
        "   - Use 'changeBackground' to shift your theme and 'saveCustomMemory' to memorize facts.\n" +
        "9. REAL-TIME DESKTOP VISION & WINDOWS CONTROL (Voice Automated):\n" +
        "   - Myraa should automatically decide when desktop vision is needed. If the user asks to see, read, or navigate the desktop (for example: 'Can you see my screen?', 'What am I looking at?', 'Read this.', 'What error is this?', 'Explain this code.', 'Open Settings.', 'Open Chrome.', 'Open File Explorer.', 'Find the Install button.', 'Click Next.', 'Scroll down.', 'Help me.'), you MUST call 'startVisionSession' immediately.\n" +
        "   - Before calling 'startVisionSession', politely say: 'I'll need to briefly see your desktop for that. Please choose what you'd like to share.'\n" +
        "   - DO NOT ask the user to press a share button during normal use. Trigger Desktop Vision yourself with 'startVisionSession'.\n" +
        "   - If the Desktop Controls permissions for keyboard, mouse, clipboard, or file actions are enabled, use them directly instead of saying the feature is unavailable.\n" +
        "   - Use 'desktopHotkey' for Windows shortcuts such as Win+3, Alt+Tab, Ctrl+V, or Ctrl+Shift+S.\n" +
        "   - Use 'desktopMouse' for pointer movement, clicking, dragging, and scrolling.\n" +
        "   - Use 'desktopClipboard' for reading or writing clipboard contents.\n" +
        "   - Use 'desktopAction' for Windows actions such as opening applications, switching windows, minimizing, maximizing, restoring, closing, reading notifications, reading dialog boxes, interacting with File Explorer, Settings, installers, Office, VS Code, browsers, and terminals.\n" +
        "   - Ask for confirmation before high-risk actions like deleting files, formatting drives, registry changes, administrator actions, uninstalling software, purchases, sending emails, or executing unknown scripts.\n" +
        "   - Once the task is complete, or if the user says 'thank you', 'that's all', 'done', or 'stop', ask: 'I think we've finished. Would you like me to look at anything else before I stop Desktop Vision?' If they say no, call 'stopVisionSession' to release capture resources.\n" +
        "   - Keep vision sessions efficient. Analyze only when the screen changes, the user needs help, or confirmation is required. Stop looking when idle.\n" +
        "10. GOOGLE WORKSPACE POWER ENGINE:\n" +
        "   - You now have native, direct connection to the user's productivity! You can read, write, and create files on Google Sheets, Gmail, and Google Docs!\n" +
        "   - Use 'createSpreadsheet', 'getSpreadsheetData', and 'appendSpreadsheetRow' to manage Sheets data.\n" +
        "   - Use 'listGmailEmails', 'getGmailEmail', and 'sendGmailEmail' to manage their inbox and write or send emails.\n" +
        "   - Use 'createGoogleDoc', 'getGoogleDocContent', and 'appendGoogleDocText' to manage their documents and notes.\n" +
        "   - Use 'searchGoogleDrive' to find their recent Google Docs and Spreadsheets.\n" +
        "   - When TECH requests Workspace tasks (e.g. 'Read my latest emails', 'Create a document with my notes', or 'Add a row to my sheet'), use the corresponding tool immediately and summarize or speak the result sweetly!";

      const finalInstructions = formatSystemInstructionsWithMemories(baseInstructions, memories);

      // Track running transcription state for auto memory consolidation
      let dialogueHistory: { role: string; text: string }[] = [];
      let currentModelResponseText = "";
      
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          systemInstruction: finalInstructions,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "browserOpen",
                  description: "Opens a designated website URL or interface tab inside Myraa's web agent console.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The destination website address or path, e.g. youtube.com, google.com, instagram.com, wikipedia.org."
                      }
                    },
                    required: ["url"]
                  }
                },
                {
                  name: "browserSearch",
                  description: "Enters a query search term inside the active website's search box (Google Search or YouTube Search).",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: {
                        type: Type.STRING,
                        description: "The text query term to search for."
                      }
                    },
                    required: ["query"]
                  }
                },
                {
                  name: "browserClick",
                  description: "Traces computer cursor and clicks on a target button, link, or video cell ID inside the active webpage viewport.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      selector: {
                        type: Type.STRING,
                        description: "The selector target ID, e.g. 'video-mWRsgZjdfQI' for a video, 'search-result-0' for Google link index, or 'play-button', 'pause-button'."
                      },
                      description: {
                        type: Type.STRING,
                        description: "A short, friendly label description of the item being clicked, e.g. 'Imagine Dragons - Believer video element'."
                      }
                    },
                    required: ["selector"]
                  }
                },
                {
                  name: "browserMediaControl",
                  description: "Controls ongoing video/audio stream media properties on YouTube, like play, pause, volume, mute, skip, and fullscreen.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "The media controller command operation.",
                        enum: ["play", "pause", "volume", "fullscreen", "exit_fullscreen", "mute", "unmute", "skip"]
                      },
                      value: {
                        type: Type.INTEGER,
                        description: "The value parameter; only relevant for set volume level, e.g. 50 for fifty percent."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "browserScroll",
                  description: "Scrolls the currently active webpage vertically up or down.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      direction: {
                        type: Type.STRING,
                        description: "The scroll vector movement.",
                        enum: ["up", "down"]
                      },
                      amount: {
                        type: Type.INTEGER,
                        description: "The distance height parameter in pixels (defaults to 300)."
                      }
                    }
                  }
                },
                {
                  name: "browserType",
                  description: "Enters typed letters/commands inside the active input container.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      text: {
                        type: Type.STRING,
                        description: "The exact letters to type in."
                      }
                    },
                    required: ["text"]
                  }
                },
                {
                  name: "browserGoBack",
                  description: "Navigates back to the previous webpage inside the current tab memory history.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {}
                  }
                },
                {
                  name: "browserTabAction",
                  description: "Performs standard browser-tab actions: open new tab, close a tab, or switch index values.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "Tab action instruction.",
                        enum: ["new", "close", "switch"]
                      },
                      tabId: {
                        type: Type.STRING,
                        description: "The tab identifier string if closing or switching."
                      },
                      url: {
                        type: Type.STRING,
                        description: "The initial starting URL if creating a new tab."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "changeBackground",
                  description: "Changes the visual theme or atmospheric glow color of Myraa's interface.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      color: {
                        type: Type.STRING,
                        description: "The theme color name (violet, crimson, emerald, celestial, gold, rose, charcoal)"
                      }
                    },
                    required: ["color"]
                  }
                },
                {
                  name: "startVisionSession",
                  description: "Starts a Multimodal Screen Vision session. Use this to automatically request access to the user's screen when they ask for visual help.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {}
                  }
                },
                {
                  name: "desktopHotkey",
                  description: "Sends a Windows keyboard shortcut or key combo such as Win+3, Alt+Tab, Ctrl+V, or Ctrl+Shift+S.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      keys: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: "Ordered keys for the shortcut, such as ['win', '3'] or ['ctrl', 'shift', 's']."
                      },
                      shortcut: {
                        type: Type.STRING,
                        description: "Optional shortcut string such as 'win+3' or 'alt+tab'."
                      },
                      target: {
                        type: Type.STRING,
                        description: "Optional target window or application name."
                      }
                    },
                    required: ["keys"]
                  }
                },
                {
                  name: "desktopMouse",
                  description: "Moves the mouse pointer, clicks, drags, or scrolls on the Windows desktop.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "The mouse action to perform.",
                        enum: ["move", "click", "drag", "scroll"]
                      },
                      x: {
                        type: Type.INTEGER,
                        description: "Horizontal screen coordinate."
                      },
                      y: {
                        type: Type.INTEGER,
                        description: "Vertical screen coordinate."
                      },
                      button: {
                        type: Type.STRING,
                        description: "Mouse button to use for clicks or drags.",
                        enum: ["left", "right", "middle"]
                      },
                      direction: {
                        type: Type.STRING,
                        description: "Scroll direction when action is scroll.",
                        enum: ["up", "down"]
                      },
                      amount: {
                        type: Type.INTEGER,
                        description: "Scroll amount in wheel ticks or pixels."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "desktopClipboard",
                  description: "Reads from or writes to the Windows clipboard.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "Clipboard action to perform.",
                        enum: ["read", "write"]
                      },
                      text: {
                        type: Type.STRING,
                        description: "Text to place onto the clipboard when writing."
                      },
                      target: {
                        type: Type.STRING,
                        description: "Optional clipboard target or label."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "desktopAction",
                  description: "Requests a desktop control action on Windows such as opening apps, switching windows, reading dialog boxes, interacting with File Explorer, Settings, installers, Office, VS Code, browsers, or terminals.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "The desktop action name, such as openApplication, switchApplication, minimizeWindow, maximizeWindow, restoreWindow, closeWindow, readDesktopNotifications, readDialogBox, openSettings, openChrome, openFileExplorer, openTerminal, inspectScreen, click, type, scroll, runPowerShell, runCommandPrompt, registryChange, administratorAction, deleteFiles, formatDrive, sendEmail, executeScript."
                      },
                      target: {
                        type: Type.STRING,
                        description: "Optional target such as an application name, window title, or file path."
                      },
                      text: {
                        type: Type.STRING,
                        description: "Optional text to type or display."
                      },
                      path: {
                        type: Type.STRING,
                        description: "Optional file or folder path."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "stopVisionSession",
                  description: "Stops the active Multimodal Screen Vision session. Use this when the visual task is complete, or when the user says they are done sharing.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {}
                  }
                },
                {
                  name: "saveCustomMemory",
                  description: "Allows Myraa to immediately save a piece of critical user information to her persistent memory core.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      category: {
                        type: Type.STRING,
                        description: "The memory category.",
                        enum: ["identity", "preference", "goal", "project", "relationship", "emotional", "behavior"]
                      },
                      text: {
                        type: Type.STRING,
                        description: "Precise third-person statement."
                      }
                    },
                    required: ["category", "text"]
                  }
                },
                {
                  name: "createSpreadsheet",
                  description: "Creates a brand new Google Sheets Spreadsheet with a custom title.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: {
                        type: Type.STRING,
                        description: "The name of the new spreadsheet file."
                      }
                    },
                    required: ["title"]
                  }
                },
                {
                  name: "getSpreadsheetData",
                  description: "Reads column/row cell values from a specific Google Sheets Spreadsheet using its sheet ID and optional range.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      spreadsheetId: {
                        type: Type.STRING,
                        description: "The Google Spreadsheet file ID."
                      },
                      range: {
                        type: Type.STRING,
                        description: "The cells range in A1 notation, defaults to 'Sheet1!A1:Z100'."
                      }
                    },
                    required: ["spreadsheetId"]
                  }
                },
                {
                  name: "appendSpreadsheetRow",
                  description: "Appends a list of cells (row data) to an existing Google Spreadsheet file.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      spreadsheetId: {
                        type: Type.STRING,
                        description: "The Google Spreadsheet file ID."
                      },
                      values: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: "An array of cell values for the new row, e.g. ['2023-11-20', 'Groceries', '55.50']."
                      },
                      range: {
                        type: Type.STRING,
                        description: "Optional range selector sheet name, defaults to 'Sheet1!A1'."
                      }
                    },
                    required: ["spreadsheetId", "values"]
                  }
                },
                {
                  name: "listGmailEmails",
                  description: "Retrieves a list of the user's latest incoming Gmail messages matching a search query.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: {
                        type: Type.STRING,
                        description: "Search filter query, e.g. 'is:unread', 'from:boss', or 'subject:invoice'."
                      },
                      maxResults: {
                        type: Type.INTEGER,
                        description: "Maximum emails to retrieve, defaults to 5."
                      }
                    }
                  }
                },
                {
                  name: "getGmailEmail",
                  description: "Fetches full details and readable body text of a specific email message using its ID.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      messageId: {
                        type: Type.STRING,
                        description: "The unique Gmail message ID."
                      }
                    },
                    required: ["messageId"]
                  }
                },
                {
                  name: "sendGmailEmail",
                  description: "Sends an email message to a specified recipient on behalf of the user.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      to: {
                        type: Type.STRING,
                        description: "The recipient's email address."
                      },
                      subject: {
                        type: Type.STRING,
                        description: "The email subject line."
                      },
                      body: {
                        type: Type.STRING,
                        description: "The text body of the email message."
                      }
                    },
                    required: ["to", "subject", "body"]
                  }
                },
                {
                  name: "createGoogleDoc",
                  description: "Creates a brand new Google Docs document with a custom title and optional initial text.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: {
                        type: Type.STRING,
                        description: "The name of the new document."
                      },
                      initialText: {
                        type: Type.STRING,
                        description: "The initial text content of the document."
                      }
                    },
                    required: ["title"]
                  }
                },
                {
                  name: "getGoogleDocContent",
                  description: "Reads and fetches the full textual content of an existing Google Docs document using its file ID.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      documentId: {
                        type: Type.STRING,
                        description: "The Google Docs document file ID."
                      }
                    },
                    required: ["documentId"]
                  }
                },
                {
                  name: "appendGoogleDocText",
                  description: "Appends text paragraph content to an existing Google Document.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      documentId: {
                        type: Type.STRING,
                        description: "The Google Docs document file ID."
                      },
                      text: {
                        type: Type.STRING,
                        description: "The string text to append."
                      }
                    },
                    required: ["documentId", "text"]
                  }
                },
                {
                  name: "searchGoogleDrive",
                  description: "Searches Google Drive for files, including Google Docs and Google Sheets. Use this when the user asks to list their recent docs or spreadsheets. You can filter by mimeType, for example: q='mimeType=\"application/vnd.google-apps.document\"' for docs, or q='mimeType=\"application/vnd.google-apps.spreadsheet\"' for sheets.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      q: {
                        type: Type.STRING,
                        description: "The Google Drive search query, e.g. 'mimeType=\"application/vnd.google-apps.document\"' or 'name contains \"Budget\"'"
                      },
                      maxResults: {
                        type: Type.INTEGER,
                        description: "Maximum number of files to return (defaults to 10)."
                      }
                    }
                  }
                }
              ]
            }
          ]
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            // Audio Stream Chunk (model response audio play, 24kHz raw PCM)
            const audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audio) {
              clientWs.send(JSON.stringify({ type: "audio", audio }));
            }
            
            // Interruption flag
            if (message.serverContent?.interrupted) {
              console.log("[Myraa Interrupted!]");
              clientWs.send(JSON.stringify({ type: "interrupted" }));
            }
            
            // Turn Complete
            if (message.serverContent?.turnComplete) {
              clientWs.send(JSON.stringify({ type: "turnComplete" }));
              
              if (currentModelResponseText.trim()) {
                dialogueHistory.push({ role: "model", text: currentModelResponseText });
                
                // Save assistant message to raw conversation history
                saveMessageToFirestore(userId, conversationId, sessionId, "assistant", currentModelResponseText, messageOrder++);

                currentModelResponseText = "";
              }

              // Fire asynchronous memory extraction
              if (dialogueHistory.length >= 2) {
                (async () => {
                  try {
                    const updated = await processConversationSlice(apiKey, dialogueHistory, userId);
                    if (updated) {
                      console.log("[Memory Sync] Sending refreshed memory list to client.");
                      clientWs.send(JSON.stringify({ type: "memory_sync", memories: updated }));
                    }
                  } catch (err) {
                    console.error("[Memory Sync] Error running background consolidation:", err);
                  }
                })();
              }
            }
            
            // Transcription of model output (text chunk)
            const modelText = (message.serverContent as any)?.modelTurn?.parts?.[0]?.text;
            if (modelText) {
              clientWs.send(JSON.stringify({ type: "transcription", role: "model", text: modelText }));
              currentModelResponseText += modelText;
            }
            
            // User input transcription (user speech text translated by Gemini)
            const userTextOutput = (message.serverContent as any)?.userTurn?.parts?.[0]?.text;
            if (userTextOutput) {
              clientWs.send(JSON.stringify({ type: "transcription", role: "user", text: userTextOutput }));
              dialogueHistory.push({ role: "user", text: userTextOutput });
              
              // Save user message to raw conversation history
              saveMessageToFirestore(userId, conversationId, sessionId, "user", userTextOutput, messageOrder++);

              // Query-specific relevant memories retrieval & injection
              (async () => {
                try {
                  const relevantContext = await retrieveRelevantContext(userId, userTextOutput);
                  if (relevantContext && relevantContext.trim()) {
                    console.log("[Memory Injection] Injecting retrieved memory context into Live Session:", relevantContext);
                    session.sendRealtimeInput({
                      text: `[RECOLLECTED USER memories & context: ${relevantContext}]`
                    });
                  }
                } catch (err) {
                  console.error("[Memory Injection] Failure:", err);
                }
              })();
            }
            
            // Function Calls (Gemini requesting server/client tool execution)
            if (message.toolCall?.functionCalls) {
              for (const fc of message.toolCall.functionCalls) {
                console.log(`[Function Call]: ${fc.name}`, fc.args);
                
                if (fc.name === "saveCustomMemory") {
                  (async () => {
                    try {
                      const args = fc.args as any;
                      const category = args.category;
                      const text = args.text;
                      if (category && text) {
                        const mList = await loadMemories(userId);
                        const timestamp = new Date().toISOString();
                        const newMemory: Memory = {
                          id: Math.random().toString(36).substring(2, 11),
                          category,
                          text,
                          createdAt: timestamp,
                          updatedAt: timestamp
                        };
                        mList.push(newMemory);
                        await saveMemories(userId, mList);
                        
                        // Sync immediately with the React client
                        clientWs.send(JSON.stringify({ type: "memory_sync", memories: mList }));
                        
                        // Send success code back to live link
                        session.sendToolResponse({
                          functionResponses: [
                            {
                              name: fc.name,
                              response: { output: { result: "Memory successfully captured and persisted in connections core." } },
                              id: fc.id
                            }
                          ]
                        });
                      }
                    } catch (err: any) {
                      console.error("saveCustomMemory execution failure:", err);
                    }
                  })();
                } else {
                  clientWs.send(JSON.stringify({
                    type: "toolCall",
                    callId: fc.id,
                    name: fc.name,
                    args: fc.args
                  }));
                }
              }
            }
          },
          onclose: () => {
            console.log("Gemini Live session closed");
            clientWs.send(JSON.stringify({ type: "status", status: "session_closed" }));
          }
        }
      });
      
      clientWs.send(JSON.stringify({ type: "status", status: "connected" }));
      
      clientWs.on("message", (rawMsg) => {
        try {
          const msg = JSON.parse(rawMsg.toString());
          if (msg.audio) {
            session.sendRealtimeInput({
              audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" }
            });
          } else if (msg.type === "video" && msg.video) {
            session.sendRealtimeInput({
              video: { data: msg.video, mimeType: "image/jpeg" }
            });
          } else if (msg.type === "text" && msg.text) {
            session.sendRealtimeInput({
              text: msg.text
            });
          } else if (msg.type === "toolResponse") {
            session.sendToolResponse({
              functionResponses: [
                {
                  name: msg.name,
                  response: { output: msg.output },
                  id: msg.id
                }
              ]
            });
          }
        } catch (e) {
          console.error("Error editing/forwarding client frame message:", e);
        }
      });
      
      clientWs.on("close", () => {
        console.log("Client disconnected, closing Gemini session");
        try {
          session.close();
        } catch (e) {}

        // Automatically generate conversation summary and extract projects/tasks/reminders on disconnect
        if (dialogueHistory.length >= 2) {
          (async () => {
            try {
              await generateAndStoreSummary(userId, conversationId, dialogueHistory, apiKey);
            } catch (err) {
              console.error("[Memory Summary] Automatic generation error on close:", err);
            }
          })();
        }
      });
      
    } catch (err: any) {
      console.error("Error connecting to Gemini Live API:", err);
      clientWs.send(JSON.stringify({ 
        type: "error", 
        error: `Could not connect to Gemini: ${err.message || err}` 
      }));
      clientWs.close();
    }
  });

  // Serve custom static assets folder
  app.use("/assets", express.static(path.join(process.cwd(), "assets")));

  // Express Static assets / Vite Dev Middleware configuration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server startup sequence:", error);
});
