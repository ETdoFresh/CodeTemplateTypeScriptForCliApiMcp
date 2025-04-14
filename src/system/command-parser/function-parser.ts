import {
  ArgumentDefinition,
  RestArgumentDefinition,
  FunctionDefinition,
  ArgumentInstance,
  RestArgumentInstance
} from '../command-types';
import { ParsedCommand } from './string-parser';

/**
 * Represents the result of parsing function arguments against a definition.
 */
export interface ParsedFunctionArgumentsResult {
  /** Instances of matched arguments. */
  argumentInstances: ArgumentInstance[];
  /** Instance of the rest argument, if defined and matched. */
  restArgumentInstance: RestArgumentInstance | null;
  /** Any errors encountered during parsing. */
  errors: string[];
}

/**
 * Parses named and positional arguments based on a function definition.
 * Matches arguments from ParsedCommand against the expected arguments in FunctionDefinition.
 * Does NOT perform type conversion; values in instances are raw strings.
 *
 * Assumes the command name has already been removed from parsedArgs.positionalArgs.
 *
 * @param parsedArgs - The output from parseCommandString (positional and named args).
 * @param funcDef - The definition of the function/command to match against.
 * @returns An object containing matched argument instances and any parsing errors.
 */
export function parseFunctionArguments(
  parsedArgs: ParsedCommand,
  funcDef: FunctionDefinition
): ParsedFunctionArgumentsResult {
  const argumentInstances: ArgumentInstance[] = [];
  let restArgumentInstance: RestArgumentInstance | null = null;
  const errors: string[] = [];

  // Map to track which argument definitions have been fulfilled
  // Key: ArgumentDefinition, Value: boolean (true if fulfilled)
  const fulfilledArgs = new Map<ArgumentDefinition, boolean>();
  funcDef.arguments.forEach(argDef => fulfilledArgs.set(argDef, false));

  // --- 1. Named Argument Matching ---
  // Create a quick lookup map for named arguments (name/alias -> definition)
  const namedArgDefs = new Map<string, ArgumentDefinition>();
  // Populate the map using only the name
  funcDef.arguments.forEach(argDef => {
    namedArgDefs.set(argDef.name, argDef);
  });

  for (const name in parsedArgs.namedArgs) {
    if (parsedArgs.namedArgs.hasOwnProperty(name)) {
      const value = parsedArgs.namedArgs[name];
      const argDef = namedArgDefs.get(name);

      if (argDef) {
        // Check if this argument definition has already been fulfilled (e.g., by a positional arg)
        if (fulfilledArgs.get(argDef)) {
            errors.push(`Argument '${argDef.name}' provided more than once (likely positional and named).`);
            continue; // Skip this named arg if already fulfilled
        }

        // Check for multi-value mismatch: Array value provided for non-array definition
        // We infer array definition if type ends with '[]'
        const expectsArray = argDef.type.endsWith('[]');
        if (Array.isArray(value) && !expectsArray) {
          errors.push(`Named argument '${name}' was provided multiple times, but expected type '${argDef.type}' is not an array.`);
          // Decide how to handle: take last? error out? For now, we error and don't create an instance.
          continue; // Skip creating instance for this error case
        }

        // Create the instance by spreading the definition and adding the value
        const instance: ArgumentInstance = {
          ...argDef,
          value: value, // Use the raw value(s) - type conversion happens later
        };
        argumentInstances.push(instance);
        fulfilledArgs.set(argDef, true); // Mark as fulfilled
      } else {
        // Unknown named argument
        errors.push(`Unknown named argument: --${name}`);
      }
    }
  }

  // --- 2. Positional Argument Matching ---
  let currentPositionalIndex = 0;
  // Get only unfulfilled args definitions *at the start* of positional matching
  const availableArgDefs = funcDef.arguments.filter(def => !fulfilledArgs.get(def));
  let availableArgDefIndex = 0; // Index into the availableArgDefs array

  while (currentPositionalIndex < parsedArgs.positionalArgs.length) {
    const positionalValue = parsedArgs.positionalArgs[currentPositionalIndex];

    // Find the next available *positional* argument definition from the pre-filtered list
    let foundPositionalDef = false;
    if (availableArgDefIndex < availableArgDefs.length) {
        const argDef = availableArgDefs[availableArgDefIndex];
        // This definition is guaranteed to be unfulfilled by a named arg because of the filter above
        // Create the instance by spreading the definition and adding the value
        const instance: ArgumentInstance = {
            ...argDef,
            value: positionalValue, // Use raw string value
        };
        argumentInstances.push(instance);
        fulfilledArgs.set(argDef, true); // Mark as fulfilled in the main map
        availableArgDefIndex++; // Move to the next available definition for the next positional arg
        foundPositionalDef = true;
    }


    if (!foundPositionalDef) {
      // No more regular argument definitions available in our initial list
      if (funcDef.restArgument) {
        // Collect remaining positional args for the rest argument
        const restValues = parsedArgs.positionalArgs.slice(currentPositionalIndex);
        // Spread the definition and add the value. Add non-null assertion as restArgument is checked before.
        restArgumentInstance = {
          ...funcDef.restArgument!,
          value: restValues, // Use raw string values
        };
        // All remaining positionals consumed by rest arg
        currentPositionalIndex = parsedArgs.positionalArgs.length; // Set index to end loop
        break; // Exit the main positional loop
      } else {
        // No rest argument defined, and we have extra positional args
        errors.push(`Too many positional arguments provided. Unexpected argument: '${positionalValue}'`);
        // Continue processing remaining positionals only to report them as errors
      }
    }
    currentPositionalIndex++; // Move to the next positional argument
  }

  // --- 3. Rest Argument Creation (if defined but no positionals left for it) ---
  if (funcDef.restArgument && !restArgumentInstance) {
    // If a rest argument is defined but received no values, create an instance with an empty array.
    // Spread the definition and add the value. Add non-null assertion as restArgument is checked before.
    restArgumentInstance = {
      ...funcDef.restArgument!,
      value: [],
    };
  }

  // --- 4. Required Argument Check ---
  // Check all original definitions
  funcDef.arguments.forEach(argDef => {
    // Check the map to see if it was fulfilled either positionally or by name
    // Argument is required if optional is explicitly false or undefined/omitted
    if (!argDef.optional && !argDef.defaultValue && !fulfilledArgs.get(argDef)) {
      errors.push(`Missing required argument: '${argDef.name}'`);
    }
  });

  return {
    argumentInstances,
    restArgumentInstance,
    errors,
  };
}