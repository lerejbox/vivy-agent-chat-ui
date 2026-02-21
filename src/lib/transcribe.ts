interface TranscribeAudioOptions {
    allowEmpty?: boolean;
    mode?: "default" | "speculative";
}

export async function transcribeAudioBlob(
    audioBlob: Blob,
    apiUrl: string,
    options: TranscribeAudioOptions = {},
): Promise<string> {
    const normalizedApiUrl = apiUrl.trim().replace(/\/$/, "");
    const mode = options.mode ?? "default";
    const response = await fetch(`${normalizedApiUrl}/transcribe`, {
        method: "POST",
        headers: {
            "Content-Type": audioBlob.type || "application/octet-stream",
            "X-Vivy-Transcribe-Mode": mode,
        },
        body: audioBlob,
    });

    if (!response.ok) {
        let detail = "Transcription request failed.";
        try {
            const payload = (await response.json()) as { detail?: unknown };
            if (typeof payload.detail === "string" && payload.detail.trim()) {
                detail = payload.detail;
            }
        } catch {
            // no-op
        }
        throw new Error(detail);
    }

    const payload = (await response.json()) as { text?: unknown };
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text && options.allowEmpty) {
        return "";
    }

    if (!text) {
        throw new Error("Speech recognition returned empty text.");
    }

    return text;
}

export interface BackendSpeechConfig {
    stt_provider: string;
    mic_toggle_hotkey?: string;
    faster_whisper?: {
        chunk_sec?: number;
        min_recording_sec?: number;
        max_recording_sec?: number;
        end_silence_sec?: number;
        energy_threshold?: number;
    };
}

export async function fetchSpeechConfig(apiUrl: string): Promise<BackendSpeechConfig> {
    const normalizedApiUrl = apiUrl.trim().replace(/\/$/, "");
    const response = await fetch(`${normalizedApiUrl}/speech/config`, {
        method: "GET",
    });

    if (!response.ok) {
        throw new Error("Failed to load speech config.");
    }

    return (await response.json()) as BackendSpeechConfig;
}
