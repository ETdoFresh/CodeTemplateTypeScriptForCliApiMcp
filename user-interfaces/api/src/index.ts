import http from 'http';
import url from 'url';
import type { IncomingMessage, ServerResponse } from 'http';
// REMOVE: Zod imports
// import { z, ZodFunction, ZodTuple, ZodTypeAny, ZodObject, ZodError } from 'zod';
// import { DefinedFunctionModule, DefinedFunction } from '../../utils/zod-function-utils.js';

// ADD: New system imports
import { convertArgumentInstances } from 'user-interfaces/cli-shared/command-parser/argument-converter.js';
import { validateArguments } from 'user-interfaces/cli-shared/command-parser/argument-validator.js';
import type {
    FunctionDefinition,
    LibraryDefinition,
    ArgumentDefinition,
    ArgumentInstance,
    RestArgumentInstance,
    RestArgumentDefinition // Added for clarity
    // ConversionResult and ValidationResult types are inferred from function returns
} from '@system/command-types.js';

// Helper to check if a property exists on an object (local copy)
function hasOwnProperty<X extends {}, Y extends PropertyKey>
  (obj: X, prop: Y): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

// REMOVE: buildApiInputSchema function (lines 15-71)


// Define the main request handler function separately
async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    libraries: LibraryDefinition[] // Array of modules, each containing FunctionDefinitions
) {
    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '';
    const commandName = pathname.substring(1); // Remove leading '/'

    // Set common headers (including CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(204); // No Content
        res.end();
        return;
    }

    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    await new Promise<void>((resolve) => req.on('end', resolve));

    // --- Find Command Definition ---
    let funcDef: FunctionDefinition | null = null;
    for (const library of libraries) { // Iterate through modules
        const found = library.functions.find(def => def.name === commandName);
        if (found) {
            funcDef = found;
            break;
        }
    }

    // If no function definition found, return 404
    if (!funcDef) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Command '${commandName}' not found.` }));
        return;
    }

    // --- Process Request ---
    try {
        // --- Extract Raw Input ---
        let rawInput: Record<string, any> = {};
        if (req.method === 'POST') {
            if (req.headers['content-type']?.includes('application/json') && body) {
                try {
                    rawInput = JSON.parse(body);
                    if (typeof rawInput !== 'object' || rawInput === null || Array.isArray(rawInput)) {
                        throw new Error('Request body must be a JSON object.');
                    }
                } catch (parseError: any) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `Invalid JSON in request body: ${parseError.message}` }));
                    return;
                }
            } else if (body) {
                 // POST but not JSON
                 res.writeHead(415, { 'Content-Type': 'application/json' }); // Unsupported Media Type
                 res.end(JSON.stringify({ error: `POST requests require 'Content-Type: application/json' header for non-empty bodies.` }));
                 return;
            } else {
                // POST with empty body - treat as empty input object
                rawInput = {};
            }
        } else if (req.method === 'GET') {
            rawInput = { ...parsedUrl.query }; // Clone query object
        } else {
            // Handle other methods like PUT, DELETE etc.
            res.writeHead(405, { 'Content-Type': 'application/json', 'Allow': 'GET, POST, OPTIONS' }); // Method Not Allowed
            res.end(JSON.stringify({ error: `Method ${req.method} not allowed.` }));
            return;
        }

        // --- Create Argument Instances from Input ---
        const regularInstances: ArgumentInstance[] = [];
        let restInstance: RestArgumentInstance | null = null;
        const unknownArgs: string[] = [];
        const argDefsMap = new Map<string, ArgumentDefinition>();
        funcDef.arguments.forEach(argDef => argDefsMap.set(argDef.name, argDef));
        const restArgDef = funcDef.restArgument || null; // Use null if undefined

        for (const inputKey in rawInput) {
            if (hasOwnProperty(rawInput, inputKey)) {
                const rawValue = rawInput[inputKey]; // Can be string | string[] (query) or any (JSON)

                // Check if it's the rest argument
                if (restArgDef && inputKey === restArgDef.name) {
                    const restValues = Array.isArray(rawValue) ? rawValue : [rawValue];
                    // Create RestArgumentInstance by spreading definition and adding value
                    restInstance = {
                        ...restArgDef, // Spread properties from definition
                        value: restValues // Use 'value' property as per type definition
                    };
                }
                // Check if it's a regular argument
                else if (argDefsMap.has(inputKey)) {
                    const argDef = argDefsMap.get(inputKey)!;
                    // Create ArgumentInstance by spreading definition and adding value
                    regularInstances.push({
                        ...argDef, // Spread properties from definition
                        value: rawValue // Use 'value' property as per type definition
                    });
                }
                // Otherwise, it's an unknown argument
                else {
                    unknownArgs.push(inputKey);
                }
            }
        }

        // Report unknown arguments as an error
        if (unknownArgs.length > 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Unknown arguments provided: ${unknownArgs.join(', ')}` }));
            return;
        }

        // --- Convert Arguments ---
        // Pass separated regular and rest instances, and the definitions map/object
        const conversionResult = convertArgumentInstances(regularInstances, restInstance, argDefsMap, restArgDef);

        // Check for conversion errors
        if (conversionResult.errors.length > 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            const errorDetails = conversionResult.errors.map(e => `'${e.argumentName}': ${e.message}`).join('; ');
            res.end(JSON.stringify({ error: `Argument conversion failed. ${errorDetails}` }));
            return;
        }

        // --- Validate Arguments ---
        // Pass the definitions map and the record of converted arguments
        const validationErrors = validateArguments(argDefsMap, conversionResult.convertedArguments);

        // Check for validation errors
        if (validationErrors.length > 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            const errorDetails = validationErrors.join('; ');
            res.end(JSON.stringify({ error: `Argument validation failed. ${errorDetails}` }));
            return;
        }

        // --- Prepare Final Arguments for Function Call ---
        const finalCallArgs: any[] = [];
        const convertedArgs = conversionResult.convertedArguments;

        funcDef.arguments.forEach(argDef => {
            // Get converted value or use default value if defined and value is missing
            let value = convertedArgs[argDef.name];
            if (value === undefined && argDef.defaultValue !== undefined) {
                value = argDef.defaultValue;
            }
            finalCallArgs.push(value);
        });

        if (funcDef.restArgument) {
            // Get converted rest values (already an array or undefined)
            const restValues = convertedArgs[funcDef.restArgument.name] as any[] | undefined;
            if (restValues) { // Only spread if rest args were provided and converted
                finalCallArgs.push(...restValues);
            }
            // If rest arg is optional and not provided, convertedArgs won't have it, and nothing is pushed.
        }

        // --- Execute Command ---
        const result = funcDef.function(...finalCallArgs);

        // Handle potential promise result
        const finalResult = (result instanceof Promise) ? await result : result;

        // --- Send Success Response ---
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result: finalResult }));

    } catch (error: any) {
        // --- Handle Execution Errors & Unexpected Handler Errors ---
        let errorMessage = 'Internal server error during command execution.';
        let statusCode = 500; // Default Internal Server Error

        if (error instanceof Error) {
            errorMessage = error.message;
            // Potentially check for specific error types thrown by commands
        } else {
            errorMessage = String(error);
        }

        console.error(`[API Execution Error] Command: ${commandName}, Status: ${statusCode}, Message: ${errorMessage}`, error); // Log the full error stack
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: errorMessage }));
    }
}

