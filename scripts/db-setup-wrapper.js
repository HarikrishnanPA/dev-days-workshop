const { spawnSync } = require('child_process');
const { join } = require('path');
const fs = require('fs');

function findBundledNode() {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return null;
  const copilotDir = join(home, '.copilot');
  if (!fs.existsSync(copilotDir)) return null;

  // Search two levels deep for node.exe/node
  try {
    const entries = fs.readdirSync(copilotDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const sub = join(copilotDir, e.name);
      const subEntries = fs.readdirSync(sub, { withFileTypes: true });
      for (const s of subEntries) {
        if (!s.isDirectory()) continue;
        const candidate = join(sub, s.name, process.platform === 'win32' ? 'node.exe' : 'bin/node');
        if (fs.existsSync(candidate)) return candidate;
      }
      // also check e.name/node.exe
      const candidate2 = join(sub, process.platform === 'win32' ? 'node.exe' : 'bin/node');
      if (fs.existsSync(candidate2)) return candidate2;
    }
  } catch (err) {
    return null;
  }
  return null;
}

function runWithNode(nodeExe, scriptPath, args) {
  const cmdArgs = [scriptPath].concat(args || []);
  const res = spawnSync(nodeExe, cmdArgs, { stdio: 'inherit' });
  return res.status;
}

function run() {
  const projectRoot = process.cwd();
  const tsxPath = join(projectRoot, 'node_modules', 'tsx', 'dist', 'bin.js');
  if (!fs.existsSync(tsxPath)) {
    console.error('tsx not found in node_modules. Please install dependencies first.');
    process.exit(1);
  }

  const nodeVersion = process.versions.node; // e.g. '20.12.1'
  const [major, minor] = nodeVersion.split('.').map((v) => parseInt(v, 10) || 0);

  // If current node is >=22.13, use it. Otherwise try bundled node under .copilot
  let nodeToUse = process.execPath;
  if (major < 22 || (major === 22 && minor < 13)) {
    const bundled = findBundledNode();
    if (bundled) {
      nodeToUse = bundled;
      console.log('Using bundled Node:', nodeToUse);
    } else {
      console.warn('Current Node is too old and no bundled Node found. Attempting to run with current Node.');
    }
  }

  // Run migrate then seed
  let code = runWithNode(nodeToUse, tsxPath, ['db/migrate.ts']);
  if (code !== 0) process.exit(code);
  code = runWithNode(nodeToUse, tsxPath, ['db/seed.ts']);
  process.exit(code);
}

run();
