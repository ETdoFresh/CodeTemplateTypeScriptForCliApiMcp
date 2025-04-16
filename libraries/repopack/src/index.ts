// src/command-libraries/repopack-lib/index.ts

// import { z } from 'zod'; // No longer needed for definition
import * as path from 'path';
import * as os from 'os';
import * as fsp from 'fs/promises';
import { execSync } from 'child_process';
// import { DefineObjectFunction } from '../../utils/zod-function-utils.js'; // Replaced
import { FunctionDefinition, ArgumentDefinition } from '@system/command-types.js'; // Path to system types
import { PackCodebaseOptions } from './types.js'; // Sibling import remains ./
import { packInternal } from './packInternal.js'; // Sibling import remains ./
import { normalizePathUri } from './filesystem.js'; // Sibling import remains ./

// Zod schema removed - arguments are now defined in FunctionDefinition

/**
 * Packages a local code directory.
 */
export const packLocal: FunctionDefinition = {
  name: 'packLocal',
  description: 'Packages a local code directory into a consolidated text format.',
  arguments: [
    { name: 'directory', type: 'string', description: 'Absolute path to the code directory to pack.' },
    { name: 'includePatterns', type: 'string', description: 'Comma-separated glob patterns for files to include.', optional: true },
    { name: 'ignorePatterns', type: 'string', description: 'Comma-separated glob patterns for files/directories to ignore.', optional: true },
    { name: 'outputFormat', type: 'string', description: 'Output format: xml, md, or txt.', optional: true, defaultValue: 'xml' },
    { name: 'outputTarget', type: 'string', description: 'Output destination: stdout, file, or clipboard.', optional: true, defaultValue: 'stdout' },
    { name: 'outputDirectory', type: 'string', description: 'Directory to write the output file to (defaults to current directory).', optional: true, defaultValue: '.' },
    { name: 'removeComments', type: 'boolean', description: 'Remove comments from code files.', optional: true, defaultValue: false },
    { name: 'removeEmptyLines', type: 'boolean', description: 'Remove empty lines from files.', optional: true, defaultValue: false },
    { name: 'fileSummary', type: 'boolean', description: 'Include a summary section in the output.', optional: true, defaultValue: true },
    { name: 'directoryStructure', type: 'boolean', description: 'Include a directory structure section.', optional: true, defaultValue: true },
    { name: 'noGitignore', type: 'boolean', description: 'Disable the use of .gitignore files.', optional: true, defaultValue: false },
    { name: 'noDefaultPatterns', type: 'boolean', description: 'Disable default ignore patterns.', optional: true, defaultValue: false },
  ],
  restArgument: undefined,
  returnType: { name: 'packedContent', type: 'string', description: 'The generated packed codebase content (if outputTarget is stdout)', optional: true },
  function: async (
    directory: string,
    includePatterns?: string,
    ignorePatterns?: string,
    outputFormat?: string,
    outputTarget?: string,
    outputDirectory?: string,
    removeComments?: boolean,
    removeEmptyLines?: boolean,
    fileSummary?: boolean,
    directoryStructure?: boolean,
    noGitignore?: boolean,
    noDefaultPatterns?: boolean
  ): Promise<string | void> => {
    try {
      const normalizedInputPath = normalizePathUri(directory);
      const normalizedOutputPath = normalizePathUri(outputDirectory || '.');
      
      const options: PackCodebaseOptions = {
        directory: normalizedInputPath,
        includePatterns: includePatterns,
        ignorePatterns: ignorePatterns,
        outputFormat: (outputFormat || 'xml') as 'xml' | 'md' | 'txt',
        outputTarget: (outputTarget || 'stdout') as 'stdout' | 'file' | 'clipboard',
        outputTargetDirectory: normalizedOutputPath,
        removeComments: removeComments || false,
        removeEmptyLines: removeEmptyLines || false,
        fileSummary: fileSummary === undefined ? true : fileSummary,
        directoryStructure: directoryStructure === undefined ? true : directoryStructure,
        noGitignore: noGitignore || false,
        noDefaultPatterns: noDefaultPatterns || false,
        sourceIdentifier: normalizedInputPath,
        github_repo: undefined,
        repoOwner: undefined,
        repoName: undefined,
      };
      console.error(`[packLocal] ABOUT TO CALL packInternal...`);
      const result = await packInternal(options);
      console.error(`[packLocal] SUCCESSFULLY RETURNED from packInternal.`);
      return result;
    } catch (error: any) {
      console.error(`[packLocal] Error during packInternal call: ${error.message}`, error.stack);
      throw new Error(`Error packing local directory '${directory}': ${error.message}`);
    }
  },
};

