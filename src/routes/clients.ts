import { Router } from "express";
import { prisma } from "../lib/prisma";
import {
  validateBody,
  validateQuery,
  validateUUIDParams,
  param,
} from "../middleware/validate";
import {
  createClientSchema,
  updateClientSchema,
  clientsQuerySchema,
  paginatedClientsQuerySchema,
} from "../schemas/client";

const router = Router({ mergeParams: true });

const clientSelect = {
  id: true,
  businessName: true,
  businessStoreId: true,
  address: true,
  pointOfContactName: true,
  phoneNumber: true,
  email: true,
  preferredPaymentMethod: true,
  paymentPreference: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function canManageClients(role: string | undefined) {
  return role === "owner" || role === "manager";
}

router.post("/", validateBody(createClientSchema), async (req, res) => {
  if (!canManageClients(req.employee?.role)) {
    res.status(403).json({ error: "Only owners and managers can create clients." });
    return;
  }

  try {
    const client = await prisma.client.create({
      data: {
        companyId: param(req, "companyId"),
        ...req.body,
      },
      select: clientSelect,
    });
    res.status(201).json(client);
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "A client with this business/store ID already exists." });
      return;
    }
    throw error;
  }
});

router.get("/", validateQuery(clientsQuerySchema), async (req, res) => {
  const companyId = param(req, "companyId");
  const { businessStoreId, archived } = (req.validatedQuery ?? {}) as {
    businessStoreId?: string;
    archived?: boolean;
  };

  const clients = await prisma.client.findMany({
    where: {
      companyId,
      archivedAt: archived ? { not: null } : null,
      ...(businessStoreId
        ? {
            businessStoreId: {
              contains: businessStoreId,
              mode: "insensitive",
            },
          }
        : {}),
    },
    orderBy: [{ businessStoreId: "asc" }, { businessName: "asc" }],
    select: clientSelect,
  });

  res.json(clients);
});

router.get("/paginated", validateQuery(paginatedClientsQuerySchema), async (req, res) => {
  const companyId = param(req, "companyId");
  const { page, limit, q, businessStoreId, archived } = (req.validatedQuery ?? {}) as {
    page: number;
    limit: number;
    q?: string;
    businessStoreId?: string;
    archived?: boolean;
  };

  const where = {
    companyId,
    archivedAt: archived ? ({ not: null } as const) : null,
    ...(businessStoreId
      ? {
          businessStoreId: {
            contains: businessStoreId,
            mode: "insensitive" as const,
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { businessName: { contains: q, mode: "insensitive" as const } },
            { businessStoreId: { contains: q, mode: "insensitive" as const } },
            { pointOfContactName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: [{ businessStoreId: "asc" }, { businessName: "asc" }],
      skip,
      take: limit,
      select: clientSelect,
    }),
    prisma.client.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  res.json({
    page,
    limit,
    total,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    items,
  });
});

router.patch(
  "/:clientId",
  validateUUIDParams("companyId", "clientId"),
  validateBody(updateClientSchema),
  async (req, res) => {
    if (!canManageClients(req.employee?.role)) {
      res.status(403).json({ error: "Only owners and managers can update clients." });
      return;
    }

    try {
      const client = await prisma.client.updateMany({
        where: {
          id: param(req, "clientId"),
          companyId: param(req, "companyId"),
        },
        data: req.body,
      });

      if (client.count === 0) {
        res.status(404).json({ error: "Client not found." });
        return;
      }

      const updated = await prisma.client.findFirst({
        where: { id: param(req, "clientId"), companyId: param(req, "companyId") },
        select: clientSelect,
      });
      res.json(updated);
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        res.status(409).json({ error: "A client with this business/store ID already exists." });
        return;
      }
      throw error;
    }
  }
);

router.delete(
  "/:clientId",
  validateUUIDParams("companyId", "clientId"),
  async (req, res) => {
    if (!canManageClients(req.employee?.role)) {
      res.status(403).json({ error: "Only owners and managers can delete clients." });
      return;
    }

    const companyId = param(req, "companyId");
    const clientId = param(req, "clientId");

    const existing = await prisma.client.findFirst({
      where: { id: clientId, companyId },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ error: "Client not found." });
      return;
    }

    const txCount = await prisma.inventoryTransaction.count({
      where: { companyId, clientId },
    });
    if (txCount > 0) {
      res.status(409).json({
        error:
          "Client has transactions and cannot be deleted. Archive this client instead.",
      });
      return;
    }

    await prisma.client.delete({ where: { id: clientId } });
    res.status(204).send();
  }
);

export default router;
