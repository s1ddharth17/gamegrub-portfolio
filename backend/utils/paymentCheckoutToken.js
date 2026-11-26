const { createHmac, timingSafeEqual } = require("node:crypto");

function getSigningSecret() {
  return String(process.env.JWT_SECRET || "").trim();
}

function createCheckoutToken(attemptId, expiresAt) {
  const secret = getSigningSecret();
  if (!secret) {
    throw new Error("Payment checkout signing is not configured.");
  }

  const payload = Buffer.from(
    JSON.stringify({ attempt_id: attemptId, exp: Math.floor(expiresAt.getTime() / 1000) })
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyCheckoutToken(token) {
  const secret = getSigningSecret();
  const [payload, signature, extra] = String(token || "").split(".");
  if (!secret || !payload || !signature || extra) {
    return null;
  }

  const expected = createHmac("sha256", secret).update(payload).digest();
  let received;
  try {
    received = Buffer.from(signature, "base64url");
  } catch (_) {
    return null;
  }

  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof claims.attempt_id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(claims.attempt_id) ||
      !Number.isInteger(claims.exp) ||
      claims.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return claims;
  } catch (_) {
    return null;
  }
}

module.exports = { createCheckoutToken, verifyCheckoutToken };
