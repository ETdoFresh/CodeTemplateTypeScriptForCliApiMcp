// Import necessary components from the shared module
import { ZodFunction } from 'zod';
import {
    Command,
    processArgs,
    executeParsedCommands
} from './shared.js';

// --- CLI Entry Point ---
export const runCli = (libraries: Record<string, ZodFunction<any, any>>[]) => {
  // REVERT: Read process.argv directly
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