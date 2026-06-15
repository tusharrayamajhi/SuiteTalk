import { aiClient, hotelTools, systemInstruction, toolHandlers } from "./ai.js";
import dotenv from "dotenv";

dotenv.config();

async function testAI() {
  console.log("Testing Gemini Tool Calling for SuiteTalk...")
  
  if (!process.env.GEMINI_API_KEY) {
    console.error("Error: Please set a valid GEMINI_API_KEY in .env");
    return;
  }

  const chat = aiClient.chats.create({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction,
      tools: hotelTools,
    }
  });

  const prompt = "I am in room 101. I need two extra towels and a bottle of water, please.";
  console.log(`Guest: ${prompt}`);
  
  const result = await chat.sendMessage({ message: prompt });
  
  // Check for tool calls
  const calls = result.functionCalls;
  if (calls) {
    const parts = [];
    for (const call of calls) {
      if (call.name) {
        console.log(`AI decided to call tool: ${call.name} with args:`, call.args);
        const handler = toolHandlers[call.name];
        if (handler) {
          const toolResult = await handler(call.args as any);
          console.log(`Tool Result:`, toolResult);
          parts.push({ functionResponse: { name: call.name, response: { content: toolResult } } });
        }
      }
    }
    const followUp = await chat.sendMessage({ message: parts });
    console.log(`AI Response: ${followUp.text}`);
  } else {
    console.log(`AI Response: ${result.text}`);
  }
}

testAI().catch(console.error);
