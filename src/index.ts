#!/usr/bin/env node

// Restore static imports
import * as calculator from './calculator-lib';
import * as echoLib from './echo-lib';
import * as helloLib from './hello-lib';
import { runCli } from './cli-lib';
import { runApi } from './api-lib';
import { runMcp } from './mcp-lib';
import { runRepl } from './repl-lib';
import { runCliJson } from './cli-json-lib';
import * as repopackLib from './repopack-lib';
import { LibraryFunction } from './cli-lib/shared';
import process from 'process';
import fs from 'fs';
import path from 'path';
// Remove url import - no longer needed
// import url from 'url';
// const { pathToFileURL } = url;

// --- Define Default Configuration ---
interface Config {
    libraries: string[]; // Expects names like 'calculator' now
    options: {
        mcp: boolean;
        api: boolean;
        json: boolean;
        repl: boolean;
        cli: boolean;
    };
    defaultInterface: 'repl' | 'cli' | 'api' | 'mcp' | 'json';
}

const defaultConfig: Config = {
    // Update default libraries back to names
    libraries: ['calculator', 'echo', 'hello', 'repopack'], // Add repopack to defaults
    options: {
        mcp: true,
        api: true,
        json: true, // This option might depend on the missing module
        repl: true,
        cli: true,
    },
    defaultInterface: 'repl', // Keep user's default setting
};

// Reintroduce allLibraries map for static modules
const allLibraries: Record<string, Record<string, LibraryFunction>> = {
    calculator: calculator,
    echo: echoLib,
    hello: helloLib,
    repopack: repopackLib, // Add repopack to the map
};

