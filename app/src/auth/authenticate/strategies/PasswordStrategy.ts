import type { Authenticator, Strategy } from "auth";
import { type Static, StringEnum, Type, parse } from "core/utils";
import { hash } from "core/utils";
import { Hono } from "hono";

type LoginSchema = { username: string; password: string } | { email: string; password: string };
type RegisterSchema = { email: string; password: string; [key: string]: any };

const schema = Type.Object({
   hashing: StringEnum(["plain", "sha256" /*, "bcrypt"*/] as const, { default: "sha256" })
});

export type PasswordStrategyOptions = Static<typeof schema>;
/*export type PasswordStrategyOptions2 = {
   hashing?: "plain" | "bcrypt" | "sha256";
};*/

export class PasswordStrategy implements Strategy {
   private options: PasswordStrategyOptions;

   constructor(options: Partial<PasswordStrategyOptions> = {}) {
      this.options = parse(schema, options);
   }

   async hash(password: string) {
      switch (this.options.hashing) {
         case "sha256":
            return hash.sha256(password);
         default:
            return password;
      }
   }

   async login(input: LoginSchema) {
      if (!("email" in input) || !("password" in input)) {
         throw new Error("Invalid input: Email and password must be provided");
      }

      const hashedPassword = await this.hash(input.password);
      return { ...input, password: hashedPassword };
   }

   async register(input: RegisterSchema) {
      if (!input.email || !input.password) {
         throw new Error("Invalid input: Email and password must be provided");
      }

      return {
         ...input,
         password: await this.hash(input.password)
      };
   }

   getController(authenticator: Authenticator): Hono<any> {
      const hono = new Hono();

      return hono
         .post("/login", async (c) => {
            const body = (await c.req.json()) ?? {};

            const payload = await this.login(body);
            const data = await authenticator.resolve("login", this, payload.password, payload);

            return c.json(data);
         })
         .post("/register", async (c) => {
            const body = (await c.req.json()) ?? {};

            const payload = await this.register(body);
            const data = await authenticator.resolve("register", this, payload.password, payload);

            return c.json(data);
         });
   }

   getSchema() {
      return schema;
   }

   getType() {
      return "password";
   }

   getMode() {
      return "form" as const;
   }

   getName() {
      return "password" as const;
   }

   toJSON(secrets?: boolean) {
      return {
         type: this.getType(),
         config: secrets ? this.options : undefined
      };
   }
}