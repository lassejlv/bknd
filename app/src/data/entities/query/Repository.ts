import type { PrimaryFieldType } from "core";
import { type EmitsEvents, EventManager } from "core/events";
import { type SelectQueryBuilder, sql } from "kysely";
import { cloneDeep } from "lodash-es";
import { InvalidSearchParamsException } from "../../errors";
import { MutatorEvents, RepositoryEvents, RepositoryFindManyBefore } from "../../events";
import { type RepoQuery, defaultQuerySchema } from "../../server/data-query-impl";
import {
   type Entity,
   type EntityData,
   type EntityManager,
   WhereBuilder,
   WithBuilder
} from "../index";
import { JoinBuilder } from "./JoinBuilder";

export type RepositoryQB = SelectQueryBuilder<any, any, any>;

export type RepositoryRawResponse = {
   sql: string;
   parameters: any[];
   result: EntityData[];
};
export type RepositoryResponse<T = EntityData[]> = RepositoryRawResponse & {
   entity: Entity;
   data: T;
   meta: {
      total: number;
      count: number;
      items: number;
      time?: number;
      query?: {
         sql: string;
         parameters: readonly any[];
      };
   };
};

export type RepositoryCountResponse = RepositoryRawResponse & {
   count: number;
};
export type RepositoryExistsResponse = RepositoryRawResponse & {
   exists: boolean;
};

export class Repository<DB = any, TB extends keyof DB = any> implements EmitsEvents {
   em: EntityManager<DB>;
   entity: Entity;
   static readonly Events = RepositoryEvents;
   emgr: EventManager<typeof Repository.Events>;

   constructor(em: EntityManager<DB>, entity: Entity, emgr?: EventManager<any>) {
      this.em = em;
      this.entity = entity;
      this.emgr = emgr ?? new EventManager(MutatorEvents);
   }

   private cloneFor(entity: Entity) {
      return new Repository(this.em, entity, this.emgr);
   }

   private get conn() {
      return this.em.connection.kysely;
   }

   private getValidOptions(options?: Partial<RepoQuery>): RepoQuery {
      const entity = this.entity;
      // @todo: if not cloned deep, it will keep references and error if multiple requests come in
      const validated = {
         ...cloneDeep(defaultQuerySchema),
         sort: entity.getDefaultSort(),
         select: entity.getSelect()
      };
      //console.log("validated", validated);

      if (!options) return validated;

      if (options.sort) {
         if (!validated.select.includes(options.sort.by)) {
            throw new InvalidSearchParamsException(`Invalid sort field "${options.sort.by}"`);
         }
         if (!["asc", "desc"].includes(options.sort.dir)) {
            throw new InvalidSearchParamsException(`Invalid sort direction "${options.sort.dir}"`);
         }

         validated.sort = options.sort;
      }

      if (options.select && options.select.length > 0) {
         const invalid = options.select.filter((field) => !validated.select.includes(field));

         if (invalid.length > 0) {
            throw new InvalidSearchParamsException(
               `Invalid select field(s): ${invalid.join(", ")}`
            );
         }

         validated.select = options.select;
      }

      if (options.with && options.with.length > 0) {
         for (const entry of options.with) {
            const related = this.em.relationOf(entity.name, entry);
            if (!related) {
               throw new InvalidSearchParamsException(
                  `WITH: "${entry}" is not a relation of "${entity.name}"`
               );
            }

            validated.with.push(entry);
         }
      }

      if (options.join && options.join.length > 0) {
         for (const entry of options.join) {
            const related = this.em.relationOf(entity.name, entry);
            if (!related) {
               throw new InvalidSearchParamsException(
                  `JOIN: "${entry}" is not a relation of "${entity.name}"`
               );
            }

            validated.join.push(entry);
         }
      }

      if (options.where) {
         // @todo: auto-alias base entity when using joins! otherwise "id" is ambiguous
         const aliases = [entity.name];
         if (validated.join.length > 0) {
            aliases.push(...JoinBuilder.getJoinedEntityNames(this.em, entity, validated.join));
         }

         // @todo: add tests for aliased fields in where
         const invalid = WhereBuilder.getPropertyNames(options.where).filter((field) => {
            if (field.includes(".")) {
               const [alias, prop] = field.split(".") as [string, string];
               if (!aliases.includes(alias)) {
                  return true;
               }

               return !this.em.entity(alias).getField(prop);
            }

            return typeof entity.getField(field) === "undefined";
         });

         if (invalid.length > 0) {
            throw new InvalidSearchParamsException(`Invalid where field(s): ${invalid.join(", ")}`);
         }

         validated.where = options.where;
      }

      // pass unfiltered
      if (options.limit) validated.limit = options.limit;
      if (options.offset) validated.offset = options.offset;

      return validated;
   }

