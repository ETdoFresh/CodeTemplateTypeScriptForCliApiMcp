#!/usr/bin/env node

// Command Libraries
import * as calculatorLib from './command-libraries/calculator-lib';
import * as echoLib from './command-libraries/echo-lib';
import * as helloLib from './command-libraries/hello-lib';
import * as repopackLib from './command-libraries/repopack-lib';

// Interface Libraries
import { runCli } from './interface-libraries/cli-lib';
import { runApi } from './interface-libraries/api-lib';
import { runMcp } from './interface-libraries/mcp-lib';
import { runRepl } from './interface-libraries/repl-lib';
import { runJson } from './interface-libraries/cli-json-lib';

// Process
import process from 'process';

// Utils
import { DefinedFunctionModule } from './utils/zod-function-utils';

// Load Command Libraries
const commandLibraries: DefinedFunctionModule[] = [
    calculatorLib,
    echoLib,
    helloLib,
    repopackLib,
];

// Simplified argument parsing (Removes node executable and script name)
const args = process.argv.slice(2);

// --- Execution Logic (Wrap in Async IIFE to allow top-level await) ---
(async () => {
    if (args.includes('--mcp')) {
        console.log("Starting MCP Server...");
        await runMcp(commandLibraries); // Await if runMcp is async
    } else if (args.includes('--api')) {
        console.log("Starting API Server...");
        await runApi(commandLibraries); // Await if runApi is async
    } else if (args.includes('--json')) {
        console.log("Starting CLI with JSON Argument...");
        await runJson(commandLibraries); // Await if runJson is async
    } else if (args.length === 0 || args.includes('--repl')) {
        console.log("Starting Read Eval Print Loop...");
        await runRepl(commandLibraries); // Await if runRepl is async
    } else { // Has Arguments and not --mcp, --api, or --json
        console.log("Starting Command Line Interface...");
        await runCli(commandLibraries); // Await runCli
    }
})();
