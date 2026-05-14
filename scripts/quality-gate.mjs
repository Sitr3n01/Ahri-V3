import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const quick = args.has('--quick');
const strictSize = args.has('--strict-size');

const root = process.cwd();
const runtimeTrackedPaths = [
  'packages/backend/data',
  'packages/backend/ahri.db',
  'packages/backend/=1.0.0',
];

const sourceRoots = [
  'packages/backend/src',
  'packages/desktop/src',
  'packages/shared/src',
  'packages/web/src',
];

const extensions = new Set(['.py', '.ts', '.tsx', '.js', '.jsx', '.css']);
const ignoredSegments = new Set(['node_modules', 'dist', 'dist-electron', 'build', '__pycache__', '.venv']);
const warnLineBudget = 500;
const hardLineBudget = strictSize ? 700 : 1800;

function run(name, command, options = {}) {
  console.log(`\n==> ${name}`);
  const result = spawnSync(command, {
    cwd: root,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, ...options.env },
  });

  if (result.status !== 0) {
    throw new Error(`${name} failed with exit code ${result.status}`);
  }
}

function capture(command) {
  const result = spawnSync(command, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command}`);
  }
  return result.stdout.trim();
}

function assertNoTrackedRuntimeData() {
  console.log('\n==> Runtime data hygiene');
  const tracked = capture(`git ls-files ${runtimeTrackedPaths.join(' ')}`);
  if (tracked) {
    console.error('Runtime/private data is tracked and must be removed from Git:');
    console.error(tracked);
    process.exit(1);
  }
  console.log('No tracked runtime DB/vector/log data found.');
}

function shouldSkip(filePath) {
  return filePath.split(path.sep).some((segment) => ignoredSegments.has(segment));
}

function collectSourceFiles(dir) {
  const absolute = path.join(root, dir);
  if (!existsSync(absolute)) return [];

  const files = [];
  for (const entry of readdirSync(absolute)) {
    const full = path.join(absolute, entry);
    if (shouldSkip(full)) continue;

    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(path.relative(root, full)));
      continue;
    }

    if (extensions.has(path.extname(full))) {
      files.push(full);
    }
  }
  return files;
}

function reportHotspots() {
  console.log('\n==> Maintainability hotspots');
  const files = sourceRoots.flatMap(collectSourceFiles);
  const metrics = files
    .map((file) => {
      const content = readFileSync(file, 'utf8');
      return {
        file: path.relative(root, file).replaceAll(path.sep, '/'),
        lines: content.split(/\r?\n/).length,
        bytes: Buffer.byteLength(content),
      };
    })
    .sort((a, b) => b.lines - a.lines);

  const top = metrics.slice(0, 15);
  for (const item of top) {
    const marker = item.lines > warnLineBudget ? 'WARN' : 'OK';
    console.log(`${marker.padEnd(4)} ${String(item.lines).padStart(5)} lines  ${item.file}`);
  }

  const violations = metrics.filter((item) => item.lines > hardLineBudget);
  if (violations.length > 0) {
    console.error(`\nFiles above hard budget (${hardLineBudget} lines):`);
    for (const item of violations) {
      console.error(`- ${item.file}: ${item.lines} lines`);
    }
    process.exit(1);
  }
}

function main() {
  assertNoTrackedRuntimeData();
  reportHotspots();

  run('Type check', 'npm run type-check');
  run('Lint', 'npm run lint');
  run('Frontend tests', 'npm run test');
  run('Backend tests', 'python -m pytest packages/backend/tests -q');

  if (!quick) {
    run('Dependency audit', 'npm audit --audit-level=moderate');
    run('Production build', 'npm run build');
  }

  console.log('\nQuality gate passed.');
}

try {
  main();
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}
