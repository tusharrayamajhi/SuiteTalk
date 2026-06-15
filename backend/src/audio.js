// @ts-ignore
import ari from 'ari-client';
// @ts-ignore
import WebSocket from 'ws';
import net from 'net';
import { aiClient, toolHandlers, systemInstruction, liveTools } from './ai.js';
import { logInteraction, getActiveSession } from './db.js';
import { emitLive } from './events.js';
import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();
// Asterisk runs in WSL2; reach ARI on localhost (WSL port forwarding) or the WSL
// eth0 IP via ASTERISK_HOST as a fallback.
const ASTERISK_HOST = process.env.ASTERISK_HOST || '127.0.0.1';
/**
 * Downsample 24kHz mono 16-bit PCM to 8kHz mono 16-bit PCM by decimation (factor of 3).
 */
function downsample24to8(buffer) {
    const samples = buffer.length / 2;
    const outBuffer = Buffer.alloc(Math.floor(samples / 3) * 2);
    let outIndex = 0;
    for (let i = 0; i < samples; i += 3) {
        if (outIndex + 1 < outBuffer.length) {
            outBuffer.writeInt16LE(buffer.readInt16LE(i * 2), outIndex);
            outIndex += 2;
        }
    }
    return outBuffer;
}
/**
 * Upsample 8kHz mono 16-bit PCM to 16kHz mono 16-bit PCM by sample duplication.
 */
function upscale8to16(buffer) {
    const samples = buffer.length / 2;
    const outBuffer = Buffer.alloc(buffer.length * 2);
    let outIndex = 0;
    for (let i = 0; i < samples; i++) {
        const val = buffer.readInt16LE(i * 2);
        outBuffer.writeInt16LE(val, outIndex);
        outBuffer.writeInt16LE(val, outIndex + 2);
        outIndex += 4;
    }
    return outBuffer;
}
/**
 * SuiteTalk Production Audio Bridge
 * Connects Asterisk (via AudioSocket) to Google Gemini Realtime.
 */
