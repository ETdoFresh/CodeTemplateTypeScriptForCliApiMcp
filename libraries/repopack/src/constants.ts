/**
 * Default patterns to ignore during file scanning.
 */
export const DEFAULT_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.svn/**',
  '**/.hg/**',
  '**/.DS_Store',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.vscode/**',
  '**/.idea/**',
  '**/*.log',
  '**/*.lock',
  '**/yarn-error.log',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/.env*', // Ignore .env files and variants
  '**/.DS_Store',
  // Add more common build/dependency/config directories/files
  '**/*.pyc',
  '**/__pycache__/**',
  '**/*.class',
  '**/*.o',
  '**/*.so',
  '**/*.dll',
  '**/*.exe',
  '**/*.obj',
  '**/*.bin',
  '**/*.out',
  '**/*.zip',
  '**/*.tar.gz',
  '**/*.rar',
  '**/*.7z',
];

/**
 * Default maximum file size in bytes (e.g., 1MB).
 * Prevents attempting to read extremely large files.
 */
export const DEFAULT_MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB 