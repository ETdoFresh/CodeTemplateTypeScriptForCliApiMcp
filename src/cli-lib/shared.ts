// src/cli-lib/shared.ts

// --- Shared Types ---
export interface ArgInfo {
    name: string;
    type: ArgType;
    optional?: boolean;
    description?: string;
}
export type LibraryFunction = ((...args: any[]) => any) & { __argTypes?: ArgInfo[] };
export type ArgType = string | number | boolean | string[] | number[] | boolean[] | '...string[]' | '...number[]' | '...boolean[]';
export interface Command {
    commandName: string;
    commandArgs: string[];
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

function parseStringsToNumbers(args: string[]): number[] {
    return args.map(arg => {
        const num = parseFloat(arg);
        if (isNaN(num)) {
            throw new Error(`Invalid number argument: ${arg}`);
        }
        return num;
    });
}

function parseStringsToBooleans(args: string[]): boolean[] {
    return args.map(arg => {
        const lowerArg = arg.toLowerCase();
        if (lowerArg === 'true' || lowerArg === '1' || lowerArg === 'yes' || lowerArg === 'on') {
            return true;
        } else if (lowerArg === 'false' || lowerArg === '0' || lowerArg === 'no' || lowerArg === 'off') {
            return false;
        }
        throw new Error(`Invalid boolean argument: ${arg}`);
    });
}

// --- Exported Argument Processor (Simplified) ---
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

// --- Exported Command Executor ---
export function executeParsedCommands(
    commands: Command[],
    libraries: Record<string, LibraryFunction>[]
): ExecutionResult[] {
    const results: ExecutionResult[] = [];

    for (const command of commands) {
        const { commandName, commandArgs } = command;
        let commandFound = false;
        let executionError: Error | undefined = undefined;

        for (const library of libraries) {
            if (hasOwnProperty(library, commandName) && typeof library[commandName] === 'function') {
                commandFound = true;
                let executionResult: any;
                try {
                    const func = library[commandName];
                    const argTypeDefs = func.__argTypes || [];
                    const processedArgs: any[] = [];
                    let commandArgIndex = 0;

                    // Determine expected signature type
                    // Check if the type is a string before calling string methods
                    const isSingleArrayParam = argTypeDefs.length === 1 &&
                        typeof argTypeDefs[0].type === 'string' && // Type guard
                        argTypeDefs[0].type.endsWith('[]') &&
                        !argTypeDefs[0].type.startsWith('...');

                    // --- Calculate hasRestParameter safely ---
                    const lastArgDefType = argTypeDefs.length > 0 ? argTypeDefs[argTypeDefs.length - 1].type : undefined;
                    const lastArgTypeString = typeof lastArgDefType === 'string' ? lastArgDefType : undefined;
                    const hasRestParameter = !!lastArgTypeString?.startsWith('...'); // Use temporary var and ensure boolean
                    // --- End safe calculation ---

                    // Adjust expected counts based on the refined definitions
                    const expectedMinArgCount = argTypeDefs.length - (hasRestParameter ? 1 : 0);
                    // If it's a single array param, max count is effectively infinite *for the input args* because they all go into the array
                    const expectedMaxArgCount = (hasRestParameter || isSingleArrayParam) ? Infinity : argTypeDefs.length;
                    const effectiveMinArgCount = (hasRestParameter || isSingleArrayParam) ? Math.max(1, expectedMinArgCount) : expectedMinArgCount;

                    // Argument Count Validation
                    // Let parsing handle errors if too few args are given for the defined parameters before a rest/array
                    if (!hasRestParameter && !isSingleArrayParam && commandArgs.length !== expectedMinArgCount) {
                        // Error only if exact # of scalar args don't match
                         throw new Error(`Command '${commandName}' expects exactly ${expectedMinArgCount} arguments, but got ${commandArgs.length}.`);
                    } else if ((hasRestParameter || isSingleArrayParam) && commandArgs.length < effectiveMinArgCount) {
                        // Error if not enough args provided for the minimum required before/for the rest/array part
                         let errorMsg = `Command '${commandName}' expects at least ${effectiveMinArgCount} arguments, but got ${commandArgs.length}.`;
                         throw new Error(errorMsg);
                    }
                    // Otherwise, allow parsing to proceed (parsing loop will handle consumption)

                    // Argument Parsing Loop
                    for (let i = 0; i < argTypeDefs.length; i++) {
                        const argDef = argTypeDefs[i];
                        const isLastArgDef = i === argTypeDefs.length - 1;

                        // Use the refined definitions for parsing
                        const argTypeString = typeof argDef.type === 'string' ? argDef.type : undefined;

                        const isRestForParsing = isLastArgDef && argTypeString?.startsWith('...');

                        const isSingleArrayForParsing = isLastArgDef &&
                            argTypeString?.endsWith('[]') &&
                            !argTypeString?.startsWith('...');

                        if (isRestForParsing || isSingleArrayForParsing) {
                            const remainingArgs = commandArgs.slice(commandArgIndex);
                            let parsedArray: any[];
                            switch (argDef.type) {
                                case 'number[]': // Handle single array param
                                case '...number[]': // Handle rest param
                                    parsedArray = parseStringsToNumbers(remainingArgs); break;
                                case 'string[]': // Handle single array param
                                case '...string[]': // Handle rest param
                                    parsedArray = remainingArgs; break;
                                case 'boolean[]': // Handle single array param
                                case '...boolean[]': // Handle rest param
                                    parsedArray = parseStringsToBooleans(remainingArgs); break;
                                default: throw new Error(`Internal error: Invalid array/rest parameter type '${argDef.type}' for ${commandName}`);
                            }
                             // Store the *whole array* for later use in the function call
                            processedArgs.push(parsedArray);
                            commandArgIndex = commandArgs.length;
                        } else {
                            if (commandArgIndex >= commandArgs.length) throw new Error(`Internal error: Not enough args for parameter '${argDef.name}' in '${commandName}'.`);
                            const currentArg = commandArgs[commandArgIndex];
                            switch (argDef.type) {
                                case 'number': processedArgs.push(parseStringsToNumbers([currentArg])[0]); break;
                                case 'string': processedArgs.push(currentArg); break;
                                case 'boolean': processedArgs.push(parseStringsToBooleans([currentArg])[0]); break;
                                default: throw new Error(`Invalid argument type '${argDef.type}' for non-rest parameter '${argDef.name}' in '${commandName}'.`);
                            }
                            commandArgIndex++;
                        }
                    }

                    // Function Call Logic
                    if (hasRestParameter) {
                        const scalarArgs = processedArgs.slice(0, -1);
                        const restArgsArray = processedArgs[processedArgs.length - 1] || [];
                        executionResult = (func as (...args: any[]) => any)(...scalarArgs, ...restArgsArray);
                    } else if (isSingleArrayParam) {
                         executionResult = (func as (arg: any[]) => any)(processedArgs[0]);
                    } else {
                        executionResult = (func as (...args: any[]) => any)(...processedArgs);
                    }

                } catch (error: any) {
                     executionError = error instanceof Error ? error : new Error(String(error));
                }
                 // Now push the result object *inside* the library loop, immediately after try/catch
                 // This ensures we capture the correct executionResult/executionError for *this* specific function attempt
                 // console.error(`DEBUG SHARED: Pushing result:`, { result: executionResult, error: executionError });
                 results.push({ command, result: executionResult, error: executionError });
                 break; // Command found and result recorded
            }
        }

        if (!commandFound) {
            executionError = new Error(`Command '${commandName}' not found.`);
             // Push the error result if command wasn't found in any library
             // console.error(`DEBUG SHARED: Pushing command not found error:`, { error: executionError });
             results.push({ command, result: undefined, error: executionError });
        }
    }
    return results;
}

// Exported helper for detailed type validation (moved from cli-json-lib)
export function validateType(value: any, expectedType: ArgType, argName: string, commandName: string): void {
    const type = typeof value;

    // Restructure switch for better type narrowing
    switch (expectedType) {
        case 'string':
        case 'number':
        case 'boolean':
            // Primitive type validation
            if (type !== expectedType) {
                throw new Error(`Type mismatch for argument '${argName}' in command '${commandName}'. Expected ${expectedType}, got ${type}.`);
            }
            break;

        // String array/rest
        case 'string[]':
        case '...string[]':
            if (!Array.isArray(value)) {
                throw new Error(`Type mismatch for argument '${argName}' in command '${commandName}'. Expected string array, got ${type}.`);
            }
            for (const element of value) {
                if (typeof element !== 'string' && element !== null && element !== undefined) {
                    throw new Error(`Type mismatch for element in string array '${argName}' of command '${commandName}'. Expected string, got ${typeof element}.`);
                }
            }
            break;

        // Number array/rest
        case 'number[]':
        case '...number[]':
            if (!Array.isArray(value)) {
                throw new Error(`Type mismatch for argument '${argName}' in command '${commandName}'. Expected number array, got ${type}.`);
            }
            for (const element of value) {
                if (typeof element !== 'number' && element !== null && element !== undefined) {
                    throw new Error(`Type mismatch for element in number array '${argName}' of command '${commandName}'. Expected number, got ${typeof element}.`);
                }
            }
            break;

        // Boolean array/rest
        case 'boolean[]':
        case '...boolean[]':
            if (!Array.isArray(value)) {
                throw new Error(`Type mismatch for argument '${argName}' in command '${commandName}'. Expected boolean array, got ${type}.`);
            }
            for (const element of value) {
                if (typeof element !== 'boolean' && element !== null && element !== undefined) {
                    throw new Error(`Type mismatch for element in boolean array '${argName}' of command '${commandName}'. Expected boolean, got ${typeof element}.`);
                }
            }
            break;

        default:
            // This should now be correctly unreachable
            const exhaustiveCheck: never = expectedType;
            throw new Error(`Internal error: Unsupported argument type '${exhaustiveCheck}' for validation.`);
    }
}