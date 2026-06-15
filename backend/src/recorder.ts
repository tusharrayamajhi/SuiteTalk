import fs from 'fs'
import path from 'path'
import { prisma } from './db.js'

// Where call recordings live on disk. Served back via GET /api/recordings/:id/audio.
export const RECORDINGS_DIR = path.join(process.cwd(), 'recordings')

try { fs.mkdirSync(RECORDINGS_DIR, { recursive: true }) } catch { /* ignore */ }

// Common output rate for stored recordings. Gemini speaks at 24kHz, the guest
// mic arrives at 16kHz (simulator) or 8kHz (real phone) — everything is
// resampled up to this single rate so one WAV plays the whole conversation.
const OUT_RATE = 24000

/** Linear-interpolation resampler for 16-bit mono PCM samples. */
function resampleLinear(input: Int16Array, inRate: number, outRate: number): Int16Array {
  if (inRate === outRate || input.length === 0) return input
  const ratio = outRate / inRate
  const outLen = Math.max(1, Math.floor(input.length * ratio))
  const out = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio
    const i0 = Math.floor(srcPos)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const frac = srcPos - i0
    out[i] = ((input[i0] ?? 0) * (1 - frac) + (input[i1] ?? 0) * frac) | 0
  }
  return out
}

/** Build a canonical 44-byte WAV header for 16-bit mono PCM and prepend it. */
function buildWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44)
  const byteRate = sampleRate * 2 // mono, 16-bit
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)       // PCM chunk size
  header.writeUInt16LE(1, 20)        // PCM format
  header.writeUInt16LE(1, 22)        // channels = mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(2, 32)        // block align
  header.writeUInt16LE(16, 34)       // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/**
 * Accumulates a single call's audio (guest + AI, turn-based) into one timeline
 * and, on finalize, writes a WAV file and records its metadata in call_recordings.
 *
 * It's tolerant by design: if anything fails (no audio, missing table, disk
 * error) it logs and returns null rather than disrupting the live call.
 */
export class CallRecorder {
  private chunks: Int16Array[] = []
  private samples = 0
  public readonly startedAt = new Date()

  constructor(
    public sessionId: number,
    public roomNumber: string,
    public hotelId: number,
  ) {}

  /** Add a chunk of 16-bit LE mono PCM captured at `inRate` Hz. */
  addPcm(buf: Buffer, inRate: number) {
    if (!buf || buf.length < 2) return
    const n = Math.floor(buf.length / 2)
    const src = new Int16Array(n)
    for (let i = 0; i < n; i++) src[i] = buf.readInt16LE(i * 2)
    const resampled = resampleLinear(src, inRate, OUT_RATE)
    this.chunks.push(resampled)
    this.samples += resampled.length
  }

  get hasAudio() { return this.samples > 0 }
  get durationMs() { return Math.round((this.samples / OUT_RATE) * 1000) }

  /** Write the WAV to disk and insert a call_recordings row. Returns the row id. */
  async finalize(): Promise<number | null> {
    if (!this.hasAudio || !this.sessionId) return null
    try {
      const merged = new Int16Array(this.samples)
      let off = 0
      for (const c of this.chunks) { merged.set(c, off); off += c.length }
      const pcm = Buffer.from(merged.buffer, merged.byteOffset, merged.byteLength)
      const wav = buildWav(pcm, OUT_RATE)

      const fileName = `call_${this.sessionId}_${Date.now()}.wav`
      fs.writeFileSync(path.join(RECORDINGS_DIR, fileName), wav)

      const durationMs = this.durationMs
      const startedAt = this.startedAt
      const endedAt = new Date()
      const rows = await prisma.$queryRaw<Array<{ id: number }>>`
        INSERT INTO call_recordings (session_id, room_number, file_name, duration_ms, started_at, ended_at, hotel_id)
        VALUES (${this.sessionId}, ${this.roomNumber}, ${fileName}, ${durationMs}, ${startedAt}, ${endedAt}, ${this.hotelId})
        RETURNING id`
      const id = rows?.[0]?.id ?? null
      console.log(`[Recorder] Saved call recording #${id} (${(durationMs / 1000).toFixed(1)}s) → ${fileName}`)
      return id
    } catch (err: any) {
      console.error('[Recorder] Failed to finalize recording:', err?.message || err)
      return null
    }
  }
}

/** Idempotently create the call_recordings table. Safe to call on every boot. */
export async function ensureRecordingsTable(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS call_recordings (
        id          SERIAL PRIMARY KEY,
        session_id  INTEGER NOT NULL,
        room_number VARCHAR(10) NOT NULL,
        file_name   TEXT NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        started_at  TIMESTAMP NOT NULL DEFAULT now(),
        ended_at    TIMESTAMP,
        hotel_id    INTEGER DEFAULT 1
      )`)
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_call_recordings_session ON call_recordings (session_id)`)
    console.log('[Recorder] call_recordings table ready')
  } catch (err: any) {
    console.error('[Recorder] Failed to ensure table:', err?.message || err)
  }
}
