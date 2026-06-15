/**
 * SuiteTalk Production Audio Bridge
 * Connects Asterisk (via AudioSocket) to Google Gemini Realtime.
 */
export declare class AudioBridge {
    private ariClient;
    private tcpServer;
    private latestRoomNumber;
    private latestHotelId;
    private uuidMap;
    constructor();
    private connectAri;
    private startAudioSocketServer;
    takeoverCall(guestChannelId: string, staffExtension: string): Promise<void>;
}
//# sourceMappingURL=audio.d.ts.map