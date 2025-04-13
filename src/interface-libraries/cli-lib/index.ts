// Import necessary components from the shared module
import { ZodFunction } from 'zod';
import {
    Command,
    processArgs,
    executeParsedCommands,
    isDefinedFunction
} from './shared.js';
// Update import path to point to zod-function-utils
import { DefinedFunctionModule, DefinedFunction, DefineObjectFunction, DefinedObjectFunction } from '../../utils/zod-function-utils.js';
import yargs, { Arguments } from 'yargs';
import { hideBin } from 'yargs/helpers';
import { z, ZodObject, ZodTypeAny, ZodTuple } from 'zod';

// Helper to check if a function was defined with DefineObjectFunction
function isObjectFunction(func: any): func is DefinedObjectFunction<any> {
    // Check if func._def exists and has the argsSchema property
    return typeof func === 'function' && func._def && func._def.hasOwnProperty('argsSchema'); 
}

// Helper to convert Zod schema type to yargs option type
function zodTypeToYargsType(zodType: ZodTypeAny): 'string' | 'number' | 'boolean' | 'array' | undefined {
    if (zodType instanceof z.ZodString) return 'string';
    if (zodType instanceof z.ZodNumber) return 'number';
    if (zodType instanceof z.ZodBoolean) return 'boolean';
    if (zodType instanceof z.ZodArray) return 'array';
    if (zodType instanceof z.ZodEnum) return 'string'; // Enums are treated as strings
    if (zodType instanceof z.ZodOptional || zodType instanceof z.ZodDefault) {
        // Look inside optional/default wrappers
        return zodTypeToYargsType(zodType._def.innerType);
    }
    // Add more mappings if needed (e.g., for dates)
    return 'string'; // Default or fallback type
}

