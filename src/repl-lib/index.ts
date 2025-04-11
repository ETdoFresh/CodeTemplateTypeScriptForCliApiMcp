import readline from 'readline';

// Type guard to check if a key exists on an object
function hasOwnProperty<X extends {}, Y extends PropertyKey>
  (obj: X, prop: Y): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

type LibraryFunction = (...args: string[]) => any;

export const runRepl = (libraries: Record<string, LibraryFunction>[]) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  // Combine all available commands for help message and lookup
  const allCommands: Record<string, LibraryFunction> = {};
    const availableCommandNames: string[] = [];
    libraries.forEach(lib => {
        for (const commandName in lib) {
            if (hasOwnProperty(lib, commandName)) {
                allCommands[commandName] = lib[commandName];
                availableCommandNames.push(commandName);
            }
        }
    });

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

    const parts = trimmedLine.split(/\s+/); // Split by whitespace
    const commandName = parts[0];
    const commandArgs = parts.slice(1);

    if (hasOwnProperty(allCommands, commandName)) {
      try {
        const func = allCommands[commandName];
        const result = func(...commandArgs);
        console.log(result);
      } catch (error) {
        if (error instanceof Error) {
          console.error(`Error executing command '${commandName}':`, error.message);
        } else {
          console.error(`An unknown error occurred executing command '${commandName}'.`);
        }
      }
    } else {
      console.error(`Error: Command '${commandName}' not found.`);
      console.error('Available commands:', availableCommandNames.join(', '));
    }

    rl.prompt();
  }).on('close', () => {
    console.log('Exiting CLI.');
    process.exit(0);
  });
}; 