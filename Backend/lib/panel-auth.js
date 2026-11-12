import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { technicalAccess } from "../festivals/permissions.js";
import { adminPanelAccess } from "./panel-access.js";

export async function authenticatePanel({ db, config, token, panel = "admin" }) {
  let claims;
  try { claims = jwt.verify(token || "", config.authTokenSecret, { algorithms: ["HS256"], issuer: "eternal-india", audience: "eternal-india-panels" }); } catch { return { status: 401 }; }
  if (typeof claims.sub !== "string" || !ObjectId.isValid(claims.sub) || typeof claims.jti !== "string") return { status: 401 };
  const saved = await db.collection("admin_tokens").findOne({ _id: claims.jti, adminId: new ObjectId(claims.sub), expiresAt: { $gt: new Date() } });
  if (!saved) return { status: 401 };
  const admin = await db.collection("admins").findOne({ _id: new ObjectId(claims.sub) });
  if (!admin || ["pending", "disabled"].includes(admin.status) || admin.passwordChangedAt && saved.createdAt <= admin.passwordChangedAt) return { status: 401 };
  if (panel === "technical" ? !technicalAccess(admin, config).technical : !adminPanelAccess(admin, config)) return { status: 403 };
  return { admin, claims };
}
