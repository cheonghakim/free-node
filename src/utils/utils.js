export function randomUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    // 네이티브 지원
    return crypto.randomUUID();
  }

  // 네이티브 미지원 → RFC 4122 v4 직접 구현
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // RFC4122 version & variant bits 설정
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0"));

  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10).join("")
  );
}
