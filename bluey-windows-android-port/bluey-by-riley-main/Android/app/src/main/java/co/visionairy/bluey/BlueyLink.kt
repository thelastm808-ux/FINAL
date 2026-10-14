package co.visionairy.bluey

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.TimeUnit

/** Newline-delimited JSON over TCP, compatible with the original Shared/GooglyLink packet shape. */
class BlueyLink(context: Context) {
    private val prefs = context.getSharedPreferences("bluey", Context.MODE_PRIVATE)
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newCachedThreadPool()
    private val timeouts = Executors.newSingleThreadScheduledExecutor()
    private val waiting = ConcurrentHashMap<String, (JSONObject?) -> Unit>()
    private val sendLock = Any()
    private val generation = AtomicLong(0)
    @Volatile private var socket: Socket? = null
    @Volatile private var writer: OutputStreamWriter? = null
    @Volatile private var reader: BufferedReader? = null

    var connected by mutableStateOf(false); private set
    var pcName by mutableStateOf(""); private set
    var status by mutableStateOf("Enter the Windows host IP or discover it on your Wi-Fi."); private set
    var lastKnownIp by mutableStateOf(prefs.getString("host_ip", "") ?: ""); private set
    var onPacket: ((JSONObject) -> Unit)? = null
    var onFoundHost: ((String, String) -> Unit)? = null

    fun discover() {
        setStatus("Searching this Wi-Fi for Bluey on Windows…")
        io.execute {
            val deadline = System.currentTimeMillis() + 2600
            var foundIp: String? = null
            var foundName = "Windows PC"
            try {
                DatagramSocket().use { udp ->
                    udp.broadcast = true
                    udp.soTimeout = 450
                    val bytes = "BLUEY_DISCOVER".toByteArray(StandardCharsets.UTF_8)
                    val targets = linkedSetOf<InetSocketAddress>()
                    targets.add(InetSocketAddress("255.255.255.255", DISCOVERY_PORT))
                    try {
                        val interfaces = NetworkInterface.getNetworkInterfaces()
                        while (interfaces.hasMoreElements()) {
                            val ni = interfaces.nextElement()
                            if (!ni.isUp || ni.isLoopback) continue
                            val addresses = ni.interfaceAddresses
                            for (address in addresses) {
                                val broadcast = address.broadcast
                                if (broadcast is Inet4Address) targets.add(InetSocketAddress(broadcast, DISCOVERY_PORT))
                            }
                        }
                    } catch (_: Exception) { }
                    for (target in targets) try { udp.send(DatagramPacket(bytes, bytes.size, target)) } catch (_: Exception) { }
                    val buffer = ByteArray(2048)
                    while (System.currentTimeMillis() < deadline) {
                        try {
                            val packet = DatagramPacket(buffer, buffer.size)
                            udp.receive(packet)
                            val json = JSONObject(String(packet.data, packet.offset, packet.length, StandardCharsets.UTF_8))
                            val service = json.optString("service")
                            if (service == "bluey-windows") {
                                foundIp = packet.address.hostAddress
                                foundName = json.optString("name", foundName)
                                break
                            }
                        } catch (_: java.net.SocketTimeoutException) { }
                    }
                }
            } catch (e: Exception) { setStatus("Discovery failed: ${e.message ?: "network error"}") }
            if (foundIp != null) {
                val ip = foundIp!!
                main.post {
                    lastKnownIp = ip
                    pcName = foundName
                    prefs.edit().putString("host_ip", ip).apply()
                    onFoundHost?.invoke(ip, foundName)
                    setStatus("Found $foundName at $ip. Enter the Windows pairing code to connect.")
                }
                setStatus("Found $foundName at $ip. Enter the six-digit code from Windows, then tap Connect.")
            } else setStatus("No Windows host found. Check Wi-Fi/firewall or enter the PC IP manually.")
        }
    }

