// Account presence contains location, never furniture, needs or permissions.
export function applyAccountPlayerState(snapshot, actor, state) {
  if (!state || !Array.isArray(state.position) || state.position.length !== 3 ||
      !state.position.every(value => Number.isFinite(value) && Math.abs(value) <= 1e6)) throw Error('INVALID_PLAYER_STATE');
  if (!snapshot.scenes.some(scene => scene.sceneId === state.scene_id && scene.status === 'active')) throw Error('PLAYER_STATE_SCENE_UNAVAILABLE');
  actor.sceneId = state.scene_id;
  actor.position = [...state.position];
  if (Number.isFinite(state.rotation)) actor.rotation = state.rotation;
  actor.pose = typeof state.pose === 'string' ? state.pose : 'idle';
  actor.form = state.form === 'swim' ? 'swim' : 'normal';
  actor.moving = state.moving === true;
  actor.sprint = state.sprint === true;
  actor.speed = actor.moving ? (actor.sprint ? 5.64 : 2.82) : 0;
  actor.grounded = actor.pose !== 'jumping';
  actor.airHeight = actor.grounded ? 0 : Math.max(0, (state.render_position?.[1] ?? state.position[1]) - state.position[1] - .025);
  actor.verticalVelocity = 0;
  actor.actionId = null;
  actor.controller = null;
  actor.input = null;
  actor.resting = null;
  actor.maneuver = null;
  delete actor.computerDeskId;
  return actor;
}
