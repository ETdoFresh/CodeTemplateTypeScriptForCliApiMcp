import readline from 'readline';
import { ZodFunction, z } from 'zod';
import { DefinedFunctionModule, DefinedFunction, DefinedObjectFunction, isObjectFunction } from '../../utils/zod-function-utils.js';
import yargsParser from 'yargs-parser';

export const runRepl = (libraries: DefinedFunctionModule[]) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  const availableCommandNames = libraries.flatMap(lib => Object.keys(lib));

  console.log('Interactive CLI. Type "exit" or "quit" to leave.');
  console.log('Available commands:', availableCommandNames.join(', '));
  console.log('Note: Commands expecting options (like packLocal) use named flags, e.g., packLocal --directory /path --outputTarget file');
  rl.prompt();

  function findCommand(commandName: string, libraries: DefinedFunctionModule[]): DefinedFunction<any, any> | DefinedObjectFunction<any, any> | undefined {
    for (const lib of libraries) {
      if (Object.prototype.hasOwnProperty.call(lib, commandName)) {
        const func = lib[commandName];
        if (typeof func === 'function' && func._def) {
          return func;
        }
      }
    }
    return undefined;
  }

  rl.on('line', async (line) => {
    const trimmedLine = line.trim();
    if (trimmedLine === 'exit' || trimmedLine === 'quit') {
      rl.close();
      return;
    }

    if (trimmedLine === '') {
      rl.prompt();
      return;
    }

    const parts = trimmedLine.match(/(\S+) ?(.*)/);
    if (!parts) {
      console.error("Invalid command format.");
      rl.prompt();
      return;
    }
    const commandName = parts[1];
    const argsString = parts[2] || '';

    const commandFunc = findCommand(commandName, libraries);

    if (!commandFunc) {
      console.error(`Error: Command not found: ${commandName}`);
      rl.prompt();
      return;
    }

    try {
      let result: any;
      const commandDef = commandFunc._def;

      if (isObjectFunction(commandFunc)) {
        console.error(`DEBUG: [${commandName}] Entering DefineObjectFunction path`);
        const objectDef = commandDef as DefinedObjectFunction<any, any>['_def'];
        const argsSchema = objectDef.argsSchema as z.ZodObject<any>;
        
        let primaryArgKey: string | undefined = undefined;
        for (const key in argsSchema.shape) {
          const fieldSchema = argsSchema.shape[key];
          if (!(fieldSchema instanceof z.ZodOptional || fieldSchema instanceof z.ZodDefault) && 
              fieldSchema instanceof z.ZodString) {
            primaryArgKey = key;
            break;
          }
        }
        console.error(`DEBUG: [${commandName}] Identified primary positional key: ${primaryArgKey}`);

        const parsedArgs = yargsParser(argsString);
        const { _, $0, ...options } = parsedArgs;
        const positionalArgs = parsedArgs._ || [];

        if (primaryArgKey && options[primaryArgKey] === undefined && positionalArgs.length > 0) {
          console.error(`DEBUG: [${commandName}] Inferring ${primaryArgKey} from positional: ${positionalArgs[0]}`);
          options[primaryArgKey] = positionalArgs[0];
        }
        
        Object.keys(options).forEach(key => {
          if (typeof options[key] === 'string') {
            if (options[key].toLowerCase() === 'true') options[key] = true;
            else if (options[key].toLowerCase() === 'false') options[key] = false;
            else if (!isNaN(Number(options[key]))) options[key] = Number(options[key]);
          }
        });

        result = await commandFunc(options);
      } else {
        console.error(`DEBUG: [${commandName}] Entering standard DefineFunction path`);
        const positionalArgs = argsString.split(' ').filter(arg => arg !== '');

        const standardDef = commandDef as ZodFunction<any, any>['_def'];
        if (standardDef.returns instanceof z.ZodPromise) {
          result = await commandFunc.apply(null, positionalArgs);
        } else {
          result = commandFunc.apply(null, positionalArgs);
        }
      }
      
      if (result !== undefined) {
        if (typeof result === 'string') {
          console.log(result);
        } else {
          console.log(JSON.stringify(result));
        }
      }

    } catch (error: any) {
      console.error(`Error executing command '${commandName}':`, error.message);
    }

    rl.prompt();

  }).on('close', () => {
    console.log('Exiting REPL.');
    process.exit(0);
  });
};