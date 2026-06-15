import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
export declare const prisma: PrismaClient<{
    adapter: PrismaPg;
}, never, import("@prisma/client/runtime/client").DefaultArgs>;
export declare function getRoomByNumber(roomNumber: string, hotelId?: number): Promise<{
    roomNumber: string;
    roomType: string | null;
    guestName: string | null;
    status: string;
    hotelId: number | null;
} | null>;
export declare function createServiceRequest(roomNumber: string, department: string, type: string, description: string, urgency?: string, hotelId?: number): Promise<{
    roomNumber: string;
    status: string;
    hotelId: number | null;
    requestType: string;
    description: string | null;
    urgency: string;
    createdAt: Date;
    updatedAt: Date;
    id: number;
}>;
export declare function getMenuByCategory(category: string, hotelId?: number): Promise<{
    hotelId: number | null;
    description: string | null;
    id: number;
    itemName: string;
    category: string | null;
    price: import("@prisma/client-runtime-utils").Decimal | null;
    available: boolean;
}[]>;
export declare function getActiveSession(roomNumber: string, hotelId?: number): Promise<{
    roomNumber: string;
    guestName: string;
    status: string;
    hotelId: number | null;
    id: number;
    checkIn: Date;
    checkOut: Date | null;
} | null>;
export declare function logInteraction(sessionId: number, role: 'guest' | 'ai', content: string, toolCalls?: any): Promise<{
    createdAt: Date;
    id: number;
    role: string;
    content: string;
    toolCalls: import("@prisma/client/runtime/client").JsonValue | null;
    sessionId: number;
}>;
export declare function extendStay(roomNumber: string, newCheckOutDate: string, hotelId?: number): Promise<{
    roomNumber: string;
    guestName: string;
    status: string;
    hotelId: number | null;
    id: number;
    checkIn: Date;
    checkOut: Date | null;
} | null>;
export declare function handleVisitor(roomNumber: string, visitorName: string, action: 'allow' | 'deny', hotelId?: number): Promise<{
    roomNumber: string;
    status: string;
    hotelId: number | null;
    requestType: string;
    description: string | null;
    urgency: string;
    createdAt: Date;
    updatedAt: Date;
    id: number;
}>;
export declare function handleDining(roomNumber: string, meal: string, location: 'room' | 'dining_hall', action: 'order' | 'cancel', hotelId?: number): Promise<{
    roomNumber: string;
    status: string;
    hotelId: number | null;
    requestType: string;
    description: string | null;
    urgency: string;
    createdAt: Date;
    updatedAt: Date;
    id: number;
}>;
export declare function createKnowledgeBase(content: string, category: string | undefined, hotelId?: number): Promise<{
    hotelId: number | null;
    id: number;
    category: string | null;
    content: string;
}>;
export declare function backfillKbEmbeddings(): Promise<number>;
export declare function getKnowledgeBase(query: string, hotelId?: number): Promise<{
    id: number;
    content: string;
    category: string | null;
    similarity: number;
}[] | {
    hotelId: number | null;
    id: number;
    category: string | null;
    content: string;
}[]>;
//# sourceMappingURL=db.d.ts.map