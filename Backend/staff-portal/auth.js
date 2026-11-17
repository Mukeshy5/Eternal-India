import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";

export const staffCookie = "eternal_india.staff";
export const staffJwt = { algorithms: ["HS256"], issuer: "eternal-india", audience: "eternal-india-staff" };
export const staffActor = (staffId) => `staff:${staffId}`;
export const staffPasswordValid = (value) => typeof value === "string" && value.length >= 12 && value.length <= 256 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
export async function authenticateStaff({ db, config, token }) {
  let claims;
  try { claims = jwt.verify(token || "", config.authTokenSecret, staffJwt); } catch { return null; }
  if (typeof claims.sub !== "string" || !/^[a-f\d]{24}$/i.test(claims.sub) || typeof claims.jti !== "string" || claims.role !== "staff") return null;
  const accountId = new ObjectId(claims.sub);
  const saved = await db.collection("staff_tokens").findOne({ _id: claims.jti, accountId, expiresAt: { $gt: new Date() } });
  if (!saved) return null;
  const account = await db.collection("staff_accounts").findOne({ _id: accountId, status: "active", authVersion: claims.version });
  if (!account || saved.authVersion !== account.authVersion) return null;
  const employee = await db.collection("staff").findOne({ _id: account.staffId, employeeId: account.employeeId, status: "active", deletedAt: null }, { projection: { photo: 0, salary: 0 } });
  return employee ? { account, employee, claims } : null;
}
export function publicStaff(account, employee) {
  return { id: account._id.toString(), username: account.username, role: "staff", canViewActivity: account.canViewActivity === true, employeeId: employee.employeeId, staffId: employee._id.toString(), name: employee.name, email: employee.email, phone: employee.phone, department: employee.department, designation: employee.designation, joiningDate: employee.joiningDate || "" };
}
