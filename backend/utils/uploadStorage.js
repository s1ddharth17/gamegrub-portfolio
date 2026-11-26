const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const { PutObjectCommand, DeleteObjectCommand, S3Client } = require("@aws-sdk/client-s3");

const DEFAULT_UPLOADS_DIR = "uploads";
const IMAGE_UPLOAD_MIME_TYPES = Object.freeze([
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/webp",
]);
const IMAGE_UPLOAD_EXTENSIONS = Object.freeze({
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
});
const OCTET_STREAM_MIME_TYPE = "application/octet-stream";
let cachedS3Client = null;

function normalizeMode(value) {
    const normalized = String(value || "local").trim().toLowerCase();
    return normalized === "s3" ? "s3" : "local";
}

function trimSlashes(value) {
    return String(value || "").replace(/^\/+|\/+$/g, "");
}

function parseBoolean(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
}

function getUploadStorageMode() {
    return normalizeMode(process.env.UPLOAD_STORAGE);
}

function getUploadsRoot() {
    return path.resolve(
        __dirname,
        "..",
        String(process.env.UPLOADS_DIR || DEFAULT_UPLOADS_DIR).trim() || DEFAULT_UPLOADS_DIR
    );
}

function getAwsRegion() {
    return String(process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "").trim();
}

function getS3BucketName() {
    return String(process.env.S3_BUCKET_NAME || "").trim();
}

function getS3KeyPrefix() {
    return trimSlashes(process.env.S3_KEY_PREFIX);
}

function ensureUploadStorageReady() {
    if (getUploadStorageMode() === "s3") {
        if (!getAwsRegion() || !getS3BucketName()) {
            throw new Error(
                "S3 uploads require both AWS_REGION and S3_BUCKET_NAME to be configured."
            );
        }
        return;
    }

    fs.mkdirSync(getUploadsRoot(), { recursive: true });
}

function getS3Client() {
    if (!cachedS3Client) {
        cachedS3Client = new S3Client({
            region: getAwsRegion(),
        });
    }

    return cachedS3Client;
}

function encodeKey(key) {
    return encodeURIComponent(String(key || "")).replace(/%2F/g, "/");
}

function buildPublicUploadUrl(key) {
    const normalizedKey = trimSlashes(key);
    const configuredBase = String(process.env.UPLOAD_PUBLIC_BASE_URL || "")
        .trim()
        .replace(/\/+$/g, "");

    if (configuredBase) {
        return `${configuredBase}/${encodeKey(normalizedKey)}`;
    }

    if (getUploadStorageMode() !== "s3") {
        return "";
    }

    const region = getAwsRegion();
    const bucket = getS3BucketName();

    if (!bucket || !region) {
        return "";
    }

    const host =
        region === "us-east-1"
            ? `https://${bucket}.s3.amazonaws.com`
            : `https://${bucket}.s3.${region}.amazonaws.com`;

    return `${host}/${encodeKey(normalizedKey)}`;
}

function createUploadsMiddleware() {
    if (getUploadStorageMode() === "s3") {
        return (req, res) => {
            const key = trimSlashes(req.path);
            const publicUrl = buildPublicUploadUrl(key);

            if (!key) {
                return res.status(404).json({ message: "Upload not found." });
            }

            if (!publicUrl) {
                return res.status(500).json({
                    message:
                        "Upload public base URL is not configured. Set UPLOAD_PUBLIC_BASE_URL for S3 uploads.",
                });
            }

            return res.redirect(publicUrl);
        };
    }

    return express.static(getUploadsRoot(), {
        fallthrough: false,
        maxAge: "7d",
    });
}

function buildSafeFileName(originalName, fallbackBaseName = "upload", preferredExtension = "") {
    const trimmedOriginal = String(originalName || "").trim();
    const originalExtension = path.extname(trimmedOriginal);
    const safeExtension = String(preferredExtension || originalExtension)
        .replace(/[^\w.]/g, "")
        .slice(0, 10)
        .toLowerCase();
    const baseName = path.basename(trimmedOriginal, originalExtension);
    const safeBaseName = String(baseName || fallbackBaseName)
        .replace(/[^\w-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80);
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return `${suffix}_${safeBaseName || fallbackBaseName}${safeExtension}`;
}

function buildStorageKey(folder, fileName) {
    const prefix = getUploadStorageMode() === "s3" ? getS3KeyPrefix() : "";

    return [prefix, trimSlashes(folder), trimSlashes(fileName)]
        .filter(Boolean)
        .join("/");
}

function normalizeAllowedMimeTypes(allowedMimeTypes) {
    return new Set(
        (Array.isArray(allowedMimeTypes) ? allowedMimeTypes : [])
            .map((mimeType) => String(mimeType || "").trim().toLowerCase())
            .filter(Boolean)
    );
}

function hasImageUploadMimeTypes(allowedMimeTypes) {
    return IMAGE_UPLOAD_MIME_TYPES.some((mimeType) => allowedMimeTypes.has(mimeType));
}

function createUploadTypeError(message) {
    const error = new Error(message);
    error.code = "LIMIT_UNEXPECTED_FILE";
    error.status = 400;
    error.statusCode = 400;
    return error;
}

function detectImageMimeType(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
        return "";
    }

    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return "image/jpeg";
    }

    if (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
    ) {
        return "image/png";
    }

    const gifHeader = buffer.subarray(0, 6).toString("ascii");
    if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
        return "image/gif";
    }

    if (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
        return "image/webp";
    }

    return "";
}