   protected async performQuery(qb: RepositoryQB): Promise<RepositoryResponse> {
      const entity = this.entity;
      const compiled = qb.compile();
      /*const { sql, parameters } = qb.compile();
      console.log("many", sql, parameters);*/

      const start = performance.now();
      const selector = (as = "count") => this.conn.fn.countAll<number>().as(as);
      const countQuery = qb
         .clearSelect()
         .select(selector())
         .clearLimit()
         .clearOffset()
         .clearGroupBy()
         .clearOrderBy();
      const totalQuery = this.conn.selectFrom(entity.name).select(selector("total"));

      try {
         const [_count, _total, result] = await this.em.connection.batchQuery([
            countQuery,
            totalQuery,
            qb
         ]);
         //console.log("result", { _count, _total });

         const time = Number.parseFloat((performance.now() - start).toFixed(2));
         const data = this.em.hydrate(entity.name, result);

         return {
            entity,
            sql: compiled.sql,
            parameters: [...compiled.parameters],
            result,
            data,
            meta: {
               total: _total[0]?.total ?? 0,
               count: _count[0]?.count ?? 0, // @todo: better graceful method
               items: result.length,
               time,
               query: { sql: compiled.sql, parameters: compiled.parameters }
            }
         };
      } catch (e) {
         console.error("many error", e, compiled);
         throw e;
      }
   }

   protected async single(
      qb: RepositoryQB,
      options: RepoQuery
   ): Promise<RepositoryResponse<EntityData>> {
      await this.emgr.emit(
         new Repository.Events.RepositoryFindOneBefore({ entity: this.entity, options })
      );

      const { data, ...response } = await this.performQuery(qb);

      await this.emgr.emit(
         new Repository.Events.RepositoryFindOneAfter({
            entity: this.entity,
            options,
            data: data[0]!
         })
      );

      return { ...response, data: data[0]! };
   }

   private buildQuery(
      _options?: Partial<RepoQuery>,
      exclude_options: (keyof RepoQuery)[] = []
   ): { qb: RepositoryQB; options: RepoQuery } {
      const entity = this.entity;
      const options = this.getValidOptions(_options);

      const alias = entity.name;
      const aliased = (field: string) => `${alias}.${field}`;
      let qb = this.conn
         .selectFrom(entity.name)
         .select(entity.getAliasedSelectFrom(options.select, alias));

      //console.log("build query options", options);
      if (!exclude_options.includes("with") && options.with) {
         qb = WithBuilder.addClause(this.em, qb, entity, options.with);
      }

      if (!exclude_options.includes("join") && options.join) {
         qb = JoinBuilder.addClause(this.em, qb, entity, options.join);
      }

      // add where if present
      if (!exclude_options.includes("where") && options.where) {
         qb = WhereBuilder.addClause(qb, options.where);
      }

      if (!exclude_options.includes("limit")) qb = qb.limit(options.limit);
      if (!exclude_options.includes("offset")) qb = qb.offset(options.offset);

      // sorting
      if (!exclude_options.includes("sort")) {
         qb = qb.orderBy(aliased(options.sort.by), options.sort.dir);
      }

      return { qb, options };
   }

