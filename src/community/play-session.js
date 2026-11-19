// Account authentication, local simulation and multiplayer are independent.
export function playSession({communityWorld=false, userId=null, onlineEnabled=false, realtimeStatus='offline'}={}) {
  const authenticated=Boolean(userId), multiplayer=authenticated&&onlineEnabled;
  return {
    canPlay:!communityWorld||authenticated,
    canUseCloud:authenticated,
    canConnect:multiplayer,
    label:!authenticated?'本地游客':!onlineEnabled?'已登录 · 单人游玩':realtimeStatus==='online'?'联机中':realtimeStatus==='connecting'?'正在联机':'联机已断开',
    action:!authenticated?'登录账号':onlineEnabled?'关闭联机':'开启联机'
  };
}

export function onlinePreferenceKey(serverId,userId) {
  return `dafeiyu-multiplayer-v2:${encodeURIComponent(serverId)}:${encodeURIComponent(userId)}`;
}

export function readOnlinePreference(storage,serverId,userId) {
  if(!userId)return false;
  try {
    const value=storage?.getItem(onlinePreferenceKey(serverId,userId));
    // Retain an existing opt-out, without sharing subsequent account settings.
    return (value??storage?.getItem('dafeiyu-online-enabled-v1'))!=='false';
  }catch{return true;}
}
