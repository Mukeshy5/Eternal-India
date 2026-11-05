import { useCallback, useEffect, useRef } from "react";
import welcome from "../assets/Plan your trip page Voice/Plan your trip-welcome.mp3";
import hindi from "../assets/Plan your trip page Voice/hindi successfully submited.mp3";
import english from "../assets/Plan your trip page Voice/english successfully submited.mp3";
import "./QuoteVoice.css";

const clips = {
  welcome,
  hi: hindi,
  en: english,
};

export function useQuoteVoice() {
  const audioRef = useRef(null);
  const attempt = useRef(0);
  const waitingForGesture = useRef(null);
  const play = useCallback((name) => {
    const audio = audioRef.current;
    if (!audio || !clips[name]) return;
    const currentAttempt = ++attempt.current;
    waitingForGesture.current = null;
    const failed = (error) => {
      if (currentAttempt !== attempt.current) return;
      if (error.name === "NotAllowedError") waitingForGesture.current = name;
    };
    try {
      audio.pause();
      audio.src = clips[name];
      audio.currentTime = 0;
      // Play immediately on a user action; handle browsers that block autoplay.
      Promise.resolve(audio.play()).catch(failed);
    } catch (error) { failed(error); }
  }, []);
  useEffect(() => {
    const audio = audioRef.current;
    const resume = () => {
      if (waitingForGesture.current) play(waitingForGesture.current);
    };
    document.addEventListener("pointerdown", resume, { capture: true, passive: true });
    document.addEventListener("keydown", resume, { capture: true, passive: true });
    play("welcome");
    return () => {
      attempt.current += 1;
      waitingForGesture.current = null;
      document.removeEventListener("pointerdown", resume, true);
      document.removeEventListener("keydown", resume, true);
      audio?.pause();
    };
  }, [play]);
  return { audioRef, play };
}

export default function QuoteVoice({ voice, language, onLanguageChange }) {
  return <div className="quote-language">
    <label htmlFor="quote-voice-language">Language / भाषा</label>
    <select id="quote-voice-language" name="voiceLanguage" value={language} onChange={(event) => onLanguageChange(event.target.value)}>
      <option value="en">English</option><option value="hi">हिंदी (Hindi)</option>
    </select>
    {/* play() owns source changes so a React update cannot reload an active recording. */}
    <audio ref={voice.audioRef} src={clips.welcome} hidden aria-hidden="true" tabIndex={-1} preload="auto" />
  </div>;
}
