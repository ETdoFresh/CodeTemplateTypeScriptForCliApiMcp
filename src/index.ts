#!/usr/bin/env node

// Restore static imports
import * as calculator from './command-libraries/calculator-lib';
import * as echoLib from './command-libraries/echo-lib';
import * as helloLib from './command-libraries/hello-lib';
import { runCli } from './interface-libraries/cli-lib';
import { runApi } from './interface-libraries/api-lib';
import { runMcp } from './interface-libraries/mcp-lib';
import { runRepl } from './interface-libraries/repl-lib';
import { runCliJson } from './interface-libraries/cli-json-lib';
import * as repopackLib from './command-libraries/repopack-lib';
import process from 'process';
import { ZodFunction } from 'zod';

// Keep allLibraries map, simplify if possible
const allLibraries: Record<string, Record<string, ZodFunction<any, any>>> = {
    calculator: calculator as unknown as Record<string, ZodFunction<any, any>>,
    echo: echoLib as unknown as Record<string, ZodFunction<any, any>>,
    hello: helloLib as unknown as Record<string, ZodFunction<any, any>>,
    repopack: repopackLib as unknown as Record<string, ZodFunction<any, any>>,
};

// Convert allLibraries map to the array format expected by run* functions
const loadedLibraries: Record<string, ZodFunction<any, any>>[] = Object.values(allLibraries);

// Simplified argument parsing (similar to pre-config state)
const args = process.argv.slice(2);

// --- Execution Logic (Simplified, based on args) ---
if (args.includes('--mcp')) {
    console.log("Starting MCP server...");
    runMcp(loadedLibraries);
} else if (args.includes('--api')) {
    console.log("Starting API server...");
    runApi(loadedLibraries);
} else if (args.includes('--json')) {
    console.log("Starting JSON CLI...");
    // runCliJson will read process.argv directly now
    runCliJson(loadedLibraries);
} else if (args.length === 0 || args.includes('--repl')) {
    // Start REPL if no args or --repl is explicitly given
    console.log("Starting REPL CLI...");
    runRepl(loadedLibraries);
} else {
    // Assume remaining args are for the standard CLI
    console.log("Arguments provided, starting standard CLI...");
    // runCli will read process.argv directly now
    runCli(loadedLibraries);
}
