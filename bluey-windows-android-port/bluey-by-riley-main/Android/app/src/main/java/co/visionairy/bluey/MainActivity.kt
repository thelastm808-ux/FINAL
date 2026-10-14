package co.visionairy.bluey

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import kotlin.math.min

private val Background = Color(0xFF0E0E14)
private val Panel = Color(0xFF181821)
private val Border = Color(0xFF30303C)
private val Ink = Color(0xFFF4F1FA)
private val Soft = Color(0xFF9894A8)
private val Blue = Color(0xFF779BFF)
private val Purple = Color(0xFFC79BFF)

data class FacePacket(val gazeX: Double = 0.0, val gazeY: Double = 0.0, val mood: String = "listening", val talk: Double = 0.0)

class MainActivity : ComponentActivity() {
    private lateinit var link: BlueyLink
    private lateinit var voice: VoiceController
    private var facePacket by mutableStateOf(FacePacket())
    private val requestMic = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) voice.wake() else {
            voice.microphonePermissionDenied()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val runtime = BlueyRuntime.obtain(applicationContext)
        link = runtime.first
        voice = runtime.second
        link.onPacket = { packet ->
            if (packet.has("face")) {
                val f = packet.optJSONObject("face") ?: JSONObject()
                facePacket = FacePacket(f.optDouble("gazeX", 0.0), f.optDouble("gazeY", 0.0), f.optString("mood", "listening"), f.optDouble("talk", 0.0))
            }
            when (packet.optString("command")) {
                "wake" -> requestWake()
                "sleep" -> voice.sleep()
            }
        }
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(
                primary = Blue, background = Background, surface = Panel,
                onBackground = Ink, onSurface = Ink, secondary = Purple
            )) {
                Surface(Modifier.fillMaxSize(), color = Background) {
                    BlueyScreen(link, voice, facePacket, onWake = { requestWake() }, onSleep = { voice.sleep() })
                }
            }
        }
    }

    private fun requestWake() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) voice.wake()
        else requestMic.launch(Manifest.permission.RECORD_AUDIO)
    }

    override fun onDestroy() {
        if (::link.isInitialized) {
            link.onPacket = null
            link.onFoundHost = null
        }
        // BlueyRuntime owns the connection and live session; don't kill it when the UI leaves screen.
        super.onDestroy()
    }
}

