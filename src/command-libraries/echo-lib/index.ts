import { z } from "zod";
import { DefineFunction } from "../../utils/zod-function-utils";

export const echo = DefineFunction({
  args: z.tuple([]).rest(z.string()).describe('The strings to echo'),
  return: z.string().describe('The concatenated strings'),
  description: 'Concatenates all strings together',
  function: (...args: string[]) => {
    return args.join(' ');
  }
});

