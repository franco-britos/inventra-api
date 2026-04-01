import { Router } from "express";
import { validateUUIDParams } from "../middleware/validate";
import { authorizeCompanyAccess } from "../middleware/authorize";
import companiesRouter from "./companies";
import sitesRouter from "./sites";
import clientsRouter from "./clients";
import employeesRouter from "./employees";
import productsRouter from "./products";
import inventoryRouter from "./inventory";
import transactionsRouter from "./transactions";
import reportsRouter from "./reports";
import { companyInvitesRouter, inviteAcceptRouter } from "./invites";

const router = Router();

// Company list/detail/create — any authenticated user
router.use("/companies", companiesRouter);

// Invite acceptance — JWT required, but no company guard (user isn't a member yet)
router.use("/invites", inviteAcceptRouter);

// Company-scoped routes — require active employee membership
const companyGuard = [validateUUIDParams("companyId"), authorizeCompanyAccess];

router.use("/companies/:companyId/sites", ...companyGuard, sitesRouter);
router.use("/companies/:companyId/clients", ...companyGuard, clientsRouter);
router.use("/companies/:companyId/employees", ...companyGuard, employeesRouter);
router.use("/companies/:companyId/products", ...companyGuard, productsRouter);
router.use("/companies/:companyId/inventory", ...companyGuard, inventoryRouter);
router.use("/companies/:companyId/transactions", ...companyGuard, transactionsRouter);
router.use("/companies/:companyId/reports", ...companyGuard, reportsRouter);
router.use("/companies/:companyId/invites", ...companyGuard, companyInvitesRouter);

export default router;
