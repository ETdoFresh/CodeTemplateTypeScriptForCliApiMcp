export function echo(...args: string[]): string {
  return args.join(' ');
}
(echo as any).__argTypes = [{ name: "args", type: "string[]" }];