function validateUploadedFile(file, allowedMimeTypes) {
    const allowed = normalizeAllowedMimeTypes(allowedMimeTypes);

    if (!allowed.size || !file) {
        return "";
    }

    const declaredMimeType = String(file.mimetype || "").trim().toLowerCase();
    const permitsImages = hasImageUploadMimeTypes(allowed);
    const declaredMimeTypeAllowed =
        allowed.has(declaredMimeType) ||
        (permitsImages && (!declaredMimeType || declaredMimeType === OCTET_STREAM_MIME_TYPE));

    if (!declaredMimeTypeAllowed) {
        throw createUploadTypeError("Unsupported file type. Upload a JPEG, PNG, WebP, or GIF image.");
    }

    if (permitsImages) {
        const detectedMimeType = detectImageMimeType(file.buffer);

        if (!detectedMimeType || !allowed.has(detectedMimeType)) {
            throw createUploadTypeError("Uploaded file content does not match an allowed image type.");
        }

        if (
            declaredMimeType &&
            declaredMimeType !== OCTET_STREAM_MIME_TYPE &&
            declaredMimeType !== detectedMimeType
        ) {
            throw createUploadTypeError("Uploaded file content does not match its declared image type.");
        }

        return detectedMimeType;
    }

    return declaredMimeType;
}

function createUploadMiddleware({
    maxFileSizeBytes = 5 * 1024 * 1024,
    allowedMimeTypes = [],
} = {}) {
    const allowed = normalizeAllowedMimeTypes(allowedMimeTypes);
    const permitsImages = hasImageUploadMimeTypes(allowed);

    return multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: maxFileSizeBytes,
        },
        fileFilter(req, file, callback) {
            if (!allowed.size) {
                return callback(null, true);
            }

            const declaredMimeType = String(file?.mimetype || "").trim().toLowerCase();
            if (
                allowed.has(declaredMimeType) ||
                (permitsImages && (!declaredMimeType || declaredMimeType === OCTET_STREAM_MIME_TYPE))
            ) {
                return callback(null, true);
            }

            return callback(
                createUploadTypeError("Unsupported file type. Upload a JPEG, PNG, WebP, or GIF image.")
            );
        },
    });
}

async function persistUploadedFile(
    file,
    { folder = "", fallbackBaseName = "upload", allowedMimeTypes = [] } = {}
) {
    if (!file || !file.buffer?.length) {
        return null;
    }

    const detectedMimeType = validateUploadedFile(file, allowedMimeTypes);
    const fileName = buildSafeFileName(
        file.originalname,
        fallbackBaseName,
        IMAGE_UPLOAD_EXTENSIONS[detectedMimeType] || ""
    );
    const storageKey = buildStorageKey(folder, fileName);
    const contentType = detectedMimeType || file.mimetype || "application/octet-stream";

    if (getUploadStorageMode() === "s3") {
        await getS3Client().send(
            new PutObjectCommand({
                Bucket: getS3BucketName(),
                Key: storageKey,
                Body: file.buffer,
                ContentType: contentType,
                CacheControl: "public, max-age=31536000, immutable",
            })
        );

        return storageKey;
    }

    const localTarget = path.join(getUploadsRoot(), ...storageKey.split("/"));
    await fs.promises.mkdir(path.dirname(localTarget), { recursive: true });
    await fs.promises.writeFile(localTarget, file.buffer);

    return storageKey;
}

function isExternalReference(reference) {
    return /^https?:\/\//i.test(String(reference || "").trim());
}

async function deleteStoredFile(reference) {
    const normalizedReference = trimSlashes(reference);

    if (!normalizedReference || isExternalReference(normalizedReference)) {
        return;
    }

    if (getUploadStorageMode() === "s3") {
        await getS3Client().send(
            new DeleteObjectCommand({
                Bucket: getS3BucketName(),
                Key: normalizedReference,
            })
        );
        return;
    }

    const localPath = path.resolve(getUploadsRoot(), normalizedReference);
    const relativePath = path.relative(getUploadsRoot(), localPath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        return;
    }

    await fs.promises.rm(localPath, { force: true });
}

module.exports = {
    IMAGE_UPLOAD_MIME_TYPES,
    buildPublicUploadUrl,
    createUploadMiddleware,
    createUploadsMiddleware,
    deleteStoredFile,
    ensureUploadStorageReady,
    getUploadStorageMode,
    persistUploadedFile,
};
