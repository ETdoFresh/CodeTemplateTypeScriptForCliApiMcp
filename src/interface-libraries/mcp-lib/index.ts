import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z, ZodFunction, ZodTuple, ZodTypeAny, ZodError } from 'zod';
import { DefinedFunctionModule, DefinedFunction } from '../../utils/zod-function-utils.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

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

// Make runMcp accept the updated library type and export it
export function runMcp(libraries: DefinedFunctionModule[]) {

  const server = new McpServer({
    name: "mcp-dynamic-lib-server",
    version: "1.0.0", // Consider getting from package.json
  });

  console.error("Registering tools dynamically...");
  const registeredToolNames: string[] = []; // Array to track registered tools
  // Identify calculator commands (this logic might need review if not using __argTypes)
  // const calculatorCommands = ['add', 'subtract', 'multiply', 'divide'];

  // Iterate through each library object provided
  for (const library of libraries) {
    // Iterate through the exported keys (function names) in the library
    for (const funcName in library) {
      // Check if the property is a function and owned by the object
      if (Object.prototype.hasOwnProperty.call(library, funcName)) {
        const func = library[funcName];

        // Check if it's a DefinedFunction by looking for _def
        if (!(typeof func === 'function' && func._def)) {
             console.warn(`[${funcName}] Skipping registration: Not a DefinedFunction (missing _def).`);
             continue;
        }
        const definedFunc = func; // Type is now DefinedFunction
        const zodDef = definedFunc._def; // Access the Zod definition

        // Get Zod schema directly from the definition
        // We expect the arguments to be a ZodTuple
        if (!(zodDef.args instanceof ZodTuple)) {
             // Safer access to constructor name
             const argTypeName = zodDef.args ? Object.getPrototypeOf(zodDef.args)?.constructor?.name : 'undefined';
             console.error(`[${funcName}] Error: Expected ZodTuple for args in _def, but got ${argTypeName}. Skipping tool registration.`);
             continue;
        }
        const argTupleSchema = zodDef.args as ZodTuple<any, any>;

        // --- Build the Input Object Schema for MCP from the ZodTuple --- 
        const inputShape: Record<string, ZodTypeAny> = {};
        let argNames: string[] = [];
        let restArgName: string | undefined;

        // Process fixed tuple arguments
        argTupleSchema._def.items.forEach((itemSchema: ZodTypeAny, index: number) => {
            const name = itemSchema.description || `arg${index}`;
            if (inputShape[name]) {
                console.warn(`[${zodDef.description || funcName}] Duplicate argument name/description '${name}'. Overwriting.`);
            }
             // Zod types are directly usable in MCP schema shape
            inputShape[name] = itemSchema;
            argNames.push(name);
        });

        // Process rest argument
        if (argTupleSchema._def.rest) {
            const restSchema = argTupleSchema._def.rest as ZodTypeAny;
            restArgName = restSchema.description || 'restArgs';
            if (inputShape[restArgName]) {
                console.warn(`[${zodDef.description || funcName}] Duplicate name/description '${restArgName}' for rest parameter. Overwriting.`);
            }
             // MCP expects rest args as an optional array in the input object
            let mcpRestType = z.array(restSchema).optional();
            if(restSchema.description) {
                mcpRestType = mcpRestType.describe(restSchema.description);
            }
            inputShape[restArgName] = mcpRestType;
        }
        const mcpInputSchema = z.object(inputShape);

        // Create the MCP handler using the Zod definition for validation
        const mcpHandler = async (inputArgs: unknown): Promise<CallToolResult> => {
            try {
                // 1. Validate input against the derived MCP input schema
                const parsedInput = mcpInputSchema.parse(inputArgs);
                const finalCallArgs: any[] = [];

                // 2. Map parsed object args back to tuple/spread format for the original function
                argNames.forEach(name => {
                    // Handle potential undefined if schema part was optional and not provided
                    finalCallArgs.push(parsedInput[name]);
                });
                if (restArgName && parsedInput[restArgName]) {
                    finalCallArgs.push(...(parsedInput[restArgName] as any[]));
                }

                // 3. Execute the original function (which is definedFunc)
                // Use await if the original function might be async (check zodDef.returns?)
                let result;
                if (zodDef.returns instanceof z.ZodPromise) {
                    result = await definedFunc(...finalCallArgs);
                } else {
                    result = definedFunc(...finalCallArgs);
                }

                // 4. Format and return result
                const resultString = typeof result === 'string' ? result : JSON.stringify(result);
                return {
                    content: [{ type: "text", text: resultString }],
                };
            } catch (error: any) {
                // Handle errors during parsing or execution
                const errorMsg = error instanceof ZodError
                    // Explicitly type 'e' in map callback
                    ? `Invalid input: ${error.errors.map((e: z.ZodIssue) => `'${e.path.join('.')}' ${e.message}`).join(', ')}`
                    : error.message;
                return {
                    content: [{ type: "text", text: `Error in ${zodDef.description || funcName}: ${errorMsg}` }],
                    isError: true,
                };
            }
        };

        // Use description from Zod definition
        const description = zodDef.description || `Dynamically registered tool for ${funcName}`;

        // Register the tool using the derived schema and handler
        server.tool(funcName, description, inputShape, mcpHandler);
        registeredToolNames.push(funcName); // Add name to our list
        console.error(`  - Registered tool: ${funcName} (${description})`);
      }
    }
  }

  console.error("Tool registration complete.");

  // --- Start Server --- 
  const transport = new StdioServerTransport();
  server.connect(transport).then(r => { });
  // Log the list of registered tool names we collected
  console.error(`MCP Dynamic Lib Server running on stdio, exposing tools: ${registeredToolNames.join(', ')}`);
}
