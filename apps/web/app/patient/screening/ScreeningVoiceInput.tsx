"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, LoaderCircle } from "lucide-react";
import { api } from "../../../lib/api";

interface Props {
  appointmentId: string;
  language?: string;
  onTranscript: (text: string) => void;
}

export default function ScreeningVoiceInput({ appointmentId, language = "en-IN", onTranscript }: Props) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const startRecording = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        setRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        setTranscribing(true);
        try {
          const res = await api.transcribeAppointmentScreeningAudio(appointmentId, blob, language);
          const transcript = (res.transcript || "").trim();
          if (transcript) onTranscript(transcript);
          else setError("Could not hear anything. Please try again or type your answer.");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Voice transcription failed.");
        } finally {
          setTranscribing(false);
          setElapsed(0);
        }
      };
      recorder.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((value) => value + 1), 1000);
    } catch {
      setError("Microphone access is blocked. Enable it in your browser, or type your answer instead.");
    }
  };

  const format = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  if (recording) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={stopRecording}
          className="flex h-11 items-center gap-2 rounded-xl bg-[#17221f] px-4 text-xs font-medium text-white"
        >
          <Square size={13} className="text-red-300" />
          Stop recording
        </button>
        <span className="flex items-center gap-2 font-mono text-xs text-red-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          {format(elapsed)}
        </span>
      </div>
    );
  }

  if (transcribing) {
    return (
      <div className="flex h-11 items-center gap-2 rounded-xl border border-[#dfe5e2] bg-[#f9faf9] px-4 text-xs text-[#71807a]">
        <LoaderCircle size={14} className="animate-spin" />
        Transcribing your voice...
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={startRecording}
        className="flex h-11 items-center gap-2 rounded-xl border border-[#dfe5e2] bg-white px-4 text-xs font-medium text-[#35403c] transition hover:border-[#8aaba0]"
      >
        <Mic size={14} />
        Record voice answer
      </button>
      {error && <span className="text-[10px] text-rose-600">{error}</span>}
    </div>
  );
}