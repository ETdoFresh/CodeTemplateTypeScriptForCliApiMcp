import * as path from 'path';
import xmlbuilder from 'xmlbuilder';
import { OutputContext, PackCodebaseOptions, TreeNode, FileSummaryContent, FileData } from './types.js';

// --- Directory Structure Generation ---\n

const createTreeNode = (name: string, isDirectory: boolean): TreeNode => ({ name, children: [], isDirectory });

function addPathToTree(root: TreeNode, filePath: string): void {
    const parts = filePath.split('/').filter(p => p);
    let currentNode = root;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLastPart = i === parts.length - 1;
        let childNode = currentNode.children.find(child => child.name === part);

        if (!childNode) {
            childNode = createTreeNode(part, !isLastPart); // It's a directory if not the last part
            currentNode.children.push(childNode);
            // Sort children: directories first, then alphabetically
            currentNode.children.sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) {
                    return a.isDirectory ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });
        }
        currentNode = childNode;
    }
}

function treeToString(node: TreeNode, prefix = ''): string {
    let result = prefix + '|-- ' + node.name + (node.isDirectory ? '/' : '') + '\n';
    const childPrefix = prefix + '|   ';
    const lastChildPrefix = prefix + '    '; // No vertical line for the last child's descendants

    for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const isLastChild = i === node.children.length - 1;
        result += treeToString(child, isLastChild ? lastChildPrefix : childPrefix);
    }
    return result;
}

export function generateDirectoryStructure(filePaths: string[]): string {
  const root: TreeNode = createTreeNode('.', true);
  filePaths.forEach(filePath => addPathToTree(root, filePath));
  // Correctly escape backslash for newline
  const fullTree = treeToString(root).split('\n').slice(1).join('\n');
  return fullTree;
}

// --- File Summary Generation ---\n

function generateSummaryNotes(options: PackCodebaseOptions): string[] {
  const notes = [];
  if (options.removeComments) notes.push("- Comments have been removed.");
  if (options.removeEmptyLines) notes.push("- Empty lines have been removed.");
  if (!options.noGitignore && options.github_repo) notes.push("- .gitignore rules were applied during cloning/packing.");
  else if (!options.noGitignore) notes.push("- .gitignore rules were applied during packing.");
  if (!options.noDefaultPatterns) notes.push("- Default ignore patterns were applied.");
  if (options.includePatterns) notes.push(`- Included files matching: ${options.includePatterns}`);
  if (options.ignorePatterns) notes.push(`- Explicitly ignored files matching: ${options.ignorePatterns}`);
  return notes;
}

function generateFileSummaryObject(options: PackCodebaseOptions): FileSummaryContent {
  const source = options.sourceIdentifier || options.directory;
  return {
    intro: `This document contains a packaged representation of the codebase from ${source}.`,
    purpose: `It is intended for analysis by AI language models. The goal is to provide a comprehensive yet concise view of the project's structure and content.`,
    file_format: `The content below uses ${options.outputFormat?.toUpperCase()} format. Key elements include a summary, directory structure, and individual file contents.`,
    usage_guidelines: `Review the summary and directory structure for an overview. File contents are provided under their respective paths. Consider the processing notes when interpreting the code.`,
    // Correctly escape backslash for newline
    notes: generateSummaryNotes(options).join('\n'),
    additional_info: `Generated on: ${new Date().toISOString()}`
  };
}

// --- Output Formatters ---\n

export function generateXmlOutput(context: OutputContext): string {
  const { directoryStructure, processedFiles, options, defaultIgnorePatterns, inputIgnorePatterns, gitignorePatterns } = context;
  const summary = generateFileSummaryObject(options);

  // Use single quotes for attribute text to avoid issues if text contains quotes
  const createPatternNodes = (patterns: string[]) => patterns.map(p => ({ '#text': p }));

  const root = xmlbuilder.create('codebase', { version: '1.0', encoding: 'UTF-8' })
    .att('source', options.sourceIdentifier || options.directory);

  const summaryNode = root.ele('summary');
  summaryNode.ele('introduction', summary.intro);
  summaryNode.ele('purpose', summary.purpose);
  summaryNode.ele('file_format', summary.file_format);
  summaryNode.ele('usage_guidelines', summary.usage_guidelines);
  const notesNode = summaryNode.ele('processing_notes');
  generateSummaryNotes(options).forEach(note => notesNode.ele('note', note));
  summaryNode.ele('additional_info', summary.additional_info);

  if (options.directoryStructure) {
    root.ele('directory_structure').dat(directoryStructure);
  }

  const ignorePatternsNode = root.ele('ignore_patterns');
  if (!options.noDefaultPatterns) ignorePatternsNode.ele('default_patterns').ele('patterns', { count: defaultIgnorePatterns.length }, createPatternNodes(defaultIgnorePatterns));
  if (inputIgnorePatterns.length > 0) ignorePatternsNode.ele('input_patterns').ele('patterns', { count: inputIgnorePatterns.length }, createPatternNodes(inputIgnorePatterns));
  if (!options.noGitignore && gitignorePatterns.length > 0) ignorePatternsNode.ele('gitignore_patterns').ele('patterns', { count: gitignorePatterns.length }, createPatternNodes(gitignorePatterns));

  const filesNode = root.ele('files');
  processedFiles.forEach(file => {
    filesNode.ele('file', { path: file.path }).dat(file.content);
  });

  return root.end({ pretty: true });
}

