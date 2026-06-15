import WebSocket from "ws";
import dotenv from "dotenv";
import { systemInstruction } from "./ai.js";
dotenv.config();
async function main() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("API Key missing");
        return;
    }
    const geminiWsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const ws = new WebSocket(geminiWsUrl);
    ws.on("open", () => {
        console.log("Connected to Gemini Live API");
        // Send Setup
        ws.send(JSON.stringify({
            setup: {
                model: "models/gemini-2.5-flash-native-audio-latest",
                generationConfig: { responseModalities: ["AUDIO"] },
                systemInstruction: {
                    parts: [{ text: systemInstruction }]
                }
            }
        }));
    });
    ws.on("message", (data) => {
        // If it's a binary buffer, it's raw audio!
        if (Buffer.isBuffer(data)) {
            console.log(`Received binary buffer message of length ${data.length}`);
            return;
        }
        try {
            const response = JSON.parse(data.toString());
            console.log("Received JSON response types:", Object.keys(response));
            if (response.setupComplete) {
                console.log("Setup complete! Triggering greeting via clientContent...");
                ws.send(JSON.stringify({
                    clientContent: {
                        turns: [
                            {
                                role: "user",
                                parts: [
                                    {
                                        text: "Hello! I am a guest checking in. Greet me, welcome me to SuiteTalk, and ask how you can help."
                                    }
                                ]
                            }
                        ],
                        turnComplete: true
                    }
                }));
            }
            if (response.serverContent) {
                if (response.serverContent.modelTurn) {
                    const parts = response.serverContent.modelTurn.parts;
                    for (const part of parts) {
                        if (part.inlineData) {
                            console.log(`- Received inlineData of mimeType ${part.inlineData.mimeType} (length: ${part.inlineData.data.length})`);
                        }
                        else if (part.text) {
                            console.log(`- Received text: ${part.text}`);
                        }
                    }
                }
                if (response.serverContent.turnComplete) {
                    console.log("Turn complete!");
                }
            }
        }
        catch (err) {
            console.error("Failed to parse message:", err);
        }
    });
    ws.on("close", (code, reason) => {
        console.log(`Connection closed: ${code} - ${reason}`);
    });
    ws.on("error", (err) => {
        console.error("WebSocket error:", err);
    });
    setTimeout(() => {
        ws.close();
        process.exit();
    }, 10000);
}
main().catch(console.error);
//# sourceMappingURL=test_bidi_greeting.js.map