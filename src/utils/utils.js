export function randomUUID() {
  // 1) 전역 객체 안전 획득
  const g =
    typeof globalThis !== "undefined" ? globalThis :
    typeof self !== "undefined" ? self :
    typeof window !== "undefined" ? window :
    typeof global !== "undefined" ? global : {};

  const c = g.crypto || g.msCrypto; // IE11 호환

  // 2) 네이티브 지원 (브라우저/Deno 등)
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }

  // 3) Web Crypto만 있는 경우 (getRandomValues로 직접 생성)
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    // RFC4122 버전/변형 비트 설정
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return (
      hex.slice(0, 4).join("") + "-" +
      hex.slice(4, 6).join("") + "-" +
      hex.slice(6, 8).join("") + "-" +
      hex.slice(8, 10).join("") + "-" +
      hex.slice(10, 16).join("")
    );
  }

  // 4) Node.js 전용 대체 (require가 있을 때)
  try {
    // 번들러/ESM 충돌 피하려고 런타임에만 require 접근
    // eslint-disable-next-line no-new-func
    const req = Function('return typeof require === "function" ? require : null')();
    if (req) {
      const nodeCrypto = req("crypto");
      if (typeof nodeCrypto.randomUUID === "function") {
        return nodeCrypto.randomUUID();
      }
      const bytes = nodeCrypto.randomBytes(16);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
      return (
        hex.slice(0, 4).join("") + "-" +
        hex.slice(4, 6).join("") + "-" +
        hex.slice(6, 8).join("") + "-" +
        hex.slice(8, 10).join("") + "-" +
        hex.slice(10, 16).join("")
      );
    }
  } catch {
    // ignore
  }

  // 5) 최후의 비보안 대체 (CSPRNG 아님!)
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") + "-" +
    hex.slice(4, 6).join("") + "-" +
    hex.slice(6, 8).join("") + "-" +
    hex.slice(8, 10).join("") + "-" +
    hex.slice(10, 16).join("")
  );
}