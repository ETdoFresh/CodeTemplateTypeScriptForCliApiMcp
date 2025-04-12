import { z } from "zod";
import { DefineFunction } from "../utils/zod-function-utils"; // Import the helper

// --- Calculator Functions ---
export const add = DefineFunction({
  description: 'Adds all numbers together',
  args: z.tuple([]).rest(z.number()).describe('Numbers to add'),
  return: z.number().describe('Sum of numbers'),
  function: (...args: number[]) => {
    return args.reduce((sum, current) => sum + current, 0);
  }
});


export const subtract = DefineFunction({
  description: 'Subtracts all numbers from the first',
  args: z.tuple([z.number().describe('Initial value')]).rest(z.number()).describe('Numbers to subtract'),
  return: z.number().describe('Difference of numbers'),
  function: (initialValue: number, ...args: number[]) => {
    return args.reduce((diff, current) => diff - current, initialValue);
  }
});


export const multiply = DefineFunction({
    description: 'Multiplies all numbers together',
    args: z.tuple([]).rest(z.number()).describe('Numbers to multiply'),
    return: z.number().describe('Product of numbers'),
    function: (...args: number[]) => {
        return args.reduce((product, current) => product * current, 1);
    }
});


export const divide = DefineFunction({
    description: 'Divides the first number by subsequent numbers',
    args: z.tuple([z.number().describe('Dividend')])
                   .rest(z.number()).describe('Divisors'),
    return: z.number().describe('Quotient of numbers'),
    function: (initialValue: number, ...args: number[]) => {
        return args.reduce((result, current) => {
            if (current === 0) throw new Error("Cannot divide by zero");
            return result / current;
        }, initialValue);
    }
});

