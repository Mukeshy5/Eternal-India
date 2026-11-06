import multer from "multer";
import { ObjectId } from "mongodb";
import { promotionTargets } from "../../shared/travelCatalog.js";

const targetIds = new Set(promotionTargets.map((target) => target.id));
const imagePath = /^\/api\/offer-images\/([a-f\d]{24})$/i;
const maxImageBytes = 2 * 1024 * 1024;
const publicCacheTtl = 30000;

function money(value) {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100000000 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) return NaN;
  return Math.round(value * 100) / 100;
}

export function validatePromotion(body) {
  const amount = money(body?.amount);
  const offerAmount = money(body?.offerAmount);
  const errors = {};
  if (Number.isNaN(amount)) errors.amount = "Enter an amount between 0 and 100,000,000 with up to two decimal places.";
  if (Number.isNaN(offerAmount) || (offerAmount !== null && (amount === null || offerAmount >= amount))) errors.offerAmount = "The offer amount must be lower than the package amount.";
  if (typeof body?.offerTitle !== "string" || body.offerTitle.trim().length > 80) errors.offerTitle = "Use an offer title of up to 80 characters.";
  if (typeof body?.offerEnabled !== "boolean") errors.offerEnabled = "Choose whether the offer is enabled.";
  const offerTitle = typeof body?.offerTitle === "string" ? body.offerTitle.trim() : "";
  if (body?.offerEnabled && !offerTitle) errors.offerTitle = "Add a title before enabling the offer.";
  const offerType = body?.offerType === "text" ? "text" : "image";
  const offerText = typeof body?.offerText === "string" ? body.offerText.trim() : "";
  if (typeof body?.offerImage !== "string" || (body.offerImage !== "" && !imagePath.test(body.offerImage))) errors.offerImage = "Upload a valid offer image.";
  if (offerType === "text" && (!offerText || offerText.length > 120)) errors.offerText = "Enter offer text up to 120 characters.";
  return { errors, promotion: { amount, offerAmount, offerEnabled: body?.offerEnabled, offerTitle, offerImage: body?.offerImage, offerType, offerText } };
}

function imageType(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) return "image/gif";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export function registerPromotions({ app, management, db, requireAdmin }) {
  const projection = { amount: 1, offerAmount: 1, offerEnabled: 1, offerTitle: 1, offerImage: 1, offerType: 1, offerText: 1, updatedAt: 1 };
  let publicCache = null;
  let publicCacheExpires = 0;
  const list = async () => (await db.collection("tour_promotions").find({}, { projection }).toArray()).map(({ _id, ...promotion }) => ({ targetId: _id, ...promotion }));
  app.get("/api/promotions", async (_req, res) => {
    const now = Date.now();
    if (!publicCache || now >= publicCacheExpires) {
      const promotions = (await list()).map((promotion) => promotion.offerEnabled ? promotion : { ...promotion, offerTitle: "", offerImage: "", offerAmount: null });
      publicCache = promotions;
      publicCacheExpires = now + publicCacheTtl;
    }
    const promotions = publicCache;
    res.json({ promotions });
  });
  app.get("/api/offer-images/:id", async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ message: "Offer image not found." });
    const image = await db.collection("offer_images").findOne({ _id: new ObjectId(req.params.id) });
    if (!image) return res.status(404).json({ message: "Offer image not found." });
    res.set({ "Content-Type": image.contentType, "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" }).send(Buffer.from(image.data.buffer));
  });
  management.get("/promotions", requireAdmin, async (_req, res) => res.json({ targets: promotionTargets, promotions: await list() }));
  management.patch("/promotions/:targetId", requireAdmin, async (req, res) => {
    if (!targetIds.has(req.params.targetId)) return res.status(404).json({ message: "Choose an existing tour or place." });
    const { errors, promotion } = validatePromotion(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ message: "Please check the amount and offer details.", errors });
    if (promotion.offerImage && !await db.collection("offer_images").findOne({ _id: new ObjectId(promotion.offerImage.match(imagePath)[1]) }, { projection: { _id: 1 } })) return res.status(400).json({ message: "This offer image is unavailable. Upload it again." });
    const saved = { ...promotion, updatedAt: new Date() };
    await db.collection("tour_promotions").updateOne({ _id: req.params.targetId }, { $set: { ...saved, updatedBy: req.admin._id } }, { upsert: true });
    publicCache = null;
    res.json({ promotion: { targetId: req.params.targetId, ...saved } });
  });
  management.delete("/promotions/:targetId", requireAdmin, async (req, res) => {
    if (!targetIds.has(req.params.targetId)) return res.status(404).json({ message: "Choose an existing tour or place." });
    await db.collection("tour_promotions").deleteOne({ _id: req.params.targetId });
    publicCache = null;
    res.sendStatus(204);
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxImageBytes, files: 1, fields: 0, parts: 1 } }).single("image");
  management.post("/offer-images", requireAdmin, (req, res, next) => {
    upload(req, res, (error) => {
      if (error) return res.status(400).json({ message: "Upload one JPG, PNG, WebP or GIF image up to 2 MB." });
      next();
    });
  }, async (req, res) => {
    const contentType = req.file && imageType(req.file.buffer);
    if (!contentType) return res.status(400).json({ message: "Choose a JPG, PNG, WebP or GIF image." });
    const result = await db.collection("offer_images").insertOne({ data: req.file.buffer, contentType, createdAt: new Date(), uploadedBy: req.admin._id });
    res.status(201).json({ image: `/api/offer-images/${result.insertedId}` });
  });
}
