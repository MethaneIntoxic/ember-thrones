import { createHmac, timingSafeEqual } from "node:crypto";

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const parts = value.map((entry) => stableStringify(entry));
    return `[${parts.join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  const fields = entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`);
  return `{${fields.join(",")}}`;
};

export const signPayload = (payload: unknown, secret: string): string => {
  return createHmac("sha256", secret).update(stableStringify(payload)).digest("hex");
};

export const verifyPayloadSignature = (
  payload: unknown,
  providedSignature: string,
  secret: string,
): boolean => {
  const expected = signPayload(payload, secret);
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(providedSignature, "utf8");

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
};
