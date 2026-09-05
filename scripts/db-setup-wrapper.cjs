async function run() {
  const [{ spawnSync }, { dirname, join }, fs] = await Promise.all([
    import('node:child_process'),
    import('node:path'),
    import('node:fs'),
  ]);

  function findBundledNode() {
    const home = process.env.USERPROFILE || process.env.HOME;
    if (!home) return null;
    const copilotDir = join(home, '.copilot');
    if (!fs.existsSync(copilotDir)) return null;

    try {
      const entries = fs.readdirSync(copilotDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sub = join(copilotDir, entry.name);
        const subEntries = fs.readdirSync(sub, { withFileTypes: true });
        for (const subEntry of subEntries) {
          if (!subEntry.isDirectory()) continue;
          const candidate = join(
            sub,
            subEntry.name,
            process.platform === 'win32' ? 'node.exe' : 'bin/node',
          );
          if (fs.existsSync(candidate)) return candidate;
        }
        const candidate = join(
          sub,
          process.platform === 'win32' ? 'node.exe' : 'bin/node',
        );
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch {
      return null;
    }
    return null;
  }

  function runExec(command, args) {
    const result = spawnSync(command, args || [], { stdio: 'inherit', shell: true });
    return result.status;
  }

  function runNodeScript(nodeExe, scriptPath, args) {
    const result = spawnSync(nodeExe, [scriptPath].concat(args || []), { stdio: 'inherit' });
    return result.status;
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

  const projectRoot = process.cwd();
  const tsx = findTsx(projectRoot);
  if (!tsx) {
    console.error('tsx not found in node_modules. Please install dependencies first.');
    process.exit(1);
  }

  const nodeVersion = process.versions.node;
  const [major, minor] = nodeVersion.split('.').map((version) => parseInt(version, 10) || 0);

  let nodeToUse = process.execPath;
  if (major < 22 || (major === 22 && minor < 13)) {
    const bundled = findBundledNode();
    if (bundled) {
      nodeToUse = bundled;
      console.log('Using bundled Node:', nodeToUse);
      const nodeDir = dirname(nodeToUse);
      process.env.PATH = nodeDir + (process.platform === 'win32' ? ';' : ':') + (process.env.PATH || '');
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

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
