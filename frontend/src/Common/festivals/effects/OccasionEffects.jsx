import { NewYearCountdown, ParticleField } from "./ParticleField";
export function IndependenceDay(props) { return <ParticleField {...props} effectId="independence-day" />; }
export function RepublicDay(props) { return <ParticleField {...props} effectId="republic-day" />; }
export function GandhiJayanti(props) { return <ParticleField {...props} effectId="gandhi-jayanti" />; }
export function Christmas(props) { return <ParticleField {...props} effectId="christmas" />; }
export function NewYear(props) { return <><ParticleField {...props} effectId="new-year" /><NewYearCountdown {...props} /></>; }
export function ValentinesDay(props) { return <ParticleField {...props} effectId="valentines" />; }
export function Birthday(props) { return <ParticleField {...props} effectId="birthday" />; }
