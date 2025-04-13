import { z } from "zod";
import { DefineFunction } from "../../utils/zod-function-utils";

export const echo = DefineFunction({
  args: z.tuple([]).rest(z.coerce.string()).describe('values to echo'),
  return: z.string().describe('The concatenated string representation of the values'),
  description: 'Concatenates string representations of all arguments together',
  function: (...args: string[]) => {
    return args.join(' ');
  }
});

