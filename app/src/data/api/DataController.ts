import { type ClassController, isDebug, tbValidator as tb } from "core";
import { Type, objectCleanEmpty, objectTransform } from "core/utils";
import {
   DataPermissions,
   type EntityData,
   type EntityManager,
   FieldClassMap,
   type MutatorResponse,
   PrimaryField,
   type RepoQuery,
   type RepositoryResponse,
   TextField,
   querySchema
} from "data";
import { Hono } from "hono";
import type { Handler } from "hono/types";
import type { ModuleBuildContext } from "modules";
import * as SystemPermissions from "modules/permissions";
import { type AppDataConfig, FIELDS } from "../data-schema";

export class DataController implements ClassController {
   constructor(
      private readonly ctx: ModuleBuildContext,
      private readonly config: AppDataConfig
   ) {
      /*console.log(
         "data controller",
         this.em.entities.map((e) => e.name)
      );*/
   }

   get em(): EntityManager<any> {
      return this.ctx.em;
   }

   get guard() {
      return this.ctx.guard;
   }

   repoResult<T extends RepositoryResponse<any> = RepositoryResponse>(
      res: T
   ): Pick<T, "meta" | "data"> {
      let meta: Partial<RepositoryResponse["meta"]> = {};

      if ("meta" in res) {
         const { query, ...rest } = res.meta;
         meta = rest;
         if (isDebug()) meta.query = query;
      }

      const template = { data: res.data, meta };

      // @todo: this works but it breaks in FE (need to improve DataTable)
      //return objectCleanEmpty(template) as any;
      // filter empty
      return Object.fromEntries(
         Object.entries(template).filter(([_, v]) => typeof v !== "undefined" && v !== null)
      ) as any;
   }

   mutatorResult(res: MutatorResponse | MutatorResponse<EntityData>) {
      const template = { data: res.data };

      // filter empty
      //return objectCleanEmpty(template);
      return Object.fromEntries(Object.entries(template).filter(([_, v]) => v !== undefined));
   }

   entityExists(entity: string) {
      try {
         return !!this.em.entity(entity);
      } catch (e) {
         return false;
      }
   }

