const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  IMAGE_UPLOAD_MIME_TYPES,
  persistUploadedFile,
} = require("../utils/uploadStorage");

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

function restoreProcessEnv(snapshot) {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, snapshot);
}

test(
  "image uploads are verified by content and stored with a safe extension",
  { concurrency: false },
  async (t) => {
    const envSnapshot = { ...process.env };
    const uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gamegrub-uploads-"));

    process.env.UPLOAD_STORAGE = "local";
    process.env.UPLOADS_DIR = uploadsDir;

    t.after(async () => {
      restoreProcessEnv(envSnapshot);
      await fs.rm(uploadsDir, { recursive: true, force: true });
    });

    const key = await persistUploadedFile(
      {
        buffer: PNG_BYTES,
        mimetype: "application/octet-stream",
        originalname: "avatar.php",
      },
      {
        folder: "avatars",
        allowedMimeTypes: IMAGE_UPLOAD_MIME_TYPES,
      }
    );

    assert.match(key, /^avatars\/\d+_[a-z0-9]+_avatar\.png$/);
    await assert.doesNotReject(fs.access(path.join(uploadsDir, key)));
  }
);

test("image uploads reject mismatched file content", async () => {
  await assert.rejects(
    persistUploadedFile(
      {
        buffer: Buffer.from("not really a png"),
        mimetype: "image/png",
        originalname: "avatar.png",
      },
      {
        folder: "avatars",
        allowedMimeTypes: IMAGE_UPLOAD_MIME_TYPES,
      }
    ),
    /does not match an allowed image type/i
  );
});`n`n