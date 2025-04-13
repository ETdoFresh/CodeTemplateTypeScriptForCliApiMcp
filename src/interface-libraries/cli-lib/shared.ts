// src/cli-lib/shared.ts
import { z, ZodFunction, ZodTuple, ZodTypeAny, ZodError, ZodObject, ZodRawShape, ZodFunctionDef } from 'zod'; // Added ZodFunctionDef
import { DefinedFunctionModule, DefinedFunction, DefineObjectFunction } from '../../utils/zod-function-utils.js';
import yargsParser from 'yargs-parser'; // Added for named argument parsing

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
// Helper to check if a function is defined with DefineObjectFunction
// Updated return type to explicitly narrow down func._def to include argsSchema
function isObjectFunction(func: any): func is ZodFunction<any, any> & { _def: ZodFunctionDef<any, any> & { argsSchema: ZodObject<any> } } {
    // Check for the specific argsSchema property used by DefineObjectFunction
    return typeof func === 'function' &&
           func._def &&
           hasOwnProperty(func._def, 'argsSchema') && // Use hasOwnProperty for type safety
           func._def.argsSchema instanceof ZodObject; // Ensure it's a ZodObject instance
}

// Helper to check if a function is defined with DefineFunction (tuple args)
export function isDefinedFunction(func: any): func is DefinedFunction<any, any> {
     return typeof func === 'function' &&
            func._def &&
            func._def.args &&
            func._def.args._def &&
            func._def.args._def.typeName === z.ZodFirstPartyTypeKind.ZodTuple;
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

                // --- Command Execution Logic ---
                try {
                    const zodDef = func._def; // Access the Zod definition (assuming func is valid function type)
                    const funcDescription = (zodDef && zodDef.description) || commandName; // Use description if available

                    // --- Determine Function Type and Branch ---
                    if (isObjectFunction(func)) {
                        console.error(`DEBUG: [${commandName}] Entering DefineObjectFunction path`); // DEBUG LOG
                        // --- Case 1: DefineObjectFunction (Named Flags) ---
                        const objectFunc = func; // Type assertion via helper
                        const objectSchema = func._def.argsSchema as ZodObject<ZodRawShape>; // CORRECTED: Access from narrowed func._def
                        if (!objectSchema || typeof objectSchema !== 'object' || !objectSchema.shape || typeof objectSchema.shape !== 'object') {
                            // This check might still be useful, but the primary issue was accessing the wrong property
                            throw new Error(`Internal error: Invalid Zod object schema definition for command '${funcDescription}'. Schema or shape is missing or not an object.`);
                        }

                        // 1. Parse commandArgs using yargs-parser
                        let parsedArgs: yargsParser.Arguments;
                        try {
                            // Parse allowing boolean flags and handling potential aliases if defined later
                            parsedArgs = yargsParser(commandArgs, {
                                // Configuration can be added here if needed, e.g., alias, default, coerce
                                // For now, default behavior is usually sufficient.
                                // Ensure boolean flags are parsed correctly:
                                 configuration: {
                                     'boolean-negation': true, // Allows --no-flag syntax
                                     'camel-case-expansion': true, // Converts --some-flag to someFlag
                                     'parse-numbers': true, // Attempt to parse numeric values
                                 }
                            });
                        } catch (parseError: any) {
                            throw new Error(`Error parsing arguments for command '${funcDescription}': ${parseError.message}`);
                        }
                        // Safeguard: Ensure yargsParser returned a valid object
                        if (!parsedArgs || typeof parsedArgs !== 'object') {
                            throw new Error(`Internal error: yargs-parser failed to return a valid object for command '${funcDescription}'.`);
                        }

                        // 2. Check for unexpected positional arguments
                        // DefineObjectFunction expects only named flags
                        if (parsedArgs._ && parsedArgs._.length > 0) {
                            throw new Error(`Command '${funcDescription}' expects named arguments (e.g., --key value), but received positional arguments: ${parsedArgs._.join(' ')}`);
                        }

                        // 3. Prepare args for Zod validation (exclude yargs-parser specific fields)
                        // 3. Filter parsed args to include only keys defined in the Zod schema
                        const filteredArgs: Record<string, any> = {};
                        const schemaKeys = Object.keys(objectSchema.shape); // Get keys from Zod schema shape

                        for (const key of schemaKeys) {
                            // Check if the key exists in the parsed args (yargs-parser might camelCase)
                            // We rely on yargs-parser's camel-case-expansion to handle kebab-case flags
                            if (hasOwnProperty(parsedArgs, key)) {
                                filteredArgs[key] = parsedArgs[key];
                            }
                            // We don't need manual camelCase conversion here because
                            // yargs-parser with 'camel-case-expansion': true handles it.
                            // Zod schema keys should match the expected camelCase names.
                        }

                        // 4. Validate the *filtered* object against Zod schema
                        try {
                            // Zod will handle type coercion based on the schema for validated args
                            const validatedArgs = objectSchema.parse(filteredArgs); // Use filteredArgs here

                            // 5. Execute the object function
                            const returnsPromise = zodDef.returns instanceof z.ZodPromise;
                            if (returnsPromise) {
                                console.warn(`[${funcDescription}] Warning: Command is async, but CLI execution is currently synchronous. Result might be a Promise object.`);
                            }
                            executionResult = objectFunc(validatedArgs); // Call func directly

                        } catch (validationError: any) {
                            if (validationError instanceof ZodError) {
                                // Provide clearer error messages referencing the flag names
                                const errorMessages = validationError.errors.map(e => {
                                    const flagName = e.path.join('.'); // Reconstruct flag name (might need adjustment for nested)
                                    // Attempt to convert camelCase back to kebab-case for user display if needed
                                    const kebabPath = flagName.replace(/([A-Z])/g, '-$1').toLowerCase();
                                    return `Invalid value for --${kebabPath}: ${e.message}`;
                                }).join('; ');
                                throw new Error(`Invalid arguments for '${funcDescription}': ${errorMessages}`);
                            }
                            // Handle potential errors from yargs-parser if strict mode was enabled, etc.
                            // Or re-throw other unexpected validation errors
                            throw new Error(`Argument validation failed for '${funcDescription}': ${validationError.message || validationError}`);
                        }

                    } else if (isDefinedFunction(func)) {
                        console.error(`DEBUG: [${commandName}] Entering DefineFunction (positional) path`); // DEBUG LOG
                        // --- Case 2: DefineFunction (Positional Args) ---
                        const definedFunc = func; // Type assertion via helper
                        const argTupleSchema = zodDef.args as ZodTuple<any, any>; // Get schema

                        // Check if argTupleSchema is valid before proceeding
                        if (!argTupleSchema || !argTupleSchema._def) {
                            throw new Error(`Could not retrieve argument tuple schema from ._def for command '${funcDescription}'. _def content: ${JSON.stringify(zodDef)}`);
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
                                     throw new Error(`Command '${funcDescription}' expected at least ${fixedArgsSchemas.length} arguments, but got ${commandArgs.length}.`);
                                 }
                             }
                             const coercedValue = coerceCliArg(commandArgs[cliArgIndex], argSchema, argName, funcDescription);
                             finalCallArgs.push(coercedValue);
                             cliArgIndex++;
                        }

                        // 2. Parse Rest Arguments
                        if (restArgSchema) {
                            const restArgsStrings = commandArgs.slice(cliArgIndex);
                            const restArgName = restArgSchema.description || 'restArgs';
                            const coercedRestValues = restArgsStrings.map(argStr =>
                                coerceCliArg(argStr, restArgSchema, restArgName, funcDescription)
                            );
                            finalCallArgs.push(...coercedRestValues);
                        } else if (cliArgIndex < commandArgs.length) {
                            throw new Error(`Command '${funcDescription}' received too many arguments. Expected ${fixedArgsSchemas.length}, got ${commandArgs.length}.`);
                        }

                        // 3. Execute the defined function
                        const returnsPromise = zodDef.returns instanceof z.ZodPromise;
                        if (returnsPromise) {
                            console.warn(`[${funcDescription}] Warning: Command is async, but CLI execution is currently synchronous. Result might be a Promise object.`);
                        }
                        // Call the function directly
                        executionResult = (definedFunc as Function)(...finalCallArgs); // Assert as Function to bypass TS error

                    } else {
                        console.error(`DEBUG: [${commandName}] Entering INVALID function type path`); // DEBUG LOG
                        // --- Error Case: Invalid Function Type ---
                        // This handles cases where the property exists but isn't a recognized function type
                        throw new Error(`Command '${commandName}' found but is not a valid DefinedFunction or DefineObjectFunction.`);
                    }
                    // The logic previously here is now inside the if/else if blocks above

                } catch (error: any) {
                     executionError = error instanceof Error ? error : new Error(String(error));
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
