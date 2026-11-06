import { lazy } from "react";
const general = (name) => lazy(() => import("./GeneralEffects").then((module) => ({ default: module[name] })));
const indian = (name) => lazy(() => import("./IndianEffects").then((module) => ({ default: module[name] })));
const occasion = (name) => lazy(() => import("./OccasionEffects").then((module) => ({ default: module[name] })));
export const effectComponents = {
  bubbles: general("BubbleFloating"), fireworks: general("Fireworks"), balloons: general("BalloonFloating"), snowfall: general("Snowfall"), flowers: general("FlowerFalling"),
  "rose-petals": general("RosePetals"), hearts: general("FloatingHearts"), "falling-stars": general("FallingStars"), sparkles: general("Sparkles"), confetti: general("ConfettiBlast"),
  "golden-particles": general("GoldenParticles"), "light-beams": general("LightBeams"), lanterns: general("FloatingLanterns"), candles: general("CandleGlow"), bells: general("SwingingBells"), gifts: general("GiftBoxes"), "meteor-shower": general("MeteorShower"),
  diwali: indian("Diwali"), dhanteras: indian("Dhanteras"), holi: indian("Holi"), "ganesh-chaturthi": indian("GaneshChaturthi"), navratri: indian("Navratri"), "durga-puja": indian("DurgaPuja"), janmashtami: indian("Janmashtami"), mahashivratri: indian("Mahashivratri"), "raksha-bandhan": indian("RakshaBandhan"), "makar-sankranti": indian("MakarSankranti"), eid: indian("Eid"), onam: indian("Onam"),
  "independence-day": occasion("IndependenceDay"), "republic-day": occasion("RepublicDay"), "gandhi-jayanti": occasion("GandhiJayanti"), christmas: occasion("Christmas"), "new-year": occasion("NewYear"), valentines: occasion("ValentinesDay"), birthday: occasion("Birthday"),
};
