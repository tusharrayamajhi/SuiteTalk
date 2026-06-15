import { prisma } from './db.js';
async function main() {
    console.log("Fixing database autoincrement sequences...");
    try {
        await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('hotels', 'id'), COALESCE((SELECT MAX(id) FROM hotels), 1))`);
        await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('staff', 'id'), COALESCE((SELECT MAX(id) FROM staff), 1))`);
    }
    catch (seqErr) {
        console.warn("Sequence update warning:", seqErr);
    }
    console.log("Seeding Royal Palms Resort...");
    const hotel = await prisma.hotel.upsert({
        where: { slug: "royal-palms" },
        update: {},
        create: {
            name: "Royal Palms Resort",
            slug: "royal-palms"
        }
    });
    console.log("Seeded hotel:", hotel);
    const staff = await prisma.staff.upsert({
        where: { email: "owner@royalpalms.com" },
        update: {},
        create: {
            name: "Sarah Jenkins",
            email: "owner@royalpalms.com",
            password: "palms123",
            role: "OWNER",
            hotelId: hotel.id
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
//# sourceMappingURL=seed_new_hotel.js.map