// --- API Server Entry Point ---

export function runApi(
    // UPDATE: Type to use FunctionDefinition[]
    libraries: LibraryDefinition[], // Assuming libraries is an array of modules
    port: number = 3000
) {
    // Pass the async handler function to createServer
    const server = http.createServer((req, res) => handleRequest(req, res, libraries));

    server.listen(port, () => {
        console.log(`API server listening on http://localhost:${port}`);
        console.log('Available command endpoints (GET examples shown, POST with JSON body preferred):');

        // Iterate through libraries (modules) and FunctionDefinitions
        libraries.forEach(library => {
            library.functions.forEach(funcDef => { // Correct: Iterate through library.functions
                const commandName = funcDef.name;
                let queryStringExample = '';
                const paramDetails: string[] = [];

                try {
                    // Fixed args
                    funcDef.arguments.forEach(argDef => {
                        const name = argDef.name;
                        const typeName = argDef.type; // Use type directly from definition
                        const isOptional = argDef.optional || false; // Check optional flag
                        paramDetails.push(`${name}${isOptional ? '?' : ''}: ${typeName}`);

                        // Basic example values for query string
                        let exampleValue = 'value';
                        if (typeName === 'number') exampleValue = '123';
                        if (typeName === 'boolean') exampleValue = 'true';
                        // Represent arrays simply for query example
                        if (typeName.endsWith('[]')) {
                             // Example for array query param: /cmd?list=a&list=b
                             exampleValue = `value1&${encodeURIComponent(name)}=value2`;
                        }


                        // Only add non-optional args to basic query string example
                        if (!isOptional) {
                            // Handle array example value correctly
                            if (typeName.endsWith('[]')) {
                                queryStringExample += `${queryStringExample ? '&' : '?'}${encodeURIComponent(name)}=value1&${encodeURIComponent(name)}=value2`;
                            } else {
                                queryStringExample += `${queryStringExample ? '&' : '?'}${encodeURIComponent(name)}=${exampleValue}`;
                            }
                        }
                    });

                    // Rest arg
                    if (funcDef.restArgument) {
                        const restDef = funcDef.restArgument;
                        const name = restDef.name;
                        const elementTypeName = restDef.type; // Type of elements in the rest array
                        paramDetails.push(`...${name}: ${elementTypeName}[]`);
                        // Append rest args example - API often uses repeated param name
                        queryStringExample += `${queryStringExample ? '&' : '?'}${encodeURIComponent(name)}=value1&${encodeURIComponent(name)}=value2`;
                    }

                    console.log(`  /${commandName}${queryStringExample || ''}`);
                    if (paramDetails.length > 0) {
                        console.log(`    Parameters: ${paramDetails.join(', ')}`);
                    }
                    if (funcDef.description) {
                        console.log(`    Description: ${funcDef.description}`);
                    } else {
                         console.log(`    Description: (No description provided)`);
                    }
                } catch (docError: any) {
                     console.log(`  /${commandName} - Error generating documentation: ${docError.message}`);
                }
            });
        });
        console.log('Note: For POST requests, send arguments as a JSON object in the request body.');
        // REMOVED: Coercion note, handled by converter/validator now.
    });
}
