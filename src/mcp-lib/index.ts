import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Define a generic input schema for functions accepting string arguments
const GenericStringVarArgsSchema = z.object({
  args: z.array(z.string()).describe("An array of string arguments for the tool."),
});
const genericShape = GenericStringVarArgsSchema.shape;

type LibraryFunction = (...args: string[]) => any;

// --- Server Setup and Dynamic Registration --- 

// Make runMcp accept the libraries and export it
export async function runMcp(libraries: Record<string, LibraryFunction>[]) {

  const server = new McpServer({
    name: "mcp-dynamic-lib-server",
    version: "1.0.0", // Consider getting from package.json
  });

  console.error("Registering tools dynamically...");
  const registeredToolNames: string[] = []; // Array to track registered tools

  // Iterate through each library object provided
  for (const library of libraries) {
    // Iterate through the exported keys (function names) in the library
    for (const funcName in library) {
      // Check if the property is a function and owned by the object (not inherited)
      if (Object.prototype.hasOwnProperty.call(library, funcName) && typeof library[funcName] === 'function') {
        const originalFunction = library[funcName] as LibraryFunction;

        // Create a generic handler for this function
        const genericHandler = async (inputArgs: unknown): Promise<CallToolResult> => {
          try {
            // Validate input against the generic schema
            const parsedArgs = GenericStringVarArgsSchema.parse(inputArgs);
            // Call the original library function
            const result = originalFunction(...parsedArgs.args);
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
