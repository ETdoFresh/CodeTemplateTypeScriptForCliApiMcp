// src/repopack-lib/index.ts
// This library encapsulates the functionality of the original repopack-server tool.

import fs from 'node:fs'; // Use sync fs for simplicity in some checks, async elsewhere
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
// --- Zod Import ---
import { z } from 'zod';
import { DefineFunction } from '../../utils/zod-function-utils';

// --- Dependencies needed by the repopack logic ---
// Note: These dependencies must be added to the code-template-ts package.json
import clipboard from 'clipboardy';
import { globby } from 'globby'; // Assuming globby v14+ (ESM)
import ignore from 'ignore';
import { isBinary } from 'istextorbinary';
import strip from 'strip-comments';
import { XMLBuilder } from 'fast-xml-parser'; // Assuming fast-xml-parser v5+

// --- Configuration (from repopack-server/src/config.ts) ---
const defaultIgnoreList = [
  '.git/**',
  '.hg/**',
  '.svn/**',
  // Add other defaults if needed, but keep it minimal for the lib
];

// --- Interfaces (from repopack-server/src/fileUtils.ts) ---
interface FileData {
  path: string;
  content: string;
}

// Combine options interface, slightly adapted for library use
interface PackCodebaseOptions {
  directory: string; // For local packing OR temp dir for remote scan
  sourceIdentifier?: string; // Display name for the source (local path or remote URL)
  github_repo?: string; // For remote packing
  includePatterns?: string;
  ignorePatterns?: string;
  outputFormat?: 'xml' | 'md' | 'txt';
  outputTarget?: 'stdout' | 'file' | 'clipboard'; // stdout means return string here
  removeComments?: boolean;
  removeEmptyLines?: boolean;
  fileSummary?: boolean;
  directoryStructure?: boolean;
  noGitignore?: boolean; // Corresponds to !useGitignore
  noDefaultPatterns?: boolean; // Corresponds to !useDefaultPatterns
  // Internal helpers for remote flow
  repoOwner?: string;
  repoName?: string;
  outputTargetDirectory?: string; // Add new property for file output target
}

interface FindFilesResult {
  filePaths: string[];
  defaultIgnorePatterns: string[];
  inputIgnorePatterns: string[];
  gitignorePatterns: string[];
}

// --- Inlined Helper Functions (from repopack-server) ---

// --- File Utility Helpers (adapted from fileUtils.ts) ---

function normalizePathUri(uriPath: string): string {
  if (process.platform === 'win32') {
    const winMatch = uriPath.match(/^(?:file:\/\/\/)?\/([a-zA-Z])[:|%3A]\/(.*)$/i);
    if (winMatch) {
      const driveLetter = winMatch[1];
      const restOfPath = winMatch[2];
      try {
        const decodedPath = decodeURIComponent(restOfPath);
        const winPath = `${driveLetter}:\\${decodedPath.replace(/\//g, '\\')}`;
        console.error(`[repopack-lib] Normalized Windows URI path "${uriPath}" to "${winPath}"`);
        return winPath;
      } catch (e) {
        console.error(`[repopack-lib] Failed to decode/normalize Windows path URI "${uriPath}":`, e);
        return uriPath;
      }
    }
  }
  try {
    const decoded = decodeURIComponent(uriPath);
    // if (decoded !== uriPath) {
    //   console.error(`[repopack-lib] Decoded potentially non-Windows path URI "${uriPath}" to "${decoded}"`);
    // }
    return decoded;
  } catch (e) {
    console.error(`[repopack-lib] Failed to decode path URI "${uriPath}":`, e);
    return uriPath;
  }
}


async function readGitignoreRulesFromFile(gitignorePath: string): Promise<string[]> {
  try {
    const content = await fsp.readFile(gitignorePath, 'utf-8');
    return content.split('\
')
      .map(line => line.trim())
      .filter((line: string) => line !== '' && !line.startsWith('#'));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File not found is expected
    } else {
      console.error(`[repopack-lib] Error reading .gitignore file ${gitignorePath}:`, error);
    }
    return [];
  }
}

