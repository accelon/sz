#!/usr/bin/env bun
/**
 * 把 `deva master` 的改動包成 PR，送到上游（VipassanaTech/tipitaka-xml）。
 *
 *   bun run src/pr-deva.ts                        # 用 out/pr-cst-deva.patch + out/PR-cst-deva-errata.md
 *   bun run src/pr-deva.ts --dry-run              # 只在本機建 branch／commit，不推、不開 PR
 *   bun run src/pr-deva.ts --patch X.patch --title "..." --body X.md --branch fix/xxx
 *
 * 流程：fetch origin（accelon fork）→ 從 origin/main 開 branch → 套 patch → commit →
 *       push 到 fork → 用 Windows 認證管理員裡的 GitHub 憑證開 PR（原本的 commit 訊息不變）。
 * 開完 PR 會把 `raw/cst-deva` 切回 main，建置用的工作區保持乾淨。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const REPO = join(ROOT, 'raw', 'cst-deva');
const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
};
const PATCH = join(ROOT, arg('patch', 'out/pr-cst-deva.patch'));
const BODY_FILE = join(ROOT, arg('body', 'out/PR-cst-deva-errata.md'));
const BRANCH = arg('branch', 'fix/deva-errata-2026-11');
const TITLE = arg('title', 'Fix input errors in deva master');
const dry = argv.includes('--dry-run');

const git = (args: string[], input?: string): string =>
  execFileSync('git', ['-C', REPO, ...args], {
    encoding: 'utf8',
    input,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
  });

for (const f of [PATCH, BODY_FILE]) {
  if (!existsSync(f)) {
    console.error(`缺少 ${f}`);
    process.exit(2);
  }
}

// 1) 跟緊 fork 與上游
git(['fetch', '--depth=1', 'origin', 'main']);
git(['fetch', '--depth=1', 'upstream', 'main']);
const upstreamSha = git(['rev-parse', 'upstream/main']).trim();
const originSha = git(['rev-parse', 'origin/main']).trim();
if (upstreamSha !== originSha) {
  console.error(`fork 的 main（${originSha.slice(0, 7)}）和上游（${upstreamSha.slice(0, 7)}）不同步，先更新 fork 再送 PR`);
  process.exit(2);
}

// 2) 從 origin/main 開 branch、套 patch、commit
git(['checkout', '-B', BRANCH, 'origin/main']);
const applied = (() => {
  try {
    git(['apply', '--binary', PATCH]);
    return true;
  } catch (e) {
    const msg = String((e as { stderr?: string }).stderr ?? e);
    console.log(`patch 套不上（可能已經在上游）：${msg.split('\n')[0]}`);
    return false;
  }
})();
if (!applied) {
  git(['checkout', 'main']);
  process.exit(0);
}
git(['add', '--', 'deva master']);
git(['commit', '-m', TITLE]);
const sha = git(['rev-parse', 'HEAD']).trim();
console.log(`commit ${sha.slice(0, 7)}（${PATCH}）`);

if (dry) {
  console.log('--dry-run：不推、不開 PR');
  git(['checkout', 'main']);
  process.exit(0);
}

// 3) 推到 fork（先抓一次遠端 branch，--force-with-lease 才不會因為沒有追蹤而失敗）
try { git(['fetch', '--depth=1', 'origin', BRANCH]); } catch { /* 遠端還沒有這個 branch */ }
git(['push', '--force-with-lease', 'origin', `${BRANCH}:refs/heads/${BRANCH}`]);
console.log(`已推到 origin:${BRANCH}`);

// 4) 用本機憑證開 PR
const cred = git(['credential', 'fill'], 'protocol=https\nhost=github.com\n\n');
const token = cred.split('\n').find((l) => l.startsWith('password='))?.slice('password='.length) ?? '';
if (!token) {
  console.error(`沒有 GitHub 憑證（git credential fill）——branch 已推上去，PR 請手動開：`)
  console.error(`  ${git(['remote', 'get-url', 'origin']).trim().replace(/\.git$/, '')}/pull/new/${BRANCH}`);
  process.exit(1);
}
const remotePath = (url: string): { owner: string; repo: string } => {
  const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(url);
  return { owner: m?.[1] ?? '', repo: m?.[2] ?? '' };
};
const fork = remotePath(git(['remote', 'get-url', 'origin']));
const up = remotePath(git(['remote', 'get-url', 'upstream']));
const api = (path: string): string => `https://api.github.com/repos/${up.owner}/${up.repo}${path}`;
const headers = { Authorization: `token ${token}`, 'User-Agent': 'dsh', Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };

const body = readFileSync(BODY_FILE, 'utf8');
const res = await fetch(api('/pulls'), {
  method: 'POST',
  headers,
  body: JSON.stringify({ title: TITLE, head: `${fork.owner}:${BRANCH}`, base: 'main', body, maintainer_can_modify: true }),
});
const json = (await res.json()) as { number?: number; html_url?: string; message?: string; errors?: unknown };
if (res.ok && json.html_url) {
  console.log(`PR #${json.number}: ${json.html_url}`);
} else if (String(json.message ?? '').includes('already exists')) {
  const list = (await (await fetch(api(`/pulls?head=${fork.owner}:${BRANCH}&state=open`), { headers })).json()) as { number: number; html_url: string }[];
  console.log(list.length ? `已有 PR #${list[0]!.number}: ${list[0]!.html_url}（這次推的 commit 會自動出現在上面）` : 'PR 已存在但查不到');
} else {
  console.error(`開 PR 失敗（${res.status}）：${json.message ?? ''}`);
  process.exit(1);
}

git(['checkout', 'main']);
console.log('raw/cst-deva 已切回 main');
