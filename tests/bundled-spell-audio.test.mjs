import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SPELLS} from '../shared/world/spells.js';
import {LocalSound} from '../src/core/local-sound.js';

test('game audio plays both spell phases and sound variants from the public manifest',()=>{
 const approved=new Set(JSON.parse(readFileSync(new URL('../resources/audio/manifest.json',import.meta.url))).files.map(entry=>entry.path));
 const played=[];
 class Audio{
  constructor(url){this.url=url;this.readyState=2;}
  play(){played.push(this.url);return Promise.resolve();}
  pause(){}
 }
 const sound=new LocalSound({AudioClass:Audio});
 sound.setEnabled(true);
 const spells=[...SPELLS.map(({id})=>id),'waterJet'];
 for(const id of spells){
  sound.playAction(`spell-${id}-release`);
  sound.playAction(`spell-${id}`);
 }
 const expected=spells.flatMap(id=>{
  const name=id==='waterJet'?'water-jet':id;
  return ['release','impact'].map(phase=>`/resources/audio/action-spell-${name}-${phase}.wav`);
 });
 assert.deepEqual(played.slice(1),expected);
 sound.playAction('run-grass-left');
 sound.playAction('meal-crunch');
 assert.deepEqual(played.slice(-2),['/resources/audio/action-footstep-1.wav','/resources/audio/action-meal-crunch-1.wav']);
 assert.ok(played.every(url=>approved.has(url.slice(1))));
 assert.equal(sound.voice,undefined);
});
