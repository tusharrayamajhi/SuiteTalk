import { aiClient } from "./ai.js";

async function main() {
  console.log("Fetching supported models from Google Gen AI API...");
  try {
    const response = await aiClient.models.list() as any;
    
    // Google GenAI list response is an iterable pager
    const models = [];
    for await (const model of response) {
      models.push(model);
    }

    console.log(`\nFound ${models.length} total models.`);
    console.log("Filtering models that support 'bidiGenerateContent':");
    
    let found = false;
    for (const model of models) {
      const actions = model.supportedActions || [];
      const supportsBidi = actions.includes("bidiGenerateContent") || actions.includes("BidiGenerateContent");
      if (supportsBidi) {
        found = true;
        console.log(`- Model Name: ${model.name}`);
        console.log(`  Display Name: ${model.displayName}`);
        console.log(`  Supported Actions: ${actions.join(", ")}`);
        console.log("-----------------------------------------");
      }
    }
    if (!found) {
      console.log("No models explicitly support 'bidiGenerateContent' in the actions list. Printing all actions for inspection:");
      for (const model of models) {
        console.log(`- ${model.name} : [${(model.supportedActions || []).join(", ")}]`);
      }
    }
  } catch (err) {
    console.error("Failed to list models:", err);
  }
}

main();
