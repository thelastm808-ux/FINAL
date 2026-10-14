// Google Workspace Client API helper library

/**
 * Encodes text into a safe Base64URL string for Google Workspace APIs.
 */
function base64UrlEncode(str: string): string {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = "";
  utf8Bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  const base64 = btoa(binary);
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface WorkspaceDoc {
  title: string;
  documentId: string;
}

export interface WorkspaceSpreadsheet {
  title: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  from?: string;
  subject?: string;
  date?: string;
  body?: string;
}

export const googleDocs = {
  /**
   * Fetches full textual content of a Google Doc.
   */
  async getContent(accessToken: string, documentId: string): Promise<string> {
    console.log(`[Google Docs API] Requesting content for documentId: ${documentId}`);
    const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[Google Docs API Error] Failed to fetch content for documentId: ${documentId}. Details:`, err);
      throw new Error(err.error?.message || `Google Docs returned status ${res.status}`);
    }
    const docData = await res.json();
    console.log(`[Google Docs API] Successfully retrieved document content for documentId: ${documentId}`);
    
    // Extract text elements from document body
    let fullText = "";
    if (docData.body && docData.body.content) {
      docData.body.content.forEach((element: any) => {
        if (element.paragraph && element.paragraph.elements) {
          element.paragraph.elements.forEach((el: any) => {
            if (el.textRun && el.textRun.content) {
              fullText += el.textRun.content;
            }
          });
        }
      });
    }
    return fullText;
  },

  /**
   * Creates a new Google Document.
   */
  async create(accessToken: string, title: string, initialText?: string): Promise<WorkspaceDoc> {
    const res = await fetch("https://docs.googleapis.com/v1/documents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Failed to create Google Doc");
    }
    const newDoc = await res.json();
    
    if (initialText && newDoc.documentId) {
      await this.appendText(accessToken, newDoc.documentId, initialText);
    }
    return {
      title: newDoc.title,
      documentId: newDoc.documentId,
    };
  },

  /**
   * Appends text to the end of an existing Google Document.
   */
  async appendText(accessToken: string, documentId: string, text: string): Promise<void> {
    // To append, we need to know the document's body content end index or use insertText at index 1 for draft,
    // or fetch doc metadata first. Let's do a safe fetch first to find the end index.
    const getRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!getRes.ok) throw new Error("Failed to read document metadata before append");
    const docData = await getRes.json();
    
    // Default fallback index is 1, otherwise insert at the document end
    let endIndex = 1;
    if (docData.body && docData.body.content) {
      const len = docData.body.content.length;
      if (len > 0) {
        endIndex = docData.body.content[len - 1].endIndex || 1;
        if (endIndex > 1) {
          // Subtract 1 to stay inside the valid document insertion boundary
          endIndex = endIndex - 1;
        }
      }
    }

    const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              text: text,
              location: { index: endIndex },
            },
          },
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Failed to append text to Google Doc");
    }
  },
};

export const googleSheets = {
  /**
   * Retrieves cell range values from a Google Spreadsheet.
   */
  async getData(accessToken: string, spreadsheetId: string, range?: string): Promise<any[][]> {
    console.log(`[Google Sheets API] Requesting data for spreadsheetId: ${spreadsheetId}, range: ${range}`);
    
    let targetRange = range;
    if (!targetRange || targetRange.startsWith("Sheet1!")) {
      // Fetch metadata to find the first sheet's name
      const metaRes = await fetch(`https://sheets.googleapis.com/v1/spreadsheets/${spreadsheetId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!metaRes.ok) {
        const err = await metaRes.json().catch(() => ({}));
        console.error(`[Google Sheets API Error] Failed to fetch metadata for spreadsheetId: ${spreadsheetId}. Details:`, err);
        throw new Error(err.error?.message || "Failed to retrieve Google Sheet metadata");
      }
      const metaData = await metaRes.json();
      const firstSheetName = metaData.sheets?.[0]?.properties?.title || "Sheet1";
      targetRange = range ? range.replace("Sheet1!", `${firstSheetName}!`) : `${firstSheetName}!A1:Z100`;
    }

    const res = await fetch(`https://sheets.googleapis.com/v1/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(targetRange)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[Google Sheets API Error] Failed to read from spreadsheetId: ${spreadsheetId} at range ${targetRange}. Details:`, err);
      throw new Error(err.error?.message || "Failed to retrieve Google Sheet data");
    }
    const data = await res.json();
    console.log(`[Google Sheets API] Successfully retrieved data for spreadsheetId: ${spreadsheetId}`);
    return data.values || [];
  },

  /**
   * Creates a new Google Spreadsheet.
   */
  async create(accessToken: string, title: string): Promise<WorkspaceSpreadsheet> {
    const res = await fetch("https://sheets.googleapis.com/v1/spreadsheets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: { title },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Failed to create Google Spreadsheet");
    }
    const data = await res.json();
    return {
      title: data.properties.title,
      spreadsheetId: data.spreadsheetId,
      spreadsheetUrl: data.spreadsheetUrl,
    };
  },

  /**
   * Appends a list of cells as a new row to a Google Spreadsheet.
   */
  async appendRow(accessToken: string, spreadsheetId: string, values: any[], range?: string): Promise<void> {
    let targetRange = range;
    if (!targetRange || targetRange.startsWith("Sheet1!")) {
      const metaRes = await fetch(`https://sheets.googleapis.com/v1/spreadsheets/${spreadsheetId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!metaRes.ok) {
        const err = await metaRes.json().catch(() => ({}));
        console.error(`[Google Sheets API Error] Failed to fetch metadata for spreadsheetId: ${spreadsheetId}. Details:`, err);
        throw new Error(err.error?.message || "Failed to retrieve Google Sheet metadata for appending");
      }
      const metaData = await metaRes.json();
      const firstSheetName = metaData.sheets?.[0]?.properties?.title || "Sheet1";
      targetRange = range ? range.replace("Sheet1!", `${firstSheetName}!`) : `${firstSheetName}!A1`;
    }

    const res = await fetch(
      `https://sheets.googleapis.com/v1/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(targetRange)}:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [values],
        }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[Google Sheets API Error] Failed to append row to spreadsheetId: ${spreadsheetId} at range ${targetRange}. Details:`, err);
      throw new Error(err.error?.message || "Failed to append row to Google Sheet");
    }
  },
};

export const gmail = {
  /**
   * Lists the most recent emails in the user's Gmail inbox.
   */
  async listEmails(accessToken: string, query = "is:unread", maxResults = 5): Promise<GmailMessage[]> {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Failed to list Gmail messages");
    }
    const listData = await res.json();
    const messagesList: { id: string; threadId: string }[] = listData.messages || [];
    
    // Fetch individual details in parallel for maximum speed
    const detailPromises = messagesList.map(async (msg) => {
      try {
        const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!detailRes.ok) return null;
        const detail = await detailRes.json();
        
        // Extract Subject, From, Date headers
        let subject = "(No Subject)";
        let from = "(Unknown Sender)";
        let date = "";
        
        if (detail.payload && detail.payload.headers) {
          const headers: any[] = detail.payload.headers;
          const subjectHeader = headers.find(h => h.name.toLowerCase() === "subject");
          const fromHeader = headers.find(h => h.name.toLowerCase() === "from");
          const dateHeader = headers.find(h => h.name.toLowerCase() === "date");
          
          if (subjectHeader) subject = subjectHeader.value;
          if (fromHeader) from = fromHeader.value;
          if (dateHeader) date = dateHeader.value;
        }

        return {
          id: msg.id,
          threadId: msg.threadId,
          snippet: detail.snippet || "",
          from,
          subject,
          date,
        } as GmailMessage;
      } catch (err) {
        console.error(`Failed to fetch details for email ID: ${msg.id}`, err);
        return null;
      }
    });

    const results = await Promise.all(detailPromises);
    return results.filter((r): r is GmailMessage => r !== null);
  },

  /**
   * Retrieves details and text body of a specific email message.
   */
  async getEmail(accessToken: string, messageId: string): Promise<GmailMessage> {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to retrieve email ${messageId}`);
    }
    const detail = await res.json();
    
    let subject = "(No Subject)";
    let from = "(Unknown Sender)";
    let date = "";
    let body = "";

    if (detail.payload && detail.payload.headers) {
      const headers: any[] = detail.payload.headers;
      const subjectHeader = headers.find(h => h.name.toLowerCase() === "subject");
      const fromHeader = headers.find(h => h.name.toLowerCase() === "from");
      const dateHeader = headers.find(h => h.name.toLowerCase() === "date");
      
      if (subjectHeader) subject = subjectHeader.value;
      if (fromHeader) from = fromHeader.value;
      if (dateHeader) date = dateHeader.value;
    }

    // Basic MIME body parser
    if (detail.payload) {
      if (detail.payload.body && detail.payload.body.data) {
        body = atob(detail.payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
      } else if (detail.payload.parts) {
        const findTextPart = (parts: any[]): string => {
          for (const p of parts) {
            if (p.mimeType === "text/plain" && p.body && p.body.data) {
              return atob(p.body.data.replace(/-/g, "+").replace(/_/g, "/"));
            }
            if (p.parts) {
              const b = findTextPart(p.parts);
              if (b) return b;
            }
          }
          return "";
        };
        body = findTextPart(detail.payload.parts);
      }
    }

    return {
      id: messageId,
      threadId: detail.threadId,
      snippet: detail.snippet || "",
      from,
      subject,
      date,
      body,
    };
  },

  /**
   * Sends an email on behalf of the authenticated user.
   */
  async sendEmail(accessToken: string, to: string, subject: string, body: string): Promise<void> {
    const emailContent = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="utf-8"',
      "MIME-Version: 1.0",
      "",
      body,
    ].join("\r\n");

    const raw = base64UrlEncode(emailContent);

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Failed to send Gmail message");
    }
  },
};

export const googleDrive = {
  /**
   * Lists the Google Drive files.
   */
  async listFiles(accessToken: string, q = "", maxResults = 10): Promise<{ id: string; name: string; mimeType: string }[]> {
    const url = `https://www.googleapis.com/drive/v3/files?maxResults=${maxResults}&q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error("Failed to list Google Drive files");
    }
    const data = await res.json();
    return data.files || [];
  }
};
