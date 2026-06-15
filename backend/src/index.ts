// @ts-ignore
import AMI from 'asterisk-ami'
import { aiClient, hotelTools, liveTools, systemInstruction, buildSystemInstruction, toolHandlers, buildHotelTools, TOOL_METADATA } from './ai.js'
import { prisma, createKnowledgeBase, backfillKbEmbeddings } from './db.js'
import { CallRecorder, ensureRecordingsTable, RECORDINGS_DIR } from './recorder.js'
import fs from 'fs'
import path from 'path'
import { PMSService } from './pms.js'
import { AudioBridge } from './audio.js'
import { emitLive, onLive } from './events.js'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'

dotenv.config()

// This deployment runs a single hotel. Everything is scoped to this id.
const HOTEL_ID = 1
// Asterisk runs in WSL2; the backend reaches it on localhost (WSL port forwarding)
// or, as a fallback, the WSL eth0 IP via ASTERISK_HOST.
const ASTERISK_HOST = process.env.ASTERISK_HOST || '127.0.0.1'

const app = express()
app.use(cors())
app.use(express.json())

const audioBridge = new AudioBridge()

// --- Setup Status Trackers ---
const asteriskStatus = {
  connected: false,
  loggedIn: false,
  error: null as string | null
}
const registeredPeers = new Set<string>()
const mockRegisteredPeers = new Set<string>()

// A room phone is "online" when its SIP peer is registered (real) or mocked.
function isRoomOnline(roomNumber: string): boolean {
  return registeredPeers.has(roomNumber) || mockRegisteredPeers.has(roomNumber)
}

// --- API Endpoints ---

// Authentication
// Self-service signup is disabled: this is a single-hotel deployment. New staff
// are added by the owner from the Staff Directory, not by registering a hotel.
app.post('/api/auth/signup', (_req, res) => {
  res.status(410).json({ error: 'Signup is disabled. This is a single-hotel deployment; ask the owner to create your staff account.' })
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' })
      return
    }

    const staff = await prisma.staff.findUnique({
      where: { email },
      include: { hotel: true }
    })

    if (!staff || staff.password !== password) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    res.json({
      success: true,
      staff: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role
      },
      hotel: staff.hotel
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Login failed' })
  }
})

// SaaS Business Setup & Staff Management
app.get('/api/hotels', async (req, res) => {
  try {
    const hotels = await prisma.hotel.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { rooms: true, requests: true, staff: true }
        }
      }
    })
    res.json(hotels)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch hotels' })
  }
})

app.get('/api/hotels/:id/staff', async (req, res) => {
  try {
    const { id } = req.params
    const staffList = await prisma.staff.findMany({
      where: { hotelId: parseInt(id) },
      orderBy: { createdAt: 'desc' }
    })
    res.json(staffList)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch staff' })
  }
})

app.post('/api/hotels/:id/staff', async (req, res) => {
  try {
    const { id } = req.params
    const { name, email, password, role } = req.body
    if (!name || !email || !password || !role) {
      res.status(400).json({ error: 'Missing staff details' })
      return
    }

    const existing = await prisma.staff.findUnique({ where: { email } })
    if (existing) {
      res.status(400).json({ error: 'Email already exists' })
      return
    }

    const newStaff = await prisma.staff.create({
      data: {
        name,
        email,
        password,
        role,
        hotelId: parseInt(id)
      }
    })
    res.json(newStaff)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create staff' })
  }
})

app.delete('/api/staff/:id', async (req, res) => {
  try {
    const { id } = req.params
    await prisma.staff.delete({
      where: { id: parseInt(id) }
    })
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete staff' })
  }
})

// Requests (Scoped)
app.get('/api/requests', async (req, res) => {
  try {
    const hotelId = req.query.hotelId ? parseInt(req.query.hotelId as string) : 1
    const requests = await prisma.request.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'desc' },
      include: { room: true }
    })
    res.json(requests)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch requests' })
  }
})

app.patch('/api/requests/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    const updated = await prisma.request.update({
      where: { id: parseInt(id) },
      data: { status }
    })
    emitLive({ type: 'request:update', request: updated })
    res.json(updated)
  } catch (error) {
    res.status(500).json({ error: 'Failed to update request' })
  }
})

