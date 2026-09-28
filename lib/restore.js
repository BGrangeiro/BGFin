import { existsSync, mkdirSync, copyFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { databaseFiles } from './data-paths.js';
import { createSnapshot, verifySnapshot, snapshotFiles, removeChild } from './backups.js';

export async function restoreSnapshot({ snapshotDir, databasePath, backupDir }) {
  verifySnapshot(snapshotDir);
  const targets = databaseFiles(databasePath);
  if (targets.bruno === ':memory:') throw new Error('Restauração exige um banco em disco.');
  for (const file of Object.values(targets)) {
    if (existsSync(`${file}-wal`) || existsSync(`${file}-shm`)) throw new Error('Encerre o aplicativo e o serviço de backups antes de restaurar.');
    if (resolve(snapshotDir) === dirname(file)) throw new Error('Use uma pasta de backup separada do banco ativo.');
  }
  const previous = existsSync(targets.bruno) ? await createSnapshot({ databasePath, outputDir: backupDir }) : null;
  const parent = dirname(targets.bruno), stage = join(parent, `.restore-${randomUUID()}`);
  mkdirSync(stage, { recursive: true, mode: 0o700 });
  const moved = [], installed = [];
  let cleanup = true;
  try {
    for (const [user, name] of Object.entries(snapshotFiles)) copyFileSync(join(snapshotDir, name), join(stage, name));
    for (const [user, target] of Object.entries(targets)) {
      if (existsSync(target)) { cleanup = false; renameSync(target, join(stage, `${user}.previous`)); moved.push(user); }
      renameSync(join(stage, snapshotFiles[user]), target); installed.push(user);
    }
    cleanup = true;
  } catch (error) {
    for (const user of installed) removeChild(parent, targets[user]);
    for (const user of moved) renameSync(join(stage, `${user}.previous`), targets[user]);
    cleanup = true;
    throw error;
  } finally { if (cleanup) removeChild(parent, stage); }
  return { previous };
}
