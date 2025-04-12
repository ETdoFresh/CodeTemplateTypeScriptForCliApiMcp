import { z, ZodFunction, ZodTuple, ZodTypeAny } from "zod";

// --- DefineFunction Helper --- 

// Type for the options object
interface DefineFunctionOptions<TArgs extends ZodTuple<any, any>, TReturn extends ZodTypeAny> {
  description: string;
  args: TArgs;
  return: TReturn;
  function: (...args: z.infer<TArgs>) => z.infer<TReturn>;
}

// Type that represents the implemented function with the Zod definition attached
type DefinedFunction<TArgs extends ZodTuple<any, any>, TReturn extends ZodTypeAny> =
    ((...args: z.infer<TArgs>) => z.infer<TReturn>) & { // Use the function signature directly
         _def: ZodFunction<TArgs, TReturn>['_def'];
    };

// Implementation of DefineFunction
export function DefineFunction<TArgs extends ZodTuple<any, any>, TReturn extends ZodTypeAny>(
  options: DefineFunctionOptions<TArgs, TReturn>
): DefinedFunction<TArgs, TReturn> {
  const definition = z.function(options.args, options.return).describe(options.description);
  const implementedFunc = definition.implement(options.function as any); // Cast needed to bypass linter issue
  (implementedFunc as any)._def = definition._def; // Attach definition
  return implementedFunc as unknown as DefinedFunction<TArgs, TReturn>; // Cast via unknown
} 