export function generateMarkdownOutput(context: OutputContext): string {
  const { directoryStructure, processedFiles, options, defaultIgnorePatterns, inputIgnorePatterns, gitignorePatterns } = context;
  const summary = generateFileSummaryObject(options);
  let output = '# Codebase Package\n\n';

  const generateIgnoreSection = (title: string, intro: string, patterns: string[]) => {
      if (!patterns || patterns.length === 0) return '';
      let section = '**' + title + '**\n\n' + intro + '\n\n```\n';
      section += patterns.join('\n');
      section += '\n```\n\n';
      return section;
  };

  // Summary Section
  output += '## Summary\n\n';
  output += '**Introduction:** ' + summary.intro + '\n\n';
  output += '**Purpose:** ' + summary.purpose + '\n\n';
  output += '**File Format:** ' + summary.file_format + '\n\n';
  output += '**Usage Guidelines:** ' + summary.usage_guidelines + '\n\n';
  output += '**Processing Notes:**\n' + (summary.notes || '(None)') + '\n\n';
  output += '**Additional Info:** ' + summary.additional_info + '\n\n';

  // Ignore Patterns Section
  output += '## Ignore Patterns Used\n\n';
  if (!options.noDefaultPatterns) {
      output += generateIgnoreSection('Default Ignore Patterns', 'The following default patterns were used to exclude common files and directories:', defaultIgnorePatterns);
  }
  if (inputIgnorePatterns.length > 0) {
      output += generateIgnoreSection('Input Ignore Patterns', 'The following patterns were provided via the ignorePatterns option:', inputIgnorePatterns);
  }
  if (!options.noGitignore && gitignorePatterns.length > 0) {
      output += generateIgnoreSection('.gitignore Patterns', 'The following patterns were loaded from .gitignore files found in the repository:', gitignorePatterns);
  }
  if (options.noDefaultPatterns && inputIgnorePatterns.length === 0 && (options.noGitignore || gitignorePatterns.length === 0)) {
      output += '(No ignore patterns were applied).\n\n';
  }

  // Directory Structure Section
  if (options.directoryStructure) {
    output += '## Directory Structure\n\n```\n';
    output += directoryStructure;
    output += '\n```\n\n';
  }

  // Files Section
  output += '## File Contents\n\n';
  processedFiles.forEach(file => {
    const ext = path.extname(file.path).substring(1);
    output += '### `' + file.path + '`\n\n';
    output += '```' + (ext || 'text') + '\n';
    output += file.content;
    output += '\n```\n\n';
  });

  return output;
}

export function generateTextOutput(context: OutputContext): string {
  const { directoryStructure, processedFiles, options, defaultIgnorePatterns, inputIgnorePatterns, gitignorePatterns } = context;
  const summary = generateFileSummaryObject(options);
  let output = 'CODEBASE PACKAGE\n\n';

  const generateIgnoreSection = (title: string, intro: string, patterns: string[]) => {
      if (!patterns || patterns.length === 0) return '';
      let section = '--- ' + title + ' ---\n' + intro + '\n';
      section += patterns.join('\n');
      section += '\n\n';
      return section;
  };

  // Summary Section
  output += '--- Summary ---\n';
  output += 'Introduction: ' + summary.intro + '\n';
  output += 'Purpose: ' + summary.purpose + '\n';
  output += 'File Format: ' + summary.file_format + '\n';
  output += 'Usage Guidelines: ' + summary.usage_guidelines + '\n';
  output += 'Processing Notes:\n' + (summary.notes || '(None)') + '\n';
  output += 'Additional Info: ' + summary.additional_info + '\n\n';

  // Ignore Patterns Section
  output += '--- Ignore Patterns Used ---\n';
  if (!options.noDefaultPatterns) {
      output += generateIgnoreSection('Default Ignore Patterns', 'Default patterns used:', defaultIgnorePatterns);
  }
  if (inputIgnorePatterns.length > 0) {
      output += generateIgnoreSection('Input Ignore Patterns', 'Patterns from ignorePatterns option:', inputIgnorePatterns);
  }
  if (!options.noGitignore && gitignorePatterns.length > 0) {
      output += generateIgnoreSection('.gitignore Patterns', 'Patterns from .gitignore files:', gitignorePatterns);
  }
   if (options.noDefaultPatterns && inputIgnorePatterns.length === 0 && (options.noGitignore || gitignorePatterns.length === 0)) {
      output += '(No ignore patterns were applied).\n\n';
  }

  // Directory Structure Section
  if (options.directoryStructure) {
    output += '--- Directory Structure ---\n';
    output += directoryStructure;
    output += '\n\n';
  }

  // Files Section
  output += '--- File Contents ---\n';
  processedFiles.forEach(file => {
    output += '\n<<< FILE: ' + file.path + ' >>>\n';
    output += file.content;
    output += '\n<<< END OF FILE: ' + file.path + ' >>>\n';
  });

  return output;
} 