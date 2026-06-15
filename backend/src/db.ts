import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import dotenv from 'dotenv'
import { emitLive } from './events.js'
import { embedText, toVectorLiteral } from './embeddings.js'

dotenv.config()

const connectionString = `${process.env.DATABASE_URL}`
const pool = new pg.Pool({ connectionString })
const adapter = new PrismaPg(pool)
export const prisma = new PrismaClient({ adapter })

export async function getRoomByNumber(roomNumber: string, hotelId: number = 1) {
  return await prisma.room.findFirst({
    where: { roomNumber, hotelId }
  })
}

export async function createServiceRequest(
  roomNumber: string, 
  department: string, 
  type: string, 
  description: string, 
  urgency: string = 'normal',
  hotelId: number = 1
) {
  const requestType = `${department}: ${type}`.substring(0, 50)
  const request = await prisma.request.create({
    data: {
      roomNumber,
      requestType,
      description,
      urgency,
      status: 'pending',
      hotelId
    }
  })
  // Push to the live dashboard so staff see the ticket the instant the AI logs it.
  emitLive({ type: 'request:new', request })
  return request
}

export async function getMenuByCategory(category: string, hotelId: number = 1) {
  return await prisma.menuItem.findMany({
    where: { category, available: true, hotelId }
  })
}

export async function getMenuItems(category?: string, hotelId: number = 1) {
  return await prisma.menuItem.findMany({
    where: { ...(category ? { category } : {}), available: true, hotelId }
  })
}

export async function handleWakeUpCall(roomNumber: string, wakeTime: string, notes?: string, hotelId: number = 1) {
  const desc = `Wake-up call requested for ${wakeTime}${notes ? `. Note: ${notes}` : ''}`
  return await createServiceRequest(roomNumber, 'Front Desk', 'Wake-Up Call', desc, 'normal', hotelId)
}

export async function handleSpaBooking(roomNumber: string, serviceType: string, preferredTime: string, notes?: string, hotelId: number = 1) {
  const desc = `${serviceType} booked for ${preferredTime}${notes ? `. Note: ${notes}` : ''}`
  return await createServiceRequest(roomNumber, 'Spa & Wellness', 'Booking', desc, 'normal', hotelId)
}

export async function handleTransportation(roomNumber: string, transportType: string, pickupTime: string, destination: string, notes?: string, hotelId: number = 1) {
  const type = transportType.replace(/_/g, ' ')
  const desc = `${type} — Pickup: ${pickupTime}, Destination: ${destination}${notes ? `. Note: ${notes}` : ''}`
  return await createServiceRequest(roomNumber, 'Transport', transportType, desc, 'normal', hotelId)
}

export async function handleLostAndFound(roomNumber: string, action: string, itemDescription: string, lastSeenLocation?: string, hotelId: number = 1) {
  const prefix = action === 'report_lost' ? 'Lost item reported' : 'Checking for found item'
  const desc = `${prefix}: ${itemDescription}${lastSeenLocation ? `. Last seen: ${lastSeenLocation}` : ''}`
  return await createServiceRequest(roomNumber, 'Front Desk', 'Lost & Found', desc, 'normal', hotelId)
}

export async function getActiveSession(roomNumber: string, hotelId?: number) {
  return await prisma.staySession.findFirst({
    where: { 
      roomNumber, 
      status: 'active',
      ...(hotelId !== undefined ? { hotelId } : {})
    },
    orderBy: { checkIn: 'desc' }
  })
}

export async function logInteraction(sessionId: number, role: 'guest' | 'ai', content: string, toolCalls?: any) {
  return await prisma.conversation.create({
    data: {
      sessionId,
      role,
      content,
      toolCalls: toolCalls ? JSON.parse(JSON.stringify(toolCalls)) : undefined
    }
  })
}

export async function extendStay(roomNumber: string, newCheckOutDate: string, hotelId: number = 1) {
  const session = await getActiveSession(roomNumber, hotelId)
  if (!session) return null
  return await prisma.staySession.update({
    where: { id: session.id },
    data: { checkOut: new Date(newCheckOutDate) }
  })
}

export async function handleVisitor(roomNumber: string, visitorName: string, action: 'allow' | 'deny', hotelId: number = 1) {
  return await createServiceRequest(
    roomNumber, 
    'Front Desk', 
    'Visitor Access', 
    `${action.toUpperCase()} entry for visitor: ${visitorName}`,
    'normal',
    hotelId
  )
}

export async function handleDining(roomNumber: string, meal: string, location: 'room' | 'dining_hall', action: 'order' | 'cancel', hotelId: number = 1) {
  return await createServiceRequest(
    roomNumber,
    'Kitchen',
    `Dining: ${meal}`,
    `${action.toUpperCase()} ${meal} for ${location === 'room' ? 'Room Service' : 'Dining Hall'}`,
    'normal',
    hotelId
  )
}

// Create a KB entry AND store its embedding so it's immediately searchable by meaning.
export async function createKnowledgeBase(content: string, category: string | undefined, hotelId: number = 1) {
  const entry = await prisma.knowledgeBase.create({
    data: { content, category: category ?? null, hotelId }
  })
  const vec = await embedText(content)
  if (vec) {
    try {
      await prisma.$executeRaw`UPDATE knowledge_base SET embedding = ${toVectorLiteral(vec)}::vector WHERE id = ${entry.id}`
    } catch (err: any) {
      console.error('[KB] Failed to store embedding:', err?.message || err)
    }
  }
  return entry
}

// Embed any KB rows that don't yet have a vector (existing rows, seeded rows).
export async function backfillKbEmbeddings(): Promise<number> {
  let count = 0
  try {
    const missing = await prisma.$queryRaw<Array<{ id: number; content: string }>>`
      SELECT id, content FROM knowledge_base WHERE embedding IS NULL`
    for (const row of missing) {
      const vec = await embedText(row.content)
      if (vec) {
        await prisma.$executeRaw`UPDATE knowledge_base SET embedding = ${toVectorLiteral(vec)}::vector WHERE id = ${row.id}`
        count++
      }
    }
    if (count) console.log(`[KB] Backfilled embeddings for ${count} entr${count === 1 ? 'y' : 'ies'}`)
  } catch (err: any) {
    console.error('[KB] Backfill failed:', err?.message || err)
  }
  return count
}

// Semantic search: embed the guest's question and return the closest KB entries by
// cosine similarity. Falls back to keyword matching if embeddings are unavailable.
export async function getKnowledgeBase(query: string, hotelId: number = 1) {
  const qvec = await embedText(query)
  if (qvec) {
    try {
      const lit = toVectorLiteral(qvec)
      const rows = await prisma.$queryRaw<Array<{ id: number; content: string; category: string | null; similarity: number }>>`
        SELECT id, content, category, 1 - (embedding <=> ${lit}::vector) AS similarity
        FROM knowledge_base
        WHERE hotel_id = ${hotelId} AND embedding IS NOT NULL
        ORDER BY embedding <=> ${lit}::vector
        LIMIT 5`
      // Keep only reasonably relevant matches so the AI isn't fed noise.
      const relevant = rows.filter((r) => Number(r.similarity) >= 0.45)
      if (relevant.length) return relevant
      if (rows.length) return rows.slice(0, 3)
    } catch (err: any) {
      console.error('[KB] Vector search failed, falling back to keyword:', err?.message || err)
    }
  }
  // Fallback: case-insensitive substring match
  return await prisma.knowledgeBase.findMany({
    where: { content: { contains: query, mode: 'insensitive' }, hotelId }
  })
}
