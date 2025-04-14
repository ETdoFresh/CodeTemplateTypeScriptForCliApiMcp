// src/command-libraries/openrouter-lib/index.ts

import { FunctionDefinition, ArgumentDefinition } from '../../system/command-types.js';

// --- Tool Handler Implementation using FunctionDefinition ---

export const call_openrouter: FunctionDefinition = {
  name: 'call_openrouter',
  description: "Makes a chat completion request to the OpenRouter API using the specified prompt, model, and temperature.",
  arguments: [
    {
      name: 'prompt',
      type: 'string',
      description: "*The user's prompt message [required]",
      // optional is omitted, meaning required
    },
    {
      name: 'model',
      type: 'string',
      description: "The OpenRouter model identifier (default: google/gemini-2.5-pro-preview-03-25)",
      optional: true,
      defaultValue: "google/gemini-2.5-pro-preview-03-25",
    },
    {
      name: 'temperature',
      type: 'number',
      description: "Controls randomness (0.0 to 2.0, default: 1.0)",
      optional: true,
      defaultValue: 1.0,
    },
  ],
  returnType: {
    name: 'completion',
    type: 'string',
    description: 'The completion result from OpenRouter',
    // optional is omitted, meaning required
  },
  function: async (args: any): Promise<string> => { // Signature changed to args: any as requested
    const API_KEY = process.env.OPENROUTER_API_KEY;
    const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
    const REFERRER = process.env.OPENROUTER_REFERRER || "mcp://server/openrouter"; // Default or from env
    const TITLE = "MCP Server - OpenRouter"; // Identify your app

    if (!API_KEY) {
      console.error("Error: OPENROUTER_API_KEY environment variable is not set.");
      throw new Error("Configuration Error: OpenRouter API Key is missing on the server.");
    }

    try {
      // NOTE: Accessing args directly (args.model, args.prompt) assumes the execution
      // layer still passes an object. This might need adjustment later when the
      // execution logic is updated to handle individual arguments based on FunctionDefinition.
      console.error(`Calling OpenRouter: Model=${args.model}, Temp=${args.temperature}`); // Log params to stderr

      const requestBody = {
        model: args.model, // Assumes args.model exists
        messages: [{ role: "user", content: args.prompt }], // Assumes args.prompt exists
        temperature: args.temperature, // Assumes args.temperature exists
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
};