export class AudioBridge {
    ariClient;
    tcpServer;
    latestRoomNumber = '101';
    latestHotelId = 1;
    uuidMap = new Map();
    constructor() {
        this.connectAri();
        this.startAudioSocketServer();
    }
    async connectAri() {
        console.log("Connecting to Asterisk ARI...");
        try {
            this.ariClient = await ari.connect(`http://${ASTERISK_HOST}:8088`, 'suitetalk', 'tushar123');
            this.ariClient.on('StasisStart', async (event, channel) => {
                const callerNumber = channel.caller.number || '101';
                const context = channel.context || '';
                let roomNumber = callerNumber;
                let hotelId = 1;
                // 1. Try parsing from caller number (e.g. 1_101)
                if (callerNumber.includes('_')) {
                    const parts = callerNumber.split('_');
                    hotelId = parseInt(parts[0]) || 1;
                    roomNumber = parts[1];
                }
                else {
                    // 2. Try parsing from context (e.g. hotel_2 or hotel-2)
                    const contextMatch = context.match(/(?:hotel[-_])?(\d+)/);
                    if (contextMatch) {
                        hotelId = parseInt(contextMatch[1]) || 1;
                    }
                }
                console.log(`[REAL CALL] Room ${roomNumber} (Hotel ${hotelId}) is calling. Context: ${context}. Routing to AI...`);
                this.latestRoomNumber = roomNumber;
                this.latestHotelId = hotelId;
                // Light up the dashboard "on call" badge the moment the phone rings through.
                emitLive({ type: 'call:start', roomNumber, hotelId });
                // Generate a dynamic UUID for this call
                const rawUuid = crypto.randomUUID();
                const cleanUuid = rawUuid.replace(/-/g, '').toLowerCase();
                this.uuidMap.set(cleanUuid, `${hotelId}_${roomNumber}`);
                try {
                    // Set the channel variable for Asterisk dialplan to read
                    await this.ariClient.channels.setChannelVar({
                        channelId: channel.id,
                        variable: 'SUITETALK_UUID',
                        value: rawUuid
                    });
                    // Connect media via AudioSocket
                    this.ariClient.channels.continueInDialplan({
                        channelId: channel.id,
                        context: 'audiosocket-connect',
                        extension: 's',
                        priority: 1
                    });
                }
                catch (err) {
                    console.error("[ARI] Error setting channel variable or continuing in dialplan:", err);
                }
            });
            this.ariClient.start('suitetalk');
        }
        catch (err) {
            console.error("ARI Error:", err);
        }
    }
    startAudioSocketServer() {
        this.tcpServer = net.createServer((socket) => {
            socket.setNoDelay(true);
            console.log("[AudioSocket] Real phone connected! Streaming to Gemini...");
            let roomNumber = this.latestRoomNumber;
            let sessionId = null;
            let guestName = "Guest";
            let callHotelId = this.latestHotelId;
            let accumulatedText = "";
            let currentToolCalls = [];
            // Queuing structures for paced audio streaming (8kHz mono 16-bit PCM = 16 bytes/ms)
            const audioQueue = [];
            let isSendingAudio = false;
            let audioTimeout = null;
            function sendNextAudioChunk() {
                if (socket.destroyed || audioQueue.length === 0) {
                    isSendingAudio = false;
                    return;
                }
                isSendingAudio = true;
                const chunk = audioQueue.shift();
                if (!socket.destroyed) {
                    socket.write(Buffer.concat([chunk.header, chunk.payload]), (err) => {
                        if (err) {
                            console.error("[AudioSocket] Socket write error:", err);
                            isSendingAudio = false;
                            return;
                        }
                        // Schedule the next chunk after this chunk's duration (usually 20ms)
                        audioTimeout = setTimeout(() => {
                            sendNextAudioChunk();
                        }, chunk.durationMs);
                    });
                }
                else {
                    isSendingAudio = false;
                }
            }
            function clearAudioQueue() {
                audioQueue.length = 0;
                if (audioTimeout) {
                    clearTimeout(audioTimeout);
                    audioTimeout = null;
                }
                isSendingAudio = false;
            }
            // Fetch active session dynamically on UUID handshake
            // Setup Gemini Multimodal Live Connection (v1beta)
            const apiKey = process.env.GEMINI_API_KEY;
            const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
            const geminiWs = new WebSocket(wsUrl);
            // Start a timeout timer: if no response (audio/text) is received from AI within 3 seconds, hang up the call.
            let initialTimeout = setTimeout(() => {
                console.log("[AudioSocket] No response from AI within 3 seconds. Hanging up call.");
                const hangupHeader = Buffer.alloc(3);
                hangupHeader[0] = 0x00; // Hangup type is 0x00
                hangupHeader.writeUInt16BE(0, 1);
                if (!socket.destroyed) {
                    socket.write(hangupHeader);
                    socket.end();
                }
                geminiWs.close();
            }, 3000);
            geminiWs.on('open', () => {
                console.log("[Gemini] AudioSocket bridge connected to Live API");
                geminiWs.send(JSON.stringify({
                    setup: {
                        model: "models/gemini-2.5-flash-native-audio-latest",
                        generationConfig: { responseModalities: ["AUDIO"] },
                        systemInstruction: {
                            parts: [{ text: systemInstruction }]
                        },
                        tools: liveTools
                    }
                }));
            });
            // Parse incoming AudioSocket packets from Asterisk and forward raw audio
            let audioBufferQueue = Buffer.alloc(0);
            socket.on('data', (chunk) => {
                audioBufferQueue = Buffer.concat([audioBufferQueue, chunk]);
                while (audioBufferQueue.length >= 3) {
                    const type = audioBufferQueue[0];
                    const length = audioBufferQueue.readUInt16BE(1);
                    if (audioBufferQueue.length < 3 + length) {
                        break; // Wait for more data
                    }
                    const payload = audioBufferQueue.subarray(3, 3 + length);
                    audioBufferQueue = audioBufferQueue.subarray(3 + length);
                    if (type === 0x10) { // Audio payload (8kHz SLIN)
                        const upscaled = upscale8to16(payload);
                        if (geminiWs.readyState === WebSocket.OPEN) {
                            geminiWs.send(JSON.stringify({
                                realtimeInput: {
                                    mediaChunks: [{
                                            mimeType: "audio/pcm;rate=16000",
                                            data: upscaled.toString('base64')
                                        }]
                                }
                            }));
                        }
                    }
                    else if (type === 0x01) { // UUID
                        const receivedUuid = payload.toString('hex').toLowerCase();
                        console.log(`[AudioSocket] Received UUID handshake: ${receivedUuid}`);
                        const resolved = this.uuidMap.get(receivedUuid) || `${this.latestHotelId}_${this.latestRoomNumber}`;
                        const parts = resolved.split('_');
                        callHotelId = parseInt(parts[0] || '1') || 1;
                        roomNumber = parts[1] || '101';
                        console.log(`[AudioSocket] Resolved UUID ${receivedUuid} to Room ${roomNumber}, Hotel ${callHotelId}`);
                        // Fetch active session for this resolved room and hotel
                        getActiveSession(roomNumber, callHotelId).then((session) => {
                            if (session) {
                                guestName = session.guestName;
                                sessionId = session.id;
                                console.log(`[AudioSocket] Resolved guest session for Room ${roomNumber} (Hotel ${callHotelId}): ${guestName} (ID: ${sessionId})`);
                            }
                        }).catch((err) => {
                            console.error("[AudioSocket] Failed to resolve active session:", err);
                        });
                    }
                    else if (type === 0x00) { // Hangup
                        console.log("[AudioSocket] Received hangup signal from Asterisk");
                        if (initialTimeout) {
                            clearTimeout(initialTimeout);
                            initialTimeout = null;
                        }
                        clearAudioQueue();
                        socket.end();
                        geminiWs.close();
                    }
                    else if (type === 0x03) { // DTMF
                        console.log(`[AudioSocket] Received DTMF digit: ${payload.toString('ascii')}`);
                    }
                }
            });
            // Process messages from Gemini and write audio back to Asterisk
            geminiWs.on('message', async (msg) => {
                try {
                    const response = JSON.parse(msg.toString());
                    if (response.setupComplete) {
                        console.log(`[Gemini] AudioSocket setup complete. Sending greeting for ${guestName}...`);
                        geminiWs.send(JSON.stringify({
                            clientContent: {
                                turns: [
                                    {
                                        role: "user",
                                        parts: [{
                                                text: `Hello! I just called the front desk. Greet me by name (${guestName}) in a welcoming, warm hotel concierge tone, welcome me to SuiteTalk, and ask how you can help me today.`
                                            }]
                                    }
                                ],
                                turnComplete: true
                            }
                        }));
                    }
                    else if (response.serverContent) {
                        // Received response from Gemini: clear the initial timeout
                        if (initialTimeout) {
                            clearTimeout(initialTimeout);
                            initialTimeout = null;
                        }
                        // If Gemini detects user interruption, clear local audio queue immediately (Barge-in)
                        if (response.serverContent.interrupted) {
                            console.log("[Gemini] User barge-in detected. Clearing local audio queue.");
                            clearAudioQueue();
                        }
                        if (response.serverContent.modelTurn) {
                            const parts = response.serverContent.modelTurn.parts;
                            for (const part of parts) {
                                if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
                                    const audio24k = Buffer.from(part.inlineData.data, 'base64');
                                    const audio8k = downsample24to8(audio24k);
                                    // Slice the 8kHz audio into standard 20ms frames (320 bytes each)
                                    const FRAME_SIZE = 320;
                                    let offset = 0;
                                    while (offset < audio8k.length) {
                                        const chunkLength = Math.min(FRAME_SIZE, audio8k.length - offset);
                                        const chunkPayload = audio8k.subarray(offset, offset + chunkLength);
                                        offset += chunkLength;
                                        const header = Buffer.alloc(3);
                                        header[0] = 0x10; // Audio type is 0x10 (SLIN/8kHz)
                                        header.writeUInt16BE(chunkPayload.length, 1);
                                        const durationMs = Math.round(chunkPayload.length / 16); // 16 bytes/ms for 8kHz 16-bit PCM
                                        audioQueue.push({
                                            header,
                                            payload: chunkPayload,
                                            durationMs
                                        });
                                    }
                                    if (!isSendingAudio) {
                                        sendNextAudioChunk();
                                    }
                                }
                                else if (part.text) {
                                    accumulatedText += part.text;
                                }
                            }
                        }
                        if (response.serverContent.turnComplete) {
                            // Log conversation to database
                            if (sessionId && (accumulatedText.trim() || currentToolCalls.length > 0)) {
                                try {
                                    await logInteraction(sessionId, 'ai', accumulatedText.trim() || '(Voice Response)', currentToolCalls);
                                }
                                catch (dbErr) {
                                    console.error("[AudioSocket] Failed to log interaction:", dbErr);
                                }
                                accumulatedText = "";
                                currentToolCalls = [];
                            }
                        }
                    }
                    else if (response.toolCall) {
                        const functionCalls = response.toolCall.functionCalls || [];
                        // Run each tool in the BACKGROUND. The model (NON_BLOCKING tools) keeps
                        // talking to the guest; when a tool finishes we send its result with
                        // scheduling WHEN_IDLE, so the AI speaks it as soon as it pauses.
                        for (const call of functionCalls) {
                            if (!call.name)
                                continue;
                            console.log(`[Gemini Audio] Tool call (background): ${call.name}`, call.args);
                            const handler = toolHandlers[call.name];
                            void (async () => {
                                let toolResult;
                                let status = "success";
                                try {
                                    if (handler) {
                                        toolResult = await handler(call.args, callHotelId);
                                    }
                                    else {
                                        toolResult = { error: `Tool handler for ${call.name} not found` };
                                        status = "error";
                                    }
                                }
                                catch (err) {
                                    console.error(`[Gemini Audio] Error executing tool ${call.name}:`, err);
                                    toolResult = { error: err.message || "Execution failed" };
                                    status = "error";
                                }
                                currentToolCalls.push({ name: call.name, args: call.args, result: toolResult, status });
                                if (geminiWs.readyState === WebSocket.OPEN) {
                                    geminiWs.send(JSON.stringify({
                                        toolResponse: {
                                            functionResponses: [{
                                                    id: call.id,
                                                    name: call.name,
                                                    response: { output: toolResult, scheduling: "WHEN_IDLE" }
                                                }]
                                        }
                                    }));
                                }
                            })();
                        }
                    }
                }
                catch (err) {
                    console.error("[Gemini Audio] Error processing message:", err);
                }
            });
            geminiWs.on('error', (err) => {
                console.error("[Gemini Audio] WebSocket Error:", err);
                if (initialTimeout) {
                    clearTimeout(initialTimeout);
                    initialTimeout = null;
                }
                clearAudioQueue();
                socket.end();
            });
            geminiWs.on('close', () => {
                console.log("[AudioSocket] Gemini WebSocket closed");
                if (initialTimeout) {
                    clearTimeout(initialTimeout);
                    initialTimeout = null;
                }
                clearAudioQueue();
                socket.end();
            });
            socket.on('close', () => {
                console.log("[AudioSocket] Asterisk socket connection closed");
                if (initialTimeout) {
                    clearTimeout(initialTimeout);
                    initialTimeout = null;
                }
                emitLive({ type: 'call:end', roomNumber, hotelId: callHotelId });
                clearAudioQueue();
                geminiWs.close();
            });
            socket.on('error', (err) => {
                console.error("[AudioSocket] Socket error:", err);
                if (initialTimeout) {
                    clearTimeout(initialTimeout);
                    initialTimeout = null;
                }
                clearAudioQueue();
            });
        });
        this.tcpServer.listen(9092, '0.0.0.0', () => {
            console.log("[AudioSocket] Listening for real audio on port 9092");
        });
    }
    async takeoverCall(guestChannelId, staffExtension) {
        // Logic for human takeover by bridging channels in Asterisk
        const bridge = await this.ariClient.bridges.create({ type: 'mixing' });
        await bridge.addChannel({ channel: guestChannelId });
        await this.ariClient.channels.originate({
            endpoint: `PJSIP/${staffExtension}`,
            app: 'suitetalk'
        });
    }
}
//# sourceMappingURL=audio.js.map