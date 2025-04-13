import { z } from 'zod';
import * as path from 'path';
import * as os from 'os';
import * as fsp from 'fs/promises';
import { execSync } from 'child_process';
import { DefineObjectFunction } from '../../utils/zod-function-utils.js';
import { PackCodebaseOptions } from './types.js';
import { packInternal } from './packInternal.js';
import { normalizePathUri } from './filesystem.js';

// Define Zod Schema for parameters using z.object()
const PackCodebaseArgsSchema = z.object({
  directory: z.string().describe('Absolute path to the code directory to pack.'),
  github_repo: z.string().optional().describe('URL of the GitHub repository to clone.'),
  includePatterns: z.string().optional().describe('Comma-separated glob patterns for files to include.'),
  ignorePatterns: z.string().optional().describe('Comma-separated glob patterns for files/directories to ignore.'),
  outputFormat: z.enum(['xml', 'md', 'txt']).optional().default('xml').describe('Output format: xml, md, or txt.'),
  outputTarget: z.enum(['stdout', 'file', 'clipboard']).optional().default('stdout').describe('Output destination: stdout, file, or clipboard.'),
  outputDirectory: z.string().optional().default('.').describe('Directory to write the output file to (defaults to current directory).'), // Added outputDirectory
  removeComments: z.boolean().optional().default(false).describe('Remove comments from code files.'),
  removeEmptyLines: z.boolean().optional().default(false).describe('Remove empty lines from files.'),
  fileSummary: z.boolean().optional().default(true).describe('Include a summary section in the output.'),
  directoryStructure: z.boolean().optional().default(true).describe('Include a directory structure section.'),
  noGitignore: z.boolean().optional().default(false).describe('Disable the use of .gitignore files.'),
  noDefaultPatterns: z.boolean().optional().default(false).describe('Disable default ignore patterns.'),
});

/**
 * Packages a local code directory.
 */
export const packLocal = DefineObjectFunction({
  description: 'Packages a local code directory into a consolidated text format.',
  argsSchema: PackCodebaseArgsSchema.omit({ github_repo: true }),
  function: async (optionsInput) => {
    // Destructure outputDirectory along with other options
    const { directory, outputDirectory, ...restOptions } = optionsInput;
    try {
      const normalizedInputPath = normalizePathUri(directory);
      // Normalize the output directory path as well
      const normalizedOutputPath = normalizePathUri(outputDirectory || '.'); // Use default '.' if undefined
      const options: PackCodebaseOptions = {
        directory: normalizedInputPath,
        sourceIdentifier: normalizedInputPath,
        outputTargetDirectory: normalizedOutputPath, // Use the normalized output path
        ...restOptions,
        github_repo: undefined,
        repoOwner: undefined,
        repoName: undefined,
      };
      console.error(`[packLocal] ABOUT TO CALL packInternal...`);
      await packInternal(options);
      console.error(`[packLocal] SUCCESSFULLY RETURNED from packInternal.`);
    } catch (error: any) {
      console.error(`[packLocal] Error during packInternal call: ${error.message}`, error.stack);
      throw new Error(`Error packing local directory '${directory}': ${error.message}`);
    }
  },
});

/**
 * Clones a remote GitHub repository and packages it.
 */
export const packRemote = DefineObjectFunction({
  description: 'Clones a remote GitHub repository and packages it.',
  argsSchema: PackCodebaseArgsSchema.extend({
      github_repo: z.string().describe('URL of the GitHub repository to clone (required).')
  }),
  positionalArgsOrder: ['github_repo', 'directory'],
  function: async (optionsInput) => {
    const { github_repo, directory, ...restOptions } = optionsInput;

    let tempDir: string | undefined;
    const originalOutputDirectoryNormalized = normalizePathUri(directory);

    try {
      tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'repopack-clone-'));

      // --- Start URL Parsing ---
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
        ...restOptions, // Pass through include/exclude patterns, formatting options etc.
        directory: scanDirectory, // <<< Critical change: Pack the specific subdirectory
        outputTargetDirectory: originalOutputDirectoryNormalized, // Where the final output file should go
        sourceIdentifier: github_repo, // Use the original full URL in the output summary
        github_repo: github_repo,      // Keep original URL info if needed later
        repoOwner,
        repoName,
      };
      // --- End Prepare Options for packInternal ---


      console.log(`[packRemote] Calling packInternal for directory: ${options.directory}`);
      await packInternal(options);
      console.log(`[packRemote] Successfully returned from packInternal.`);

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
}); 