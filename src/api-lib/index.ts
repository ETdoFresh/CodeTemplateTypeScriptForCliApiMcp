import http from 'http';
import url from 'url';
import type { IncomingMessage, ServerResponse } from 'http';
// Import Zod and necessary types
import { z, ZodFunction, ZodTuple, ZodTypeAny, ZodObject, ZodError } from 'zod';

// Helper to check if a property exists on an object (local copy)
function hasOwnProperty<X extends {}, Y extends PropertyKey>
  (obj: X, prop: Y): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

// Helper to create the Zod object schema for API input (handles coercion for query params)
function buildApiInputSchema(zodFunc: ZodFunction<any, any>, coerceQueryStrings: boolean): {
    schema: ZodObject<any, any, any, any, any>; // Use broader types for ZodObject generics
    argNames: string[];
    restArgName?: string;
} {
    const argTupleSchema = zodFunc._def.args as ZodTuple<any, any>;
    let shape: Record<string, ZodTypeAny> = {};
    let argNames: string[] = [];
    let restArgName: string | undefined;

    const coerceIfNeeded = (schema: ZodTypeAny): ZodTypeAny => {
        if (!coerceQueryStrings) return schema;
        // Apply coercion for primitive types expected from query strings
        if (schema instanceof z.ZodNumber) return z.coerce.number({
            invalid_type_error: `Expected number, received string for query parameter`
        });
        if (schema instanceof z.ZodBoolean) return z.coerce.boolean({
            invalid_type_error: `Expected boolean, received string for query parameter`
        });
        // Coercion for arrays needs careful handling as query params can be string or string[]
        // We handle array normalization *before* parsing, so direct coercion isn't applied here.
        return schema; // Return original for strings, arrays, objects etc.
    };

    // Process fixed tuple arguments
    argTupleSchema._def.items.forEach((itemSchema: ZodTypeAny, index: number) => {
        const name = itemSchema.description || `arg${index}`;
        if (shape[name]) {
            console.warn(`[API:${zodFunc.description || 'unknown'}] Duplicate argument name/description '${name}'.`);
            return;
        }
        shape[name] = coerceIfNeeded(itemSchema);
        argNames.push(name);
    });

    // Process rest argument
    if (argTupleSchema._def.rest) {
        const restSchema = argTupleSchema._def.rest as ZodTypeAny;
        restArgName = restSchema.description || 'restArgs';
        if (shape[restArgName]) {
             console.warn(`[API:${zodFunc.description || 'unknown'}] Duplicate name/description '${restArgName}' for rest parameter.`);
        } else {
             // API expects rest args as an optional array in the input object
             // Coercion for the *elements* needs to be handled during pre-processing for query params
             let arrayType = z.array(restSchema);
             // We don't coerce the array elements here; pre-processing handles query strings.
             // Zod handles JSON arrays naturally.
            shape[restArgName] = arrayType.optional().describe(restSchema.description || `Variable number of ${restArgName}`);
        }
    }

    // Use passthrough to allow extra query parameters maybe? Or catchall? Let's stick to strict for now.
    return { schema: z.object(shape), argNames, restArgName };
}


// Define the main request handler function separately
async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    // Allow ZodFunction type in the library list
    libraries: Record<string, ZodFunction<any, any>>[]
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

    // Use await here as handleRequest is now async
    await new Promise<void>((resolve) => req.on('end', resolve));

    let argsSource: Record<string, any> = {};
    let isJsonBody = false;
    let potentialZodFunc: ZodFunction<any, any> | null = null;

    // Find the potential Zod function first
    for (const library of libraries) {
        if (hasOwnProperty(library, commandName)) {
            const func = library[commandName];
            // Remove the isZodFunction check, assume it is Zod if found
            // if (isZodFunction(func)) { ... }
            potentialZodFunc = func as ZodFunction<any, any>; // Assert type
            break;
            // Optional: Handle non-Zod functions if necessary, otherwise they are ignored
        }
    }

    // If no function found by name, return 404
    if (!potentialZodFunc) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        // Update error message
        res.end(JSON.stringify({ error: `Command '${commandName}' not found.` }));
        return;
    }

    // Proceed with processing the found ZodFunction
    try {
        // Determine input source (JSON body or query params)
        if (req.method === 'POST' && req.headers['content-type']?.includes('application/json') && body) {
            try {
                argsSource = JSON.parse(body);
                isJsonBody = true;
                if (typeof argsSource !== 'object' || argsSource === null || Array.isArray(argsSource)) {
                    throw new Error('Request body must be a JSON object.');
                }
            } catch (parseError: any) {
                 throw new Error(`Invalid JSON in request body: ${parseError.message}`);
            }
        } else {
            // Query parameters source
            argsSource = { ...parsedUrl.query }; // Clone query object
            isJsonBody = false;
        }

        // Build the Zod schema for API input validation (with coercion for query strings)
        const { schema: apiInputSchema, argNames, restArgName } = buildApiInputSchema(potentialZodFunc, !isJsonBody);

        // --- Pre-process query string arrays before Zod parsing ---
        if (!isJsonBody) {
            const preProcessedArgs: Record<string, any> = {};
            for (const key in argsSource) {
                const value = argsSource[key];
                const fieldSchema = apiInputSchema.shape[key];
                let expectsArray = false;
                 if (fieldSchema) {
                      expectsArray = fieldSchema instanceof z.ZodOptional
                                     ? fieldSchema._def.innerType instanceof z.ZodArray
                                     : fieldSchema instanceof z.ZodArray;
                 }

                 if (expectsArray && typeof value === 'string') {
                    // Normalize single query param string to array[1] if Zod expects an array
                    preProcessedArgs[key] = [value];
                 } else {
                     // Keep original value (string or string[] from url.parse)
                     preProcessedArgs[key] = value;
                 }
            }
             argsSource = preProcessedArgs; // Use the pre-processed args for parsing
        }


        // Validate argsSource against the Zod schema
        // Zod's coercion (for query strings) happens here if enabled in buildApiInputSchema
        const validatedInput = apiInputSchema.parse(argsSource);

        // Map parsed args back to tuple/spread format
        const finalCallArgs: any[] = [];
        argNames.forEach(name => {
            // Handle potential undefined if the schema part was optional and not provided
            finalCallArgs.push(validatedInput[name]);
        });
        if (restArgName && validatedInput[restArgName]) {
            finalCallArgs.push(...(validatedInput[restArgName] as any[]));
        }

        // Execute the Zod function - Use type assertion to bypass linter issue
        const result = (potentialZodFunc as any)(...finalCallArgs);

        // Handle potential promise result if the Zod function was async
        const finalResult = (result instanceof Promise) ? await result : result;

        // Send success response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // Let JSON.stringify handle non-string results
        res.end(JSON.stringify({ result: finalResult }));

    } catch (error: any) {
        let errorMessage = 'Unknown execution error';
        let statusCode = 400; // Default Bad Request

        if (error instanceof ZodError) {
            // Provide detailed validation errors
            errorMessage = `Invalid arguments: ${error.errors.map(e => `'${e.path.join('.')}' ${e.message}`).join(', ')}`;
        } else if (error instanceof Error) {
            errorMessage = error.message;
            // Optionally check error message for specific internal errors?
        } else {
            errorMessage = String(error);
            statusCode = 500; // Internal Server Error for non-Error types
        }

        console.error(`[API Error] Command: ${commandName}, Status: ${statusCode}, Message: ${errorMessage}`);
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: errorMessage }));
    }
}

