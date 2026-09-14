const ImageKit = require("imagekit");
const { config } = require("../config");

let client = null;

// Throws when ImageKit is not configured so callers can fall back to local
// disk storage instead of failing the upload.
function isImageKitConfigured() {
  return Boolean(
    config.imageKit.publicKey &&
    config.imageKit.privateKey &&
    config.imageKit.urlEndpoint
  );
}

function getImageKit() {
  if (!isImageKitConfigured()) {
    const err = new Error("ImageKit is not configured");
    err.code = "IMAGEKIT_NOT_CONFIGURED";
    throw err;
  }
  if (!client) {
    client = new ImageKit({
      publicKey: config.imageKit.publicKey,
      privateKey: config.imageKit.privateKey,
      urlEndpoint: config.imageKit.urlEndpoint,
    });
  }
  return client;
}

async function uploadReportFile({ name, buffer, contentType }) {
  const ik = getImageKit();
  try {
    const result = await ik.upload({
      file: buffer,
      fileName: name,
      folder: "/reports",
      useUniqueFileName: true,
      ...(contentType ? { options: { metadata: { contentType } } } : {}),
    });
    return { fileId: result.fileId, url: result.url, size: result.size };
  } catch (e) {
    console.warn("[imagekit] upload failed:", e.message);
    return null;
  }
}

async function deleteReportFile(fileId) {
  if (!fileId) return false;
  const ik = getImageKit();
  try {
    await ik.deleteFile(fileId);
    return true;
  } catch (e) {
    console.warn("[imagekit] delete failed:", e.message);
    return false;
  }
}

module.exports = { isImageKitConfigured, getImageKit, uploadReportFile, deleteReportFile };