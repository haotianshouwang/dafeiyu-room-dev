// 家园物品定义：背包、地面掉落、堆肥和后续种植共用同一份元数据。
export const ITEMS = Object.freeze({
  poop: Object.freeze({
    id: 'poop',
    name: '便便',
    emoji: '💩',
    description: '宠物在院子里留下的。可以丢回地上，也可以放进农田边的堆肥箱。',
    stackMax: 99,
    placeable: true,
    compostInput: true,
  }),
  fertilizer: Object.freeze({
    id: 'fertilizer',
    name: '肥料',
    emoji: '🌱',
    description: '堆肥产物。等种植系统接入后，施肥时使用。',
    stackMax: 99,
    placeable: false,
    compostInput: false,
  }),
});

export const ITEM_IDS = Object.freeze(Object.keys(ITEMS));

export function getItemDef(id) {
  return ITEMS[id] ?? null;
}
