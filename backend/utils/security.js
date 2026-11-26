const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const JWT_SECRET = String(process.env.JWT_SECRET || "gamegrub_secret");
const JWT_ACCESS_TOKEN_EXPIRES_IN = String(process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || "12h").trim();
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

function looksLikeBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || ""));
}

async function hashPassword(password) {
  return bcrypt.hash(String(password || ""), BCRYPT_SALT_ROUNDS);
}

async function verifyPassword(password, storedHash) {
  const normalizedHash = String(storedHash || "").trim();

  if (!normalizedHash || !looksLikeBcryptHash(normalizedHash)) {
    return {
      matches: false,
      needsRehash: false,
      algorithm: "unknown",
    };
  }

  const matches = await bcrypt.compare(String(password || ""), normalizedHash);

  return {
    matches,
    needsRehash: false,
    algorithm: "bcrypt",
  };
}

function signToken(payload, options = {}) {
  const resolvedOptions = {
    expiresIn: JWT_ACCESS_TOKEN_EXPIRES_IN || "12h",
    ...options,
  };

  return jwt.sign(payload, JWT_SECRET, resolvedOptions);
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  hashPassword,
  JWT_ACCESS_TOKEN_EXPIRES_IN,
  signToken,
  verifyPassword,
  verifyToken,
};
