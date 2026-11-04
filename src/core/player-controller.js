import {advancePlayer} from '../../shared/world/movement.js';
// Pending inputs, rather than predicted positions, are replayed after each ack.
export class PlayerController {
 constructor({takeControl,send,onError=()=>{}}){Object.assign(this,{takeControl,send,onError});this.generation=0;this.active=false;this.pending=[];}
 begin(actor){
  if(this.active)return;
  this.active=true;this.generation++;this.state={...actor,position:[...actor.position],moving:false,speed:0,form:'normal'};
  this.pending=[];this.sequence=0;this.ack=0;this.lease=null;this.held=false;
  const generation=this.generation;
  this.ready=Promise.resolve(this.takeControl()).then(lease=>{if(generation!==this.generation)return;this.lease=lease;return lease;});
  this.ready.catch(error=>this.fail(error,generation));
 }
 step(snapshot,direction,dt){
  if(!this.active)return;
  this.snapshot=snapshot;this.held=!!Math.hypot(...direction);
  const input={sequence:++this.sequence,dtMs:Math.min(50,Math.max(0,dt*1000)),direction};
  this.state=advancePlayer(snapshot,this.state,direction,input.dtMs);this.pending.push(input);
  // A disconnected tab must not accumulate an unbounded speculative world.
  if(this.pending.reduce((sum,f)=>sum+f.dtMs,0)>1000)this.fail(Error('移动同步超时，请重试'),this.generation);
 }
 stop(){if(!this.active)return;this.held=false;this.state={...this.state,moving:false,speed:0,pose:'idle'};if(this.pending.at(-1)?.dtMs!==0)this.pending.push({sequence:++this.sequence,dtMs:0,direction:[0,0]});}
 reconcile(actor){
  if(!this.active||!this.lease)return;
  if(actor.controller&&actor.controller.leaseVersion<this.lease.leaseVersion)return;
  if(actor.sceneId!==this.state.sceneId||actor.controller?.leaseId!==this.lease.leaseId||actor.controller?.leaseVersion!==this.lease.leaseVersion){this.release();return;}
  this.lease={...this.lease,expiresAt:actor.controller.expiresAt};
  const ack=actor.input?.leaseId===this.lease.leaseId?actor.input.sequence:0;
  if(ack<this.ack)return;
  // Polls from before a manual command can be older than its direct response.
  if(ack===this.ack)return;
  this.ack=ack;this.pending=this.pending.filter(input=>input.sequence>ack);
  this.state={...actor,position:[...actor.position]};
  for(const input of this.pending)this.state=advancePlayer(this.snapshot,this.state,input.direction,input.dtMs);
  if(!this.held)this.state={...this.state,moving:false,speed:0,pose:'idle'};
 }
 sample(){return this.active?this.state:null;}
 flush(){
  if(this.running)return this.running;
  if(!this.active||!this.pending.length)return Promise.resolve();
  const generation=this.generation;
  const run=(async()=>{const lease=await this.ready;if(!lease||!this.active||generation!==this.generation)return;
   const frames=this.pending.slice(0,120);
   const result=await this.send({actorId:this.state.actorId,...{leaseId:lease.leaseId,leaseVersion:lease.leaseVersion},frames});
   if(this.active&&generation===this.generation)this.reconcile(result.actor);
  })();
  this.running=run.catch(error=>{this.fail(error,generation);throw error;}).finally(()=>{this.running=null;if(this.active&&!this.held&&this.pending.length)this.flush().catch(()=>{});});
  return this.running;
 }
 async drain(){while(this.active&&this.pending.length)await this.flush();}
 fail(error,generation){if(generation!==this.generation)return;this.release();this.onError(error);}
 release(){this.active=false;this.generation++;this.pending=[];this.held=false;}
}
