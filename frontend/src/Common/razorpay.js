let checkoutScript;

export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (checkoutScript) return checkoutScript;
  checkoutScript = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    const finish = (error) => {
      window.clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) { script.remove(); checkoutScript = undefined; reject(error); }
      else resolve(window.Razorpay);
    };
    const timer = window.setTimeout(() => finish(new Error("Secure checkout took too long to load. Please try again.")), 20000);
    script.onload = () => finish(window.Razorpay ? null : new Error("Secure checkout could not start. Please try again."));
    script.onerror = () => finish(new Error("Secure checkout could not load. Check your connection and try again."));
    document.head.append(script);
  });
  return checkoutScript;
}

export const paymentMoney = (paise) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format((paise || 0) / 100);
export function paymentRequest() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return { submissionId: crypto.randomUUID(), accessToken: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("") };
}