// Wrap execution in an async function (still useful if any run* function becomes async)
async function main() {
    // Remove ESM __dirname calculation - no longer needed
    // const __filename = url.fileURLToPath(import.meta.url);
    // const __dirname = path.dirname(__filename);

    // --- Argument Parsing and Config Loading ---
    const args = process.argv.slice(2);
    let effectiveConfig = { ...defaultConfig }; // Start with defaults
    let processedArgs = [...args]; // Create a copy to modify

    const configIndex = processedArgs.indexOf('--config');
    if (configIndex > -1 && processedArgs.length > configIndex + 1) {
        const configPath = path.resolve(processedArgs[configIndex + 1]);
        console.log(`Loading configuration from: ${configPath}`);
        try {
            const configFileContent = fs.readFileSync(configPath, 'utf-8');
            const parsedConfig = JSON.parse(configFileContent);
            const customConfig = parsedConfig as Partial<Config>;

            effectiveConfig = {
                ...defaultConfig,
                ...customConfig,
                libraries: Array.isArray(customConfig.libraries)
                    ? customConfig.libraries
                    : defaultConfig.libraries,
                options: {
                    ...defaultConfig.options,
                    ...(customConfig.options || {}),
                },
                // Ensure defaultInterface is merged correctly
                defaultInterface: customConfig.defaultInterface || defaultConfig.defaultInterface,
            };
            console.log("Configuration loaded successfully.");
            processedArgs.splice(configIndex, 2);
        } catch (error: any) {
            console.error(`Error loading or parsing config file at ${configPath}: ${error.message}`);
            console.log("Using default configuration.");
        }
    } else {
        console.log("No --config specified or path missing, using default configuration.");
    }

    // --- Load Libraries Based on Config (using static map) ---
    const loadedLibraries: Record<string, LibraryFunction>[] = [];
    console.log("Attempting to enable libraries based on config:", effectiveConfig.libraries);

    for (const libName of effectiveConfig.libraries) {
        const libraryModule = allLibraries[libName];
        if (libraryModule) {
            loadedLibraries.push(libraryModule);
            console.log(`Enabled library: ${libName}`);
        } else {
            console.warn(`Warning: Library "${libName}" specified in config but not found in available static libraries.`);
        }
    }

    // Remove dynamic import loop and related code
    // for (const libPath of effectiveConfig.libraries) { ... }

    if (loadedLibraries.length === 0) {
        console.warn("Warning: No valid libraries enabled based on configuration. CLI might not function correctly.");
    } else {
         const enabledNames = loadedLibraries.map(lib =>
            Object.keys(allLibraries).find(name => allLibraries[name] === lib)
         ).filter(name => name !== undefined);
         console.log("Enabled libraries:", enabledNames);
    }


    // --- Execution Logic Based on Config and *Processed* Args ---
    if (effectiveConfig.options.mcp && processedArgs.includes('--mcp')) {
        console.log("Starting MCP server...");
        runMcp(loadedLibraries);
    } else if (effectiveConfig.options.api && processedArgs.includes('--api')) {
        console.log("Starting API server...");
        runApi(loadedLibraries);
    } else if (effectiveConfig.options.repl && processedArgs.includes('--repl')) {
        // Explicit --repl flag
        console.log("Starting REPL CLI...");
        runRepl(loadedLibraries);
    } else if (effectiveConfig.options.json && processedArgs.includes('--json')) {
        // Explicit --json flag
        console.log("Starting JSON CLI...");
        const jsonArgs = processedArgs.filter(arg => arg !== '--json'); // Remove the flag itself
        // Pass remaining args - requires runCliJson to accept second arg
        runCliJson(loadedLibraries, jsonArgs);
    } else if (processedArgs.length === 0) {
        // No arguments provided (after removing --config) -> Use default interface
        console.log("No arguments provided, starting default interface based on configuration...");
        switch (effectiveConfig.defaultInterface) {
            case 'cli':
                if (effectiveConfig.options.cli) {
                    console.log("Running default CLI interface (no args)...");
                    // Pass empty args array to CLI
                    runCli(loadedLibraries, []);
                } else {
                    console.log("Default interface is CLI, but CLI mode is disabled in configuration.");
                }
                break;
            case 'json':
                 if (effectiveConfig.options.json) {
                    console.log("Running default JSON interface (no args)...");
                    // Pass empty args array to JSON CLI
                    runCliJson(loadedLibraries, []);
                 } else {
                    console.log("Default interface is JSON, but JSON mode is disabled in configuration.");
                 }
                 break;
            case 'repl':
                 if (effectiveConfig.options.repl) {
                    console.log("Running default REPL interface...");
                    runRepl(loadedLibraries);
                 } else {
                    console.log("Default interface is REPL, but REPL mode is disabled in configuration.");
                 }
                 break;
            case 'api':
                 if (effectiveConfig.options.api) {
                    console.log("Running default API interface...");
                    runApi(loadedLibraries);
                 } else {
                    console.log("Default interface is API, but API mode is disabled in configuration.");
                 }
                 break;
            case 'mcp':
                 if (effectiveConfig.options.mcp) {
                    console.log("Running default MCP interface...");
                    runMcp(loadedLibraries);
                 } else {
                     console.log("Default interface is MCP, but MCP mode is disabled in configuration.");
                 }
                 break;
            default:
                const exhaustiveCheck: never = effectiveConfig.defaultInterface;
                console.log(`Unknown or invalid default interface specified: ${exhaustiveCheck}`);
                console.log("Usage: node index.js [--config <path>] [--mcp | --api | --json | --repl | <cli_args>]");
        }
    } else {
        // Arguments provided, and they are not the explicit flags handled above
        // This case now correctly means CLI args are present for the default CLI/JSON interface
        console.log("Arguments provided, attempting to use default CLI/JSON interface...");
        switch (effectiveConfig.defaultInterface) {
            case 'cli':
                if (effectiveConfig.options.cli) {
                    console.log("Running default CLI interface with provided arguments...");
                    runCli(loadedLibraries, processedArgs); // Pass the actual remaining args
                } else {
                    console.log("Arguments provided for CLI, but CLI mode is disabled in configuration.");
                }
                break;
            case 'json':
                 if (effectiveConfig.options.json) {
                    console.log("Running default JSON interface with provided arguments...");
                    runCliJson(loadedLibraries, processedArgs); // Pass the actual remaining args
                 } else {
                    console.log("Arguments provided for JSON, but JSON mode is disabled in configuration.");
                 }
                 break;
            // REPL, API, MCP typically don't handle arguments this way, show usage
            case 'repl':
            case 'api':
            case 'mcp':
                console.log(`Arguments provided, but the default interface ('${effectiveConfig.defaultInterface}') does not accept direct arguments.`);
                console.log("Did you mean to use an explicit flag like --mcp, --api, --repl, or --json? Or provide arguments for the CLI?");
                console.log("Usage: node index.js [--config <path>] [--mcp | --api | --json | --repl | <cli_args>]");
                break;
            default:
                // Should not happen due to type safety
                const exhaustiveCheck2: never = effectiveConfig.defaultInterface;
                console.log(`Unknown or invalid default interface specified: ${exhaustiveCheck2}`);
                console.log("Usage: node index.js [--config <path>] [--mcp | --api | --json | --repl | <cli_args>]");
        }
    }
}

// Execute the main async function
main().catch(error => {
    console.error("An unexpected error occurred:", error);
    process.exit(1);
});
