// src/system/command-parser/argument-converter.ts

import {
    ArgumentDefinition,
    ArgumentInstance,
    ArgumentType, // Now exported from command-types
    RestArgumentInstance,
    // ConvertedArgumentValue, // Define locally
    // ConversionError, // Define locally
} from '../command-types';

// --- Locally Defined Types for Conversion ---

/** Represents the successfully converted value of an argument. */
export type ConvertedArgumentValue = string | number | boolean | string[] | number[] | boolean[];

/** Represents an error that occurred during argument value conversion. */
export interface ConversionError {
    argumentName: string;
    rawValue: string | string[];
    targetType: ArgumentType | 'unknown';
    message: string;
}

// --- Conversion Logic ---

/**
 * Converts a single string value to the target primitive type (string, number, boolean).
 * Throws an error if conversion fails.
 * @param value The string value to convert.
 * @param targetType The target primitive type ('string', 'number', 'boolean').
 * @param argumentName The name of the argument for error messages.
 * @returns The converted value.
 * @throws {Error} If conversion fails (e.g., invalid number, unrecognized boolean).
 */
function convertSingleValue(value: string, targetType: 'string' | 'number' | 'boolean', argumentName: string): string | number | boolean {
    switch (targetType) {
        case 'string':
            return value;
        case 'number':
            // Use Number() for stricter parsing than parseFloat
            const num = Number(value);
            if (isNaN(num)) {
                throw new Error(`Argument "${argumentName}": Cannot convert value "${value}" to a number.`);
            }
            return num;
        case 'boolean':
            const lowerValue = value.toLowerCase();
            if (lowerValue === 'true' || lowerValue === '1') {
                return true;
            }
            if (lowerValue === 'false' || lowerValue === '0') {
                return false;
            }
            throw new Error(`Argument "${argumentName}": Cannot convert value "${value}" to a boolean. Use 'true', 'false', '1', or '0'.`);
        default:
            // Should not happen with correct type checks, but good for safety
            throw new Error(`Argument "${argumentName}": Unsupported primitive target type "${targetType}" for single value conversion.`);
    }
}

/**
 * Converts the raw string value(s) of an argument instance to the specified target type.
 * Handles both single values and arrays. Throws errors for invalid conversions.
 *
 * @param value The raw value (string or string[]) from ArgumentInstance or RestArgumentInstance.
 * @param targetType The target type string (e.g., "string", "number[]") from ArgumentDefinition.
 * @param argumentName The name of the argument (for error messages).
 * @returns The converted value matching the targetType.
 * @throws {Error} If conversion fails or types are incompatible (e.g., array value for non-array type).
 */
export function convertArgumentValue(
    value: string | string[],
    targetType: ArgumentType,
    argumentName: string
): ConvertedArgumentValue {
    const isArrayTarget = targetType.endsWith('[]');
    const baseType = isArrayTarget ? targetType.slice(0, -2) as 'string' | 'number' | 'boolean' : targetType as 'string' | 'number' | 'boolean';

    if (isArrayTarget) {
        // --- Handle Array Types ---
        const valuesToConvert = Array.isArray(value) ? value : [value]; // Ensure we always have an array to iterate

        // Convert each element
        const convertedArray = valuesToConvert.map(singleVal => {
            // Re-use single value conversion logic
            return convertSingleValue(singleVal, baseType, `${argumentName}[] element`);
        });

        // Type assertion based on baseType - TypeScript needs help here
        if (baseType === 'string') return convertedArray as string[];
        if (baseType === 'number') return convertedArray as number[];
        if (baseType === 'boolean') return convertedArray as boolean[];
        // Should not be reached due to baseType check, but satisfies compiler
        throw new Error(`Argument "${argumentName}": Unexpected base type "${baseType}" for array conversion.`);

    } else {
        // --- Handle Primitive Types ---
        if (Array.isArray(value)) {
            // This indicates a potential logic error upstream (e.g., parser assigned array to non-rest/non-array arg)
            throw new Error(`Argument "${argumentName}": Received array value ["${value.join('", "')}"] for non-array target type "${targetType}".`);
        }
        // Convert the single string value
        return convertSingleValue(value, baseType, argumentName);
    }
}

/**
 * Result structure for converting multiple argument instances.
 */
export interface ConversionResult {
    convertedArguments: Record<string, ConvertedArgumentValue>; // Map argument name to converted value
    errors: ConversionError[];
}

/**
 * Converts an array of ArgumentInstances and an optional RestArgumentInstance
 * to their correct types based on their definitions. Collects conversion errors.
 *
 * @param args The array of ArgumentInstance objects from the function parser.
 * @param restArg The optional RestArgumentInstance object from the function parser.
 * @param argDefs A map of argument names to their ArgumentDefinition.
 * @param restArgDef The optional ArgumentDefinition for the rest argument.
 * @returns An object containing the converted argument values and any errors encountered.
 */
export function convertArgumentInstances(
    args: ArgumentInstance[],
    restArg: RestArgumentInstance | null,
    argDefs: Map<string, ArgumentDefinition>,
    restArgDef: ArgumentDefinition | null
): ConversionResult {
    const result: ConversionResult = {
        convertedArguments: {},
        errors: [],
    };

    // Convert regular arguments
    for (const instance of args) {
        const definition = argDefs.get(instance.name);
        if (!definition) {
            // Should not happen if parser and definitions are correct
            result.errors.push({
                argumentName: instance.name,
                rawValue: instance.value,
                targetType: 'unknown', // We don't know the target type
                message: `Definition not found for argument "${instance.name}".`,
            });
            continue;
        }

        try {
            const convertedValue = convertArgumentValue(instance.value, definition.type, instance.name);
            result.convertedArguments[instance.name] = convertedValue;
        } catch (error: any) {
            result.errors.push({
                argumentName: instance.name,
                rawValue: instance.value,
                targetType: definition.type,
                message: error.message || `Failed to convert argument "${instance.name}" to type "${definition.type}".`,
            });
        }
    }

    // Convert rest argument
    if (restArg && restArgDef) {
        try {
            // Rest argument value is always string[] from the parser
            // Rest argument definition type must be an array type
            if (!restArgDef.type.endsWith('[]')) {
                 throw new Error(`Rest argument "${restArgDef.name}" definition must have an array type (e.g., "string[]", "number[]"), but found "${restArgDef.type}".`);
            }
            const convertedValue = convertArgumentValue(restArg.value, restArgDef.type, restArgDef.name); // Use .value
            result.convertedArguments[restArgDef.name] = convertedValue;
        } catch (error: any) {
            result.errors.push({
                argumentName: restArgDef.name,
                rawValue: restArg.value, // Use .value
                targetType: restArgDef.type,
                message: error.message || `Failed to convert rest argument "${restArgDef.name}" to type "${restArgDef.type}".`,
            });
        }
    } else if (restArg && !restArgDef) {
         result.errors.push({
            argumentName: '(rest argument)',
            rawValue: restArg.value, // Use .value
            targetType: 'unknown',
            message: `Rest argument values provided ["${restArg.value.join('", "')}"] but no rest argument definition found.`, // Use .value
        });
    }


    return result;
}