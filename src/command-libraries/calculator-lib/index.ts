import { FunctionDefinition, ArgumentDefinition, RestArgumentDefinition } from '../../system/command-types';

// --- Calculator Functions ---
export const add: FunctionDefinition = {
  name: 'add',
  description: 'Adds all numbers together',
  arguments: [],
  restArgument: {
    name: 'numbersToAdd', // Derived from Zod description
    type: 'number[]',
    description: 'Numbers to add',
  },
  returnType: {
    name: 'sum', // Derived from Zod description
    type: 'number',
    description: 'Sum of numbers',
  },
  function: (...args: number[]) => {
    return args.reduce((sum, current) => sum + current, 0);
  }
};


export const subtract: FunctionDefinition = {
  name: 'subtract',
  description: 'Subtracts all numbers from the first',
  arguments: [
    {
      name: 'initialValue', // Derived from Zod description
      type: 'number',
      description: 'Initial value',
    }
  ],
  restArgument: {
    name: 'numbersToSubtract', // Derived from Zod description
    type: 'number[]',
    description: 'Numbers to subtract',
  },
  returnType: {
    name: 'difference', // Derived from Zod description
    type: 'number',
    description: 'Difference of numbers',
  },
  function: (initialValue: number, ...args: number[]) => {
    return args.reduce((diff, current) => diff - current, initialValue);
  }
};


export const multiply: FunctionDefinition = {
    name: 'multiply',
    description: 'Multiplies all numbers together',
    arguments: [],
    restArgument: {
        name: 'numbersToMultiply', // Derived from Zod description
        type: 'number[]',
        description: 'Numbers to multiply',
    },
    returnType: {
        name: 'product', // Derived from Zod description
        type: 'number',
        description: 'Product of numbers',
    },
    function: (...args: number[]) => {
        return args.reduce((product, current) => product * current, 1);
    }
};


export const divide: FunctionDefinition = {
    name: 'divide',
    description: 'Divides the first number by subsequent numbers',
    arguments: [
        {
            name: 'dividend', // Derived from Zod description
            type: 'number',
            description: 'Dividend',
        }
    ],
    restArgument: {
        name: 'divisors', // Derived from Zod description
        type: 'number[]',
        description: 'Divisors',
    },
    returnType: {
        name: 'quotient', // Derived from Zod description
        type: 'number',
        description: 'Quotient of numbers',
    },
    function: (initialValue: number, ...args: number[]) => {
        return args.reduce((result, current) => {
            if (current === 0) throw new Error("Cannot divide by zero");
            return result / current;
        }, initialValue);
    }
};
