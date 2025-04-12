import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from 'zod';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Import shared types and validation
import { LibraryFunction, ArgInfo, ArgType, validateType } from '../cli-lib/shared';

// Helper to check if a property exists on an object (local copy)
function hasOwnProperty<X extends {}, Y extends PropertyKey>
  (obj: X, prop: Y): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

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

// --- Server Setup and Dynamic Registration --- 

// Helper to build a Zod schema from __argTypes
function buildZodSchema(argTypeDefs: ArgInfo[], commandName: string): z.ZodObject<any> {
    const shape: Record<string, z.ZodTypeAny> = {};
    let hasRestParam = false;

    for (const argDef of argTypeDefs) {
        let zodType: z.ZodTypeAny;
        const isRest = argDef.type.startsWith('...');
        const baseType = argDef.type.replace('...', '');

        switch (baseType) {
            case 'string': zodType = z.string(); break;
            case 'number': zodType = z.number(); break;
            case 'boolean': zodType = z.boolean(); break;
            case 'string[]': zodType = z.array(z.string()); break;
            case 'number[]': zodType = z.array(z.number()); break;
            case 'boolean[]': zodType = z.array(z.boolean()); break;
            default: throw new Error(`Unsupported ArgType '${argDef.type}' for Zod schema generation in command '${commandName}'.`);
        }

        if (isRest) {
            if (hasRestParam) {
                console.warn(`[${commandName}] Multiple rest parameters defined in __argTypes. Only the first one will be used for Zod schema.`);
                continue; // Skip subsequent rest params for schema
            }
            // Rest parameter becomes an optional array in the Zod schema
            shape[argDef.name] = z.array((zodType as z.ZodArray<any>)._def.type).optional().describe(`Rest arguments for ${argDef.name}`);
            hasRestParam = true;
        } else {
            // Non-rest parameters
            // Check if the argument is marked as optional in __argTypes
            if (argDef.optional) {
                shape[argDef.name] = zodType.optional().describe(`Argument ${argDef.name}`);
            } else {
                // Otherwise, it remains required (Zod default)
                shape[argDef.name] = zodType.describe(`Argument ${argDef.name}`);
            }
        }
    }
    return z.object(shape);
}

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

        // Get __argTypes for the function
        const argTypeDefs = originalFunction.__argTypes || [];

        // Dynamically build Zod schema based on __argTypes
        let inputSchema: z.ZodObject<any>;
        try {
            inputSchema = buildZodSchema(argTypeDefs, funcName);
        } catch (schemaError: any) {
            console.error(`[${funcName}] Error building Zod schema: ${schemaError.message}. Skipping tool registration.`);
            continue; // Skip this tool if schema fails
        }

        // Create the MCP handler using the dynamic schema and __argTypes validation
        const mcpHandler = async (inputArgs: unknown): Promise<CallToolResult> => {
            try {
                // 1. Validate input against the dynamically generated Zod schema
                const parsedInput = inputSchema.parse(inputArgs);
                const finalArgs: any[] = [];

                // 2. Process arguments based on __argTypes, using shared validateType
                for (let i = 0; i < argTypeDefs.length; i++) {
                    const argDef = argTypeDefs[i];
                    const isRestParam = argDef.type.startsWith('...');
                    let argValue: any;

                    if (!hasOwnProperty(parsedInput, argDef.name)) {
                        if (isRestParam) {
                            argValue = []; // Default empty for missing optional rest param
                        } else {
                            // This should ideally be caught by Zod if param is required
                            throw new Error(`Internal Error: Missing required argument '${argDef.name}' after Zod validation.`);
                        }
                    } else {
                        argValue = parsedInput[argDef.name];
                    }

                    // 3. Use the shared validateType (optional redundancy, Zod mostly covers it)
                    // validateType(argValue, argDef.type, argDef.name, funcName);

                    if (isRestParam) {
                        finalArgs.push(...argValue); // Spread rest args
                    } else {
                        finalArgs.push(argValue);
                    }
                }

                // 4. Execute the original function
                const result = originalFunction(...finalArgs);

                // 5. Format and return result
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

        // Generate description (could be enhanced using __argTypes)
        const description = `Dynamically registered tool for ${funcName}. Args: ${argTypeDefs.map(a => a.name + ':' + a.type).join(', ') || 'none'}`;

        // Register the tool using the dynamic schema and handler
        server.tool(funcName, description, inputSchema.shape, mcpHandler);
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
