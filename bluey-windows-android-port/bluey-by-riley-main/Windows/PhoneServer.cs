using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Security.Cryptography;

namespace Bluey.Windows;

/// <summary>TCP newline-JSON bridge compatible with Shared/GooglyLink.swift. UDP is used for Android discovery.</summary>
public sealed class PhoneServer : IAsyncDisposable
{
    public const int TcpPort = 42424;
    public const int DiscoveryPort = 42425;
    private readonly JsonSerializerOptions _json = new() { PropertyNameCaseInsensitive = true };
    private readonly List<Peer> _peers = new();
    private readonly Queue<DateTimeOffset> _failedPairAttempts = new();
    private readonly object _gate = new();
    private DateTimeOffset _pairingBlockedUntil = DateTimeOffset.MinValue;
    private TcpListener? _tcp;
    private UdpClient? _udp;
    private CancellationTokenSource? _stop;
    private FaceState? _lastFace;
    public event Func<Packet, Func<Packet, Task>, Task>? PacketReceived;
    public event Action<string>? StatusChanged;
    public string DeviceName => Environment.MachineName;
    public string PairingCode { get; } = RandomNumberGenerator.GetInt32(100000, 1_000_000).ToString();
    public int ConnectedPhones { get { lock (_gate) return _peers.Count(p => p.Authorized); } }

    public void Start()
    {
        if (_stop != null) return;
        _stop = new CancellationTokenSource();
        _tcp = new TcpListener(IPAddress.Any, TcpPort);
        _tcp.Start();
        _ = AcceptLoop(_stop.Token);
        _udp = new UdpClient(new IPEndPoint(IPAddress.Any, DiscoveryPort));
        _udp.EnableBroadcast = true;
        _ = DiscoveryLoop(_stop.Token);
        StatusChanged?.Invoke($"Waiting for phone · TCP {TcpPort}");
    }

    public async Task SendAsync(Packet packet)
    {
        Peer[] peers;
        lock (_gate) peers = _peers.Where(p => p.Authorized).ToArray();
        await Task.WhenAll(peers.Select(async p => { try { await p.SendAsync(packet); } catch { } }));
    }

    public async Task BroadcastFaceAsync(FaceState face)
    {
        _lastFace = face;
        await SendAsync(new Packet { Face = face });
    }

