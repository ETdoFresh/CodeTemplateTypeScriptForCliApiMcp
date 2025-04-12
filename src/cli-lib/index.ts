// Type guard to check if a key exists on an object
function hasOwnProperty<X extends {}, Y extends PropertyKey>
  (obj: X, prop: Y): obj is X & Record<Y, unknown> {
  return obj.hasOwnProperty(prop);
}

// --- Local Type Definitions ---
// Define the basic structure for library functions
// type LibraryFunction = ((...args: any[]) => any) & { __argTypes?: ArgInfo[] };

// Define supported argument types for metadata
// type ArgType = 'boolean' | 'boolean[]' | 'string' | 'string[]' | 'number' | 'number[]';

// interface ArgInfo {
//     name: string;
//     type: ArgType;
// }

// Removed CommandMetadata interface

// --- Helper Functions ---

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

// Helper for boolean parsing
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

// --- Argument Processing Logic ---
// interface Command {
//     commandName: string;
//     commandArgs: string[];
// }

// function processArgs(rawArgs: string[]): Command[] {
//     const commands: Command[] = [];

//     if (rawArgs.length === 0) {
//         return commands;
//     }

//     // Case 1: Standard CLI arguments or single arg without spaces
//     if (rawArgs.length > 1 || !rawArgs[0].includes(' ')) {
//          const commandName = rawArgs[0];
//          const commandArgs = rawArgs.slice(1).map(arg => {
//             const first = arg.charAt(0);
//             const last = arg.charAt(arg.length - 1);
//             if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
//                 return arg.slice(1, -1);
//             }
//             return arg;
//         });
//         commands.push({ commandName, commandArgs });
//         return commands;
//     }

//     // Case 2: Single string argument (debugger or quoted input)
//     let inputLine = rawArgs[0].trim();
//     const multiCommandRegex = /'([^']*)'|"([^"]*)"/g;
//     let match;
//     let lastIndex = 0;
//     let foundMulti = false;

//     while ((match = multiCommandRegex.exec(inputLine)) !== null) {
//         if (match.index !== lastIndex) {
//              foundMulti = false; break;
//         }
//         foundMulti = true;
//         const commandLine = match[1] || match[2];
//         const parts = commandLine.trim().split(/\s+/);
//         if (parts.length > 0 && parts[0]) {
//              commands.push({ commandName: parts[0], commandArgs: parts.slice(1) });
//         }
//         lastIndex = multiCommandRegex.lastIndex;
//     }

//     if (foundMulti && lastIndex === inputLine.length && commands.length > 0) {
//         return commands;
//     }

//     // Case 3: Treat as single command line
//     commands.length = 0;
//     const first = inputLine.charAt(0);
//     const last = inputLine.charAt(inputLine.length - 1);
//     if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
//         inputLine = inputLine.slice(1, -1);
//     }
//     const parts = inputLine.trim().split(/\s+/);
//     if (parts.length > 0 && parts[0]) {
//          commands.push({ commandName: parts[0], commandArgs: parts.slice(1) });
//     }
//     return commands;
// }

// --- Refactored runCli --- 

// Import necessary components from the shared module
import {
    LibraryFunction,
    Command,
    processArgs,
    executeParsedCommands
} from './shared.js';

// --- CLI Entry Point ---
export const runCli = (libraries: Record<string, LibraryFunction>[]) => {
  const rawArgs = process.argv.slice(2);
  let commands: Command[];

  try {
      commands = processArgs(rawArgs);
  } catch (error: any) {
       console.error("Error processing arguments:", error.message);
       process.exit(1);
  }

  if (commands.length === 0 && rawArgs.length > 0) {
      console.error('Error: Invalid command input format.');
      process.exit(1);
  } else if (commands.length === 0) {
       console.error('Usage: <command> [arguments...] or \'command args\' or \'"command args"\'');
       const availableCommands = libraries.flatMap(lib => Object.keys(lib)).join(', ');
       console.error('Available commands:', availableCommands);
       process.exit(1);
  }

  const executionResults = executeParsedCommands(commands, libraries);
  let overallExitCode = 0;

  for (const res of executionResults) {
      if (res.error) {
          // Use console.error for errors
          console.error(`Error executing command '${res.command.commandName}':`, res.error.message);
          overallExitCode = 1;
      } else {
          // Use console.log for successful results
          console.log(res.result);
      }
  }

  process.exit(overallExitCode);
};