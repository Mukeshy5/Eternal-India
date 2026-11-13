const gstNumberPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function companyGstNumber(record) {
  const number = typeof record?.gstNumber === "string" ? record.gstNumber.trim().toUpperCase() : "";
  if (number) return number;
  // Older GST forms stored the number in the name field.
  const name = typeof record?.name === "string" ? record.name.trim().toUpperCase() : "";
  return gstNumberPattern.test(name) ? name : "";
}

export const normalizeGstRecord = (record) => ({ ...record, gstNumber: companyGstNumber(record) });
