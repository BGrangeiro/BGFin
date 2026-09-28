import { DatabaseSync, backup } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, rmSync, lstatSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { databaseFiles } from './data-paths.js';
import { openDatabase } from './database.js';

export const snapshotFiles = { bruno: 'bruno.sqlite', ana: 'ana.sqlite' };
const snapshotName = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9-]{36}$/;
export const checksum = file => createHash('sha256').update(readFileSync(file)).digest('hex');
export function removeChild(parent, child) {
  const path = resolve(parent, child), inside = relative(resolve(parent), path);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('Caminho de limpeza inválido.');
  rmSync(path, { recursive: true, force: true });
}
export function verifyDatabase(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (db.prepare('PRAGMA integrity_check').all().some(row => Object.values(row)[0] !== 'ok')) throw new Error('Falha na integridade do banco.');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Relações inválidas no banco.');
    for (const table of ['transactions', 'debts', 'bills', 'notes', 'personal_items']) db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get();
  } finally { db.close(); }
}
export function verifySnapshot(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !Number.isFinite(Date.parse(manifest.created_at))) throw new Error('Manifesto de backup inválido.');
  for (const [user, name] of Object.entries(snapshotFiles)) {
    const file = join(directory, name);
    if (!lstatSync(file).isFile() || manifest.files?.[user]?.name !== name || manifest.files[user].sha256 !== checksum(file)) throw new Error(`Backup de ${user} incompleto ou alterado.`);
    verifyDatabase(file);
  }
  return manifest;
}
export async function createSnapshot({ databasePath, outputDir, now = new Date() }) {
  const sources = databaseFiles(databasePath);
  if (sources.bruno === ':memory:' || !existsSync(sources.bruno)) throw new Error('O banco principal ainda não existe. Inicie o Persona antes de criar o backup.');
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const name = `${now.toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const pending = join(outputDir, `.partial-${name}`), destination = join(outputDir, name);
  mkdirSync(pending, { mode: 0o700 });
  const manifest = { version: 1, created_at: now.toISOString(), files: {} };
  try {
    for (const [user, source] of Object.entries(sources)) {
      const empty = !existsSync(source) ? openDatabase(':memory:') : null;
      const db = empty?.db || new DatabaseSync(source, { readOnly: true });
      const file = join(pending, snapshotFiles[user]);
      try { await backup(db, file); } finally { empty ? empty.close() : db.close(); }
      // Produce a standalone file: no dependency on a live WAL or SHM file.
      const copy = new DatabaseSync(file);
      try { copy.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;'); } finally { copy.close(); }
      verifyDatabase(file);
      const descriptor = openSync(file, 'r+'); try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
      manifest.files[user] = { name: snapshotFiles[user], sha256: checksum(file) };
    }
    writeFileSync(join(pending, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600, flush: true });
    renameSync(pending, destination);
    const latestTemporary = join(outputDir, `.latest-${randomUUID()}.tmp`);
    writeFileSync(latestTemporary, JSON.stringify({ name, created_at: manifest.created_at }), { mode: 0o600, flush: true });
    renameSync(latestTemporary, join(outputDir, 'latest.json'));
    return destination;
  } catch (error) { removeChild(outputDir, pending); throw error; }
}
export function pruneSnapshots(directory, keep = 120) {
  if (!Number.isInteger(keep) || keep < 2) throw new Error('Mantenha pelo menos duas cópias de backup.');
  const snapshots = readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory() && snapshotName.test(entry.name)).map(entry => entry.name).sort().reverse();
  for (const name of snapshots.slice(keep)) {
    // Only remove complete snapshots created by Persona, never arbitrary folders.
    const manifest = JSON.parse(readFileSync(join(directory, name, 'manifest.json'), 'utf8'));
    if (manifest.version === 1 && manifest.files?.bruno && manifest.files?.ana) removeChild(directory, name);
  }
}
