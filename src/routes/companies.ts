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

  const { companyName, firstName, lastName, jobTitle, locations } = req.body;

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
        jobTitle: jobTitle ?? null,
        role: "owner",
      },
    });

    // Optionally create initial locations
    let createdLocations: {
      id: string;
      address: string;
      locationType: string;
    }[] = [];

    if (locations && locations.length > 0) {
      createdLocations = await Promise.all(
        locations.map(
          (loc: { address: string; locationType: "warehouse" | "store" }) =>
            tx.location.create({
              data: {
                companyId: company.id,
                address: loc.address,
                locationType: loc.locationType,
              },
              select: { id: true, address: true, locationType: true },
            })
        )
      );
    }

    return { company, employee, locations: createdLocations };
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
    locations: result.locations,
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
          locations: true,
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
  res.json(company);
});

export default router;
