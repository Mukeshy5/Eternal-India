import { decorationEffects, globalDecorationDefaults } from "../../shared/decorationCatalog.js";

export const decorationCollections = {
  FestivalDecoration: "festival_decorations", FestivalSchedule: "festival_schedules",
  DecorationActivityLog: "decoration_activity", DecorationEffect: "decoration_effects",
  GlobalDecorationSettings: "decoration_settings", DecorationRuntime: "decoration_runtime",
  DecorationAsset: "decoration_assets",
};

export async function ensureDecorationModels(db) {
  await Promise.all([
    db.collection("festival_decorations").createIndex({ updatedAt: -1 }),
    db.collection("festival_schedules").createIndex({ festivalId: 1, enabled: 1 }),
    db.collection("decoration_activity").createIndex({ timestamp: -1 }),
    db.collection("decoration_activity").createIndex({ decorationId: 1, timestamp: -1 }),
    db.collection("decoration_activity").createIndex({ action: 1, timestamp: -1 }),
  ]);
  await db.collection("decoration_effects").bulkWrite(decorationEffects.map((effect) => ({ updateOne: { filter: { _id: effect.id }, update: { $set: { name: effect.name, group: effect.group, symbol: effect.symbol, motion: effect.motion, colors: effect.colors, cost: effect.cost, scene: effect.scene }, $setOnInsert: { enabled: true, defaults: effect.defaults, createdAt: new Date() } }, upsert: true } })));
  await db.collection("decoration_settings").updateOne({ _id: "global" }, { $setOnInsert: { ...globalDecorationDefaults, createdAt: new Date(), updatedAt: new Date(), updatedBy: null } }, { upsert: true });
  await db.collection("decoration_runtime").updateOne({ _id: "control" }, { $setOnInsert: { manualId: null, manualUntil: null, suppressed: [] } }, { upsert: true });
}
