using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;

namespace Bluey.Windows;

public partial class MainWindow : Window
{
    private readonly PhoneServer _server = new();
    private readonly BlueyAgent _agent = new();
    private readonly MeetingNotesService _notes = new();
    private readonly BlueyOverlay _overlay;
    private readonly DispatcherTimer _faceTimer;
    private volatile bool _actionsStopped;
    private volatile bool _computerControlEnabled;
    private volatile bool _awake;
    private volatile string? _lastCaption;

    public MainWindow()
    {
        InitializeComponent();
        _overlay = new BlueyOverlay(SetCaptionText);
        _agent.Overlay = _overlay;
        _agent.ComputerControlEnabled = () => _computerControlEnabled;
        _agent.ActionsStopped = () => _actionsStopped;
        _overlay.Show();
        _computerControlEnabled = ComputerControlCheck.IsChecked == true;
        _server.PacketReceived += HandlePacketAsync;
        _server.StatusChanged += status => Dispatcher.InvokeAsync(() => UpdateStatus(status));
        try { _server.Start(); }
        catch (Exception ex) { UpdateStatus("Network listener failed: " + ex.Message); }
        HostAddressText.Text = GetLocalIPv4() + $" : {_server.TcpPort}";
        PairingCodeText.Text = string.Join(" ", _server.PairingCode.ToCharArray());
        ApiKeyStatusText.Text = string.IsNullOrWhiteSpace(CredentialStore.GetApiKey()) ? "No key saved" : "API key saved securely";
        _faceTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(120) };
        _faceTimer.Tick += async (_, _) =>
        {
            try
            {
                var mouse = ComputerControl.MouseLocation;
                var state = new FaceState
                {
                    GazeX = Math.Clamp(mouse.X / ComputerControl.ScreenWidth * 2 - 1, -1, 1),
                    GazeY = Math.Clamp(mouse.Y / ComputerControl.ScreenHeight * 2 - 1, -1, 1),
                    Mood = _awake ? (_lastCaption == null ? "listening" : "talking") : "resting",
                    Talk = _lastCaption == null ? 0 : 0.6
                };
                await _server.BroadcastFaceAsync(state);
            }
            catch { }
        };
        _faceTimer.Start();
        Closed += async (_, _) => { _faceTimer.Stop(); await _server.DisposeAsync(); _overlay.Close(); };
    }

    private async Task HandlePacketAsync(Packet packet, Func<Packet, Task> reply)
    {
        switch (packet.Command)
        {
            case "realtimeToken":
                try
                {
                    var token = await _agent.MintRealtimeTokenAsync();
                    await reply(new Packet { Command = "realtimeToken", CallID = packet.CallID, Text = token });
                }
                catch (Exception ex)
                {
                    await Dispatcher.InvokeAsync(() => SetCaptionText(ex.Message));
                    await reply(new Packet { Command = "realtimeToken", CallID = packet.CallID, Text = "" });
                }
                break;
            case "tool":
                try
                {
                    var result = await _agent.RunToolAsync(packet.Tool ?? "", packet.Text ?? "{}");
                    await reply(new Packet { Command = "toolResult", CallID = packet.CallID, Text = result.Text, Image = result.Image });
                }
                catch (Exception ex) { await reply(new Packet { Command = "toolResult", CallID = packet.CallID, Text = "Tool failed: " + ex.Message }); }
                break;
            case "transcribe":
                try
                {
                    var result = await _notes.TranscribeAsync(packet.Audio ?? "", packet.Text ?? "{}");
                    await reply(new Packet { Command = "transcribed", CallID = packet.CallID, Text = result });
                }
                catch (Exception ex)
                {
                    SetCaptionText("Meeting-notes transcription failed: " + ex.Message);
                    await reply(new Packet { Command = "transcribed", CallID = packet.CallID, Text = "" });
                }
                break;
            case "notes":
                try { var path = _notes.SaveSession(packet.Text ?? "{}"); await reply(new Packet { Command = "notes", CallID = packet.CallID, Text = path }); }
                catch (Exception ex) { await reply(new Packet { Command = "notes", CallID = packet.CallID, Text = "Unable to save notes: " + ex.Message }); }
                break;
            case "caption":
                _lastCaption = packet.Text;
                _overlay.ShowCaption(packet.Text, null);
                break;
            case "captionDone":
                _lastCaption = packet.Text;
                _overlay.ShowCaption(packet.Text, null);
                break;
            case "awake":
                _awake = true;
                await Dispatcher.InvokeAsync(() => { ConnectionStateText.Text = "Phone awake"; StatusDot.Fill = new SolidColorBrush(Color.FromRgb(117, 221, 166)); });
                break;
            case "asleep":
                _awake = false; _lastCaption = null; _overlay.ReturnToFollow();
                break;
            case "testVoice":
                _overlay.ShowCaption("Hello!", null);
                await Task.Delay(700);
                _overlay.ShowCaption(null, null);
                break;
        }
    }

    private void UpdateStatus(string status)
    {
        PhoneStatusText.Text = status;
        if (status.Contains("waiting for pairing code", StringComparison.OrdinalIgnoreCase))
        {
            ConnectionStateText.Text = "Pairing required";
            StatusDot.Fill = new SolidColorBrush(Color.FromRgb(240, 188, 102));
        }
        else if ((status.Contains("connected", StringComparison.OrdinalIgnoreCase) || status.Contains("paired", StringComparison.OrdinalIgnoreCase)) && !status.Contains("disconnected", StringComparison.OrdinalIgnoreCase))
        {
            ConnectionStateText.Text = "Phone connected";
            StatusDot.Fill = new SolidColorBrush(Color.FromRgb(117, 221, 166));
        }
        else if (status.Contains("failed", StringComparison.OrdinalIgnoreCase))
        {
            ConnectionStateText.Text = "Network issue";
            StatusDot.Fill = new SolidColorBrush(Color.FromRgb(239, 129, 129));
        }
        else
        {
            ConnectionStateText.Text = "Host running";
            StatusDot.Fill = new SolidColorBrush(Color.FromRgb(240, 188, 102));
        }
    }
    private void SetCaptionText(string text)
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.InvokeAsync(() => SetCaptionText(text)); return; }
        if (string.IsNullOrWhiteSpace(text)) return;
        CaptionLog.Text = text.Length > 8000 ? text[..8000] + "…" : text;
    }
    private static string GetLocalIPv4()
    {
        try
        {
            return Dns.GetHostEntry(Dns.GetHostName()).AddressList.FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a))?.ToString() ?? "Use manual IP";
        }
        catch { return "Use manual IP"; }
    }
    private async void Wake_Click(object sender, RoutedEventArgs e) => await _server.SendAsync(new Packet { Command = "wake" });
    private async void Sleep_Click(object sender, RoutedEventArgs e) => await _server.SendAsync(new Packet { Command = "sleep" });
    private void SaveKey_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(ApiKeyBox.Password))
            {
                ApiKeyStatusText.Text = string.IsNullOrWhiteSpace(CredentialStore.GetApiKey()) ? "Enter an API key first" : "API key already saved securely";
                return;
            }
            CredentialStore.SaveApiKey(ApiKeyBox.Password);
            ApiKeyBox.Clear();
            ApiKeyStatusText.Text = "API key saved securely";
            SetCaptionText("OpenAI key saved to this Windows user's Credential Manager.");
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Could not save API key", MessageBoxButton.OK, MessageBoxImage.Error); }
    }
    private void ComputerControlCheck_Changed(object sender, RoutedEventArgs e)
    {
        if (ComputerControlCheck == null) return;
        _computerControlEnabled = ComputerControlCheck.IsChecked == true;
        SetCaptionText(_computerControlEnabled ? "Computer control enabled. It still obeys the safety rules." : "Computer control is off. Bluey can still look and point.");
    }
    private void StopActions_Click(object sender, RoutedEventArgs e)
    {
        _actionsStopped = true; StopActionsButton.IsEnabled = false; ResumeActionsButton.IsEnabled = true;
        SetCaptionText("Computer actions stopped. Resume them explicitly to allow more actions.");
    }
    private void ResumeActions_Click(object sender, RoutedEventArgs e)
    {
        _actionsStopped = false; StopActionsButton.IsEnabled = true; ResumeActionsButton.IsEnabled = false;
        SetCaptionText("Computer actions resumed.");
    }
    private void OpenNotes_Click(object sender, RoutedEventArgs e)
    {
        Directory.CreateDirectory(_notes.Root);
        Process.Start(new ProcessStartInfo(_notes.Root) { UseShellExecute = true });
    }
    private void CopyIp_Click(object sender, RoutedEventArgs e)
    {
        try { Clipboard.SetText(HostAddressText.Text.Split(' ')[0]); PhoneStatusText.Text = "IP address copied. Enter it in Bluey on Android."; }
        catch { }
    }
}
