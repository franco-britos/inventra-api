import { Router } from "express";
import { prisma } from "../lib/prisma";
import { validateUUIDParams, param } from "../middleware/validate";

/** Mounted at /companies/:companyId/employees */
const router = Router({ mergeParams: true });

/** GET / — List employees for a company */
router.get("/", validateUUIDParams("companyId"), async (req, res) => {
  const employees = await prisma.employee.findMany({
    where: { companyId: param(req, "companyId") },
    orderBy: { lastName: "asc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      isActive: true,
      createdAt: true,
      location: {
        select: {
          id: true,
          address: true,
          locationType: true,
        },
      },
    },
  });
  res.json(employees);
});

/** GET /:employeeId — Get a single employee */
router.get(
  "/:employeeId",
  validateUUIDParams("companyId", "employeeId"),
  async (req, res) => {
    const employee = await prisma.employee.findFirst({
      where: {
        id: param(req, "employeeId"),
        companyId: param(req, "companyId"),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
        isActive: true,
        endedAt: true,
        createdAt: true,
        updatedAt: true,
        location: {
          select: {
            id: true,
            address: true,
            locationType: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!employee) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }
    res.json(employee);
  }
);

export default router;
