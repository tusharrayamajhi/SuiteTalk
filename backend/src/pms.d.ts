/**
 * PMS Service (Property Management System)
 * Handles guest data synchronization.
 */
export declare const PMSService: {
    /**
     * Synchronize guest check-in from PMS
     */
    checkInGuest(roomNumber: string, guestName: string, checkOutDate: string, hotelId?: number): Promise<{
        roomNumber: string;
        guestName: string;
        status: string;
        hotelId: number | null;
        id: number;
        checkIn: Date;
        checkOut: Date | null;
    }>;
    /**
     * Synchronize guest check-out from PMS
     */
    checkOutGuest(roomNumber: string, hotelId?: number): Promise<{
        roomNumber: string;
        roomType: string | null;
        guestName: string | null;
        status: string;
        hotelId: number | null;
    }>;
};
//# sourceMappingURL=pms.d.ts.map