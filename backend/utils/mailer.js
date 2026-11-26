const nodemailer = require("nodemailer");

let cachedTransporter = null;
let cachedSignature = null;

function parseBoolean(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
}

function getMailConfig() {
    const host = String(process.env.SMTP_HOST || "").trim();
    const portValue = String(process.env.SMTP_PORT || "").trim();
    const port = Number(portValue || 0);
    const user = String(process.env.SMTP_USER || "").trim();
    const pass = String(process.env.SMTP_PASS || "");
    const from = String(process.env.SMTP_FROM || user || "").trim();
    const secure =
        parseBoolean(process.env.SMTP_SECURE) || (!Number.isNaN(port) && port === 465);

    return {
        configured: Boolean(host && port && from),
        host,
        port,
        user,
        pass,
        from,
        secure,
    };
}

function getTransporter() {
    const config = getMailConfig();

    if (!config.configured) {
        return null;
    }

    const signature = JSON.stringify({
        host: config.host,
        port: config.port,
        user: config.user,
        secure: config.secure,
        hasPassword: Boolean(config.pass),
    });

    if (!cachedTransporter || cachedSignature !== signature) {
        const transportOptions = {
            host: config.host,
            port: config.port,
            secure: config.secure,
        };

        if (config.user) {
            transportOptions.auth = {
                user: config.user,
                pass: config.pass,
            };
        }

        cachedTransporter = nodemailer.createTransport(transportOptions);
        cachedSignature = signature;
    }

    return cachedTransporter;
}

function isMailConfigured() {
    return getMailConfig().configured;
}

async function sendMail({ to, subject, text, html }) {
    const config = getMailConfig();
    const transporter = getTransporter();

    if (!config.configured || !transporter) {
        const error = new Error("SMTP is not configured.");
        error.code = "SMTP_NOT_CONFIGURED";
        throw error;
    }

    await transporter.sendMail({
        from: config.from,
        to,
        subject,
        text,
        html,
    });
}

module.exports = {
    isMailConfigured,
    sendMail,
};
