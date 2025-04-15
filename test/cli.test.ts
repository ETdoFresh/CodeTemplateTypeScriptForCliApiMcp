import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';

// Helper function to run the CLI command and capture output
const runCliCommand = (args: string[]): { stdout: string; stderr: string; status: number | null } => {
    const cliPath = path.resolve(__dirname, '../dist/index.js'); // Adjust path as needed
    const result = spawnSync('node', [cliPath, ...args], { encoding: 'utf-8' });
    return {
        stdout: result.stdout,
        stderr: result.stderr,
        status: result.status,
    };
};

describe('CLI Tests', () => {

    describe('Command Not Found', () => {
        it('should show an error for an unknown command', () => {
            const { stdout, stderr, status } = runCliCommand(['unknownCommand']);
            expect(status).not.toBe(0);
            expect(stderr).toContain('Error: Command not found: unknownCommand');
        });
    });

    describe('Calculator Commands', () => {
        it('should add numbers', () => {
            const { stdout, stderr, status } = runCliCommand(['add', '10', '5', '3']);
            expect(status).toBe(0);
            expect(stderr).toBe('');
            expect(stdout.trim()).toBe('18'); // Assuming result is printed to stdout
        });

         it('should subtract numbers', () => {
            const { stdout, stderr, status } = runCliCommand(['subtract', '100', '20', '5']);
             expect(status).toBe(0);
             expect(stderr).toBe('');
            expect(stdout.trim()).toBe('75');
        });

        it('should multiply numbers', () => {
            const { stdout, stderr, status } = runCliCommand(['multiply', '2', '3', '4']);
            expect(status).toBe(0);
            expect(stderr).toBe('');
            expect(stdout.trim()).toBe('24');
        });

        it('should divide numbers', () => {
            const { stdout, stderr, status } = runCliCommand(['divide', '100', '10', '2']);
            expect(status).toBe(0);
            expect(stderr).toBe('');
            expect(stdout.trim()).toBe('5');
        });

        it('should handle division by zero', () => {
            const { stdout, stderr, status } = runCliCommand(['divide', '10', '0']);
            expect(status).not.toBe(0);
            expect(stdout).toBe(''); // No result on error
            expect(stderr).toContain('Cannot divide by zero');
        });

         it('should handle missing required args for subtract', () => {
            const { stdout, stderr, status } = runCliCommand(['subtract']);
             expect(status).not.toBe(0);
             expect(stderr).toContain('Missing required argument: initialValue');
        });
    });

    describe('Echo Command', () => {
        it('should echo provided arguments', () => {
            const { stdout, stderr, status } = runCliCommand(['echo', 'hello', 'world', '123']);
            expect(status).toBe(0);
            expect(stderr).toBe('');
            expect(stdout.trim()).toBe('hello world 123');
        });

        it('should handle no arguments to echo', () => {
             const { stdout, stderr, status } = runCliCommand(['echo']);
             expect(status).toBe(0); // Echoing nothing is valid
             expect(stderr).toBe('');
             expect(stdout.trim()).toBe('');
        });

        it('should handle quoted arguments', () => {
            const { stdout, stderr, status } = runCliCommand(['echo', '\"hello there\"', 'world']);
            expect(status).toBe(0);
            expect(stderr).toBe('');
            expect(stdout.trim()).toBe('hello there world');
        });
    });

     describe('Hello Commands', () => {
        it('helloString: should greet with a string', () => {
            const { stdout, stderr, status } = runCliCommand(['helloString', '--name', 'Alice']);
            expect(status).toBe(0);
            expect(stderr).toBe('');
            expect(stdout.trim()).toBe('\"Hello, Alice!\"'); // Assuming JSON string output
        });

         it('helloString: should greet with a positional string', () => {
            const { stdout, stderr, status } = runCliCommand(['helloString', 'Bob']);
            expect(status).toBe(0);
            expect(stderr).toBe('');
            expect(stdout.trim()).toBe('\"Hello, Bob!\"');
        });

         it('helloNumber: should greet with a number', () => {
            const { stdout, stderr, status } = runCliCommand(['helloNumber', '--num', '42']);
            expect(status).toBe(0);
            expect(stderr).toBe('');
            expect(stdout.trim()).toBe('\"Hello, 42!\"');
        });

         it('helloBoolean: should greet with true', () => {
            const { stdout, stderr, status } = runCliCommand(['helloBoolean', '--bool', 'true']);
            expect(status).toBe(0);
            expect(stderr).toBe('');
            expect(stdout.trim()).toBe('\"Hello, true!\"');
        });

        it('helloBoolean: should greet with false', () => {
            const { stdout, stderr, status } = runCliCommand(['helloBoolean', '--bool', 'false']);
            expect(status).toBe(0);
            expect(stderr).toBe('');
            expect(stdout.trim()).toBe('\"Hello, false!\"');
        });

         it('helloStringArray: should greet with a string array', () => {
            // Note: Array input via CLI might be tricky. This assumes space-separated for positional or repeated flags.
            // Adjust based on how your parser actually handles array flags/positionals.
            // Using repeated named args as the parser likely handles this best.
            const { stdout, stderr, status } = runCliCommand(['helloStringArray', '--arr', 'apple', '--arr', 'banana']);
            expect(status).toBe(0);
            expect(stderr).toBe('');
            expect(stdout.trim()).toBe('\"Hello, apple, banana!\"');
        });

        it('helloNumberArray: should greet with a number array', () => {
            const { stdout, stderr, status } = runCliCommand(['helloNumberArray', '--arr', '1', '--arr', '2']);
            expect(status).toBe(0);
            expect(stderr).toBe('');
            expect(stdout.trim()).toBe('\"Hello, 1, 2!\"');
        });

        it('helloBooleanArray: should greet with a boolean array', () => {
             const { stdout, stderr, status } = runCliCommand(['helloBooleanArray', '--arr', 'true', '--arr', 'false']);
             expect(status).toBe(0);
             expect(stderr).toBe('');
             expect(stdout.trim()).toBe('\"Hello, true, false!\"');
        });

         it('helloStringArgs: should greet with rest string args', () => {
            const { stdout, stderr, status } = runCliCommand(['helloStringArgs', 'one', 'two', 'three']);
            expect(status).toBe(0);
            expect(stderr).toBe('');
            expect(stdout.trim()).toBe('\"Hello, one, two, three!\"');
        });

         it('helloStringRestNumbersArgs: should greet with prefix and rest numbers', () => {
            const { stdout, stderr, status } = runCliCommand(['helloStringRestNumbersArgs', '--prefix', 'Count', '10', '20', '30']);
            expect(status).toBe(0);
            expect(stderr).toBe('');
            // Output format adjusted based on function implementation
            expect(stdout.trim()).toBe('\"Prefix: Count, Numbers: [10, 20, 30]\"');
        });

        it('helloStringRestNumbersArgs: should handle missing required prefix', () => {
            const { stdout, stderr, status } = runCliCommand(['helloStringRestNumbersArgs', '10', '20']);
            expect(status).not.toBe(0);
            expect(stderr).toContain('Missing required argument: prefix');
         });
    });


    // --- Placeholder for Repopack commands ---
    // describe('Repopack Commands', () => {
    //  it('packLocal: should pack a local directory', () => {
    //      // Requires setting up a test directory structure
    //      // Might need to test stdout, file, and clipboard outputs separately
    //      // Example: runCliCommand(['packLocal', '--directory', './test-dir', '--outputTarget', 'stdout']);
    //      expect(true).toBe(false); // Placeholder
    //  });
    //  it('packRemote: should pack a remote repository', () => {
    //      // Requires network access and a target repo
    //      // Example: runCliCommand(['packRemote', '--github_repo', 'https://github.com/user/repo', '--outputTarget', 'stdout']);
    //      expect(true).toBe(false); // Placeholder
    //  });
    // });

    // --- Placeholder for Inspect command ---
    // describe('Inspect Command', () => {
    //  it('should run the inspector', () => {
    //      // This runs an external command, might be harder to assert specific output
    //      // Check for exit code 0 and maybe absence of specific error messages in stderr
    //      // const { stderr, status } = runCliCommand(['inspect']);
    //      // expect(status).toBe(0);
    //      // expect(stderr).not.toContain('Error'); // Basic check
    //      expect(true).toBe(false); // Placeholder
    //  });
    // });

    // --- Placeholder for OpenRouter command ---
    // describe('OpenRouter Command', () => {
    //  it('should call OpenRouter API', () => {
    //      // Requires network access and API key (potentially mocked)
    //      // Example: runCliCommand(['call_openrouter', '--prompt', '\"Hello AI\"']);
    //      // Assert based on mocked response or check for API key error if not set
    //      expect(true).toBe(false); // Placeholder
    //  });
    // });

}); 