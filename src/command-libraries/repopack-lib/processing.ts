import * as path from 'path';
import { FileData, PackCodebaseOptions } from './types.js';

/**
 * Removes comments from code content based on file extension.
 *
 * @param content The file content string.
 * @param filePath The relative path of the file.
 * @returns Content string with comments removed.
 */
export function removeFileComments(content: string, filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  let modifiedContent = content;

  switch (ext) {
    case '.js':
    case '.jsx':
    case '.ts':
    case '.tsx':
    case '.java':
    case '.c':
    case '.cpp':
    case '.h':
    case '.cs':
    case '.go':
    case '.swift':
    case '.kt':
    case '.rs':
    case '.php':
    case '.scala':
      // Remove single-line comments (// ...)
      modifiedContent = modifiedContent.replace(/\/\/.*$/gm, '');
      // Remove multi-line comments (/* ... */)
      modifiedContent = modifiedContent.replace(/\/\*[\s\S]*?\*\//gm, '');
      break;

    case '.py':
      // Remove single-line comments (# ...)
      modifiedContent = modifiedContent.replace(/#.*$/gm, '');
      // Remove multi-line comments (""" ... """ or ''' ... ''')
      // Note: This is a basic removal and might incorrectly remove docstrings
      // intended to be kept. A more robust solution would use AST parsing.
      modifiedContent = modifiedContent.replace(/"""[\s\S]*?"""/gm, '');
      modifiedContent = modifiedContent.replace(/'''[\s\S]*?'''/gm, '');
      break;

    case '.html':
    case '.xml':
    case '.vue': // Vue templates often use HTML comments
      // Remove HTML comments (<!-- ... -->)
      modifiedContent = modifiedContent.replace(/<!--[\s\S]*?-->/gm, '');
      break;

    case '.css':
    case '.scss':
    case '.less':
      // Remove CSS comments (/* ... */)
      modifiedContent = modifiedContent.replace(/\/\*[\s\S]*?\*\//gm, '');
      break;

    case '.rb':
      // Remove single-line comments (# ...)
      modifiedContent = modifiedContent.replace(/#.*$/gm, '');
      // Remove multi-line comments (=begin ... =end)
      modifiedContent = modifiedContent.replace(/^=begin[\s\S]*?^=end/gm, '');
      break;

    case '.sh':
    case '.bash':
    case '.zsh':
    case '.pl': // Perl also uses #
    case '.yaml':
    case '.yml':
      // Remove single-line comments (# ...)
      modifiedContent = modifiedContent.replace(/#.*$/gm, '');
      break;

    // Add more cases for other languages as needed
  }

  return modifiedContent;
}

/**
 * Removes empty lines (lines containing only whitespace) from a string.
 *
 * @param content The content string.
 * @returns Content string with empty lines removed.
 */
export function removeFileEmptyLines(content: string): string {
  return content.replace(/^\s*$\n/gm, '');
}

/**
 * Processes the content of multiple files based on the provided options.
 *
 * @param fileReadResults Array of FileData objects from readFileContent.
 * @param options Packing options controlling comment/empty line removal.
 * @returns An array of processed FileData objects.
 */
export function processFiles(fileReadResults: (FileData | null)[], options: PackCodebaseOptions): FileData[] {
  const processedFiles: FileData[] = [];
  for (const fileData of fileReadResults) {
    if (fileData) {
      let content = fileData.content;
      if (options.removeComments) {
        content = removeFileComments(content, fileData.path);
      }
      if (options.removeEmptyLines) {
        content = removeFileEmptyLines(content);
      }
      // Only include files that still have content after processing
      if (content.trim().length > 0) {
           processedFiles.push({ ...fileData, content });
      }
    }
  }
  return processedFiles;
} 