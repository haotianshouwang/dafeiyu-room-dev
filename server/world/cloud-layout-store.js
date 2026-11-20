import { createHash } from 'node:crypto';
import {defaultManifest} from '../../shared/world/default-manifest.js';
import {
  applyCloudLayout,
  decodeCloudLayout,
  encodeCloudLayout
} from '../../shared/world/cloud-layout.js';

const WORLD_ID = /^[\w.-]{1,128}$/;

export function exportCloudLayout(snapshot, { worldName } = {}) {
  const { bytes, layout } = encodeCloudLayout(snapshot, { worldName });
  return {
    bytes,
    layout,
    digest:createHash('sha256').update(bytes).digest('hex')
  };
}

export function importCloudLayout({ db, baseSnapshot, layout: input, targetWorldId, freshPlayer = false }) {
  if (!db?.prepare) throw new Error('DATABASE_REQUIRED');
  if (typeof targetWorldId !== 'string' || !WORLD_ID.test(targetWorldId)) throw new Error('INVALID_WORLD_ID');
  const bytes = input instanceof Uint8Array || input instanceof ArrayBuffer || typeof input === 'string'
    ? input
    : Buffer.from(JSON.stringify(input));
  const layout = decodeCloudLayout(bytes);
  const base = freshPlayer ? {...baseSnapshot,actors:structuredClone(defaultManifest.actors).map(actor=>({...actor,needs:{hunger:30,energy:80,happiness:70}}))} : baseSnapshot;
  const snapshot = applyCloudLayout(base, layout, { worldId:targetWorldId });
  db.exec('BEGIN IMMEDIATE');
  try {
    if (db.prepare('SELECT 1 FROM worlds WHERE world_id=?').get(targetWorldId)) throw new Error('WORLD_ID_CONFLICT');
    db.prepare('INSERT INTO worlds(world_id,schema_version,layout_revision,snapshot) VALUES(?,?,?,?)')
      .run(targetWorldId, snapshot.schemaVersion, snapshot.layoutRevision ?? 0, JSON.stringify(snapshot));
    db.exec('COMMIT');
    return {
      worldId:targetWorldId,
      revision:snapshot.layoutRevision ?? 0,
      scenes:snapshot.scenes.length,
      entities:snapshot.entities.length,
      actors:snapshot.actors.length,
      assets:0
    };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}
