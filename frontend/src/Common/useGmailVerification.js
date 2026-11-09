import { useEffect, useRef, useState } from "react";
import { api } from "./api";

const gmail = (value) => /^[a-z0-9]+(?:\.[a-z0-9]+)*(?:\+[a-z0-9._-]+)?@(gmail|googlemail)\.com$/i.test(value.trim());
export function useGmailVerification({ email, purpose = "registration", accountId, onUnauthorized }) {
  const key = JSON.stringify([email.trim().toLowerCase(), purpose, accountId || ""]);
  const [state, setState] = useState(null), [input, setInput] = useState({ key: "", value: "" }), [clock, setClock] = useState(Date.now);
  const code = input.key === key ? input.value : "";
  const setCode = (value) => setInput({ key, value });
  const request = useRef(null), locked = useRef(false);
  const active = state?.key === key ? state : null;
  const sent = !!active?.challengeId;
  const remaining = Math.max(0, Math.ceil(((active?.expiresAt || 0) - clock) / 1000));
  const resendIn = Math.max(0, Math.ceil(((active?.resendAt || 0) - clock) / 1000));
  const verified = !!active?.verified && active.verifiedUntil > clock;
  useEffect(() => () => { request.current?.abort(); locked.current = false; }, [key]);
  const timerKey = active && (active.expiresAt || active.resendAt || active.verifiedUntil) ? active.key : null;
  useEffect(() => {
    if (!timerKey) return;
    const timer = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [timerKey]);
  const reset = () => { request.current?.abort(); locked.current = false; setState(null); setCode(""); };
  async function perform(action) {
    if (locked.current || !gmail(email)) return;
    locked.current = true;
    const controller = new AbortController(); request.current = controller;
    setState((previous) => ({ ...(previous?.key === key ? previous : {}), key, busy: true, error: "", message: "" }));
    try {
      const result = await api(`/auth/${action === "send" ? "send-otp" : "verify-otp"}`, { method: "POST", timeoutMs: 30000, signal: controller.signal, body: JSON.stringify({ email: email.trim().toLowerCase(), purpose, ...(accountId ? { accountId } : {}), ...(action === "verify" ? { otp: code, challengeId: active?.challengeId } : {}) }) });
      if (controller.signal.aborted) return;
      const now = Date.now(), server = Date.parse(result.serverTime) || now;
      setClock(now); setCode("");
      if (action === "send") setState({ key, busy: false, challengeId: result.challengeId, expiresAt: now + Math.max(0, Date.parse(result.expiresAt) - server), resendAt: now + Math.max(0, Date.parse(result.resendAvailableAt) - server), verified: false, message: result.message, error: "" });
      else setState((previous) => ({ ...previous, key, busy: false, verified: true, verifiedUntil: now + Math.max(0, Date.parse(result.verificationExpiresAt) - server), message: result.message, error: "" }));
    } catch (failure) {
      if (controller.signal.aborted) return;
      setClock(Date.now());
      setState((previous) => ({ ...previous, key, busy: false, error: failure.message, message: "", ...(failure.details?.retryAfter ? { resendAt: Date.now() + failure.details.retryAfter * 1000 } : {}), ...(failure.details?.attemptsRemaining === 0 ? { expiresAt: 0 } : {}) }));
      if (failure.status === 401) onUnauthorized?.();
    } finally { if (request.current === controller) locked.current = false; }
  }
  return { verified, busy: !!active?.busy, sent, code, setCode: (value) => setCode(value.replace(/\D/g, "").slice(0, 6)), remaining, resendIn, valid: gmail(email), error: active?.error || "", message: active?.message || "", proofExpired: !!active?.verified && !verified, send: () => { if (busy || resendIn || verified) return; void perform("send"); }, verify: () => { if (sent && remaining && code.length === 6) void perform("verify"); }, reset };
}

