import "./GmailVerification.css";

const time = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
export default function GmailVerification({ email, onEmailChange, verification, id = "account-gmail", name = "email", disabled, existingVerified = false, existingAllowed = false }) {
  const verified = existingVerified || verification.verified;
  const allowed = verified || existingAllowed;
  const locked = disabled || verification.busy;
  return <div className="gmail-verification">
    <label htmlFor={id}>Gmail address</label>
    <div className="gmail-email-row"><input id={id} name={name} type="email" autoComplete="email" required maxLength={200} placeholder="yourname@gmail.com" value={email} disabled={locked} onChange={(event) => onEmailChange(event.target.value)} /><button type="button" className="dashboard-button gmail-send" disabled={locked || !verification.valid || allowed || verification.sent || verification.resendIn > 0} onClick={verification.send}>{verified ? "Verified" : existingAllowed ? "Unchanged email" : verification.busy ? "Please wait…" : verification.sent ? "OTP sent" : verification.resendIn ? `Wait ${verification.resendIn}s` : "Send OTP"}</button></div>
    {verified ? <p className="gmail-verified" role="status">✓ Gmail verified. You can save this account.</p> : verification.sent && <div className="gmail-otp-box"><label htmlFor={`${id}-otp`}>Verification code</label><div className="gmail-otp-row"><input id={`${id}-otp`} name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} aria-describedby={`${id}-timer`} placeholder="6-digit OTP" value={verification.code} disabled={locked || !verification.remaining} onChange={(event) => verification.setCode(event.target.value)} /><button type="button" className="dashboard-button" disabled={locked || verification.code.length !== 6 || !verification.remaining} onClick={verification.verify}>Verify OTP</button></div><div className="gmail-otp-meta"><span id={`${id}-timer`} role="timer">{verification.remaining ? `Code expires in ${time(verification.remaining)}` : "OTP expired. Request a new code."}</span><button type="button" className="gmail-resend" disabled={locked || verification.resendIn > 0} onClick={verification.send}>{verification.resendIn ? `Resend OTP in ${verification.resendIn}s` : "Resend OTP"}</button></div></div>}
    {verification.error && <p className="admin-error" role="alert">{verification.error}</p>}
    {verification.message && !verified && <p className="gmail-note" role="status">{verification.message}</p>}
    {verification.proofExpired && <p className="admin-error" role="alert">Gmail verification expired. Request and verify a new OTP.</p>}
    {existingAllowed && !verified && <p className="gmail-note">Existing email retained. You can save changes without OTP. Changing this address requires Gmail verification.</p>}
    {!allowed && !verification.sent && <p className="gmail-note">Verify this Gmail address before saving the account.</p>}
  </div>;
}