// --- API Server Entry Point ---

export function runApi(
    // Update type to reflect that libraries can contain ZodFunctions
    libraries: Record<string, ZodFunction<any,any>>[],
    port: number = 3000
) {
    // Pass the async handler function to createServer
    const server = http.createServer((req, res) => handleRequest(req, res, libraries));

    server.listen(port, () => {
        console.log(`API server listening on http://localhost:${port}`);
        console.log('Available command endpoints (GET examples shown, POST with JSON body preferred):');

        // Iterate through libraries and functions to generate detailed endpoint info from Zod
        libraries.forEach(library => {
            Object.keys(library).forEach(commandName => {
                const func = library[commandName];
                // Remove the isZodFunction check, assume all functions are Zod for docs
                // if (isZodFunction(func)) { ... }

                // Add a basic check to ensure func is at least an object before accessing _def
                if (typeof func === 'object' && func !== null && func._def) {
                    const zodFunc = func as ZodFunction<any, any>; // Assert type
                    const argTupleSchema = zodFunc._def.args as ZodTuple<any, any>;
                    let queryStringExample = '';
                    const paramDetails: string[] = [];

                    try { // Add try-catch for safety during schema introspection
                        // Fixed args
                        argTupleSchema._def.items.forEach((itemSchema: ZodTypeAny, index: number) => {
                            const name = itemSchema.description || `arg${index}`;
                            // Attempt to get a cleaner type name
                            const typeName = (itemSchema._def as any).typeName?.replace(/^Zod/, '') || 'unknown';
                            const isOptional = itemSchema.isOptional();
                            paramDetails.push(`${name}${isOptional ? '?' : ''}: ${typeName}`);
                            // Basic example values for query string
                            let exampleValue = 'value';
                            if (typeName === 'Number') exampleValue = '123';
                            if (typeName === 'Boolean') exampleValue = 'true';
                            // Represent arrays simply for query example
                            if (typeName === 'Array') exampleValue = 'value1&' + encodeURIComponent(name) + '=value2'; // Correct array example

                            // Only add non-optional args to basic query string example
                            if (!isOptional) {
                                queryStringExample += `${queryStringExample ? '&' : '?'}${encodeURIComponent(name)}=${exampleValue}`;
                            }
                        });

                        // Rest arg
                        if (argTupleSchema._def.rest) {
                            const restSchema = argTupleSchema._def.rest as ZodTypeAny;
                            const name = restSchema.description || 'restArgs';
                            const elementTypeName = (restSchema._def as any).typeName?.replace(/^Zod/, '') || 'unknown';
                            paramDetails.push(`...${name}: ${elementTypeName}[]`);
                            // Append rest args example - API often uses repeated param name
                            queryStringExample += `${queryStringExample ? '&' : '?'}${encodeURIComponent(name)}=value1&${encodeURIComponent(name)}=value2`;
                        }

                        console.log(`  /${commandName}${queryStringExample || ''}`); // Add default empty string
                        if (paramDetails.length > 0) {
                            console.log(`    Parameters: ${paramDetails.join(', ')}`);
                        }
                        if (zodFunc.description) {
                            console.log(`    Description: ${zodFunc.description}`);
                        } else {
                             console.log(`    Description: (No description provided)`);
                        }
                    } catch (docError: any) {
                         console.log(`  /${commandName} - Error generating documentation: ${docError.message}`);
                    }
                } else {
                    // Log functions that don't seem to be ZodFunctions
                    console.log(`  /${commandName} - (Skipping documentation: Not recognized as Zod function)`);
                }
                // Remove the old non-Zod fallback
                // else if (typeof func === 'function') {
                //     console.log(`  /${commandName} - (Non-Zod function)`);
                // }
            });
        });
        console.log('Note: For POST requests, send arguments as a JSON object in the request body.');
        console.log('Note: Query string parameters are coerced (e.g., "123" -> 123, "true" -> true).');
    });
}
