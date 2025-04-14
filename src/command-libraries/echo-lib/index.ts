import { FunctionDefinition, ArgumentDefinition, RestArgumentDefinition } from '../../system/command-types';

export const echo: FunctionDefinition = {
  name: 'echo',
  description: 'Echoes the provided arguments',
  arguments: [], // No fixed arguments
  restArgument: {
    name: 'argsToEcho',
    type: 'string[]',
    description: 'Arguments to echo'
  },
  returnType: {
    name: 'echoedOutput',
    type: 'string',
    description: 'The echoed arguments',
  },
  function: (...args: string[]) => {
    // Keep the original logic for now
    return args.map(arg => String(arg)).join(' ');
  }
};
