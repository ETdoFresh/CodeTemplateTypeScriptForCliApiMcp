// src/system/command-parser/argument-validator.ts

import { ArgumentDefinition } from '../../../library-core/types';
import { ConvertedArgumentValue } from './argument-converter'; // Assuming ConvertedArgumentValue is exported

/**
 * Validates the provided converted arguments against their definitions,
 * specifically checking for missing required arguments that don't have a default value.
 *
 * @param argDefs A map of argument names to their full ArgumentDefinition.
 * @param convertedArgs A record mapping argument names to their converted values (or undefined if not provided/converted).
 * @returns An array of validation error messages. An empty array indicates success.
 */
export function validateArguments(
    argDefs: Map<string, ArgumentDefinition>,
    convertedArgs: Record<string, ConvertedArgumentValue | undefined>
): string[] {
    const errors: string[] = [];

    // Iterate through all defined arguments
    for (const [name, definition] of argDefs.entries()) {
        // Check if the argument is required AND does not have a default value
        // Argument is required if optional is explicitly false or undefined/omitted
        if (!definition.optional && definition.defaultValue === undefined) {
            const value = convertedArgs[name];

            // Check if the value is missing (undefined or null) after conversion
            if (value === undefined || value === null) {
                errors.push(`Missing required argument: ${name}`);
            }
        }
    }

    // Note: Validation for rest arguments' presence/type is handled earlier
    // Note: Value-specific validation (e.g., ranges, patterns) is not implemented here.

    return errors;
}