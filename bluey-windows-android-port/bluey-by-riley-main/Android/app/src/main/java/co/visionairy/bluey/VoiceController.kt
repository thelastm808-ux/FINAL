package co.visionairy.bluey

import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Base64
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.math.max

/** Android equivalent of the original iOS LiveVoice: mic PCM -> Realtime WebSocket -> PC tool bridge. */
class VoiceController(context: Context, private val link: BlueyLink) {
    private val appContext = context.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private val client = OkHttpClient.Builder().pingInterval(20, TimeUnit.SECONDS).readTimeout(0, TimeUnit.MILLISECONDS).build()
    private val chunkExecutor = Executors.newSingleThreadExecutor()
    private val randomId = UUID.randomUUID().toString()
    @Volatile private var socket: WebSocket? = null
    @Volatile private var wantAwake = false
    @Volatile private var holding = false
    @Volatile private var awaitingQuestion = false
    @Volatile private var askWhenReady = false
    @Volatile private var recording = false
    @Volatile private var responseActive = false
    @Volatile private var sleepAfterReply = false
    @Volatile private var reconnecting = false
    @Volatile private var toolsRunning = 0
    @Volatile private var transcriptBuffer = StringBuilder()
    @Volatile private var sessionId = ""
    @Volatile private var sessionStartedMs = 0L
    @Volatile private var chunkStartedMs = 0L
    @Volatile private var chunkIndex = 0
    private val pcmChunk = ByteArrayOutputStream()
    private val chunkLock = Any()
    private val askedItems = mutableSetOf<String>()
    private val entries = mutableListOf<JSONObject>()
    private var audioRecord: AudioRecord? = null
    private var micThread: Thread? = null

    var state by mutableStateOf("Asleep"); private set
    var caption by mutableStateOf("Double-tap Bluey to wake him. Press and hold to ask a question."); private set
    var lastTranscript by mutableStateOf(""); private set
    var volume by mutableStateOf(0.7f)
    var isAwake by mutableStateOf(false); private set

    fun toggle() { if (wantAwake) sleep() else wake() }
    fun microphonePermissionDenied() {
        caption = "Microphone permission is needed for live voice. You can still connect to the Windows PC."
        state = "Microphone permission needed"
    }

    fun wake() {
        if (wantAwake) return
        try {
            appContext.startForegroundService(Intent(appContext, BlueyForegroundService::class.java))
        } catch (e: Exception) {
            state = "Open Bluey to wake"
            caption = "Android wouldn't start the microphone service. Reopen Bluey and tap Wake while the app is visible."
            return
        }
        wantAwake = true
        isAwake = true
        state = "Waking up"
        caption = "Connecting to OpenAI…"
        requestTokenAndConnect(0)
    }

    fun sleep() {
        wantAwake = false
        isAwake = false
        holding = false; askWhenReady = false; awaitingQuestion = false
        sleepAfterReply = false
        state = "Asleep"
        caption = "Double-tap Bluey to wake him. Press and hold to ask a question."
        link.send(JSONObject().put("command", "asleep"))
        stopRecording()
        try { appContext.stopService(Intent(appContext, BlueyForegroundService::class.java)) } catch (_: Exception) { }
        val old = socket; socket = null
        try { old?.close(1000, "Bluey sleeping") } catch (_: Exception) { }
        syncNotes(ended = true)
    }

    fun beginAsk() {
        if (!wantAwake) { caption = "Double-tap Bluey first to wake him."; return }
        holding = true
        state = "Listening to your question"
        caption = "I'm all ears — let go when you're done."
        link.send(JSONObject().put("command", "awake"))
    }

    fun endAsk() {
        if (!holding) return
        holding = false
        if (socket == null) { askWhenReady = true; state = "Thinking"; return }
        askNow()
    }

    private fun askNow() {
        askWhenReady = false
        state = "Thinking"
        awaitingQuestion = true
        sendEvent(JSONObject().put("type", "input_audio_buffer.commit"))
        sendEvent(JSONObject().put("type", "response.create"))
    }

