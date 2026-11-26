const express = require("express");

const auth = require("../middleware/auth");
const {
    authAttemptLimiter,
    otpRequestLimiter,
    otpVerifyLimiter,
} = require("../middleware/requestThrottle");
const { query } = require("../utils/db");
const {
    buildLockoutMessage,
    computeFailedLoginUpdate,
    getLockoutState,
} = require("../utils/loginProtection");
const { isMailConfigured, sendMail } = require("../utils/mailer");
const { hashPassword, verifyPassword } = require("../utils/security");
const {
    ACTOR_USER,
    createAuthSession,
    getRequestSessionMetadata,
    refreshAuthSession,
    revokeActorSessions,
    revokeAuthSession,
} = require("../utils/authSessions");
const {
    IMAGE_UPLOAD_MIME_TYPES,
    createUploadMiddleware,
    deleteStoredFile,
    persistUploadedFile,
} = require("../utils/uploadStorage");
const { attachTournamentProfilesToUsers } = require("../utils/tournamentCommunity");
const {
    isValidDateOfBirth,
    normalizeDateOfBirth,
} = require("../utils/loyaltyProgram");
const {
    createVerificationChallenge,
    purgeVerificationChallenge,
    verifyChallenge,
} = require("../utils/userVerification");

const router = express.Router();

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 30;
const REGISTRATION_PURPOSE = "registration";
const PASSWORD_CHANGE_PURPOSE = "password_change";
const PASSWORD_RESET_PURPOSE = "password_reset";
const INVALID_LOGIN_MESSAGE = "Invalid email or password.";
const upload = createUploadMiddleware({
    maxFileSizeBytes: 5 * 1024 * 1024,
    allowedMimeTypes: IMAGE_UPLOAD_MIME_TYPES,
});
const uploadAvatar = upload.single("avatar");

function isProductionEnvironment() {
    return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function normalizeMobile(mobile) {
    return String(mobile || "").replace(/\D/g, "");
}

function isValidMobile(mobile) {
    return /^\d{10}$/.test(normalizeMobile(mobile));
}

function isStrongPassword(password) {
    const value = String(password || "");
    const hasMinLength = value.length >= 8;
    const hasUppercase = /[A-Z]/.test(value);
    const hasLowercase = /[a-z]/.test(value);
    const hasNumber = /\d/.test(value);
    const hasSpecialCharacter = /[^A-Za-z0-9]/.test(value);

    return (
        hasMinLength &&
        hasUppercase &&
        hasLowercase &&
        hasNumber &&
        hasSpecialCharacter
    );
}

function normalizeUser(row) {
    return {
        uid: Number(row.uid || row.id || 0),
        name: row.name || "",
        email: row.email || "",
        mobile: row.mobile || "",
        loyalty_points: Number(row.loyalty_points || 0),
        date_of_birth: row.date_of_birth || null,
        avatar: row.avatar || null,
        gamer_tag: row.gamer_tag || "",
        favorite_game: row.favorite_game || "",
        player_bio: row.player_bio || "",
        display_name: row.display_name || row.gamer_tag || row.name || "",
        tournament_entries: Number(row.tournament_entries || 0),
        tournaments_checked_in: Number(row.tournaments_checked_in || 0),
        tournaments_no_show: Number(row.tournaments_no_show || 0),
        tournament_matches_played: Number(row.tournament_matches_played || 0),
        tournament_match_wins: Number(row.tournament_match_wins || 0),
        tournament_match_losses: Number(row.tournament_match_losses || 0),
        tournament_championships: Number(row.tournament_championships || 0),
        tournament_runner_up_finishes: Number(row.tournament_runner_up_finishes || 0),
        tournament_points: Number(row.tournament_points || 0),
        tournament_rank:
            row.tournament_rank === undefined || row.tournament_rank === null
                ? null
                : Number(row.tournament_rank || 0),
        tournament_win_rate: Number(row.tournament_win_rate || 0),
        most_played_tournament_game: row.most_played_tournament_game || "",
        last_tournament_at: row.last_tournament_at || null,
    };
}

function maskEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    const [localPart, domain] = normalizedEmail.split("@");

    if (!localPart || !domain) {
        return normalizedEmail;
    }

    if (localPart.length <= 2) {
        return `${localPart[0] || "*"}*@${domain}`;
    }

    return `${localPart.slice(0, 2)}${"*".repeat(Math.max(localPart.length - 2, 2))}@${domain}`;
}

