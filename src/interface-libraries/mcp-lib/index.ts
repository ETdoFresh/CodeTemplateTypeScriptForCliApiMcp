import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z, ZodFunction, ZodTuple, ZodTypeAny, ZodError, ZodObject } from 'zod';
import { DefinedFunctionModule, DefinedFunction, DefinedObjectFunction, isObjectFunction } from '../../utils/zod-function-utils.js';

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

        let mcpInputSchema: ZodObject<any>;
        let description: string;
        let argNames: string[] = [];
        let restArgName: string | undefined;

        // Build MCP schema and handler based on function type
        if (isObjectFunction(definedFunc)) {
            // Explicitly cast zodDef after the type guard
            const objectDef = zodDef as DefinedObjectFunction<any, any>['_def'];
            // For DefineObjectFunction, use its argsSchema directly
            mcpInputSchema = objectDef.argsSchema;
            description = objectDef.description || `Dynamically registered tool for ${funcName}`;
            // No need to map arg names for object functions
        } else {
            // --- Original logic for DefineFunction (Tuple Args) --- 
            // Type assertion needed here too for safety, even though it's the 'else' path
            const standardDef = zodDef as ZodFunction<any, any>['_def'];
            if (!(standardDef.args instanceof ZodTuple)) {
                 const argTypeName = standardDef.args ? Object.getPrototypeOf(standardDef.args)?.constructor?.name : 'undefined';
                 console.error(`[${funcName}] Error: Expected ZodTuple for args in standard _def, but got ${argTypeName}. Skipping tool registration.`);
                 continue;
            }
            const argTupleSchema = standardDef.args as ZodTuple<any, any>;
            const inputShape: Record<string, ZodTypeAny> = {};
            
            // Process fixed tuple arguments
            argTupleSchema._def.items.forEach((itemSchema: ZodTypeAny, index: number) => {
                const name = itemSchema.description || `arg${index}`;
                if (inputShape[name]) {
                    console.warn(`[${zodDef.description || funcName}] Duplicate argument name/description '${name}'. Overwriting.`);
                }
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
                let mcpRestType = z.array(restSchema).optional();
                if(restSchema.description) {
                    mcpRestType = mcpRestType.describe(restSchema.description);
                }
                inputShape[restArgName] = mcpRestType;
            }
            mcpInputSchema = z.object(inputShape);
            description = zodDef.description || `Dynamically registered tool for ${funcName}`;
            // --- End Original Logic --- 
        }

        // Create the MCP handler
        const mcpHandler = async (inputArgs: unknown): Promise<CallToolResult> => {
            try {
                // 1. Validate input against the derived MCP input schema
                const parsedInput = mcpInputSchema.parse(inputArgs);

                let result: any;
                // Check function type again to decide how to call it
                if (isObjectFunction(definedFunc)) {
                    // DefineObjectFunction expects a single object arg and always returns a Promise
                    result = await definedFunc(parsedInput);
                } else {
                    // Original DefineFunction: map object back to tuple args
                    const finalCallArgs: any[] = [];
                    argNames.forEach(name => {
                        finalCallArgs.push(parsedInput[name]);
                    });
                    if (restArgName && parsedInput[restArgName]) {
                        finalCallArgs.push(...(parsedInput[restArgName] as any[]));
                    }
                    
                    // Check original DefineFunction return type for await
                    // Explicit cast needed again for safety
                    const standardDef = definedFunc._def as ZodFunction<any, any>['_def']; 
                    if (standardDef.returns instanceof z.ZodPromise) {
                        result = await definedFunc.apply(null, finalCallArgs);
                    } else {
                        result = definedFunc.apply(null, finalCallArgs);
                    }
                }

                // 4. Format and return result
                let resultString: string;
                // Use the correct def based on function type
                if (isObjectFunction(definedFunc)) {
                    const objectDef = definedFunc._def as DefinedObjectFunction<any, any>['_def'];
                    if (objectDef.returnSchema && objectDef.returnSchema instanceof z.ZodString) {
                        resultString = result; // Already a string if returnSchema is z.string()
                    } else {
                        resultString = typeof result === 'string' ? result : JSON.stringify(result);
                    }
                } else {
                    resultString = typeof result === 'string' ? result : JSON.stringify(result);
                }
                
                return {
                    content: [{ type: "text", text: resultString }],
                };
            } catch (error: any) {
                // Handle errors during parsing or execution
                // Use the correct def structure to get description
                const errorDesc = isObjectFunction(definedFunc) 
                    ? (definedFunc._def as DefinedObjectFunction<any, any>['_def']).description || funcName
                    : (definedFunc._def as ZodFunction<any, any>['_def']).description || funcName;
                const errorMsg = error instanceof ZodError
                    ? `Invalid input: ${error.errors.map((e: z.ZodIssue) => `'${e.path.join('.')}' ${e.message}`).join(', ')}`
                    : error.message;
                return {
                    content: [{ type: "text", text: `Error in ${errorDesc}: ${errorMsg}` }],
                    isError: true,
                };
            }
        };

        // Register the tool using the derived schema and handler
        server.tool(funcName, description, mcpInputSchema.shape, mcpHandler); // Pass schema.shape
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
