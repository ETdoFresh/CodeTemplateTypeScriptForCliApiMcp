import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';
import { processArgs, executeParsedCommands } from '../src/interface-libraries/cli-lib/shared';
// Corrected import path for calculator-lib
import * as calculatorLib from '../src/command-libraries/calculator-lib/index';
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
    // ... other CLI tests ...
  });

  // --- REPL Logic Tests ---

  describe('REPL Logic', () => {
    it('should coerce positional arguments for add command (simulate REPL)', () => {
      // Construct the command library object as expected by executeParsedCommands
      const calcLib = {
        add: calculatorLib.add,
        subtract: calculatorLib.subtract,
        multiply: calculatorLib.multiply,
        divide: calculatorLib.divide
      };

      // Debug: print structure of add function
      // eslint-disable-next-line no-console
      console.log('calculatorLib.add keys:', Object.keys(calculatorLib.add));
      // eslint-disable-next-line no-console
      console.log('calculatorLib.add typeof:', typeof calculatorLib.add);
      // eslint-disable-next-line no-console
      console.log('calculatorLib.add._def keys:', Object.keys(calculatorLib.add._def));
      // eslint-disable-next-line no-console
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log('calculatorLib.add._def.function:', (calculatorLib.add._def as any).function);

      // Patch: Attach the implementation function to the _def object for test compatibility

      // Simulate REPL input: "add 1 2 3"
      const commandsToExecute = processArgs(['add 1 2 3']);
      const executionResults = executeParsedCommands(commandsToExecute, [calcLib]);

      expect(executionResults).toHaveLength(1);
      const result = executionResults[0];
      expect(result.error).toBeUndefined();
      expect(result.result).toBe(6);
    });
  });

});