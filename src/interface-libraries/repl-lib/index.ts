import readline from 'readline';
import { ZodFunction } from 'zod';
import { DefinedFunctionModule } from '../../utils/zod-function-utils.js'; // Import new type

import {
    processArgs,
    executeParsedCommands,
} from '../cli-lib/shared.js'; // Adjust path and add .js extension

export const runRepl = (libraries: DefinedFunctionModule[]) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  // Combine all available commands just for the help message
  const availableCommandNames = libraries.flatMap(lib => Object.keys(lib));

  console.log('Interactive CLI. Type "exit" or "quit" to leave.');
  console.log('Available commands:', availableCommandNames.join(', '));
  console.log('Note: Commands expecting options (like packLocal) use named flags, e.g., packLocal --directory /path --outputTarget file');
  rl.prompt();

  rl.on('line', async (line) => {
    const trimmedLine = line.trim();
    if (trimmedLine === 'exit' || trimmedLine === 'quit') {
      rl.close();
      return;
    }

    if (trimmedLine === '') {
        rl.prompt();
        return;
    }

    try {
        // Use processArgs to parse the single line of input
        const commandsToExecute = processArgs([trimmedLine]);

        if (commandsToExecute.length === 0 && trimmedLine) {
             console.error("Error: Invalid command input format.");
        } else if (commandsToExecute.length > 0) {
            // Execute the parsed commands
            const executionResults = executeParsedCommands(commandsToExecute, libraries);

            // Print results or errors for each command executed, handling Promises
            for (const res of executionResults) {
                if (res.error) {
                    console.error(`Error executing command '${res.command.commandName}':`, res.error.message);
                } else {
                    if (res.result !== undefined) {
                        if (typeof res.result?.then === 'function') {
                            // It's a Promise, await it
                            try {
                                const awaited = await res.result;
                                if (awaited !== undefined) {
                                    console.log(awaited);
                                }
                            } catch (err) {
                                console.error(`Error (async) in command '${res.command.commandName}':`, err?.message || err);
                            }
                        } else {
                            // Not a Promise, print directly
                            console.log(res.result);
                        }
                    }
                }
            }
        }
    } catch (error: any) {
         console.error("Error processing input:", error.message);
    }

    rl.prompt();

  }).on('close', () => {
    console.log('Exiting REPL.');
    process.exit(0);
  });
};