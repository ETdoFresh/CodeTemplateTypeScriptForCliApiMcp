#!/usr/bin/env node


// Command Libraries
import * as calculatorLib from './command-libraries/calculator-lib';
import * as echoLib from './command-libraries/echo-lib';
import * as helloLib from './command-libraries/hello-lib';
import * as repopackLib from './command-libraries/repopack-lib';
import * as inspectLib from './command-libraries/inspect-lib';
import * as openrouterLib from './command-libraries/openrouter-lib';

// Interface Libraries
import { runCli } from './interface-libraries/cli-lib';
import { runApi } from './interface-libraries/api-lib';
import { runMcp } from './interface-libraries/mcp-lib';
import { runRepl } from './interface-libraries/repl-lib';
import { runJson } from './interface-libraries/cli-json-lib';

// Function Definitions
import { FunctionDefinition } from './system/command-types.js';

import process from 'process';
import fs from 'fs';
import dotenv from 'dotenv';

// Utils
// import { DefinedFunctionModule } from './utils/zod-function-utils'; // REMOVE THIS LINE

// Load Environment Variables
dotenv.config();

// Flatten into a single array of FunctionDefinitions for runCli, runMcp, runRepl
const allCommandDefinitions: FunctionDefinition[] = [
    ...Object.values(calculatorLib),
    ...Object.values(echoLib),
    ...Object.values(helloLib),
    ...Object.values(repopackLib),
    ...Object.values(inspectLib),
    ...Object.values(openrouterLib),
].filter(value => typeof value === 'object' && value !== null && 'name' in value && 'function' in value); // Ensure we only include valid FunctionDefinitions

// Create a grouped array for runApi, runJson
const groupedCommandDefinitions: FunctionDefinition[][] = [
    Object.values(calculatorLib),
    Object.values(echoLib),
    Object.values(helloLib),
    Object.values(repopackLib),
    Object.values(inspectLib),
    Object.values(openrouterLib),
].map(lib => lib.filter(value => typeof value === 'object' && value !== null && 'name' in value && 'function' in value)); // Ensure inner arrays only contain valid FunctionDefinitions

// Simplified argument parsing (Removes node executable and script name)
const args = process.argv.slice(2);

// --- Execution Logic (Wrap in Async IIFE to allow top-level await) ---
(async () => {
    // Only log startup messages if not in test environment
    const isTestEnv = process.env.NODE_ENV === 'test';

    if (args.includes('--mcp')) {
        if (!isTestEnv) console.log("Starting MCP Server...");
        await runMcp(allCommandDefinitions); // Pass flat array
    } else if (args.includes('--api')) {
        if (!isTestEnv) console.log("Starting API Server...");
        await runApi(groupedCommandDefinitions); // Pass grouped array
    } else if (args.includes('--json')) {
        if (!isTestEnv) console.log("Starting CLI with JSON Argument...");
        await runJson(groupedCommandDefinitions); // Pass grouped array
    } else if (args.length === 0 || args.includes('--repl')) {
        if (!isTestEnv) console.log("Starting Read Eval Print Loop...");
        await runRepl(allCommandDefinitions); // Pass flat array
    } else { // Has Arguments and not --mcp, --api, or --json
        if (!isTestEnv) console.log("Starting Command Line Interface...");
        await runCli(allCommandDefinitions); // Pass the flat array
    }
})();