@Composable
private fun BlueyScreen(link: BlueyLink, voice: VoiceController, face: FacePacket, onWake: () -> Unit, onSleep: () -> Unit) {
    var ip by remember { mutableStateOf(link.lastKnownIp) }
    var pairingCode by remember { mutableStateOf("") }
    LaunchedEffect(link.lastKnownIp) { if (ip.isBlank()) ip = link.lastKnownIp }
    DisposableEffect(link) {
        link.onFoundHost = { discoveredIp, _ -> ip = discoveredIp }
        onDispose { link.onFoundHost = null }
    }

    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).background(Background).padding(horizontal = 18.dp, vertical = 14.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text("BLUEY", color = Blue, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 3.sp)
                Text("Your blueberry, everywhere", color = Ink, fontSize = 23.sp, fontWeight = FontWeight.SemiBold)
            }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clip(CircleShape).background(Panel).border(1.dp, Border, CircleShape).padding(horizontal = 11.dp, vertical = 8.dp)) {
                Box(Modifier.size(7.dp).clip(CircleShape).background(if (link.connected) Color(0xFF75DDA6) else Color(0xFFF0BC66)))
                Spacer(Modifier.width(7.dp))
                Text(if (link.connected) "PC connected" else "Not connected", color = Soft, fontSize = 11.sp)
            }
        }
        Spacer(Modifier.height(14.dp))
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
            val wide = maxWidth > maxHeight * 1.12f
            if (wide) {
                Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    CharacterPanel(voice, face, Modifier.weight(0.92f).fillMaxHeight(), onWake, onSleep)
                    ConnectionPanel(link, voice, Modifier.weight(1.08f).fillMaxHeight(), ip, pairingCode, { ip = it }, { pairingCode = it }, onWake, onSleep)
                }
            } else {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    CharacterPanel(voice, face, Modifier.fillMaxWidth().height(315.dp), onWake, onSleep)
                    ConnectionPanel(link, voice, Modifier.fillMaxWidth(), ip, pairingCode, { ip = it }, { pairingCode = it }, onWake, onSleep)
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Text("Same Wi-Fi as your Windows 11 PC · The API key stays on your PC", color = Color(0xFF777486), fontSize = 10.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun CharacterPanel(voice: VoiceController, face: FacePacket, modifier: Modifier = Modifier, onWake: () -> Unit, onSleep: () -> Unit) {
    Card(modifier = modifier, shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = Panel), border = androidx.compose.foundation.BorderStroke(1.dp, Border)) {
        BoxWithConstraints(Modifier.fillMaxSize().padding(10.dp), contentAlignment = Alignment.Center) {
            val charSize = min(maxWidth.value, maxHeight.value * 0.64f).coerceAtLeast(150f).coerceAtMost(250f).dp
            val holdModifier = Modifier.size(charSize).pointerInput(voice) {
                detectTapGestures(
                    onDoubleTap = { if (voice.isAwake) onSleep() else onWake() },
                    onPress = {
                        var started = false
                        val holdJob = launch { delay(300); started = true; voice.beginAsk() }
                        val released = tryAwaitRelease()
                        holdJob.cancel()
                        if (started && released) voice.endAsk()
                    }
                )
            }
            val pulse by rememberInfiniteTransition(label = "bluey-breathe").animateFloat(
                initialValue = 0f, targetValue = 1f,
                animationSpec = infiniteRepeatable(tween(1300, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "pulse"
            )
            BlueberryFace(face, Modifier.size(charSize).then(holdModifier), pulse)
            Column(Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(voice.state.uppercase(), color = when {
                    voice.state.contains("think", true) -> Purple
                    voice.state.contains("reply", true) -> Color(0xFFFF9AD0)
                    voice.state.contains("listen", true) -> Blue
                    else -> Soft
                }, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
                Text("Double-tap to wake  ·  Hold to ask", color = Soft, fontSize = 11.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
}

@Composable
private fun BlueberryFace(face: FacePacket, modifier: Modifier = Modifier, pulse: Float = 0f) {
    Canvas(modifier) {
        val unit = min(size.width, size.height)
        val r = unit * (0.36f + pulse * 0.008f)
        val c = Offset(size.width / 2, size.height / 2 - unit * 0.025f)
        drawCircle(Brush.radialGradient(listOf(Color(0xFFB9CBFF), Color(0xFF6D8EFF), Color(0xFF3D5FD1)), center = Offset(c.x - r * 0.35f, c.y - r * 0.58f), radius = r * 2.0f), r, c)
        drawCircle(Color(0x55FFFFFF), r * 0.22f, Offset(c.x - r * 0.46f, c.y - r * 0.54f))
        drawCircle(Color(0x444D75FF), r * 1.12f, c, style = Stroke(width = unit * 0.012f))
        val ex = r * 0.36f; val ey = c.y - r * 0.12f
        val eyeR = r * 0.29f
        val gx = face.gazeX.toFloat().coerceIn(-1f, 1f) * r * 0.13f
        val gy = face.gazeY.toFloat().coerceIn(-1f, 1f) * r * 0.11f
        listOf(-ex, ex).forEachIndexed { i, x ->
            val eyeCenter = Offset(c.x + x, ey + if (i == 1) -r * 0.015f else 0f)
            drawCircle(Color(0xFF17182A), eyeR * 1.09f, eyeCenter)
            drawCircle(Color(0xFFF9FAFF), eyeR, eyeCenter)
            drawCircle(Color(0xFF161727), eyeR * 0.43f, Offset(eyeCenter.x + gx, eyeCenter.y + gy))
            drawCircle(Color.White, eyeR * 0.15f, Offset(eyeCenter.x + gx - eyeR * 0.12f, eyeCenter.y + gy - eyeR * 0.16f))
        }
        drawOval(Color(0xFF39458F), topLeft = Offset(c.x - r * 0.12f, c.y + r * 0.44f), size = Size(r * 0.25f, r * 0.16f))
    }
}

@Composable
private fun ConnectionPanel(link: BlueyLink, voice: VoiceController, modifier: Modifier, ip: String, pairingCode: String,
                           setIp: (String) -> Unit, setPairingCode: (String) -> Unit,
                           onWake: () -> Unit, onSleep: () -> Unit) {
    Card(modifier = modifier, shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = Panel), border = androidx.compose.foundation.BorderStroke(1.dp, Border)) {
        Column(Modifier.fillMaxWidth().padding(17.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Connect to Windows", color = Ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text(link.status, color = Soft, fontSize = 12.sp, lineHeight = 17.sp)
            OutlinedTextField(value = ip, onValueChange = setIp, label = { Text("Windows PC IPv4 address") }, singleLine = true,
                modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
            OutlinedTextField(value = pairingCode, onValueChange = { setPairingCode(it.filter(Char::isDigit).take(6)) },
                label = { Text("Six-digit code from Windows") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { link.discover() }, modifier = Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2A2A39))) { Text("Find PC") }
                Button(onClick = { link.connect(ip, pairingCode) }, modifier = Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = Blue, contentColor = Color(0xFF111421))) { Text("Connect") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onWake, enabled = link.connected && !voice.isAwake, modifier = Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = Blue, contentColor = Color(0xFF111421))) { Text("Wake") }
                OutlinedButton(onClick = onSleep, enabled = voice.isAwake, modifier = Modifier.weight(1f)) { Text("Sleep") }
            }
            Text("LATEST REPLY", color = Blue, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.3.sp)
            Text(voice.caption, color = Ink, fontSize = 13.sp, lineHeight = 18.sp, maxLines = 5)
            if (voice.lastTranscript.isNotBlank()) Text("Heard: ${voice.lastTranscript}", color = Soft, fontSize = 11.sp, maxLines = 2)
        }
    }
}
