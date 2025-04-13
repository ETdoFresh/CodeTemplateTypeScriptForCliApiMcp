/**
 * Represents the data structure for a file processed by repopack.
 */
export interface FileData {
  path: string;     // Relative path from the source directory
  content: string;  // Processed content of the file
}

/**
 * Options for the internal packing logic.
 */
export interface PackCodebaseOptions {
  directory: string; // For local packing OR temp dir for remote scan
  sourceIdentifier?: string; // Display name for the source (local path or remote URL)
  github_repo?: string; // For remote packing
  includePatterns?: string;
  ignorePatterns?: string;
  outputFormat?: 'xml' | 'md' | 'txt';
  outputTarget?: 'stdout' | 'file' | 'clipboard';
  removeComments?: boolean;
  removeEmptyLines?: boolean;
  fileSummary?: boolean;
  directoryStructure?: boolean;
  noGitignore?: boolean; // Corresponds to !useGitignore
  noDefaultPatterns?: boolean; // Corresponds to !useDefaultPatterns
  // Internal helpers for remote flow
  repoOwner?: string;
  repoName?: string;
  outputTargetDirectory?: string; // Target directory for 'file' output
}

/**
 * Result structure from the findFiles operation.
 */
export interface FindFilesResult {
  filePaths: string[];             // Array of relative file paths found
  defaultIgnorePatterns: string[]; // Default patterns used
  inputIgnorePatterns: string[];   // Patterns provided via options.ignorePatterns
  gitignorePatterns: string[];     // Patterns loaded from .gitignore files
}

/**
 * Represents a node in the directory tree structure.
 */
export interface TreeNode {
  name: string;
  children: TreeNode[];
  isDirectory: boolean;
}

/**
 * Data context passed between internal packing steps, especially to formatters.
 */
export interface OutputContext {
  directoryStructure: string;
  processedFiles: FileData[];
  options: PackCodebaseOptions;
  defaultIgnorePatterns: string[];
  inputIgnorePatterns: string[];
  gitignorePatterns: string[];
}

/**
 * Structure for the generated file summary section (used by formatters).
 */
export interface FileSummaryContent {
  intro: string;
  purpose: string;
  file_format: string;
  usage_guidelines: string;
  notes: string;
  additional_info: string;
} 