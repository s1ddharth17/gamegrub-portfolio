const { ACTOR_USER, getActiveAuthSession } = require("../utils/authSessions");
const { verifyToken } = require("../utils/security");

module.exports = async (req, res, next) => {
    const authorization = req.headers["authorization"];

    if (!authorization) {
        return res.status(401).json({ message: "No token" });
    }

    const token = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : authorization;
    if (!token) return res.status(401).json({ message: "No token" });

    try {
        const decoded = verifyToken(token);
        const userId = Number(decoded?.id || 0);
        const sessionId = String(decoded?.sid || "").trim();

        if (String(decoded?.role || "").trim() !== "user") {
            return res.status(403).json({ message: "User access denied" });
        }

        if (!userId || !sessionId) {
            return res.status(401).json({ message: "Session expired" });
        }

        const session = await getActiveAuthSession({
            actorType: ACTOR_USER,
            actorId: userId,
            sessionId,
        });

        if (!session) {
            return res.status(401).json({ message: "Session expired" });
        }

        req.user = decoded;
        req.authSession = session;
        next();
    } catch (_) {
        return res.status(401).json({ message: "Invalid token" });
    }
};
