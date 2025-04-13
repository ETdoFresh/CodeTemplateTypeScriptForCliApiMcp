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

      const cloneUrl = github_repo;
      try {
        execSync(`git clone --depth 1 ${cloneUrl} .`, { cwd: tempDir, stdio: 'pipe' });
      } catch (cloneError: any) {
        throw new Error(`Error cloning repository ${cloneUrl}: ${cloneError.message}`);
      }

      let repoOwner: string | undefined;
      let repoName: string | undefined;
      const repoUrlMatch = github_repo.match(/(?:https:\/\/github\.com\/|git@github\.com:)([^\/]+)\/([^\/]+?)(\.git)?$/i);
      if (repoUrlMatch && repoUrlMatch.length >= 3) {
        repoOwner = repoUrlMatch[1];
        repoName = repoUrlMatch[2];
      }

      const options: PackCodebaseOptions = {
        directory: tempDir,
        outputTargetDirectory: originalOutputDirectoryNormalized,
        sourceIdentifier: github_repo,
        github_repo: github_repo,
        ...restOptions,
        repoOwner,
        repoName,
      };

      await packInternal(options);

    } catch (error: any) {
      throw new Error(`Error packing remote repository '${github_repo}': ${error.message}`);
    } finally {
      if (tempDir) {
        try {
          await fsp.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError: any) {
          console.error(`[packRemote] Warning: Error removing temporary directory ${tempDir}: ${cleanupError.message}`);
        }
      }
    }
  },
}); 