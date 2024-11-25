import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { AuthController } from "../../src/auth/api/AuthController";
import { AppAuth, type ModuleBuildContext } from "../../src/modules";
import { disableConsoleLog, enableConsoleLog } from "../helper";
import { makeCtx, moduleTestSuite } from "./module-test-suite";

describe("AppAuth", () => {
   moduleTestSuite(AppAuth);

   let ctx: ModuleBuildContext;

   beforeEach(() => {
      ctx = makeCtx();
   });

   test("secrets", async () => {
      // auth must be enabled, otherwise default config is returned
      const auth = new AppAuth({ enabled: true }, ctx);
      await auth.build();

      const config = auth.toJSON();
      expect(config.jwt.secret).toBeUndefined();
      expect(config.strategies.password.config).toBeUndefined();
   });

   test("creates user on register", async () => {
      const auth = new AppAuth(
         {
            enabled: true
         },
         ctx
      );

      await auth.build();
      await ctx.em.schema().sync({ force: true });

      // expect no users, but the query to pass
      const res = await ctx.em.repository("users").findMany();
      expect(res.data.length).toBe(0);

      const app = new AuthController(auth).getController();

      {
         disableConsoleLog();
         const res = await app.request("/password/register", {
            method: "POST",
            body: JSON.stringify({
               email: "some@body.com",
               password: "123456"
            })
         });
         enableConsoleLog();
         expect(res.status).toBe(200);

         const { data: users } = await ctx.em.repository("users").findMany();
         expect(users.length).toBe(1);
         expect(users[0].email).toBe("some@body.com");
      }
   });
});
