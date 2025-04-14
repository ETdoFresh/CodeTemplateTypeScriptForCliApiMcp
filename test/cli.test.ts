import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'; // Added vi
import { execSync } from 'child_process';
import * as path from 'path';
import { z } from 'zod'; // Import Zod
import { processArgs, executeParsedCommands } from '../src/interface-libraries/cli-lib/shared';
import { DefineFunction, DefineObjectFunction } from '../src/utils/zod-function-utils'; // Import wrappers
// Corrected import path for calculator-lib
import * as calculatorLib from '../src/command-libraries/calculator-lib/index';
// Import hello-lib for new tests
import * as helloLib from '../src/command-libraries/hello-lib/index';
import * as echoLib from '../src/command-libraries/echo-lib/index';
import * as inspectLib from '../src/command-libraries/inspect-lib/index';
// Removed duplicate vi import
// test/cli.test.ts

// Helper function to run CLI commands
interface CommandResult {
  stdout: string;
  stderr: string;
  error?: Error;
}

function runCliCommand(command: string): CommandResult {
  try {
    // Construct the full command to execute the built JS file
    const scriptPath = path.resolve(process.cwd(), 'dist/index.js'); // Ensure absolute path
    const fullCommand = `node "${scriptPath}" ${command}`;
    
    // Execute the command synchronously
    const output = execSync(fullCommand, { encoding: 'utf8' });
    return { stdout: output, stderr: '' };
  } catch (error: any) {
    // execSync throws on non-zero exit code
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      error: error,
    };
  }
}

