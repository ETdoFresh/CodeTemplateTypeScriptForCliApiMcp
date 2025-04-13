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
interface DefineObjectFunctionOptions<TArgs extends ZodObject<any>, TReturn extends ZodTypeAny = z.ZodVoid> {
  description: string;
  argsSchema: TArgs;
  returnSchema?: TReturn; // Optional return schema
  positionalArgsOrder?: Extract<keyof z.infer<TArgs>, string>[];
  // Update function signature to use TReturn, expect Promise<inferred TReturn>
  function: (args: z.infer<TArgs>) => Promise<z.infer<TReturn>>;
}

// Represents the implemented function defined with an object schema
// Update signature and internal _def structure
export type DefinedObjectFunction<TArgs extends ZodObject<any>, TReturn extends ZodTypeAny = z.ZodVoid> =
    ((args: z.infer<TArgs>) => Promise<z.infer<TReturn>>) & {
         _def: { // Use a custom _def structure for clarity
             args: ZodTuple<[TArgs], null>; // Keep args tuple for consistency
             returnSchema?: TReturn; // Store the return schema here
             typeName: ZodFirstPartyTypeKind.ZodFunction;
             description?: string;
             // Custom properties needed by interfaces
             argsSchema: TArgs;
             positionalArgsOrder?: string[];
         };
    };

// Implementation of DefineObjectFunction
// Update signature and implementation details
export function DefineObjectFunction<TArgs extends ZodObject<any>, TReturn extends ZodTypeAny = z.ZodVoid>(
  options: DefineObjectFunctionOptions<TArgs, TReturn>
): DefinedObjectFunction<TArgs, TReturn> {

  // Update callableFunction signature to return Promise<inferred TReturn>
  const callableFunction = async (args: z.infer<TArgs>): Promise<z.infer<TReturn>> => {
    // 1. Validate the input arguments using the provided schema
    const validatedArgs = options.argsSchema.parse(args);
    // 2. Call the user's original function with the validated args
    const result = await options.function(validatedArgs);
    // Return the result
    return result;
  };

  // Construct our custom _def object
  const definition: DefinedObjectFunction<TArgs, TReturn>['_def'] = {
      args: z.tuple([options.argsSchema]), // Keep tuple for structural consistency
      returnSchema: options.returnSchema, // Store the provided return schema
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      description: options.description,
      argsSchema: options.argsSchema,
      positionalArgsOrder: options.positionalArgsOrder
  };

  // Attach the definition to the callable function
  (callableFunction as any)._def = definition;

  // Return the function cast to the correct type
  return callableFunction as unknown as DefinedObjectFunction<TArgs, TReturn>;
}

// Type alias for a module containing various defined functions
// Update to allow any return type for DefinedObjectFunction
export type DefinedFunctionModule = Record<
  string,
  DefinedFunction<any, any> | DefinedObjectFunction<any, any>
>;

// Helper to check if a function was defined with DefineObjectFunction
// Check based on the custom _def structure
export function isObjectFunction(func: any): func is DefinedObjectFunction<any, any> {
    return typeof func === 'function' &&
           func._def &&
           func._def.typeName === ZodFirstPartyTypeKind.ZodFunction &&
           func._def.args instanceof z.ZodTuple &&
           func._def.argsSchema instanceof z.ZodObject;
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
    console.warn(`[yargs-setup] Unsupported Zod type for yargs conversion: ${zodType.constructor.name}. Treating as string.`);
    return 'string'; // Default or fallback type
} 