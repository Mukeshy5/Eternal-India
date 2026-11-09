import nodemailer from "nodemailer";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

export function otpEmail(code, company = "Eternal India") {
  const name = escapeHtml(company);
  return {
    subject: `${company}: verify your Gmail address`,
    text: `${company}\n\nVerify your Gmail address\n\nYour verification code is ${code}.\n\nThis code expires in 5 minutes. Use only the latest code. Never share it with anyone.\n\nIf you did not request this email, you can safely ignore it.`,
    html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verify your Gmail</title></head><body style="margin:0;padding:24px 12px;background:#f1f5f8;font-family:Arial,Helvetica,sans-serif;color:#172c3f"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:540px;background:#fff;border:1px solid #dce5ed;border-radius:16px;overflow:hidden"><tr><td style="background:#172f43;padding:28px 32px;color:#fff"><p style="margin:0 0 8px;color:#dbbb83;font-size:11px;letter-spacing:3px">ACCOUNT VERIFICATION</p><h1 style="margin:0;font-size:27px;font-weight:600">${name}</h1></td></tr><tr><td style="padding:32px"><h2 style="margin:0 0 14px;font-size:23px">Verify your Gmail address</h2><p style="margin:0 0 24px;color:#52677a;font-size:15px;line-height:1.7">Enter this verification code on your account page to confirm that this Gmail address belongs to you.</p><div style="padding:24px 12px;border:1px solid #dce5ed;border-radius:12px;background:#f7fafc;text-align:center"><span style="font-family:Consolas,monospace;font-size:36px;letter-spacing:8px;font-weight:700;color:#a62c60">${code}</span></div><p style="margin:20px 0 0;font-size:14px;line-height:1.7"><strong>Expires in 5 minutes.</strong> If you request another code, use only the newest one.</p><p style="margin:18px 0 0;color:#52677a;font-size:13px;line-height:1.7">Keep this code private. Our team will never ask you to share it. If you did not request this email, you can safely ignore it.</p></td></tr><tr><td style="padding:20px 32px;border-top:1px solid #e5ebf0;color:#7a8b99;font-size:12px">${name} &middot; Secure account verification</td></tr></table></td></tr></table></body></html>`,
  };
}

const smtpErrorMessage = (error) => {
  const code = error?.code || "";
  const name = error?.name || "";
  const message = error?.message || "";
  const combined = `${code} ${name} ${message}`.toLowerCase();

  if (combined.includes("eauth") || combined.includes("authentication") || combined.includes("invalid login") || combined.includes("credentials")) {
    return Object.assign(new Error("SMTP authentication failed. Verify SMTP_USER and SMTP_PASSWORD (Gmail App Password) in Backend/.env. The App Password must be the 16-character value without spaces."), { code: "SMTP_AUTH_FAILED" });
  }
  if (combined.includes("econnrefused") || combined.includes("econnection") || combined.includes("etimedout") || combined.includes("timeout") || combined.includes("network") || combined.includes("unreachable")) {
    return Object.assign(new Error("Could not connect to Gmail SMTP (smtp.gmail.com:465). Check your network, firewall, and SMTP_HOST/SMTP_PORT in Backend/.env."), { code: "SMTP_CONNECTION_FAILED" });
  }
  if (combined.includes("eenvelope") || combined.includes("rejected") || combined.includes("recipient") || combined.includes("sender")) {
    return Object.assign(new Error("Gmail rejected the email. Verify SMTP_FROM and the recipient address in Backend/.env."), { code: "SMTP_REJECTED" });
  }
  return Object.assign(new Error(`Email delivery failed: ${message || name || String(error)}`), { code: "SMTP_ERROR" });
};

export function createMailer(config) {
  const smtp = config.smtp || {};
  const configured = !!(smtp.host && /^[^\s@]+@gmail\.com$/i.test(smtp.user || "") && smtp.password);
  const transport = configured ? nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, requireTLS: !smtp.secure, auth: { user: smtp.user, pass: smtp.password }, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000, disableFileAccess: true, disableUrlAccess: true }) : null;
  const send = async (email, message) => {
    if (!transport) throw Object.assign(new Error("Email delivery is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD in Backend/.env."), { code: "EMAIL_NOT_CONFIGURED" });
    try {
      const result = await transport.sendMail({ from: { name: config.companyName || "Eternal India", address: smtp.from || smtp.user }, to: email, ...message });
      if (!result.accepted?.length || result.rejected?.length) throw Object.assign(new Error("The email provider rejected this message."), { code: "EMAIL_REJECTED" });
    } catch (error) {
      if (error.code === "EMAIL_REJECTED" || error.status) throw error;
      throw smtpErrorMessage(error);
    }
  };
  return {
    configured,
    gmailConfigured: configured && smtp.host.toLowerCase() === "smtp.gmail.com",
    sendOtp: (email, code) => send(email, otpEmail(code, config.companyName)),
    sendPasswordReset: ({ email, resetUrl }) => send(email, { subject: "Reset your Eternal India password", text: `Reset your Eternal India password using this link:\n${resetUrl}\n\nThis link expires in 30 minutes and works once. If you did not request this, ignore this email.` }),
    verify: async () => {
      if (!transport) throw Object.assign(new Error("Configure Gmail SMTP credentials in Backend/.env first."), { code: "EMAIL_NOT_CONFIGURED" });
      try { return await transport.verify(); } catch (error) { throw smtpErrorMessage(error); }
    },
  };
}
