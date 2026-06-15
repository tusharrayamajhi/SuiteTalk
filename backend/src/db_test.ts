import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const connectionString = `${process.env.DATABASE_URL}`

const pool = new pg.Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("Connecting to database...")
  try {
    const rooms = await prisma.room.findMany()
    console.log("Success! Found rooms:", rooms)
  } catch (error) {
    console.error("Database connection failed:", error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
