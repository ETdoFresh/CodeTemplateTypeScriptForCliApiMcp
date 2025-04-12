import { LibraryFunction, ArgInfo, ArgType, Command, ExecutionResult, processArgs, validateType } from '../cli-lib/shared';
import process from 'process'; // Import process for argv

// Helper to check if a property exists on an object
function hasOwnProperty<X extends {}, Y extends PropertyKey>
  (obj: X, prop: Y): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

// Helper for detailed type validation
// function validateType(value: any, expectedType: ArgType, argName: string, commandName: string): void {
//    // ... implementation removed ...
// }


// Renamed function to runCliJson and adjusted signature
export function runCliJson(
    libraries: Record<string, LibraryFunction>[],
    args?: string[] // Add optional args parameter
): void { // Return void as it will handle printing/exiting
    // Use provided args if available, otherwise default to process.argv.slice(2)
    // index.ts is responsible for filtering --config and --json
    const rawArgs = args ?? process.argv.slice(2);

    // Filter out the --json flag before processing args - THIS MIGHT BE REDUNDANT if index.ts already does
    // const filteredArgs = rawArgs.filter(arg => arg !== '--json');
    // Let's assume index.ts passes the correct args already
    const commands = processArgs(rawArgs); // Use processArgs from cli-lib

    if (commands.length === 0) {
        console.error("No command provided.");
        process.exit(1);
    }
    // Assuming JSON mode handles only the first command with a JSON object
    const command = commands[0];
    const { commandName, commandArgs } = command;

    // Check if the input looks like JSON (single argument starting with {)
    const isJsonInput = commandArgs.length === 1 && commandArgs[0].trim().startsWith('{');

    if (!isJsonInput) {
         console.error(`Input for command '${commandName}' is not in the expected JSON format for runCliJson.`);
         process.exit(1);
    }

    let executionResult: any;
    let executionError: Error | undefined;

    try {
        const jsonArgsString = commandArgs[0];
        const parsedJsonArgs = JSON.parse(jsonArgsString);

        if (typeof parsedJsonArgs !== 'object' || parsedJsonArgs === null || Array.isArray(parsedJsonArgs)) {
            throw new Error(`Invalid JSON argument format for command '${commandName}'. Expected a JSON object.`);
        }

        let commandFound = false;
        for (const library of libraries) {
            if (hasOwnProperty(library, commandName) && typeof library[commandName] === 'function') {
                commandFound = true;
                const func = library[commandName];
                const argTypeDefs = func.__argTypes || [];
                const finalArgs: any[] = [];

                // Process arguments based on names defined in __argTypes
                for (let i = 0; i < argTypeDefs.length; i++) {
                    const argDef = argTypeDefs[i];
                    const isRestParam = argDef.type.startsWith('...');

                    if (isRestParam) {
                        // Rest parameter: Expect an array in JSON under this name, or empty array if missing
                        const restValues = hasOwnProperty(parsedJsonArgs, argDef.name) ? parsedJsonArgs[argDef.name] : [];
                        if (!Array.isArray(restValues)) {
                            throw new Error(`Expected an array for rest parameter '${argDef.name}' in command '${commandName}', but got ${typeof restValues}.`);
                        }
                         // Validate type of each element in the rest array
                        validateType(restValues, argDef.type, argDef.name, commandName);
                        // Add elements individually to finalArgs for function call spread
                        finalArgs.push(...restValues);
                        // Assume rest param is the last one
                        if (i !== argTypeDefs.length - 1) {
                            console.warn(`Warning: Rest parameter '${argDef.name}' is not the last defined argument for command '${commandName}'. Behavior might be unexpected.`);
                        }
                        // No need to check further JSON args for this function def once rest is handled
                       // break; // This break might be wrong if we expect other named args *after* a conceptual rest arg in JSON - removing for now
                    } else {
                         // Normal named parameter
                        if (!hasOwnProperty(parsedJsonArgs, argDef.name)) {
                            // Handle optional arguments later if needed
                            throw new Error(`Missing required argument '${argDef.name}' for command '${commandName}'.`);
                        }
                        const argValue = parsedJsonArgs[argDef.name];
                        validateType(argValue, argDef.type, argDef.name, commandName);
                        finalArgs.push(argValue);
                    }

                    // TODO: Check for extra JSON properties not defined in __argTypes? Maybe add a strict mode?
                }

                // Call the function
                executionResult = func(...finalArgs);
                break; // Command found and executed
            }
        }

        if (!commandFound) {
            throw new Error(`Command '${commandName}' not found in any library.`);
        }

    } catch (error: any) {
        executionError = error instanceof Error ? error : new Error(String(error));
    }

    // Use console.debug for debug logs
    console.debug(`DEBUG JSON: Executed command '${commandName}'. Result:`, { result: executionResult, error: executionError });

    // Handle printing result/error
    if (executionError) {
        console.error(`Error executing command '${commandName}':`, executionError.message);
        process.exit(1);
    } else {
        if (executionResult !== undefined) {
            console.log(executionResult);
        }
    }
} 