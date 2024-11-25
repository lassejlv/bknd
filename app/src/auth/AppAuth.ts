import { type AuthAction, Authenticator, type ProfileExchange, Role, type Strategy } from "auth";
import { Exception } from "core";
import { transformObject } from "core/utils";
import {
   type Entity,
   EntityIndex,
   type EntityManager,
   EnumField,
   type Field,
   type Mutator
} from "data";
import { type FieldSchema, entity, enumm, make, text } from "data/prototype";
import { cloneDeep, mergeWith, omit, pick } from "lodash-es";
import { Module } from "modules/Module";
import { AuthController } from "./api/AuthController";
import { type AppAuthSchema, STRATEGIES, authConfigSchema } from "./auth-schema";

export type UserFieldSchema = FieldSchema<typeof AppAuth.usersFields>;
declare global {
   interface DB {
      users: UserFieldSchema;
   }
}

export class AppAuth extends Module<typeof authConfigSchema> {
   private _authenticator?: Authenticator;
   cache: Record<string, any> = {};

   override async build() {
      if (!this.config.enabled) {
         this.setBuilt();
         return;
      }

      // register roles
      const roles = transformObject(this.config.roles ?? {}, (role, name) => {
         //console.log("role", role, name);
         return Role.create({ name, ...role });
      });
      this.ctx.guard.setRoles(Object.values(roles));
      this.ctx.guard.setConfig(this.config.guard ?? {});

      // build strategies
      const strategies = transformObject(this.config.strategies ?? {}, (strategy, name) => {
         try {
            return new STRATEGIES[strategy.type].cls(strategy.config as any);
         } catch (e) {
            throw new Error(
               `Could not build strategy ${String(name)} with config ${JSON.stringify(strategy.config)}`
            );
         }
      });

      const { fields, ...jwt } = this.config.jwt;
      this._authenticator = new Authenticator(strategies, this.resolveUser.bind(this), {
         jwt
      });

      this.registerEntities();
      super.setBuilt();

      const controller = new AuthController(this);
      //this.ctx.server.use(controller.getMiddleware);
      this.ctx.server.route(this.config.basepath, controller.getController());
   }

   getMiddleware() {
      if (!this.config.enabled) {
         return;
      }

      return new AuthController(this).getMiddleware;
   }

   getSchema() {
      return authConfigSchema;
   }

   get authenticator(): Authenticator {
      this.throwIfNotBuilt();
      return this._authenticator!;
   }

   get em(): EntityManager<DB> {
      return this.ctx.em as any;
   }

   private async resolveUser(
      action: AuthAction,
      strategy: Strategy,
      identifier: string,
      profile: ProfileExchange
   ): Promise<any> {
      console.log("***** AppAuth:resolveUser", {
         action,
         strategy: strategy.getName(),
         identifier,
         profile
      });

      const fields = this.getUsersEntity()
         .getFillableFields("create")
         .map((f) => f.name);
      const filteredProfile = Object.fromEntries(
         Object.entries(profile).filter(([key]) => fields.includes(key))
      );

      switch (action) {
         case "login":
            return this.login(strategy, identifier, filteredProfile);
         case "register":
            return this.register(strategy, identifier, filteredProfile);
      }
   }

   private filterUserData(user: any) {
      console.log(
         "--filterUserData",
         user,
         this.config.jwt.fields,
         pick(user, this.config.jwt.fields)
      );
      return pick(user, this.config.jwt.fields);
   }

   private async login(strategy: Strategy, identifier: string, profile: ProfileExchange) {
      console.log("--- trying to login", { strategy: strategy.getName(), identifier, profile });
      if (!("email" in profile)) {
         throw new Exception("Profile must have email");
      }
      if (typeof identifier !== "string" || identifier.length === 0) {
         throw new Exception("Identifier must be a string");
      }

      const users = this.getUsersEntity();
      this.toggleStrategyValueVisibility(true);
      const result = await this.em.repo(users).findOne({ email: profile.email! });
      this.toggleStrategyValueVisibility(false);
      if (!result.data) {
         throw new Exception("User not found", 404);
      }
      console.log("---login data", result.data, result);

      // compare strategy and identifier
      console.log("strategy comparison", result.data.strategy, strategy.getName());
      if (result.data.strategy !== strategy.getName()) {
         console.log("!!! User registered with different strategy");
         throw new Exception("User registered with different strategy");
      }

      console.log("identifier comparison", result.data.strategy_value, identifier);
      if (result.data.strategy_value !== identifier) {
         console.log("!!! Invalid credentials");
         throw new Exception("Invalid credentials");
      }

      return this.filterUserData(result.data);
   }

