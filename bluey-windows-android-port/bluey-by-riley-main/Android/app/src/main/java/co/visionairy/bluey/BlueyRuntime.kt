package co.visionairy.bluey

import android.content.Context

/** Keeps the TCP link and active Realtime session alive while the Activity is backgrounded. */
object BlueyRuntime {
    @Volatile private var currentLink: BlueyLink? = null
    @Volatile private var currentVoice: VoiceController? = null

    @Synchronized
    fun obtain(context: Context): Pair<BlueyLink, VoiceController> {
        val existingLink = currentLink
        val existingVoice = currentVoice
        if (existingLink != null && existingVoice != null) {
            return Pair(existingLink, existingVoice)
        }
        val createdLink = BlueyLink(context.applicationContext)
        val createdVoice = VoiceController(context.applicationContext, createdLink)
        currentLink = createdLink
        currentVoice = createdVoice
        return Pair(createdLink, createdVoice)
    }
}
