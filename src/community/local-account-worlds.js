// Each community account uses its own local world; guest play retains its world.
export class LocalAccountWorlds {
  constructor({client,storage=globalThis.localStorage,createWorld,guestKey='dafeiyu-local-current-world-v1'}) {
    Object.assign(this,{client,storage,createWorld,guestKey});
    this.scope=null;this.queue=Promise.resolve();
  }
  get selectionKey(){return this.scope?`dafeiyu-local-account-world-v2:${this.scope}`:this.guestKey;}
  selected(){try{return this.storage?.getItem(this.selectionKey)||'default';}catch{return 'default';}}
  remember(worldId){try{this.storage?.setItem(this.selectionKey,worldId);}catch{}}
  setAccount(userId,serverId='same-origin') {
    const scope=userId?[serverId,userId].map(encodeURIComponent).join(':'):null;
    const run=async()=>{
      if(this.scope===scope)return;
      const previousScope=this.scope,previousWorld=this.client.worldId;
      this.remember(previousWorld);this.scope=scope;
      let worldId;try{worldId=this.storage?.getItem(this.selectionKey);}catch{}
      try{
        if(!worldId&&scope){
          worldId=`account-${crypto.randomUUID()}`;
          await this.createWorld(worldId);
        }else await this.client.switchWorld(worldId||'default');
        this.remember(worldId||'default');
      }catch(error){this.scope=previousScope;await this.client.switchWorld(previousWorld);throw error;}
    };
    const next=this.queue.then(run);this.queue=next.catch(()=>{});return next;
  }
}
