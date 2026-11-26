const crypto = require("crypto");

const { query, withTransaction } = require("./db");

const OTP_PEPPER = String(process.env.OTP_PEPPER || "gamegrub_user_otp");

let verificationTableReady = false;

function createHttpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function generateOtpCode() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function hashOtpCode(otp) {
    return crypto.createHash("sha256").update(`${String(otp)}:${OTP_PEPPER}`).digest("hex");
}

function hasMatchingHash(value, expectedHash) {
    const actualBuffer = Buffer.from(String(value || ""), "utf8");
    const expectedBuffer = Buffer.from(String(expectedHash || ""), "utf8");

    if (actualBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function safeParsePayload(payloadJson) {
    try {
        return payloadJson ? JSON.parse(payloadJson) : {};
    } catch (_) {
        return {};
    }
}

async function ensureVerificationTable() {
    if (verificationTableReady) {
        return;
    }

    await query(`
        CREATE TABLE IF NOT EXISTS user_verification_challenges (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            public_token CHAR(64) NOT NULL,
            purpose VARCHAR(50) NOT NULL,
            user_id INT NULL,
            email VARCHAR(255) NOT NULL,
            otp_hash CHAR(64) NOT NULL,
            payload_json LONGTEXT NOT NULL,
            attempt_count INT NOT NULL DEFAULT 0,
            max_attempts INT NOT NULL DEFAULT 5,
            expires_at DATETIME NOT NULL,
            consumed_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_user_verification_public_token (public_token),
            KEY idx_user_verification_email_purpose (email, purpose),
            KEY idx_user_verification_user_purpose (user_id, purpose),
            KEY idx_user_verification_expires (expires_at)
        )
    `);

    verificationTableReady = true;
}

async function purgeVerificationChallenge(publicToken) {
    await ensureVerificationTable();
    await query("DELETE FROM user_verification_challenges WHERE public_token = ?", [publicToken]);
}

async function createVerificationChallenge({
    purpose,
    email,
    payload,
    userId = null,
    expiresInMinutes = 10,
    maxAttempts = 5,
    resendCooldownSeconds = 30,
}) {
    await ensureVerificationTable();

    const normalizedEmail = String(email || "").trim().toLowerCase();
    const scopeValues = [purpose, normalizedEmail];
    let scopeSql = "purpose = ? AND email = ?";

    if (userId) {
        scopeSql += " AND user_id = ?";
        scopeValues.push(userId);
    }

    const recentRows = await query(
        `
            SELECT created_at
            FROM user_verification_challenges
            WHERE ${scopeSql}
              AND consumed_at IS NULL
              AND expires_at > NOW()
            ORDER BY created_at DESC
            LIMIT 1
        `,
        scopeValues
    );

    if (recentRows[0]) {
        const createdAt = new Date(recentRows[0].created_at).getTime();
        const elapsedSeconds = Math.floor((Date.now() - createdAt) / 1000);

        if (elapsedSeconds < resendCooldownSeconds) {
            const remainingSeconds = resendCooldownSeconds - elapsedSeconds;
            throw createHttpError(
                429,
                `Please wait ${remainingSeconds} seconds before requesting another verification code.`
            );
        }
    }

    await query(
        `
            DELETE FROM user_verification_challenges
            WHERE ${scopeSql}
              AND (consumed_at IS NULL OR consumed_at IS NOT NULL)
        `,
        scopeValues
    );

    const otp = generateOtpCode();
    const publicToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    await query(
        `
            INSERT INTO user_verification_challenges (
                public_token,
                purpose,
                user_id,
                email,
                otp_hash,
                payload_json,
                max_attempts,
                expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
            publicToken,
            purpose,
            userId,
            normalizedEmail,
            hashOtpCode(otp),
            JSON.stringify(payload || {}),
            maxAttempts,
            expiresAt,
        ]
    );

    return {
        otp,
        publicToken,
        expiresAt,
    };
}

async function verifyChallenge({
    purpose,
    publicToken,
    otp,
    userId = null,
    email = null,
}) {
    await ensureVerificationTable();

    return withTransaction(async (connection) => {
        const [rows] = await connection.query(
            `
                SELECT id, user_id, email, otp_hash, payload_json, attempt_count, max_attempts, expires_at, consumed_at
                FROM user_verification_challenges
                WHERE public_token = ? AND purpose = ?
                LIMIT 1
                FOR UPDATE
            `,
            [publicToken, purpose]
        );

        if (!rows[0]) {
            throw createHttpError(
                400,
                "Invalid verification request. Please request a new verification code."
            );
        }

        const challenge = rows[0];
        const normalizedEmail = String(email || "").trim().toLowerCase();

        if (userId && Number(challenge.user_id || 0) !== Number(userId)) {
            throw createHttpError(403, "This verification request does not belong to you.");
        }

        if (normalizedEmail && String(challenge.email || "").trim().toLowerCase() !== normalizedEmail) {
            throw createHttpError(400, "Verification email does not match.");
        }

        if (challenge.consumed_at) {
            throw createHttpError(
                400,
                "This verification code has already been used. Please request a new code."
            );
        }

        if (new Date(challenge.expires_at).getTime() <= Date.now()) {
            throw createHttpError(
                400,
                "This verification code has expired. Please request a new code."
            );
        }

        if (Number(challenge.attempt_count || 0) >= Number(challenge.max_attempts || 5)) {
            throw createHttpError(
                429,
                "Too many incorrect verification attempts. Please request a new code."
            );
        }

        const otpHash = hashOtpCode(otp);

        if (!hasMatchingHash(otpHash, challenge.otp_hash)) {
            await connection.query(
                `
                    UPDATE user_verification_challenges
                    SET attempt_count = attempt_count + 1
                    WHERE id = ?
                `,
                [challenge.id]
            );

            throw createHttpError(400, "Incorrect verification code.");
        }

        await connection.query(
            `
                UPDATE user_verification_challenges
                SET consumed_at = NOW()
                WHERE id = ?
            `,
            [challenge.id]
        );

        return {
            userId: challenge.user_id ? Number(challenge.user_id) : null,
            email: String(challenge.email || "").trim().toLowerCase(),
            payload: safeParsePayload(challenge.payload_json),
        };
    });
}

module.exports = {
    createVerificationChallenge,
    ensureVerificationTable,
    purgeVerificationChallenge,
    verifyChallenge,
};
