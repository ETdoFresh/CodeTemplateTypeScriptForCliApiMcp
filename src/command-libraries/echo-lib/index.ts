import { z } from "zod";
import { DefineFunction } from "../../utils/zod-function-utils";

export const echo = DefineFunction({
  args: z.tuple([]).rest(z.any()).describe('values'),
  return: z.string().describe('The concatenated string representations of the values'),
  description: 'Concatenates string representations of all arguments together',
  function: (...args: any[]) => {
    return args.map(arg => String(arg)).join(' ');
  }
});

