const mysql = require("mysql2");

function parseBoolean(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
}

function parseNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildPoolConfig() {
    const connectionLimit = parseNumber(process.env.DB_CONNECTION_LIMIT, 10);

    if (String(process.env.DATABASE_URL || "").trim()) {
        return process.env.DATABASE_URL;
    }

    const config = {
        host: String(process.env.DB_HOST || "localhost").trim(),
        port: parseNumber(process.env.DB_PORT, 3306),
        user: String(process.env.DB_USER || "root").trim(),
        password: String(process.env.DB_PASSWORD || ""),
        database: String(process.env.DB_NAME || "gamegrub2").trim(),
        waitForConnections: true,
        connectionLimit,
        queueLimit: 0,
    };

    if (parseBoolean(process.env.DB_SSL)) {
        config.ssl = {
            rejectUnauthorized: parseBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED),
        };

        if (String(process.env.DB_SSL_CA || "").trim()) {
            config.ssl.ca = String(process.env.DB_SSL_CA).replace(/\\n/g, "\n");
        }
    }

    return config;
}

const db = mysql.createPool(buildPoolConfig());

module.exports = db;
