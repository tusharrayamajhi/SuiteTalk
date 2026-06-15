"use client";

import { useState, useRef, useEffect } from "react";
import { WS_BASE, HOTEL_ID } from "@/lib/config";
import { Phone, X, Check, Alert, Sparkle } from "@/lib/icons";

interface LogEntry {
  time: string;
  type: "info" | "success" | "error" | "tool_call" | "tool_result";
  message: string;
  details?: any;
}

export default function AudioSimulator() {
  const [isCalling, setIsCalling] = useState(false);
  const [roomNumber, setRoomNumber] = useState("101");
  const [status, setStatus] = useState("Ready to dial");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [aiTranscript, setAiTranscript] = useState("");
  const [expandedLogIdx, setExpandedLogIdx] = useState<number | null>(null);

  const audioContext = useRef<AudioContext | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  const addLog = (type: LogEntry["type"], message: string, details?: any) => {
    setLogs((prev) => [{ time: new Date().toLocaleTimeString(), type, message, details }, ...prev]);
  };

  const startCall = async () => {
    setIsCalling(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setAiTranscript("");
    setLogs([]);
    nextPlayTimeRef.current = 0;
    setStatus("Connecting to AI…");
    addLog("info", `Dialing concierge from Room ${roomNumber}…`);

    try {
      audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      addLog("info", "Audio engine initialized");

      ws.current = new WebSocket(`${WS_BASE}/api/audio-bridge?roomNumber=${roomNumber}&hotelId=${HOTEL_ID}`);
      addLog("info", "Opening SuiteTalk audio bridge…");

      ws.current.onopen = async () => {
        setStatus("Connected · requesting mic…");
        addLog("success", "WebSocket connected");
        try {
          mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
          addLog("success", "Microphone access granted");
          setStatus("Live · speak now");
        } catch (micErr: any) {
          setErrorMessage("Microphone access denied. Please allow mic permissions.");
          addLog("error", "Microphone access denied", micErr);
          endCall();
          return;
        }

        const source = audioContext.current!.createMediaStreamSource(mediaStream.current);
        const processor = audioContext.current!.createScriptProcessor(4096, 1, 1);
        const analyser = audioContext.current!.createAnalyser();
        analyser.fftSize = 64;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        source.connect(analyser);
        source.connect(processor);
        processor.connect(audioContext.current!.destination);

        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          const draw = () => {
            if (!canvas || !ctx) return;
            animationFrameId.current = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = "rgba(36,75,54,0.12)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, canvas.height / 2);
            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.stroke();
            const barWidth = (canvas.width / bufferLength) * 1.6;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
              const barHeight = (dataArray[i] / 255.0) * canvas.height * 0.8;
              const grad = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
              grad.addColorStop(0, "#244b36");
              grad.addColorStop(1, "#8a5e29");
              ctx.fillStyle = grad;
              ctx.beginPath();
              ctx.roundRect(x, canvas.height - barHeight, barWidth - 3, barHeight, [3, 3, 0, 0]);
              ctx.fill();
              x += barWidth;
            }
          };
          draw();
        }

        processor.onaudioprocess = (e) => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0);
            const inputSampleRate = audioContext.current!.sampleRate;
            const ratio = inputSampleRate / 16000;
            const newLength = Math.round(inputData.length / ratio);
            const pcm = new Int16Array(newLength);
            let oR = 0, oB = 0;
            while (oR < newLength) {
              const next = Math.round((oR + 1) * ratio);
              let acc = 0, cnt = 0;
              for (let i = oB; i < next && i < inputData.length; i++) { acc += inputData[i]; cnt++; }
              const avg = cnt > 0 ? acc / cnt : 0;
              pcm[oR] = Math.max(-1, Math.min(1, avg)) * 32767;
              oR++; oB = next;
            }
            ws.current.send(new Blob([pcm.buffer]));
          }
        };
      };

      ws.current.onmessage = async (event) => {
        try {
          if (typeof event.data === "string") {
            const p = JSON.parse(event.data);
            if (p.type === "session_established") { addLog("success", `Session for Room ${p.roomNumber}`, p); setSuccessMessage(`Active session #${p.sessionId}`); }
            else if (p.type === "setup_complete") addLog("success", "Gemini live session active");
            else if (p.type === "ai_text") setAiTranscript((prev) => prev + p.text);
            else if (p.type === "tool_call") addLog("tool_call", `Tool: ${p.name}`, p.args);
            else if (p.type === "tool_result") {
              if (p.status === "success") { addLog("success", `Tool done: ${p.name}`, p.result); setSuccessMessage(`${p.name} processed`); }
              else { addLog("error", `Tool failed: ${p.name}`, p.result); setErrorMessage(p.result?.error || "Tool failed"); }
            }
            else if (p.type === "error") { addLog("error", p.message); setErrorMessage(p.message); }
            else if (p.type === "disconnected") addLog("info", `Disconnected: ${p.reason}`);
            return;
          }
          let buf: ArrayBuffer;
          if (event.data instanceof Blob) buf = await event.data.arrayBuffer();
          else if (event.data instanceof ArrayBuffer) buf = event.data;
          else return;
          const i16 = new Int16Array(buf);
          const f32 = new Float32Array(i16.length);
          for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768.0;
          const ab = audioContext.current!.createBuffer(1, f32.length, 24000);
          ab.getChannelData(0).set(f32);
          const src = audioContext.current!.createBufferSource();
          src.buffer = ab;
          src.connect(audioContext.current!.destination);
          const now = audioContext.current!.currentTime;
          if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now;
          src.start(nextPlayTimeRef.current);
          nextPlayTimeRef.current += ab.duration;
        } catch (e: any) {
          addLog("error", "Audio playback error: " + e.message);
        }
      };

      ws.current.onerror = () => { setErrorMessage("Could not connect to the voice server. Is the backend running?"); addLog("error", "WebSocket error"); endCall(); };
      ws.current.onclose = () => { addLog("info", "Connection closed"); endCall(); };
    } catch (e: any) {
      setErrorMessage("Voice init failed: " + e.message);
      endCall();
    }
  };

  const endCall = () => {
    setIsCalling(false);
    setStatus("Call ended");
    nextPlayTimeRef.current = 0;
    if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    mediaStream.current?.getTracks().forEach((t) => t.stop());
    ws.current?.close();
    audioContext.current?.close();
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  };

  useEffect(() => () => { if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current); }, []);

  const logChip = (t: LogEntry["type"]) =>
    t === "success" ? "chip-sage" : t === "error" ? "chip-clay" : t === "tool_call" ? "chip-brass" : t === "tool_result" ? "chip-green" : "chip-neutral";

  const rooms = [["101", "Tushar"], ["102", "Alice"], ["201", "Bob"], ["301", "Charlie"]];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Dialer */}
      <div className="card p-6 flex flex-col justify-between gap-6">
        <div className="text-center space-y-4">
          <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center border ${isCalling ? "bg-[var(--color-primary-soft)] border-[var(--color-primary)] text-[var(--color-primary)] glow-pulse" : "bg-[var(--color-paper-deep)] border-[var(--color-line)] text-[var(--color-muted)]"}`}>
            <Phone size={28} />
          </div>
          <div>
            <p className="display text-lg font-semibold text-[var(--color-ink)]">Voice Concierge</p>
            <p className={`eyebrow text-[10px] mt-1 ${isCalling ? "text-[var(--color-sage)]" : "text-[var(--color-muted)]"}`}>{status}</p>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] h-24 flex items-center justify-center relative overflow-hidden">
          <canvas ref={canvasRef} width={300} height={80} className="w-full h-full object-cover" />
          {!isCalling && <span className="absolute eyebrow text-[10px] text-[var(--color-faint)]">Visualizer idle</span>}
        </div>

        <div className="space-y-3">
          {!isCalling ? (
            <>
              <select className="field" value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)}>
                {rooms.map(([n, g]) => <option key={n} value={n}>Room {n} · {g}</option>)}
              </select>
              <button onClick={startCall} className="btn btn-primary w-full"><Phone size={16} /> Dial concierge</button>
            </>
          ) : (
            <button onClick={endCall} className="btn w-full bg-[var(--color-clay)] text-white hover:opacity-90"><X size={16} /> End call</button>
          )}
          {errorMessage && <div className="chip chip-clay !h-auto !rounded-lg w-full justify-start py-2 px-3"><Alert size={13} /> {errorMessage}</div>}
          {successMessage && <div className="chip chip-sage !h-auto !rounded-lg w-full justify-start py-2 px-3"><Check size={13} /> {successMessage}</div>}
        </div>
      </div>

      {/* Transcript + logs */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        <div className="card p-5 flex flex-col flex-1 min-h-[220px]">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--color-line)]">
            <p className="eyebrow">Live transcript</p>
            {isCalling && <span className="dot bg-[var(--color-sage)] animate-pulse" />}
          </div>
          <div className="flex-1 overflow-y-auto">
            {aiTranscript ? (
              <p className="display italic text-[var(--color-primary-ink)] leading-relaxed text-lg">&ldquo;{aiTranscript}&rdquo;</p>
            ) : (
              <p className="text-sm text-[var(--color-faint)] italic py-8 text-center">{isCalling ? "Listening… the concierge is speaking." : "Start a call to see the transcript."}</p>
            )}
          </div>
        </div>

        <div className="card p-5 flex flex-col h-60">
          <p className="eyebrow pb-3 mb-3 border-b border-[var(--color-line)]">Connection &amp; tool log</p>
          <div className="flex-1 overflow-y-auto space-y-2">
            {logs.map((log, i) => (
              <div key={i} className="border-b border-[var(--color-line)] last:border-0 pb-2">
                <button className="flex items-start justify-between w-full text-left gap-2" onClick={() => setExpandedLogIdx(expandedLogIdx === i ? null : i)}>
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-[var(--color-faint)] tnum shrink-0">{log.time}</span>
                    <span className={`chip ${logChip(log.type)} !h-[18px] !text-[9px]`}>{log.type.replace("_", " ")}</span>
                    <span className="text-sm text-[var(--color-ink)] truncate">{log.message}</span>
                  </span>
                  {log.details ? <Sparkle size={13} className="text-[var(--color-brass)] shrink-0" /> : null}
                </button>
                {log.details && expandedLogIdx === i && (
                  <pre className="mt-2 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-lg p-3 text-[11px] text-[var(--color-muted)] overflow-x-auto font-mono">{JSON.stringify(log.details, null, 2)}</pre>
                )}
              </div>
            ))}
            {logs.length === 0 && <p className="text-sm text-[var(--color-faint)] italic text-center py-6">No session logs yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