    fun connect(address: String = lastKnownIp, pairingCode: String = "") {
        val host = address.trim().removePrefix("http://").removePrefix("https://").substringBefore(':')
        if (host.isBlank()) { setStatus("Enter the Windows PC's IPv4 address."); return }
        if (!pairingCode.trim().matches(Regex("\\d{6}"))) { setStatus("Enter the six-digit pairing code shown in the Windows Bluey window."); return }
        val myGeneration = generation.incrementAndGet()
        closeSocket()
        connected = false
        failPending()
        setStatus("Connecting to $host:$TCP_PORT…")
        io.execute {
            var client: Socket? = null
            var paired = false
            try {
                client = Socket()
                client.tcpNoDelay = true
                client.keepAlive = true
                client.connect(InetSocketAddress(host, TCP_PORT), 5000)
                if (myGeneration != generation.get()) { client.close(); return@execute }
                val out = OutputStreamWriter(client.getOutputStream(), StandardCharsets.UTF_8)
                val input = BufferedReader(InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8), 8192)
                val pairId = UUID.randomUUID().toString()
                val pairPacket = JSONObject().put("command", "pair").put("text", pairingCode.trim())
                    .put("callID", pairId).put("hello", android.os.Build.MODEL.ifBlank { "Android phone" })
                synchronized(sendLock) { out.write(pairPacket.toString()); out.write("\n"); out.flush() }
                val pairLine = input.readLine() ?: throw SecurityException("Windows closed the connection before pairing.")
                val pairReply = try { JSONObject(pairLine) } catch (_: Exception) { throw SecurityException("Windows returned an invalid pairing response.") }
                if (pairReply.optString("command") != "pairResult" || pairReply.optString("callID") != pairId || pairReply.optString("text") != "ok")
                    throw SecurityException("Pairing failed. Check the six-digit code in the Windows Bluey window.")
                if (myGeneration != generation.get()) { client.close(); return@execute }
                socket = client; writer = out; reader = input
                paired = true
                lastKnownIp = host
                prefs.edit().putString("host_ip", host).apply()
                connected = true
                setStatus("Paired with $host. Double-tap Bluey to wake him; hold to ask.")
                send(JSONObject().put("hello", android.os.Build.MODEL.ifBlank { "Android phone" }))
                while (!client.isClosed && myGeneration == generation.get()) {
                    val line = input.readLine() ?: break
                    if (line.length > MAX_PACKET_CHARS) { setStatus("The Windows host sent an oversized packet."); break }
                    val packet = try { JSONObject(line) } catch (_: Exception) { continue }
                    if (packet.has("hello")) {
                        pcName = packet.optString("hello", host)
                        setStatus("Connected to ${pcName}.")
                    }
                    main.post { onPacket?.invoke(packet) }
                    val id = packet.optString("callID", "")
                    if (id.isNotBlank()) waiting.remove(id)?.let { callback -> main.post { callback(packet) } }
                }
            } catch (e: Exception) {
                val reason = if (e is SecurityException) e.message ?: "Pairing failed" else "Connection failed: ${e.message ?: "network error"}"
                setStatus(reason)
            }
            finally {
                try { client?.close() } catch (_: Exception) { }
                if (myGeneration == generation.get()) {
                    closeSocket()
                    connected = false
                    failPending()
                    if (paired) setStatus("Disconnected. Check the PC address and Windows firewall.")
                }
            }
        }
    }

    fun send(packet: JSONObject) {
        try {
            val out = writer ?: return
            synchronized(sendLock) { out.write(packet.toString()); out.write("\n"); out.flush() }
        } catch (e: Exception) { setStatus("Send failed: ${e.message ?: "connection lost"}") }
    }

    fun request(packet: JSONObject, timeoutSeconds: Long = 30, callback: (JSONObject?) -> Unit) {
        if (!connected) { main.post { callback(null) }; return }
        val id = UUID.randomUUID().toString()
        packet.put("callID", id)
        waiting[id] = callback
        timeouts.schedule({ waiting.remove(id)?.let { main.post { it(null) } } }, timeoutSeconds, TimeUnit.SECONDS)
        send(packet)
    }

    fun disconnect(updateStatus: Boolean = true) {
        generation.incrementAndGet()
        closeSocket()
        connected = false
        failPending()
        if (updateStatus) setStatus("Disconnected.")
    }

    private fun closeSocket() {
        try { socket?.close() } catch (_: Exception) { }
        socket = null; writer = null; reader = null
    }
    private fun failPending() { val pending = waiting.values.toList(); waiting.clear(); pending.forEach { cb -> main.post { cb(null) } } }
    private fun setStatus(value: String) { main.post { status = value } }

    companion object {
        const val TCP_PORT = 42424
        const val DISCOVERY_PORT = 42425
        const val MAX_PACKET_CHARS = 24_000_000
    }
}
