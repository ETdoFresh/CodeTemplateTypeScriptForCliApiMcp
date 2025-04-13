// Import necessary components from the shared module
import { ZodFunction } from 'zod';
import {
    Command,
    processArgs,
    executeParsedCommands
} from './shared.js';
// Update import path to point to zod-function-utils
import { DefinedFunctionModule, DefinedFunction, DefineObjectFunction, DefinedObjectFunction } from '../../utils/zod-function-utils.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { z, ZodObject, ZodTypeAny } from 'zod';

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
    console.warn(`[yargs-setup] Unsupported Zod type for yargs conversion: ${zodType.constructor.name}. Treating as string.`);
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
                            
                            // Call the implemented function directly with the validated arguments object,
                            // reverting based on the Zod error message.
                            await func(validatedArgs); 
                        } catch (error: any) {
                            console.error(`Error executing command '${commandName}':`, error instanceof z.ZodError ? error.errors : error.message);
                            process.exit(1);
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
       .parse();
};