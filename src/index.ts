#!/usr/bin/env node

import * as calculator from './calculator-lib';
import * as echoLib from './echo-lib';
import * as helloLib from './hello-lib';
import { runCli } from './cli-lib';
import { runApi } from './api-lib';
import { runMcp } from './mcp-lib';
import { runRepl } from './repl-lib';
import { runCliJson } from './cli-json-lib';
import { LibraryFunction } from './cli-lib/shared';
import process from 'process'; // Import process for argv

// --- Libraries --- 
const libraries: Record<string, LibraryFunction>[] = [
    calculator,
    echoLib,
    helloLib
];

// --- Argument Parsing and Execution Logic ---
const args = process.argv.slice(2);

if (args.includes('--mcp')) {
    console.log("Starting MCP server...");
    runMcp(libraries);
} else if (args.includes('--api')) {
    console.log("Starting API server...");
    runApi(libraries);
} else if (args.includes('--json')) {
    console.log("Starting JSON CLI...");
    runCliJson(libraries);
} else if (args.length === 0) {
    console.log("No arguments provided, starting REPL CLI...");
    runRepl(libraries);
} else {
    console.log("Arguments provided, starting standard CLI...");
    runCli(libraries);
}
