#!/usr/bin/env node
// Removed import 'reflect-metadata'; - Add back if needed elsewhere

import * as calculator from './calculator-lib';
import * as echoLib from './echo-lib';
import * as helloLib from './hello-lib';
import { runCli } from './cli-lib';
import { runApi } from './api-lib';
import { runMcp } from './mcp-lib';
import { runRepl } from './repl-lib';
import process from 'process'; // Import process for argv

// --- Type Definitions ---
// Define the basic structure for library functions
type LibraryFunction = (...args: any[]) => any;

// Removed ArgType and CommandMetadata definitions

// --- Libraries --- 

// Combine libraries into a single array
const libraries: Record<string, LibraryFunction>[] = [
    calculator,
    echoLib,
    helloLib
];

// Removed commandArgTypes metadata object

// --- Argument Parsing and Execution Logic ---
const args = process.argv.slice(2);

if (args.includes('--mcp')) {
    console.log("Starting MCP server...");
    runMcp(libraries);
} else if (args.includes('--api')) {
    console.log("Starting API server...");
    runApi(libraries);
} else if (args.length === 0) {
    console.log("No arguments provided, starting REPL...");
    runRepl(libraries);
} else {
    console.log("Running in CLI mode...");
    // Pass only libraries to runCli
    runCli(libraries);
}
