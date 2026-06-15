import { prisma } from "./db.js";
/**
 * PMS Service (Property Management System)
 * Handles guest data synchronization.
 */
export const PMSService = {
    /**
     * Synchronize guest check-in from PMS
     */
    async checkInGuest(roomNumber, guestName, checkOutDate, hotelId = 1) {
        const dbRoomNumber = roomNumber.includes('_') ? roomNumber : `${hotelId}_${roomNumber}`;
        console.log(`[PMS] Processing Check-in: Room ${dbRoomNumber}, Guest: ${guestName}, Hotel: ${hotelId}`);
        // 1. Update Room Status
        await prisma.room.upsert({
            where: { roomNumber: dbRoomNumber },
            update: { guestName, status: 'occupied', hotelId },
            create: { roomNumber: dbRoomNumber, guestName, status: 'occupied', roomType: 'Standard', hotelId }
        });
        // 2. Create Stay Session
        return await prisma.staySession.create({
            data: {
                roomNumber: dbRoomNumber,
                guestName,
                checkIn: new Date(),
                checkOut: new Date(checkOutDate),
                status: 'active',
                hotelId
            }
        });
    },
    /**
     * Synchronize guest check-out from PMS
     */
    async checkOutGuest(roomNumber, hotelId = 1) {
        const dbRoomNumber = roomNumber.includes('_') ? roomNumber : `${hotelId}_${roomNumber}`;
        console.log(`[PMS] Processing Check-out: Room ${dbRoomNumber}, Hotel: ${hotelId}`);
        // 1. Mark Session as Completed
        await prisma.staySession.updateMany({
            where: { roomNumber: dbRoomNumber, status: 'active', hotelId },
            data: { status: 'completed', checkOut: new Date() }
        });
        // 2. Clear Room Info
        return await prisma.room.update({
            where: { roomNumber: dbRoomNumber },
            data: { guestName: null, status: 'vacant' }
        });
    }
};
//# sourceMappingURL=pms.js.map