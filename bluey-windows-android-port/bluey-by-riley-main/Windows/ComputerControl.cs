using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows;
using System.Windows.Automation;

namespace Bluey.Windows;

/// <summary>Native Windows input helpers. No administrator privileges are requested; integrity-level restrictions still apply.</summary>
public static class ComputerControl
{
    private const uint INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_KEYUP = 0x0002, KEYEVENTF_UNICODE = 0x0004;
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002, MOUSEEVENTF_LEFTUP = 0x0004,
        MOUSEEVENTF_RIGHTDOWN = 0x0008, MOUSEEVENTF_RIGHTUP = 0x0010,
        MOUSEEVENTF_WHEEL = 0x0800, MOUSEEVENTF_HWHEEL = 0x01000;
    private const int WHEEL_DELTA = 120;

    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)] private struct INPUT { public uint type; public INPUTUNION U; }
    [StructLayout(LayoutKind.Explicit)] private struct INPUTUNION
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
    }
    [StructLayout(LayoutKind.Sequential)] private struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] private struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }

    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern int GetSystemMetrics(int nIndex);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindow(string? lpClassName, string? lpWindowName);

    public static int ScreenWidth => Math.Max(1, GetSystemMetrics(0));
    public static int ScreenHeight => Math.Max(1, GetSystemMetrics(1));
    public static Point MouseLocation { get { GetCursorPos(out var p); return new Point(p.X, p.Y); } }
    public static bool IsFocusedPasswordField()
    {
        try { return AutomationElement.FocusedElement?.Current.IsPassword == true; }
        catch { return false; }
    }
    public static void MoveMouse(Point p) => SetCursorPos((int)Math.Clamp(p.X, 0, ScreenWidth - 1), (int)Math.Clamp(p.Y, 0, ScreenHeight - 1));

    public static void Click(Point p, bool right = false, int count = 1)
    {
        MoveMouse(p); Thread.Sleep(35);
        uint down = right ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
        uint up = right ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;
        for (int i = 0; i < Math.Clamp(count, 1, 2); i++)
        {
            SendMouse(down); Thread.Sleep(45); SendMouse(up);
            if (i == 0 && count > 1) Thread.Sleep(80);
        }
    }
    public static void Scroll(Point p, string direction, double amount)
    {
        MoveMouse(p);
        int units = (int)(Math.Clamp(amount, 1, 10) * 2 * WHEEL_DELTA);
        if (direction == "up") units = Math.Abs(units);
        else if (direction == "down") units = -Math.Abs(units);
        else if (direction == "left") units = -Math.Abs(units);
        else units = Math.Abs(units);
        SendMouse(direction is "left" or "right" ? MOUSEEVENTF_HWHEEL : MOUSEEVENTF_WHEEL, unchecked((uint)units));
    }
    public static void Drag(Point from, Point to)
    {
        MoveMouse(from); SendMouse(MOUSEEVENTF_LEFTDOWN);
        int steps = 18;
        for (int i = 1; i <= steps; i++)
        {
            MoveMouse(new Point(from.X + (to.X - from.X) * i / steps, from.Y + (to.Y - from.Y) * i / steps));
            Thread.Sleep(12);
        }
        SendMouse(MOUSEEVENTF_LEFTUP);
    }
    private static void SendMouse(uint flags, uint data = 0)
    {
        var input = new INPUT { type = INPUT_MOUSE, U = new INPUTUNION { mi = new MOUSEINPUT { dwFlags = flags, mouseData = data } } };
        SendInput(1, new[] { input }, Marshal.SizeOf<INPUT>());
    }
    private static void Key(ushort code, bool down, bool unicode = false)
    {
        uint flags = (down ? 0U : KEYEVENTF_KEYUP) | (unicode ? KEYEVENTF_UNICODE : 0U);
        var input = new INPUT { type = INPUT_KEYBOARD, U = new INPUTUNION { ki = new KEYBDINPUT { wVk = unicode ? (ushort)0 : code, wScan = unicode ? code : (ushort)0, dwFlags = flags } } };
        SendInput(1, new[] { input }, Marshal.SizeOf<INPUT>());
    }
    public static void TypeText(string text)
    {
        foreach (char c in text)
        {
            if (c == '\n' || c == '\r') { PressKeys("enter"); continue; }
            if (c == '\t') { PressKeys("tab"); continue; }
            Key(c, true, true); Key(c, false, true);
            if (text.Length <= 160) Thread.Sleep(18);
        }
    }

    private static readonly Dictionary<string, ushort> KeyCodes = MakeKeyMap();
    private static Dictionary<string, ushort> MakeKeyMap()
    {
        var m = new Dictionary<string, ushort>(StringComparer.OrdinalIgnoreCase)
        {
            ["backspace"] = 0x08, ["delete"] = 0x2E, ["del"] = 0x2E, ["tab"] = 0x09, ["enter"] = 0x0D, ["return"] = 0x0D,
            ["escape"] = 0x1B, ["esc"] = 0x1B, ["space"] = 0x20, ["spacebar"] = 0x20, ["up"] = 0x26, ["down"] = 0x28,
            ["left"] = 0x25, ["right"] = 0x27, ["home"] = 0x24, ["end"] = 0x23, ["pageup"] = 0x21, ["pagedown"] = 0x22,
            ["insert"] = 0x2D, ["capslock"] = 0x14, ["printscreen"] = 0x2C, ["minus"] = 0xBD, ["="] = 0xBB,
            ["[" ] = 0xDB, ["]"] = 0xDD, [";"] = 0xBA, ["'"] = 0xDE, [","] = 0xBC, ["."] = 0xBE, ["/"] = 0xBF,
            ["\\"] = 0xDC, ["`"] = 0xC0
        };
        for (char c = 'a'; c <= 'z'; c++) m[c.ToString()] = (ushort)char.ToUpperInvariant(c);
        for (char c = '0'; c <= '9'; c++) m[c.ToString()] = c;
        for (int i = 1; i <= 12; i++) m["f" + i] = (ushort)(0x70 + i - 1);
        return m;
    }
    public static string PressKeys(string combo)
    {
        var parts = combo.ToLowerInvariant().Replace(" ", "").Split('+', StringSplitOptions.RemoveEmptyEntries);
        bool ctrl = false, shift = false, alt = false, win = false;
        string? keyName = null;
        foreach (var p in parts)
        {
            switch (p)
            {
                case "ctrl": case "control": ctrl = true; break;
                case "shift": shift = true; break;
                case "alt": case "option": alt = true; break;
                case "win": case "windows": case "super": case "meta": win = true; break;
                default: keyName = p; break;
            }
        }
        if (keyName == null || !KeyCodes.TryGetValue(keyName, out var vk)) throw new ArgumentException("Unknown key: " + combo);
        // Locking, force-task-manager and window-close shortcuts are intentionally blocked.
        var safetyKey = keyName switch { "del" => "delete", "esc" => "escape", "return" => "enter", _ => keyName };
        if ((win && safetyKey == "l") || (ctrl && alt && safetyKey == "delete") || (ctrl && shift && safetyKey == "escape") || (alt && safetyKey == "f4"))
            throw new InvalidOperationException("That system/force-close shortcut is blocked for safety.");
        var mods = new List<ushort>();
        if (ctrl) mods.Add(0x11); if (shift) mods.Add(0x10); if (alt) mods.Add(0x12); if (win) mods.Add(0x5B);
        foreach (var mod in mods) Key(mod, true);
        Key(vk, true); Key(vk, false);
        for (int i = mods.Count - 1; i >= 0; i--) Key(mods[i], false);
        return combo;
    }
    public static string OpenUrl(string text)
    {
        var address = text.Trim();
        if (!address.Contains("://", StringComparison.Ordinal)) address = "https://" + address;
        if (!Uri.TryCreate(address, UriKind.Absolute, out var uri) || (uri.Scheme != "http" && uri.Scheme != "https")) return "That doesn't look like a web address.";
        Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
        return "Opened " + uri.Host + ".";
    }
    public static string OpenApp(string name)
    {
        var candidate = name.Trim();
        if (candidate.Length == 0) return "Tell me which app to open.";
        try
        {
            string? mapped = candidate.ToLowerInvariant() switch
            {
                "notepad" => "notepad.exe", "calculator" or "calc" => "calc.exe", "paint" => "mspaint.exe",
                "file explorer" or "explorer" => "explorer.exe", "terminal" or "windows terminal" => "wt.exe",
                "task manager" => "taskmgr.exe", "settings" => "ms-settings:", "vscode" or "vs code" => "code",
                _ => candidate
            };
            Process.Start(new ProcessStartInfo(mapped) { UseShellExecute = true });
            return "Opened " + candidate + ".";
        }
        catch (Exception ex) { return $"I couldn't open {candidate}: {ex.Message}"; }
    }
}
