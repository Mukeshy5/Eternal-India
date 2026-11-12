import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { loadRazorpay, paymentMoney, paymentRequest } from "./razorpay";
import "./RazorpayCheckout.css";

const initialFields = { customerName: "", email: "", phone: "", amount: "" };
const fieldDefinitions = [
  ["customerName", "Customer full name", "text", "name", 120],
  ["email", "Email address", "email", "email", 200],
  ["phone", "Mobile number", "tel", "tel", 20],
  ["amount", "Payment amount (INR)", "number", "off", 12],
];

export default function RazorpayCheckout() {
  const [settings, setSettings] = useState(null), [fields, setFields] = useState(initialFields), [errors, setErrors] = useState({});
  const [state, setState] = useState("ready"), [message, setMessage] = useState(""), [payment, setPayment] = useState(null), [busy, setBusy] = useState(false);
  const attempt = useRef(null), callback = useRef(null), lock = useRef(false), mounted = useRef(true), modal = useRef(null), verifying = useRef(false), failed = useRef(false);
  const heading = useRef(null);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    api("/payments/config", { signal: controller.signal }).then((value) => { if (!controller.signal.aborted) setSettings(value); }).catch(() => { if (!controller.signal.aborted) setSettings({ enabled: false, minAmount: 100, maxAmount: 50000000 }); });
    return () => { mounted.current = false; controller.abort(); modal.current?.close(); };
  }, []);
  const showPayment = useCallback((value) => {
    if (!mounted.current) return;
    setPayment(value);
    if (value.status === "PAID") { setState("success"); setMessage("Your payment has been securely verified. Thank you for choosing Eternal India."); }
    else if (value.status === "REFUNDED") { setState("refunded"); setMessage("This payment has been refunded. Contact our team for any assistance."); }
    else if (value.status === "FAILED") { setState("failed"); setMessage(value.failureReason || "Your payment attempt failed. You can safely retry this order."); }
    else { setState("pending"); setMessage(value.status === "AUTHORIZED" ? "Your payment is authorized and awaiting capture. We’ll confirm it here once received." : "We’re waiting for payment confirmation. Check the status before making another payment."); }
  }, []);
  const checkStatus = useCallback(async () => {
    if (!attempt.current?.orderId || lock.current) return;
    lock.current = true; if (mounted.current) setBusy(true);
    try {
      const current = attempt.current;
      const result = await api(`/payments/status/${current.orderId}`, { headers: { Authorization: `Bearer ${current.accessToken}` }, timeoutMs: 20000 });
      if (!["PAID", "REFUNDED"].includes(result.payment.status) && callback.current) {
        const verified = await api("/payments/verify", { method: "POST", body: JSON.stringify({ ...callback.current, accessToken: current.accessToken }), timeoutMs: 30000 });
        showPayment(verified.payment);
      } else showPayment(result.payment);
    } catch (error) { if (mounted.current) { setState("uncertain"); setMessage(`${error.message} Keep this page open and check again. Your order will be reused.`); } }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }, [showPayment]);
  useEffect(() => {
    if (!["pending", "uncertain", "cancelled"].includes(state) || !attempt.current?.orderId) return;
    let checks = 0;
    const refresh = () => { if (!document.hidden && checks++ < 24) void checkStatus(); };
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [state, checkStatus]);
  useEffect(() => { if (["success", "refunded"].includes(state)) heading.current?.focus(); }, [state]);

  async function pay(event) {
    event.preventDefault();
    if (lock.current || !settings?.enabled) return;
    const issues = {};
    if (!fields.customerName.trim()) issues.customerName = "Enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) issues.email = "Enter a valid email address.";
    if (!/^\+?[1-9]\d{7,14}$/.test(fields.phone.replace(/[\s()-]/g, ""))) issues.phone = "Enter a valid mobile number.";
    if (!/^\d+(\.\d{1,2})?$/.test(fields.amount) || Math.round(Number(fields.amount) * 100) < settings.minAmount || Math.round(Number(fields.amount) * 100) > settings.maxAmount) issues.amount = `Enter ${paymentMoney(settings.minAmount)} to ${paymentMoney(settings.maxAmount)}, with up to two decimals.`;
    setErrors(issues);
    if (Object.keys(issues).length) { document.getElementById(`checkout-${Object.keys(issues)[0]}`)?.focus(); return; }
    lock.current = true; setBusy(true); setState("processing"); setMessage("Preparing your secure payment…");
    try {
      const Checkout = await loadRazorpay();
      if (!mounted.current) return;
      if (!attempt.current) attempt.current = paymentRequest();
      const result = await api("/payments/create-order", { method: "POST", body: JSON.stringify({ ...fields, ...attempt.current }), timeoutMs: 30000 });
      attempt.current.orderId = result.orderId;
      setPayment(result.payment);
      if (import.meta.env.VITE_RAZORPAY_KEY_ID && import.meta.env.VITE_RAZORPAY_KEY_ID !== result.keyId) throw new Error("The payment configuration has changed. Please contact our team before proceeding.");
      if (["PAID", "REFUNDED", "AUTHORIZED"].includes(result.payment.status)) { showPayment(result.payment); lock.current = false; setBusy(false); return; }
      if (!mounted.current) return;
      const currentAttempt = attempt.current;
      failed.current = false; verifying.current = false;
      callback.current = null;
      const checkout = new Checkout({
        key: result.keyId, order_id: result.orderId, amount: result.amount, currency: result.currency,
        name: "Eternal India", description: "Eternal India payment", image: `${window.location.origin}/logo.webp`,
        prefill: { name: fields.customerName, email: fields.email, contact: fields.phone },
        notes: { paymentReference: result.payment.receipt }, theme: { color: "#142b49" }, retry: { enabled: false },
        modal: { confirm_close: true, ondismiss: () => {
          if (!mounted.current || verifying.current || attempt.current !== currentAttempt || modal.current !== checkout) return;
          lock.current = false; setBusy(false);
          if (!failed.current) { setState("cancelled"); setMessage("Checkout was closed. No payment has been confirmed here. Check your status or retry the same order."); void checkStatus(); }
        } },
        handler: async (response) => {
          if (!mounted.current || verifying.current || attempt.current !== currentAttempt || modal.current !== checkout) return;
          verifying.current = true; callback.current = response;
          if (mounted.current) { setState("processing"); setMessage("Confirming your payment securely…"); }
          try {
            const verified = await api("/payments/verify", { method: "POST", body: JSON.stringify({ ...response, accessToken: currentAttempt.accessToken }), timeoutMs: 30000 });
            showPayment(verified.payment);
          } catch (error) { if (mounted.current) { setState("uncertain"); setMessage(`${error.message} We haven’t confirmed receipt yet. Check your payment status before paying again.`); } }
          finally { lock.current = false; if (mounted.current) setBusy(false); }
        },
      });
      checkout.on("payment.failed", () => {
        if (!mounted.current || verifying.current || attempt.current !== currentAttempt || modal.current !== checkout) return;
        failed.current = true;
        if (mounted.current) { setState("failed"); setMessage("Your payment attempt was unsuccessful. Check the status, then retry securely with the same order."); }
        lock.current = false; if (mounted.current) setBusy(false); checkout.close();
      });
      modal.current = checkout; checkout.open();
      setState("checkout"); setMessage("Complete your payment in the secure Razorpay window.");
    } catch (error) {
      if (mounted.current) {
        if (error.status === 400) { attempt.current = null; setErrors(error.errors || {}); }
        if (error.details?.receipt) setPayment({ receipt: error.details.receipt });
        setState("uncertain"); setMessage(error.message); setBusy(false);
      }
      lock.current = false;
    }
  }
  const settled = ["success", "refunded"].includes(state), awaiting = payment?.status === "AUTHORIZED" || callback.current && !settled && state !== "failed";
  return <section className="secure-payment container" id="secure-checkout" aria-labelledby="secure-payment-title">
    <aside className="secure-payment-intro">
      <span className="secure-kicker">ETERNAL INDIA · ONLINE PAYMENTS</span>
      <h2 id="secure-payment-title">Your next journey.<br /><em>One secure step.</em></h2>
      <p>Pay your booking or invoice with confidence. Every detail, thoughtfully taken care of.</p>
      <div className="secure-assurance"><span aria-hidden="true">✓</span><div><strong>Secure payment details</strong><p>Enter card, UPI or banking details only in Razorpay’s secure checkout.</p></div></div>
      <div className="secure-assurance"><span aria-hidden="true">✓</span><div><strong>Verified confirmation</strong><p>Your receipt is confirmed once your payment has been received and securely verified.</p></div></div>
      <div className="secure-provider"><img src="/razorpay.svg" alt="Razorpay" width="110" height="26" /><span>Cards · UPI · Netbanking · Wallets</span><small>Available methods are shown at checkout.</small></div>
      <a href="tel:+919319140846">Need a hand? +91 93191 40846 ↗</a>
    </aside>
    <div className="secure-payment-form-card">
      <div className="secure-form-heading"><div><span className="secure-kicker">SIMPLE. SAFE. SEAMLESS.</span><h3>Make a payment</h3></div><span className="secure-lock" aria-label="Secure checkout">↗</span></div>
      {settings?.mode === "test" && <p className="checkout-test-notice">Test Mode · Use Razorpay test payment details. No real payment is collected.</p>}
      {settled ? <div className={`checkout-result checkout-${state}`} aria-live="polite">
        <span className="checkout-result-icon" aria-hidden="true">{state === "success" ? "✓" : "↩"}</span>
        <h3 ref={heading} tabIndex={-1}>{state === "success" ? "Payment confirmed" : "Payment refunded"}</h3><p>{message}</p>
        <strong className="checkout-receipt-amount">{paymentMoney(payment.amount)}</strong>
        <dl><div><dt>Reference</dt><dd>{payment.receipt}</dd></div><div><dt>Payment ID</dt><dd>{payment.razorpayPaymentId}</dd></div><div><dt>Status</dt><dd>{payment.status}</dd></div></dl>
        <p>Please save this reference for your records.</p>
        <button className="secure-pay-button" type="button" onClick={() => { attempt.current = null; callback.current = null; setPayment(null); setFields(initialFields); setState("ready"); setMessage(""); }}>Make another payment</button>
      </div> : <form noValidate onSubmit={pay} className="secure-checkout-form" aria-label="Secure online payment">
        <div className="secure-fields">{fieldDefinitions.map(([name, label, type, autoComplete, maxLength]) => <label key={name} htmlFor={`checkout-${name}`}><span>{label}</span><input id={`checkout-${name}`} name={name} type={type} autoComplete={autoComplete} maxLength={maxLength} required value={fields[name]} disabled={busy || !!attempt.current} onChange={(event) => { setFields((value) => ({ ...value, [name]: event.target.value })); setErrors((value) => ({ ...value, [name]: "" })); }} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `checkout-error-${name}` : name === "amount" ? "checkout-amount-help" : undefined} {...(name === "amount" ? { min: (settings?.minAmount || 100) / 100, max: (settings?.maxAmount || 50000000) / 100, step: "0.01", inputMode: "decimal", placeholder: "0.00" } : {})} />{errors[name] && <small className="checkout-field-error" id={`checkout-error-${name}`}>{errors[name]}</small>}</label>)}</div>
        <p id="checkout-amount-help" className="checkout-form-note">{settings ? `${paymentMoney(settings.minAmount)} – ${paymentMoney(settings.maxAmount)} · INR only. ` : "INR only. "}Please enter the amount agreed with our team.</p>
        {message && <div className={`checkout-status checkout-status-${state}`} role={state === "failed" || state === "uncertain" ? "alert" : "status"}>{busy && <span className="checkout-spinner" aria-hidden="true" />}{message}{payment?.receipt && <small>Reference: {payment.receipt}</small>}</div>}
        {!settings ? <p role="status" className="checkout-form-note">Checking secure checkout availability…</p> : !settings.enabled && <p className="checkout-status" role="status">Online checkout is temporarily unavailable. Please call our team or use the existing payment options below.</p>}
        <button type="submit" className="secure-pay-button" disabled={busy || !settings?.enabled || !!awaiting}>{busy ? "Processing securely…" : attempt.current ? "Retry secure payment" : "Pay Securely Now"}<span aria-hidden="true">↗</span></button>
        {attempt.current?.orderId && <button type="button" className="secure-status-button" onClick={() => void checkStatus()} disabled={busy}>Check payment status</button>}
        <p className="checkout-privacy">Keep this page open until confirmation. We never collect your card number, CVV or UPI PIN. By continuing, you agree to our <a href="/terms-and-conditions">Terms & Conditions</a>.</p>
      </form>}
    </div>
  </section>;
}
