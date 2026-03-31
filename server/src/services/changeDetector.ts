import * as fs from 'fs';
import * as path from 'path';

export interface ChangeDetectionResult {
  hasChanges: boolean;
  newFiles: string[];
  removedFiles: string[];
  totalNew: number;
  totalRemoved: number;
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
]);

const SKIP_EXTENSIONS = new Set([
  '.db',
  '.db-shm',
  '.db-wal',
]);

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.vue',
  '.svelte',
  '.html',
  '.css',
  '.scss',
]);

const SKIP_FILENAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
]);

/**
 * Recursively walk a directory and return relative file paths.
 * Skips: node_modules, .git, dist, build, .next, coverage, binary files, lock files.
 * Only includes source extensions: .ts, .tsx, .js, .jsx, .vue, .svelte, .html, .css, .scss
 */
export function snapshotFileTree(projectPath: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();

        // Skip db files and lock files
        if (SKIP_EXTENSIONS.has(ext)) continue;
        if (SKIP_FILENAMES.has(entry.name)) continue;

        // Only include known source extensions
        if (!SOURCE_EXTENSIONS.has(ext)) continue;

        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(projectPath, fullPath).replace(/\\/g, '/');
        results.push(relativePath);
      }
    }
  }

  walk(projectPath);
  return results.sort();
}

/**
 * Compare the current file tree against a stored snapshot.
 * Returns lists of new and removed files.
 */
export function detectChanges(projectPath: string, storedSnapshot: string[]): ChangeDetectionResult {
  const current = snapshotFileTree(projectPath);
  const currentSet = new Set(current);
  const storedSet = new Set(storedSnapshot);

  const newFiles: string[] = [];
  const removedFiles: string[] = [];

  for (const file of current) {
    if (!storedSet.has(file)) {
      newFiles.push(file);
    }
  }

  for (const file of storedSnapshot) {
    if (!currentSet.has(file)) {
      removedFiles.push(file);
    }
  }

  return {
    hasChanges: newFiles.length > 0 || removedFiles.length > 0,
    newFiles,
    removedFiles,
    totalNew: newFiles.length,
    totalRemoved: removedFiles.length,
  };
}
