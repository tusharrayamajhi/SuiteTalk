import { GoogleGenAI, Type } from "@google/genai";
import {
  prisma,
  createServiceRequest,
  getKnowledgeBase,
  getRoomByNumber,
  getMenuItems,
  extendStay,
  handleVisitor,
  handleDining,
  handleWakeUpCall,
  handleSpaBooking,
  handleTransportation,
  handleLostAndFound,
} from "./db.js";
import dotenv from "dotenv";

dotenv.config();

export const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Single source of truth for all tool declarations.
const ALL_TOOL_DECLARATIONS: any[] = [
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
  },
  {
    name: "wake_up_call",
    description: "Schedule a wake-up call for the guest at a specified time.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        room_number: { type: Type.STRING },
        wake_time: { type: Type.STRING, description: "Time for the wake-up call, e.g. '7:00 AM'." },
        notes: { type: Type.STRING, description: "Optional notes, e.g. 'gentle ring, early flight'." }
      },
      required: ["room_number", "wake_time"]
    }
  },
  {
    name: "spa_and_wellness",
    description: "Book a spa treatment, gym session, or pool access for the guest.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        room_number: { type: Type.STRING },
        service_type: { type: Type.STRING, description: "E.g. 'massage', 'facial', 'gym session', 'pool access'." },
        preferred_time: { type: Type.STRING, description: "Preferred date and time for the booking." },
        notes: { type: Type.STRING, description: "Special preferences or requirements." }
      },
      required: ["room_number", "service_type", "preferred_time"]
    }
  },
  {
    name: "transportation_request",
    description: "Arrange a taxi, airport transfer, or hotel shuttle for the guest.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        room_number: { type: Type.STRING },
        transport_type: { type: Type.STRING, enum: ["taxi", "airport_transfer", "hotel_shuttle", "car_rental"] },
        pickup_time: { type: Type.STRING, description: "Requested pickup date and time." },
        destination: { type: Type.STRING, description: "Where the guest needs to go." },
        notes: { type: Type.STRING, description: "E.g. number of passengers, luggage." }
      },
      required: ["room_number", "transport_type", "pickup_time", "destination"]
    }
  },
  {
    name: "lost_and_found",
    description: "Report a lost item or inquire whether a found item matches something the guest lost.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        room_number: { type: Type.STRING },
        action: { type: Type.STRING, enum: ["report_lost", "check_found"] },
        item_description: { type: Type.STRING, description: "Description of the item." },
        last_seen_location: { type: Type.STRING, description: "Where the item was last seen (optional)." }
      },
      required: ["room_number", "action", "item_description"]
    }
  },
  {
    name: "room_service_menu",
    description: "Retrieve the hotel's room service menu items, optionally filtered by category.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: { type: Type.STRING, description: "Menu category, e.g. 'breakfast', 'beverages', 'snacks'. Omit for all items." }
      },
      required: []
    }
  }
];

// Static exports (used as fallback and for backward compatibility).
export const hotelTools = [{ functionDeclarations: ALL_TOOL_DECLARATIONS }];

// Live (BidiGenerateContent) variant: every function is NON_BLOCKING.
// The `behavior` field is ONLY valid on the Live API.
export const liveTools = [{
  functionDeclarations: ALL_TOOL_DECLARATIONS.map((d: any) => ({ ...d, behavior: "NON_BLOCKING" }))
}];

// Build filtered tool sets from the hotel's enabled_tools setting.
// Falls back to all tools if the setting is absent.
export async function buildHotelTools(hotelId: number = 1) {
  try {
    const rows = await prisma.setting.findMany({ where: { hotelId } });
    const s: Record<string, string> = {};
    for (const r of rows) s[r.key] = r.value;

    let enabledNames: string[] | null = null;
    if (s.enabled_tools) {
      try { enabledNames = JSON.parse(s.enabled_tools); } catch {}
    }

    const decls = enabledNames
      ? ALL_TOOL_DECLARATIONS.filter(d => enabledNames!.includes(d.name))
      : ALL_TOOL_DECLARATIONS;

    return {
      textTools: [{ functionDeclarations: decls }],
      voiceTools: [{ functionDeclarations: decls.map((d: any) => ({ ...d, behavior: "NON_BLOCKING" })) }]
    };
  } catch {
    return { textTools: hotelTools, voiceTools: liveTools };
  }
}

// Display metadata for the Settings UI — consumed by GET /api/tools.
export const TOOL_METADATA: Record<string, { label: string; description: string; category: string }> = {
  get_room_and_guest_info: { label: "Guest Info Lookup", description: "Retrieve room and guest details on demand.", category: "Core" },
  concierge_search: { label: "Knowledge Base Search", description: "Answer hotel FAQs and policy questions via semantic search.", category: "Core" },
  dining_request: { label: "Dining Orders", description: "Order, cancel, or update meals for room service or dining hall.", category: "Dining" },
  room_service_menu: { label: "Room Service Menu", description: "Browse available menu items by category.", category: "Dining" },
  housekeeping_service: { label: "Housekeeping", description: "Request towels, cleaning, laundry, and room supplies.", category: "Rooms" },
  maintenance_report: { label: "Maintenance Reports", description: "Log technical issues and faults in the guest's room.", category: "Rooms" },
  parcel_delivery_inquiry: { label: "Parcel Delivery", description: "Check for arrived parcels and request delivery to room.", category: "Front Desk" },
  manage_visitor_access: { label: "Visitor Management", description: "Allow or deny visitor entry on behalf of the guest.", category: "Front Desk" },
  extend_stay_request: { label: "Stay Extension", description: "Request to push the guest's checkout date forward.", category: "Front Desk" },
  wake_up_call: { label: "Wake-Up Calls", description: "Schedule a wake-up call at the guest's requested time.", category: "Guest Services" },
  spa_and_wellness: { label: "Spa & Wellness", description: "Book spa treatments, gym sessions, and pool access.", category: "Guest Services" },
  transportation_request: { label: "Transportation", description: "Arrange taxi, airport transfers, or hotel shuttle.", category: "Guest Services" },
  lost_and_found: { label: "Lost & Found", description: "Report lost items or inquire about found items.", category: "Guest Services" },
};

