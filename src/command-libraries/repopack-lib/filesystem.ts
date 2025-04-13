import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { Minimatch } from 'minimatch';
import { PackCodebaseOptions, FindFilesResult, FileData } from './types.js';
import { DEFAULT_IGNORE_PATTERNS, DEFAULT_MAX_FILE_SIZE } from './constants.js';

/**
 * Normalizes a path or URI to a consistent format (POSIX-style separators).
 * Handles file:// URIs and standard paths.
 *
 * @param uriPath The path or URI to normalize.
 * @returns The normalized path string.
 */
export function normalizePathUri(uriPath: string): string {
    let normalizedPath = uriPath;

    // Handle file:// URIs
    if (normalizedPath.startsWith('file://')) {
        try {
            normalizedPath = decodeURIComponent(new URL(normalizedPath).pathname);
            // On Windows, URL pathname starts with a slash (e.g., /C:/...), remove leading slash if it's followed by a drive letter
            if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(normalizedPath)) {
                normalizedPath = normalizedPath.substring(1);
            }
        } catch (e) {
            console.error(`[repopack-lib] Error parsing file URI: ${uriPath}. Proceeding with raw path.`, e);
            normalizedPath = uriPath.substring('file://'.length);
        }
    }

    // Convert backslashes to forward slashes for consistency
    normalizedPath = normalizedPath.replace(/\\/g, '/');

    return normalizedPath;
}

/**
 * Reads gitignore rules from a specified file path.
 *
 * @param gitignorePath Absolute path to the .gitignore file.
 * @returns A promise resolving to an array of gitignore patterns.
 */
export async function readGitignoreRulesFromFile(gitignorePath: string): Promise<string[]> {
  try {
    if (!fs.existsSync(gitignorePath)) {
      return [];
    }
    const content = await fsp.readFile(gitignorePath, 'utf-8');
    return content.split(/\r?\n/).filter(line => line.trim() !== '' && !line.trim().startsWith('#'));
  } catch (error: any) {
    console.error(`[repopack-lib] Warning: Could not read or parse .gitignore file at ${gitignorePath}: ${error.message}`);
    return [];
  }
}

/**
 * Recursively finds files in a directory, respecting ignore patterns and .gitignore files.
 *
 * @param options Configuration options including directory, patterns, and gitignore usage.
 * @returns A promise resolving to an object containing file paths and ignore patterns used.
 */
export async function findFiles(options: PackCodebaseOptions): Promise<FindFilesResult> {
  const baseDir = options.directory;
  const useDefaultPatterns = !options.noDefaultPatterns;
  const useGitignore = !options.noGitignore;

  const result: FindFilesResult = {
    filePaths: [],
    defaultIgnorePatterns: useDefaultPatterns ? [...DEFAULT_IGNORE_PATTERNS] : [],
    inputIgnorePatterns: [],
    gitignorePatterns: [],
  };

  const ignoreList: string[] = [];
  if (useDefaultPatterns) {
    ignoreList.push(...DEFAULT_IGNORE_PATTERNS);
  }
  if (options.ignorePatterns) {
    const inputPatterns = options.ignorePatterns.split(',').map(p => p.trim()).filter(p => p);
    ignoreList.push(...inputPatterns);
    result.inputIgnorePatterns = inputPatterns;
  }

  const includeMatchers: Minimatch[] = [];
  if (options.includePatterns) {
    const inputPatterns = options.includePatterns.split(',').map(p => p.trim()).filter(p => p);
    inputPatterns.forEach(pattern => includeMatchers.push(new Minimatch(pattern, { dot: true })));
  }

  async function traverse(currentDir: string, currentRelativeDir: string, currentGitignorePatterns: string[]): Promise<void> {
    let effectiveGitignore = [...currentGitignorePatterns];

    if (useGitignore) {
      const gitignorePath = path.join(currentDir, '.gitignore');
      const newRules = await readGitignoreRulesFromFile(gitignorePath);
      if (newRules.length > 0) {
        // Rules in deeper .gitignore files add to (and potentially override) parent rules
        // For simplicity here, we concatenate. A full gitignore implementation is complex.
        effectiveGitignore.push(...newRules);
        // Store all discovered gitignore rules for the summary
        result.gitignorePatterns.push(...newRules.map(rule => path.join(currentRelativeDir, rule)));
      }
    }

    // Combine all ignore sources for this level
    const currentIgnoreList = [...ignoreList, ...effectiveGitignore];
    const ignoreMatchers = currentIgnoreList.map(pattern => new Minimatch(pattern, { dot: true }));

    try {
      const entries = await fsp.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(currentDir, entry.name);
        const relativePath = path.join(currentRelativeDir, entry.name).replace(/\\/g, '/'); // Use forward slash

        // Check against combined ignore patterns
        let isIgnored = ignoreMatchers.some(matcher => matcher.match(relativePath));
        if (entry.isDirectory()) {
          isIgnored = ignoreMatchers.some(matcher => matcher.match(relativePath + '/')); // Check directory match
        }
        if (isIgnored) {
          // console.error(`[repopack-lib DEBUG] Ignoring: ${relativePath}`);
          continue;
        }

        if (entry.isDirectory()) {
          await traverse(entryPath, relativePath, effectiveGitignore);
        } else if (entry.isFile()) {
          // Check against include patterns if they exist
          if (includeMatchers.length > 0 && !includeMatchers.some(matcher => matcher.match(relativePath))) {
            // console.error(`[repopack-lib DEBUG] Not included: ${relativePath}`);
            continue;
          }

          // Check file size
          try {
            const stats = await fsp.stat(entryPath);
            if (stats.size > DEFAULT_MAX_FILE_SIZE) {
              console.warn(`[repopack-lib] Skipping large file: ${relativePath} (size: ${stats.size} bytes)`);
              continue;
            }
          } catch (statError: any) {
            console.error(`[repopack-lib] Warning: Could not get stats for file ${relativePath}: ${statError.message}`);
            // Decide whether to skip or proceed without size check
            continue;
          }

          result.filePaths.push(relativePath);
        }
      }
    } catch (err: any) {
      console.error(`[repopack-lib] Error reading directory ${currentDir}: ${err.message}`);
      // Decide if we should stop or continue
    }
  }

  await traverse(baseDir, '', []);
  // Remove potential duplicates in gitignorePatterns collected
  result.gitignorePatterns = [...new Set(result.gitignorePatterns)];
  return result;
}

/**
 * Reads the content of a single file.
 *
 * @param filePath Absolute path to the file.
 * @param baseDir Absolute path to the base directory (for calculating relative path).
 * @returns A promise resolving to FileData or null if reading fails.
 */
export async function readFileContent(filePath: string, baseDir: string): Promise<FileData | null> {
  try {
    const content = await fsp.readFile(filePath, 'utf-8');
    const relativePath = path.relative(baseDir, filePath).replace(/\\/g, '/');
    return { path: relativePath, content };
  } catch (error: any) {
    // console.error(`[repopack-lib] Error reading file ${filePath}: ${error.message}`);
    return null; // Skip files that cannot be read
  }
} 