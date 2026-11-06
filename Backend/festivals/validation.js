import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { ObjectId } from "mongodb";
import { animationDefaults, displayPositions, effectsCompatibility, festivalCategories, globalDecorationDefaults } from "../../shared/decorationCatalog.js";

dayjs.extend(utc); dayjs.extend(timezone);
export { dayjs };
export const validId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
export const asId = (value) => new ObjectId(value);
export const validTimezone = (value) => { try { return typeof value === "string" && !!new Intl.DateTimeFormat("en", { timeZone: value }); } catch { return false; } };
export const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const bool = (value) => typeof value === "boolean";
const number = (value, min, max, integer = false) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
const text = (value, max) => typeof value === "string" && value.length <= max;
const color = (value) => typeof value === "string" && /^#[a-f\d]{6}$/i.test(value);
const assetPath = /^\/api\/public\/festival-assets\/[a-f\d]{24}$/i;
export function validateDecoration(body) {
  const fields = { ...animationDefaults, ...body };
  const errors = {};
  const selectedEffects = Array.isArray(body?.selectedEffects) ? body.selectedEffects : [];
  const compatible = effectsCompatibility(selectedEffects);
  if (compatible) errors.selectedEffects = compatible;
  if (!text(body?.name, 120) || !body.name.trim()) errors.name = "Enter a festival name (up to 120 characters).";
  if (!festivalCategories.includes(body?.category)) errors.category = "Choose a festival category.";
  if (!text(body?.description ?? "", 1000)) errors.description = "Use a description of up to 1,000 characters.";
  if (!["low", "medium", "high"].includes(fields.intensity)) errors.intensity = "Choose low, medium or high intensity.";
  if (!number(fields.animationSpeed, 0.25, 3)) errors.animationSpeed = "Animation speed must be between 0.25 and 3.";
  if (!number(fields.particleDensity, 1, 120, true)) errors.particleDensity = "Particle density must be a whole number between 1 and 120.";
  if (!number(fields.opacity, 0.1, 1)) errors.opacity = "Opacity must be between 0.1 and 1.";
  if (!color(fields.backgroundColor) || !color(fields.greetingColor)) errors.colors = "Use valid six-digit hex colors.";
  if (!Object.hasOwn(displayPositions, fields.displayPosition)) errors.displayPosition = "Choose a display position.";
  if (!bool(fields.greetingEnabled) || !text(fields.greetingMessage, 200)) errors.greetingMessage = "Use a greeting of up to 200 characters.";
  if (!bool(fields.musicEnabled) || !text(fields.musicUrl, 1000)) errors.musicUrl = "Use a valid music URL.";
  if (fields.musicUrl) { try { const url = new URL(fields.musicUrl); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); } catch { errors.musicUrl = "Music must use an HTTPS URL without credentials."; } }
  if (fields.musicEnabled && !fields.musicUrl) errors.musicUrl = "Add a music URL before enabling music.";
  if (!bool(body?.enabled)) errors.enabled = "Choose whether the festival is enabled.";
  if (!number(body?.priority ?? 0, 0, 1000, true)) errors.priority = "Priority must be a whole number between 0 and 1,000.";
  if (!text(body?.bannerImage ?? "", 100) || (body?.bannerImage && !assetPath.test(body.bannerImage))) errors.bannerImage = "Upload a valid festival banner.";
  const decoration = { name: text(body?.name, 120) ? body.name.trim() : "", description: typeof body?.description === "string" ? body.description.trim() : "", category: body?.category, effectId: selectedEffects[0], selectedEffects, enabled: body?.enabled, priority: body?.priority ?? 0, bannerImage: body?.bannerImage || "" };
  for (const key of Object.keys(animationDefaults)) decoration[key] = fields[key];
  decoration.greetingMessage = typeof fields.greetingMessage === "string" ? fields.greetingMessage.trim() : "";
  return { errors, decoration };
}

