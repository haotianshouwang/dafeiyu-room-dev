// Only the original local world may read the old global companion cache.
export function companionStorage(storage,scope,{allowLegacy=false}={}){
 const prefix='dafeiyu-companion:'+encodeURIComponent(scope)+':';
 return {
  getItem(key){const value=storage?.getItem(prefix+key);return value??(allowLegacy?storage?.getItem(key):null)??null;},
  setItem(key,value){storage?.setItem(prefix+key,value);},
  removeItem(key){storage?.removeItem(prefix+key);},
 };
}

export function companionErrorText(error){
 const code=error?.code||error?.message||'UNKNOWN';
 if(code==='WORLD_CONTEXT_CHANGED')return '';
 if(code==='INVALID_COMMAND'||String(code).startsWith('NOT_IMPLEMENTED:'))return '宠物功能与当前世界版本不一致。请刷新页面；使用本机版时也请重启游戏服务。';
 if(code==='VISITOR_READ_ONLY')return '正在访问好友家，请回到自己的世界后操作宠物和背包。';
 if(code==='UNAUTHORIZED'||error?.status===401)return '世界连接已失效，请重新连接后再试。';
 if(code==='WORLD_NOT_CONNECTED')return '世界还在连接，稍后再试。';
 return '操作未完成（'+code+'），请重试。';
}