async function findFiles(options: PackCodebaseOptions): Promise<FindFilesResult> {
  const {
    directory, // This will be the *actual* directory to scan (local dir or temp clone dir)
    includePatterns,
    ignorePatterns: inputIgnorePatternsStr,
    noGitignore = false,
    noDefaultPatterns = false,
  } = options;

  const useGitignore = !noGitignore;
  const useDefaultPatterns = !noDefaultPatterns;

  const resolvedDir = path.resolve(directory);

  try {
    const stats = await fsp.stat(resolvedDir);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${resolvedDir}`);
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
        throw new Error(`Directory not found: ${resolvedDir}`);
    }
    throw error;
  }

  const patternsToInclude = includePatterns ? includePatterns.split(',').map(p => p.trim()) : ['**/*'];
  const defaultIgnores = useDefaultPatterns ? [...defaultIgnoreList] : [];
  const inputIgnores = inputIgnorePatternsStr ? inputIgnorePatternsStr.split(',').map(p => p.trim()) : [];
  const globbyIgnorePatterns: string[] = [...defaultIgnores, ...inputIgnores];

  const ig = ignore();
  let gitignoreRules: string[] = [];
  let currentDir = resolvedDir;

  if (useGitignore) {
      console.error("[repopack-lib] Searching for .gitignore files upwards from:", resolvedDir);
      while (true) {
          const gitignorePath = path.join(currentDir, '.gitignore');
          try {
              await fsp.stat(gitignorePath);
              console.error("[repopack-lib] Found .gitignore at:", gitignorePath);
              const rules = await readGitignoreRulesFromFile(gitignorePath);
              gitignoreRules.push(...rules);
          } catch (error: any) {
              if (error.code !== 'ENOENT') {
                  console.error(`[repopack-lib] Error checking for .gitignore at ${gitignorePath}:`, error);
              }
          }
          const parentDir = path.dirname(currentDir);
          if (parentDir === currentDir) break;
          currentDir = parentDir;
      }
      gitignoreRules = gitignoreRules.reverse();
      ig.add(gitignoreRules);
      console.error("[repopack-lib] Total .gitignore rules added:", gitignoreRules.length);
  }

  const files = await globby(patternsToInclude, {
    cwd: resolvedDir,
    ignore: globbyIgnorePatterns,
    onlyFiles: true,
    dot: true,
    absolute: false,
    followSymbolicLinks: false,
  });

  const filteredFiles = files.filter(file => !ig.ignores(file));

  return {
    filePaths: filteredFiles,
    defaultIgnorePatterns: defaultIgnores,
    inputIgnorePatterns: inputIgnores,
    gitignorePatterns: gitignoreRules
  };
}

function removeFileComments(content: string, filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    let lang: string | undefined = undefined;
    if (['.js', '.jsx', '.ts', '.tsx', '.java', '.c', '.h', '.cpp', '.hpp', '.cs', '.go', '.swift', '.kt', '.dart'].includes(ext)) {
        lang = 'javascript';
    } else if (['.py'].includes(ext)) {
        lang = 'python';
    } else if (['.rb'].includes(ext)) {
        lang = 'ruby';
    } else if (['.php'].includes(ext)) {
        lang = 'php';
    } else if (['.html', '.xml', '.vue', '.svelte'].includes(ext)) {
        lang = 'html';
    } else if (['.css', '.scss', '.less', '.sass'].includes(ext)) {
        lang = 'css';
    } else if (['.sh', '.bash', '.zsh', '.yaml', '.yml'].includes(ext)) {
        lang = 'shell';
    } else if (['.sql'].includes(ext)) {
        lang = 'sql';
    }
    try {
        return lang ? strip(content, { language: lang, preserveNewlines: true }) : content;
    } catch (error) {
        console.error(`[repopack-lib] Error removing comments from ${filePath}: ${error}`);
        return content;
    }
}

function removeFileEmptyLines(content: string): string {
  return content.split('\
').filter((line: string) => line.trim() !== '').join('\
');
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

async function readFileContent(filePath: string, baseDir: string): Promise<FileData | null> {
  const fullPath = path.resolve(baseDir, filePath);
  try {
    const stats = await fsp.stat(fullPath);
    if (stats.size > MAX_FILE_SIZE_BYTES) {
        console.error(`[repopack-lib] Skipping large file: ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        return null;
    }
    const fileBuffer = await fsp.readFile(fullPath);
    // @ts-ignore - Incorrect types for isBinary, expects 3 args and returns void, but actually works with 2 and returns boolean
    if (isBinary(null, fileBuffer)) { // Revert to null, fileBuffer and ignore TS error
        console.error(`[repopack-lib] Skipping binary file: ${filePath}`);
        return null;
    }
    const content = fileBuffer.toString('utf-8');
    return { path: filePath, content };
  } catch (error) {
    console.error(`[repopack-lib] Error reading file ${filePath}: ${error}`);
    return null;
  }
}

