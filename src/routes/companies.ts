import { Router } from "express";
import { prisma } from "../lib/prisma";
import { validateUUIDParams, validateBody, param } from "../middleware/validate";
import { createCompanySchema } from "../schemas/company";

const router = Router();

/** POST /companies — Create a company (caller becomes owner) */
router.post("/", validateBody(createCompanySchema), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }

  const { companyName, firstName, lastName, sites } = req.body;

  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { companyName },
    });

    const employee = await tx.employee.create({
      data: {
        userId,
        companyId: company.id,
        firstName,
        lastName,
        role: "owner",
      },
    });

    // Optionally create initial sites
    interface SiteRow {
      id: string;
      address: string;
      unit: string | null;
      city: string | null;
      state: string | null;
      zipCode: string | null;
      country: string | null;
      placeId: string | null;
      vin: string | null;
      driverName: string | null;
      licensePlate: string | null;
      shortDescription: string | null;
      siteType: string;
    }
    let createdSites: SiteRow[] = [];

    if (sites && sites.length > 0) {
      createdSites = await Promise.all(
        sites.map(
          (site: {
            address?: string;
            unit?: string;
            city?: string;
            state?: string;
            zipCode?: string;
            country?: string;
            placeId?: string;
            vin?: string;
            driverName?: string;
            licensePlate?: string;
            shortDescription?: string;
            siteType: "warehouse" | "store" | "vehicle";
          }) =>
            tx.site.create({
              data: {
                companyId: company.id,
                address:
                  site.siteType === "vehicle"
                    ? (site.address?.trim() || `Vehicle ${site.vin?.trim() || ""}`).trim()
                    : (site.address ?? "").trim(),
                unit: site.unit ?? null,
                city: site.city ?? null,
                state: site.state ?? null,
                zipCode: site.zipCode ?? null,
                country: site.country ?? null,
                placeId: site.placeId ?? null,
                vin: site.vin ?? null,
                driverName: site.driverName ?? null,
                licensePlate: site.licensePlate ?? null,
                shortDescription: site.shortDescription ?? null,
                siteType: site.siteType,
              },
              select: {
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
              },
            })
        )
      );
    }

    return { company, employee, sites: createdSites };
  });

  res.status(201).json({
    company: {
      id: result.company.id,
      companyName: result.company.companyName,
      createdAt: result.company.createdAt,
    },
    employee: {
      id: result.employee.id,
      firstName: result.employee.firstName,
      lastName: result.employee.lastName,
      role: result.employee.role,
    },
    sites: result.sites,
  });
});

/** GET /companies — List all companies */
router.get("/", async (_req, res) => {
  const companies = await prisma.company.findMany({
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json(companies);
});

/** GET /companies/:companyId — Get a single company */
router.get("/:companyId", validateUUIDParams("companyId"), async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: param(req, "companyId") },
    select: {
      id: true,
      companyName: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          sites: true,
          employees: true,
          products: true,
        },
      },
    },
  });

  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json({
    ...company,
    _count: {
      sites: company._count.sites,
      employees: company._count.employees,
      products: company._count.products,
    },
  });
});

export default router;
