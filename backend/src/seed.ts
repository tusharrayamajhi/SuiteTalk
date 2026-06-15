import { prisma } from "./db.js";

async function main() {
  console.log("Seeding database with rooms and active sessions...");

  const roomsData = [
    { roomNumber: "101", roomType: "Standard", guestName: "Tushar Gupta", status: "occupied" },
    { roomNumber: "102", roomType: "Deluxe", guestName: "Alice Smith", status: "occupied" },
    { roomNumber: "201", roomType: "Suite", guestName: "Bob Jones", status: "occupied" },
    { roomNumber: "301", roomType: "Presidential", guestName: "Charlie Brown", status: "occupied" },
  ];

  for (const r of roomsData) {
    // Upsert Room
    await prisma.room.upsert({
      where: { roomNumber: r.roomNumber },
      update: {
        roomType: r.roomType,
        guestName: r.guestName,
        status: r.status,
      },
      create: {
        roomNumber: r.roomNumber,
        roomType: r.roomType,
        guestName: r.guestName,
        status: r.status,
      },
    });

    // Create active stay session if not already present
    const existingSession = await prisma.staySession.findFirst({
      where: { roomNumber: r.roomNumber, status: "active" },
    });

    if (!existingSession) {
      await prisma.staySession.create({
        data: {
          roomNumber: r.roomNumber,
          guestName: r.guestName,
          status: "active",
          checkIn: new Date(),
          checkOut: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        },
      });
    }
  }

  // Seed some FAQ knowledge base entries
  const kbData = [
    { category: "Wifi", content: "The hotel guest WiFi is 'SuiteTalk-Guest' with password 'hotelwifi123'." },
    { category: "Breakfast", content: "Breakfast is served from 7:00 AM to 10:30 AM in the dining hall on the 1st floor." },
    { category: "Pool", content: "The swimming pool is located on the rooftop (5th floor) and is open from 6:00 AM to 10:00 PM." },
    { category: "Checkout", content: "Standard checkout time is 11:00 AM. Late checkout can be requested via the concierge." },
  ];

  for (const kb of kbData) {
    const existing = await prisma.knowledgeBase.findFirst({
      where: { content: kb.content }
    });
    if (!existing) {
      await prisma.knowledgeBase.create({
        data: {
          category: kb.category,
          content: kb.content,
        }
      });
    }
  }

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
