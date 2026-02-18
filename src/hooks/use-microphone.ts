"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseMicrophoneOptions {
    onError?: (message: string) => void;
    onRecordingComplete?: (audioBlob: Blob | null) => void | Promise<void>;
    onRecordingChunk?: (audioChunk: Blob) => void | Promise<void>;
}

interface StartRecordingOptions {
    maxDurationMs?: number;
    minDurationMs?: number;
    endSilenceMs?: number;
    energyThreshold?: number;
    sampleIntervalMs?: number;
    timesliceMs?: number;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof DOMException && error.message) {
        return error.message;
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return "Unable to access your microphone.";
}

export function useMicrophone({
    onError,
    onRecordingComplete,
    onRecordingChunk,
}: UseMicrophoneOptions = {}) {
    const [isRecording, setIsRecording] = useState(false);
    const [supportsRecording, setSupportsRecording] = useState(false);

    const mediaStreamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const monitorTimerRef = useRef<number | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const resolveStopRef = useRef<((blob: Blob | null) => void) | null>(null);
    const onErrorRef = useRef(onError);
    const onRecordingCompleteRef = useRef<
        ((audioBlob: Blob | null) => void | Promise<void>) | undefined
    >(undefined);
    const onRecordingChunkRef = useRef<
        ((audioChunk: Blob) => void | Promise<void>) | undefined
    >(undefined);
    const speechDetectedRef = useRef(false);
    const speechStartedAtRef = useRef(0);
    const recordingStartedAtRef = useRef(0);
    const lastVoiceAtRef = useRef(0);

    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);

    useEffect(() => {
        onRecordingCompleteRef.current = onRecordingComplete;
    }, [onRecordingComplete]);

    useEffect(() => {
        onRecordingChunkRef.current = onRecordingChunk;
    }, [onRecordingChunk]);

    useEffect(() => {
        setSupportsRecording(
            typeof window !== "undefined" &&
            typeof navigator !== "undefined" &&
            !!navigator.mediaDevices?.getUserMedia &&
            typeof MediaRecorder !== "undefined" &&
            typeof AudioContext !== "undefined",
        );
    }, []);

    const clearMonitorTimer = useCallback(() => {
        if (monitorTimerRef.current !== null) {
            window.clearInterval(monitorTimerRef.current);
            monitorTimerRef.current = null;
        }
    }, []);

    const cleanup = useCallback(async () => {
        clearMonitorTimer();

        const stream = mediaStreamRef.current;
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
        }
        mediaStreamRef.current = null;
        recorderRef.current = null;
        analyserRef.current = null;
        chunksRef.current = [];
        speechDetectedRef.current = false;
        speechStartedAtRef.current = 0;
        recordingStartedAtRef.current = 0;
        lastVoiceAtRef.current = 0;

        const audioContext = audioContextRef.current;
        audioContextRef.current = null;
        if (audioContext) {
            try {
                await audioContext.close();
            } catch {
                // no-op
            }
        }
    }, [clearMonitorTimer]);

    const computeRmsLevel = useCallback((): number => {
        const analyser = analyserRef.current;
        if (!analyser) {
            return 0;
        }

        const buffer = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buffer);

        let sum = 0;
        for (let index = 0; index < buffer.length; index += 1) {
            const sample = buffer[index];
            sum += sample * sample;
        }
        return Math.sqrt(sum / buffer.length);
    }, []);

    const startRecording = useCallback(
        async (options?: StartRecordingOptions): Promise<boolean> => {
            if (!supportsRecording) {
                onErrorRef.current?.("Your browser does not support microphone recording.");
                return false;
            }

            const existingRecorder = recorderRef.current;
            if (existingRecorder && existingRecorder.state === "recording") {
                return true;
            }

            const maxDurationMs = Math.max(1000, Math.round(options?.maxDurationMs ?? 12000));
            const minDurationMs = Math.max(0, Math.round(options?.minDurationMs ?? 500));
            const endSilenceMs = Math.max(100, Math.round(options?.endSilenceMs ?? 600));
            const energyThreshold = Math.max(0.0001, options?.energyThreshold ?? 0.015);
            const sampleIntervalMs = Math.max(30, Math.round(options?.sampleIntervalMs ?? 100));
            const timesliceMs = Math.max(120, Math.round(options?.timesliceMs ?? 250));

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                });

                const audioContext = new AudioContext();
                const sourceNode = audioContext.createMediaStreamSource(stream);
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 2048;
                analyser.smoothingTimeConstant = 0.15;
                sourceNode.connect(analyser);

                const recorder = new MediaRecorder(stream);

                mediaStreamRef.current = stream;
                audioContextRef.current = audioContext;
                analyserRef.current = analyser;
                recorderRef.current = recorder;
                chunksRef.current = [];
                speechDetectedRef.current = false;
                speechStartedAtRef.current = 0;
                recordingStartedAtRef.current = performance.now();
                lastVoiceAtRef.current = 0;

                recorder.ondataavailable = (event: BlobEvent) => {
                    if (event.data && event.data.size > 0) {
                        chunksRef.current.push(event.data);

                        if (speechDetectedRef.current) {
                            const snapshot = new Blob(chunksRef.current, {
                                type: recorder.mimeType || "audio/webm",
                            });
                            void onRecordingChunkRef.current?.(snapshot);
                        }
                    }
                };

                recorder.onstop = () => {
                    setIsRecording(false);
                    clearMonitorTimer();

                    const hasSpeech = speechDetectedRef.current;
                    const resolver = resolveStopRef.current;
                    resolveStopRef.current = null;

                    const mimeType = recorder.mimeType || "audio/webm";
                    const audioBlob =
                        hasSpeech && chunksRef.current.length > 0
                            ? new Blob(chunksRef.current, { type: mimeType })
                            : null;

                    void cleanup().finally(() => {
                        resolver?.(audioBlob);
                        void onRecordingCompleteRef.current?.(audioBlob);
                    });
                };

                recorder.start(timesliceMs);
                setIsRecording(true);

                monitorTimerRef.current = window.setInterval(() => {
                    const activeRecorder = recorderRef.current;
                    if (!activeRecorder || activeRecorder.state !== "recording") {
                        return;
                    }

                    const level = computeRmsLevel();
                    const now = performance.now();
                    const recordingDurationMs = now - recordingStartedAtRef.current;

                    if (recordingDurationMs >= maxDurationMs) {
                        activeRecorder.stop();
                        return;
                    }

                    if (!speechDetectedRef.current) {
                        if (level >= energyThreshold) {
                            speechDetectedRef.current = true;
                            speechStartedAtRef.current = now;
                            lastVoiceAtRef.current = now;
                        }
                        return;
                    }

                    if (level >= energyThreshold) {
                        lastVoiceAtRef.current = now;
                    }

                    const speechDurationMs = now - speechStartedAtRef.current;
                    const silenceDurationMs = now - lastVoiceAtRef.current;

                    if (speechDurationMs >= maxDurationMs) {
                        activeRecorder.stop();
                        return;
                    }

                    if (
                        speechDurationMs >= minDurationMs &&
                        silenceDurationMs >= endSilenceMs
                    ) {
                        activeRecorder.stop();
                    }
                }, sampleIntervalMs);

                return true;
            } catch (error) {
                await cleanup();
                setIsRecording(false);
                onErrorRef.current?.(getErrorMessage(error));
                return false;
            }
        },
        [cleanup, clearMonitorTimer, computeRmsLevel, supportsRecording],
    );

    const stopRecording = useCallback((): Promise<Blob | null> => {
        return new Promise((resolve) => {
            const recorder = recorderRef.current;
            if (!recorder || recorder.state !== "recording") {
                void cleanup();
                setIsRecording(false);
                resolve(null);
                return;
            }

            resolveStopRef.current = resolve;
            recorder.stop();
        });
    }, [cleanup]);

    useEffect(() => {
        return () => {
            const recorder = recorderRef.current;
            if (recorder && recorder.state === "recording") {
                recorder.stop();
                return;
            }
            void cleanup();
        };
    }, [cleanup]);

    // When the page becomes visible again (user returns to the tab) or the
    // window regains focus, the browser may have suspended the AudioContext.
    // Resume it so the VAD setInterval regains valid RMS readings immediately.
    useEffect(() => {
        const handleResume = () => {
            const audioContext = audioContextRef.current;
            if (audioContext && audioContext.state === "suspended") {
                void audioContext.resume();
            }
        };

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                handleResume();
            }
        });
        window.addEventListener("focus", handleResume);

        return () => {
            document.removeEventListener("visibilitychange", handleResume);
            window.removeEventListener("focus", handleResume);
        };
    }, []);

    return {
        isRecording,
        supportsRecording,
        startRecording,
        stopRecording,
    };
}
