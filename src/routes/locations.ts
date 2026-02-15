import { Router } from "express";
import { prisma } from "../lib/prisma";
import { validateUUIDParams, validateBody, param } from "../middleware/validate";
import { createLocationSchema } from "../schemas/location";

/** Mounted at /companies/:companyId/locations */
const router = Router({ mergeParams: true });

/** POST / — Create a location (owner or manager only) */
router.post("/", validateBody(createLocationSchema), async (req, res) => {
  const companyId = param(req, "companyId");
  const role = req.employee?.role;

  if (role !== "owner" && role !== "manager") {
    res
      .status(403)
      .json({ error: "Only owners and managers can add locations." });
    return;
  }

  const { address, locationType } = req.body;

  const location = await prisma.location.create({
    data: { companyId, address, locationType },
    select: {
      id: true,
      address: true,
      locationType: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.status(201).json(location);
});

/** GET / — List locations for a company */
router.get("/", validateUUIDParams("companyId"), async (req, res) => {
  const locations = await prisma.location.findMany({
    where: { companyId: param(req, "companyId") },
    orderBy: { address: "asc" },
    select: {
      id: true,
      address: true,
      locationType: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json(locations);
});

/** GET /:locationId — Get a single location */
router.get(
  "/:locationId",
  validateUUIDParams("companyId", "locationId"),
  async (req, res) => {
    const location = await prisma.location.findFirst({
      where: {
        id: param(req, "locationId"),
        companyId: param(req, "companyId"),
      },
      select: {
        id: true,
        address: true,
        locationType: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            employees: true,
            inventories: true,
          },
        },
      },
    });

    if (!location) {
      res.status(404).json({ error: "Location not found" });
      return;
    }
    res.json(location);
  }
);

export default router;
