import { Router } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma";
import { validateUUIDParams, validateBody, param } from "../middleware/validate";
import { createProductSchema } from "../schemas/product";

/** Mounted at /companies/:companyId/products */
const router = Router({ mergeParams: true });

/** POST / — Create a product */
router.post("/", validateBody(createProductSchema), async (req, res) => {
  const companyId = param(req, "companyId");
  const { productName, sku, price, description } = req.body;

  try {
    const product = await prisma.product.create({
      data: {
        companyId,
        productName,
        sku,
        price,
        description: description ?? null,
      },
      select: {
        id: true,
        productName: true,
        sku: true,
        price: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json(product);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const target = (err.meta?.target as string[]) ?? [];
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

/** GET / — List products for a company */
router.get("/", validateUUIDParams("companyId"), async (req, res) => {
  const products = await prisma.product.findMany({
    where: { companyId: param(req, "companyId") },
    orderBy: { productName: "asc" },
    select: {
      id: true,
      productName: true,
      sku: true,
      price: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
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
        id: true,
        productName: true,
        sku: true,
        price: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        inventories: {
          select: {
            id: true,
            quantity: true,
            location: {
              select: {
                id: true,
                address: true,
                locationType: true,
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

export default router;