async function sendUserOtp({
    email,
    otp,
    purpose,
    name,
}) {
    const normalizedEmail = normalizeEmail(email);
    const otpCopy =
        purpose === REGISTRATION_PURPOSE
            ? {
                  actionText: "finish creating your GameGrub account",
                  subject: "GameGrub account verification code",
              }
            : purpose === PASSWORD_RESET_PURPOSE
              ? {
                    actionText: "reset your GameGrub password",
                    subject: "GameGrub password reset verification code",
                }
              : {
                    actionText: "confirm your password change",
                    subject: "GameGrub password change verification code",
                };
    const greeting = name ? `Hi ${name},` : "Hi,";
    const text = [
        greeting,
        "",
        `Use this verification code to ${otpCopy.actionText}: ${otp}`,
        "",
        `This code expires in ${OTP_EXPIRY_MINUTES} minutes.`,
        "If you did not request this code, you can ignore this email.",
    ].join("\n");
    const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
            <p>${greeting}</p>
            <p>Use this verification code to ${otpCopy.actionText}:</p>
            <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 20px 0;">${otp}</p>
            <p>This code expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
            <p>If you did not request this code, you can ignore this email.</p>
        </div>
    `;

    if (isMailConfigured()) {
        await sendMail({
            to: normalizedEmail,
            subject: otpCopy.subject,
            text,
            html,
        });

        return {
            developmentOtp: null,
        };
    }

    if (isProductionEnvironment()) {
        const error = new Error(
            "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_FROM, and credentials before using email verification in production."
        );
        error.status = 500;
        throw error;
    }

    console.warn(`[OTP:${purpose}] ${normalizedEmail} -> ${otp}`);

    return {
        developmentOtp: otp,
    };
}

function buildOtpResponse({ challenge, email, message, developmentOtp }) {
    return {
        message,
        verification_token: challenge.publicToken,
        expires_in_seconds: OTP_EXPIRY_MINUTES * 60,
        delivery_channel: "email",
        delivery_target: maskEmail(email),
        ...(developmentOtp ? { development_otp: developmentOtp } : {}),
    };
}

function buildAuthResponse({ message, token, refreshToken, user }) {
    return {
        message,
        token,
        refresh_token: refreshToken,
        user,
    };
}

async function getUserById(userId) {
    const rows = await query(
        `
            SELECT
                uid,
                name,
                email,
                mobile,
                loyalty_points,
                DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS date_of_birth,
                COALESCE(gamer_tag, '') AS gamer_tag,
                COALESCE(favorite_game, '') AS favorite_game,
                COALESCE(player_bio, '') AS player_bio,
                avatar
            FROM users
            WHERE uid = ?
            LIMIT 1
        `,
        [userId]
    );

    if (!rows[0]) {
        return null;
    }

    const [enrichedUser] = await attachTournamentProfilesToUsers(rows);
    return normalizeUser(enrichedUser);
}

async function resetUserLoginProtection(userId) {
    await query(
        `
            UPDATE users
            SET
                failed_login_attempts = 0,
                last_failed_login_at = NULL,
                locked_until = NULL
            WHERE uid = ?
        `,
        [userId]
    );
}

async function findUserByEmail(email) {
    const rows = await query("SELECT * FROM users WHERE email = ? LIMIT 1", [
        normalizeEmail(email),
    ]);

    return rows[0] || null;
}

async function verifyAndUpgradeUserPassword(user, password) {
    const verification = await verifyPassword(password, user?.password);

    if (verification.matches && verification.needsRehash && user?.uid) {
        const upgradedHash = await hashPassword(password);
        await query("UPDATE users SET password = ? WHERE uid = ?", [upgradedHash, user.uid]);
        user.password = upgradedHash;
    }

    return verification.matches;
}

async function findDuplicateUser({ email, mobile, excludeUserId }) {
    const clauses = [];
    const values = [];

    if (email) {
        clauses.push("LOWER(email) = ?");
        values.push(normalizeEmail(email));
    }

    if (mobile) {
        clauses.push("mobile = ?");
        values.push(normalizeMobile(mobile));
    }

    if (clauses.length === 0) {
        return null;
    }

    let sql = `
        SELECT uid, email, mobile
        FROM users
        WHERE (${clauses.join(" OR ")})
    `;

    if (excludeUserId) {
        sql += " AND uid <> ?";
        values.push(excludeUserId);
    }

    sql += " LIMIT 1";

    const rows = await query(sql, values);
    return rows[0] || null;
}

function duplicateMessage(existingUser, { email, mobile }) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedMobile = normalizeMobile(mobile);
    const emailMatches = existingUser?.email
        ? normalizeEmail(existingUser.email) === normalizedEmail
        : false;
    const mobileMatches = existingUser?.mobile
        ? normalizeMobile(existingUser.mobile) === normalizedMobile
        : false;

    if (emailMatches && mobileMatches) {
        return "An account with this email and mobile number already exists.";
    }

    if (emailMatches) {
        return "This email is already registered.";
    }

    if (mobileMatches) {
        return "This mobile number is already registered.";
    }

    return "An account with these details already exists.";
}

async function handleRegistrationOtpRequest(req, res) {
    const { name, email, mobile, password } = req.body;
    const normalizedName = String(name || "").trim();
    const normalizedEmail = normalizeEmail(email);
    const normalizedMobile = normalizeMobile(mobile);
    const normalizedPassword = String(password || "").trim();

    if (!normalizedName || !normalizedEmail || !normalizedMobile || !normalizedPassword) {
        return res.status(400).json({ message: "All fields are required" });
    }

    if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({ message: "Please enter a valid email address." });
    }

    if (!isValidMobile(normalizedMobile)) {
        return res.status(400).json({ message: "Mobile number must be exactly 10 digits." });
    }

    if (!isStrongPassword(normalizedPassword)) {
        return res.status(400).json({
            message:
                "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
        });
    }

    try {
        const existingUser = await findDuplicateUser({
            email: normalizedEmail,
            mobile: normalizedMobile,
        });

        if (existingUser) {
            return res.status(400).json({
                message: duplicateMessage(existingUser, {
                    email: normalizedEmail,
                    mobile: normalizedMobile,
                }),
            });
        }

        const passwordHash = await hashPassword(normalizedPassword);
        const challenge = await createVerificationChallenge({
            purpose: REGISTRATION_PURPOSE,
            email: normalizedEmail,
            payload: {
                name: normalizedName,
                email: normalizedEmail,
                mobile: normalizedMobile,
                passwordHash,
            },
            expiresInMinutes: OTP_EXPIRY_MINUTES,
            maxAttempts: OTP_MAX_ATTEMPTS,
            resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
        });

        try {
            const delivery = await sendUserOtp({
                email: normalizedEmail,
                otp: challenge.otp,
                purpose: REGISTRATION_PURPOSE,
                name: normalizedName,
            });

            return res.json(
                buildOtpResponse({
                    challenge,
                    email: normalizedEmail,
                    message: `Verification code sent to ${maskEmail(normalizedEmail)}. Verify it to complete registration.`,
                    developmentOtp: delivery.developmentOtp,
                })
            );
        } catch (mailError) {
            await purgeVerificationChallenge(challenge.publicToken);
            throw mailError;
        }
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(400).json({
                message: "This email or mobile number is already registered.",
            });
        }

        res.status(error.status || 500).json({
            message: error.message || "Unable to send registration verification code",
        });
    }
}

// USER REGISTER
router.post("/register", otpRequestLimiter, handleRegistrationOtpRequest);
router.post("/register/request-otp", otpRequestLimiter, handleRegistrationOtpRequest);

router.post("/register/verify-otp", otpVerifyLimiter, async (req, res) => {
    const verificationToken = String(req.body.verification_token || "").trim();
    const otp = String(req.body.otp || "").trim();
    const normalizedEmail = normalizeEmail(req.body.email);

    if (!verificationToken || !otp || !normalizedEmail) {
        return res.status(400).json({
            message: "Verification token, email, and OTP are required.",
        });
    }

    try {
        const verification = await verifyChallenge({
            purpose: REGISTRATION_PURPOSE,
            publicToken: verificationToken,
            otp,
            email: normalizedEmail,
        });
        const payload = verification.payload || {};
        const registrationName = String(payload.name || "").trim();
        const registrationEmail = normalizeEmail(payload.email || verification.email);
        const registrationMobile = normalizeMobile(payload.mobile);
        const passwordHash = String(payload.passwordHash || "");

        if (!registrationName || !registrationEmail || !registrationMobile || !passwordHash) {
            return res.status(400).json({
                message: "Registration details are incomplete. Please request a new verification code.",
            });
        }

        const existingUser = await findDuplicateUser({
            email: registrationEmail,
            mobile: registrationMobile,
        });

        if (existingUser) {
            return res.status(400).json({
                message: duplicateMessage(existingUser, {
                    email: registrationEmail,
                    mobile: registrationMobile,
                }),
            });
        }

        await query(
            "INSERT INTO users (name, email, mobile, password) VALUES (?, ?, ?, ?)",
            [registrationName, registrationEmail, registrationMobile, passwordHash]
        );

        res.json({ message: "User registered successfully" });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(400).json({
                message: "This email or mobile number is already registered.",
            });
        }

        res.status(error.status || 500).json({
            message: error.message || "Unable to verify registration code",
        });
    }
});

// USER LOGIN
router.post("/login", authAttemptLimiter, async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await findUserByEmail(email);

        if (!user) {
            return res.status(400).json({ message: INVALID_LOGIN_MESSAGE });
        }

        const lockout = getLockoutState(user);

        if (lockout.locked) {
            return res.status(423).json({
                message: buildLockoutMessage({
                    actorLabel: "Account",
                    lockedUntil: lockout.lockedUntil,
                }),
            });
        }

        const match = await verifyAndUpgradeUserPassword(user, String(password || ""));

        if (!match) {
            const nextState = computeFailedLoginUpdate(user);

            await query(
                `
                    UPDATE users
                    SET
                        failed_login_attempts = ?,
                        last_failed_login_at = ?,
                        locked_until = ?
                    WHERE uid = ?
                `,
                [
                    nextState.failedLoginAttempts,
                    nextState.lastFailedLoginAt,
                    nextState.lockedUntil,
                    user.uid,
                ]
            );

            if (nextState.lockedNow) {
                return res.status(423).json({
                    message: buildLockoutMessage({
                        actorLabel: "Account",
                        lockedUntil: nextState.lockedUntil,
                    }),
                });
            }

            return res.status(400).json({ message: INVALID_LOGIN_MESSAGE });
        }

        if (
            Number(user.failed_login_attempts || 0) > 0 ||
            user.last_failed_login_at ||
            user.locked_until
        ) {
            await resetUserLoginProtection(user.uid);
        }

        const session = await createAuthSession({
            actorType: ACTOR_USER,
            actorId: user.uid,
            role: "user",
            ...getRequestSessionMetadata(req),
        });
        const authenticatedUser = await getUserById(user.uid);

        res.json(
            buildAuthResponse({
                message: "Login success",
                token: session.accessToken,
                refreshToken: session.refreshToken,
                user: authenticatedUser || normalizeUser(user),
            })
        );
    } catch (error) {
        res.status(500).json({ message: error.message || "Unable to login" });
    }
});

router.post("/refresh", async (req, res) => {
    const refreshToken = String(req.body.refresh_token || "").trim();

    if (!refreshToken) {
        return res.status(400).json({ message: "Refresh token is required." });
    }

    try {
        const session = await refreshAuthSession({
            actorType: ACTOR_USER,
            refreshToken,
            ...getRequestSessionMetadata(req),
            resolveTokenPayload: async ({ connection, actorId }) => {
                const [rows] = await connection.query(
                    "SELECT uid FROM users WHERE uid = ? LIMIT 1",
                    [actorId]
                );

                if (!rows[0]) {
                    return null;
                }

                return {
                    id: Number(rows[0].uid || 0),
                    role: "user",
                };
            },
        });
        const user = await getUserById(session.actorId);

        if (!user) {
            return res.status(401).json({ message: "User not found." });
        }

        res.json(
            buildAuthResponse({
                message: "Session refreshed",
                token: session.accessToken,
                refreshToken: session.refreshToken,
                user,
            })
        );
    } catch (error) {
        res.status(error.statusCode || error.status || 500).json({
            message: error.message || "Unable to refresh session",
        });
    }
});

router.get("/profile", auth, async (req, res) => {
    const userId = Number(req.user?.id || 0);

    if (!userId) {
        return res.status(401).json({ message: "User token required." });
    }

    try {
        const user = await getUserById(userId);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.json({ user });
    } catch (error) {
        return res.status(500).json({
            message: error.message || "Unable to load profile",
        });
    }
});

router.post("/logout", auth, async (req, res) => {
    try {
        await revokeAuthSession({
            actorType: ACTOR_USER,
            actorId: Number(req.user?.id || 0),
            sessionId: req.authSession?.session_id,
            reason: "user_logout",
        });

        res.json({ message: "Logged out successfully." });
    } catch (error) {
        res.status(error.statusCode || error.status || 500).json({
            message: error.message || "Unable to log out",
        });
    }
});

router.post("/forgot-password/request-otp", otpRequestLimiter, async (req, res) => {
    const normalizedEmail = normalizeEmail(req.body.email);
    const newPassword = String(req.body.new_password || "").trim();

    if (!normalizedEmail || !newPassword) {
        return res.status(400).json({
            message: "Email and new password are required.",
        });
    }

    if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({
            message: "Please enter a valid email address.",
        });
    }

    if (!isStrongPassword(newPassword)) {
        return res.status(400).json({
            message:
                "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
        });
    }

    try {
        const user = await findUserByEmail(normalizedEmail);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const matchesCurrentPassword = await verifyPassword(newPassword, user.password);

        if (matchesCurrentPassword.matches) {
            return res.status(400).json({
                message: "New password must be different from your current password.",
            });
        }

        const passwordHash = await hashPassword(newPassword);
        const challenge = await createVerificationChallenge({
            purpose: PASSWORD_RESET_PURPOSE,
            email: user.email,
            userId: user.uid,
            payload: {
                passwordHash,
            },
            expiresInMinutes: OTP_EXPIRY_MINUTES,
            maxAttempts: OTP_MAX_ATTEMPTS,
            resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
        });

        try {
            const delivery = await sendUserOtp({
                email: user.email,
                otp: challenge.otp,
                purpose: PASSWORD_RESET_PURPOSE,
                name: user.name,
            });

            return res.json(
                buildOtpResponse({
                    challenge,
                    email: user.email,
                    message: `Verification code sent to ${maskEmail(user.email)}. Verify it to reset your password.`,
                    developmentOtp: delivery.developmentOtp,
                })
            );
        } catch (mailError) {
            await purgeVerificationChallenge(challenge.publicToken);
            throw mailError;
        }
    } catch (error) {
        res.status(error.status || 500).json({
            message: error.message || "Unable to send password reset verification code",
        });
    }
});

router.post("/forgot-password/verify-otp", otpVerifyLimiter, async (req, res) => {
    const verificationToken = String(req.body.verification_token || "").trim();
    const otp = String(req.body.otp || "").trim();
    const normalizedEmail = normalizeEmail(req.body.email);

    if (!verificationToken || !otp || !normalizedEmail) {
        return res.status(400).json({
            message: "Verification token, email, and OTP are required.",
        });
    }

    try {
        const verification = await verifyChallenge({
            purpose: PASSWORD_RESET_PURPOSE,
            publicToken: verificationToken,
            otp,
            email: normalizedEmail,
        });
        const passwordHash = String(verification.payload?.passwordHash || "");
        const userId = Number(verification.userId || 0);

        if (!passwordHash || !userId) {
            return res.status(400).json({
                message:
                    "Password reset details are incomplete. Please request a new verification code.",
            });
        }

        const result = await query("UPDATE users SET password = ? WHERE uid = ?", [
            passwordHash,
            userId,
        ]);

        if (!result.affectedRows) {
            return res.status(404).json({ message: "User not found" });
        }

        await resetUserLoginProtection(userId);
        await revokeActorSessions({
            actorType: ACTOR_USER,
            actorId: userId,
            reason: "password_reset",
        });

        res.json({ message: "Password reset successfully" });
    } catch (error) {
        res.status(error.status || 500).json({
            message: error.message || "Unable to verify password reset code",
        });
    }
});

router.post("/password-change/request-otp", auth, otpRequestLimiter, async (req, res) => {
    const currentPassword = String(req.body.current_password || "");
    const newPassword = String(req.body.new_password || "").trim();
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            message: "Current password and new password are required.",
        });
    }

    if (!isStrongPassword(newPassword)) {
        return res.status(400).json({
            message:
                "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
        });
    }

    try {
        const rows = await query(
            "SELECT uid, name, email, password FROM users WHERE uid = ? LIMIT 1",
            [userId]
        );

        if (!rows[0]) {
            return res.status(404).json({ message: "User not found" });
        }

        const user = rows[0];
        const currentPasswordMatches = await verifyAndUpgradeUserPassword(user, currentPassword);

        if (!currentPasswordMatches) {
            return res.status(400).json({ message: "Current password is incorrect." });
        }

        const nextPasswordMatchesCurrent = await verifyPassword(newPassword, user.password);

        if (nextPasswordMatchesCurrent.matches) {
            return res.status(400).json({
                message: "New password must be different from your current password.",
            });
        }

        const passwordHash = await hashPassword(newPassword);
        const challenge = await createVerificationChallenge({
            purpose: PASSWORD_CHANGE_PURPOSE,
            email: user.email,
            userId,
            payload: {
                passwordHash,
            },
            expiresInMinutes: OTP_EXPIRY_MINUTES,
            maxAttempts: OTP_MAX_ATTEMPTS,
            resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
        });

        try {
            const delivery = await sendUserOtp({
                email: user.email,
                otp: challenge.otp,
                purpose: PASSWORD_CHANGE_PURPOSE,
                name: user.name,
            });

            return res.json(
                buildOtpResponse({
                    challenge,
                    email: user.email,
                    message: `Verification code sent to ${maskEmail(user.email)}. Verify it to change your password.`,
                    developmentOtp: delivery.developmentOtp,
                })
            );
        } catch (mailError) {
            await purgeVerificationChallenge(challenge.publicToken);
            throw mailError;
        }
    } catch (error) {
        res.status(error.status || 500).json({
            message: error.message || "Unable to send password change verification code",
        });
    }
});

router.post("/password-change/verify-otp", auth, otpVerifyLimiter, async (req, res) => {
    const verificationToken = String(req.body.verification_token || "").trim();
    const otp = String(req.body.otp || "").trim();
    const userId = req.user.id;

    if (!verificationToken || !otp) {
        return res.status(400).json({
            message: "Verification token and OTP are required.",
        });
    }

    try {
        const verification = await verifyChallenge({
            purpose: PASSWORD_CHANGE_PURPOSE,
            publicToken: verificationToken,
            otp,
            userId,
        });
        const passwordHash = String(verification.payload?.passwordHash || "");

        if (!passwordHash) {
            return res.status(400).json({
                message:
                    "Password change details are incomplete. Please request a new verification code.",
            });
        }

        const result = await query("UPDATE users SET password = ? WHERE uid = ?", [
            passwordHash,
            userId,
        ]);

        if (!result.affectedRows) {
            return res.status(404).json({ message: "User not found" });
        }

        await resetUserLoginProtection(userId);
        await revokeActorSessions({
            actorType: ACTOR_USER,
            actorId: userId,
            reason: "password_changed",
            excludeSessionId: req.authSession?.session_id || null,
        });

        res.json({
            message: "Password changed successfully",
            sessions_revoked: true,
        });
    } catch (error) {
        res.status(error.status || 500).json({
            message: error.message || "Unable to verify password change code",
        });
    }
});

// UPDATE USER PROFILE
router.put("/profile", auth, (req, res) => {
    uploadAvatar(req, res, async (uploadError) => {
        if (uploadError) {
            return res.status(400).json({
                message: uploadError.message || "Avatar upload failed",
            });
        }

        const {
            name,
            email,
            mobile,
            gamer_tag: gamerTag,
            favorite_game: favoriteGame,
            player_bio: playerBio,
            date_of_birth: dateOfBirth,
            remove_avatar: removeAvatar,
        } = req.body;
        const userId = req.user.id;
        const normalizedName = String(name || "").trim();
        const normalizedEmail = normalizeEmail(email);
        const normalizedMobile = normalizeMobile(mobile);
        const normalizedGamerTag = String(gamerTag || "").trim().slice(0, 64);
        const normalizedFavoriteGame = String(favoriteGame || "").trim().slice(0, 120);
        const normalizedPlayerBio = String(playerBio || "").trim().slice(0, 500);
        const birthdayRequested = Object.hasOwn(req.body || {}, "date_of_birth");
        const normalizedBirthday = normalizeDateOfBirth(dateOfBirth);
        const removeAvatarRequested =
            removeAvatar === true || removeAvatar === "true" || removeAvatar === "1";

        if (!normalizedName || !normalizedEmail || !normalizedMobile) {
            return res.status(400).json({ message: "Name, email, and mobile are required" });
        }

        if (!isValidEmail(normalizedEmail)) {
            return res.status(400).json({ message: "Please enter a valid email address." });
        }

        if (!isValidMobile(normalizedMobile)) {
            return res.status(400).json({ message: "Mobile number must be exactly 10 digits." });
        }

        if (birthdayRequested && dateOfBirth && !normalizedBirthday) {
            return res.status(400).json({ message: "Enter a valid birthday." });
        }

        if (normalizedBirthday && !isValidDateOfBirth(normalizedBirthday)) {
            return res.status(400).json({
                message: "Birthday rewards are available to players aged 13 and older.",
            });
        }

        let storedAvatar = null;

        try {
            const existingUser = await findDuplicateUser({
                email: normalizedEmail,
                mobile: normalizedMobile,
                excludeUserId: userId,
            });

            if (existingUser) {
                return res.status(400).json({
                    message: duplicateMessage(existingUser, {
                        email: normalizedEmail,
                        mobile: normalizedMobile,
                    }),
                });
            }

            const currentUser = await getUserById(userId);

            if (!currentUser) {
                return res.status(404).json({ message: "User not found" });
            }

            const currentBirthday = currentUser.date_of_birth || "";
            if (
                birthdayRequested &&
                ((currentBirthday && normalizedBirthday !== currentBirthday) ||
                    (!currentBirthday && dateOfBirth && !normalizedBirthday))
            ) {
                return res.status(409).json({
                    message: "A birthday can only be set once. Contact support if it needs correction.",
                });
            }

            const fields = ["name = ?", "email = ?", "mobile = ?"];
            const values = [
                normalizedName,
                normalizedEmail,
                normalizedMobile,
            ];

            fields.push("gamer_tag = ?", "favorite_game = ?", "player_bio = ?");
            values.push(
                normalizedGamerTag || null,
                normalizedFavoriteGame || null,
                normalizedPlayerBio || null
            );

            const settingBirthday = !currentBirthday && Boolean(normalizedBirthday);
            if (settingBirthday) {
                fields.push("date_of_birth = ?");
                values.push(normalizedBirthday);
            }

            if (req.file) {
                storedAvatar = await persistUploadedFile(req.file, {
                    folder: "avatars",
                    allowedMimeTypes: IMAGE_UPLOAD_MIME_TYPES,
                });
                fields.push("avatar = ?");
                values.push(storedAvatar);
            } else if (removeAvatarRequested) {
                fields.push("avatar = NULL");
            }

            values.push(userId);

            const updateResult = await query(
                `UPDATE users SET ${fields.join(", ")} WHERE uid = ?${settingBirthday ? " AND date_of_birth IS NULL" : ""}`,
                values
            );
            if (settingBirthday && Number(updateResult?.affectedRows || 0) === 0) {
                if (storedAvatar) {
                    try {
                        await deleteStoredFile(storedAvatar);
                    } catch (_) {
                        // A stale avatar upload must not hide the birthday conflict.
                    }
                }
                return res.status(409).json({
                    message: "A birthday can only be set once. Contact support if it needs correction.",
                });
            }

            const updatedUser = await getUserById(userId);

            if (!updatedUser) {
                return res.status(404).json({ message: "User not found" });
            }

            if (
                currentUser.avatar &&
                ((storedAvatar && currentUser.avatar !== storedAvatar) || removeAvatarRequested)
            ) {
                try {
                    await deleteStoredFile(currentUser.avatar);
                } catch (cleanupError) {
                    console.warn("Failed to clean up previous avatar:", cleanupError);
                }
            }

            res.json({
                message: "Profile updated successfully",
                user: updatedUser,
            });
        } catch (error) {
            if (storedAvatar) {
                try {
                    await deleteStoredFile(storedAvatar);
                } catch (cleanupError) {
                    console.warn("Failed to clean up avatar after update error:", cleanupError);
                }
            }

            if (error.code === "ER_DUP_ENTRY") {
                return res.status(400).json({ message: "Email already exists" });
            }

            res.status(500).json({
                message:
                    error.message ||
                    "Unable to update profile. Run the latest backend migrations and try again.",
            });
        }
    });
});

module.exports = router;
