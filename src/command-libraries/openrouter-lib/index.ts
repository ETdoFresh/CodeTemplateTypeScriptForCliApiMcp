// src/command-libraries/openrouter-lib/index.ts

import { z } from 'zod';
import { DefineObjectFunction } from '../../utils/zod-function-utils.js';

// --- Input Schema Definition ---
const OpenRouterCompletionInputSchema = z.object({
  prompt: z.string().describe("*The user's prompt message [required]"),
  model: z.string().optional().default("google/gemini-2.5-pro-preview-03-25").describe("The OpenRouter model identifier (default: google/gemini-2.5-pro-preview-03-25)"),
  temperature: z.number().min(0).max(2).optional().default(1.0).describe("Controls randomness (0.0 to 2.0, default: 1.0)"),
});

// Type for the inferred input arguments
type OpenRouterCompletionInput = z.infer<typeof OpenRouterCompletionInputSchema>;

// --- Tool Handler Implementation wrapped in DefineObjectFunction ---
export const call_openrouter = DefineObjectFunction({
  description: "Makes a chat completion request to the OpenRouter API using the specified prompt, model, and temperature.",
  argsSchema: OpenRouterCompletionInputSchema,
  returnSchema: z.string(),
  function: async (args: OpenRouterCompletionInput): Promise<string> => {
    const API_KEY = process.env.OPENROUTER_API_KEY;
    const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
    const REFERRER = process.env.OPENROUTER_REFERRER || "mcp://server/openrouter"; // Default or from env
    const TITLE = "MCP Server - OpenRouter"; // Identify your app

    if (!API_KEY) {
      console.error("Error: OPENROUTER_API_KEY environment variable is not set.");
      throw new Error("Configuration Error: OpenRouter API Key is missing on the server.");
    }

    try {
      // Input `args` are already validated by DefineObjectFunction
      console.error(`Calling OpenRouter: Model=${args.model}, Temp=${args.temperature}`); // Log params to stderr

      const requestBody = {
        model: args.model,
        messages: [{ role: "user", content: args.prompt }],
        temperature: args.temperature,
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'HTTP-Referer': REFERRER,
          'X-Title': TITLE,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorBody = 'Unknown error';
        try {
          errorBody = await response.text();
          const errorJson = JSON.parse(errorBody);
          errorBody = errorJson.error?.message || JSON.stringify(errorJson);
        } catch (e) { /* Keep text body */ }
        console.error(`OpenRouter API Error (${response.status}): ${errorBody}`);
        throw new Error(`Error from OpenRouter API (${response.status}): ${errorBody}`);
      }

      const data = await response.json();
      const responseContent = data.choices?.[0]?.message?.content;

      if (typeof responseContent !== 'string' || responseContent.trim() === '') {
        console.error("OpenRouter API returned success but no valid content found:", data);
        throw new Error("Error: Empty or invalid response content received from OpenRouter.");
      }

      console.error("OpenRouter call successful.");
      return responseContent;

    } catch (error: any) {
      // Catch internal errors (e.g., network issues, unexpected issues)
      console.error(`Internal error processing OpenRouter request: ${error.message}`, error.stack);
      throw new Error(`Internal Server Error: ${error.message}`);
    }
  },
}); 