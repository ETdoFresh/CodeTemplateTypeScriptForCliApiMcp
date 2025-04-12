import http from 'http';
import url from 'url';
import type { IncomingMessage, ServerResponse } from 'http';
// Import shared types and validation
import { LibraryFunction, ArgInfo, ArgType, validateType } from '../cli-lib/shared';

function hasOwnProperty<X extends {}, Y extends PropertyKey>
  (obj: X, prop: Y): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

// Helper function to parse string arguments to numbers
function parseStringsToNumbers(args: string[]): number[] {
  return args.map(arg => {
    const num = parseFloat(arg);
    if (isNaN(num)) {
      throw new Error(`Invalid number argument: ${arg}`);
    }
    return num;
  });
}

// Define the main request handler function separately
function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    libraries: Record<string, LibraryFunction>[]
) {
    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '';
    const commandName = pathname.substring(1); // Remove leading '/'

    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        let argsSource: Record<string, any> = {};
        let isJsonBody = false;
        if (req.method === 'POST' && req.headers['content-type']?.includes('application/json') && body) {
            try {
                argsSource = JSON.parse(body);
                isJsonBody = true;
                if (typeof argsSource !== 'object' || argsSource === null || Array.isArray(argsSource)) {
                     throw new Error('Request body must be a JSON object.');
                }
            } catch (parseError: any) {
                 res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                 res.end(JSON.stringify({ error: `Invalid JSON in request body: ${parseError.message}` }));
                 return;
            }
        } else {
            argsSource = parsedUrl.query;
        }

        let func: LibraryFunction | null = null;
        let argTypeDefs: ArgInfo[] = [];

        for (const library of libraries) {
            if (hasOwnProperty(library, commandName) && typeof library[commandName] === 'function') {
                func = library[commandName];
                argTypeDefs = (func as LibraryFunction).__argTypes || [];
                break;
            }
        }

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

        if (func) {
            try {
                const finalArgs: any[] = [];
                for (let i = 0; i < argTypeDefs.length; i++) {
                    const argDef = argTypeDefs[i];
                    const isRestParam = argDef.type.startsWith('...');
                    let argValue: any;

                    if (!hasOwnProperty(argsSource, argDef.name)) {
                        if (isRestParam) {
                            argValue = [];
                        } else {
                             throw new Error(`Missing required argument '${argDef.name}' for command '${commandName}'.`);
                        }
                    } else {
                        argValue = argsSource[argDef.name];
                    }

                    // Handle query param types
                    if (!isJsonBody) {
                         if (!isRestParam && typeof argValue !== 'string') {
                              throw new Error(`Query parameter '${argDef.name}' should be a single string value for command '${commandName}'.`);
                         }
                         if (isRestParam && typeof argValue !== 'string' && !Array.isArray(argValue)) {
                             throw new Error(`Query parameter '${argDef.name}' should be a string or array of strings for rest parameter in command '${commandName}'.`);
                         }
                         if (isRestParam && typeof argValue === 'string') {
                              argValue = [argValue];
                         }
                         try {
                             switch(argDef.type) {
                                 case 'number': argValue = parseFloat(argValue); break;
                                 case 'boolean': argValue = (argValue.toLowerCase() === 'true' || argValue === '1'); break;
                                 case 'number[]':
                                 case '...number[]': argValue = (argValue as string[]).map(parseFloat); break;
                                 case 'boolean[]':
                                 case '...boolean[]': argValue = (argValue as string[]).map(s => s.toLowerCase() === 'true' || s === '1'); break;
                             }
                             const isNumericType = argDef.type === 'number' || argDef.type === 'number[]' || argDef.type === '...number[]';
                             if (isNumericType) {
                                 if (Array.isArray(argValue)) {
                                     if (argValue.some(isNaN)) {
                                         throw new Error(`Invalid number format in array for query parameter '${argDef.name}'.`);
                                     }
                                 } else {
                                     if (isNaN(argValue)) {
                                         throw new Error(`Invalid number format for query parameter '${argDef.name}'.`);
                                     }
                                 }
                             }
                         } catch (conversionError: any) {
                             throw new Error(`Failed to convert query parameter '${argDef.name}' to expected type '${argDef.type}': ${conversionError.message}`);
                         }
                     }

                    validateType(argValue, argDef.type, argDef.name, commandName);

                    if (isRestParam) {
                        finalArgs.push(...argValue);
                    } else {
                        finalArgs.push(argValue);
                    }
                }

                const result = func(...finalArgs);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ result }));

            } catch (error: any) {
                 const errorMessage = error instanceof Error ? error.message : 'Unknown execution error';
                 res.writeHead(400, { 'Content-Type': 'application/json' });
                 res.end(JSON.stringify({ error: errorMessage }));
            }
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Command '${commandName}' not found.` }));
        }
    });
}

export function runApi(libraries: Record<string, LibraryFunction>[], port: number = 3000) {
  // Pass the handler function to createServer
  const server = http.createServer((req, res) => handleRequest(req, res, libraries));

  server.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
    console.log('Available command endpoints (GET examples shown, POST with JSON body preferred):');
    // Iterate through libraries and functions to generate detailed endpoint info
    libraries.forEach(library => {
        Object.keys(library).forEach(commandName => {
            const func = library[commandName];
            if (typeof func === 'function') {
                const argTypeDefs: ArgInfo[] = (func as LibraryFunction).__argTypes || [];
                let queryStringExample = '';
                if (argTypeDefs.length > 0) {
                    queryStringExample = '?' + argTypeDefs.map(argDef => {
                         // Represent arrays/rest params simply for example
                         const exampleValue = argDef.type.includes('[]') ? `[value1,value2]` : `value`;
                         return `${encodeURIComponent(argDef.name)}=${exampleValue}`;
                    }).join('&');
                }
                console.log(`  /${commandName}${queryStringExample}`);
                // Optional: Log parameter details
                 if (argTypeDefs.length > 0) {
                     console.log(`    Parameters: ${argTypeDefs.map(a => `${a.name}: ${a.type}`).join(', ')}`);
                 }
            }
        });
    });
    console.log('Note: For POST requests, send arguments as a JSON object in the request body.');
  });
} 