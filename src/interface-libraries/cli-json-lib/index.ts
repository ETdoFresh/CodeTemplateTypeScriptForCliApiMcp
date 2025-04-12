import { z, ZodFunction, ZodTuple, ZodTypeAny, ZodObject, ZodError } from 'zod';
import { processArgs } from '../cli-lib/shared'; // Keep this import
import process from 'process'; // Import process for argv
import { DefinedFunctionModule, DefinedFunction } from '../../utils/zod-function-utils.js'; // Import new types

// Helper to check if a property exists on an object (using the local definition)
function hasOwnProperty<X extends {}, Y extends PropertyKey>
  (obj: X, prop: Y): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

// Helper function to safely check if an object is a ZodFunction
// function isZodFunction(func: any): func is ZodFunction<any, any> {
//     return typeof func === 'object' && func !== null && 'inputSchema' in func && 'execute' in func;
// }

// Helper to build the ZodObject schema expected from the JSON input
// Accepts DefinedFunction and uses its _def
function buildJsonInputSchema(definedFunc: DefinedFunction<any, any>): {
    schema: ZodObject<any, any, any, any, any>;
    argNames: string[];
    restArgName?: string;
} {
    const zodDef = definedFunc._def; // Access definition
    const argTupleSchema = zodDef.args as ZodTuple<any, any>;
    let shape: Record<string, ZodTypeAny> = {};
    let argNames: string[] = [];
    let restArgName: string | undefined;

    // Process fixed tuple arguments
    argTupleSchema._def.items.forEach((itemSchema: ZodTypeAny, index: number) => {
        const name = itemSchema.description || `arg${index}`;
        if (shape[name]) {
             console.warn(`[JSON:${zodDef.description || 'unknown'}] Duplicate argument name/description '${name}'.`);
             return;
        }
        shape[name] = itemSchema; // No coercion needed for JSON input
        argNames.push(name);
    });

    // Process rest argument
    if (argTupleSchema._def.rest) {
        const restSchema = argTupleSchema._def.rest as ZodTypeAny;
        restArgName = restSchema.description || 'restArgs';
        if (shape[restArgName]) {
            console.warn(`[JSON:${zodDef.description || 'unknown'}] Duplicate name/description '${restArgName}' for rest parameter.`);
        } else {
            // JSON input expects rest args as an optional array
            let arrayType = z.array(restSchema).optional();
            if (restSchema.description) {
                arrayType = arrayType.describe(restSchema.description || `Variable number of ${restArgName}`);
            }
            shape[restArgName] = arrayType;
        }
    }
    // Use strict() to prevent extra properties in the JSON input
    return { schema: z.object(shape).strict(), argNames, restArgName };
}


// Renamed function to runJson and adjusted signature
export function runJson(
    libraries: DefinedFunctionModule[], // Update library type
): void { // Return void as it will handle printing/exiting
    // REVERT: Read process.argv directly and filter --json
    const rawArgs = process.argv.slice(2).filter(arg => arg !== '--json');
    const commands = processArgs(rawArgs); // Use processArgs from cli-lib

    if (commands.length === 0) {
        console.error("No command provided.");
        process.exit(1);
    }
    // JSON mode handles only the first command with a single JSON object arg
    const command = commands[0];
    const { commandName, commandArgs } = command;

    // Basic check if the input looks like a single JSON argument
    const isPotentialJsonInput = commandArgs.length === 1 && commandArgs[0].trim().startsWith('{');

    if (!isPotentialJsonInput) {
         console.error(`Input for command '${commandName}' must be a single JSON object string (e.g., '{"arg1": "value1", "arg2": 123}').`);
         process.exit(1);
    }

    let executionResult: any;
    let executionError: Error | undefined;
    let definedFunc: DefinedFunction<any, any> | null = null; // Use DefinedFunction type

    try {
        // Find the Defined function
        for (const library of libraries) {
            if (hasOwnProperty(library, commandName)) {
                const func = library[commandName];
                if (typeof func === 'function' && func._def) {
                    definedFunc = func;
                    break;
                }
            }
        }

        if (!definedFunc) {
            throw new Error(`Command '${commandName}' not found or is not a DefinedFunction.`);
        }
        const zodDef = definedFunc._def; // Get definition

        // Parse the JSON string input
        const jsonArgsString = commandArgs[0];
        let parsedJsonInput: unknown;
        try {
            parsedJsonInput = JSON.parse(jsonArgsString);
        } catch (jsonError: any) {
            throw new Error(`Invalid JSON provided for command '${zodDef.description || commandName}': ${jsonError.message}`);
        }

        // Build the expected Zod schema for the JSON object
        const { schema: jsonInputSchema, argNames, restArgName } = buildJsonInputSchema(definedFunc);

        // Validate the parsed JSON against the schema
        const validatedInput = jsonInputSchema.parse(parsedJsonInput);

        // Map validated object properties back to tuple/spread format
        const finalCallArgs: any[] = [];
        argNames.forEach(name => {
             finalCallArgs.push(validatedInput[name]);
        });
         if (restArgName && validatedInput[restArgName]) {
            finalCallArgs.push(...(validatedInput[restArgName] as any[]));
        }

        // Execute the Defined function
         // Check if return type is a promise
         const returnsPromise = zodDef.returns instanceof z.ZodPromise;
         if (returnsPromise) {
             // As this function isn't async, log a warning.
             console.warn(`[${zodDef.description || commandName}] Warning: Command is async, but JSON CLI execution is currently synchronous. Result might be a Promise object.`);
         }
         // Call function directly, no cast needed
        executionResult = definedFunc(...finalCallArgs);

    } catch (error: any) {
         const commandDesc = definedFunc?._def?.description || commandName; // Get description for error if possible
         if (error instanceof ZodError) {
             executionError = new Error(`Invalid JSON arguments for '${commandDesc}': ${error.errors.map((e: z.ZodIssue) => `'${e.path.join('.')}' ${e.message}`).join(', ')}`);
         } else {
            executionError = error instanceof Error ? error : new Error(String(error));
         }
    }

    // Handle printing result/error
    if (executionError) {
        // Output error as JSON to stderr
        console.error(JSON.stringify({ error: executionError.message }));
        process.exit(1);
    } else {
        // Output result as JSON to stdout
        try {
             // Attempt to stringify. Handle potential circular references, though unlikely for simple returns.
            const resultJson = JSON.stringify({ result: executionResult });
            console.log(resultJson);
        } catch (stringifyError: any) {
            const commandDesc = definedFunc?._def?.description || commandName; // Get description for error if possible
            console.error(JSON.stringify({ error: `Failed to serialize result for command '${commandDesc}': ${stringifyError.message}` }));
            process.exit(1);
        }
    }
}