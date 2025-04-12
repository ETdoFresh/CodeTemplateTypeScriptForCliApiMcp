export function helloString(name: string): string {
  return `Hello, ${name}!`;
}
(helloString as any).__argTypes = {'name': 'string'}

export function helloNumber(num: number): string {
  return `Hello, ${num}!`;
}
(helloNumber as any).__argTypes = {'num': 'number'}

export function helloBoolean(bool: boolean): string {
  return bool ? "Hello, true!" : "Hello, false!";
}
(helloBoolean as any).__argTypes = {'bool': 'boolean'}

export function helloStringArray(arr: string[]): string {
  return `Hello, ${arr.join(', ')}!`;
}
(helloStringArray as any).__argTypes = {'arr': 'string[]'}

export function helloNumberArray(arr: number[]): string {
  return `Hello, ${arr.join(', ')}!`;
}
(helloNumberArray as any).__argTypes = {'arr': 'number[]'}

export function helloBooleanArray(arr: boolean[]): string {
  return `Hello, ${arr.join(', ')}!`;
}
(helloBooleanArray as any).__argTypes = {'arr': 'boolean[]'}

export function helloStringArgs(...args: string[]): string {
  return `Hello, ${args.join(', ')}!`;
}
(helloStringArgs as any).__argTypes = {'args': 'string[]'}

export function helloNumberArgs(...args: number[]): string {
  return `Hello, ${args.join(', ')}!`;
}
(helloNumberArgs as any).__argTypes = {'args': 'number[]'}

export function helloBooleanArgs(...args: boolean[]): string {
  return `Hello, ${args.join(', ')}!`;
}
(helloBooleanArgs as any).__argTypes = {'args': 'boolean[]'}

export function hello(...args: string[]): string {
    return `Hello, ${args.join(' ') || 'world'}!`;
}
(hello as any).__argTypes = [{ name: "args", type: "string[]" }];