// --- CLI Entry Point ---
export const runCli = async (libraries: DefinedFunctionModule[]) => {
    const cli = yargs(hideBin(process.argv));

    console.log("Setting up CLI commands...");

    libraries.forEach(library => {
        Object.entries(library).forEach(([commandName, func]) => {
            if (isObjectFunction(func)) {
                const commandDef = func._def;
                const argsSchema = commandDef.argsSchema;
                
                cli.command(
                    commandName, // Use just the command name
                    commandDef.description || `Executes the ${commandName} command.`, 
                    (yargsInstance) => {
                        // Define ALL args from Zod schema as options
                        Object.entries(argsSchema.shape).forEach(([optionName, zodTypeUntyped]) => {
                            const zodType = zodTypeUntyped as ZodTypeAny;
                            const isOptional = zodType.isOptional() || zodType._def.typeName === 'ZodDefault';
                            
                            // Yargs automatically handles kebab-case for argv keys like noGitignore
                            yargsInstance.option(optionName, {
                                type: zodTypeToYargsType(zodType),
                                describe: zodType.description || `Argument for ${optionName}`, 
                                demandOption: !isOptional, 
                                default: zodType._def.typeName === 'ZodDefault' ? zodType._def.defaultValue() : undefined,
                                // Consider adding aliases if desired (e.g., alias: 'o')
                            });
                        });
                        return yargsInstance;
                    },
                    async (argv) => {
                        try {
                            const functionArgs: Record<string, unknown> = {};
                            // Collect all args provided by yargs
                            Object.keys(argsSchema.shape).forEach(key => {
                                if (argv.hasOwnProperty(key)) {
                                     functionArgs[key] = argv[key];
                                }
                            });
                            // Zod validation remains important
                            const validatedArgs = argsSchema.parse(functionArgs);
                            
                            // Call the implemented function directly with the validated arguments object
                            const result = await func(validatedArgs);

                            // Print result using process.stdout.write
                            if (result !== undefined) {
                                if (typeof result === 'object' && result !== null) {
                                    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
                                } else {
                                    process.stdout.write(String(result) + '\n');
                                }
                            }
                        } catch (error: any) {
                            // Rethrow to let the .fail handler manage output
                            throw error;
                        }
                    }
                );
            } else if (isDefinedFunction(func)) {
                const commandDef = func._def;
                const argTupleSchema = commandDef.args as z.ZodTuple<any, any>;
                const fixedArgsSchemas = argTupleSchema._def.items || [];
                const restArgSchema = argTupleSchema._def.rest;

                // Construct the command string for yargs signature
                let commandString = commandName;
                const positionalArgDefs: { name: string; describe: string; type: 'string' | 'number' | 'boolean' | 'array'; isOptional: boolean; isRest: boolean }[] = [];

                fixedArgsSchemas.forEach((itemSchema: z.ZodTypeAny, index: number) => {
                    const name = itemSchema.description?.replace(/\s+/g, '') || `arg${index}`; // Use description for name, remove spaces
                    const isOptional = itemSchema.isOptional();
                    const yargsType = zodTypeToYargsType(itemSchema) || 'string'; // Default to string
                    commandString += isOptional ? ` [${name}]` : ` <${name}>`;
                    positionalArgDefs.push({ name, describe: itemSchema.description || `Argument ${index + 1}`, type: yargsType, isOptional, isRest: false });
                });

                if (restArgSchema) {
                    const name = restArgSchema.description?.replace(/\s+/g, '') || 'restArgs'; // Use description for name, remove spaces
                    const yargsType = zodTypeToYargsType(restArgSchema) || 'string';
                    commandString += ` [${name}...]`; // Yargs syntax for rest args
                    positionalArgDefs.push({ name, describe: restArgSchema.description || `Additional arguments`, type: yargsType, isOptional: true, isRest: true }); // Rest are always optional array
                }

                cli.command(
                    commandString, // Dynamic command signature
                    commandDef.description || `Executes the ${commandName} command with positional args.`,
                    (yargsInstance) => {
                        // Define positional arguments using the collected definitions
                        positionalArgDefs.forEach(argDef => {
                            if (!argDef.isRest) {
                                yargsInstance.positional(argDef.name, {
                                    describe: argDef.describe,
                                    type: argDef.type === 'array' ? 'string' : argDef.type,
                                    // demandOption is handled by <arg> vs [arg] in command string
                                    // default: // Handle defaults if needed from ZodDefault
                                });
                            }
                            // No explicit definition needed for rest args in yargsInstance.positional
                            // if the `...` syntax is used in the command string.
                        });
                        return yargsInstance;
                    },
                    async (argv) => {
                        try {
                            // --- Argument Extraction and Validation ---
                            const commandArgv = argv as Arguments;
                            // We will extract args directly from commandArgv[argName]
                            // const positionalValues = commandArgv._ ? commandArgv._.slice(1) : []; // No longer needed

                            const finalCallArgs: any[] = [];
                            // let positionalIndex = 0; // No longer needed

                            // 1. Process Fixed Args (Extract directly from argv[argName])
                            for (let i = 0; i < fixedArgsSchemas.length; i++) {
                                const schema = fixedArgsSchemas[i];
                                const argDef = positionalArgDefs[i];
                                const argName = argDef?.name; // Get the name used to define the positional arg

                                if (!argName) {
                                    // Should not happen if positionalArgDefs is built correctly
                                    throw new Error(`Internal error: Could not determine argument name for schema at index ${i}`);
                                }

                                const isOptional = schema.isOptional() || schema instanceof z.ZodDefault;
                                const providedValue = commandArgv[argName];

                                if (providedValue === undefined || providedValue === null) {
                                    // If argument is missing from argv
                                    if (schema instanceof z.ZodDefault) {
                                        finalCallArgs.push(schema._def.defaultValue());
                                    } else if (isOptional) {
                                        finalCallArgs.push(undefined);
                                    } else {
                                        throw new Error(`Missing required argument: ${argDef.describe}`); // Use description for error
                                    }
                                } else {
                                    // Argument provided, parse it
                                    try {
                                        // Pass the value from argv directly to Zod parse
                                        const parsedValue = schema.parse(providedValue);
                                        finalCallArgs.push(parsedValue);
                                    } catch (parseError) {
                                        if (parseError instanceof z.ZodError) {
                                            // Use description in error message
                                            throw new Error(`Invalid argument '${providedValue}' for ${argDef.describe}: ${parseError.errors[0].message}`);
                                        }
                                        throw parseError;
                                    }
                                    // positionalIndex++; // No longer needed
                                }
                            }

                            // 2. Process Rest Args (Still extract from named property in argv)
                            if (restArgSchema) {
                                const restArgDef = positionalArgDefs.find(p => p.isRest);
                                const restArgName = restArgDef?.name;

                                if (restArgName && commandArgv[restArgName] !== undefined) {
                                    const restValuesRaw = commandArgv[restArgName];
                                    const restValuesArray = Array.isArray(restValuesRaw) ? restValuesRaw : [restValuesRaw];
                                    const restArraySchema = z.array(restArgSchema);
                                    try {
                                        const parsedRestArgs = restArraySchema.parse(restValuesArray);
                                        finalCallArgs.push(...parsedRestArgs);
                                    } catch (parseError) {
                                        if (parseError instanceof z.ZodError) {
                                            const firstError = parseError.errors[0];
                                            const errorPathIndex = firstError.path[0] as number;
                                            const errorValue = restValuesArray[errorPathIndex];
                                            // Use description for error message
                                            throw new Error(`Invalid value for ${restArgDef?.describe || 'additional arguments'} #${errorPathIndex + 1} ('${errorValue}'): ${firstError.message}`);
                                        }
                                        throw parseError;
                                    }
                                } else {
                                     // No rest args provided - this is fine
                                }
                            } // No need for the `else if (positionalIndex < positionalValues.length)` check anymore

                            // --- Execution ---
                             const returnsPromise = commandDef.returns instanceof z.ZodPromise;

                             // ADD DEBUG LOG HERE - REMOVE THIS
                             // console.error("[DEBUG] About to call func with args:", finalCallArgs);

                             const result = returnsPromise ? await func(...finalCallArgs) : func(...finalCallArgs);

                             // Restore standard write
                             if (result !== undefined) {
                                if (typeof result === 'object' && result !== null) {
                                    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
                                } else {
                                    process.stdout.write(String(result) + '\n');
                                }
                             }

                        } catch (error: any) {
                            // console.error(`[DEBUG CLI Positional] Error caught in handler:`, error);
                            throw error;
                        }
                    }
                );
            }
        });
    });

    cli
        .demandCommand(1, 'You must specify a command.')
        .help()
        .alias('h', 'help')
        .strict() // Important: Fail on unknown options
        .wrap(cli.terminalWidth())
        .fail((msg, err, yargs) => {
             if (err) {
                // If it's a ZodError from our handler, format it nicely
                if (err instanceof z.ZodError) {
                    console.error("Argument Validation Error:");
                    err.errors.forEach(e => {
                         console.error(`  - ${e.path.join('.') || 'Argument'}: ${e.message}`);
                    });
                } else {
                    console.error("Error:", err.message);
                }
                process.exit(1);
             } else if (msg) {
                console.error("Error:", msg);
                console.error("\nUsage:");
                yargs.showHelp();
                process.exit(1);
             }
        })
        // console.log(">>> Yargs parsing starting..."); // Remove diagnostic log
        await cli.parse();
};