import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z, ZodTypeAny, ZodError, ZodIssue } from 'zod'; // Keep z, ZodError, ZodIssue, add ZodTypeAny if not present
// Remove old zod-function-utils imports
// import { DefinedFunctionModule, DefinedFunction } from '../../utils/zod-function-utils.js';

// Import new system components
import {
  LibraryDefinition,
  ArgumentDefinition,
  ArgumentInstance,
  RestArgumentInstance,
} from '../../system/command-types.js';
import { convertArgumentInstances } from '../../system/command-parser/argument-converter.js'; // Removed ArgumentConversionError import
import { validateArguments } from '../../system/command-parser/argument-validator.js'; // Removed formatArgumentErrors import

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Helper to map our ArgumentType to Zod types
function mapArgTypeToZod(argDef: ArgumentDefinition): ZodTypeAny {
  let zodType: ZodTypeAny;
  switch (argDef.type) {
    case 'string':
      zodType = z.string();
      break;
    case 'number':
      zodType = z.number();
      break;
    case 'boolean':
      zodType = z.boolean();
      break;
    case 'string[]':
      zodType = z.array(z.string());
      break;
    case 'number[]':
      zodType = z.array(z.number());
      break;
    case 'boolean[]':
      zodType = z.array(z.boolean());
      break;
    default:
      console.warn(`[${argDef.name}] Unsupported argument type "${argDef.type}" for MCP schema generation. Defaulting to string.`);
      zodType = z.string(); // Default or throw error?
  }

  if (argDef.optional) {
    zodType = zodType.optional();
  }
  if (argDef.description) {
    zodType = zodType.describe(argDef.description);
  }
  // Apply default only if NOT optional or if Zod supports default on optional
  if (argDef.defaultValue !== undefined && !argDef.optional) {
     // Zod's .default() requires the default value type match the schema type.
     // We might need type checking/conversion here if defaultValue is always string.
     // Assuming defaultValue matches the type for now.
     try {
        // Ensure the default value is compatible with the Zod type
        const validation = zodType.safeParse(argDef.defaultValue);
        if (validation.success) {
            zodType = zodType.default(argDef.defaultValue);
        } else {
            console.warn(`[${argDef.name}] Default value "${argDef.defaultValue}" is incompatible with type "${argDef.type}". Ignoring default.`);
            // Revert optional if it was added before default attempt
             if (argDef.optional) zodType = zodType.optional();
        }
     } catch (e) {
         console.warn(`[${argDef.name}] Error applying default value "${argDef.defaultValue}" for type "${argDef.type}". Ignoring default. Error: ${e}`);
         // Revert optional if it was added before default attempt
         if (argDef.optional) zodType = zodType.optional();
     }
  }


  return zodType;
}

// Helper to format errors for MCP
function formatErrorForMcp(toolName: string, error: any): CallToolResult {
    let errorMsg: string;
    if (error instanceof ZodError) {
        errorMsg = `Invalid input: ${error.errors.map((e: ZodIssue) => `'${e.path.join('.')}' ${e.message}`).join(', ')}`;
    } else if (Array.isArray(error) && error.length > 0 && (typeof error[0] === 'string' || error[0] instanceof Error)) {
        // Assume it's validation/conversion errors (strings or Error objects)
        errorMsg = `Invalid arguments: ${error.map(e => typeof e === 'string' ? e : e.message).join('; ')}`;
    } else if (error instanceof Error) {
        errorMsg = error.message;
    } else {
        errorMsg = String(error);
    }

    return {
        content: [{ type: "text", text: `Error in ${toolName}: ${errorMsg}` }],
        isError: true,
    };
}

// --- Server Setup and Dynamic Registration ---

