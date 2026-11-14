import { validDate } from "../staff/validation.js";
import { moneyToPaise } from "../../shared/voucherBilling.js";
import { defaultLetterContent, letterTypes } from "../../shared/employmentLetters.js";

export function validateCompany(value) {
  const errors = {}, company = {};
  for (const [key, min, max] of [["name", 2, 200], ["address", 5, 600], ["phone", 0, 200], ["website", 0, 200], ["signatory", 2, 200], ["signatoryTitle", 0, 200]]) {
    const source = value?.[key];
    company[key] = typeof source === "string" ? source.trim().replace(/\s+/g, " ") : "";
    if (typeof source !== "string" || company[key].length < min || company[key].length > max || /[\x00-\x08\x0b-\x1f\x7f<>]/.test(company[key])) errors[`company.${key}`] = `Use ${min}–${max} characters for ${key}.`;
  }
  return { company, errors };
}

export function validateLetter(body, employee, current) {
  const { company, errors } = validateCompany(body?.company);
  const fields = { type: body?.type, company, joiningDate: body?.joiningDate, issueDate: body?.issueDate, employee };
  if (typeof fields.type !== "string" || !Object.hasOwn(letterTypes, fields.type)) errors.type = "Choose Joining Letter or Experience Letter.";
  if (current && fields.type !== current.type) errors.type = "The type of a saved letter cannot change.";
  for (const key of ["joiningDate", "issueDate"]) if (!validDate(fields[key])) errors[key] = "Choose a valid date between 2000 and 2100.";
  fields.salaryPaise = 0; fields.salaryPeriod = "month"; fields.lastWorkingDate = "";
  if (fields.type === "joining") {
    fields.salaryPaise = moneyToPaise(body?.salary);
    fields.salaryPeriod = body?.salaryPeriod;
    if (fields.salaryPaise === null) errors.salary = "Enter a salary of 0–99,999,999.99 with up to two decimals.";
    if (!["month", "year"].includes(fields.salaryPeriod)) errors.salaryPeriod = "Choose per month or per year.";
  } else if (fields.type === "experience") {
    fields.lastWorkingDate = body?.lastWorkingDate;
    if (!validDate(fields.lastWorkingDate) || fields.lastWorkingDate < fields.joiningDate) errors.lastWorkingDate = "Last working date must be on or after joining date.";
    if (validDate(fields.issueDate) && fields.lastWorkingDate > fields.issueDate) errors.issueDate = "Issue date must be on or after the last working date.";
  }
  for (const [key, max, required] of [["content", 16000, false], ["terms", 6000, false], ["responsibilities", 6000, fields.type === "experience"], ["performance", 4000, fields.type === "experience"]]) {
    const value = body?.[key] ?? "";
    fields[key] = typeof value === "string" ? value.trim().replace(/\r\n?/g, "\n") : "";
    if (typeof value !== "string" || fields[key].length > max || (required && !fields[key]) || /[\x00-\x08\x0b-\x1f\x7f<>]/.test(fields[key])) errors[key] = required ? `Enter ${key} (up to ${max} characters).` : `Use plain text up to ${max} characters.`;
    if (fields[key].split("\n").length > 150) errors[key] = "Use up to 150 lines per section.";
  }
  if (!fields.content && !Object.keys(errors).length) fields.content = defaultLetterContent(fields);
  if (current && (!Number.isInteger(body?.version) || body.version !== current.version)) errors.version = "This letter changed in another session. Reopen it before saving.";
  return { fields, errors };
}
