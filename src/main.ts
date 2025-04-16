#!/usr/bin/env node

// --- Command Libraries (Using Path Aliases) ---
import * as calculatorLib from '@libs/calculator';
import * as echoLib from '@libs/echo';
import * as helloLib from '@libs/hello';
import * as repopackLib from '@libs/repopack';
import * as inspectLib from '@libs/inspect';
import * as openrouterLib from '@libs/openrouter';

// --- Interface Libraries (Using Path Aliases) ---
import { runCli } from '@ui/cli';
import { runApi } from '@ui/api';
import { runMcp } from '@ui/mcp';
import { runRepl } from '@ui/repl';
import { runJson } from '@ui/json';

// --- System Imports (Using Path Alias - Requires command-types.js to export correctly) ---
// Note: The system alias might need adjustment if command-types.js isn't the main export
import { FunctionDefinition, LibraryDefinition } from '@system/command-types.js'; // Alias points to src/system/*

// --- Core Node Modules ---
import process from 'process';
import dotenv from 'dotenv';

// Load Environment Variables
dotenv.config();

// --- Assemble Libraries ---
// Each library is an imported module containing FunctionDefinitions
const allLibraryModules = [
    calculatorLib,
    echoLib,
    helloLib,
    repopackLib,
    inspectLib,
    openrouterLib,
];

// Map modules to LibraryDefinition structure expected by interfaces
const allFunctionDefinitions: LibraryDefinition[] = allLibraryModules.map(libModule => {
    // Filter out non-function exports and ensure they match the FunctionDefinition shape
    const functions = Object.values(libModule).filter(
        value => typeof value === 'object' && value !== null && 'name' in value && 'function' in value && 'arguments' in value
    ) as FunctionDefinition[];

    if (functions.length === 0) {
         console.warn(`[main.ts] Warning: Module did not contain any valid FunctionDefinitions.`);
         // Decide how to handle modules with no functions - filter them out?
    }

    return { functions };
}).filter(libDef => libDef.functions.length > 0); // Filter out libraries with no functions found


// --- Argument Parsing & Execution Logic ---
const args = process.argv.slice(2);
const isTestEnv = process.env.NODE_ENV === 'test';

(async () => {
    if (args.includes('--mcp')) {
        if (!isTestEnv) console.log("Starting MCP Server...");
        // runMcp expects LibraryDefinition[]
        await runMcp(allFunctionDefinitions);
    } else if (args.includes('--api')) {
        if (!isTestEnv) console.log("Starting API Server...");
         // runApi expects LibraryDefinition[]
        await runApi(allFunctionDefinitions);
    } else if (args.includes('--json')) {
         if (!isTestEnv) console.log("Starting CLI with JSON Argument...");
         // runJson expects LibraryDefinition[]
         await runJson(allFunctionDefinitions);
    } else if (args.length === 0 || args.includes('--repl')) {
        if (!isTestEnv) console.log("Starting Read Eval Print Loop...");
         // runRepl expects LibraryDefinition[]
        await runRepl(allFunctionDefinitions);
    } else { // Default to standard CLI
        if (!isTestEnv) console.log("Starting Command Line Interface...");
        // runCli expects LibraryDefinition[]
        await runCli(allFunctionDefinitions);
    }
})();
