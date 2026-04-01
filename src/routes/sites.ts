import { Router } from "express";
import { prisma } from "../lib/prisma";
import { validateUUIDParams, validateBody, param } from "../middleware/validate";
import { createSiteSchema } from "../schemas/site";

/** Mounted at /companies/:companyId/sites */
const router = Router({ mergeParams: true });

// Shared select shape for site responses
const siteSelect = {
  id: true,
  address: true,
  unit: true,
  city: true,
  state: true,
  zipCode: true,
  country: true,
  placeId: true,
  vin: true,
  driverName: true,
  licensePlate: true,
  shortDescription: true,
  siteType: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** POST / — Create a site (owner or manager only) */
router.post("/", validateBody(createSiteSchema), async (req, res) => {
  const companyId = param(req, "companyId");
  const role = req.employee?.role;

  if (role !== "owner" && role !== "manager") {
    res.status(403).json({ error: "Only owners and managers can add sites." });
    return;
  }

  const {
    address,
    unit,
    city,
    state,
    zipCode,
    country,
    placeId,
    vin,
    driverName,
    licensePlate,
    shortDescription,
    siteType,
  } = req.body;

  const effectiveAddress =
    siteType === "vehicle"
      ? (address?.trim() || `Vehicle ${vin?.trim() || ""}`).trim()
      : (address ?? "").trim();

  const site = await prisma.site.create({
    data: {
      companyId,
      address: effectiveAddress,
      unit: unit ?? null,
      city: city ?? null,
      state: state ?? null,
      zipCode: zipCode ?? null,
      country: country ?? null,
      placeId: placeId ?? null,
      vin: vin ?? null,
      driverName: driverName ?? null,
      licensePlate: licensePlate ?? null,
      shortDescription: shortDescription ?? null,
      siteType,
    },
    select: siteSelect,
  });

  res.status(201).json(site);
});

/** GET / — List sites for a company */
router.get("/", validateUUIDParams("companyId"), async (req, res) => {
  const sites = await prisma.site.findMany({
    where: { companyId: param(req, "companyId") },
    orderBy: { address: "asc" },
    select: siteSelect,
  });
  res.json(sites);
});

/** GET /:siteId — Get a single site */
router.get("/:siteId", validateUUIDParams("companyId", "siteId"), async (req, res) => {
  const site = await prisma.site.findFirst({
    where: {
      id: param(req, "siteId"),
      companyId: param(req, "companyId"),
    },
    select: {
      ...siteSelect,
      _count: {
        select: {
          employees: true,
          inventories: true,
        },
      },
    },
  });

  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }
  res.json(site);
});

export default router;
