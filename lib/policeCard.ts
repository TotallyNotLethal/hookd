export const policeCardFieldOrder = [
  "department",
  "officer",
  "unit",
  "caseNumber",
  "phone",
  "address",
] as const;

export type PoliceCardField = (typeof policeCardFieldOrder)[number];

export type PoliceCardData = Record<PoliceCardField, string>;

export const policeCardLabels: Record<PoliceCardField, string> = {
  department: "Department",
  officer: "Officer",
  unit: "Unit",
  caseNumber: "Case Number",
  phone: "Phone",
  address: "Address",
};

const MAX_FIELD_LENGTH: Record<PoliceCardField, number> = {
  department: 80,
  officer: 80,
  unit: 40,
  caseNumber: 60,
  phone: 30,
  address: 180,
};

export const emptyPoliceCardData: PoliceCardData = {
  department: "",
  officer: "",
  unit: "",
  caseNumber: "",
  phone: "",
  address: "",
};

export function normalizePoliceCardValue(value: unknown, field: PoliceCardField): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return "";
  }

  return normalized.replace(/\s+/g, " ").slice(0, MAX_FIELD_LENGTH[field]);
}

export function normalizePoliceCardData(input: Partial<Record<PoliceCardField, unknown>>): PoliceCardData {
  return {
    department: normalizePoliceCardValue(input.department, "department"),
    officer: normalizePoliceCardValue(input.officer, "officer"),
    unit: normalizePoliceCardValue(input.unit, "unit"),
    caseNumber: normalizePoliceCardValue(input.caseNumber, "caseNumber"),
    phone: normalizePoliceCardValue(input.phone, "phone"),
    address: normalizePoliceCardValue(input.address, "address"),
  };
}

export function validatePoliceCardData(data: PoliceCardData): string[] {
  const errors: string[] = [];
  for (const field of policeCardFieldOrder) {
    if (!data[field]) {
      errors.push(`${policeCardLabels[field]} is required.`);
    }
  }
  return errors;
}

export function toPoliceCardQueryString(data: PoliceCardData): string {
  return new URLSearchParams(data).toString();
}

export function fromSearchParams(searchParams: URLSearchParams): PoliceCardData {
  return normalizePoliceCardData({
    department: searchParams.get("department"),
    officer: searchParams.get("officer"),
    unit: searchParams.get("unit"),
    caseNumber: searchParams.get("caseNumber"),
    phone: searchParams.get("phone"),
    address: searchParams.get("address"),
  });
}

export function formatPhoneAsText(phone: string): string {
  return phone.replace(/[^\d+()\-\s.ext]/gi, "").trim();
}

export function hasCompletePoliceCardData(data: PoliceCardData): boolean {
  return validatePoliceCardData(data).length === 0;
}
