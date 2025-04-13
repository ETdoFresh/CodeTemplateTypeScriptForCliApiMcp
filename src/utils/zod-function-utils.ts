import { z, ZodFunction, ZodTuple, ZodTypeAny, ZodObject, ZodFirstPartyTypeKind } from "zod";
import { ZodRawShape } from "zod";

// --- DefineFunction Helper (Original for Tuples) ---

// Type for the options object
interface DefineFunctionOptions<TArgs extends ZodTuple<any, any>, TReturn extends ZodTypeAny> {
  description: string;
  args: TArgs;
  return?: TReturn; // Keep return optional
  function: (...args: z.infer<TArgs>) => TReturn extends z.ZodPromise<infer P> ? Promise<P> : z.infer<TReturn>; 
}

// Type that represents the implemented function with the Zod definition attached
export type DefinedFunction<TArgs extends ZodTuple<any, any>, TReturn extends ZodTypeAny> =
    ((...args: z.infer<TArgs>) => TReturn extends z.ZodPromise<infer P> ? Promise<P> : z.infer<TReturn>) & {
         _def: ZodFunction<TArgs, TReturn>['_def'];
    };

// Implementation of DefineFunction (Original for Tuples)
export function DefineFunction<TArgs extends ZodTuple<any, any>, TReturn extends ZodTypeAny>(
  options: DefineFunctionOptions<TArgs, TReturn>
): DefinedFunction<TArgs, TReturn> {
  
  let definition: z.ZodFunction<TArgs, any>;

  if (options.return) {
    definition = z.function(options.args, options.return).describe(options.description);
  } else {
    definition = z.function(options.args).describe(options.description);
  }
  
  const implementedFunc = definition.implement(options.function as any);
  
  (implementedFunc as any)._def = definition._def;

  return implementedFunc as unknown as DefinedFunction<TArgs, TReturn>;
}

// --- DefineObjectFunction Helper (New for Objects) ---

// Options specific to defining functions with an object arg schema
interface DefineObjectFunctionOptions<TArgs extends ZodObject<any>> {
  description: string;
  argsSchema: TArgs; 
  function: (args: z.infer<TArgs>) => Promise<void>; // Expect Promise<void>
}

// Represents the implemented function defined with an object schema
// EXPORT this type
export type DefinedObjectFunction<TArgs extends ZodObject<any>> =
    ((args: z.infer<TArgs>) => Promise<void>) & {
         _def: ZodFunction<ZodTuple<[TArgs], null>, z.ZodVoid>['_def'] & { 
             argsSchema: TArgs; 
         };
    };

// Implementation of DefineObjectFunction (Simplified)
export function DefineObjectFunction<TArgs extends ZodObject<any>>(
  options: DefineObjectFunctionOptions<TArgs>
): DefinedObjectFunction<TArgs> {

  // Manually create the function that will be exported/called
  const callableFunction = async (args: z.infer<TArgs>): Promise<void> => {
    // 1. Validate the input arguments using the provided schema
    //    (Parsing will throw if invalid, which is expected)
    const validatedArgs = options.argsSchema.parse(args);
    // 2. Call the user's original function with the validated args
    await options.function(validatedArgs);
    // Return void (as per the function signature)
  };

  // Manually construct the _def object needed by the CLI and potentially other interfaces
  // We need to mimic the structure Zod creates, especially the 'args' part,
  // but mark it clearly as object-based for our type guard.
  const definition: DefinedObjectFunction<TArgs>['_def'] = {
      // Mimic ZodFunctionDef properties (might need adjustment based on usage)
      args: z.tuple([options.argsSchema]), // Keep tuple for structural consistency? Or just the object? Let's try tuple.
      returns: z.void(), // Explicitly set to void
      typeName: ZodFirstPartyTypeKind.ZodFunction, // Use the enum member
      description: options.description,
      // Add our custom property to identify object-based functions easily
      argsSchema: options.argsSchema
  };

  // Attach the definition to the callable function
  (callableFunction as any)._def = definition;

  // Return the function cast to the correct type
  return callableFunction as unknown as DefinedObjectFunction<TArgs>;
}

// Type alias for a module containing various defined functions
// Update constraint to remove TReturn
export type DefinedFunctionModule = Record<
  string,
  DefinedFunction<any, any> | DefinedObjectFunction<any>
>; 

// Helper to check if a function was defined with DefineObjectFunction
function isObjectFunction(func: any): func is DefinedObjectFunction<any> {
    // More robust check: verify _def exists, _def.args is a ZodTuple,
    // it has one item, and that item is a ZodObject.
    // Also check for the custom argsSchema property we attach.
    return typeof func === 'function' &&
           func._def &&
           func._def.args instanceof z.ZodTuple && 
           func._def.args?._def?.items?.length === 1 && 
           func._def.args?._def?.items?.[0] instanceof z.ZodObject && 
           func._def.hasOwnProperty('argsSchema'); // Check our custom property still
}

// Helper to convert Zod schema type to yargs option type
function zodTypeToYargsType(zodType: ZodTypeAny): 'string' | 'number' | 'boolean' | 'array' | undefined {
    if (zodType instanceof z.ZodString) return 'string';
    if (zodType instanceof z.ZodNumber) return 'number';
    if (zodType instanceof z.ZodBoolean) return 'boolean';
    if (zodType instanceof z.ZodArray) return 'array';
    if (zodType instanceof z.ZodEnum) return 'string'; // Enums are treated as strings
    if (zodType instanceof z.ZodOptional || zodType instanceof z.ZodDefault) {
        // Look inside optional/default wrappers
        return zodTypeToYargsType(zodType._def.innerType);
    }
    // Add more mappings if needed (e.g., for dates)
    return 'string'; // Default or fallback type
} 