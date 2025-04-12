import http from 'http';
import url from 'url';
import type { IncomingMessage, ServerResponse } from 'http';

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

type LibraryFunction = (...args: any[]) => any; // Use any[] to allow both string and number arrays

export function runApi(libraries: Record<string, LibraryFunction>[], port: number = 3000) {
  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '';
    const commandName = pathname.substring(1); // Remove leading '/'

    // Get arguments from query parameters. Expecting args like ?args=1&args=2&args=...
    let commandArgs: string[] = [];
    if (parsedUrl.query.args) {
        if (Array.isArray(parsedUrl.query.args)) {
            commandArgs = parsedUrl.query.args;
        } else {
            commandArgs = [parsedUrl.query.args];
        }
    }

    // Identify calculator commands
    const calculatorCommands = ['add', 'subtract', 'multiply', 'divide'];
    let func: LibraryFunction | null = null;
    let isCalculatorCommand = false;

    // Find the function in the libraries
    for (const library of libraries) {
      if (hasOwnProperty(library, commandName) && typeof library[commandName] === 'function') {
        func = library[commandName];
        isCalculatorCommand = calculatorCommands.includes(commandName);
        break;
      }
    }

    if (func) {
      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*' // Allow CORS for testing
      });

      try {
        let result: any;
        if (isCalculatorCommand) {
            const numericArgs = parseStringsToNumbers(commandArgs);
            // Call calculator func with number[] args, casting via unknown
            result = (func as unknown as (...args: number[]) => any)(...numericArgs);
        } else {
            // Call other func with string[] args
            result = (func as (...args: string[]) => any)(...commandArgs);
        }
        // Send the result as an SSE data event
        res.write(`data: ${JSON.stringify(result)}\n\n`);
      } catch (error: any) {
        // Send an error event
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.write(`event: error\ndata: ${JSON.stringify({ message: errorMessage })}\n\n`);
      } finally {
        // End the response
        res.end();
      }
    } else {
      // Command not found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Command '${commandName}' not found.` }));
    }
  });

  server.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
    console.log('Available command endpoints:');
    libraries.flatMap(lib => Object.keys(lib)).forEach(cmd => {
        console.log(`  /${cmd}?args=...`);
    });
  });
} 