export function helloString(name: string): string {
  return `Hello, ${name}!`;
}
(helloString as any).__argTypes = [{ name: "name", type: "string" }];

export function helloNumber(num: number): string {
  return `Hello, ${num}!`;
}
(helloNumber as any).__argTypes = [{ name: "num", type: "number" }];

export function helloBoolean(bool: boolean): string {
  return bool ? "Hello, true!" : "Hello, false!";
}
(helloBoolean as any).__argTypes = [{ name: "bool", type: "boolean" }];

export function helloStringArray(arr: string[]): string {
  return `Hello, ${arr.join(', ')}!`;
}
(helloStringArray as any).__argTypes = [{ name: "arr", type: "string[]" }];

export function helloNumberArray(arr: number[]): string {
  return `Hello, ${arr.join(', ')}!`;
}
(helloNumberArray as any).__argTypes = [{ name: "arr", type: "number[]" }];

export function helloBooleanArray(arr: boolean[]): string {
  return `Hello, ${arr.join(', ')}!`;
}
(helloBooleanArray as any).__argTypes = [{ name: "arr", type: "boolean[]" }];

export function helloStringArgs(...args: string[]): string {
  return `Hello, ${args.join(', ')}!`;
}
(helloStringArgs as any).__argTypes = [{ name: "args", type: "...string[]" }];

export function helloNumberArgs(...args: number[]): string {
  return `Hello, ${args.join(', ')}!`;
}
(helloNumberArgs as any).__argTypes = [{ name: "args", type: "...number[]" }];

export function helloBooleanArgs(...args: boolean[]): string {
  return `Hello, ${args.join(', ')}!`;
}
(helloBooleanArgs as any).__argTypes = [{ name: "args", type: "...boolean[]" }];

export function hello(...args: string[]): string {
    return `Hello, ${args.join(' ') || 'world'}!`;
}
(hello as any).__argTypes = [{ name: "args", type: "...string[]" }];

// --- NEW Mixed Type Functions ---

export function helloStringNumber(msg: string, count: number): string {
    return `Message: ${msg}, Count: ${count}`;
}
(helloStringNumber as any).__argTypes = [
    { name: "msg", type: "string" },
    { name: "count", type: "number" }
];

export function helloStringRestNumbers(prefix: string, ...nums: number[]): string {
    const numString = nums.join(', ');
    return `Prefix: ${prefix}, Numbers: [${numString}]`;
}
(helloStringRestNumbers as any).__argTypes = [
    { name: "prefix", type: "string" },
    { name: "nums", type: "...number[]" } // Rest parameter
];