import request from "supertest";
import app from "../../src/app";

interface RegisteredUser {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

let userCounter = 0;

/**
 * Register a fresh user and return their credentials.
 * Each call produces a unique email to avoid collisions.
 */
export async function registerUser(
  overrides: { email?: string; password?: string } = {}
): Promise<RegisteredUser> {
  userCounter++;
  const email = overrides.email ?? `testuser${userCounter}@test.com`;
  const password = overrides.password ?? "testpassword123";

  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password })
    .expect(201);

  return {
    userId: res.body.user.id,
    email,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

/**
 * Register a user and create a company, returning everything needed
 * to make authenticated, company-scoped requests.
 */
export async function registerOwnerWithCompany(
  companyName = "Test Corp"
): Promise<
  RegisteredUser & {
    companyId: string;
    employeeId: string;
  }
> {
  const user = await registerUser();

  const res = await request(app)
    .post("/api/v1/companies")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      companyName,
      firstName: "Test",
      lastName: "Owner",
      jobTitle: "CEO",
    })
    .expect(201);

  return {
    ...user,
    companyId: res.body.company.id,
    employeeId: res.body.employee.id,
  };
}

/** Reset the counter between test files if needed */
export function resetUserCounter() {
  userCounter = 0;
}
