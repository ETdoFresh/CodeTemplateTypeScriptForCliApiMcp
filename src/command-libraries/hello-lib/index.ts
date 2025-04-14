import { FunctionDefinition, ArgumentDefinition, RestArgumentDefinition } from '../../system/command-types';

export const helloString: FunctionDefinition = {
  name: 'helloString',
  description: 'Greets with the provided string',
  arguments: [
    { name: 'name', description: 'The string to echo', type: 'string' }
  ],
  returnType: { name: 'greeting', description: 'The greeting with the string', type: 'string' },
  function: (name: string) => {
    return `Hello, ${name}!`;
  }
};

export const helloNumber: FunctionDefinition = {
  name: 'helloNumber',
  description: 'Greets with the provided number',
  arguments: [
    { name: 'num', description: 'The number to echo', type: 'number' }
  ],
  returnType: { name: 'greeting', description: 'The greeting with the number', type: 'string' },
  function: (num: number) => {
    return `Hello, ${num}!`;
  }
};

export const helloBoolean: FunctionDefinition = {
  name: 'helloBoolean',
  description: 'Greets with the provided boolean',
  arguments: [
    { name: 'bool', description: 'The boolean to echo', type: 'boolean' }
  ],
  returnType: { name: 'greeting', description: 'The greeting with the boolean', type: 'string' },
  function: (bool: boolean) => {
    return bool ? "Hello, true!" : "Hello, false!";
  }
};


export const helloStringArray: FunctionDefinition = {
  name: 'helloStringArray',
  description: 'Greets with the provided array of strings',
  arguments: [
    { name: 'arr', description: 'The array of strings to echo', type: 'string[]' }
  ],
  returnType: { name: 'greeting', description: 'The greeting with the array of strings', type: 'string' },
  function: (arr: string[]) => {
    return `Hello, ${arr.join(', ')}!`;
  }
};

export const helloNumberArray: FunctionDefinition = {
  name: 'helloNumberArray',
  description: 'Greets with the provided array of numbers',
  arguments: [
    { name: 'arr', description: 'The array of numbers to echo', type: 'number[]' }
  ],
  returnType: { name: 'greeting', description: 'The greeting with the array of numbers', type: 'string' },
  function: (arr: number[]) => {
    return `Hello, ${arr.join(', ')}!`;
  }
};


export const helloBooleanArray: FunctionDefinition = {
  name: 'helloBooleanArray',
  description: 'Greets with the provided array of booleans',
  arguments: [
    { name: 'arr', description: 'The array of booleans to echo', type: 'boolean[]' }
  ],
  returnType: { name: 'greeting', description: 'The greeting with the array of booleans', type: 'string' },
  function: (arr: boolean[]) => {
    return `Hello, ${arr.join(', ')}!`;
  }
};

export const helloStringArgs: FunctionDefinition = {
  name: 'helloStringArgs',
  description: 'Greets with the provided strings',
  arguments: [],
  restArgument: { name: 'args', description: 'The strings to echo', type: 'string[]' },
  returnType: { name: 'greeting', description: 'The greeting with the strings', type: 'string' },
  function: (...args: string[]) => {
    return `Hello, ${args.join(', ')}!`;
  }
};

export const helloNumberArgs: FunctionDefinition = {
  name: 'helloNumberArgs',
  description: 'Greets with the provided numbers',
  arguments: [],
  restArgument: { name: 'args', description: 'The numbers to echo', type: 'number[]' },
  returnType: { name: 'greeting', description: 'The greeting with the numbers', type: 'string' },
  function: (...args: number[]) => {
    return `Hello, ${args.join(', ')}!`;
  }
};

export const helloBooleanArgs: FunctionDefinition = {
  name: 'helloBooleanArgs',
  description: 'Greets with the provided booleans',
  arguments: [],
  restArgument: { name: 'args', description: 'The booleans to echo', type: 'boolean[]' },
  returnType: { name: 'greeting', description: 'The greeting with the booleans', type: 'string' },
  function: (...args: boolean[]) => {
    return `Hello, ${args.join(', ')}!`;
  }
};


export const helloStringNumber: FunctionDefinition = {
  name: 'helloStringNumber',
  description: 'Greets with the provided message and count',
  arguments: [
    { name: 'msg', description: 'The message to echo', type: 'string' },
    { name: 'count', description: 'The count to echo', type: 'number' }
  ],
  returnType: { name: 'greeting', description: 'The greeting with the message and count', type: 'string' },
  function: (msg: string, count: number) => {
    return `Message: ${msg}, Count: ${count}`;
  }
};


export const helloStringRestNumbers: FunctionDefinition = {
  name: 'helloStringRestNumbers',
  description: 'Greets with the provided prefix and numbers array',
  arguments: [
    { name: 'prefix', description: 'The prefix to echo', type: 'string' },
    { name: 'nums', description: 'The numbers array to echo', type: 'number[]' }
  ],
  returnType: { name: 'greeting', description: 'The greeting with the prefix and numbers', type: 'string' },
  function: (prefix: string, nums: number[]) => {
    const numString = nums.join(', ');
    return `Prefix: ${prefix}, Numbers: [${numString}]`;
  }
};


export const helloStringRestNumbersArgs: FunctionDefinition = {
  name: 'helloStringRestNumbersArgs',
  description: 'Greets with the provided prefix and rest numbers',
  arguments: [
      { name: 'prefix', description: 'The prefix string', type: 'string' }
  ],
  restArgument: { name: 'nums', description: 'The numbers to include', type: 'number[]' },
  returnType: { name: 'greeting', description: 'The greeting with the prefix and numbers', type: 'string' },
  function: (prefix: string, ...nums: number[]) => {
    const numString = nums.join(', ');
    return `Prefix: ${prefix}, Numbers: [${numString}]`;
  }
};