async function processFiles(filePaths: string[], options: PackCodebaseOptions): Promise<FileData[]> {
    const processedFiles: FileData[] = [];
    const { directory, removeComments = false, removeEmptyLines = false } = options;

    for (const filePath of filePaths) {
        const fileData = await readFileContent(filePath, directory);
        if (fileData) {
            let content = fileData.content;
            if (removeComments) {
                content = removeFileComments(content, filePath);
            }
            if (removeEmptyLines) {
                content = removeFileEmptyLines(content);
            }
            processedFiles.push({ ...fileData, content: content.trim() });
        }
    }
    return processedFiles;
}

interface TreeNode { name: string; children: TreeNode[]; isDirectory: boolean; }
const createTreeNode = (name: string, isDirectory: boolean): TreeNode => ({ name, children: [], isDirectory });

function addPathToTree(root: TreeNode, filePath: string): void {
    const parts = filePath.split(path.sep).filter(part => part !== '');
    let currentNode = root;
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLastPart = i === parts.length - 1;
        let child = currentNode.children.find((c) => c.name === part);
        if (!child) {
            child = createTreeNode(part, !isLastPart);
            currentNode.children.push(child);
            currentNode.children.sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
        }
        if (!isLastPart) child.isDirectory = true;
        currentNode = child;
    }
}

function treeToString(node: TreeNode, prefix = ''): string {
    let result = '';
    const childrenCount = node.children.length;
    for (let i = 0; i < childrenCount; i++) {
        const child = node.children[i];
        const isLastChild = i === childrenCount - 1;
        const connector = isLastChild ? '└── ' : '├── ';
        const linePrefix = prefix + connector;
        const childPrefix = prefix + (isLastChild ? '    ' : '│   ');
        result += `${linePrefix}${child.name}${child.isDirectory ? '/' : ''}\
`;
        if (child.isDirectory) result += treeToString(child, childPrefix);
    }
    return result;
}

function generateDirectoryStructure(filePaths: string[]): string {
    const root: TreeNode = createTreeNode('.', true);
    filePaths.forEach(filePath => addPathToTree(root, filePath));
    return treeToString(root).trim();
}

function generateSummaryNotes(options: PackCodebaseOptions): string[] {
    const notes: string[] = [];
    const useDefaultPatterns = !options.noDefaultPatterns;
    const useGitignore = !options.noGitignore;

    if (options.removeComments) notes.push("- Code comments have been removed from supported file types.");
    if (options.removeEmptyLines) notes.push("- Empty lines have been removed.");
    if (useDefaultPatterns) notes.push("- Files matching default ignore patterns are excluded.");
    else notes.push("- Default ignore patterns were not used.");
    if (useGitignore) notes.push("- Some files may have been excluded based on ignore rules.");
    if (options.ignorePatterns) notes.push("- Some files may have been excluded based on custom ignore patterns.");
    notes.push("- Binary files and files larger than 5MB are not included.");
    return notes;
}

// --- Output Formatting Helpers (adapted from output generators) ---

interface OutputContext {
  directoryStructure: string;
  processedFiles: FileData[];
  options: PackCodebaseOptions;
  defaultIgnorePatterns: string[];
  inputIgnorePatterns: string[];
  gitignorePatterns: string[];
}

interface FileSummaryContent {
    intro: string; purpose: string; file_format: string;
    usage_guidelines: string; notes: string; additional_info: string;
}