   private async register(strategy: Strategy, identifier: string, profile: ProfileExchange) {
      if (!("email" in profile)) {
         throw new Exception("Profile must have an email");
      }
      if (typeof identifier !== "string" || identifier.length === 0) {
         throw new Exception("Identifier must be a string");
      }

      const users = this.getUsersEntity();
      const { data } = await this.em.repo(users).findOne({ email: profile.email! });
      if (data) {
         throw new Exception("User already exists");
      }

      const payload = {
         ...profile,
         strategy: strategy.getName(),
         strategy_value: identifier
      };

      const mutator = this.em.mutator(users);
      mutator.__unstable_toggleSystemEntityCreation(false);
      this.toggleStrategyValueVisibility(true);
      const createResult = await mutator.insertOne(payload);
      mutator.__unstable_toggleSystemEntityCreation(true);
      this.toggleStrategyValueVisibility(false);
      if (!createResult.data) {
         throw new Error("Could not create user");
      }

      return this.filterUserData(createResult.data);
   }

   private toggleStrategyValueVisibility(visible: boolean) {
      const field = this.getUsersEntity().field("strategy_value")!;

      field.config.hidden = !visible;
      field.config.fillable = visible;
      // @todo: think about a PasswordField that automatically hashes on save?
   }

   getUsersEntity(forceCreate?: boolean): Entity<"users", typeof AppAuth.usersFields> {
      const entity_name = this.config.entity_name;
      if (forceCreate || !this.em.hasEntity(entity_name)) {
         return entity(entity_name as "users", AppAuth.usersFields, undefined, "system");
      }

      return this.em.entity(entity_name) as any;
   }

   static usersFields = {
      email: text().required(),
      strategy: text({ fillable: ["create"], hidden: ["form"] }).required(),
      strategy_value: text({
         fillable: ["create"],
         hidden: ["read", "table", "update", "form"]
      }).required(),
      role: text()
   };

   registerEntities() {
      const users = this.getUsersEntity();

      if (!this.em.hasEntity(users.name)) {
         this.em.addEntity(users);
      } else {
         // if exists, check all fields required are there
         // @todo: add to context: "needs sync" flag
         const _entity = this.getUsersEntity(true);
         for (const field of _entity.fields) {
            const _field = users.field(field.name);
            if (!_field) {
               users.addField(field);
            }
         }
      }

      const indices = [
         new EntityIndex(users, [users.field("email")!], true),
         new EntityIndex(users, [users.field("strategy")!]),
         new EntityIndex(users, [users.field("strategy_value")!])
      ];
      indices.forEach((index) => {
         if (!this.em.hasIndex(index)) {
            this.em.addIndex(index);
         }
      });

      try {
         const roles = Object.keys(this.config.roles ?? {});
         const field = make("role", enumm({ enum: roles }));
         this.em.entity(users.name).__experimental_replaceField("role", field);
      } catch (e) {}

      try {
         const strategies = Object.keys(this.config.strategies ?? {});
         const field = make("strategy", enumm({ enum: strategies }));
         this.em.entity(users.name).__experimental_replaceField("strategy", field);
      } catch (e) {}
   }

   override toJSON(secrets?: boolean): AppAuthSchema {
      if (!this.config.enabled) {
         return this.configDefault;
      }

      const obj = {
         ...this.config,
         ...this.authenticator.toJSON(secrets)
      };

      return {
         ...obj,
         jwt: {
            ...obj.jwt,
            fields: this.config.jwt.fields
         }
      };
   }
}