describe('CLI Integration Tests', () => {

  // --- Calculator Lib Tests ---
  describe('calculator-lib', () => {
    it('should execute add command correctly', () => {
      const result = runCliCommand('add 1 2 3');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('6\n'); // Expect newline from console.log
    });

    it('should execute subtract command correctly', () => {
      const result = runCliCommand('subtract 10 3 2');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('5\n');
    });

    it('should handle subtract command with missing arguments (CLI)', () => {
      const result = runCliCommand('subtract 10');
      expect(result.error).toBeDefined();
      // Assuming the parser catches missing required positional arguments
      expect(result.stderr).toMatch(/Missing required argument: numbers/i);
    });

    it('should execute multiply command correctly', () => {
      const result = runCliCommand('multiply 2 3 4');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('24\n');
    });

    it('should handle multiply command with missing arguments (CLI)', () => {
      const result = runCliCommand('multiply 2');
      expect(result.error).toBeDefined();
      // Assuming the parser catches missing required positional arguments
      expect(result.stderr).toMatch(/Missing required argument: numbers/i);
    });

    it('should execute divide command correctly', () => {
      const result = runCliCommand('divide 20 2 2');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('5\n');
    });

    it('should handle divide by zero (CLI)', () => {
      const result = runCliCommand('divide 10 0');
      expect(result.error).toBeDefined();
      // Division by zero is a runtime error from the function itself, not the parser
      expect(result.stderr).toMatch(/division by zero/i);
    });

    it('should handle divide command with missing arguments (CLI)', () => {
      const result = runCliCommand('divide 10');
      expect(result.error).toBeDefined();
      // Assuming the parser catches missing required positional arguments
      expect(result.stderr).toMatch(/Missing required argument: numbers/i);
    });
  });

  // --- echo-lib CLI Tests ---
  describe('echo-lib', () => {
    it('should echo a single word', () => {
      const result = runCliCommand('echo hello');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('hello\n');
    });

    it('should echo multiple words', () => {
      const result = runCliCommand('echo foo bar baz');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('foo bar baz\n');
    });

    it('should echo numbers as strings', () => {
      const result = runCliCommand('echo 1 2 3');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('1 2 3\n');
    });

    it('should echo special characters', () => {
      const result = runCliCommand('echo ! @ # $ %');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('! @ # $ %\n');
    });

    it('should echo empty input as empty string', () => {
      const result = runCliCommand('echo');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('\n');
    });

    it('should echo empty string argument', () => {
      const result = runCliCommand('echo ""');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('\n');
    });

    it('should echo with empty string in between', () => {
      const result = runCliCommand('echo a "" b');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('a  b\n');
    });

    it('should echo quoted strings', () => {
      const result = runCliCommand('echo "hello world"');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('hello world\n');
    });
  });

  // --- inspect-lib CLI Tests ---
  describe('inspect-lib', () => {
    let spawnMock: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // Mock child_process.spawn
      const childProcess = require('child_process');
      spawnMock = vi.spyOn(childProcess, 'spawn');
    });

    afterEach(() => {
      spawnMock.mockRestore();
    });

    it('should execute inspect command successfully (CLI)', async () => {
      // Simulate successful child process
      const events: Record<string, Function> = {};
      const fakeChild = {
        on: (event: string, cb: Function) => { events[event] = cb; return fakeChild; },
        // No need for other methods for this test
      };
      spawnMock.mockReturnValue(fakeChild);

      // Run in a microtask to simulate async close event
      setTimeout(() => { events['close']?.(0); }, 0);

      const result = runCliCommand('inspect');
      // Since the CLI prints to console, we can't check stdout for inspector output,
      // but we can check that no error was thrown and stderr is empty.
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
    });

    it('should handle inspect command failure (CLI)', async () => {
      // Simulate child process exiting with error code
      const events: Record<string, Function> = {};
      const fakeChild = {
        on: (event: string, cb: Function) => { events[event] = cb; return fakeChild; },
      };
      spawnMock.mockReturnValue(fakeChild);

      setTimeout(() => { events['close']?.(1); }, 0);

      const result = runCliCommand('inspect');
      expect(result.error).toBeDefined();
      // The error message should mention inspector failed/exit code
      expect(result.stderr).toMatch(/inspector/i);
    });

    it('should handle inspect command spawn error (CLI)', async () => {
      // Simulate child process error event
      const events: Record<string, Function> = {};
      const fakeChild = {
        on: (event: string, cb: Function) => { events[event] = cb; return fakeChild; },
      };
      spawnMock.mockReturnValue(fakeChild);

      setTimeout(() => { events['error']?.(new Error('spawn failed')); }, 0);

      const result = runCliCommand('inspect');
      expect(result.error).toBeDefined();
      expect(result.stderr).toMatch(/spawn failed/i);
    });
  });

  // --- hello-lib CLI Tests ---
  describe('hello-lib', () => {
    it('should execute helloString command correctly', () => {
      const result = runCliCommand('helloString Alice');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('Hello, Alice!\n');
    });

    it('should handle helloString command with missing argument (CLI)', () => {
      const result = runCliCommand('helloString');
      expect(result.error).toBeDefined();
      // Expecting new error format for missing required argument
      expect(result.stderr).toMatch(/Missing required argument: name/i);
    });

    it('should execute helloNumber command correctly', () => {
      const result = runCliCommand('helloNumber 42');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('Hello, 42!\n');
    });

    it('should handle helloNumber command with invalid argument (CLI)', () => {
      const result = runCliCommand('helloNumber notANumber');
      expect(result.error).toBeDefined();
      // Expecting new error format for invalid type
      expect(result.stderr).toMatch(/Invalid value 'notANumber' for argument 'value'. Expected number./i);
    });

    it('should execute helloBoolean command correctly (true)', () => {
      const result = runCliCommand('helloBoolean true');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('Hello, true!\n');
    });

    it('should execute helloBoolean command correctly (false)', () => {
      const result = runCliCommand('helloBoolean false');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('Hello, false!\n');
    });

    it('should handle helloBoolean command with invalid argument (CLI)', () => {
      const result = runCliCommand('helloBoolean notABoolean');
      expect(result.error).toBeDefined();
      // Expecting new error format for invalid type
      expect(result.stderr).toMatch(/Invalid value 'notABoolean' for argument 'value'. Expected boolean./i);
    });

    it('should execute helloStringArray command correctly', () => {
      const result = runCliCommand('helloStringArray foo bar baz');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('Hello, foo, bar, baz!\n');
    });

    it('should handle helloStringArray command with no arguments (CLI)', () => {
      const result = runCliCommand('helloStringArray');
      expect(result.error).toBeDefined();
      // Expecting new error format for missing required argument (assuming it's a rest arg)
      expect(result.stderr).toMatch(/Missing required argument: names/i);
    });

    it('should execute helloNumberArray command correctly', () => {
      const result = runCliCommand('helloNumberArray 1 2 3');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('Hello, 1, 2, 3!\n');
    });

    it('should handle helloNumberArray command with invalid argument (CLI)', () => {
      const result = runCliCommand('helloNumberArray 1 two 3');
      expect(result.error).toBeDefined();
      // Expecting new error format for invalid type within an array
      expect(result.stderr).toMatch(/Invalid value 'two' for argument 'values'. Expected number array./i);
    });

    it('should handle helloNumberArray command with no arguments (CLI)', () => {
      const result = runCliCommand('helloNumberArray');
      expect(result.error).toBeDefined();
      // Expecting new error format for missing required argument (assuming it's a rest arg)
      expect(result.stderr).toMatch(/Missing required argument: values/i);
    });

    it('should handle helloString command with too many arguments (CLI)', () => {
      const result = runCliCommand('helloString Alice Bob');
      expect(result.error).toBeDefined();
      // Expecting new error format for too many positional arguments
      expect(result.stderr).toMatch(/Too many positional arguments provided/i);
    });

    it('should handle helloString command with unknown named argument (CLI)', () => {
      const result = runCliCommand('helloString Alice --unknown=value');
      expect(result.error).toBeDefined();
      // Expecting new error format for unknown named arguments
      expect(result.stderr).toMatch(/Unknown named argument: unknown/i);
    });
  });

  // --- REPL Logic Tests ---

  describe('REPL Logic', () => {
    // Existing calculator-lib REPL tests...

    // --- hello-lib REPL Tests ---
    describe('hello-lib', () => {
      it('should execute helloString command correctly (REPL)', () => {
        // Wrap the function for the test
        const mockLib = {
          helloString: DefineFunction({
            description: helloLib.helloString.description || 'mock',
            args: z.tuple([z.string().describe('name')]), // Define args schema
            function: helloLib.helloString.function // Use the raw function
          })
        };
        const commandsToExecute = processArgs(['helloString Alice']);
        const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
        expect(executionResults).toHaveLength(1);
        const result = executionResults[0];
        expect(result.error).toBeUndefined();
        expect(result.result).toBe('Hello, Alice!');
      });

      it('should handle helloString command with missing argument (REPL)', () => {
        // Wrap the function for the test
        const mockLib = {
          helloString: DefineFunction({
            description: helloLib.helloString.description || 'mock',
            args: z.tuple([z.string().describe('name')]),
            function: helloLib.helloString.function
          })
        };
        const commandsToExecute = processArgs(['helloString']);
        const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
        expect(executionResults).toHaveLength(1);
        const result = executionResults[0];
        expect(result.error).toBeDefined();
        expect(result.error?.message).toMatch(/Missing required argument: name/i);
      });

      it('should execute helloNumber command correctly (REPL)', () => {
        // Wrap the function for the test
        const mockLib = {
          helloNumber: DefineFunction({
            description: helloLib.helloNumber.description || 'mock',
            args: z.tuple([z.number().describe('value')]), // Define args schema
            function: helloLib.helloNumber.function
          })
        };
        const commandsToExecute = processArgs(['helloNumber 42']);
        const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
        expect(executionResults).toHaveLength(1);
        const result = executionResults[0];
        expect(result.error).toBeUndefined();
        expect(result.result).toBe('Hello, 42!');
      });

      it('should handle helloNumber command with invalid argument (REPL)', () => {
        // Wrap the function for the test
        const mockLib = {
          helloNumber: DefineFunction({
            description: helloLib.helloNumber.description || 'mock',
            args: z.tuple([z.number().describe('value')]),
            function: helloLib.helloNumber.function
          })
        };
        const commandsToExecute = processArgs(['helloNumber notANumber']);
        const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
        expect(executionResults).toHaveLength(1);
        const result = executionResults[0];
        expect(result.error).toBeDefined();
        expect(result.error?.message).toMatch(/Invalid value 'notANumber' for argument 'value'. Expected number./i);
      });

      it('should execute helloBoolean command correctly (REPL, true)', () => {
        // Wrap the function for the test
        const mockLib = {
          helloBoolean: DefineFunction({
            description: helloLib.helloBoolean.description || 'mock',
            args: z.tuple([z.boolean().describe('value')]), // Define args schema
            function: helloLib.helloBoolean.function
          })
        };
        const commandsToExecute = processArgs(['helloBoolean true']);
        const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
        expect(executionResults).toHaveLength(1);
        const result = executionResults[0];
        expect(result.error).toBeUndefined();
        expect(result.result).toBe('Hello, true!');
      });

      it('should execute helloBoolean command correctly (REPL, false)', () => {
        // Wrap the function for the test
        const mockLib = {
          helloBoolean: DefineFunction({
            description: helloLib.helloBoolean.description || 'mock',
            args: z.tuple([z.boolean().describe('value')]),
            function: helloLib.helloBoolean.function
          })
        };
        const commandsToExecute = processArgs(['helloBoolean false']);
        const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
        expect(executionResults).toHaveLength(1);
        const result = executionResults[0];
        expect(result.error).toBeUndefined();
        expect(result.result).toBe('Hello, false!');
      });

      it('should handle helloBoolean command with invalid argument (REPL)', () => {
        // Wrap the function for the test
        const mockLib = {
          helloBoolean: DefineFunction({
            description: helloLib.helloBoolean.description || 'mock',
            args: z.tuple([z.boolean().describe('value')]),
            function: helloLib.helloBoolean.function
          })
        };
        const commandsToExecute = processArgs(['helloBoolean notABoolean']);
        const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
        expect(executionResults).toHaveLength(1);
        const result = executionResults[0];
        expect(result.error).toBeDefined();
        expect(result.error?.message).toMatch(/Invalid value 'notABoolean' for argument 'value'. Expected boolean./i);
      });

      it('should execute helloStringArray command correctly (REPL)', () => {
        // Wrap the function for the test (using rest argument)
        const mockLib = {
          helloStringArray: DefineFunction({
            description: helloLib.helloStringArray.description || 'mock',
            args: z.tuple([]).rest(z.string().describe('names')), // Define rest args schema
            function: helloLib.helloStringArray.function
          })
        };
        const commandsToExecute = processArgs(['helloStringArray foo bar baz']);
        const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
        expect(executionResults).toHaveLength(1);
        const result = executionResults[0];
        expect(result.error).toBeUndefined();
        expect(result.result).toBe('Hello, foo, bar, baz!');
      });

      it('should handle helloStringArray command with no arguments (REPL)', () => {
        // Wrap the function for the test
        const mockLib = {
          helloStringArray: DefineFunction({
            description: helloLib.helloStringArray.description || 'mock',
            args: z.tuple([]).rest(z.string().describe('names')),
            function: helloLib.helloStringArray.function
          })
        };
        const commandsToExecute = processArgs(['helloStringArray']);
        const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
        expect(executionResults).toHaveLength(1);
        const result = executionResults[0];
        expect(result.error).toBeDefined();
        expect(result.error?.message).toMatch(/Missing required argument: names/i);
      });

      it('should execute helloNumberArray command correctly (REPL)', () => {
        // Wrap the function for the test (using rest argument)
        const mockLib = {
          helloNumberArray: DefineFunction({
            description: helloLib.helloNumberArray.description || 'mock',
            args: z.tuple([]).rest(z.number().describe('values')), // Define rest args schema
            function: helloLib.helloNumberArray.function
          })
        };
        const commandsToExecute = processArgs(['helloNumberArray 1 2 3']);
        const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
        expect(executionResults).toHaveLength(1);
        const result = executionResults[0];
        expect(result.error).toBeUndefined();
        expect(result.result).toBe('Hello, 1, 2, 3!');
      });

      it('should handle helloNumberArray command with invalid argument (REPL)', () => {
        // Wrap the function for the test
        const mockLib = {
          helloNumberArray: DefineFunction({
            description: helloLib.helloNumberArray.description || 'mock',
            args: z.tuple([]).rest(z.number().describe('values')),
            function: helloLib.helloNumberArray.function
          })
        };
        const commandsToExecute = processArgs(['helloNumberArray 1 two 3']);
        const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
        expect(executionResults).toHaveLength(1);
        const result = executionResults[0];
        expect(result.error).toBeDefined();
        expect(result.error?.message).toMatch(/Invalid value 'two' for argument 'values'. Expected number array./i);
      });

      it('should handle helloNumberArray command with no arguments (REPL)', () => {
        // Wrap the function for the test
        const mockLib = {
          helloNumberArray: DefineFunction({
            description: helloLib.helloNumberArray.description || 'mock',
            args: z.tuple([]).rest(z.number().describe('values')),
            function: helloLib.helloNumberArray.function
          })
        };
        const commandsToExecute = processArgs(['helloNumberArray']);
        const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
        expect(executionResults).toHaveLength(1);
        const result = executionResults[0];
        expect(result.error).toBeDefined();
        expect(result.error?.message).toMatch(/Missing required argument: values/i);
      });
    });
      // --- echo-lib REPL Tests ---
      describe('echo-lib', () => {
        it('should echo a single word (REPL)', () => {
          // Wrap the function for the test (echo uses rest string array)
          const mockLib = {
            echo: DefineFunction({
              description: echoLib.echo.description || 'mock',
              args: z.tuple([]).rest(z.string().describe('messages')), // Define rest args
              function: echoLib.echo.function
            })
          };
          const commandsToExecute = processArgs(['echo hello']);
          const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
          expect(executionResults).toHaveLength(1);
          const result = executionResults[0];
          expect(result.error).toBeUndefined();
          expect(result.result).toBe('hello');
        });
  
        it('should echo multiple words (REPL)', () => {
          // Wrap the function for the test
          const mockLib = {
            echo: DefineFunction({
              description: echoLib.echo.description || 'mock',
              args: z.tuple([]).rest(z.string().describe('messages')),
              function: echoLib.echo.function
            })
          };
          const commandsToExecute = processArgs(['echo foo bar baz']);
          const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
          expect(executionResults).toHaveLength(1);
          const result = executionResults[0];
          expect(result.error).toBeUndefined();
          expect(result.result).toBe('foo bar baz');
        });
  
        it('should echo numbers as strings (REPL)', () => {
          // Wrap the function for the test
          const mockLib = {
            echo: DefineFunction({
              description: echoLib.echo.description || 'mock',
              args: z.tuple([]).rest(z.string().describe('messages')),
              function: echoLib.echo.function
            })
          };
          const commandsToExecute = processArgs(['echo 1 2 3']);
          const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
          expect(executionResults).toHaveLength(1);
          const result = executionResults[0];
          expect(result.error).toBeUndefined();
          expect(result.result).toBe('1 2 3');
        });
  
        it('should echo special characters (REPL)', () => {
          // Wrap the function for the test
          const mockLib = {
            echo: DefineFunction({
              description: echoLib.echo.description || 'mock',
              args: z.tuple([]).rest(z.string().describe('messages')),
              function: echoLib.echo.function
            })
          };
          const commandsToExecute = processArgs(['echo ! @ # $ %']);
          const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
          expect(executionResults).toHaveLength(1);
          const result = executionResults[0];
          expect(result.error).toBeUndefined();
          expect(result.result).toBe('! @ # $ %');
        });
  
        it('should echo empty input as empty string (REPL)', () => {
          // Wrap the function for the test
          const mockLib = {
            echo: DefineFunction({
              description: echoLib.echo.description || 'mock',
              args: z.tuple([]).rest(z.string().describe('messages')),
              function: echoLib.echo.function
            })
          };
          const commandsToExecute = processArgs(['echo']);
          const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
          expect(executionResults).toHaveLength(1);
          const result = executionResults[0];
          expect(result.error).toBeUndefined();
          expect(result.result).toBe('');
        });
    
        // --- inspect-lib REPL Tests ---
        describe('inspect-lib', () => {
          let spawnMock: ReturnType<typeof vi.spyOn>;
    
          beforeEach(() => {
            const childProcess = require('child_process');
            spawnMock = vi.spyOn(childProcess, 'spawn');
          });
    
          afterEach(() => {
            spawnMock.mockRestore();
          });
    
          it('should execute inspect command successfully (REPL)', async () => {
            const events: Record<string, Function> = {};
            const fakeChild = {
              on: (event: string, cb: Function) => { events[event] = cb; return fakeChild; },
            };
            spawnMock.mockReturnValue(fakeChild);
    
            setTimeout(() => { events['close']?.(0); }, 0);
    
            // Wrap the function for the test (inspect takes no args)
            const mockLib = {
              inspect: DefineFunction({
                description: inspectLib.inspect.description || 'mock',
                args: z.tuple([]), // No arguments
                function: inspectLib.inspect.function
              })
            };
            const commandsToExecute = processArgs(['inspect']);
            // Note: executeParsedCommands might not handle async functions correctly based on shared.ts warnings
            const executionResults = await executeParsedCommands(commandsToExecute, [mockLib]);
            expect(executionResults).toHaveLength(1);
            const result = executionResults[0];
            expect(result.error).toBeUndefined();
            expect(result.result).toBeUndefined(); // inspect returns void
          });
    
          it('should handle inspect command failure (REPL)', async () => {
            const events: Record<string, Function> = {};
            const fakeChild = {
              on: (event: string, cb: Function) => { events[event] = cb; return fakeChild; },
            };
            spawnMock.mockReturnValue(fakeChild);
    
            setTimeout(() => { events['close']?.(2); }, 0);
    
            // Wrap the function for the test
            const mockLib = {
              inspect: DefineFunction({
                description: inspectLib.inspect.description || 'mock',
                args: z.tuple([]),
                function: inspectLib.inspect.function
              })
            };
            const commandsToExecute = processArgs(['inspect']);
            const executionResults = await executeParsedCommands(commandsToExecute, [mockLib]);
            expect(executionResults).toHaveLength(1);
            const result = executionResults[0];
            expect(result.error).toBeDefined();
            expect(result.error?.message).toMatch(/inspector/i);
          });
    
          it('should handle inspect command spawn error (REPL)', async () => {
            const events: Record<string, Function> = {};
            const fakeChild = {
              on: (event: string, cb: Function) => { events[event] = cb; return fakeChild; },
            };
            spawnMock.mockReturnValue(fakeChild);
    
            setTimeout(() => { events['error']?.(new Error('spawn failed')); }, 0);
    
            // Wrap the function for the test
            const mockLib = {
              inspect: DefineFunction({
                description: inspectLib.inspect.description || 'mock',
                args: z.tuple([]),
                function: inspectLib.inspect.function
              })
            };
            const commandsToExecute = processArgs(['inspect']);
            const executionResults = await executeParsedCommands(commandsToExecute, [mockLib]);
            expect(executionResults).toHaveLength(1);
            const result = executionResults[0];
            expect(result.error).toBeDefined();
            expect(result.error?.message).toMatch(/spawn failed/i);
          });
        });
  
        it('should echo empty string argument (REPL)', () => {
          // Wrap the function for the test
          const mockLib = {
            echo: DefineFunction({
              description: echoLib.echo.description || 'mock',
              args: z.tuple([]).rest(z.string().describe('messages')),
              function: echoLib.echo.function
            })
          };
          const commandsToExecute = processArgs(['echo ""']);
          const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
          expect(executionResults).toHaveLength(1);
          const result = executionResults[0];
          expect(result.error).toBeUndefined();
          expect(result.result).toBe('');
        });
  
        it('should echo with empty string in between (REPL)', () => {
          // Wrap the function for the test
          const mockLib = {
            echo: DefineFunction({
              description: echoLib.echo.description || 'mock',
              args: z.tuple([]).rest(z.string().describe('messages')),
              function: echoLib.echo.function
            })
          };
          const commandsToExecute = processArgs(['echo a "" b']);
          const executionResults = executeParsedCommands(commandsToExecute, [mockLib]);
          expect(executionResults).toHaveLength(1);
          const result = executionResults[0];
          expect(result.error).toBeUndefined();
          expect(result.result).toBe('a  b');
        });
      });
    });
});