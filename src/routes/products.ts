import { Router } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma";
import { validateUUIDParams, validateBody, param } from "../middleware/validate";
import { createProductSchema, updateProductSchema } from "../schemas/product";

const PRODUCT_SELECT = {
  id: true,
  productName: true,
  sku: true,
  price: true,
  description: true,
  lowStockThreshold: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Mounted at /companies/:companyId/products */
const router = Router({ mergeParams: true });

/** POST / — Create a product */
router.post("/", validateBody(createProductSchema), async (req, res) => {
  const companyId = param(req, "companyId");
  const { productName, sku, price, description, lowStockThreshold } = req.body;

  try {
    const product = await prisma.product.create({
      data: {
        companyId,
        productName,
        sku,
        price,
        description: description ?? null,
        ...(lowStockThreshold !== undefined && { lowStockThreshold }),
      },
      select: PRODUCT_SELECT,
    });

    res.status(201).json(product);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const target = String(err.meta?.target ?? "");
      if (target.includes("sku")) {
        res
          .status(409)
          .json({ error: "A product with this SKU already exists in this company." });
        return;
      }
      if (target.includes("product_name")) {
        res
          .status(409)
          .json({ error: "A product with this name already exists in this company." });
        return;
      }
      res.status(409).json({ error: "Duplicate product." });
      return;
    }
    throw err;
  }
});

/** GET / — List products for a company (excludes archived by default) */
router.get("/", validateUUIDParams("companyId"), async (req, res) => {
  const includeArchived = req.query.archived === "true";

  const products = await prisma.product.findMany({
    where: {
      companyId: param(req, "companyId"),
      ...(!includeArchived && { archivedAt: null }),
    },
    orderBy: { productName: "asc" },
    select: PRODUCT_SELECT,
  });
  res.json(products);
});

/** GET /:productId — Get a single product with inventory summary */
router.get(
  "/:productId",
  validateUUIDParams("companyId", "productId"),
  async (req, res) => {
    const product = await prisma.product.findFirst({
      where: {
        id: param(req, "productId"),
        companyId: param(req, "companyId"),
      },
      select: {
        ...PRODUCT_SELECT,
        inventories: {
          select: {
            id: true,
            quantity: true,
            site: {
              select: {
                id: true,
                address: true,
                siteType: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(product);
  }
);

/** PATCH /:productId — Update a product (owner/manager only) */
router.patch(
  "/:productId",
  validateUUIDParams("companyId", "productId"),
  validateBody(updateProductSchema),
  async (req, res) => {
    if (req.employee?.role === "staff") {
      res.status(403).json({ error: "Only owners and managers can edit products." });
      return;
    }

    const companyId = param(req, "companyId");
    const productId = param(req, "productId");
    const { productName, sku, price, description, lowStockThreshold, archivedAt } = req.body;

    const existing = await prisma.product.findFirst({
      where: { id: productId, companyId },
      select: { id: true },
    });

    if (!existing) {
      res.status(404).json({ error: "Product not found." });
      return;
    }

    const data: Record<string, unknown> = {};
    if (productName !== undefined) data.productName = productName;
    if (sku !== undefined) data.sku = sku;
    if (price !== undefined) data.price = price;
    if (description !== undefined) data.description = description;
    if (lowStockThreshold !== undefined) data.lowStockThreshold = lowStockThreshold;
    if (archivedAt !== undefined) {
      data.archivedAt = archivedAt ? new Date(archivedAt) : null;
    }

    try {
      const product = await prisma.product.update({
        where: { id: productId },
        data,
        select: PRODUCT_SELECT,
      });

      res.json(product);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const target = String(err.meta?.target ?? "");
        if (target.includes("sku")) {
          res
            .status(409)
            .json({ error: "A product with this SKU already exists in this company." });
          return;
        }
        if (target.includes("product_name")) {
          res
            .status(409)
            .json({ error: "A product with this name already exists in this company." });
          return;
        }
        res.status(409).json({ error: "Duplicate product." });
        return;
      }
      throw err;
    }
  }
);

/** DELETE /:productId — Delete a product (owner/manager only, no inventory) */
router.delete(
  "/:productId",
  validateUUIDParams("companyId", "productId"),
  async (req, res) => {
    if (req.employee?.role === "staff") {
      res.status(403).json({ error: "Only owners and managers can delete products." });
      return;
    }

    const companyId = param(req, "companyId");
    const productId = param(req, "productId");

    const product = await prisma.product.findFirst({
      where: { id: productId, companyId },
      select: {
        id: true,
        _count: { select: { inventories: true } },
      },
    });

    if (!product) {
      res.status(404).json({ error: "Product not found." });
      return;
    }

    if (product._count.inventories > 0) {
      res.status(409).json({
        error:
          "This product has inventory records and cannot be deleted. You can archive it instead.",
        code: "HAS_INVENTORY",
      });
      return;
    }

    await prisma.product.delete({ where: { id: productId } });
    res.status(204).end();
  }
);

export default router;
