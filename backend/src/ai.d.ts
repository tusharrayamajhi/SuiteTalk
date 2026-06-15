import { GoogleGenAI, Type } from "@google/genai";
export declare const aiClient: GoogleGenAI;
export declare const hotelTools: {
    functionDeclarations: ({
        name: string;
        description: string;
        parameters: {
            type: Type;
            properties: {
                room_number: {
                    type: Type;
                    description: string;
                };
                new_checkout_date?: never;
                visitor_name?: never;
                action?: never;
                meal?: never;
                location?: never;
                request_item?: never;
                urgency?: never;
                issue_description?: never;
                query?: never;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        parameters: {
            type: Type;
            properties: {
                room_number: {
                    type: Type;
                    description?: never;
                };
                new_checkout_date: {
                    type: Type;
                    description: string;
                };
                visitor_name?: never;
                action?: never;
                meal?: never;
                location?: never;
                request_item?: never;
                urgency?: never;
                issue_description?: never;
                query?: never;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        parameters: {
            type: Type;
            properties: {
                room_number: {
                    type: Type;
                    description?: never;
                };
                visitor_name: {
                    type: Type;
                };
                action: {
                    type: Type;
                    enum: string[];
                };
                new_checkout_date?: never;
                meal?: never;
                location?: never;
                request_item?: never;
                urgency?: never;
                issue_description?: never;
                query?: never;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        parameters: {
            type: Type;
            properties: {
                room_number: {
                    type: Type;
                    description?: never;
                };
                action: {
                    type: Type;
                    enum: string[];
                };
                new_checkout_date?: never;
                visitor_name?: never;
                meal?: never;
                location?: never;
                request_item?: never;
                urgency?: never;
                issue_description?: never;
                query?: never;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        parameters: {
            type: Type;
            properties: {
                room_number: {
                    type: Type;
                    description?: never;
                };
                meal: {
                    type: Type;
                    enum: string[];
                };
                location: {
                    type: Type;
                    enum: string[];
                    description: string;
                };
                action: {
                    type: Type;
                    enum: string[];
                };
                new_checkout_date?: never;
                visitor_name?: never;
                request_item?: never;
                urgency?: never;
                issue_description?: never;
                query?: never;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        parameters: {
            type: Type;
            properties: {
                room_number: {
                    type: Type;
                    description?: never;
                };
                request_item: {
                    type: Type;
                };
                urgency: {
                    type: Type;
                    enum: string[];
                };
                new_checkout_date?: never;
                visitor_name?: never;
                action?: never;
                meal?: never;
                location?: never;
                issue_description?: never;
                query?: never;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        parameters: {
            type: Type;
            properties: {
                room_number: {
                    type: Type;
                    description?: never;
                };
                issue_description: {
                    type: Type;
                };
                urgency: {
                    type: Type;
                    enum: string[];
                };
                new_checkout_date?: never;
                visitor_name?: never;
                action?: never;
                meal?: never;
                location?: never;
                request_item?: never;
                query?: never;
            };
            required: string[];
        };
    } | {
        name: string;
        description: string;
        parameters: {
            type: Type;
            properties: {
                query: {
                    type: Type;
                };
                room_number?: never;
                new_checkout_date?: never;
                visitor_name?: never;
                action?: never;
                meal?: never;
                location?: never;
                request_item?: never;
                urgency?: never;
                issue_description?: never;
            };
            required: string[];
        };
    })[];
}[];
export declare const liveTools: {
    functionDeclarations: any;
}[];
export declare const systemInstruction = "You are the SuiteTalk AI Concierge answering hotel guests on their room phone. Be warm, professional, and concise.\nRULES:\n1. LANGUAGE: Detect the guest's language and respond in the SAME language.\n2. TRANSLATION: When you call a tool, always write the free-text arguments (e.g. 'description', 'issue_description', 'request_item') in ENGLISH so staff can read them, even if the guest spoke another language.\n3. ACTIONS RUN IN THE BACKGROUND \u2014 NEVER GO SILENT: Tools run asynchronously while you keep talking. The moment you decide to use a tool, first say a short, natural acknowledgement out loud and KEEP the conversation going \u2014 e.g. \"Of course, let me take care of that\u2026\", \"One moment while I check\u2026\", \"Sure, I'll note that down for you\u2026\". Do not stop and wait in silence. When the tool's result arrives you'll be notified mid-conversation; weave it in smoothly (e.g. \"\u2026and yes, breakfast is served from 7 to 10:30 in the main hall\", or \"All set \u2014 fresh towels are on their way up\"). If the result is an error, apologise briefly and offer an alternative.\n4. KNOWLEDGE: For any question about the hotel (hours, wifi, dining, policies, amenities, directions), call concierge_search and answer ONLY from what it returns. If it returns nothing relevant, say you'll check with the front desk rather than guessing.\n5. If a request is ambiguous, ask one short clarifying question.";
export declare function buildSystemInstruction(hotelId?: number): Promise<string>;
export declare const toolHandlers: any;
//# sourceMappingURL=ai.d.ts.map