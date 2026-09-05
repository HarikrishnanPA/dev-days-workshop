const { spawnSync } = require('child_process');
const { join } = require('path');
const fs = require('fs');

function findBundledNode() {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return null;
  const copilotDir = join(home, '.copilot');
  if (!fs.existsSync(copilotDir)) return null;

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
      const candidate2 = join(sub, process.platform === 'win32' ? 'node.exe' : 'bin/node');
      if (fs.existsSync(candidate2)) return candidate2;
    }
  } catch (err) {
    return null;
  }
  return null;
}

function runExec(command, args) {
  const res = spawnSync(command, args || [], { stdio: 'inherit', shell: true });
  return res.status;
}

function runNodeScript(nodeExe, scriptPath, args) {
  const res = spawnSync(nodeExe, [scriptPath].concat(args || []), { stdio: 'inherit' });
  return res.status;
}

function findTsx(projectRoot) {
  const binWin = join(projectRoot, 'node_modules', '.bin', 'tsx.cmd');
  const binUnix = join(projectRoot, 'node_modules', '.bin', 'tsx');
  if (fs.existsSync(binWin)) return { type: 'bin', path: binWin };
  if (fs.existsSync(binUnix)) return { type: 'bin', path: binUnix };

  const cliCjs = join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.cjs');
  const cliMjs = join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (fs.existsSync(cliCjs)) return { type: 'node', path: cliCjs };
  if (fs.existsSync(cliMjs)) return { type: 'node', path: cliMjs };

  return null;
}

function run() {
  const projectRoot = process.cwd();
  const tsx = findTsx(projectRoot);
  if (!tsx) {
    console.error('tsx not found in node_modules. Please install dependencies first.');
    process.exit(1);
  }

  const nodeVersion = process.versions.node;
  const [major, minor] = nodeVersion.split('.').map((v) => parseInt(v, 10) || 0);

  let nodeToUse = process.execPath;
  if (major < 22 || (major === 22 && minor < 13)) {
    const bundled = findBundledNode();
    if (bundled) {
      nodeToUse = bundled;
      console.log('Using bundled Node:', nodeToUse);
      // Ensure child processes resolve `node` to the bundled executable by
      // prepending its directory to PATH for the duration of the script.
      try {
        const nodeDir = require('path').dirname(nodeToUse);
        process.env.PATH = nodeDir + (process.platform === 'win32' ? ';' : ':') + (process.env.PATH || '');
      } catch (e) {
        // ignore
      }
    } else {
      console.warn('Current Node is too old and no bundled Node found. Attempting to run with current Node.');
    }
  }

  const runTsx = (args) => {
    if (tsx.type === 'bin') {
      return runExec(tsx.path, args);
    }
    return runNodeScript(nodeToUse, tsx.path, args);
  };

  let code = runTsx(['db/migrate.ts']);
  if (code !== 0) process.exit(code);
  code = runTsx(['db/seed.ts']);
  process.exit(code);
}

run();
