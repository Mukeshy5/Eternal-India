import express from "express";
import { rateLimit } from "express-rate-limit";
import { createPaymentService } from "./service.js";
import { paymentController } from "./controller.js";

export function registerPaymentRoutes({ app, db, config, requireAdmin, gateway }) {
  const controller = paymentController(createPaymentService({ db, config, gateway }), db);
  const limit = (count) => rateLimit({ windowMs: 15 * 60 * 1000, limit: count, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "Too many payment requests. Please try again shortly." } });
  app.get("/api/payments/config", limit(120), controller.configuration);
  app.post("/api/payments/create-order", limit(30), express.json({ limit: "16kb" }), controller.createOrder);
  app.post("/api/payments/verify", limit(90), express.json({ limit: "16kb" }), controller.verify);
  app.get(["/api/payments/status", "/api/payments/status/:orderId"], limit(300), controller.status);
  // This route is installed before express.json() in app.js. Webhooks do not
  // depend on browser sessions or rate limits; authenticity comes from HMAC.
  app.post("/api/payments/webhook", express.raw({ type: "application/json", limit: "256kb" }), controller.webhook);
  app.get("/api/admin/payments", requireAdmin, controller.list);
  app.get("/api/admin/payments/:id", requireAdmin, controller.detail);
}
