using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace Bluey.Windows;

/// <summary>Stores secrets in the current Windows user's Credential Manager, not in project/config files.</summary>
public static class CredentialStore
{
    private const uint CRED_TYPE_GENERIC = 1;
    private const uint CRED_PERSIST_LOCAL_MACHINE = 2;
    private const string Target = "Bluey.OpenAI.APIKey";

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL
    {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string? Comment;
        public long LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string? TargetAlias;
        public string? UserName;
    }
    [DllImport("Advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern bool CredWrite(ref CREDENTIAL user, uint flags);
    [DllImport("Advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
    [DllImport("Advapi32.dll")] private static extern void CredFree(IntPtr buffer);
    public static void SaveApiKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key)) return;
        byte[] blob = Encoding.Unicode.GetBytes(key.Trim());
        IntPtr data = Marshal.AllocHGlobal(blob.Length);
        try
        {
            Marshal.Copy(blob, 0, data, blob.Length);
            var cred = new CREDENTIAL { Type = CRED_TYPE_GENERIC, TargetName = Target, CredentialBlobSize = (uint)blob.Length,
                CredentialBlob = data, Persist = CRED_PERSIST_LOCAL_MACHINE, UserName = Environment.UserName };
            if (!CredWrite(ref cred, 0)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not save API key in Windows Credential Manager.");
        }
        finally { try { Marshal.Copy(new byte[blob.Length], 0, data, blob.Length); } catch { } Marshal.FreeHGlobal(data); }
    }
    public static string? GetApiKey()
    {
        if (!CredRead(Target, CRED_TYPE_GENERIC, 0, out var ptr)) return null;
        try
        {
            var cred = Marshal.PtrToStructure<CREDENTIAL>(ptr);
            if (cred.CredentialBlob == IntPtr.Zero || cred.CredentialBlobSize == 0 || cred.CredentialBlobSize > 8192) return null;
            var bytes = new byte[checked((int)cred.CredentialBlobSize)];
            Marshal.Copy(cred.CredentialBlob, bytes, 0, bytes.Length);
            return Encoding.Unicode.GetString(bytes);
        }
        finally { CredFree(ptr); }
    }
    public static void DeleteApiKey()
    {
        if (!CredRead(Target, CRED_TYPE_GENERIC, 0, out var ptr)) return;
        CredFree(ptr);
        CredDelete(Target, CRED_TYPE_GENERIC, 0);
    }
    [DllImport("Advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern bool CredDelete(string target, uint type, uint flags);
}
