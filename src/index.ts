#!/usr/bin/env node

import * as calculator from './calculator-lib';
import * as echoLib from './echo-lib';
import { runCli } from './cli-lib';
import { runApi } from './api-lib';
import { runMcp } from './mcp-lib';
import { runRepl } from './repl-lib';
import process from 'process'; // Import process for argv

const libraries: Record<string, (...args: string[]) => any>[] = [
    calculator,
    echoLib
];

// --- Argument Parsing and Execution Logic ---
const args = process.argv.slice(2); // Get args, excluding 'node' and script path

if (args.includes('--mcp')) {
    console.log("Starting MCP server...");
    runMcp(libraries);
} else if (args.includes('--api')) {
    console.log("Starting API server...");
    // You might want to parse a port number here if needed, e.g., from --api=PORT
    runApi(libraries); // Assuming default port for now
} else if (args.length === 0) {
    console.log("No arguments provided, starting REPL...");
    runRepl(libraries);
} else {
    console.log("Running in CLI mode...");
    // Pass the original args (which don't include --mcp or --api) to runCli
    // Need to adjust runCli to handle this or re-insert the command name
    // For now, let's assume runCli expects the command as the first arg
    // We need to simulate this structure for runCli based on the original process.argv
    // This requires restructuring how runCli is called or how it parses args.
    // A simpler approach for now is to let runCli handle process.argv directly.
    // Let's modify runCli to directly use process.argv if called this way.
    // *** OR *** we adjust this entry point. Let's adjust here first.

    // Modify runCli call to explicitly pass the arguments as if they were the only ones
    runCli(libraries); // runCli already uses process.argv.slice(2) internally
}