   getController(): Hono<any> {
      const hono = new Hono();
      const definedEntities = this.em.entities.map((e) => e.name);
      const tbNumber = Type.Transform(Type.String({ pattern: "^[1-9][0-9]{0,}$" }))
         .Decode(Number.parseInt)
         .Encode(String);

      // @todo: sample implementation how to augment handler with additional info
      function handler<HH extends Handler>(name: string, h: HH): any {
         const func = h;
         // @ts-ignore
         func.description = name;
         return func;
      }

      hono.use("*", async (c, next) => {
         this.ctx.guard.throwUnlessGranted(SystemPermissions.accessApi);
         await next();
      });

      // info
      hono.get(
         "/",
         handler("data info", (c) => {
            // sample implementation
            return c.json(this.em.toJSON());
         })
      );

      // sync endpoint
      hono.get("/sync", async (c) => {
         this.guard.throwUnlessGranted(DataPermissions.databaseSync);

         const force = c.req.query("force") === "1";
         const drop = c.req.query("drop") === "1";
         //console.log("force", force);
         const tables = await this.em.schema().introspect();
         //console.log("tables", tables);
         const changes = await this.em.schema().sync({
            force,
            drop
         });
         return c.json({ tables: tables.map((t) => t.name), changes });
      });

      /**
       * Function endpoints
       */
      hono
         // fn: count
         .post(
            "/:entity/fn/count",
            tb("param", Type.Object({ entity: Type.String() })),
            async (c) => {
               this.guard.throwUnlessGranted(DataPermissions.entityRead);

               const { entity } = c.req.valid("param");
               if (!this.entityExists(entity)) {
                  return c.notFound();
               }

               const where = c.req.json() as any;
               const result = await this.em.repository(entity).count(where);
               return c.json({ entity, count: result.count });
            }
         )
         // fn: exists
         .post(
            "/:entity/fn/exists",
            tb("param", Type.Object({ entity: Type.String() })),
            async (c) => {
               this.guard.throwUnlessGranted(DataPermissions.entityRead);

               const { entity } = c.req.valid("param");
               if (!this.entityExists(entity)) {
                  return c.notFound();
               }

               const where = c.req.json() as any;
               const result = await this.em.repository(entity).exists(where);
               return c.json({ entity, exists: result.exists });
            }
         );

      /**
       * Read endpoints
       */
      hono
         // read entity schema
         .get("/schema.json", async (c) => {
            this.guard.throwUnlessGranted(DataPermissions.entityRead);
            const url = new URL(c.req.url);
            const $id = `${url.origin}${this.config.basepath}/schema.json`;
            const schemas = Object.fromEntries(
               this.em.entities.map((e) => [
                  e.name,
                  {
                     $ref: `schemas/${e.name}`
                  }
               ])
            );
            return c.json({
               $schema: "https://json-schema.org/draft/2020-12/schema",
               $id,
               properties: schemas
            });
         })
         // read schema
         .get(
            "/schemas/:entity",
            tb("param", Type.Object({ entity: Type.String() })),
            async (c) => {
               this.guard.throwUnlessGranted(DataPermissions.entityRead);

               //console.log("request", c.req.raw);
               const { entity } = c.req.param();
               if (!this.entityExists(entity)) {
                  console.log("not found", entity, definedEntities);
                  return c.notFound();
               }
               const _entity = this.em.entity(entity);
               const schema = _entity.toSchema();
               const url = new URL(c.req.url);
               const base = `${url.origin}${this.config.basepath}`;
               const $id = `${base}/schemas/${entity}`;
               return c.json({
                  $schema: `${base}/schema.json`,
                  $id,
                  title: _entity.label,
                  $comment: _entity.config.description,
                  ...schema
               });
            }
         )
         // read many
         .get(
            "/:entity",
            tb("param", Type.Object({ entity: Type.String() })),
            tb("query", querySchema),
            async (c) => {
               this.guard.throwUnlessGranted(DataPermissions.entityRead);

               //console.log("request", c.req.raw);
               const { entity } = c.req.param();
               if (!this.entityExists(entity)) {
                  console.log("not found", entity, definedEntities);
                  return c.notFound();
               }
               const options = c.req.valid("query") as RepoQuery;
               //console.log("before", this.ctx.emgr.Events);
               const result = await this.em.repository(entity).findMany(options);

               return c.json(this.repoResult(result), { status: result.data ? 200 : 404 });
            }
         )

         // read one
         .get(
            "/:entity/:id",
            tb(
               "param",
               Type.Object({
                  entity: Type.String(),
                  id: tbNumber
               })
            ),
            tb("query", querySchema),
            /*zValidator("param", z.object({ entity: z.string(), id: z.coerce.number() })),
            zValidator("query", repoQuerySchema),*/
            async (c) => {
               this.guard.throwUnlessGranted(DataPermissions.entityRead);

               const { entity, id } = c.req.param();
               if (!this.entityExists(entity)) {
                  return c.notFound();
               }
               const options = c.req.valid("query") as RepoQuery;
               const result = await this.em.repository(entity).findId(Number(id), options);

               return c.json(this.repoResult(result), { status: result.data ? 200 : 404 });
            }
         )
         // read many by reference
         .get(
            "/:entity/:id/:reference",
            tb(
               "param",
               Type.Object({
                  entity: Type.String(),
                  id: tbNumber,
                  reference: Type.String()
               })
            ),
            tb("query", querySchema),
            async (c) => {
               this.guard.throwUnlessGranted(DataPermissions.entityRead);

               const { entity, id, reference } = c.req.param();
               if (!this.entityExists(entity)) {
                  return c.notFound();
               }

               const options = c.req.valid("query") as RepoQuery;
               const result = await this.em
                  .repository(entity)
                  .findManyByReference(Number(id), reference, options);

               return c.json(this.repoResult(result), { status: result.data ? 200 : 404 });
            }
         )
         // func query
         .post(
            "/:entity/query",
            tb("param", Type.Object({ entity: Type.String() })),
            tb("json", querySchema),
            async (c) => {
               this.guard.throwUnlessGranted(DataPermissions.entityRead);

               const { entity } = c.req.param();
               if (!this.entityExists(entity)) {
                  return c.notFound();
               }
               const options = (await c.req.valid("json")) as RepoQuery;
               console.log("options", options);
               const result = await this.em.repository(entity).findMany(options);

               return c.json(this.repoResult(result), { status: result.data ? 200 : 404 });
            }
         );

      /**
       * Mutation endpoints
       */
      // insert one
      hono
         .post("/:entity", tb("param", Type.Object({ entity: Type.String() })), async (c) => {
            this.guard.throwUnlessGranted(DataPermissions.entityCreate);

            const { entity } = c.req.param();
            if (!this.entityExists(entity)) {
               return c.notFound();
            }
            const body = (await c.req.json()) as EntityData;
            const result = await this.em.mutator(entity).insertOne(body);

            return c.json(this.mutatorResult(result), 201);
         })
         // update one
         .patch(
            "/:entity/:id",
            tb("param", Type.Object({ entity: Type.String(), id: tbNumber })),
            async (c) => {
               this.guard.throwUnlessGranted(DataPermissions.entityUpdate);

               const { entity, id } = c.req.param();
               if (!this.entityExists(entity)) {
                  return c.notFound();
               }
               const body = (await c.req.json()) as EntityData;
               const result = await this.em.mutator(entity).updateOne(Number(id), body);

               return c.json(this.mutatorResult(result));
            }
         )
         // delete one
         .delete(
            "/:entity/:id",
            tb("param", Type.Object({ entity: Type.String(), id: tbNumber })),
            async (c) => {
               this.guard.throwUnlessGranted(DataPermissions.entityDelete);

               const { entity, id } = c.req.param();
               if (!this.entityExists(entity)) {
                  return c.notFound();
               }
               const result = await this.em.mutator(entity).deleteOne(Number(id));

               return c.json(this.mutatorResult(result));
            }
         )

         // delete many
         .delete(
            "/:entity",
            tb("param", Type.Object({ entity: Type.String() })),
            tb("json", querySchema.properties.where),
            async (c) => {
               this.guard.throwUnlessGranted(DataPermissions.entityDelete);

               //console.log("request", c.req.raw);
               const { entity } = c.req.param();
               if (!this.entityExists(entity)) {
                  return c.notFound();
               }
               const where = c.req.valid("json") as RepoQuery["where"];
               console.log("where", where);

               const result = await this.em.mutator(entity).deleteMany(where);

               return c.json(this.mutatorResult(result));
            }
         );

      return hono;
   }
}
