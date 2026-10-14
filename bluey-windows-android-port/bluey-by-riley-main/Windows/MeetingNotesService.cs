using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Bluey.Windows;

public sealed class MeetingNotesService
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromMinutes(5) };
    public string Root => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Bluey Notes");

    public string SaveSession(string serializedSession)
    {
        using var doc = JsonDocument.Parse(serializedSession);
        var root = doc.RootElement;
        string id = GetString(root, "id");
        if (string.IsNullOrWhiteSpace(id)) throw new InvalidOperationException("Session metadata has no id.");
        double started = GetNumber(root, "started", DateTimeOffset.Now.ToUnixTimeSeconds());
        var folder = SessionFolder(id, DateTimeOffset.FromUnixTimeMilliseconds((long)(started * 1000)).LocalDateTime);
        Directory.CreateDirectory(folder);
        File.WriteAllText(Path.Combine(folder, "session.json"), JsonSerializer.Serialize(root, new JsonSerializerOptions { WriteIndented = true }));
        File.WriteAllText(Path.Combine(folder, "notes.md"), ToMarkdown(root, started), new UTF8Encoding(false));
        return folder;
    }

    public async Task<string> TranscribeAsync(string audioBase64, string metadataText)
    {
        if (string.IsNullOrWhiteSpace(audioBase64)) throw new InvalidOperationException("The phone sent an empty recording chunk.");
        using var meta = JsonDocument.Parse(metadataText);
        string session = GetString(meta.RootElement, "session");
        int index = (int)GetNumber(meta.RootElement, "index", 1);
        double started = GetNumber(meta.RootElement, "started", DateTimeOffset.Now.ToUnixTimeSeconds());
        double sessionStarted = GetNumber(meta.RootElement, "sessionStarted", started);
        byte[] audio = Convert.FromBase64String(audioBase64);
        var folder = SessionFolder(session, DateTimeOffset.FromUnixTimeMilliseconds((long)(sessionStarted * 1000)).LocalDateTime);
        string audioFolder = Path.Combine(folder, "audio"); Directory.CreateDirectory(audioFolder);
        string audioPath = Path.Combine(audioFolder, $"chunk-{index:000}.wav");
        await File.WriteAllBytesAsync(audioPath, audio);
        JsonDocument transcript;
        try { transcript = await PostTranscription(audioPath, diarized: true); }
        catch { transcript = await PostTranscription(audioPath, diarized: false); }
        using (transcript)
        {
            var segments = new List<object>();
            if (transcript.RootElement.TryGetProperty("segments", out var raw) && raw.ValueKind == JsonValueKind.Array)
            {
                foreach (var segment in raw.EnumerateArray())
                {
                    var text = GetString(segment, "text").Trim(); if (text.Length == 0) continue;
                    segments.Add(new { speaker = GetString(segment, "speaker", "?"), start = GetNumber(segment, "start", 0), end = GetNumber(segment, "end", 0), text });
                }
            }
            if (segments.Count == 0)
            {
                string plain = GetString(transcript.RootElement, "text").Trim();
                if (plain.Length > 0) segments.Add(new { speaker = "?", start = 0.0, end = 0.0, text = plain });
            }
            return JsonSerializer.Serialize(new { segments, notesPath = folder });
        }
    }

    private static async Task<JsonDocument> PostTranscription(string audioPath, bool diarized)
    {
        string? key = CredentialStore.GetApiKey();
        if (string.IsNullOrWhiteSpace(key)) throw new InvalidOperationException("No OpenAI API key is saved on the Windows host.");
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(diarized ? "gpt-4o-transcribe-diarize" : "gpt-4o-transcribe"), "model");
        form.Add(new StringContent(diarized ? "diarized_json" : "json"), "response_format");
        if (diarized) form.Add(new StringContent("auto"), "chunking_strategy");
        var stream = File.OpenRead(audioPath);
        var file = new StreamContent(stream); file.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");
        form.Add(file, "file", Path.GetFileName(audioPath));
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/audio/transcriptions") { Content = form };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        using var response = await Http.SendAsync(request);
        string body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Transcription failed ({(int)response.StatusCode}): {body[..Math.Min(200, body.Length)]}");
        return JsonDocument.Parse(body);
    }

    private string SessionFolder(string id, DateTime started)
    {
        Directory.CreateDirectory(Root);
        // Session IDs come over the paired-device network link; never let arbitrary metadata become a path.
        string safeId = new string(id.Where(char.IsLetterOrDigit).Take(32).ToArray());
        if (safeId.Length == 0) safeId = Guid.NewGuid().ToString("N");
        string tag = (safeId.Length > 8 ? safeId[..8] : safeId).ToLowerInvariant();
        var existing = Directory.EnumerateDirectories(Root).FirstOrDefault(path => Path.GetFileName(path).EndsWith(tag, StringComparison.OrdinalIgnoreCase));
        if (existing != null) return existing;
        var folder = Path.Combine(Root, started.ToString("yyyy-MM-dd HH.mm", CultureInfo.InvariantCulture) + " " + tag);
        Directory.CreateDirectory(Path.Combine(folder, "audio"));
        var readme = Path.Combine(Root, "README.md");
        if (!File.Exists(readme)) File.WriteAllText(readme, "# Bluey Notes\n\nOne folder per listening session. `notes.md` is the readable transcript, `session.json` stores structured entries, and `audio/` holds recording chunks.\n", new UTF8Encoding(false));
        return folder;
    }

    private static string ToMarkdown(JsonElement root, double started)
    {
        var sb = new StringBuilder();
        var start = DateTimeOffset.FromUnixTimeMilliseconds((long)(started * 1000)).LocalDateTime;
        sb.AppendLine("# Bluey session: " + start.ToString("f", CultureInfo.CurrentCulture)).AppendLine().AppendLine("## Transcript").AppendLine();
        if (!root.TryGetProperty("entries", out var entries) || entries.ValueKind != JsonValueKind.Array) return sb.ToString();
        foreach (var entry in entries.EnumerateArray())
        {
            var text = GetString(entry, "text").Trim(); if (text.Length == 0) continue;
            var time = DateTimeOffset.FromUnixTimeMilliseconds((long)(GetNumber(entry, "time", started) * 1000)).LocalDateTime.ToString("h:mm:ss tt", CultureInfo.CurrentCulture);
            var kind = GetString(entry, "kind");
            switch (kind)
            {
                case "transcript": sb.AppendLine($"**[{time}] Speaker {GetString(entry, "speaker", "?")}:** {text}"); break;
                case "heard": sb.AppendLine($"[{time}] (live) {text}"); break;
                case "asked": sb.AppendLine($"> **[{time}] You asked Bluey:** {text}"); break;
                case "reply": sb.AppendLine($"> **Bluey:** {text}"); break;
                case "report": sb.AppendLine("> **Research report:**").AppendLine(string.Join("\n", text.Split('\n').Select(line => "> " + line))); break;
                default: sb.AppendLine($"[{time}] {text}"); break;
            }
            sb.AppendLine();
        }
        return sb.ToString();
    }

    private static string GetString(JsonElement e, string name, string fallback = "") => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? fallback : fallback;
    private static double GetNumber(JsonElement e, string name, double fallback) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.TryGetDouble(out var n) ? n : fallback;
}