function generateFileSummaryObject(options: PackCodebaseOptions): FileSummaryContent {
    const notesList = generateSummaryNotes(options);
    const source = options.sourceIdentifier || options.directory;
    return {
        intro: "This section contains a summary of this file.",
        purpose: `This file contains a packed representation of the selected repository contents.\
It is designed to be easily consumable by AI systems for analysis, code review,\
or other automated processes.`,
        file_format: `The content is organized as follows:\
1. This summary section\
2. Directory structure (if enabled)\
3. Repository files, each consisting of:\
  - File path as an attribute\
  - Full contents of the file`,
        usage_guidelines: `- This file should be treated as read-only. Any changes should be made to the\
  original repository files, not this packed version.\
- When processing this file, use the file path to distinguish\
  between different files in the repository.\
- Be aware that this file may contain sensitive information. Handle it with\
  the same level of security as you would the original repository.`,
        notes: `${notesList.join('\
')}`,
        additional_info: ``
    };
}

function generateXmlOutput(context: OutputContext): string {
  const { directoryStructure, processedFiles, options, defaultIgnorePatterns, inputIgnorePatterns } = context;
  const { fileSummary = true, directoryStructure: includeDirStructure = true } = options;
  const builder = new XMLBuilder({ ignoreAttributes: false, format: true, indentBy: "  ", suppressBooleanAttributes: false, suppressEmptyNode: true, cdataPropName: "__cdata", });
  const createPatternNodes = (patterns: string[]) => patterns.map(p => ({ '#text': p }));
  const xmlObject = {
    repopack: {
      description: `This file is a merged representation of the codebase from ${options.sourceIdentifier || options.directory}, combined into a single document by repopack-lib.`,
      ...(fileSummary && { file_summary: generateFileSummaryObject(options) }),
      ...(defaultIgnorePatterns.length > 0 && { ignore_global: { intro: 'Default patterns used globally to exclude files:', pattern: createPatternNodes(defaultIgnorePatterns) } }),
      ...(inputIgnorePatterns.length > 0 && { ignore_input: { intro: 'User-provided patterns used to exclude files:', pattern: createPatternNodes(inputIgnorePatterns) } }),
      // Gitignore patterns are implicitly applied, maybe add a note in summary instead of listing them all?
      ...(includeDirStructure && directoryStructure && { directory_structure: directoryStructure }),
      files: {
        file: processedFiles.map((file) => ({ '_@path': file.path, '__cdata': file.content, })),
      },
    },
  };
  const xmlString = builder.build(xmlObject);
  return xmlString.startsWith('<?xml') ? xmlString : `<?xml version="1.0" encoding="UTF-8"?>\
${xmlString}`;
}

function generateMarkdownOutput(context: OutputContext): string {
  const { directoryStructure, processedFiles, options, defaultIgnorePatterns, inputIgnorePatterns } = context;
  const source = options.sourceIdentifier || options.directory;
  let output = `# Repopack Output: ${source}\
\
`;
  if (options.fileSummary) {
    const notes = generateSummaryNotes(options);
    output += `## File Summary\
\
**Notes:**\
${notes.map(n => `- ${n}`).join('\
')}\
\
`;
  }
  const generateIgnoreSection = (title: string, intro: string, patterns: string[]) => {
    let section = `## ${title}\
\
${intro}\
\
`;
    if (patterns.length > 0) section += `\`\`\`\
${patterns.join('\
')}\
\`\`\`\
`;
    else section += `_(No patterns in this category)_\
`;
    return section + `\
`;
  };
  if (defaultIgnorePatterns.length > 0) output += generateIgnoreSection('Default Global Ignore Patterns', 'Default patterns used globally:', defaultIgnorePatterns);
  if (inputIgnorePatterns.length > 0) output += generateIgnoreSection('Input Ignore Patterns', 'User-provided patterns:', inputIgnorePatterns);
  if (options.directoryStructure && directoryStructure) output += `## Directory Structure\
\
\`\`\`\
${directoryStructure}\
\`\`\`\
\
`;
  output += `## Files\
\
`;
  processedFiles.forEach(file => { output += `### \`${file.path}\`\
\
\`\`\`\
${file.content}\
\`\`\`\
\
`; });
  return output;
}

