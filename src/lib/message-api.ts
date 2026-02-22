/**
 * Low-level fetch helpers for the message-level mutation endpoints.
 *
 * These call the custom backend endpoints added to server.py:
 *   PATCH  /threads/{threadId}/messages/{messageId}
 *   DELETE /threads/{threadId}/messages/{messageId}[?truncate=true]
 */

export async function editMessage(
    apiUrl: string,
    threadId: string,
    messageId: string,
    /** New text content – pass null to keep the existing content. */
    content: string | null,
    /** If true, all messages after the edited one are also removed. */
    deleteSubsequent: boolean,
): Promise<void> {
    const url = `${apiUrl}/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}`;
    const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, delete_subsequent: deleteSubsequent }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`editMessage failed: ${res.status} ${text}`);
    }
}

export async function deleteMessage(
    apiUrl: string,
    threadId: string,
    messageId: string,
    /** If true, truncate everything from this message onwards (inclusive). */
    truncate = false,
): Promise<void> {
    const url = `${apiUrl}/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}?truncate=${truncate}`;
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`deleteMessage failed: ${res.status} ${text}`);
    }
}

/**
 * Send text to the backend TTS/lipsync pipeline.
 * The server mutes the mic for the duration of playback.
 */
export async function sayText(apiUrl: string, text: string): Promise<void> {
    const res = await fetch(`${apiUrl}/speech/say`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`sayText failed: ${res.status} ${body}`);
    }
}