// Update function signature to use FunctionDefinition[]
export function runMcp(libraries: LibraryDefinition[]) {

  const server = new McpServer({
    name: "mcp-dynamic-lib-server",
    version: "1.0.0", // Consider getting from package.json
  });

  console.error("Registering tools dynamically using FunctionDefinition...");
  const registeredToolNames: string[] = []; // Array to track registered tools

  // Iterate through each FunctionDefinition provided
  for (const library of libraries) {
    for (const funcDef of library.functions) {
      try {
          // --- Build the Input Object Schema for MCP from the FunctionDefinition ---
          const inputShape: Record<string, ZodTypeAny> = {};

          // Process defined arguments
          funcDef.arguments.forEach((argDef) => {
              if (inputShape[argDef.name]) {
                  console.warn(`[${funcDef.name}] Duplicate argument name '${argDef.name}'. Overwriting schema definition.`);
              }
              inputShape[argDef.name] = mapArgTypeToZod(argDef);
          });

          // Process rest argument
          if (funcDef.restArgument) {
            const restArgDef = funcDef.restArgument;
            if (inputShape[restArgDef.name]) {
                console.warn(`[${funcDef.name}] Duplicate name '${restArgDef.name}' for rest parameter. Overwriting schema definition.`);
            }
            // MCP expects rest args as an optional array in the input object
            // The base type for the array elements comes from restArgDef.type
            const baseRestType = mapArgTypeToZod({ ...restArgDef, name: `${restArgDef.name}_element`, optional: false, defaultValue: undefined }); // Create a temporary non-optional base type for the array element
            let mcpRestType = z.array(baseRestType).optional();
            if (restArgDef.description) {
                mcpRestType = mcpRestType.describe(restArgDef.description);
            }
             // Default values don't typically apply to rest arrays themselves in Zod
            inputShape[restArgDef.name] = mcpRestType;
        }

        const mcpInputSchema = z.object(inputShape);

        // Create the MCP handler using the new parsing system
        const mcpHandler = async (rawInputArgs: unknown): Promise<CallToolResult> => {
            try {
                // 1. Validate input against the derived MCP Zod schema (done by MCP server before calling handler)
                //    We receive the already parsed object `rawInputArgs`. Let's cast it for clarity.
                const parsedMcpInput = rawInputArgs as Record<string, any>;

                // 2. Map MCP input object to our ArgumentInstance structure
                const argumentInstances: ArgumentInstance[] = funcDef.arguments.map(argDef => ({
                    ...argDef, // Spread the definition to include type, optional, etc.
                    value: parsedMcpInput[argDef.name] // Override the value with the parsed input
                }));

                let restArgumentInstance: RestArgumentInstance | undefined = undefined;
                if (funcDef.restArgument) {
                    const restValues = parsedMcpInput[funcDef.restArgument.name];
                    restArgumentInstance = {
                        ...funcDef.restArgument, // Spread the definition to include type etc.
                        // Ensure value is always an array, even if optional rest arg wasn't provided
                        value: Array.isArray(restValues) ? restValues : []
                    };
                }

                // Create a map of argument definitions
                const argumentDefinitionsMap = new Map<string, ArgumentDefinition>();
                funcDef.arguments.forEach(argDef => argumentDefinitionsMap.set(argDef.name, argDef));
                if (funcDef.restArgument) {
                    argumentDefinitionsMap.set(funcDef.restArgument.name, funcDef.restArgument);
                }

                // 3. Convert Argument Instances
                // Pass the map of definitions as the third argument
                // Pass only regular instances as the first arg, and the rest definition as the 4th
                const conversionResult = convertArgumentInstances(
                    argumentInstances, // This array already only contains regular args based on line 153
                    restArgumentInstance ?? null,
                    argumentDefinitionsMap,
                    funcDef.restArgument ?? null // Add the RestArgumentDefinition or null as the 4th argument
                );
                if (conversionResult.errors.length > 0) {
                    // Format conversion errors
                    const formattedErrors = conversionResult.errors.map(e => e.message);
                    console.error(`[${funcDef.name}] Argument conversion errors:`, formattedErrors);
                    return formatErrorForMcp(funcDef.name, formattedErrors);
                }

                // 4. Validate Arguments
                // Validate arguments using the map of definitions and the map of converted values
                const validationErrors = validateArguments(
                    argumentDefinitionsMap, // Pass the map here
                    conversionResult.convertedArguments
                );
                if (validationErrors.length > 0) {
                    // Format validation errors
                    // Use the validationErrors directly (they should be strings or have messages)
                    const formattedErrors = validationErrors;
                    console.error(`[${funcDef.name}] Argument validation errors:`, formattedErrors);
                    return formatErrorForMcp(funcDef.name, formattedErrors);
                }

                // 5. Prepare final arguments for the function call
                // Reconstruct final arguments in the correct order from the converted values map
                const finalCallArgs: any[] = funcDef.arguments.map(argDef =>
                    conversionResult.convertedArguments[argDef.name]
                );
                if (funcDef.restArgument) {
                    const restValue = conversionResult.convertedArguments[funcDef.restArgument.name];
                    // Ensure restValue is an array before spreading
                    if (Array.isArray(restValue)) {
                        finalCallArgs.push(...restValue);
                    } else if (restValue !== undefined && restValue !== null) {
                        // Handle case where conversion might not result in an array but value exists
                        console.warn(`[${funcDef.name}] Rest argument '${funcDef.restArgument.name}' converted to non-array value:`, restValue);
                        // Decide how to handle this - push as single element? Ignore? Error?
                        // Pushing as single element for now, might need adjustment based on expected behavior.
                        finalCallArgs.push(restValue);
                    }
                    // If restValue is undefined or null (e.g., optional rest not provided), do nothing.
                }

                // 6. Execute the actual function
                // Use await as the function might be async
                const result = await funcDef.function(...finalCallArgs);

                // 7. Format and return success result
                const resultString = typeof result === 'string' ? result : JSON.stringify(result);
                return {
                    content: [{ type: "text", text: resultString }],
                };
            } catch (error: any) {
                // Handle errors during conversion, validation, or execution
                console.error(`[${funcDef.name}] Error during MCP handler execution:`, error);
                return formatErrorForMcp(funcDef.name, error);
            }
        };

        // Register the tool using the FunctionDefinition info and the new handler
        server.tool(funcDef.name, funcDef.description || 'No description provided', inputShape, mcpHandler); // Added default description
        registeredToolNames.push(funcDef.name); // Add name to our list
        console.error(`  - Registered tool: ${funcDef.name} (${funcDef.description})`);

    } catch (registrationError: any) {
         console.error(`Failed to register tool '${funcDef?.name || 'unknown'}': ${registrationError.message}`);
         // Optionally continue to next function definition or re-throw
    }
  } // <--- End funcDef loop
} // <--- MISSING: End library loop. Added this closing brace.

  console.error("Tool registration complete.");

  // --- Start Server --- 
  const transport = new StdioServerTransport();
  server.connect(transport).then(r => { });
  // Log the list of registered tool names we collected
  console.error(`MCP Dynamic Lib Server running on stdio, exposing tools: ${registeredToolNames.join(', ')}`);
}
