import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from 'zod';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Define a generic input schema for functions accepting string arguments
const GenericStringVarArgsSchema = z.object({
  args: z.array(z.string()).describe("An array of string arguments for the tool."),
});
const genericShape = GenericStringVarArgsSchema.shape;

// Helper function to parse string arguments to numbers
function parseStringsToNumbers(args: string[]): number[] {
  return args.map(arg => {
    const num = parseFloat(arg);
    if (isNaN(num)) {
      throw new Error(`Invalid number argument: ${arg}`);
    }
    return num;
  });
}

type LibraryFunction = (...args: any[]) => any; // Use any[] for flexibility

// --- Server Setup and Dynamic Registration --- 

// Make runMcp accept the libraries and export it
export async function runMcp(libraries: Record<string, LibraryFunction>[]) {

  const server = new McpServer({
    name: "mcp-dynamic-lib-server",
    version: "1.0.0", // Consider getting from package.json
  });

  console.error("Registering tools dynamically...");
  const registeredToolNames: string[] = []; // Array to track registered tools
  // Identify calculator commands
  const calculatorCommands = ['add', 'subtract', 'multiply', 'divide'];

  // Iterate through each library object provided
  for (const library of libraries) {
    // Iterate through the exported keys (function names) in the library
    for (const funcName in library) {
      // Check if the property is a function and owned by the object (not inherited)
      if (Object.prototype.hasOwnProperty.call(library, funcName) && typeof library[funcName] === 'function') {
        const originalFunction = library[funcName] as LibraryFunction;
        const isCalculatorCommand = calculatorCommands.includes(funcName);

        // Create a generic handler for this function
        const genericHandler = async (inputArgs: unknown): Promise<CallToolResult> => {
          try {
            // Validate input against the generic schema
            const parsedInput = GenericStringVarArgsSchema.parse(inputArgs);
            const stringArgs = parsedInput.args;
            let result: any;

            // Parse args if it's a calculator command
            if (isCalculatorCommand) {
                const numericArgs = parseStringsToNumbers(stringArgs);
                // Call calculator func with number[] args, casting via unknown
                result = (originalFunction as unknown as (...args: number[]) => any)(...numericArgs);
            } else {
                // Call other func with string[] args
                result = (originalFunction as (...args: string[]) => any)(...stringArgs);
            }

            // Format the result
            const resultString = typeof result === 'string' ? result : JSON.stringify(result);
            return {
              content: [{ type: "text", text: resultString }],
            };
          } catch (error: any) {
            // Handle errors during parsing or execution
            return {
              content: [{ type: "text", text: `Error in ${funcName}: ${error.message}` }],
              isError: true,
            };
          }
        };

        // Generate a basic description
        const description = `Dynamically registered tool for the ${funcName} function.`;

        // Register the tool using the generic schema and handler
        // For calculator commands, we might ideally want a different schema (z.number()),
        // but for simplicity, we keep the string schema and parse inside the handler.
        server.tool(funcName, description, genericShape, genericHandler);
        registeredToolNames.push(funcName); // Add name to our list
        console.error(`  - Registered tool: ${funcName}`);
      }
    }
  }

  console.error("Tool registration complete.");

  // --- Start Server --- 
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log the list of registered tool names we collected
  console.error(`MCP Dynamic Lib Server running on stdio, exposing tools: ${registeredToolNames.join(', ')}`);
}
