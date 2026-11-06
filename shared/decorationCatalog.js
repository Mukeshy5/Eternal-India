export const decorationPermissions = {
  dashboard: "View Decoration Dashboard", effects: "View Effects Library",
  createFestival: "Create Festival", editFestival: "Edit Festival", deleteFestival: "Delete Festival",
  createSchedule: "Create Schedule", editSchedule: "Edit Schedule", deleteSchedule: "Delete Schedule",
  publish: "Publish Decoration", activate: "Activate / Deactivate Decoration",
  settings: "Manage Global Settings", history: "View Decoration History",
};
export const festivalCategories = ["Indian Festivals", "National Holidays", "International Celebrations", "Religious Festivals", "Personal Celebrations", "General Animations"];
export const displayPositions = { website: "Full Website", homepage: "Homepage Only", header: "Header Only", footer: "Footer Only" };
export const animationDefaults = { intensity: "medium", animationSpeed: 1, particleDensity: 30, opacity: 0.8, backgroundColor: "#173e37", displayPosition: "website", greetingEnabled: true, greetingMessage: "", greetingColor: "#fff4d6", musicEnabled: false, musicUrl: "" };
export const globalDecorationDefaults = { enabled: true, defaultIntensity: "medium", defaultAnimationSpeed: 1, defaultParticleDensity: 30, timezone: "Asia/Kolkata", visitorHideButton: true, greetingEnabled: true, musicEnabled: false, mobileOptimization: true, reducedMotion: true };

const effect = (id, name, group, symbol, motion, colors, cost = 1, scene = false) => ({ id, name, group, symbol, motion, colors, cost, scene, defaults: { ...animationDefaults } });
export const decorationEffects = [
  effect("bubbles", "Bubble Floating", "General", "○", "bubble", ["#a3e5f2", "#d3baff"]),
  effect("fireworks", "Fireworks", "General", "✦", "firework", ["#f7c75b", "#ff758f", "#93daff"], 3),
  effect("balloons", "Balloon Floating", "General", "●", "balloon", ["#ff8fb1", "#77c9fa", "#ffce70"]),
  effect("snowfall", "Snowfall", "General", "❄", "snow", ["#ffffff", "#d5f4ff"]),
  effect("flowers", "Flower Falling", "General", "✿", "flower", ["#ffadc6", "#ffd68c"]),
  effect("rose-petals", "Rose Petals", "General", "♥", "petal", ["#ee557a", "#b82e58"]),
  effect("hearts", "Floating Hearts", "General", "♥", "heart", ["#ff779e", "#ffb4cd"]),
  effect("falling-stars", "Star Falling", "General", "★", "star", ["#fff4ae", "#d8eaff"]),
  effect("sparkles", "Sparkles", "General", "✧", "sparkle", ["#fffbd9", "#f5cb6e"]),
  effect("confetti", "Confetti Blast", "General", "▪", "confetti", ["#ff7e9a", "#73d8b7", "#ffe272", "#9da2ff"], 2),
  effect("golden-particles", "Golden Particles", "General", "·", "gold", ["#ffd375", "#fff0b5"]),
  effect("light-beams", "Light Beams", "General", "│", "beam", ["#ffe9a1", "#bee8ff"], 2),
  effect("lanterns", "Floating Lanterns", "General", "▣", "lantern", ["#ffb965", "#ffd699"]),
  effect("candles", "Candle Glow", "General", "🕯", "candle", ["#ffdb8a", "#fff3b6"]),
  effect("bells", "Swinging Bells", "General", "🔔", "bell", ["#ffd866", "#e4b653"]),
  effect("gifts", "Gift Boxes", "General", "🎁", "gift", ["#ef7f9d", "#ffdb84"]),
  effect("diwali", "Diwali", "Indian Festivals", "🪔", "diya", ["#ffc759", "#ff993e"], 3, true),
  effect("dhanteras", "Dhanteras", "Indian Festivals", "₹", "coin", ["#ffd363", "#e9ac3f"], 2, true),
  effect("holi", "Holi", "Indian Festivals", "●", "gulal", ["#f268b4", "#ffce52", "#6bd5ba", "#a78eff"], 3, true),
  effect("ganesh-chaturthi", "Ganesh Chaturthi", "Indian Festivals", "✿", "garland", ["#ffb54f", "#ff713e"], 2, true),
  effect("navratri", "Navratri", "Indian Festivals", "╳", "dandiya", ["#ff789f", "#ffc963", "#a4df9c"], 2, true),
  effect("durga-puja", "Durga Puja", "Indian Festivals", "✿", "puja", ["#ef726a", "#fff0d2"], 2, true),
  effect("janmashtami", "Janmashtami", "Indian Festivals", "🦚", "feather", ["#69cba5", "#87c7ee", "#ffdd7f"], 2, true),
  effect("mahashivratri", "Mahashivratri", "Indian Festivals", "🔱", "trishul", ["#b6b7ff", "#f2e6c6"], 2, true),
  effect("raksha-bandhan", "Raksha Bandhan", "Indian Festivals", "✺", "rakhi", ["#faab5e", "#ef7296"], 2, true),
  effect("makar-sankranti", "Makar Sankranti", "Indian Festivals", "◆", "kite", ["#ff805f", "#68cee1", "#ffdc79"], 2, true),
  effect("eid", "Eid", "Indian Festivals", "☾", "crescent", ["#f4d783", "#b3e0d0"], 2, true),
  effect("onam", "Onam", "Indian Festivals", "✿", "pookalam", ["#ffcb59", "#ff9558", "#f0e5a1"], 2, true),
  effect("independence-day", "Independence Day", "Occasions", "🇮🇳", "flag", ["#ff9933", "#ffffff", "#138808"], 2, true),
  effect("republic-day", "Republic Day", "Occasions", "☸", "chakra", ["#ff9933", "#ffffff", "#138808"], 2, true),
  effect("gandhi-jayanti", "Gandhi Jayanti", "Occasions", "☸", "peace", ["#ffffff", "#9dbb90"], 1, true),
  effect("christmas", "Christmas", "Occasions", "🎄", "christmas", ["#ffffff", "#ea6b6b", "#aad5a1"], 3, true),
  effect("new-year", "New Year", "Occasions", "✦", "newyear", ["#ffdc7a", "#e5c3ff", "#91deee"], 3, true),
  effect("valentines", "Valentine’s Day", "Occasions", "♥", "valentine", ["#ff779d", "#ffbed4"], 2, true),
  effect("birthday", "Birthday Celebration", "Occasions", "🎈", "birthday", ["#ff9ab7", "#a4d8f2", "#ffe087"], 3, true),
  effect("meteor-shower", "Meteor Shower", "General", "☄", "meteor", ["#dbedff", "#b4c8ff"], 2),
];
export function effectsCompatibility(selected) {
  const entries = selected.map((id) => decorationEffects.find((entry) => entry.id === id));
  if (!selected.length || selected.length > 6 || new Set(selected).size !== selected.length || entries.some((entry) => !entry)) return "Choose 1–6 different effects from the library.";
  if (entries.filter((entry) => entry.scene).length > 1) return "Combine one festival scene with general effects; two festival scenes cannot run together.";
  if (entries.reduce((total, entry) => total + entry.cost, 0) > 10) return "This combination is too intensive. Remove an effect to stay within the animation budget.";
  return "";
}
