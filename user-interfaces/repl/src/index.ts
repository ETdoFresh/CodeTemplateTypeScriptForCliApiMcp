import readline from 'readline';

// Added new imports
import { parseCommandString } from '@system/command-parser/string-parser.js';
import { parseFunctionArguments } from '@system/command-parser/function-parser.js';
import { convertArgumentInstances, ConversionError, ConvertedArgumentValue } from '@system/command-parser/argument-converter.js'; // Added ConversionError, ConvertedArgumentValue
import { validateArguments } from '@system/command-parser/argument-validator.js';
import { FunctionDefinition, ArgumentInstance, RestArgumentInstance, ArgumentDefinition, LibraryDefinition } from '@system/command-types.js'; // Added ArgumentDefinition

// Updated type for libraries
export const runRepl = (libraries: LibraryDefinition[]) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  // Updated help message generation
  const availableCommands: { name: string; description: string }[] = [];
  libraries.forEach(library => {
      library.functions.forEach(funcDef => {
          availableCommands.push({
              name: funcDef.name,
              description: funcDef.description || 'No description available.'
          });
      });
  });

  console.log('Interactive REPL. Type "exit" or "quit" to leave.');
  console.log('Available commands:');
  availableCommands.forEach(cmd => {
      console.log(`  ${cmd.name}: ${cmd.description}`);
  });
  // Removed old note about named flags as parsing handles it differently now.
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
        // --- New Parsing Pipeline ---

        // 1. Parse the raw string
        const parsedStringResult = parseCommandString(trimmedLine);
        // No error check here, parseCommandString just structures the input
        const { positionalArgs, namedArgs } = parsedStringResult;

        if (positionalArgs.length === 0) {
            console.error("Error: Please enter a command.");
            rl.prompt();
            return;
        }

        // 2. Find Command Definition
        const commandName = positionalArgs[0];
        let funcDef: FunctionDefinition | undefined;
        for (const library of libraries) {
            funcDef = library.functions.find(lib => lib.name === commandName);
            if (funcDef) {
                break;
            }
        }

        if (!funcDef) {
            console.error(`Error: Command "${commandName}" not found.`);
            rl.prompt();
            return;
        }

        // Prepare args for function parser (remove command name)
        const commandPositionalArgs = positionalArgs.slice(1);
        const argsForFuncParser = { positionalArgs: commandPositionalArgs, namedArgs };

        // 3. Parse Function Arguments (match raw args to definition)
        const parsedFuncArgsResult = parseFunctionArguments(argsForFuncParser, funcDef);
        if (parsedFuncArgsResult.errors.length > 0) {
            parsedFuncArgsResult.errors.forEach((err: string) => console.error(`Argument Parsing Error: ${err}`));
            rl.prompt();
            return;
        }

        // Prepare for conversion and validation: Create a map of arg definitions
        const argDefsMap = new Map<string, ArgumentDefinition>();
        funcDef.arguments.forEach(def => argDefsMap.set(def.name, def));
        if (funcDef.restArgument) {
            argDefsMap.set(funcDef.restArgument.name, funcDef.restArgument); // Add rest arg def too if it exists
        }

        // 4. Convert Argument Instances (string -> actual type)
        const conversionResult = convertArgumentInstances(
            parsedFuncArgsResult.argumentInstances,
            parsedFuncArgsResult.restArgumentInstance,
            argDefsMap, // Pass the map
            funcDef.restArgument || null // Pass the rest definition or null
        );
        if (conversionResult.errors.length > 0) {
            conversionResult.errors.forEach((err: ConversionError) => console.error(`Argument Conversion Error (${err.argumentName}): ${err.message}`));
            rl.prompt();
            return;
        }

        // 5. Validate Arguments (check required args are present)
        const validationErrors = validateArguments(argDefsMap, conversionResult.convertedArguments);
        if (validationErrors.length > 0) {
            validationErrors.forEach((err: string) => console.error(`Argument Validation Error: ${err}`));
            rl.prompt();
            return;
        }

        // 6. Prepare Arguments for Execution (in correct order)
        const finalArgs: any[] = [];
        // Process regular arguments in defined order
        for (const argDef of funcDef.arguments) {
            let value = conversionResult.convertedArguments[argDef.name];
            if (value === undefined && argDef.defaultValue !== undefined) {
                value = argDef.defaultValue; // Use default value if not provided
            }
            finalArgs.push(value);
        }
        // Process rest argument if defined
        if (funcDef.restArgument) {
            const restValue = conversionResult.convertedArguments[funcDef.restArgument.name];
            if (Array.isArray(restValue)) {
                finalArgs.push(...restValue); // Spread the rest arguments
            }
            // If restValue is undefined/null but expected, it means no rest args were provided, which is fine.
            // If it's not an array, conversion should have caught it.
        }

        // 7. Execute Command
        try {
            // console.log(`Executing ${commandName} with args:`, finalArgs); // Optional debug log
            const result = await funcDef.function(...finalArgs);
            if (result !== undefined) {
                // Avoid printing null explicitly, treat it like undefined
                if (result !== null) {
                     console.log(result);
                }
            }
        } catch (executionError: any) {
            console.error(`Execution Error in command '${commandName}':`, executionError?.message || executionError);
        }

        // --- End New Parsing Pipeline ---

    } catch (error: any) {
         // Catch unexpected errors during the pipeline setup itself
         console.error("Internal REPL Error:", error.message);
    }

    rl.prompt();

  }).on('close', () => {
    console.log('Exiting REPL.');
    process.exit(0);
  });
};