const zonedTimes = new Map();
export function zonedDate(date, time, zone) {
  const key = `${date}|${time}|${zone}`;
  if (zonedTimes.has(key)) { const cached = zonedTimes.get(key); return cached === null ? null : new Date(cached); }
  let result = null;
  try {
    const value = dayjs.tz(`${date} ${time}`, zone);
    if (value.format("YYYY-MM-DD HH:mm") === `${date} ${time}`) {
      let timestamp = value.valueOf();
      const offsetBefore = dayjs(timestamp - 6 * 3600000).tz(zone).utcOffset();
      const offsetAfter = dayjs(timestamp + 6 * 3600000).tz(zone).utcOffset();
      if (offsetAfter < offsetBefore) {
        // A repeated DST hour always chooses its earlier UTC occurrence.
        const difference = (offsetBefore - offsetAfter) * 60000;
        for (const candidate of [timestamp - difference, timestamp + difference]) if (dayjs(candidate).tz(zone).format("YYYY-MM-DD HH:mm") === `${date} ${time}`) timestamp = Math.min(timestamp, candidate);
      }
      result = timestamp;
    }
  } catch { result = null; }
  if (zonedTimes.size >= 20000) zonedTimes.delete(zonedTimes.keys().next().value);
  zonedTimes.set(key, result);
  return result === null ? null : new Date(result);
}
export function validateSchedule(body) {
  const errors = {};
  if (!validId(body?.festivalId)) errors.festivalId = "Choose a saved festival.";
  if (!validDate(body?.startDate) || !validDate(body?.endDate)) errors.dates = "Enter valid start and end dates.";
  for (const key of ["startTime", "endTime"]) if (typeof body?.[key] !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body[key])) errors[key] = "Use a valid time in HH:mm format.";
  if (!validTimezone(body?.timezone)) errors.timezone = "Choose a valid IANA timezone.";
  if (!bool(body?.recurringYearly) || !bool(body?.enabled)) errors.enabled = "Choose recurrence and enabled settings.";
  if (!number(body?.priority, 0, 1000, true)) errors.priority = "Priority must be a whole number between 0 and 1,000.";
  let startAt, endAt;
  if (!Object.keys(errors).length) {
    startAt = zonedDate(body.startDate, body.startTime, body.timezone);
    endAt = zonedDate(body.endDate, body.endTime, body.timezone);
    if (!startAt || !endAt) errors.timezone = "This local time does not exist in the selected timezone (daylight-saving change).";
    else if (endAt <= startAt) errors.dates = "The schedule must end after it starts.";
    else if (body.recurringYearly && endAt - startAt > 366 * 86400000) errors.dates = "A yearly recurring window cannot exceed one year.";
  }
  const schedule = {};
  for (const key of ["festivalId", "startDate", "endDate", "startTime", "endTime", "timezone", "recurringYearly", "enabled", "priority"]) schedule[key] = body?.[key];
  return { errors, schedule: { ...schedule, startAt, endAt } };
}

export function validateSettings(body) {
  const settings = {};
  const errors = {};
  for (const key of Object.keys(globalDecorationDefaults)) settings[key] = body?.[key];
  for (const key of ["enabled", "visitorHideButton", "greetingEnabled", "musicEnabled", "mobileOptimization", "reducedMotion"]) if (!bool(settings[key])) errors[key] = "Choose enabled or disabled.";
  if (!["low", "medium", "high"].includes(settings.defaultIntensity)) errors.defaultIntensity = "Choose a default intensity.";
  if (!number(settings.defaultAnimationSpeed, 0.25, 3)) errors.defaultAnimationSpeed = "Choose a speed between 0.25 and 3.";
  if (!number(settings.defaultParticleDensity, 1, 120, true)) errors.defaultParticleDensity = "Choose a density between 1 and 120.";
  if (!validTimezone(settings.timezone)) errors.timezone = "Choose a valid IANA timezone.";
  return { settings, errors };
}
