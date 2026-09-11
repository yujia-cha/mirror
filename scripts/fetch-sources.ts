/**
 * Download the vendored game data listed in data/sources.lock.json into data/raw.
 *
 *   npm run data:fetch              restore exactly the pinned commits (reproducible)
 *   npm run data:fetch -- --update  move each source to the latest commit of its ref, then download
 *
 * Files that 404 are reported, not fatal: upstream renames files between seasons, and the
 * `update-game-data` skill explains how to fix the lock file when that happens.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { hasFlag, readJson, repoPath, writeJsonStable } from './lib/io.ts';

interface SourceEntry {
  repo: string;
  ref: string;
  sha: string;
  fetchedAt: string;
  note?: string;
  remotePrefix: string;
  localPrefix: string;
  languages?: string[];
  files: string[];
}

interface Lock {
  $comment?: string;
  sources: Record<string, SourceEntry>;
}

const RAW = 'https://raw.githubusercontent.com';
const lockPath = repoPath('data/sources.lock.json');

async function latestSha(repo: string, ref: string): Promise<string | null> {
  // The GitHub API is often blocked in sandboxes; the raw host is not. A ref-pinned raw URL
  // serves the tip of the branch, so we can detect movement by comparing file bytes instead.
  // When the API is reachable it gives us the exact sha, which is what we prefer to record.
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits/${ref}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mirror-dungeon-router' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { sha?: string };
    return body.sha ?? null;
  } catch {
    return null;
  }
}

async function download(url: string): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.text();
}

async function fetchSource(name: string, entry: SourceEntry, update: boolean): Promise<number> {
  let rev = entry.sha;
  if (update) {
    const sha = await latestSha(entry.repo, entry.ref);
    if (sha) {
      if (sha !== entry.sha) console.log(`  ${name}: ${entry.sha.slice(0, 8)} -> ${sha.slice(0, 8)}`);
      rev = sha;
      entry.sha = sha;
      entry.fetchedAt = new Date().toISOString().slice(0, 10);
    } else {
      rev = entry.ref;
      console.log(`  ${name}: GitHub API unreachable, downloading from ref "${entry.ref}" instead`);
    }
  }

  const targets = entry.languages
    ? entry.languages.flatMap((lang) => entry.files.map((file) => ({ lang, file })))
    : entry.files.map((file) => ({ lang: null as string | null, file }));

  let written = 0;
  const missing: string[] = [];

  for (const { lang, file } of targets) {
    const remote = [entry.remotePrefix, lang, file].filter(Boolean).join('/');
    const local = repoPath([entry.localPrefix, lang, file].filter(Boolean).join('/'));
    const text = await download(`${RAW}/${entry.repo}/${rev}/${remote}`);
    if (text === null) {
      missing.push(remote);
      continue;
    }
    mkdirSync(dirname(local), { recursive: true });
    // Normalize to a trailing newline so re-downloads do not churn the diff.
    writeFileSync(local, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
    written += 1;
  }

  console.log(`  ${name}: ${written} files written${missing.length ? `, ${missing.length} missing` : ''}`);
  for (const m of missing) console.log(`    missing: ${m}`);
  return missing.length;
}

async function main(): Promise<void> {
  const update = hasFlag('--update');
  const lock = readJson<Lock>(lockPath);

  console.log(update ? 'Updating sources to latest and downloading:' : 'Downloading pinned sources:');

  let missing = 0;
  for (const [name, entry] of Object.entries(lock.sources)) {
    missing += await fetchSource(name, entry, update);
  }

  if (update) {
    writeJsonStable(lockPath, lock);
    console.log('data/sources.lock.json updated');
  }

  if (missing > 0) {
    console.log(
      `\n${missing} file(s) could not be downloaded. If upstream renamed them (new season), ` +
        'update data/sources.lock.json — see the update-game-data skill.',
    );
    process.exitCode = 1;
  }
}

await main();
