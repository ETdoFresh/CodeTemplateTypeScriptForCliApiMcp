// src/command-libraries/repopack-lib/packInternal.ts
import * as path from 'path';
import * as fsp from 'fs/promises';
import clipboard from 'clipboardy';
import { isText } from 'istextorbinary'; // Import isText
import { PackCodebaseOptions, FileData, OutputContext } from './types.js';
import { findFiles } from './filesystem.js';
import { processFiles } from './processing.js';
import { generateDirectoryStructure, generateXmlOutput, generateMarkdownOutput, generateTextOutput } from './formatters.js';

/**
 * Internal logic for packing codebase. Handles finding, processing, formatting,
 * and outputting the result based on options.
 *
 * @param options The packing options.
 * @returns A promise resolving to void. Output is handled via stdout/file/clipboard.
 */
export async function packInternal(options: PackCodebaseOptions): Promise<void> {
  console.log(">>> packInternal function entered.");

  // 1. Find files
  // 'directory' in options refers to the source to scan (local path or temp clone path)
  const { filePaths, defaultIgnorePatterns, inputIgnorePatterns, gitignorePatterns } = await findFiles(options);
  if (filePaths.length === 0) {
    // It's valid to find no files if everything is ignored or the dir is empty.
    // We should still produce an output structure saying no files were included.
    console.warn("[packInternal] No files found matching the criteria after filtering.");
    // Continue to generate output structure, but processedFiles will be empty.
  } else {
  }


  // 2. Read and process file contents (only if files were found)
  let readAndProcessedFiles: FileData[] = [];
  if (filePaths.length > 0) {
      console.log("--- Starting file processing loop ---"); // Added log
      const fileReadPromises = filePaths.map(async (relativeFilePath): Promise<FileData | null> => {
          console.log(`Processing file: ${relativeFilePath}`); // Added log
          // Wrap the entire operation for this file in a try-catch
          try {
              const absolutePath = path.resolve(options.directory, relativeFilePath);
              console.log(`  Reading content for: ${relativeFilePath}`); // Added log
              const buffer = await fsp.readFile(absolutePath);
              const stats = await fsp.stat(absolutePath);

              if (stats.size > (5 * 1024 * 1024)) { 
                  console.warn(`[packInternal] Skipping large file: ${relativeFilePath} (size: ${stats.size} bytes)`);
                  return null;
              }

              console.log(`  Checking text/binary for: ${relativeFilePath}`); // Added log
              return await new Promise((resolve) => {
                  const normalizedPath = relativeFilePath.replace(/\\/g, '/');

                  // Main logic for text/binary check
                  console.log(`>>> Starting async check for: ${relativeFilePath}`);
                  // Always treat as text, bypassing isTextOrBinary check
                  try {
                      const content = buffer.toString('utf-8');
                      // +++ Logging included as per original code +++
                      console.log(`+++ Preparing to add file to XML structure: ${relativeFilePath}`);
                      console.log(`+++ Content length: ${content.length}`);
                      console.log(`+++ Content snippet: ${content.substring(0, 100)}`);
                      // +++ End logging +++
                      console.log(`<<< Finished async check (assumed text) for: ${relativeFilePath}`); // Modified log
                      resolve({ path: relativeFilePath, content });
                      console.log(`  Adding to output structure (via resolve) for: ${relativeFilePath}`);
                  } catch (conversionError: any) {
                      console.error(`!!! Error converting buffer to string for: ${relativeFilePath}`, conversionError);
                      console.log(`<<< Finished async check (with conversion error) for: ${relativeFilePath}`);
                      resolve(null); // Resolve null if conversion fails
                  }
              });
          } catch (error: any) {
              // Catch errors from readFile, stat, or potentially the Promise constructor/isText setup
              console.error(`Error processing file: ${relativeFilePath}`, error); // Added log
              return null; // Ensure the outer promise resolves even on error
          }
      });

      const fileReadResults = await Promise.all(fileReadPromises);
      readAndProcessedFiles = processFiles(fileReadResults, options); // processFiles filters nulls and applies comment/line removal
      console.log("--- Finished file processing loop ---"); // Added log
      console.log("=== Finished all text/binary checks ==="); // Added delineation log
  }

  // 3. Generate directory structure (based on *processed* files)
  const directoryStructure = (options.directoryStructure ?? true) && readAndProcessedFiles.length > 0
    ? generateDirectoryStructure(readAndProcessedFiles.map(f => f.path))
    : '';
  if (directoryStructure) {
  }


  // 4. Prepare context for formatters
  const outputContext: OutputContext = {
    directoryStructure,
    processedFiles: readAndProcessedFiles, // Use the correctly processed files
    options,
    defaultIgnorePatterns,
    inputIgnorePatterns,
    gitignorePatterns,
  };

  // 5. Generate final output string
  let outputContent: string;
  const format = options.outputFormat || 'xml';
  switch (format) {
    case 'md': outputContent = generateMarkdownOutput(outputContext); break;
    case 'txt': outputContent = generateTextOutput(outputContext); break;
    case 'xml': default:
      console.log("=== Starting XML element creation loop/block ==="); // Added delineation log
      outputContent = generateXmlOutput(outputContext); break;
  }

  // 6. Handle output target
  const outputTarget = options.outputTarget || 'stdout';

  switch (outputTarget) {
    case 'file':
      // Determine target directory: Use outputTargetDirectory if specified (for remote), otherwise use the original source directory
      const targetDir = options.outputTargetDirectory || '.'; // Default to current directory if undefined
      // Determine base name for the file
      const baseName = options.repoName || path.basename(options.sourceIdentifier || options.directory || 'output');
      // Construct filename dynamically using outputTargetDirectory and format
      const filename = `repopack.${options.outputFormat || 'xml'}`;
      const outputPath = path.resolve(targetDir, filename); // Use resolve, targetDir already uses outputTargetDirectory

      // --- Added Diagnostic Logging ---
      console.log(`[packInternal] Diagnostic: outputTargetDirectory = ${options.outputTargetDirectory}`);
      console.log(`[packInternal] Diagnostic: outputFormat = ${options.outputFormat || 'xml'}`);
      console.log(`[packInternal] Diagnostic: Resolved outputPath = ${outputPath}`);
      // --- End Diagnostic Logging ---

      try {
        await fsp.mkdir(path.dirname(outputPath), { recursive: true }); // Ensure directory exists

        // --- Added Try/Catch around writeFile ---
        try {
            console.log("[packInternal] Attempting to write file...");
            await fsp.writeFile(outputPath, outputContent, { encoding: 'utf-8' });
            console.log("[packInternal] File write successful.");
        } catch (error) {
            console.error("[packInternal] Error writing file:", error);
            // Re-throw the error to be caught by the outer catch block if needed,
            // or handle it specifically here if desired. For now, just log and re-throw.
            throw error;
        }
        // --- End Try/Catch around writeFile ---

        // Optionally log confirmation to stdout if needed, but primarily use stderr for logs
        console.log(`Repopack output written to ${outputPath}`);
      } catch (writeError: any) {
        // This will now catch errors from mkdir or re-thrown errors from writeFile
        console.error(`[packInternal] Error during file output process for ${outputPath}: ${writeError.message}`, writeError.stack);
        throw new Error(`Error during file output process for ${outputPath}: ${writeError.message}`); // Re-throw
      }
      break;

    case 'clipboard':
      try {
        await clipboard.write(outputContent);
        // Optionally log confirmation to stdout
        console.log(`Repopack content copied to clipboard.`);
      } catch (clipboardError: any) {
        console.error(`[packInternal] Error copying to clipboard: ${clipboardError.message}`, clipboardError.stack);
        // Check if clipboard is available, provide helpful error
        if (clipboardError.message.includes('read-only file system') || clipboardError.message.includes('EPERM')) {
             throw new Error(`Error copying output to clipboard: Clipboard access denied or unavailable in this environment. Try 'file' or 'stdout' target. Original error: ${clipboardError.message}`);
        } else {
            throw new Error(`Error copying output to clipboard: ${clipboardError.message}`);
        }
      }
      break;

    case 'stdout':
    default:
      // Use console.log instead of process.stdout.write for the final output
      console.log(outputContent); 
      
      // Ensure a newline if stdout might be piped or used in scripts
      // (console.log usually adds one, but check just in case)
      // if (typeof outputContent === 'string' && !outputContent.endsWith('\n')) {
      //     process.stdout.write('\n');
      // }
      break;
  }
} 