    private fun requestTokenAndConnect(attempt: Int) {
        if (!wantAwake || socket != null) return
        link.request(JSONObject().put("command", "realtimeToken"), timeoutSeconds = 25) { packet ->
            if (!wantAwake || socket != null) return@request
            val token = packet?.optString("text", "") ?: ""
            if (token.isBlank()) {
                caption = packet?.optString("text")?.takeIf { it.isNotBlank() } ?: "Can't reach the Windows host. Retrying…"
                state = "Waiting for PC"
                main.postDelayed({ requestTokenAndConnect(attempt + 1) }, minOf(30_000L, 2000L + attempt * 3000L))
            } else connectRealtime(token)
        }
    }

    private fun connectRealtime(token: String) {
        val request = Request.Builder()
            .url("wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1")
            .header("Authorization", "Bearer $token")
            .build()
        state = "Connecting"
        client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                if (!wantAwake) { webSocket.close(1000, "sleeping"); return }
                socket = webSocket
                if (!reconnecting || sessionId.isBlank()) startNewSession()
                reconnecting = false
                try {
                    startRecording()
                    state = if (holding) "Listening to your question" else "Listening"
                    caption = if (holding) "Let go when you're done asking." else "Listening quietly. Press and hold to ask."
                    link.send(JSONObject().put("command", "awake"))
                    if (askWhenReady) askNow()
                    chirp()
                } catch (e: Exception) {
                    caption = "Microphone couldn't start: ${e.message ?: "permission denied"}"
                    state = "Microphone error"
                    sleep()
                }
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                try { handleEvent(JSONObject(text)) } catch (_: Exception) { }
            }
            override fun onMessage(webSocket: WebSocket, bytes: ByteString) { }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(code, reason) }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (socket === webSocket) socket = null
                stopRecording()
                if (wantAwake) {
                    state = "Reconnecting"
                    caption = "Connection dropped. Reconnecting…"
                    reconnecting = true
                    main.postDelayed({ requestTokenAndConnect(0) }, 2500)
                }
            }
        })
    }

    private fun startNewSession() {
        sessionId = UUID.randomUUID().toString()
        sessionStartedMs = System.currentTimeMillis()
        entries.clear(); askedItems.clear()
        chunkIndex = 0
        synchronized(chunkLock) { pcmChunk.reset(); chunkStartedMs = sessionStartedMs }
        syncNotes(ended = false)
    }

    private fun startRecording() {
        if (recording) return
        val sampleRate = 48000
        val minBuffer = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (minBuffer <= 0) throw IllegalStateException("This device doesn't support 48 kHz PCM microphone input.")
        val bufferSize = max(minBuffer * 2, sampleRate / 5 * 2)
        val recorder = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, sampleRate,
            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferSize)
        if (recorder.state != AudioRecord.STATE_INITIALIZED) { recorder.release(); throw IllegalStateException("AudioRecord failed to initialize.") }
        audioRecord = recorder
        recorder.startRecording()
        recording = true
        micThread = Thread({ captureLoop(recorder) }, "Bluey-microphone").apply { isDaemon = true; start() }
    }

    private fun captureLoop(recorder: AudioRecord) {
        val source = ShortArray(4800) // 100 ms of 48 kHz mono PCM16
        try {
            while (recording && wantAwake) {
                val read = recorder.read(source, 0, source.size, AudioRecord.READ_BLOCKING)
                if (read <= 0) continue
                val out = ByteArray((read / 2) * 2)
                var pos = 0
                var i = 0
                while (i + 1 < read) {
                    val sample = source[i]
                    out[pos++] = (sample.toInt() and 0xff).toByte()
                    out[pos++] = ((sample.toInt() shr 8) and 0xff).toByte()
                    i += 2 // 48 kHz -> 24 kHz; simple decimation is adequate for speech input
                }
                val pcm = if (pos == out.size) out else out.copyOf(pos)
                if (pcm.isEmpty()) continue
                val encoded = Base64.getEncoder().encodeToString(pcm)
                sendEvent(JSONObject().put("type", "input_audio_buffer.append").put("audio", encoded))
                synchronized(chunkLock) {
                    pcmChunk.write(pcm)
                    if (System.currentTimeMillis() - chunkStartedMs >= CHUNK_MS) flushChunkLocked()
                }
                main.post { /* Keep Compose callbacks on main thread; state transitions happen in event handlers. */ }
            }
        } catch (_: Exception) { }
        finally {
            synchronized(chunkLock) { if (pcmChunk.size() > 48_000) flushChunkLocked() }
            try { recorder.stop() } catch (_: Exception) { }
            recorder.release()
            if (audioRecord === recorder) audioRecord = null
        }
    }

    private fun stopRecording() {
        recording = false
        val recorder = audioRecord
        try { recorder?.stop() } catch (_: Exception) { }
        micThread?.interrupt(); micThread = null
        // captureLoop's finally flushes remaining audio and releases AudioRecord.
    }

    private fun flushChunkLocked() {
        if (pcmChunk.size() < 48_000 || sessionId.isBlank()) { pcmChunk.reset(); chunkStartedMs = System.currentTimeMillis(); return }
        val pcm = pcmChunk.toByteArray()
        val startMs = chunkStartedMs
        val index = ++chunkIndex
        pcmChunk.reset()
        chunkStartedMs = System.currentTimeMillis()
        val wav = wrapWav(pcm)
        val metadata = JSONObject().put("session", sessionId).put("index", index)
            .put("started", startMs / 1000.0).put("sessionStarted", sessionStartedMs / 1000.0).toString()
        chunkExecutor.execute {
            val packet = JSONObject().put("command", "transcribe").put("audio", Base64.getEncoder().encodeToString(wav)).put("text", metadata)
            link.request(packet, timeoutSeconds = 300) { response ->
                try {
                    val body = JSONObject(response?.optString("text", "") ?: "")
                    val segments = body.optJSONArray("segments") ?: JSONArray()
                    for (i in 0 until segments.length()) {
                        val seg = segments.optJSONObject(i) ?: continue
                        addEntry(JSONObject().put("kind", "transcript").put("speaker", seg.optString("speaker", "?"))
                            .put("text", seg.optString("text", "")).put("time", startMs / 1000.0 + seg.optDouble("start", 0.0)))
                    }
                    val notesPath = body.optString("notesPath", "")
                    if (notesPath.isNotBlank()) caption = "Meeting notes saved on the PC."
                } catch (_: Exception) { }
                syncNotes(ended = !wantAwake)
            }
        }
    }

    private fun wrapWav(pcm: ByteArray): ByteArray {
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray(Charsets.US_ASCII)); header.putInt(pcm.size + 36)
        header.put("WAVE".toByteArray(Charsets.US_ASCII)); header.put("fmt ".toByteArray(Charsets.US_ASCII))
        header.putInt(16); header.putShort(1); header.putShort(1); header.putInt(24000)
        header.putInt(24000 * 2); header.putShort(2); header.putShort(16)
        header.put("data".toByteArray(Charsets.US_ASCII)); header.putInt(pcm.size)
        return header.array() + pcm
    }

    private fun handleEvent(event: JSONObject) {
        when (event.optString("type")) {
            "response.created" -> { responseActive = true; transcriptBuffer = StringBuilder(); chirpedForResponse = false; state = "Thinking" }
            "response.output_text.delta", "response.output_audio_transcript.delta" -> {
                val delta = event.optString("delta", "")
                if (delta.isNotEmpty()) {
                    transcriptBuffer.append(delta)
                    state = "Replying"
                    caption = transcriptBuffer.toString()
                    link.send(JSONObject().put("command", "caption").put("text", caption))
                    chirpOnce()
                }
            }
            "input_audio_buffer.committed" -> {
                val item = event.optString("item_id", "")
                if (item.isNotBlank()) {
                    val asked = holding || awaitingQuestion
                    if (asked) synchronized(askedItems) { askedItems.add(item) }
                    if (awaitingQuestion && !holding) awaitingQuestion = false
                    addEntry(JSONObject().put("kind", if (asked) "asked" else "heard").put("text", "").put("time", System.currentTimeMillis() / 1000.0).put("itemID", item))
                }
            }
            "conversation.item.input_audio_transcription.completed" -> {
                val item = event.optString("item_id", "")
                val text = event.optString("transcript", "").trim()
                if (text.isNotBlank()) {
                    val asked = synchronized(askedItems) { askedItems.contains(item) }
                    lastTranscript = text
                    caption = if (asked) "You asked: $text" else "Heard: $text"
                    addEntry(JSONObject().put("kind", if (asked) "asked" else "heard").put("text", text).put("time", System.currentTimeMillis() / 1000.0))
                    syncNotes(ended = false)
                }
            }
            "response.done" -> {
                responseActive = false
                val response = event.optJSONObject("response")
                val output = response?.optJSONArray("output") ?: JSONArray()
                val calls = ArrayList<JSONObject>()
                for (i in 0 until output.length()) {
                    val item = output.optJSONObject(i) ?: continue
                    if (item.optString("type") == "function_call") calls.add(item)
                }
                val reply = transcriptBuffer.toString().trim()
                if (calls.isNotEmpty()) {
                    if (reply.isNotBlank()) link.send(JSONObject().put("command", "captionDone").put("text", reply))
                    state = "Thinking"
                    runTools(calls)
                } else {
                    if (reply.isNotBlank()) {
                        addEntry(JSONObject().put("kind", "reply").put("text", reply).put("time", System.currentTimeMillis() / 1000.0))
                        link.send(JSONObject().put("command", "captionDone").put("text", reply))
                    }
                    if (sleepAfterReply) {
                        sleepAfterReply = false
                        sleep()
                        return
                    }
                    state = if (holding) "Listening to your question" else "Listening"
                    syncNotes(ended = false)
                }
            }
            "error" -> {
                val message = event.optJSONObject("error")?.optString("message", "Realtime error") ?: "Realtime error"
                caption = message
                if (event.optJSONObject("error")?.optString("code") == "input_audio_buffer_commit_empty") awaitingQuestion = false
            }
        }
    }

    private fun runTools(calls: List<JSONObject>) {
        toolsRunning += calls.size
        val images = ArrayList<String>()
        for (call in calls) {
            val name = call.optString("name", "")
            if (name == "go_to_sleep") sleepAfterReply = true
            val callId = call.optString("call_id", "")
            val arguments = call.optString("arguments", "{}")
            link.request(JSONObject().put("command", "tool").put("tool", name).put("text", arguments), timeoutSeconds = 90) { packet ->
                val output = packet?.optString("text", "The Windows host didn't answer.") ?: "The Windows host didn't answer."
                sendEvent(JSONObject().put("type", "conversation.item.create").put("item", JSONObject()
                    .put("type", "function_call_output").put("call_id", callId).put("output", output)))
                val image = packet?.optString("image", "") ?: ""
                if (image.isNotBlank()) images.add(image)
                toolsRunning = max(0, toolsRunning - 1)
                if (toolsRunning == 0) {
                    for (img in images) {
                        sendEvent(JSONObject().put("type", "conversation.item.create").put("item", JSONObject()
                            .put("type", "message").put("role", "user").put("content", JSONArray().put(JSONObject()
                                .put("type", "input_image").put("image_url", "data:image/jpeg;base64,$img")))))
                    }
                    sendEvent(JSONObject().put("type", "response.create"))
                }
            }
        }
    }

    private fun addEntry(entry: JSONObject) {
        synchronized(entries) { entries.add(entry) }
        syncNotes(ended = !wantAwake)
    }

    private fun syncNotes(ended: Boolean) {
        if (sessionId.isBlank() || !link.connected) return
        val copy = synchronized(entries) { JSONArray(entries.map { JSONObject(it.toString()) }) }
        val notes = JSONObject().put("id", sessionId).put("started", sessionStartedMs / 1000.0)
            .put("transcribing", 0).put("entries", copy)
        if (ended) notes.put("ended", System.currentTimeMillis() / 1000.0)
        link.send(JSONObject().put("command", "notes").put("text", notes.toString()))
    }

    private fun sendEvent(event: JSONObject) { try { socket?.send(event.toString()) } catch (_: Exception) { } }
    private var chirpedForResponse = false
    private fun chirpOnce() { if (!chirpedForResponse) { chirpedForResponse = true; chirp() } }
    private fun chirp() {
        // The original audio output is text-only; Bluey's speaking animation and tiny chirp placeholder are local.
    }

    fun close() { sleep(); chunkExecutor.shutdownNow(); client.dispatcher.executorService.shutdown() }

    companion object { private const val CHUNK_MS = 300_000L }
}