   async findId(
      id: PrimaryFieldType,
      _options?: Partial<Omit<RepoQuery, "where" | "limit" | "offset">>
   ): Promise<RepositoryResponse<DB[TB]>> {
      const { qb, options } = this.buildQuery(
         {
            ..._options,
            where: { [this.entity.getPrimaryField().name]: id },
            limit: 1
         },
         ["offset", "sort"]
      );

      return this.single(qb, options) as any;
   }

   async findOne(
      where: RepoQuery["where"],
      _options?: Partial<Omit<RepoQuery, "where" | "limit" | "offset">>
   ): Promise<RepositoryResponse<DB[TB] | undefined>> {
      const { qb, options } = this.buildQuery(
         {
            ..._options,
            where,
            limit: 1
         },
         ["offset", "sort"]
      );

      return this.single(qb, options) as any;
   }

   async findMany(_options?: Partial<RepoQuery>): Promise<RepositoryResponse<DB[TB][]>> {
      const { qb, options } = this.buildQuery(_options);
      //console.log("findMany:options", options);

      await this.emgr.emit(
         new Repository.Events.RepositoryFindManyBefore({ entity: this.entity, options })
      );

      const res = await this.performQuery(qb);

      await this.emgr.emit(
         new Repository.Events.RepositoryFindManyAfter({
            entity: this.entity,
            options,
            data: res.data
         })
      );

      return res as any;
   }

   // @todo: add unit tests, specially for many to many
   async findManyByReference(
      id: PrimaryFieldType,
      reference: string,
      _options?: Partial<Omit<RepoQuery, "limit" | "offset">>
   ): Promise<RepositoryResponse<EntityData>> {
      const entity = this.entity;
      const listable_relations = this.em.relations.listableRelationsOf(entity);
      const relation = listable_relations.find((r) => r.ref(reference).reference === reference);

      if (!relation) {
         throw new Error(
            `Relation "${reference}" not found or not listable on entity "${entity.name}"`
         );
      }

      const newEntity = relation.other(entity).entity;
      const refQueryOptions = relation.getReferenceQuery(newEntity, id as number, reference);
      if (!("where" in refQueryOptions) || Object.keys(refQueryOptions.where as any).length === 0) {
         throw new Error(
            `Invalid reference query for "${reference}" on entity "${newEntity.name}"`
         );
      }

      const findManyOptions = {
         ..._options,
         ...refQueryOptions,
         where: {
            ...refQueryOptions.where,
            ..._options?.where
         }
      };

      //console.log("findManyOptions", newEntity.name, findManyOptions);
      return this.cloneFor(newEntity).findMany(findManyOptions);
   }

   async count(where?: RepoQuery["where"]): Promise<RepositoryCountResponse> {
      const entity = this.entity;
      const options = this.getValidOptions({ where });

      const selector = this.conn.fn.count<number>(sql`*`).as("count");
      let qb = this.conn.selectFrom(entity.name).select(selector);

      // add where if present
      if (options.where) {
         qb = WhereBuilder.addClause(qb, options.where);
      }

      const compiled = qb.compile();
      const result = await qb.execute();

      return {
         sql: compiled.sql,
         parameters: [...compiled.parameters],
         result,
         count: result[0]?.count ?? 0
      };
   }

   async exists(where: Required<RepoQuery["where"]>): Promise<RepositoryExistsResponse> {
      const entity = this.entity;
      const options = this.getValidOptions({ where });

      const selector = this.conn.fn.count<number>(sql`*`).as("count");
      let qb = this.conn.selectFrom(entity.name).select(selector);

      // add mandatory where
      qb = WhereBuilder.addClause(qb, options.where);

      // we only need 1
      qb = qb.limit(1);

      const compiled = qb.compile();
      //console.log("exists query", compiled.sql, compiled.parameters);
      const result = await qb.execute();
      //console.log("result", result);

      return {
         sql: compiled.sql,
         parameters: [...compiled.parameters],
         result,
         exists: result[0]!.count > 0
      };
   }
}