    private async Task AcceptLoop(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                var client = await _tcp!.AcceptTcpClientAsync(token);
                client.NoDelay = true;
                var peer = new Peer(client, _json);
                lock (_gate)
                {
                    if (_peers.Count >= 4) { peer.Dispose(); continue; }
                    _peers.Add(peer);
                }
                StatusChanged?.Invoke($"Device connected · waiting for pairing code · {client.Client.RemoteEndPoint}");
                _ = HandlePeer(peer, token);
            }
            catch (OperationCanceledException) { break; }
            catch (ObjectDisposedException) { break; }
            catch (Exception ex) { StatusChanged?.Invoke("Network listener: " + ex.Message); await Task.Delay(800, token).ContinueWith(_ => { }); }
        }
    }

    private async Task HandlePeer(Peer peer, CancellationToken token)
    {
        try
        {
            while (!token.IsCancellationRequested && peer.Client.Connected)
            {
                var line = await peer.Reader.ReadLineAsync(token);
                if (line == null) break;
                if (line.Length > 24_000_000) { StatusChanged?.Invoke("Rejected an oversized packet."); break; }
                Packet? packet;
                try { packet = JsonSerializer.Deserialize<Packet>(line, _json); }
                catch { continue; }
                if (packet == null) continue;
                if (packet.Hello != null) peer.Name = packet.Hello;
                if (!peer.Authorized)
                {
                    if (IsPairingRateLimited())
                    {
                        await peer.SendAsync(new Packet { Command = "pairResult", CallID = packet.CallID, Text = "rate_limited" });
                        StatusChanged?.Invoke("Pairing temporarily locked after repeated failed codes.");
                        break;
                    }
                    if (!string.Equals(packet.Command, "pair", StringComparison.Ordinal))
                    {
                        await peer.SendAsync(new Packet { Command = "pairResult", CallID = packet.CallID, Text = "pairing_required" });
                        break;
                    }
                    var attempted = Encoding.UTF8.GetBytes((packet.Text ?? "").Trim());
                    var expected = Encoding.UTF8.GetBytes(PairingCode);
                    bool matched = attempted.Length == expected.Length && CryptographicOperations.FixedTimeEquals(attempted, expected);
                    if (!matched)
                    {
                        bool locked = RegisterPairFailure();
                        await peer.SendAsync(new Packet { Command = "pairResult", CallID = packet.CallID, Text = locked ? "rate_limited" : "denied" });
                        StatusChanged?.Invoke(locked ? "Pairing temporarily locked after repeated failed codes." : "Pairing refused · check the six-digit code on the Windows window");
                        break;
                    }
                    peer.Authorized = true;
                    await peer.SendAsync(new Packet { Command = "pairResult", CallID = packet.CallID, Text = "ok" });
                    await peer.SendAsync(new Packet { Hello = DeviceName });
                    if (_lastFace != null) await peer.SendAsync(new Packet { Face = _lastFace });
                    StatusChanged?.Invoke($"Phone paired · {peer.Client.Client.RemoteEndPoint}");
                    continue;
                }
                var callback = PacketReceived;
                if (callback != null) await callback.Invoke(packet, async reply => await peer.SendAsync(reply));
            }
        }
        catch (OperationCanceledException) { }
        catch (IOException) { }
        catch (ObjectDisposedException) { }
        catch (Exception ex) { StatusChanged?.Invoke("Phone link: " + ex.Message); }
        finally
        {
            lock (_gate) _peers.Remove(peer);
            peer.Dispose();
            StatusChanged?.Invoke(ConnectedPhones > 0 ? "Phone disconnected · another device remains" : "Phone disconnected · waiting for phone");
        }
    }


    private bool IsPairingRateLimited()
    {
        lock (_gate) return DateTimeOffset.UtcNow < _pairingBlockedUntil;
    }

    private bool RegisterPairFailure()
    {
        lock (_gate)
        {
            var now = DateTimeOffset.UtcNow;
            while (_failedPairAttempts.Count > 0 && _failedPairAttempts.Peek() < now.AddMinutes(-5))
                _failedPairAttempts.Dequeue();
            _failedPairAttempts.Enqueue(now);
            if (_failedPairAttempts.Count < 5) return false;
            _pairingBlockedUntil = now.AddMinutes(2);
            _failedPairAttempts.Clear();
            return true;
        }
    }

    private async Task DiscoveryLoop(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                var received = await _udp!.ReceiveAsync(token);
                var message = Encoding.UTF8.GetString(received.Buffer).Trim();
                if (message.Equals("BLUEY_DISCOVER", StringComparison.OrdinalIgnoreCase) || message.StartsWith("BLUEY_DISCOVER ", StringComparison.OrdinalIgnoreCase))
                {
                    var reply = JsonSerializer.Serialize(new { name = DeviceName, port = TcpPort, service = "bluey-windows" });
                    var bytes = Encoding.UTF8.GetBytes(reply);
                    await _udp.SendAsync(bytes, received.RemoteEndPoint, token);
                }
            }
            catch (OperationCanceledException) { break; }
            catch (ObjectDisposedException) { break; }
            catch (SocketException) { if (!token.IsCancellationRequested) await Task.Delay(300, token).ContinueWith(_ => { }); }
        }
    }

    public async ValueTask DisposeAsync()
    {
        var cts = _stop;
        _stop = null;
        if (cts == null) return;
        cts.Cancel();
        _tcp?.Stop(); _tcp = null;
        _udp?.Dispose(); _udp = null;
        Peer[] peers;
        lock (_gate) { peers = _peers.ToArray(); _peers.Clear(); }
        foreach (var peer in peers) peer.Dispose();
        await Task.CompletedTask;
        cts.Dispose();
    }

    private sealed class Peer : IDisposable
    {
        private readonly SemaphoreSlim _sendGate = new(1, 1);
        private readonly NetworkStream _stream;
        private readonly JsonSerializerOptions _json;
        public TcpClient Client { get; }
        public StreamReader Reader { get; }
        public string? Name { get; set; }
        public volatile bool Authorized;
        public Peer(TcpClient client, JsonSerializerOptions json)
        {
            Client = client; _stream = client.GetStream(); _json = json;
            Reader = new StreamReader(_stream, new UTF8Encoding(false), false, 8192, leaveOpen: true);
        }
        public async Task SendAsync(Packet packet)
        {
            var line = JsonSerializer.Serialize(packet, _json) + "\n";
            var bytes = Encoding.UTF8.GetBytes(line);
            await _sendGate.WaitAsync();
            try { await _stream.WriteAsync(bytes); await _stream.FlushAsync(); }
            finally { _sendGate.Release(); }
        }
        public void Dispose() { try { Client.Close(); } catch { } Reader.Dispose(); _sendGate.Dispose(); }
    }
}
