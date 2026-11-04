export class LocalSound {
 constructor({AudioClass=globalThis.Audio}={}){this.AudioClass=AudioClass;this.enabled=false;this.music=new AudioClass('/resources/audio/garden-theme.mp3');this.music.loop=true;this.music.volume=.18;}
 setEnabled(enabled){this.enabled=enabled;if(enabled){this.music.volume=.18;void Promise.resolve(this.music.play()).catch(()=>{});}else{this.music.pause();this.voice?.pause();}}
 resume(){if(this.enabled&&this.music.paused)void Promise.resolve(this.music.play()).catch(()=>{});}
 play(kind){if(!this.enabled)return;const names={pet:'pet',eat:'feed',feed:'feed',sleep:'sleep',swim:'pool',slide:'pool'};const name=names[kind];if(!name)return;this.voice?.pause();this.voice=new this.AudioClass(`/resources/audio/${name}.mp3`);this.voice.volume=.85;this.music.volume=.07;this.voice.onended=this.voice.onerror=()=>{this.music.volume=.18;};void Promise.resolve(this.voice.play()).catch(()=>{this.music.volume=.18;});}
 dispose(){this.setEnabled(false);}
}