// Behaviour rules shared by every prompt. Editable via the AI Settings page
// (stored as ai_base_rules in the settings table); this is the fallback.
export const BASE_RULES = `RULES:
1. LANGUAGE: Detect the guest's language and respond in the SAME language.
2. TRANSLATION: When you call a tool, always write the free-text arguments (e.g. 'description', 'issue_description', 'request_item') in ENGLISH so staff can read them, even if the guest spoke another language.
3. ACTIONS RUN IN THE BACKGROUND — NEVER GO SILENT: Tools run asynchronously while you keep talking. The moment you decide to use a tool, first say a short, natural acknowledgement out loud and KEEP the conversation going — e.g. "Of course, let me take care of that…", "One moment while I check…", "Sure, I'll note that down for you…". Do not stop and wait in silence. When the tool's result arrives you'll be notified mid-conversation; weave it in smoothly (e.g. "…and yes, breakfast is served from 7 to 10:30 in the main hall", or "All set — fresh towels are on their way up"). If the result is an error, apologise briefly and offer an alternative.
4. KNOWLEDGE: For any question about the hotel (hours, wifi, dining, policies, amenities, directions), call concierge_search and answer ONLY from what it returns. If it returns nothing relevant, say you'll check with the front desk rather than guessing.
5. If a request is ambiguous, ask one short clarifying question.`;

// Static fallback (used if settings can't be read).
export const systemInstruction = `You are the SuiteTalk AI Concierge answering hotel guests on their room phone. Be warm, professional, and concise.\n${BASE_RULES}`;

// Build the live system prompt from the hotel's AI Settings.
// Reads: agent_name, hotel_name, ai_tone, ai_instructions, ai_base_rules.
export async function buildSystemInstruction(hotelId: number = 1): Promise<string> {
  try {
    const rows = await prisma.setting.findMany({ where: { hotelId } });
    const s: Record<string, string> = {};
    for (const r of rows) s[r.key] = r.value;
    const name = s.agent_name?.trim() || "the SuiteTalk Concierge";
    const hotel = s.hotel_name?.trim() || "the hotel";
    let header = `You are ${name}, the AI voice concierge for ${hotel}, answering guests on their room phone.`;
    header += s.ai_tone?.trim() ? ` Speak in this tone: ${s.ai_tone.trim()}.` : " Be warm, professional, and concise.";
    if (s.ai_instructions?.trim()) header += `\nHotel-specific guidance from management: ${s.ai_instructions.trim()}`;
    const rules = s.ai_base_rules?.trim() || BASE_RULES;
    return `${header}\n${rules}`;
  } catch (err: any) {
    console.error("[AI] buildSystemInstruction failed, using default:", err?.message || err);
    return systemInstruction;
  }
}

export const toolHandlers: any = {
  get_room_and_guest_info: async (args: any, hotelId: number) => await getRoomByNumber(args.room_number, hotelId),
  extend_stay_request: async (args: any, hotelId: number) => await extendStay(args.room_number, args.new_checkout_date, hotelId),
  manage_visitor_access: async (args: any, hotelId: number) => await handleVisitor(args.room_number, args.visitor_name, args.action, hotelId),
  parcel_delivery_inquiry: async (args: any, hotelId: number) => await createServiceRequest(args.room_number, "Front Desk", "Parcel", args.action === "check" ? "Guest checking for parcel" : "Requesting parcel delivery to room", "normal", hotelId),
  dining_request: async (args: any, hotelId: number) => await handleDining(args.room_number, args.meal, args.location, args.action, hotelId),
  housekeeping_service: async (args: any, hotelId: number) => await createServiceRequest(args.room_number, "Housekeeping", "Items Request", args.request_item, args.urgency || "normal", hotelId),
  maintenance_report: async (args: any, hotelId: number) => await createServiceRequest(args.room_number, "Maintenance", "Technical Issue", args.issue_description, args.urgency || "normal", hotelId),
  concierge_search: async (args: any, hotelId: number) => await getKnowledgeBase(args.query, hotelId),
  wake_up_call: async (args: any, hotelId: number) => await handleWakeUpCall(args.room_number, args.wake_time, args.notes, hotelId),
  spa_and_wellness: async (args: any, hotelId: number) => await handleSpaBooking(args.room_number, args.service_type, args.preferred_time, args.notes, hotelId),
  transportation_request: async (args: any, hotelId: number) => await handleTransportation(args.room_number, args.transport_type, args.pickup_time, args.destination, args.notes, hotelId),
  lost_and_found: async (args: any, hotelId: number) => await handleLostAndFound(args.room_number, args.action, args.item_description, args.last_seen_location, hotelId),
  room_service_menu: async (args: any, hotelId: number) => await getMenuItems(args.category, hotelId),
};
