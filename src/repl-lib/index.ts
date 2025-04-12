import readline from 'readline';

// Import shared components from cli-lib
import {
    LibraryFunction,
    processArgs,
    executeParsedCommands,
    Command, // Import Command if needed for ExecutionResult typing below (optional)
    ExecutionResult // Import ExecutionResult if needed for typing below (optional)
} from '../cli-lib/shared.js'; // Adjust path and add .js extension

// Keep type guard if needed
function hasOwnProperty<X extends {}, Y extends PropertyKey>
  (obj: X, prop: Y): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}


export const runRepl = (libraries: Record<string, LibraryFunction>[]) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  // Combine all available commands just for the help message
  const availableCommandNames = libraries.flatMap(lib => Object.keys(lib));

  console.log('Interactive CLI. Type "exit" or "quit" to leave.');
  console.log('Available commands:', availableCommandNames.join(', '));
  rl.prompt();

  rl.on('line', (line) => {
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

            // Print results or errors for each command executed
            executionResults.forEach(res => {
                // Remove debug logs
                // console.error("DEBUG REPL: Result object:", JSON.stringify(res, null, 2)); 
                // console.error("DEBUG REPL: res.result value:", res.result);
                
                if (res.error) {
                    console.error(`Error executing command '${res.command.commandName}':`, res.error.message);
                } else {
                    if (res.result !== undefined) {
                        console.log(res.result);
                    }
                }
            });
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