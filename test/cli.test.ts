// test/cli.test.ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';

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
      const result = runCliCommand('subtract 10 2 3');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('5\n');
    });

    it('should execute multiply command correctly', () => {
      const result = runCliCommand('multiply 2 3 4');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('24\n');
    });

    it('should execute divide command correctly', () => {
      const result = runCliCommand('divide 20 2 5');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('2\n');
    });

    it('should handle division by zero', () => {
      const result = runCliCommand('divide 10 0');
      expect(result.error).toBeDefined(); // Expect an error
      // Check stderr for the specific error message yargs should output
      expect(result.stderr).toContain('Error: Cannot divide by zero'); 
      expect(result.stdout).toBe('');
    });

  });

  // --- Echo Lib Tests ---
  describe('echo-lib', () => {
    it('should execute echo command with multiple types', () => {
      // Use double quotes for the command string passed to the shell,
      // and single quotes or escaped double quotes for the argument string
      const result = runCliCommand('echo "Hello!" 123 true'); 
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('Hello! 123 true\n');
    });

    it('should execute echo command with only strings', () => {
      const result = runCliCommand('echo foo bar baz');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('foo bar baz\n');
    });

    it('should execute echo command with no arguments', () => {
      const result = runCliCommand('echo');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('\n'); // Expect just a newline
    });
  });

  // --- Hello Lib Tests (Add a couple examples) ---
  describe('hello-lib', () => {
    it('should execute helloString command', () => {
      const result = runCliCommand('helloString World');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('Hello, World!\n');
    });

    it('should execute helloStringNumber command', () => {
      const result = runCliCommand('helloStringNumber Message 5');
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('Message: Message, Count: 5\n');
    });

    // TODO: Add tests for other hello-lib commands
  });

  // --- Repopack Lib Tests (Add a placeholder) ---
  describe('repopack-lib', () => {
    // TODO: Add tests for packLocal and packRemote (these might be more complex)
    //       - Test different options (--outputFormat, --outputTarget, etc.)
    //       - Might need to check file system or clipboard content
    //       - Consider mocking dependencies like fs/promises or clipboardy for unit tests
    //       - For CLI integration tests, you might need temporary directories and files
    it.todo('should execute packLocal command');
  });

}); 