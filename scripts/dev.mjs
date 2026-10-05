/**
 * 一条命令启动：npm start
 * 1. 按需安装 server / web 依赖
 * 2. prisma db push 建 SQLite 表 + 生成 client
 * 3. 幂等写入演示数据
 * 4. 同时启动后端 (3001) 与前端 (5173)，日志加前缀
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = resolve(root, 'server');
const webDir = resolve(root, 'web');

function run(cmd, args, cwd) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
  });
}

async function ensureDeps() {
  if (!existsSync(resolve(serverDir, 'node_modules'))) {
    console.log('▶ 安装后端依赖…');
    await run('npm', ['install'], serverDir);
  }
  if (!existsSync(resolve(webDir, 'node_modules'))) {
    console.log('▶ 安装前端依赖…');
    await run('npm', ['install'], webDir);
  }
}

function prefixPipe(stream, tag, color) {
  const rl = createInterface({ input: stream });
  rl.on('line', (line) => console.log(`${color}${tag}\x1b[0m ${line}`));
}

function startService(name, color, cwd) {
  const p = spawn('npm', ['run', 'dev'], { cwd, shell: process.platform === 'win32' });
  prefixPipe(p.stdout, name, color);
  prefixPipe(p.stderr, name, color);
  return p;
}

async function main() {
  await ensureDeps();
  console.log('▶ 初始化 SQLite 数据库（prisma db push）…');
  await run('npm', ['run', 'db:push'], serverDir);
  console.log('▶ 写入演示数据（如已存在则跳过）…');
  await run('npm', ['run', 'seed'], serverDir);

  console.log('\n========================================');
  console.log(' 后端 API: http://localhost:3001/api');
  console.log(' 前端页面: http://localhost:5173');
  console.log('========================================\n');

  const server = startService('[后端]', '\x1b[36m', serverDir);
  const web = startService('[前端]', '\x1b[35m', webDir);

  const shutdown = () => {
    server.kill();
    web.kill();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.on('exit', (code) => {
    console.error(`后端退出 (code ${code})，关闭前端…`);
    web.kill();
    process.exit(1);
  });
  web.on('exit', (code) => {
    console.error(`前端退出 (code ${code})，关闭后端…`);
    server.kill();
    process.exit(1);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
