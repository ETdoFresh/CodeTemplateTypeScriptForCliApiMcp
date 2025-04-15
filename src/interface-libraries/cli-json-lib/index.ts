// Removed zod imports
// Removed import for processArgs from deleted cli-lib/shared
import process from 'process'; // Import process for argv
// Removed DefinedFunctionModule, DefinedFunction from zod-function-utils
import {
    FunctionDefinition,
    LibraryDefinition,
    ArgumentDefinition,
    ArgumentInstance,
    RestArgumentInstance,
    // Removed incorrect error type imports from command-types
} from '../../system/command-types'; // Import new types
// Import locally defined types from converter if needed for clarity, or rely on inference
import { ConversionResult, ConversionError, ConvertedArgumentValue } from '../../system/command-parser/argument-converter';
import { convertArgumentInstances } from '../../system/command-parser/argument-converter';
import { validateArguments } from '../../system/command-parser/argument-validator';

// Helper to check if a property exists on an object (using the local definition)
function hasOwnProperty<X extends {}, Y extends PropertyKey>
  (obj: X, prop: Y): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

// Removed buildJsonInputSchema helper function


// Renamed function to runJson and adjusted signature
// Make the function async to handle potential promises from commands
export async function runJson(
    libraries: LibraryDefinition[], // Use FunctionDefinition[][] as library type
): Promise<void> { // Return Promise<void>
    // REVERT: Read process.argv directly and filter --json
    const rawArgs = process.argv.slice(2).filter(arg => arg !== '--json');

    if (rawArgs.length === 0) {
        console.error("No command name provided.");
        process.exit(1);
    }

    const commandName = rawArgs[0];
    const jsonArgsString = rawArgs[1]; // Expect the JSON string as the second argument

    // Check if the JSON argument string is provided and looks like JSON
    if (rawArgs.length !== 2 || typeof jsonArgsString !== 'string' || !jsonArgsString.trim().startsWith('{')) {
        console.error(`Input for command '${commandName}' must be a command name followed by a single JSON object string (e.g., command '{"arg1": "value1"}').`);
        process.exit(1);
    }
    // Note: Further JSON parsing happens later in the try block (around line 71)
    // We now use jsonArgsString directly there instead of commandArgs[0]

    let executionResult: any;
    let collectedErrors: (Error | ConversionError | string)[] = []; // Collect errors (Error, ConversionError, or string from validator)
    let funcDef: FunctionDefinition | null = null; // Use FunctionDefinition type

    try {
        // Find the FunctionDefinition
        for (const library of libraries) {
            // Correct: Search within library.functions
            const foundFunc = library.functions.find(f => f.name === commandName);
            if (foundFunc) {
                funcDef = foundFunc;
                break;
            }
        }

        if (!funcDef) {
            throw new Error(`Command '${commandName}' not found.`);
        }

        // Parse the JSON string input
        // const jsonArgsString = commandArgs[0]; // Now defined earlier from rawArgs[1]
        let parsedJsonInput: unknown;
        try {
            parsedJsonInput = JSON.parse(jsonArgsString);
        } catch (jsonError: any) {
            throw new Error(`Invalid JSON provided for command '${funcDef.name}': ${jsonError.message}`);
        }

        if (typeof parsedJsonInput !== 'object' || parsedJsonInput === null || Array.isArray(parsedJsonInput)) {
            throw new Error(`JSON input for command '${funcDef.name}' must be an object.`);
        }

        // --- Create Stringified Argument Instances from JSON ---
        const stringifiedArgInstances: ArgumentInstance[] = [];
        let stringifiedRestInstance: RestArgumentInstance | null = null;
        const providedArgNames = new Set<string>();
        const argDefMap = new Map(funcDef.arguments.map(def => [def.name, def]));
        const instanceCreationErrors: string[] = [];

        for (const [key, rawValue] of Object.entries(parsedJsonInput)) {
            providedArgNames.add(key);
            const definition = argDefMap.get(key);
            const restDefinition = funcDef.restArgument;

            if (restDefinition && key === restDefinition.name) {
                if (!Array.isArray(rawValue)) {
                    instanceCreationErrors.push(`Rest argument '${key}' must be an array, but received type ${typeof rawValue}.`);
                    continue;
                }
                // Convert each element to string for the converter
                const stringValues = rawValue.map(v => String(v));
                // Use spread syntax and correct property name 'value'
                stringifiedRestInstance = { ...restDefinition, value: stringValues };
            } else if (definition) {
                 // Convert raw value to string for the converter
                const stringValue = String(rawValue);
                 // Use spread syntax
                stringifiedArgInstances.push({ ...definition, value: stringValue });
            } else {
                instanceCreationErrors.push(`Unknown argument '${key}' provided.`);
            }
        }

        // Check for missing required arguments (using optional property)
        for (const argDef of funcDef.arguments) {
            // Required if optional is not true
            if (!argDef.optional && !providedArgNames.has(argDef.name)) {
                // Don't error yet if it has a default value, converter/validator might handle it
                if (argDef.defaultValue === undefined) {
                    instanceCreationErrors.push(`Missing required argument '${argDef.name}'.`);
                }
            }
        }

        if (instanceCreationErrors.length > 0) {
            // Throw collected instance creation errors before proceeding
            throw new Error(`Invalid arguments provided for command '${funcDef.name}': ${instanceCreationErrors.join('; ')}`);
        }

        // --- Convert Arguments ---
        const conversionResult = convertArgumentInstances(
            stringifiedArgInstances,
            stringifiedRestInstance,
            argDefMap, // Pass the map of definitions
            funcDef.restArgument || null // Pass the rest definition or null
        );

        if (conversionResult.errors.length > 0) {
            collectedErrors.push(...conversionResult.errors);
            // Allow continuing to validation phase even with conversion errors,
            // as validation might catch different issues (like missing required args).
        }

        // --- Validate Arguments ---
        // Pass the map and the record of converted args
        const validationErrors = validateArguments(
            argDefMap,
            conversionResult.convertedArguments
        );

        if (validationErrors.length > 0) {
            collectedErrors.push(...validationErrors);
        }

        // --- Check Collected Errors ---
        if (collectedErrors.length > 0) {
            // Format collected errors (can be Error, ConversionError, or string)
            const errorMessages = collectedErrors.map(e => {
                if (e instanceof Error) return e.message;
                if (typeof e === 'string') return e; // Validation error message
                // Format ConversionError
                return `Argument "${e.argumentName}": ${e.message} (Raw value: ${JSON.stringify(e.rawValue)})`;
            }).join('; ');
            throw new Error(`Argument processing failed for '${funcDef.name}': ${errorMessages}`);
        }

        // --- Prepare Final Arguments for Execution ---
        const finalCallArgs: any[] = [];
        for (const argDef of funcDef.arguments) {
            let value = conversionResult.convertedArguments[argDef.name];
            // Apply default value if argument wasn't provided or conversion resulted in undefined
            if (value === undefined && argDef.defaultValue !== undefined) {
                value = argDef.defaultValue;
            }
            // Note: A required argument missing here should have been caught by validation
            finalCallArgs.push(value);
        }

        if (funcDef.restArgument) {
            const restValue = conversionResult.convertedArguments[funcDef.restArgument.name];
            if (Array.isArray(restValue)) { // Should always be array if present and converted correctly
                finalCallArgs.push(...restValue);
            }
            // Handle case where rest arg has default value? (Less common, maybe add later if needed)
        }

        // Execute the Defined function
        // Execute the function (now async)
        executionResult = await funcDef.function(...finalCallArgs);

    } catch (error: any) {
        // Collect errors from the try block
        if (error instanceof Error) {
            collectedErrors.push(error);
        } else {
            collectedErrors.push(new Error(String(error)));
        }
    }

    // Handle printing result/error
    // Handle printing result/error based on collected errors
    if (collectedErrors.length > 0) {
        // Format collected errors (can be Error, ConversionError, or string) into a list of strings
        const errorMessages = collectedErrors.map(e => {
            if (e instanceof Error) return e.message;
            if (typeof e === 'string') return e; // Validation error message
            // Format ConversionError (assuming ConversionError has argumentName, message, rawValue)
            return `Argument "${e.argumentName}": ${e.message} (Raw value: ${JSON.stringify(e.rawValue)})`;
        });
        // Output the list of error messages as JSON to stderr
        console.error(JSON.stringify({ errors: errorMessages }));
        process.exit(1); // Exit with non-zero code on error
    } else {
        // Output result as JSON to stdout
        try {
             // Attempt to stringify. Handle potential circular references, though unlikely for simple returns.
            const resultJson = JSON.stringify({ result: executionResult });
            console.log(resultJson);
        } catch (stringifyError: any) {
            const commandDesc = funcDef?.name || commandName; // Get name for error if possible
            console.error(JSON.stringify({ error: `Failed to serialize result for command '${commandDesc}': ${stringifyError.message}` }));
            process.exit(1);
        }
    }
}