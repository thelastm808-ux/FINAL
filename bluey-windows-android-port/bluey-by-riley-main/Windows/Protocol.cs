using System.Text.Json.Serialization;

namespace Bluey.Windows;

public sealed class FaceState
{
    [JsonPropertyName("gazeX")] public double GazeX { get; set; }
    [JsonPropertyName("gazeY")] public double GazeY { get; set; }
    [JsonPropertyName("mood")] public string Mood { get; set; } = "listening";
    [JsonPropertyName("talk")] public double Talk { get; set; }
}

public sealed class Packet
{
    [JsonPropertyName("face"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public FaceState? Face { get; set; }
    [JsonPropertyName("hello"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Hello { get; set; }
    [JsonPropertyName("volume"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public double? Volume { get; set; }
    [JsonPropertyName("command"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Command { get; set; }
    [JsonPropertyName("audio"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Audio { get; set; }
    [JsonPropertyName("speech"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public int? Speech { get; set; }
    [JsonPropertyName("callID"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? CallID { get; set; }
    [JsonPropertyName("tool"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Tool { get; set; }
    [JsonPropertyName("text"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Text { get; set; }
    [JsonPropertyName("image"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Image { get; set; }
}

public sealed record ScreenTarget(string Id, string Text, double X, double Y, double Width, double Height, string Kind);
public sealed class ScreenSnapshot
{
    public double Width { get; init; }
    public double Height { get; init; }
    public string JpegBase64 { get; init; } = "";
    public List<ScreenTarget> Targets { get; init; } = new();
    public string Text { get; init; } = "";
    public ScreenTarget? Find(string id) => Targets.FirstOrDefault(t => string.Equals(t.Id, id, StringComparison.OrdinalIgnoreCase));
    public ScreenTarget? Near(double x, double y) => Targets.OrderBy(t => Math.Pow(t.X + t.Width / 2 - x, 2) + Math.Pow(t.Y + t.Height / 2 - y, 2)).FirstOrDefault();
}
