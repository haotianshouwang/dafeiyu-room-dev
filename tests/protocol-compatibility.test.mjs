import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProtocolAdapter, projectPublicSnapshot } from '../src/core/protocol-adapter.js';

test('client protocol boundary remains optional and projects private fields', async () => {
  const adapter = await loadProtocolAdapter();
  assert.equal(adapter.protocolVersion, '1.0.0');
  const projected = projectPublicSnapshot({ worldId: 'world-1', buildPlans: { secret: true }, scenes: [] });
  assert.deepEqual(projected, { worldId: 'world-1', scenes: [] });
});