function generateTextOutput(context: OutputContext): string {
  const { directoryStructure, processedFiles, options, defaultIgnorePatterns, inputIgnorePatterns } = context;
  const source = options.sourceIdentifier || options.directory;
  let output = `Repopack Output: ${source}\
=================================\
\
`;
  if (options.fileSummary) {
    const notes = generateSummaryNotes(options);
    output += `** File Summary **\
Notes:\
${notes.map(n => `- ${n}`).join('\
')}\
\
`;
  }
  const generateIgnoreSection = (title: string, intro: string, patterns: string[]) => {
    let section = `** ${title} **\
${intro}\
`;
    if (patterns.length > 0) section += patterns.map(p => `- ${p}`).join('\
') + '\
';
    else section += `(No patterns in this category)\
`;
    return section + `\
`;
  };
  if (defaultIgnorePatterns.length > 0) output += generateIgnoreSection('Default Global Ignore Patterns', 'Default patterns used globally:', defaultIgnorePatterns);
  if (inputIgnorePatterns.length > 0) output += generateIgnoreSection('Input Ignore Patterns', 'User-provided patterns:', inputIgnorePatterns);
  if (options.directoryStructure && directoryStructure) output += `** Directory Structure **\
${directoryStructure}\
\
`;
  output += `** Files **\
`;
  processedFiles.forEach(file => { output += `---------- File: ${file.path} ----------\
${file.content}\
---------- End File: ${file.path} ----------\
\
`; });
  return output;
}

// --- Core Packing Logic (Internal Helper) ---
async function packInternal(options: PackCodebaseOptions): Promise<string> {
    console.error("[repopack-lib] Starting internal pack operation with options:", options);

    // 1. Find files
    const { filePaths, defaultIgnorePatterns, inputIgnorePatterns, gitignorePatterns } = await findFiles(options);
    console.error(`[repopack-lib] Found ${filePaths.length} files to process.`);
    if (filePaths.length === 0) {
        throw new Error("No files found matching the criteria.");
    }

    // 2. Process files
    const processedFiles = await processFiles(filePaths, options);
    console.error(`[repopack-lib] Processed ${processedFiles.length} files.`);

    // 3. Generate directory structure string
    let dirStructureString = "";
    if (options.directoryStructure) {
        console.error("[repopack-lib] Generating directory structure...");
        dirStructureString = generateDirectoryStructure(filePaths);
    }

    // 4. Generate Output
    console.error(`[repopack-lib] Generating output in ${options.outputFormat || 'xml'} format...`);
    let outputContent = "";
    const generatorContext: OutputContext = {
        directoryStructure: dirStructureString,
        processedFiles,
        options: {
            ...options,
            // Ensure sourceIdentifier is set for output generators
            sourceIdentifier: options.sourceIdentifier || options.directory,
        },
        defaultIgnorePatterns,
        inputIgnorePatterns,
        gitignorePatterns
    };

    switch (options.outputFormat) {
        case 'md': outputContent = generateMarkdownOutput(generatorContext); break;
        case 'txt': outputContent = generateTextOutput(generatorContext); break;
        case 'xml': default: outputContent = generateXmlOutput(generatorContext); break;
    }

    // 5. Handle Output Target
    const outputTarget = options.outputTarget || 'stdout'; // Default to stdout/return string
    const format = options.outputFormat || 'xml';

    switch (outputTarget) {
        case 'file':
            const filenameBase = (options.repoOwner && options.repoName)
                ? `repopack-output-${options.repoOwner}-${options.repoName}`
                : `repopack-output`;
            const outputFilename = `${filenameBase}.${format}`;
            // Use the *outputTargetDirectory* if provided (for remote), else use the scanning directory (for local)
            const outputBaseDirNormalized = normalizePathUri(options.outputTargetDirectory || options.directory);
            const outputPath = path.join(outputBaseDirNormalized, outputFilename);
            try {
                console.error(`[repopack-lib] Writing output to file: ${outputPath}`);
                await fsp.mkdir(path.dirname(outputPath), { recursive: true });
                await fsp.writeFile(outputPath, outputContent, 'utf8');
                console.error(`[repopack-lib] Successfully wrote to ${outputPath}`);
                return `Repopack content written to ${outputPath}`; // Return confirmation message
            } catch (writeError: any) {
                console.error(`[repopack-lib] Error writing output file: ${writeError.message}`, writeError.stack);
                throw new Error(`Error writing output file ${outputPath}: ${writeError.message}`);
            }

        case 'clipboard':
            try {
                console.error(`[repopack-lib] Copying output to clipboard...`);
                await clipboard.write(outputContent); // Use async clipboard write
                console.error(`[repopack-lib] Successfully copied output to clipboard.`);
                return `Repopack content copied to clipboard.`; // Return confirmation message
            } catch (clipboardError: any) {
                console.error(`[repopack-lib] Error copying to clipboard: ${clipboardError.message}`, clipboardError.stack);
                throw new Error(`Error copying output to clipboard: ${clipboardError.message}`);
            }

        case 'stdout':
        default:
            console.error("[repopack-lib] Returning output content as string.");
            return outputContent; // Return the actual content string
    }
}


