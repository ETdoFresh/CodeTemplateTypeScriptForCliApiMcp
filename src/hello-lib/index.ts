import { z } from "zod";
import { DefineFunction } from "../utils/zod-function-utils";

export const helloString = DefineFunction({
  description: 'Greets with the provided string',
  args: z.tuple([z.string().describe('The string to echo')]),
  return: z.string().describe('The greeting with the string'),
  function: (name: string) => {
    return `Hello, ${name}!`;
  }
});

export const helloNumber = DefineFunction({
  description: 'Greets with the provided number',
  args: z.tuple([z.number().describe('The number to echo')]),
  return: z.string().describe('The greeting with the number'),
  function: (num: number) => {
    return `Hello, ${num}!`;
  }
});

export const helloBoolean = DefineFunction({
  description: 'Greets with the provided boolean',
  args: z.tuple([z.boolean().describe('The boolean to echo')]),
  return: z.string().describe('The greeting with the boolean'),
  function: (bool: boolean) => {
    return bool ? "Hello, true!" : "Hello, false!";
  }
});


export const helloStringArray = DefineFunction({
  description: 'Greets with the provided array of strings',
  args: z.tuple([z.array(z.string()).describe('The array of strings to echo')]),
  return: z.string().describe('The greeting with the array of strings'),
  function: (arr: string[]) => {
    return `Hello, ${arr.join(', ')}!`;
  }
});

export const helloNumberArray = DefineFunction({
  description: 'Greets with the provided array of numbers',
  args: z.tuple([z.array(z.number()).describe('The array of numbers to echo')]),
  return: z.string().describe('The greeting with the array of numbers'),
  function: (arr: number[]) => {
    return `Hello, ${arr.join(', ')}!`;
  }
});


export const helloBooleanArray = DefineFunction({
  description: 'Greets with the provided array of booleans',
  args: z.tuple([z.array(z.boolean()).describe('The array of booleans to echo')]),
  return: z.string().describe('The greeting with the array of booleans'),
  function: (arr: boolean[]) => {
    return `Hello, ${arr.join(', ')}!`;
  }
});

export const helloStringArgs = DefineFunction({
  description: 'Greets with the provided strings',
  args: z.tuple([]).rest(z.string()).describe('The strings to echo'),
  return: z.string().describe('The greeting with the strings'),
  function: (...args: string[]) => {
    return `Hello, ${args.join(', ')}!`;
  }
});

export const helloNumberArgs = DefineFunction({
  description: 'Greets with the provided numbers',
  args: z.tuple([]).rest(z.number()).describe('The numbers to echo'),
  return: z.string().describe('The greeting with the numbers'),
  function: (...args: number[]) => {
    return `Hello, ${args.join(', ')}!`;
  }
});

export const helloBooleanArgs = DefineFunction({
  description: 'Greets with the provided booleans',
  args: z.tuple([]).rest(z.boolean()).describe('The booleans to echo'),
  return: z.string().describe('The greeting with the booleans'),
  function: (...args: boolean[]) => {
    return `Hello, ${args.join(', ')}!`;
  }
});


export const helloStringNumber = DefineFunction({
  description: 'Greets with the provided message and count',
  args: z.tuple([z.string().describe('The message to echo'), z.number().describe('The count to echo')]),
  return: z.string().describe('The greeting with the message and count'),
  function: (msg: string, count: number) => {
    return `Message: ${msg}, Count: ${count}`;
  }
});


export const helloStringRestNumbers = DefineFunction({
  description: 'Greets with the provided prefix and numbers',
  args: z.tuple([z.string().describe('The prefix to echo'), z.array(z.number()).describe('The numbers to echo')]),
  return: z.string().describe('The greeting with the prefix and numbers'),
  function: (prefix: string, nums: number[]) => {
    const numString = nums.join(', ');
    return `Prefix: ${prefix}, Numbers: [${numString}]`;
  }
});


export const helloStringRestNumbersArgs = DefineFunction({
  description: 'Greets with the provided prefix and numbers',
  args: z.tuple([]).rest(z.string()).describe('The prefix to echo'),
  return: z.string().describe('The greeting with the prefix and numbers'),
  function: (prefix: string, ...nums: number[]) => {
    const numString = nums.join(', ');
    return `Prefix: ${prefix}, Numbers: [${numString}]`;
  }
});
