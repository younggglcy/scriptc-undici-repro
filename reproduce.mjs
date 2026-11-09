import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2];
assert(['npm', 'flat', 'node'].includes(mode), 'Use npm, flat, or node');
const artifacts = join(root, '.artifacts');
await mkdir(artifacts, { recursive: true });

function run(command, args, logName) {
  console.log(JSON.stringify([command, ...args]));
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, SCRIPTC_NO_CACHE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data;
      process.stdout.write(data);
    });
    child.stderr.on('data', (data) => {
      stderr += data;
      process.stderr.write(data);
    });
    child.once('error', reject);
    child.once('close', async (code, signal) => {
      try {
        await writeFile(join(artifacts, logName), [
          `command: ${JSON.stringify([command, ...args])}`,
          `platform: ${process.platform}/${process.arch}; node: ${process.version}`,
          `SCRIPTC_NO_CACHE=1; exit: ${code}; signal: ${signal}`,
          '\nstdout:', stdout, '\nstderr:', stderr,
        ].join('\n'));
        resolve({ code: code ?? 1, stdout, stderr, signal });
      } catch (error) {
        reject(error);
      }
    });
  });
}

let executable = process.execPath;
let args = [join(root, 'main.mts')];
if (mode !== 'node') {
  let compiler = join(root, 'node_modules/scriptc/bin/scriptc.exe');
  if (mode === 'flat') {
    // Copy the same toolchain packages to a directory with no node_modules
    // segment and point a copy of the same compiler binary at them.
    const flatRoot = join(artifacts, 'toolchain');
    await mkdir(join(flatRoot, 'bin'), { recursive: true });
    const manifest = await readFile(`${compiler}.json`, 'utf8');
    const names = new Set([...manifest.matchAll(/\.\.\/\.\.\/@scriptc\/([^/"]+)/g)].map((match) => match[1]));
    assert(names.size > 0, 'No @scriptc toolchain packages found in the compiler manifest');
    for (const name of names) {
      await cp(join(root, 'node_modules/@scriptc', name), join(flatRoot, 'tc', name), { recursive: true });
    }
    const flatCompiler = join(flatRoot, 'bin/scriptc.exe');
    await cp(compiler, flatCompiler);
    await writeFile(`${flatCompiler}.json`, manifest.replaceAll('../../@scriptc/', '../tc/'));
    compiler = flatCompiler;
  }
  const sha256 = createHash('sha256').update(await readFile(compiler)).digest('hex');
  console.log(`scriptc binary SHA-256: ${sha256}`);
  executable = join(artifacts, `main-${mode}`);
  args = [];
  const build = await run(compiler, ['build', join(root, 'main.mts'), '-o', executable], `${mode}-build.log`);
  if (build.code !== 0) {
    process.exitCode = build.code;
  }
}

if (!process.exitCode) {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain', connection: 'close' });
    response.end('ok');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    const result = await run(executable, [...args, url], `${mode}-run.log`);
    assert.equal(result.code, 0, `Program failed (signal: ${result.signal})`);
    assert.equal(result.stdout.trim(), '200');
    console.log(`${mode}: local HTTP request passed`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