// --- Exported Library Functions ---

// Define Zod Schemas for parameters
const PackCodebaseParams = {
    includePatterns: z.string().optional().describe('includePatterns'),
    ignorePatterns: z.string().optional().describe('ignorePatterns'),
    outputFormat: z.enum(['xml', 'md', 'txt']).optional().describe('outputFormat'),
    outputTarget: z.enum(['stdout', 'file', 'clipboard']).optional().describe('outputTarget'),
    removeComments: z.boolean().optional().describe('removeComments'),
    removeEmptyLines: z.boolean().optional().describe('removeEmptyLines'),
    fileSummary: z.boolean().optional().default(true).describe('fileSummary'),
    directoryStructure: z.boolean().optional().default(true).describe('directoryStructure'),
    noGitignore: z.boolean().optional().describe('noGitignore'),
    noDefaultPatterns: z.boolean().optional().describe('noDefaultPatterns'),
};

/**
 * Packages a local code directory into a consolidated text format.
 * Mimics the pack_codebase MCP tool.
 */
export const packLocal = DefineFunction({
  description: 'Packages a local code directory into a consolidated text format.',
  args: z.tuple([
    z.string().describe('directory'), // required
    PackCodebaseParams.includePatterns,
    PackCodebaseParams.ignorePatterns,
    PackCodebaseParams.outputFormat,
    PackCodebaseParams.outputTarget,
        PackCodebaseParams.removeComments,
        PackCodebaseParams.removeEmptyLines,
        PackCodebaseParams.fileSummary,
        PackCodebaseParams.directoryStructure,
        PackCodebaseParams.noGitignore,
        PackCodebaseParams.noDefaultPatterns,
    ]),
    return: z.string().describe('Output content or confirmation message'),
    function: async (
        directory,
        includePatterns,
        ignorePatterns,
        outputFormat,
        outputTarget,
        removeComments,
        removeEmptyLines,
        fileSummary,
        directoryStructure,
        noGitignore,
        noDefaultPatterns
    ) => {
        try {
            const options: PackCodebaseOptions = {
                directory: normalizePathUri(directory), // Normalize path immediately
            sourceIdentifier: normalizePathUri(directory), // Use normalized path as identifier
            includePatterns,
            ignorePatterns,
            outputFormat: outputFormat ?? 'xml', // Use default from schema if needed or hardcode
            outputTarget: outputTarget ?? 'stdout',
            removeComments: !!removeComments,
            removeEmptyLines: !!removeEmptyLines,
            fileSummary: fileSummary, // Already defaulted by Zod
            directoryStructure: directoryStructure, // Already defaulted by Zod
            noGitignore: !!noGitignore,
            noDefaultPatterns: !!noDefaultPatterns,
        };
        return await packInternal(options);
    } catch (error: any) {
        console.error(`[repopack-lib] Error in packLocal: ${error.message}`, error.stack);
        // Consider throwing the error instead of returning a string for better error handling upstream
        throw new Error(`Error packing local directory: ${error.message}`);
        // return `<error>Error packing local directory: ${error.message}</error>`;
    }
  }
});

/**
 * Clones a remote GitHub repository and packages it.
 * Mimics the pack_remote_codebase MCP tool.
 */
