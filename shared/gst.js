export const gstNumberPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function companyGstNumber(record) {
  const number = typeof record?.gstNumber === "string" ? record.gstNumber.trim().toUpperCase() : "";
  if (number) return gstNumberPattern.test(number) ? number : "";
  // Older GST forms stored the number in the name field.
  const name = typeof record?.name === "string" ? record.name.trim().toUpperCase() : "";
  return gstNumberPattern.test(name) ? name : "";
}

export const normalizeGstRecord = (record) => ({ ...record, gstNumber: companyGstNumber(record) });
export const publicGstRecord = (record) => ({ _id: record._id, gstNumber: companyGstNumber(record), version: record.version || 1, ...(record.createdAt ? { createdAt: record.createdAt } : {}), ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}) });
