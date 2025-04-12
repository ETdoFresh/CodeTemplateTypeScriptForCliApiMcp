// src/cli-lib/shared.ts
import { z, ZodFunction, ZodTuple, ZodTypeAny, ZodError } from 'zod';
import { DefinedFunctionModule, DefinedFunction } from '../../utils/zod-function-utils.js'; // Import new types

// --- Shared Types ---

export interface Command {
    commandName: string;
    commandArgs: string[]; // Raw string args from CLI
}
export interface ExecutionResult {
    command: Command;
    result?: any;
    error?: Error;
}

// --- Private Helper Functions ---
function hasOwnProperty<X extends {}, Y extends PropertyKey>
  (obj: X, prop: Y): obj is X & Record<Y, unknown> {
  return obj.hasOwnProperty(prop);
}

// Helper to coerce string CLI args based on Zod type
function coerceCliArg(argString: string, zodType: ZodTypeAny, argName: string, commandName: string): any {
    try {
        if (zodType instanceof z.ZodNumber) {
            return z.coerce.number().parse(argString);
        }
        if (zodType instanceof z.ZodBoolean) {
            return z.coerce.boolean().parse(argString);
        }
        if (zodType instanceof z.ZodString) {
            return z.string().parse(argString); // Still validate string
        }
        // Add other potential coercions if needed (e.g., dates)
        return argString; // Default to string if no specific coercion matches
    } catch (error) {
        if (error instanceof ZodError) {
            // Provide a more specific error message for CLI context
             throw new Error(`Invalid format for argument '${argName}' in command '${commandName}'. Expected ${zodType.constructor.name.replace('Zod','')}. ${error.errors[0]?.message || ''}`);
        }
        throw error; // Re-throw other errors
    }
}

// --- Exported Argument Processor (Simplified) ---
// processArgs remains the same as it deals with raw string splitting
export function processArgs(rawArgs: string[]): Command[] {
    const commands: Command[] = [];

    if (rawArgs.length === 0) {
        return commands;
    }

    let commandName: string;
    let commandArgs: string[];

    // Case 1: Standard CLI arguments (more than one raw arg)
    if (rawArgs.length > 1) {
        commandName = rawArgs[0];
        commandArgs = rawArgs.slice(1).map(arg => {
            // Strip outer quotes from individual arguments
            const first = arg.charAt(0);
            const last = arg.charAt(arg.length - 1);
            if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
                return arg.slice(1, -1);
            }
            return arg;
        });
    }
    // Case 2: Single argument (potentially quoted command line)
    else { // rawArgs.length === 1
        let inputLine = rawArgs[0].trim();
        // Strip outer quotes *only if they wrap the entire string*
        const first = inputLine.charAt(0);
        const last = inputLine.charAt(inputLine.length - 1);
        if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
            inputLine = inputLine.slice(1, -1);
        }
        const parts = inputLine.trim().split(/\s+/);
        commandName = parts[0] || ''; // Handle empty string case
        commandArgs = parts.slice(1);
    }

    // Push the single parsed command if valid
    if (commandName) {
        commands.push({ commandName, commandArgs });
    }

    return commands;
}

// --- Exported Command Executor (Reverted to Duck Typing Check) ---
export function executeParsedCommands(
    commands: Command[],
    libraries: DefinedFunctionModule[] // Update library type
): ExecutionResult[] {
    const results: ExecutionResult[] = [];

    for (const command of commands) {
        const { commandName, commandArgs } = command;
        let commandFound = false;
        let executionError: Error | undefined = undefined;
        let executionResult: any;

        for (const library of libraries) {
             if (hasOwnProperty(library, commandName)) {
                const func = library[commandName];

                commandFound = true; // Assume found if property exists

                // --- Defined Function Handling ---
                try {
                    // Check if it's a DefinedFunction
                    if (!(typeof func === 'function' && func._def)) {
                        throw new Error(`Command '${commandName}' found but is not a DefinedFunction.`);
                    }
                    const definedFunc = func; // Type is now DefinedFunction
                    const zodDef = definedFunc._def; // Access the Zod definition

                    // Access args via zodDef
                    const argTupleSchema = zodDef.args as ZodTuple<any, any>;

                    // Check if argTupleSchema is valid before proceeding
                    if (!argTupleSchema || !argTupleSchema._def) {
                        // Use description from zodDef if available
                        throw new Error(`Could not retrieve argument schema from ._def for command '${zodDef.description || commandName}'. _def content: ${JSON.stringify(zodDef)}`);
                    }

                    const fixedArgsSchemas = argTupleSchema._def.items || [];
                    const restArgSchema = argTupleSchema._def.rest;
                    const finalCallArgs: any[] = [];
                    let cliArgIndex = 0;

                    // 1. Parse Fixed Arguments
                    for (let i = 0; i < fixedArgsSchemas.length; i++) {
                         const argSchema = fixedArgsSchemas[i];
                         const argName = argSchema.description || `arg${i}`;
                         const isOptional = argSchema.isOptional();

                         if (cliArgIndex >= commandArgs.length) {
                             if (isOptional) {
                                 finalCallArgs.push(undefined);
                                 continue;
                             } else {
                                 // Use description from zodDef if available
                                 throw new Error(`Command '${zodDef.description || commandName}' expected at least ${fixedArgsSchemas.length} arguments, but got ${commandArgs.length}.`);
                             }
                         }
                         // Use description from zodDef if available in error message
                         const coercedValue = coerceCliArg(commandArgs[cliArgIndex], argSchema, argName, zodDef.description || commandName);
                         finalCallArgs.push(coercedValue);
                         cliArgIndex++;
                    }

                    // 2. Parse Rest Arguments
                    if (restArgSchema) {
                        const restArgsStrings = commandArgs.slice(cliArgIndex);
                        const restArgName = restArgSchema.description || 'restArgs';
                        const coercedRestValues = restArgsStrings.map(argStr =>
                            // Use description from zodDef if available in error message
                            coerceCliArg(argStr, restArgSchema, restArgName, zodDef.description || commandName)
                        );
                        finalCallArgs.push(...coercedRestValues);
                    } else if (cliArgIndex < commandArgs.length) {
                        // Use description from zodDef if available
                        throw new Error(`Command '${zodDef.description || commandName}' received too many arguments. Expected ${fixedArgsSchemas.length}, got ${commandArgs.length}.`);
                    }

                    // 3. Execute the defined function
                    // Use description from zodDef if available
                    const returnsPromise = zodDef.returns instanceof z.ZodPromise;
                    if (returnsPromise) {
                        console.warn(`[${zodDef.description || commandName}] Warning: Command is async, but CLI execution is currently synchronous. Result might be a Promise object.`);
                    }
                     // Call the function directly, no cast needed
                    executionResult = definedFunc(...finalCallArgs);

                } catch (error: any) {
                    if (error instanceof ZodError) {
                        executionError = new Error(`Invalid arguments for '${commandName}': ${error.errors.map(e => e.message).join(', ')}`);
                    } else {
                        executionError = error instanceof Error ? error : new Error(String(error));
                    }
                }

                // Push result after attempting execution (always assumed Zod now)
                results.push({ command, result: executionResult, error: executionError });
                break; // Command handled, move to next command in input
             }
        }

        if (!commandFound) {
            results.push({ command, error: new Error(`Command '${commandName}' not found.`) });
        }
    }
    return results;
}

// Remove the old validateType function as Zod handles validation
// export function validateType(...) { ... }