export const packRemote = DefineFunction({
  description: 'Clones a remote GitHub repository and packages it.',
  args: z.tuple([
    z.string().describe('github_repo'), // required
    z.string().describe('directory'), // required - Target directory for 'file' output
    PackCodebaseParams.includePatterns,
    PackCodebaseParams.ignorePatterns,
    PackCodebaseParams.outputFormat,
    PackCodebaseParams.outputTarget,
        PackCodebaseParams.removeComments,
        PackCodebaseParams.removeEmptyLines,
        PackCodebaseParams.fileSummary,
        PackCodebaseParams.directoryStructure,
        PackCodebaseParams.noGitignore,
        PackCodebaseParams.noDefaultPatterns,
    ]),
    return: z.string().describe('Output content or confirmation message'),
    function: async (
        github_repo,
        directory,
        includePatterns,
        ignorePatterns,
        outputFormat,
        outputTarget,
        removeComments,
    removeEmptyLines,
        fileSummary,
        directoryStructure,
        noGitignore,
        noDefaultPatterns
    ) => {
        let tempDir: string | undefined;
        const originalDirectoryNormalized = normalizePathUri(directory);

        try {
            // 1. Create temp directory
            tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'repopack-clone-'));
            console.error(`[repopack-lib] Created temporary directory: ${tempDir}`);

        // 2. Clone repository
        const cloneUrl = github_repo;
        console.error(`[repopack-lib] Cloning repository: ${cloneUrl} into ${tempDir}`);
        try {
            execSync(`git clone --depth 1 ${cloneUrl} .`, { cwd: tempDir, stdio: 'pipe' });
            console.error(`[repopack-lib] Successfully cloned ${cloneUrl}`);
        } catch (cloneError: any) {
            console.error(`[repopack-lib] Error cloning repository: ${cloneError.message}`, cloneError.stderr?.toString());
            throw new Error(`Error cloning repository ${cloneUrl}: ${cloneError.message}`);
        }

        // Extract owner/repo for potential use in filename
        let repoOwner: string | undefined;
        let repoName: string | undefined;
        const repoUrlMatch = github_repo.match(/(?:https:\/\/github\.com\/|git@github\.com:)([^\/]+)\/([^\/]+?)(\.git)?$/i);
        if (repoUrlMatch && repoUrlMatch.length >= 3) {
            repoOwner = repoUrlMatch[1];
            repoName = repoUrlMatch[2];
        }

        // 3. Prepare options for packInternal
        const options: PackCodebaseOptions = {
            directory: tempDir, // Use the *temporary* directory for scanning files
            outputTargetDirectory: originalDirectoryNormalized, // Use the new property for file output
            sourceIdentifier: github_repo, // Identify source as the remote URL
            github_repo,
            includePatterns,
            ignorePatterns,
            outputFormat: outputFormat ?? 'xml',
            outputTarget: outputTarget ?? 'stdout',
            removeComments: !!removeComments,
            removeEmptyLines: !!removeEmptyLines,
            fileSummary: fileSummary, // Already defaulted by Zod
            directoryStructure: directoryStructure, // Already defaulted by Zod
            noGitignore: !!noGitignore,
            noDefaultPatterns: !!noDefaultPatterns,
            repoOwner,
            repoName,
        };

        // 4. Call internal packing logic with the *temp* directory as the source to scan
        const result = await packInternal(options);
        return result;

    } catch (error: any) {
        console.error(`[repopack-lib] Error in packRemote: ${error.message}`, error.stack);
        // Consider throwing the error instead of returning a string for better error handling upstream
        throw new Error(`Error packing remote repository: ${error.message}`);
        // return `<error>Error packing remote repository: ${error.message}</error>`;
    } finally {
        // 5. Clean up temp directory
        if (tempDir) {
            console.error(`[repopack-lib] Cleaning up temporary directory: ${tempDir}`);
            try {
                await fsp.rm(tempDir, { recursive: true, force: true });
                console.error(`[repopack-lib] Successfully removed temporary directory: ${tempDir}`);
            } catch (cleanupError: any) {
                console.error(`[repopack-lib] Error removing temporary directory ${tempDir}: ${cleanupError.message}`);
            }
        }
    }
  }
}); 