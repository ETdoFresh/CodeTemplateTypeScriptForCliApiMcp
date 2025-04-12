export function add(...args: number[]): number {
  if (args.length === 0) {
    throw new Error("Add requires at least one number");
  }
  return args.reduce((sum, current) => sum + current, 0);
}
(add as any).__argTypes = [{ name: "args", type: "...number[]" }];


export function subtract(...args: number[]): number {
  if (args.length === 0) {
    throw new Error("Subtract requires at least one number.");
  }
  if (args.length === 1) {
    return args[0];
  }
  return args.slice(1).reduce((result, current) => result - current, args[0]);
}
(subtract as any).__argTypes = [{ name: "args", type: "...number[]" }];


export function multiply(...args: number[]): number {
  if (args.length === 0) {
    throw new Error("Multiply requires at least one number")
  }
  return args.reduce((product, current) => product * current, 1);
}
(multiply as any).__argTypes = [{ name: "args", type: "...number[]" }];


export function divide(...args: number[]): number {
  if (args.length === 0) {
    throw new Error("Divide requires at least one number.");
  }
  if (args.length === 1) {
    return args[0];
  }
  const initialValue = args[0];
  return args.slice(1).reduce((result, current) => {
    if (current === 0) {
      throw new Error("Cannot divide by zero");
    }
    return result / current;
  }, initialValue);
}
(divide as any).__argTypes = [{ name: "args", type: "...number[]" }];