// Rooms & Sessions (Scoped)
app.get('/api/rooms', async (req, res) => {
  try {
    const hotelId = req.query.hotelId ? parseInt(req.query.hotelId as string) : 1
    const rooms = await prisma.room.findMany({
      where: { hotelId },
      include: { sessions: { where: { status: 'active', hotelId } } }
    })
    // Annotate each room with live phone-registration status for the Rooms page.
    res.json(rooms.map((r: any) => ({ ...r, online: isRoomOnline(r.roomNumber) })))
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rooms' })
  }
})

app.get('/api/sessions', async (req, res) => {
  try {
    const hotelId = req.query.hotelId ? parseInt(req.query.hotelId as string) : 1
    const sessions = await prisma.staySession.findMany({
      where: { status: 'active', hotelId },
      include: { room: true, conversations: { orderBy: { createdAt: 'desc' }, take: 10 } }
    })
    res.json(sessions)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sessions' })
  }
})

// --- Guest History (stays, transcripts & call recordings) ---

// All stays for a hotel (optionally one room), newest first, with message &
// recording counts so the History page can list them without N+1 queries.
app.get('/api/history/sessions', async (req, res) => {
  try {
    const hotelId = req.query.hotelId ? parseInt(req.query.hotelId as string) : 1
    const roomNumber = req.query.roomNumber as string | undefined
    const sessions = await prisma.staySession.findMany({
      where: { hotelId, ...(roomNumber ? { roomNumber } : {}) },
      orderBy: { checkIn: 'desc' },
      include: { room: true, _count: { select: { conversations: true } } }
    })
    // Recording counts come from raw SQL (table is managed outside the Prisma client).
    const recMap: Record<number, number> = {}
    try {
      const rows = await prisma.$queryRaw<Array<{ session_id: number; c: number }>>`
        SELECT session_id, COUNT(*)::int AS c FROM call_recordings WHERE hotel_id = ${hotelId} GROUP BY session_id`
      for (const r of rows) recMap[r.session_id] = Number(r.c)
    } catch { /* table may not exist yet */ }
    res.json(sessions.map((s: any) => ({
      id: s.id,
      roomNumber: s.roomNumber,
      guestName: s.guestName,
      roomType: s.room?.roomType ?? null,
      checkIn: s.checkIn,
      checkOut: s.checkOut,
      status: s.status,
      messageCount: s._count.conversations,
      recordingCount: recMap[s.id] || 0,
    })))
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch history' })
  }
})

// One stay in full: guest, dates, the complete transcript, and its recordings.
app.get('/api/history/sessions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const session = await prisma.staySession.findUnique({
      where: { id },
      include: { room: true, conversations: { orderBy: { createdAt: 'asc' } } }
    })
    if (!session) { res.status(404).json({ error: 'Stay not found' }); return }
    let recordings: any[] = []
    try {
      recordings = await prisma.$queryRaw<Array<any>>`
        SELECT id, duration_ms AS "durationMs", started_at AS "startedAt", ended_at AS "endedAt"
        FROM call_recordings WHERE session_id = ${id} ORDER BY started_at ASC`
    } catch { /* table may not exist yet */ }
    res.json({ ...session, recordings })
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch stay' })
  }
})

// Stream a stored call recording (WAV), with HTTP range support for scrubbing.
app.get('/api/recordings/:id/audio', async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const rows = await prisma.$queryRaw<Array<{ file_name: string }>>`
      SELECT file_name FROM call_recordings WHERE id = ${id} LIMIT 1`
    const fileName = rows?.[0]?.file_name
    if (!fileName) { res.status(404).json({ error: 'Recording not found' }); return }
    const filePath = path.join(RECORDINGS_DIR, path.basename(fileName))
    if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'Recording file missing' }); return }

    const stat = fs.statSync(filePath)
    const range = req.headers.range
    res.setHeader('Content-Type', 'audio/wav')
    res.setHeader('Accept-Ranges', 'bytes')
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range)
      const start = m && m[1] ? parseInt(m[1]) : 0
      const end = m && m[2] ? parseInt(m[2]) : stat.size - 1
      res.status(206)
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
      res.setHeader('Content-Length', end - start + 1)
      fs.createReadStream(filePath, { start, end }).pipe(res)
    } else {
      res.setHeader('Content-Length', stat.size)
      fs.createReadStream(filePath).pipe(res)
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to stream recording' })
  }
})

