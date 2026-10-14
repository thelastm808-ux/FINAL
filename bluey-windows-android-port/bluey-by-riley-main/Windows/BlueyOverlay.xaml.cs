using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;

namespace Bluey.Windows;

public partial class BlueyOverlay : Window
{
    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_TRANSPARENT = 0x20, WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x08000000;
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW", SetLastError = true)] private static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongW", SetLastError = true)] private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    private readonly DispatcherTimer _timer;
    private bool _pointing;
    private DateTime _pointUntil;
    private Point _point;
    private double _phase;
    private readonly Action<string>? _captionCallback;

    public BlueyOverlay(Action<string>? captionCallback = null)
    {
        InitializeComponent();
        _captionCallback = captionCallback;
        _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(24) };
        _timer.Tick += (_, _) => Tick();
        Loaded += (_, _) => _timer.Start();
        Closed += (_, _) => _timer.Stop();
    }

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        var hwnd = new WindowInteropHelper(this).Handle;
        SetWindowLong(hwnd, GWL_EXSTYLE, GetWindowLong(hwnd, GWL_EXSTYLE) | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
    }

    public void PointAt(Point point, string? text)
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.Invoke(() => PointAt(point, text)); return; }
        _pointing = true; _point = point; _pointUntil = DateTime.Now.AddSeconds(4);
        if (!string.IsNullOrWhiteSpace(text)) ShowCaption(text, null);
        PositionAt(point.X, point.Y);
    }

    public void ReturnToFollow()
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.Invoke(ReturnToFollow); return; }
        _pointing = false;
    }

    public void ShowCaption(string? text, string? details)
    {
        Dispatcher.Invoke(() =>
        {
            var caption = string.Join("\n", new[] { text, details }.Where(s => !string.IsNullOrWhiteSpace(s)));
            CaptionText.Text = caption.Length > 300 ? caption[..300] + "…" : caption;
            CaptionBubble.Visibility = string.IsNullOrWhiteSpace(caption) ? Visibility.Collapsed : Visibility.Visible;
            _captionCallback?.Invoke(caption);
        });
    }

    private void Tick()
    {
        _phase += 0.08;
        var mouse = ComputerControl.MouseLocation;
        if (_pointing && DateTime.Now >= _pointUntil) _pointing = false;
        var pos = _pointing ? _point : new Point(mouse.X + 22, mouse.Y + 16);
        PositionAt(pos.X, pos.Y);
        double gx = _pointing ? Math.Clamp((mouse.X - pos.X) / 220.0, -1, 1) : 0.08 * Math.Sin(_phase * 0.7);
        double gy = _pointing ? Math.Clamp((mouse.Y - pos.Y) / 180.0, -1, 1) : -0.08;
        Canvas.SetLeft(PupilLeft, 32 + gx * 3.0); Canvas.SetTop(PupilLeft, 35 + gy * 2.3);
        Canvas.SetLeft(PupilRight, 59 + gx * 3.0); Canvas.SetTop(PupilRight, 34 + gy * 2.3);
        double bob = Math.Sin(_phase) * 1.6;
        Canvas.SetTop(Berry, 10 + bob); Canvas.SetTop(EyeLeft, 28 + bob); Canvas.SetTop(EyeRight, 27 + bob);
        Canvas.SetTop(PupilLeft, 35 + gy * 2.3 + bob); Canvas.SetTop(PupilRight, 34 + gy * 2.3 + bob);
        Canvas.SetTop(Shadow, 82 + bob * 0.4);
    }

    private void PositionAt(double x, double y)
    {
        Left = Math.Clamp(x - 10, 0, Math.Max(0, ComputerControl.ScreenWidth - Width));
        Top = Math.Clamp(y - 10, 0, Math.Max(0, ComputerControl.ScreenHeight - Height));
    }
}
