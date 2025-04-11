// Move libraries definition outside

// Type guard to check if a key exists on an object
function hasOwnProperty<X extends {}, Y extends PropertyKey>
  (obj: X, prop: Y): obj is X & Record<Y, unknown> {
  return obj.hasOwnProperty(prop);
}

// Modify runCli to accept libraries and export it
export function runCli(libraries: Record<string, Function>[]) {
  const args = process.argv.slice(2); // Remove 'node' and script path

  if (args.length < 1) {
    console.error('Usage: <command> [arguments...]');
    // Update error message to use passed-in libraries
    const availableCommands = libraries.flatMap(lib => Object.keys(lib)).join(', ');
    console.error('Available commands:', availableCommands);
    process.exit(1);
  }

  const commandName = args[0];
  const commandArgs = args.slice(1).map(arg => {
    const num = parseFloat(arg);
    if (isNaN(num)) {
      console.error(`Error: Argument '${arg}' is not a valid number.`);
      process.exit(1);
    }
    return num;
  });

  for (const library of libraries) {
    if (hasOwnProperty(library, commandName) && typeof library[commandName] === 'function') {
      try {
        const func = library[commandName] as (...args: number[]) => number; // Type assertion
        const result = func(...commandArgs);
        console.log(result);
        process.exit(0); // Exit successfully after execution
      } catch (error) {
        if (error instanceof Error) {
          console.error(`Error executing command '${commandName}':`, error.message);
        } else {
          console.error(`An unknown error occurred executing command '${commandName}'.`);
        }
        process.exit(1);
      }
    }
  }
  console.error(`Error: Command '${commandName}' not found.`);
  // Collect command names from all libraries
  const availableCommands = libraries.flatMap(lib => Object.keys(lib)).join(', ');
  console.error('Available commands:', availableCommands);
  process.exit(1);
}