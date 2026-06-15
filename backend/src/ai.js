import { GoogleGenAI, Type } from "@google/genai";
import { prisma, createServiceRequest, getKnowledgeBase, getRoomByNumber, getMenuByCategory, extendStay, handleVisitor, handleDining } from "./db.js";
import dotenv from "dotenv";
dotenv.config();
export const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
export const hotelTools = [
    {
        functionDeclarations: [
            {
                name: "get_room_and_guest_info",
                description: "Retrieve details about the room and the guest (name, stay dates).",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        room_number: { type: Type.STRING, description: "The room number." }
                    },
                    required: ["room_number"]
                }
            },
            {
                name: "extend_stay_request",
                description: "Request to extend the guest's stay to a new date.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        room_number: { type: Type.STRING },
                        new_checkout_date: { type: Type.STRING, description: "Format: YYYY-MM-DD" }
                    },
                    required: ["room_number", "new_checkout_date"]
                }
            },
            {
                name: "manage_visitor_access",
                description: "Tell reception to allow or deny a visitor to enter the room.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        room_number: { type: Type.STRING },
                        visitor_name: { type: Type.STRING },
                        action: { type: Type.STRING, enum: ["allow", "deny"] }
                    },
                    required: ["room_number", "visitor_name", "action"]
                }
            },
            {
                name: "parcel_delivery_inquiry",
                description: "Ask reception about a parcel that may have arrived or request it be sent to the room.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        room_number: { type: Type.STRING },
                        action: { type: Type.STRING, enum: ["check", "deliver_to_room"] }
                    },
                    required: ["room_number", "action"]
                }
            },
            {
                name: "dining_request",
                description: "Order, cancel, or change location for a meal (breakfast, lunch, dinner).",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        room_number: { type: Type.STRING },
                        meal: { type: Type.STRING, enum: ["breakfast", "lunch", "dinner"] },
                        location: { type: Type.STRING, enum: ["room", "dining_hall"], description: "Where the guest wants to eat." },
                        action: { type: Type.STRING, enum: ["order", "cancel", "update"] }
                    },
                    required: ["room_number", "meal", "location", "action"]
                }
            },
            {
                name: "housekeeping_service",
                description: "Request housekeeping items or services (towels, cleaning, laundry).",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        room_number: { type: Type.STRING },
                        request_item: { type: Type.STRING },
                        urgency: { type: Type.STRING, enum: ["normal", "high", "immediate"] }
                    },
                    required: ["room_number", "request_item"]
                }
            },
            {
                name: "maintenance_report",
                description: "Report a technical or maintenance issue in the room.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        room_number: { type: Type.STRING },
                        issue_description: { type: Type.STRING },
                        urgency: { type: Type.STRING, enum: ["normal", "high", "immediate"] }
                    },
                    required: ["room_number", "issue_description"]
                }
            },
            {
                name: "concierge_search",
                description: "Search for hotel FAQs, policies, and recommendations.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        query: { type: Type.STRING }
                    },
                    required: ["query"]
                }
            }
        ]
    }
];
// Live (BidiGenerateContent) variant of the tools: identical, but every function
// is marked NON_BLOCKING so the Gemini Live model keeps talking to the guest while
// the action runs in the background. NOTE: the `behavior` field is ONLY valid on the
// Live API — the plain `hotelTools` (no behavior) must be used for the non-Live text
// endpoint, which rejects it.
export const liveTools = [
    {
        functionDeclarations: hotelTools[0].functionDeclarations.map((d) => ({ ...d, behavior: "NON_BLOCKING" })),
    },
];
// Behavior rules shared by every prompt. The hotel-specific identity/tone is
// prepended from the AI Settings page via buildSystemInstruction().
const BASE_RULES = `RULES:
1. LANGUAGE: Detect the guest's language and respond in the SAME language.
2. TRANSLATION: When you call a tool, always write the free-text arguments (e.g. 'description', 'issue_description', 'request_item') in ENGLISH so staff can read them, even if the guest spoke another language.
3. ACTIONS RUN IN THE BACKGROUND — NEVER GO SILENT: Tools run asynchronously while you keep talking. The moment you decide to use a tool, first say a short, natural acknowledgement out loud and KEEP the conversation going — e.g. "Of course, let me take care of that…", "One moment while I check…", "Sure, I'll note that down for you…". Do not stop and wait in silence. When the tool's result arrives you'll be notified mid-conversation; weave it in smoothly (e.g. "…and yes, breakfast is served from 7 to 10:30 in the main hall", or "All set — fresh towels are on their way up"). If the result is an error, apologise briefly and offer an alternative.
4. KNOWLEDGE: For any question about the hotel (hours, wifi, dining, policies, amenities, directions), call concierge_search and answer ONLY from what it returns. If it returns nothing relevant, say you'll check with the front desk rather than guessing.
5. If a request is ambiguous, ask one short clarifying question.`;
// Static fallback (used if settings can't be read).
export const systemInstruction = `You are the SuiteTalk AI Concierge answering hotel guests on their room phone. Be warm, professional, and concise.\n${BASE_RULES}`;
// Build the live system prompt from the hotel's AI Settings (agent name, hotel
// name, tone, custom instructions) so the Settings page actually controls the AI.
export async function buildSystemInstruction(hotelId = 1) {
    try {
        const rows = await prisma.setting.findMany({ where: { hotelId } });
        const s = {};
        for (const r of rows)
            s[r.key] = r.value;
        const name = s.agent_name?.trim() || "the SuiteTalk Concierge";
        const hotel = s.hotel_name?.trim() || "the hotel";
        let header = `You are ${name}, the AI voice concierge for ${hotel}, answering guests on their room phone.`;
        header += s.ai_tone?.trim() ? ` Speak in this tone: ${s.ai_tone.trim()}.` : " Be warm, professional, and concise.";
        if (s.ai_instructions?.trim())
            header += `\nHotel-specific guidance from management: ${s.ai_instructions.trim()}`;
        return `${header}\n${BASE_RULES}`;
    }
    catch (err) {
        console.error("[AI] buildSystemInstruction failed, using default:", err?.message || err);
        return systemInstruction;
    }
}
export const toolHandlers = {
    get_room_and_guest_info: async (args, hotelId) => await getRoomByNumber(args.room_number, hotelId),
    extend_stay_request: async (args, hotelId) => await extendStay(args.room_number, args.new_checkout_date, hotelId),
    manage_visitor_access: async (args, hotelId) => await handleVisitor(args.room_number, args.visitor_name, args.action, hotelId),
    parcel_delivery_inquiry: async (args, hotelId) => await createServiceRequest(args.room_number, "Front Desk", "Parcel", args.action === 'check' ? "Guest checking for parcel" : "Requesting parcel delivery to room", "normal", hotelId),
    dining_request: async (args, hotelId) => await handleDining(args.room_number, args.meal, args.location, args.action, hotelId),
    housekeeping_service: async (args, hotelId) => await createServiceRequest(args.room_number, "Housekeeping", "Items Request", args.request_item, args.urgency, hotelId),
    maintenance_report: async (args, hotelId) => await createServiceRequest(args.room_number, "Maintenance", "Technical Issue", args.issue_description, args.urgency, hotelId),
    concierge_search: async (args, hotelId) => await getKnowledgeBase(args.query, hotelId),
};
//# sourceMappingURL=ai.js.map