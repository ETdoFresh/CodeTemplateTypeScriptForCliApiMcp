// src/system/command-types.ts

// Definitions are used by the code to define arguments and functions
export type ArgumentType = "string" | "number" | "boolean" | "string[]" | "number[]" | "boolean[]";

export type ArgumentDefinition = {
    name: string;
    type: ArgumentType;
    description?: string;
    optional?: boolean; // Defaults to false (meaning required) if omitted
    defaultValue?: any; // Optional default value
};

export type RestArgumentDefinition = ArgumentDefinition & {
    type: "string[]" | "number[]" | "boolean[]"
    optional?: true;
};

export type FunctionDefinition = {
    name: string;
    description?: string;
    arguments: ArgumentDefinition[];
    restArgument?: RestArgumentDefinition;
    // Assuming return value also needs a definition-like structure for consistency,
    // though it might just be a simple type in practice.
    returnType?: ArgumentDefinition;
    function: (...args: any[]) => any; // The actual implementation
};

export type LibraryDefinition = {
    functions: FunctionDefinition[];
};

// Instances are used when parsed from a command line and executed

export type ArgumentInstance = ArgumentDefinition & {
    value: any;
};

export type RestArgumentInstance = RestArgumentDefinition & {
    value: any[];
};

export type FunctionInstance = {
    definition: FunctionDefinition;
    argumentInstances: ArgumentInstance[];
    restArgumentInstance: RestArgumentInstance | null;
    returnValue?: any; // Return value is set after execution, hence optional
    // execute() method might be added later if needed for stateful execution
};
