import clips from './voice-clips.json' with { type: 'json' };
export class CharacterVoice {
  constructor({createAudio=url=>new Audio(url),storage=globalThis.localStorage,now=()=>Date.now()}={}) {
    this.createAudio=createAudio;this.storage=storage;this.now=now;this.current=null;this.lastKey=null;this.lastAt=-Infinity;this.enabled=true;
    try {this.enabled=storage?.getItem('dafeiyu-voice')!=='off';}catch{}
  }
  clip(key){return clips[key]||null;}
  setEnabled(value){this.enabled=!!value;if(!this.enabled)this.stop();try{this.storage?.setItem('dafeiyu-voice',this.enabled?'on':'off');}catch{}return this.enabled;}
  stop(){if(this.current){this.current.pause();this.current=null;}}
  play(key){
    const clip=this.clip(key);if(!clip||!this.enabled)return false;
    const now=this.now();if(key===this.lastKey&&now-this.lastAt<1000)return false;
    this.stop();const audio=this.createAudio(clip.url);this.current=audio;audio.volume=.8;
    this.lastKey=key;this.lastAt=now;
    audio.onended=()=>{if(this.current===audio)this.current=null;};
    try {const attempt=audio.play();attempt?.catch(()=>{if(this.current===audio)this.current=null;});}catch{this.current=null;return false;}
    return true;
  }
}
export const characterVoice=new CharacterVoice();
