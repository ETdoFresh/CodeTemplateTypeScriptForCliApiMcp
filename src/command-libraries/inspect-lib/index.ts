import { FunctionDefinition, ArgumentDefinition } from '../../system/command-types';
import * as path from 'path';
import { spawn } from 'child_process'; // Use direct import for spawn

/**
 * Runs the MCP Inspector against this CLI.
 */
export const inspect: FunctionDefinition = {
  name: 'inspect',
  description: 'Runs the @modelcontextprotocol/inspector against this CLI application.',
  arguments: [],
  returnType: {
    name: 'status',
    type: 'string', // Placeholder for Promise<void>
    description: 'Indicates completion status (Promise resolves on success)',
  },
  function: async () => {
    const projectRoot = process.cwd();
    // Construct the absolute path to the CLI entry point
    const cliPathRaw = path.join(projectRoot, 'dist', 'index.js');
    // Replace single backslashes with double backslashes for robustness in shell commands
    const cliPath = cliPathRaw.replace(/\\/g, '\\\\');
    // Updated command based on user edit
    const command = `npx @modelcontextprotocol/inspector node \"${cliPath}\" --mcp`;

    console.log(`Executing inspector: ${command}`);
    try {
      // Execute the command and stream output to the console
      const child = spawn(command, [], {
        shell: true, // Use shell to handle npx resolution
        stdio: 'inherit' // Pipe child process stdio to parent
      });

      return new Promise<void>((resolve, reject) => {
        child.on('close', (code) => {
          if (code === 0) {
            console.log('Inspector finished successfully.');
            resolve();
          } else {
            console.error(`Inspector exited with code ${code}`);
            reject(new Error(`Inspector failed with exit code ${code}`));
          }
        });
        child.on('error', (err) => {
          console.error('Failed to start inspector:', err);
          reject(err);
        });
      });

    } catch (error: any) {
      console.error(`Error running inspector: ${error.message}`);
      throw new Error(`Failed to execute inspector: ${error.message}`);
    }
  }
};