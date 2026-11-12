import { createEnquiryService } from "./service.js";
import { createWhatsAppIntegration } from "./whatsapp.js";
import { createGmailIntegration } from "./gmail.js";
import { createEnquiryRealtime } from "./realtime.js";

export function createEnquirySystem({ db, config, gmailProviderFactory }) {
  const enquiries = createEnquiryService({ db }), whatsapp = createWhatsAppIntegration({ db, config, enquiries }), gmail = createGmailIntegration({ db, config, enquiries, providerFactory: gmailProviderFactory }), realtime = createEnquiryRealtime({ db, config, enquiries });
  let timer, running;
  async function tick() {
    if (running) return running;
    running = (async () => { await enquiries.reconcile(); await whatsapp.processJobs(); if (gmail.configured() && await gmail.due()) await gmail.sync(); })().catch((error) => console.error("Enquiry integration retry scheduled:", error.name)).finally(() => { running = undefined; });
    return running;
  }
  return { enquiries, whatsapp, gmail, realtime, start() { if (timer) return; void tick(); timer = setInterval(() => { void tick(); }, 5000); timer.unref?.(); }, async stop() { clearInterval(timer); await running; await whatsapp.stop(); await gmail.stop(); await realtime.stop(); } };
}
