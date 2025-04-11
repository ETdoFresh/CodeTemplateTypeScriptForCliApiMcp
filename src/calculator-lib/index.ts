function parseArgsToNumbers(args: string[]): number[] {
  return args.map(arg => {
    const num = parseFloat(arg);
    if (isNaN(num)) {
      throw new Error(`Invalid number argument: ${arg}`);
    }
    return num;
  });
}

export function add(...args: string[]): number {
  const nums = parseArgsToNumbers(args);
  if (nums.length === 0) {
    return 0;
  }
  return nums.reduce((sum, current) => sum + current, 0);
}

export function subtract(...args: string[]): number {
  const nums = parseArgsToNumbers(args);
  if (nums.length === 0) {
    throw new Error("Subtract requires at least one number.");
  }
  if (nums.length === 1) {
    return nums[0]; // Or perhaps throw an error? Returning the number seems reasonable.
  }
  return nums.slice(1).reduce((result, current) => result - current, nums[0]);
}

export function multiply(...args: string[]): number {
  const nums = parseArgsToNumbers(args);
  if (nums.length === 0) {
    return 1; // Identity element for multiplication
  }
  return nums.reduce((product, current) => product * current, 1);
}

export function divide(...args: string[]): number {
  const nums = parseArgsToNumbers(args);
  if (nums.length === 0) {
    throw new Error("Divide requires at least one number.");
  }
  if (nums.length === 1) {
    return nums[0]; // Similar to subtract, returning the number seems okay.
  }
  const initialValue = nums[0];
  return nums.slice(1).reduce((result, current) => {
    if (current === 0) {
      throw new Error("Cannot divide by zero");
    }
    return result / current;
  }, initialValue);
} 