import { voucherCompany, formatVoucherDate, formatVoucherMoney } from "./voucherBilling.js";
import { defaultCertificationImageId } from "./companyCertifications.js";

export const letterTypes = { joining: "Joining Letter", experience: "Experience Letter" };
export const letterCompany = {
  name: voucherCompany.name, address: voucherCompany.address, phone: voucherCompany.phone,
  website: voucherCompany.website, signatory: "Authorised Signatory", signatoryTitle: "Human Resources",
  certificationImageId: defaultCertificationImageId,
};
export const letterDate = formatVoucherDate;
export const letterMoney = formatVoucherMoney;

// Calendar duration includes the last working day and clamps month anniversaries.
export function employmentDuration(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "") || to < from) return "";
  const start = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`);
  if (!Number.isFinite(+start) || !Number.isFinite(+end)) return "";
  end.setUTCDate(end.getUTCDate() + 1);
  const anniversary = (months) => {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
    date.setUTCDate(Math.min(start.getUTCDate(), new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
    return date;
  };
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  if (anniversary(months) > end) months--;
  const days = Math.round((end - anniversary(months)) / 86400000);
  return [[Math.floor(months / 12), "year"], [months % 12, "month"], [days, "day"]]
    .filter(([n]) => n).map(([n, unit]) => `${n} ${unit}${n === 1 ? "" : "s"}`).join(", ") || "1 day";
}

export function defaultLetterContent(letter) {
  const { type, joiningDate, lastWorkingDate, salaryPaise = 0, salaryPeriod = "month" } = letter;
  const employee = letter.employee || {}, company = letter.company || {};
  if (type === "experience") return `To whom it may concern,\n\nThis is to certify that ${employee.name || "[Employee name]"} (Employee ID: ${employee.employeeId || "[Employee ID]"}) was employed with ${company.name || "[Company name]"} as ${employee.designation || "[Designation]"} in the ${employee.department || "[Department]"} department from ${letterDate(joiningDate)} to ${letterDate(lastWorkingDate)}, a period of ${employmentDuration(joiningDate, lastWorkingDate) || "[Employment duration]"}.\n\nWe thank them for their service and wish them success in their future endeavours.`;
  return `Dear ${employee.name || "[Employee name]"},\n\nWe are pleased to confirm your appointment as ${employee.designation || "[Designation]"} in the ${employee.department || "[Department]"} department at ${company.name || "[Company name]"}, effective ${letterDate(joiningDate)}. Your employee ID is ${employee.employeeId || "[Employee ID]"}.\n\nYour agreed gross salary is ${letterMoney(salaryPaise)} per ${salaryPeriod}, subject to applicable statutory deductions.\n\nWe welcome you to the team and look forward to working with you.`;
}

export function letterFacts(letter) {
  return [
    ["Employee name", letter.employee.name], ["Employee ID", letter.employee.employeeId],
    ["Designation", letter.employee.designation], ["Department", letter.employee.department],
    ["Date of joining", letterDate(letter.joiningDate)],
    ...(letter.type === "joining" ? [["Gross salary", `${letterMoney(letter.salaryPaise)} / ${letter.salaryPeriod}`]] : [
      ["Last working date", letterDate(letter.lastWorkingDate)], ["Employment duration", employmentDuration(letter.joiningDate, letter.lastWorkingDate)],
    ]),
  ];
}
