// src/cli-lib/shared.ts

// --- Shared Types ---
export interface ArgInfo {
    name: string;
    type: ArgType;
}
export type LibraryFunction = ((...args: any[]) => any) & { __argTypes?: ArgInfo[] };
export type ArgType = 'boolean' | 'boolean[]' | 'string' | 'string[]' | 'number' | 'number[]';
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

// --- Exported Argument Processor ---
export function processArgs(rawArgs: string[]): Command[] {
    const commands: Command[] = [];

    if (rawArgs.length === 0) {
        return commands;
    }

    // Case 1: Standard CLI arguments or single arg without spaces
    if (rawArgs.length > 1 || !rawArgs[0].includes(' ')) {
        const commandName = rawArgs[0];
        const commandArgs = rawArgs.slice(1).map(arg => {
            const first = arg.charAt(0);
            const last = arg.charAt(arg.length - 1);
            if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
                return arg.slice(1, -1);
            }
            return arg;
        });
        commands.push({ commandName, commandArgs });
        return commands;
    }

    // Case 2: Single string argument (debugger or quoted input)
    let inputLine = rawArgs[0].trim();
    const multiCommandRegex = /'([^']*)'|"([^"]*)"/g;
    let match;
    let lastIndex = 0;
    let foundMulti = false;

    while ((match = multiCommandRegex.exec(inputLine)) !== null) {
        if (match.index !== lastIndex) {
            foundMulti = false; break;
        }
        foundMulti = true;
        const commandLine = match[1] || match[2];
        const parts = commandLine.trim().split(/\s+/);
        if (parts.length > 0 && parts[0]) {
            commands.push({ commandName: parts[0], commandArgs: parts.slice(1) });
        }
        lastIndex = multiCommandRegex.lastIndex;
    }

    if (foundMulti && lastIndex === inputLine.length && commands.length > 0) {
        return commands;
    }

    // Case 3: Treat as single command line
    commands.length = 0;
    const first = inputLine.charAt(0);
    const last = inputLine.charAt(inputLine.length - 1);
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
        inputLine = inputLine.slice(1, -1);
    }
    const parts = inputLine.trim().split(/\s+/);
    if (parts.length > 0 && parts[0]) {
        commands.push({ commandName: parts[0], commandArgs: parts.slice(1) });
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
        let executionResult: any = undefined;
        let executionError: Error | undefined = undefined;

        for (const library of libraries) {
            if (hasOwnProperty(library, commandName) && typeof library[commandName] === 'function') {
                commandFound = true;
                try {
                    const func = library[commandName];
                    const argTypeDefs = func.__argTypes || [];
                    const processedArgs: any[] = [];
                    let commandArgIndex = 0;

                    const hasRestParameter = argTypeDefs.length > 0 && argTypeDefs[argTypeDefs.length - 1].type.endsWith('[]');
                    const expectedMinArgCount = hasRestParameter ? argTypeDefs.length - 1 : argTypeDefs.length;
                    const expectedMaxArgCount = hasRestParameter ? Infinity : argTypeDefs.length;

                    // Argument Count Validation
                    if (commandArgs.length < expectedMinArgCount || commandArgs.length > expectedMaxArgCount) {
                        let errorMsg = `Command '${commandName}' expects `;
                        if (expectedMinArgCount === expectedMaxArgCount) {
                            errorMsg += `exactly ${expectedMinArgCount}`;
                        } else {
                            errorMsg += `at least ${expectedMinArgCount}`;
                        }
                        errorMsg += ` arguments, but got ${commandArgs.length}.`;
                        throw new Error(errorMsg);
                    }

                    // Argument Parsing Loop
                    for (let i = 0; i < argTypeDefs.length; i++) {
                        const argDef = argTypeDefs[i];
                        const isLastArgDef = i === argTypeDefs.length - 1;
                        const isRest = isLastArgDef && hasRestParameter;

                        if (isRest) {
                            const remainingArgs = commandArgs.slice(commandArgIndex);
                            switch (argDef.type) {
                                case 'number[]': processedArgs.push(...parseStringsToNumbers(remainingArgs)); break;
                                case 'string[]': processedArgs.push(...remainingArgs); break;
                                case 'boolean[]': processedArgs.push(...parseStringsToBooleans(remainingArgs)); break;
                                default: throw new Error(`Internal error: Invalid rest parameter type '${argDef.type}' for ${commandName}`);
                            }
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
                    // Function Call
                    executionResult = func(...processedArgs);

                } catch (error: any) {
                    executionError = error instanceof Error ? error : new Error(String(error));
                }
                break; // Command found in this library
            }
        }

        if (!commandFound) {
            executionError = new Error(`Command '${commandName}' not found.`);
        }

        results.push({ command, result: executionResult, error: executionError });
    }
    return results;
} 