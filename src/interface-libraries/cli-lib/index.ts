import { FunctionDefinition, ArgumentDefinition } from '../../system/command-types.js';
import { parseCommandString } from '../../system/command-parser/string-parser.js';
import { parseFunctionArguments } from '../../system/command-parser/function-parser.js';
import { convertArgumentInstances } from '../../system/command-parser/argument-converter.js';
import { validateArguments } from '../../system/command-parser/argument-validator.js';
// import { formatValidationErrors } from '../../utils/error-formatting.js'; // This doesn't exist yet

// --- CLI Entry Point ---
export const runCli = async (libraries: FunctionDefinition[]) => {
    const rawArgs = process.argv.slice(2); // Get args after node executable and script path

    if (rawArgs.length === 0) {
        console.error("Error: No command specified.");
        // TODO: Implement a proper help message display here, maybe list available commands?
        console.error("\nUsage: <command> [arguments...]");
        process.exit(1);
    }

    // Combine args into a single string for the string parser
    const commandString = rawArgs.join(' ');

    // 1. Parse the raw command string into positional and named args
    const parsedArgs = parseCommandString(commandString);

    // The first positional arg is the command name
    const commandName = parsedArgs.positionalArgs[0];
    const actualPositionalArgs = parsedArgs.positionalArgs.slice(1); // Remove command name for function parsing
    const actualNamedArgs = parsedArgs.namedArgs;

    // Create a modified ParsedCommand object without the command name in positionalArgs
    const argsForFunctionParser = {
        positionalArgs: actualPositionalArgs,
        namedArgs: actualNamedArgs
    };


    // 2. Find the command definition
    const funcDef = libraries.find(f => f.name === commandName); // Find by name

    if (!funcDef) {
        console.error(`Error: Command not found: ${commandName}`);
        // TODO: Suggest similar commands? List available commands?
        process.exit(1);
    }

    // 3. Parse function arguments based on the definition
    // Pass the modified parsedArgs (without command name) and the function definition
    const funcArgParseResult = parseFunctionArguments(argsForFunctionParser, funcDef);
    if (funcArgParseResult.errors.length > 0) {
        console.error(`Error parsing arguments for command "${commandName}":`);
        funcArgParseResult.errors.forEach(err => console.error(`  - ${err}`));
        process.exit(1);
    }

    // Prepare definitions map for converter and validator
    const argDefsMap = new Map<string, ArgumentDefinition>();
    funcDef.arguments.forEach(def => argDefsMap.set(def.name, def));
    // Also add rest argument definition if it exists
    if (funcDef.restArgument) {
        argDefsMap.set(funcDef.restArgument.name, funcDef.restArgument);
    }


    // 4. Convert argument instances to their target types
    const conversionResult = convertArgumentInstances(
        funcArgParseResult.argumentInstances,
        funcArgParseResult.restArgumentInstance,
        argDefsMap, // Pass the map
        funcDef.restArgument || null // Pass the rest definition or null
    );
    if (conversionResult.errors.length > 0) {
        console.error(`Error converting arguments for command "${commandName}":`);
        conversionResult.errors.forEach(err => {
            console.error(`  - Argument "${err.argumentName}": ${err.message} (value: ${JSON.stringify(err.rawValue)})`);
        });
        process.exit(1);
    }

    // 5. Validate arguments (e.g., check for missing required args)
    const validationErrors = validateArguments(argDefsMap, conversionResult.convertedArguments);
    if (validationErrors.length > 0) {
        console.error(`Error validating arguments for command "${commandName}":`);
        validationErrors.forEach(err => console.error(`  - ${err}`));
        process.exit(1);
    }

    // 6. Execute the command
    try {
        // Prepare arguments in the order expected by the function definition
        const finalArgs: any[] = [];
        for (const argDef of funcDef.arguments) {
            let value = conversionResult.convertedArguments[argDef.name];
            // Use default value if the argument wasn't provided and a default exists
            if (value === undefined && argDef.defaultValue !== undefined) {
                value = argDef.defaultValue;
            }
            finalArgs.push(value);
        }

        // Add rest argument values if the definition exists and values were converted
        if (funcDef.restArgument) {
            const restValue = conversionResult.convertedArguments[funcDef.restArgument.name];
            if (Array.isArray(restValue)) {
                 // Spread the rest arguments at the end
                finalArgs.push(...restValue);
            } else if (restValue !== undefined) {
                // Handle non-array rest value? Log warning or error? For now, push it.
                console.warn(`Warning: Rest argument "${funcDef.restArgument.name}" converted to non-array value: ${restValue}`);
                finalArgs.push(restValue);
            }
            // If restValue is undefined, nothing is added, which is correct.
        }

        // Execute the function with the prepared arguments
        const result = await funcDef.function(...finalArgs);

        // Print result to stdout
        if (result !== undefined && result !== null) {
             if (typeof result === 'object') {
                 // Pretty print objects/arrays
                 process.stdout.write(JSON.stringify(result, null, 2) + '\n');
             } else {
                 process.stdout.write(String(result) + '\n');
             }
        }
        // Success, exit code 0 (implicitly)
    } catch (executionError: any) {
        console.error(`Error executing command "${commandName}":`);
        console.error(executionError instanceof Error ? executionError.message : String(executionError));
        // Optionally print stack trace for debugging: console.error(executionError.stack);
        process.exit(1);
    }
};