/**
 * Clones a remote GitHub repository and packages it.
 */
export const packRemote: FunctionDefinition = {
  name: 'packRemote',
  description: 'Clones a remote GitHub repository and packages it.',
  arguments: [
    // Note: 'directory' from the original schema is used as the output directory path in the function logic.
    // We keep it in the arguments list as it was part of the original schema definition.
    // The 'outputDirectory' argument provides an alternative way to specify the output path.
    { name: 'directory', type: 'string', description: 'Absolute path for the output directory (used if outputDirectory is not specified).' },
    { name: 'github_repo', type: 'string', description: 'URL of the GitHub repository to clone (required).' }, // Required
    { name: 'includePatterns', type: 'string', description: 'Comma-separated glob patterns for files to include.', optional: true },
    { name: 'ignorePatterns', type: 'string', description: 'Comma-separated glob patterns for files/directories to ignore.', optional: true },
    { name: 'outputFormat', type: 'string', description: 'Output format: xml, md, or txt.', optional: true, defaultValue: 'xml' },
    { name: 'outputTarget', type: 'string', description: 'Output destination: stdout, file, or clipboard.', optional: true, defaultValue: 'stdout' },
    { name: 'outputDirectory', type: 'string', description: 'Explicit directory to write the output file to (overrides \'directory\' argument, defaults to current directory).', optional: true, defaultValue: '.' },
    { name: 'removeComments', type: 'boolean', description: 'Remove comments from code files.', optional: true, defaultValue: false },
    { name: 'removeEmptyLines', type: 'boolean', description: 'Remove empty lines from files.', optional: true, defaultValue: false },
    { name: 'fileSummary', type: 'boolean', description: 'Include a summary section in the output.', optional: true, defaultValue: true },
    { name: 'directoryStructure', type: 'boolean', description: 'Include a directory structure section.', optional: true, defaultValue: true },
    { name: 'noGitignore', type: 'boolean', description: 'Disable the use of .gitignore files.', optional: true, defaultValue: false },
    { name: 'noDefaultPatterns', type: 'boolean', description: 'Disable default ignore patterns.', optional: true, defaultValue: false },
  ],
  restArgument: undefined,
  returnType: { name: 'packedContent', type: 'string', description: 'The generated packed codebase content (if outputTarget is stdout)', optional: true },
  function: async (
    directory: string,
    github_repo: string,
    includePatterns?: string,
    ignorePatterns?: string,
    outputFormat?: string,
    outputTarget?: string,
    explicitOutputDirectory?: string, // Renamed from outputDirectory in definition for clarity
    removeComments?: boolean,
    removeEmptyLines?: boolean,
    fileSummary?: boolean,
    directoryStructure?: boolean,
    noGitignore?: boolean,
    noDefaultPatterns?: boolean
  ): Promise<string | void> => {
    let tempDir: string | undefined;
    // Determine the final output directory: use explicitOutputDirectory if provided, otherwise fall back to the 'directory' argument.
    const targetOutputDirectory = explicitOutputDirectory || directory; // Use positional args
    if (!targetOutputDirectory) {
        throw new Error("Output directory must be specified via 'directory' or 'outputDirectory' argument.");
    }
    const originalOutputDirectoryNormalized = normalizePathUri(targetOutputDirectory);


    try {
      tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'repopack-clone-'));

      // --- Start URL Parsing --- (Uses positional github_repo)
      let baseCloneUrl: string;
      let subDirectoryPath = '';

      // Regex to capture base repo URL (group 1) and optional subdirectory path (group 3) after /tree/branch/
      const urlRegex = /^(https?:\/\/github\.com\/[^\/]+\/[^\/]+)(?:\/tree\/[^\/]+\/(.*))?$/;
      const match = github_repo.match(urlRegex);

      if (match) {
          baseCloneUrl = `${match[1]}.git`; // Append .git for cloning
          if (match[2]) { // If group 2 exists (path part)
              subDirectoryPath = match[2].replace(/\/$/, ''); // Get the path part and remove trailing slash if any
          }
      } else {
          // Handle the case where the URL might be just the repo root without /tree/branch
          const rootRepoRegex = /^(https?:\/\/github\.com\/[^\/]+\/[^\/]+)\/?$/;
          const rootMatch = github_repo.match(rootRepoRegex);
          if (rootMatch) {
              baseCloneUrl = `${rootMatch[1]}.git`;
              // subDirectoryPath remains ''
          } else {
            throw new Error(`Invalid GitHub URL format. Expected format like https://github.com/owner/repo or https://github.com/owner/repo/tree/branch/path. Got: ${github_repo}`);
          }
      }
      // --- End URL Parsing ---


      // --- Clone Base Repository ---
      console.log(`[packRemote] Cloning base repository: ${baseCloneUrl}`);
      try {
        // Clone the base repository URL
        execSync(`git clone --depth 1 ${baseCloneUrl} .`, { cwd: tempDir, stdio: 'pipe' });
        console.log(`[packRemote] Successfully cloned into ${tempDir}`);
      } catch (cloneError: any) {
        // Ensure tempDir is cleaned up even if cloning fails
        if (tempDir) {
            try { await fsp.rm(tempDir, { recursive: true, force: true }); } catch (e) { /* ignore cleanup error */ }
        }
        throw new Error(`Error cloning base repository ${baseCloneUrl}: ${cloneError.message}`);
      }
      // --- End Clone Base Repository ---


      // --- Determine and Validate Scan Directory ---
      const scanDirectory = path.join(tempDir, subDirectoryPath);
      console.log(`[packRemote] Target directory for packing: ${scanDirectory}`);

      try {
          const stats = await fsp.stat(scanDirectory);
          if (!stats.isDirectory()) {
              // This path exists but isn't a directory
              throw new Error(`Specified path '${subDirectoryPath}' within the repository is not a directory.`);
          }
          console.log(`[packRemote] Validated target directory exists.`);
      } catch (statError: any) {
          if (statError.code === 'ENOENT') {
               throw new Error(`Subdirectory not found in repository: '${subDirectoryPath}'. Please check the path and branch name in the URL: ${github_repo}`);
          }
          // Other stat errors (e.g., permission issues)
          throw new Error(`Error accessing subdirectory '${subDirectoryPath}' in cloned repo: ${statError.message}`);
      }
      // --- End Determine and Validate Scan Directory ---


      // --- Extract Repo Owner/Name ---
      let repoOwner: string | undefined;
      let repoName: string | undefined;
      // Use baseCloneUrl to reliably get owner/name
      const repoUrlMatch = baseCloneUrl.match(/(?:https:\/\/github\.com\/|git@github\.com:)([^\/]+)\/([^\/]+?)(\.git)?$/i);
      if (repoUrlMatch && repoUrlMatch.length >= 3) {
        repoOwner = repoUrlMatch[1];
        repoName = repoUrlMatch[2];
      }
      // --- End Extract Repo Owner/Name ---


      // --- Prepare Options for packInternal ---
      const options: PackCodebaseOptions = {
        directory: scanDirectory, // This is the *source* directory for packInternal (the cloned subdir)
        includePatterns: includePatterns,
        ignorePatterns: ignorePatterns,
        outputFormat: (outputFormat || 'xml') as 'xml' | 'md' | 'txt',
        outputTarget: (outputTarget || 'stdout') as 'stdout' | 'file' | 'clipboard',
        outputTargetDirectory: originalOutputDirectoryNormalized, // Where the final output file should go
        removeComments: removeComments || false,
        removeEmptyLines: removeEmptyLines || false,
        fileSummary: fileSummary === undefined ? true : fileSummary,
        directoryStructure: directoryStructure === undefined ? true : directoryStructure,
        noGitignore: noGitignore || false,
        noDefaultPatterns: noDefaultPatterns || false,
        sourceIdentifier: github_repo, // Use the original full URL in the output summary
        github_repo: github_repo,      // Keep original URL info if needed later
        repoOwner,
        repoName,
      };
      // --- End Prepare Options for packInternal ---


      console.log(`[packRemote] Calling packInternal for directory: ${options.directory}`);
      const result = await packInternal(options);
      console.log(`[packRemote] Successfully returned from packInternal.`);
      return result;

    } catch (error: any) {
       // Ensure the specific error is propagated
      console.error(`[packRemote] Error during operation: ${error.message}`, error.stack);
      throw new Error(`Error packing remote repository '${github_repo}': ${error.message}`);
    } finally {
      // --- Cleanup Temporary Directory ---
      if (tempDir) {
        console.log(`[packRemote] Cleaning up temporary directory: ${tempDir}`);
        try {
          await fsp.rm(tempDir, { recursive: true, force: true });
          console.log(`[packRemote] Successfully removed temporary directory.`);
        } catch (cleanupError: any) {
          // Log cleanup errors but don't let them mask the primary error
          console.error(`[packRemote] Warning: Error removing temporary directory ${tempDir}: ${cleanupError.message}`);
        }
      }
      // --- End Cleanup Temporary Directory ---
    }
  },
};