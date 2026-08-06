import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function collectFiles(root, relativePaths) {
  const files = [];
  const visit = current => {
    const currentStats = fs.statSync(current);
    if (currentStats.isFile()) {
      files.push(current);
      return;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  };
  for (const relativePath of relativePaths) visit(path.join(root, relativePath));
  return files;
}

export function foundryIqFingerprint(root, relativePaths, target = {}) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(Object.fromEntries(Object.entries(target).sort(([left], [right]) => left.localeCompare(right)))));
  hash.update('\0');
  for (const filePath of collectFiles(root, relativePaths)) {
    hash.update(path.relative(root, filePath).split(path.sep).join('/'));
    hash.update('\0');
    hash.update(fs.readFileSync(filePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}