// Settings (Scoped)
app.get('/api/settings', async (req, res) => {
  try {
    const hotelId = req.query.hotelId ? parseInt(req.query.hotelId as string) : 1
    const settings = await prisma.setting.findMany({
      where: { hotelId }
    })
    const settingsMap = settings.reduce((acc: any, s: any) => ({ ...acc, [s.key]: s.value }), {})
    res.json(settingsMap)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' })
  }
})

app.post('/api/settings', async (req, res) => {
  try {
    const { settings, hotelId: bodyHotelId } = req.body
    const hotelId = bodyHotelId ? parseInt(bodyHotelId) : 1
    for (const [key, value] of Object.entries(settings)) {
      const existingSetting = await prisma.setting.findFirst({
        where: { hotelId, key }
      })
      if (existingSetting) {
        await prisma.setting.update({
          where: { id: existingSetting.id },
          data: { value: value as string }
        })
      } else {
        await prisma.setting.create({
          data: { hotelId, key, value: value as string }
        })
      }
    }
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' })
  }
})

// AI Tools metadata
app.get('/api/tools', async (req, res) => {
  try {
    const hotelId = req.query.hotelId ? parseInt(req.query.hotelId as string) : 1
    const setting = await prisma.setting.findFirst({ where: { hotelId, key: 'enabled_tools' } })
    let enabledNames: string[] | null = null
    if (setting?.value) {
      try { enabledNames = JSON.parse(setting.value) } catch {}
    }
    const tools = Object.entries(TOOL_METADATA).map(([name, meta]) => ({
      name,
      ...meta,
      enabled: enabledNames === null || enabledNames.includes(name)
    }))
    res.json(tools)
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch tools' })
  }
})

// Knowledge Base (Scoped)
app.get('/api/knowledge-base', async (req, res) => {
  try {
    const hotelId = req.query.hotelId ? parseInt(req.query.hotelId as string) : 1
    const kb = await prisma.knowledgeBase.findMany({
      where: { hotelId }
    })
    res.json(kb)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch knowledge base' })
  }
})

app.post('/api/knowledge-base', async (req, res) => {
  try {
    const { content, category, hotelId: bodyHotelId } = req.body
    const hotelId = bodyHotelId ? parseInt(bodyHotelId) : 1
    // Creates the row AND vectorises it so it's immediately semantically searchable.
    const entry = await createKnowledgeBase(content, category, hotelId)
    res.json(entry)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create KB entry' })
  }
})

app.delete('/api/knowledge-base/:id', async (req, res) => {
  try {
    const { id } = req.params
    await prisma.knowledgeBase.delete({
      where: { id: parseInt(id) }
    })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete KB entry' })
  }
})

// Telephony Controls
app.post('/api/calls/:id/takeover', async (req, res) => {
  try {
    const { id } = req.params
    const { staffExtension } = req.body
    await audioBridge.takeoverCall(id, staffExtension)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Takeover failed' })
  }
})

// --- Hotel Management Integration API (PMS) ---
app.post('/api/integration/guest-checkin', async (req, res) => {
  try {
    const { roomNumber, guestName, checkOutDate, hotelId: bodyHotelId } = req.body
    const hotelId = bodyHotelId ? parseInt(bodyHotelId) : 1
    const session = await PMSService.checkInGuest(roomNumber, guestName, checkOutDate, hotelId)
    res.json(session)
  } catch (error) {
    res.status(500).json({ error: 'Integration check-in failed' })
  }
})

app.post('/api/integration/guest-checkout', async (req, res) => {
  try {
    const { roomNumber, hotelId: bodyHotelId } = req.body
    const hotelId = bodyHotelId ? parseInt(bodyHotelId) : 1
    await PMSService.checkOutGuest(roomNumber, hotelId)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Integration check-out failed' })
  }
})

