import { prisma } from './db.js';
async function main() {
    console.log("Seeding default hotel...");
    const hotel = await prisma.hotel.upsert({
        where: { id: 1 },
        update: {},
        create: {
            id: 1,
            name: "The Grand Suite",
            slug: "grand-suite"
        }
    });
    console.log("Seeded hotel:", hotel);
    const staff = await prisma.staff.upsert({
        where: { email: "owner@grandsuite.com" },
        update: {},
        create: {
            name: "Tushar Gupta",
            email: "owner@grandsuite.com",
            password: "admin123",
            role: "OWNER",
            hotelId: 1
        }
    });
    console.log("Seeded staff:", staff);
}
main().catch(err => {
    console.error(err);
    process.exit(1);
}).finally(() => {
    process.exit(0);
});
//# sourceMappingURL=stage_seeding.js.map