/**
 * Represents the result of parsing a command string.
 */
export interface ParsedCommand {
  /**
   * An array of strings representing the positional arguments.
   * The first element is typically the command name itself.
   */
  positionalArgs: string[];
  /**
   * An object (Record) where keys are the argument names (without '--')
   * and values are either a string or an array of strings (for repeated flags).
   */
  namedArgs: Record<string, string | string[]>;
}

/**
 * Helper function to add a value to the named arguments object.
 * Handles converting single values to arrays when a flag is repeated.
 * @param args - The named arguments object being built.
 * @param name - The name of the argument (without '--').
 * @param value - The value of the argument.
 */
function addToNamedArgs(args: Record<string, string | string[]>, name: string, value: string): void {
  if (args.hasOwnProperty(name)) {
    const existing = args[name];
    if (Array.isArray(existing)) {
      // Already an array, push the new value
      existing.push(value);
    } else {
      // Convert to array if it's the second time seeing this flag
      args[name] = [existing, value];
    }
  } else {
    // First time seeing this flag, add as a single string
    args[name] = value;
  }
}

/**
 * Parses a raw command string into positional and named arguments.
 *
 * Handles:
 * - Splitting arguments by whitespace.
 * - Recognizing named arguments starting with '--'.
 * - '--flag value' format.
 * - '--flag=value' format.
 * - Single ('') and double ("") quotes, treating quoted content as a single argument
 *   and removing the quotes from the final value.
 * - Repeated named arguments (collects values into an array).
 * - The first token is always treated as a positional argument (the command name).
 *
 * @param commandString - The raw command line input string.
 * @returns An object containing arrays of positional and named arguments.
 */
export function parseCommandString(commandString: string): ParsedCommand {
  const positionalArgs: string[] = [];
  const namedArgs: Record<string, string | string[]> = {};

  // Trim leading/trailing whitespace
  const trimmedInput = commandString.trim();
  if (!trimmedInput) {
    return { positionalArgs, namedArgs }; // Return empty if input is empty
  }

  // Regex to split the string by spaces, respecting quotes (single and double)
  // It matches sequences of non-space/non-quote characters, or quoted strings.
  // It handles escaped quotes within quoted strings.
  const argRegex = /(?:[^\s"']+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')+/g;
  const tokens = trimmedInput.match(argRegex) || [];

  let i = 0;
  while (i < tokens.length) {
    let token = tokens[i];

    // Remove surrounding quotes (if any) and handle escaped quotes within
    // Note: This simple replace might not perfectly handle all escaped quote scenarios
    // inside the string, but covers basic cases like "hello\"world".
    // The regex already helps by capturing the content correctly.
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
        token = token.substring(1, token.length - 1).replace(/\\(['"])/g, '$1'); // Remove outer quotes and unescape inner ones
    }


    if (token.startsWith('--')) {
      const equalsIndex = token.indexOf('=');

      if (equalsIndex !== -1) {
        // Format: --name=value
        const name = token.substring(2, equalsIndex);
        let value = token.substring(equalsIndex + 1);

        // Remove potential quotes around the value part in --name="value"
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.substring(1, value.length - 1).replace(/\\(['"])/g, '$1');
        }

        if (name) { // Ensure name is not empty (e.g., '--=value')
            addToNamedArgs(namedArgs, name, value);
        } else {
             // Treat '--=value' as positional? Or ignore? Let's treat the original token as positional.
             positionalArgs.push(tokens[i]); // Add the original token "--=value"
        }
        i++;
      } else {
        // Format: --name value OR --booleanflag
        const name = token.substring(2);
        const nextToken = tokens[i + 1];

        if (name && nextToken && !nextToken.startsWith('--')) {
          // Format: --name value
          let value = nextToken;
           // Remove surrounding quotes from the value token
           if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
               value = value.substring(1, value.length - 1).replace(/\\(['"])/g, '$1');
           }
          addToNamedArgs(namedArgs, name, value);
          i += 2; // Consume both '--name' and 'value' tokens
        } else {
          // It's either a boolean flag (--flag followed by nothing or another --flag)
          // Or an invalid name (-- followed by nothing)
          // Based on examples, flags seem to require values.
          // Let's treat flags without values as positional arguments for now.
          // This handles cases like `command --flagonly arg` -> positional: ["command", "--flagonly", "arg"]
           if (name) { // Treat as boolean flag if name exists
               addToNamedArgs(namedArgs, name, "true"); // Assign true if it's just a flag
           } else { // Handle case like just '--'
               positionalArgs.push(token);
           }
          i++;
        }
      }
    } else {
      // It's a positional argument
      positionalArgs.push(token);
      i++;
    }
  }

  return { positionalArgs, namedArgs };
}