// --- Setup and Hardware Guide API ---
app.get('/api/setup/status', async (req, res) => {
  try {
    const hotelId = req.query.hotelId ? parseInt(req.query.hotelId as string) : 1
    let dbConnected = false
    let roomsCount = 0
    let sessionsCount = 0
    let kbCount = 0
    let dbError = null as string | null

    try {
      roomsCount = await prisma.room.count({ where: { hotelId } })
      sessionsCount = await prisma.staySession.count({ where: { status: 'active', hotelId } })
      kbCount = await prisma.knowledgeBase.count({ where: { hotelId } })
      dbConnected = true
    } catch (err: any) {
      dbError = err.message || "Failed to query database"
    }

    const mergedPeers = Array.from(new Set([...Array.from(registeredPeers), ...Array.from(mockRegisteredPeers)]))

    res.json({
      database: {
        connected: dbConnected,
        roomsCount,
        sessionsCount,
        kbCount,
        error: dbError
      },
      asterisk: {
        connected: asteriskStatus.connected,
        loggedIn: asteriskStatus.loggedIn,
        error: asteriskStatus.error,
        registeredPeers: mergedPeers
      },
      uptime: process.uptime()
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/setup/seed', async (req, res) => {
  try {
    const { hotelId: bodyHotelId } = req.body
    const hotelId = bodyHotelId ? parseInt(bodyHotelId) : 1
    
    const roomsData = [
      { roomNumber: "101", roomType: "Standard", guestName: "Tushar Gupta", status: "occupied" },
      { roomNumber: "102", roomType: "Deluxe", guestName: "Alice Smith", status: "occupied" },
      { roomNumber: "201", roomType: "Suite", guestName: "Bob Jones", status: "occupied" },
      { roomNumber: "301", roomType: "Presidential", guestName: "Charlie Brown", status: "occupied" },
    ]

    for (const r of roomsData) {
      await prisma.room.upsert({
        where: { roomNumber: r.roomNumber },
        update: {
          roomType: r.roomType,
          guestName: r.guestName,
          status: r.status,
          hotelId
        },
        create: {
          roomNumber: r.roomNumber,
          roomType: r.roomType,
          guestName: r.guestName,
          status: r.status,
          hotelId
        },
      })

      const existingSession = await prisma.staySession.findFirst({
        where: { roomNumber: r.roomNumber, status: "active", hotelId },
      })

      if (!existingSession) {
        await prisma.staySession.create({
          data: {
            roomNumber: r.roomNumber,
            guestName: r.guestName,
            status: "active",
            checkIn: new Date(),
            checkOut: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            hotelId
          }
        })
      }
    }

    const kbData = [
      { category: "Wifi", content: "The hotel guest WiFi is 'SuiteTalk-Guest' with password 'hotelwifi123'." },
      { category: "Breakfast", content: "Breakfast is served from 7:00 AM to 10:30 AM in the dining hall on the 1st floor." },
      { category: "Pool", content: "The swimming pool is located on the rooftop (5th floor) and is open from 6:00 AM to 10:00 PM." },
      { category: "Checkout", content: "Standard checkout time is 11:00 AM. Late checkout can be requested via the concierge." },
    ]

    for (const kb of kbData) {
      const existing = await prisma.knowledgeBase.findFirst({
        where: { content: kb.content, hotelId }
      })
      if (!existing) {
        await prisma.knowledgeBase.create({
          data: {
            category: kb.category,
            content: kb.content,
            hotelId
          }
        })
      }
    }

    // Vectorise any freshly seeded knowledge-base rows for semantic search.
    await backfillKbEmbeddings()

    const roomsCount = await prisma.room.count({ where: { hotelId } })
    const kbCount = await prisma.knowledgeBase.count({ where: { hotelId } })

    res.json({
      success: true,
      roomsCount,
      kbCount
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/setup/mock-peer', (req, res) => {
  try {
    const { peer, registered } = req.body
    if (!peer) {
      res.status(400).json({ error: "Missing peer parameter" })
      return
    }

    if (registered) {
      mockRegisteredPeers.add(String(peer))
    } else {
      mockRegisteredPeers.delete(String(peer))
    }
    emitLive({ type: 'room:status', roomNumber: String(peer), online: !!registered })

    res.json({
      success: true,
      registeredPeers: Array.from(new Set([...Array.from(registeredPeers), ...Array.from(mockRegisteredPeers)]))
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// Text-based Simulator
app.post('/api/test-guest-call', async (req, res) => {
  try {
    const { roomNumber, message, hotelId: bodyHotelId } = req.body
    const hotelId = bodyHotelId ? parseInt(bodyHotelId) : 1
    let session = await prisma.staySession.findFirst({ where: { roomNumber, status: 'active', hotelId } })
    if (!session) {
      const room = await prisma.room.findUnique({ where: { roomNumber } })
      session = await prisma.staySession.create({
        data: { roomNumber, guestName: room?.guestName || 'Test Guest', status: 'active', hotelId }
      })
    }
    await prisma.conversation.create({ data: { sessionId: session.id, role: 'guest', content: message } })
    const sysText = await buildSystemInstruction(hotelId)
    const { textTools } = await buildHotelTools(hotelId)
    const chat = aiClient.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: sysText,
        tools: textTools,
      }
    })
    const result = await chat.sendMessage({ message })
    let aiText = result.text
    const calls = result.functionCalls
    const toolLogs: any[] = []
    if (calls) {
      const parts = []
      for (const call of calls) {
        if (call.name) {
          const handler = toolHandlers[call.name]
          if (handler) {
            const toolResult = await handler(call.args as any, hotelId)
            toolLogs.push({ name: call.name, args: call.args, result: toolResult })
            parts.push({ functionResponse: { name: call.name, response: { content: toolResult } } })
          }
        }
      }
      const followUp = await chat.sendMessage({ message: parts })
      aiText = followUp.text
    }
    await prisma.conversation.create({ data: { sessionId: session.id, role: 'ai', content: aiText || '', toolCalls: toolLogs } })
    res.json({ response: aiText, tools: toolLogs })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

import { WebSocketServer, WebSocket as WS } from 'ws'

// --- Single-hotel bootstrap ---
// Ensure the one hotel (id=1) and a default owner account exist, so staff can log
// in on a fresh database with no signup flow. Override via env if desired.
async function ensureSingleHotel() {
  try {
    const hotel = await prisma.hotel.upsert({
      where: { id: HOTEL_ID },
      update: {},
      create: { id: HOTEL_ID, name: process.env.HOTEL_NAME || 'SuiteTalk Hotel', slug: 'main' }
    })
    const ownerEmail = process.env.OWNER_EMAIL || 'owner@suitetalk.local'
    const existingOwner = await prisma.staff.findUnique({ where: { email: ownerEmail } })
    if (!existingOwner) {
      await prisma.staff.create({
        data: {
          name: process.env.OWNER_NAME || 'Hotel Owner',
          email: ownerEmail,
          password: process.env.OWNER_PASSWORD || 'tushar123',
          role: 'OWNER',
          hotelId: hotel.id
        }
      })
      console.log(`[Bootstrap] Created default owner login: ${ownerEmail} / (OWNER_PASSWORD)`)
    }
    console.log(`[Bootstrap] Single hotel ready: "${hotel.name}" (id ${hotel.id})`)
  } catch (err: any) {
    console.error('[Bootstrap] Failed to ensure single hotel:', err.message)
  }
}

const PORT = process.env.PORT || 3001
const server = app.listen(PORT, () => {
  console.log(`SuiteTalk Backend API listening on port ${PORT}`)
  ensureSingleHotel().then(() => backfillKbEmbeddings())
  ensureRecordingsTable()
})

// Two WebSocket endpoints share one HTTP server. They must run in `noServer`
// mode with manual upgrade routing by path — binding multiple path-scoped
// WebSocket servers to the same HTTP server corrupts frames ("RSV1 must be clear").
const eventsWss = new WebSocketServer({ noServer: true })
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  let pathname = ''
  try {
    pathname = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`).pathname
  } catch { /* ignore malformed url */ }

  if (pathname === '/api/events') {
    eventsWss.handleUpgrade(req, socket, head, (ws) => eventsWss.emit('connection', ws, req))
  } else if (pathname === '/api/audio-bridge') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  } else {
    socket.destroy()
  }
})

// Live event stream for the staff dashboard. Every emitLive(...) call from
// anywhere in the backend (new requests, call start/end, room online/offline)
// is broadcast to all connected dashboard clients in real time.
const dashboardClients = new Set<WS>()
eventsWss.on('connection', (ws) => {
  dashboardClients.add(ws)
  console.log(`[Events] Dashboard client connected (${dashboardClients.size} total)`)
  ws.on('close', () => dashboardClients.delete(ws))
  ws.on('error', () => dashboardClients.delete(ws))
})
onLive((event) => {
  const payload = JSON.stringify(event)
  for (const client of dashboardClients) {
    if (client.readyState === WS.OPEN) {
      client.send(payload)
    }
  }
})

wss.on('connection', async (ws, req) => {
  let roomNumber = '101'
  let sessionId: number | null = null
  let accumulatedText = ""
  let currentToolCalls: any[] = []
  let guestName = "Guest"
  let hotelId = 1
  let recorder: CallRecorder | null = null

  try {
    const host = req.headers.host || 'localhost'
    const parsedUrl = new URL(req.url || '', `http://${host}`)
    roomNumber = parsedUrl.searchParams.get('roomNumber') || '101'
    hotelId = parsedUrl.searchParams.get('hotelId') ? parseInt(parsedUrl.searchParams.get('hotelId')!) : 1
    console.log(`[Simulator] WebSocket connected for audio streaming, Room: ${roomNumber}, Hotel: ${hotelId}`)
    
    // Find or create active session
    let session = await prisma.staySession.findFirst({ where: { roomNumber, status: 'active', hotelId } })
    if (!session) {
      const room = await prisma.room.findFirst({ where: { roomNumber, hotelId } })
      session = await prisma.staySession.create({
        data: { roomNumber, guestName: room?.guestName || 'Test Guest', status: 'active', hotelId }
      })
    }
    sessionId = session.id
    guestName = session.guestName
    recorder = new CallRecorder(sessionId, roomNumber, hotelId)
    ws.send(JSON.stringify({ type: "session_established", roomNumber, sessionId }))
    emitLive({ type: 'call:start', roomNumber, guestName, hotelId })
  } catch (err: any) {
    console.error("[Simulator] Session establishment error:", err)
    ws.send(JSON.stringify({ type: "error", message: "Failed to initialize stay session: " + err.message }))
  }
  
  const apiKey = process.env.GEMINI_API_KEY
  const geminiWsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`
  const geminiWs = new WS(geminiWsUrl)

  // Start a timeout timer: if no response (audio/text) is received from AI within 3 seconds, hang up.
  let initialTimeout: NodeJS.Timeout | null = setTimeout(() => {
    console.log("[Simulator] No response from AI within 3 seconds. Disconnecting.")
    ws.send(JSON.stringify({ type: "disconnected", reason: "No response from AI within 3 seconds" }))
    ws.close()
    geminiWs.close()
  }, 3000)

  geminiWs.on('open', async () => {
    console.log("[Gemini] Connected to Multimodal Live API")
    try {
      const sysText = await buildSystemInstruction(hotelId)
      const { voiceTools } = await buildHotelTools(hotelId)
      geminiWs.send(JSON.stringify({
        setup: {
          model: "models/gemini-2.5-flash-native-audio-latest",
          generationConfig: { responseModalities: ["AUDIO"] },
          systemInstruction: {
            parts: [{ text: sysText }]
          },
          tools: voiceTools
        }
      }))
    } catch (err: any) {
      console.error("[Gemini] Failed to send setup:", err)
      ws.send(JSON.stringify({ type: "error", message: "Failed to initialize Gemini: " + err.message }))
    }
  })

  geminiWs.on('message', async (msg: any) => {
    try {
      const response = JSON.parse(msg.toString())
      
      if (response.setupComplete) {
        console.log("[Gemini] Setup Complete Received")
        ws.send(JSON.stringify({ type: "setup_complete" }))

        // Trigger initial greeting by AI
        try {
          console.log(`[Gemini] Sending initial greeting trigger prompt for ${guestName}`)
          geminiWs.send(JSON.stringify({
            clientContent: {
              turns: [
                {
                  role: "user",
                  parts: [
                    {
                      text: `Hello! I just called the front desk. Greet me by name (${guestName}) in a welcoming, warm hotel concierge tone, welcome me to SuiteTalk, and ask how you can help me today.`
                    }
                  ]
                }
              ],
              turnComplete: true
            }
          }))
        } catch (greetErr) {
          console.error("[Gemini] Failed to send initial greeting trigger:", greetErr)
        }
      } else if (response.serverContent) {
        if (initialTimeout) {
          clearTimeout(initialTimeout)
          initialTimeout = null
        }
        if (response.serverContent.modelTurn) {
          const parts = response.serverContent.modelTurn.parts
          console.log(`[Gemini] Received model turn with ${parts.length} parts`)
          for (const part of parts) {
            if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
               console.log(`[Gemini] Received audio chunk (${part.inlineData.data.length} bytes)`)
               const audioData = Buffer.from(part.inlineData.data, 'base64')
               recorder?.addPcm(audioData, 24000) // capture AI voice (24kHz) into the call recording
               ws.send(audioData)
            } else if (part.text) {
               console.log(`[Gemini] Received text: ${part.text}`)
               accumulatedText += part.text
               ws.send(JSON.stringify({ type: "ai_text", text: part.text }))
            }
          }
        }
        
        if (response.serverContent.turnComplete) {
           console.log("[Gemini] Turn Complete")
           ws.send(JSON.stringify({ type: "turn_complete" }))
           
           // Log conversation block to database
           if (sessionId && (accumulatedText.trim() || currentToolCalls.length > 0)) {
             try {
               await prisma.conversation.create({
                 data: {
                   sessionId,
                   role: 'ai',
                   content: accumulatedText.trim() || '(Voice Response)',
                   toolCalls: currentToolCalls.length > 0 ? JSON.parse(JSON.stringify(currentToolCalls)) : undefined
                 }
               })
             } catch (dbErr: any) {
               console.error("[Simulator] Failed to save conversation to DB:", dbErr)
             }
             accumulatedText = ""
             currentToolCalls = []
           }
        }
      } else if (response.toolCall) {
        const functionCalls = response.toolCall.functionCalls || []
        // Run tools in the BACKGROUND so the AI keeps talking; send each result
        // back as it finishes (scheduling WHEN_IDLE) to weave into the conversation.
        for (const call of functionCalls) {
          if (!call.name) continue
          console.log(`[Gemini] Tool call (background): ${call.name}`, call.args)
          ws.send(JSON.stringify({ type: "tool_call", name: call.name, args: call.args }))

          const handler = toolHandlers[call.name]
          void (async () => {
            let toolResult: any
            let status = "success"
            try {
              if (handler) {
                toolResult = await handler(call.args, hotelId)
              } else {
                toolResult = { error: `Tool handler for ${call.name} not found` }
                status = "error"
              }
            } catch (err: any) {
              console.error(`[Gemini] Error executing tool ${call.name}:`, err)
              toolResult = { error: err.message || "Execution failed" }
              status = "error"
            }

            ws.send(JSON.stringify({ type: "tool_result", name: call.name, status, result: toolResult }))
            currentToolCalls.push({ name: call.name, args: call.args, result: toolResult, status })

            if (geminiWs.readyState === WS.OPEN) {
              geminiWs.send(JSON.stringify({
                toolResponse: {
                  functionResponses: [{
                    id: call.id,
                    name: call.name,
                    response: { output: toolResult, scheduling: "WHEN_IDLE" }
                  }]
                }
              }))
            }
          })()
        }
      }
    } catch (err: any) {
      console.error("[Gemini] Error processing message:", err)
      ws.send(JSON.stringify({ type: "error", message: "Failed to process Gemini message: " + err.message }))
    }
  })

  geminiWs.on('error', (err) => {
    console.error("[Gemini] WebSocket Error:", err)
    if (initialTimeout) {
      clearTimeout(initialTimeout)
      initialTimeout = null
    }
    ws.send(JSON.stringify({ type: "error", message: "Gemini server connection failed." }))
    ws.close()
  })

  geminiWs.on('close', (code, reason) => {
    console.log(`[Gemini] Disconnected (Code: ${code}, Reason: ${reason})`)
    if (initialTimeout) {
      clearTimeout(initialTimeout)
      initialTimeout = null
    }
    ws.send(JSON.stringify({ type: "disconnected", reason: reason.toString() || "Gemini disconnected" }))
    ws.close()
  })

  ws.on('message', (data: Buffer) => {
    if (geminiWs.readyState === WS.OPEN) {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as any)
      recorder?.addPcm(buffer, 16000) // capture guest voice (16kHz) into the call recording
      geminiWs.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{
            mimeType: "audio/pcm;rate=16000",
            data: buffer.toString('base64')
          }]
        }
      }))
    }
  })

  ws.on('close', () => {
    console.log("[Simulator] WebSocket disconnected")
    if (initialTimeout) {
      clearTimeout(initialTimeout)
      initialTimeout = null
    }
    emitLive({ type: 'call:end', roomNumber, hotelId })
    if (recorder) {
      const rec = recorder
      const sId = sessionId
      recorder = null
      rec.finalize().then((id) => {
        if (id) emitLive({ type: 'recording:new', roomNumber, recordingId: id, hotelId, ...(sId != null ? { sessionId: sId } : {}) })
      })
    }
    geminiWs.close()
  })
})

// --- Asterisk AMI Connection ---
const ami = new AMI({
  port: 5038,
  host: ASTERISK_HOST,
  username: 'suitetalk',
  password: 'tushar123',
  reconnect: true
})
ami.connect()

ami.on('connect', () => {
  console.log("Connected to Asterisk AMI socket!")
  asteriskStatus.connected = true
  asteriskStatus.error = null
})
ami.on('ami_login', (success: boolean) => {
  if (success) {
    console.log("Logged in to Asterisk AMI successfully!")
    asteriskStatus.loggedIn = true
  } else {
    console.error("Asterisk AMI Login failed!")
    asteriskStatus.loggedIn = false
    asteriskStatus.error = "AMI Login Failed"
  }
})
ami.on('ami_data', (evt: any) => {
  if (evt.event === 'Newchannel' && evt.context === 'from-internal') {
    console.log(`Incoming call: Room ${evt.calleridnum}`)
  }

  // Track PJSIP Peer registration events
  if (evt.event === 'PeerStatus') {
    const peer = evt.peer || ''
    const status = evt.peerstatus || ''
    const cleanPeer = peer.replace(/^PJSIP\//, '')
    if (status.toLowerCase().includes('register') && !status.toLowerCase().includes('unregister')) {
      registeredPeers.add(cleanPeer)
      console.log(`[AMI] Peer Registered: ${cleanPeer}`)
      emitLive({ type: 'room:status', roomNumber: cleanPeer, online: true })
    } else if (
      status.toLowerCase().includes('unregister') ||
      status.toLowerCase().includes('unreachable') ||
      status.toLowerCase().includes('offline')
    ) {
      registeredPeers.delete(cleanPeer)
      console.log(`[AMI] Peer Offline/Unregistered: ${cleanPeer}`)
      emitLive({ type: 'room:status', roomNumber: cleanPeer, online: false })
    }
  }

  // Also track PJSIP contact status updates
  if (evt.event === 'ContactStatus') {
    const contact = evt.contact || ''
    const status = evt.contactstatus || ''
    const peerMatch = contact.match(/(?:PJSIP\/)?(\d+)/)
    if (peerMatch) {
      const cleanPeer = peerMatch[1]
      if (status === 'Reachable' || status === 'Created') {
        registeredPeers.add(cleanPeer)
        console.log(`[AMI] Contact Reachable: ${cleanPeer}`)
        emitLive({ type: 'room:status', roomNumber: cleanPeer, online: true })
      } else if (status === 'Unreachable' || status === 'Removed') {
        registeredPeers.delete(cleanPeer)
        console.log(`[AMI] Contact Unreachable/Removed: ${cleanPeer}`)
        emitLive({ type: 'room:status', roomNumber: cleanPeer, online: false })
      }
    }
  }
})
ami.on('ami_socket_error', (err: any) => {
  console.error("Asterisk AMI socket error:", err)
  asteriskStatus.connected = false
  asteriskStatus.loggedIn = false
  asteriskStatus.error = err.message || "Socket error"
})

process.on('SIGINT', async () => {
  ami.disconnect()
  await prisma.$disconnect()
  process.exit()
})
