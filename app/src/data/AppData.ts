import { transformObject } from "core/utils";
import { DataPermissions, Entity, EntityIndex, type EntityManager, type Field } from "data";
import { Module } from "modules/Module";
import { DataController } from "./api/DataController";
import {
   type AppDataConfig,
   FIELDS,
   RELATIONS,
   type TAppDataEntity,
   type TAppDataRelation,
   dataConfigSchema
} from "./data-schema";

export class AppData<DB> extends Module<typeof dataConfigSchema> {
   static constructEntity(name: string, entityConfig: TAppDataEntity) {
      const fields = transformObject(entityConfig.fields ?? {}, (fieldConfig, name) => {
         const { type } = fieldConfig;
         if (!(type in FIELDS)) {
            throw new Error(`Field type "${type}" not found`);
         }

         const { field } = FIELDS[type as any];
         const returnal = new field(name, fieldConfig.config) as Field;
         return returnal;
      });

      // @todo: entity must be migrated to typebox
      return new Entity(
         name,
         Object.values(fields),
         entityConfig.config as any,
         entityConfig.type as any
      );
   }

   static constructRelation(
      relationConfig: TAppDataRelation,
      resolver: (name: Entity | string) => Entity
   ) {
      return new RELATIONS[relationConfig.type].cls(
         resolver(relationConfig.source),
         resolver(relationConfig.target),
         relationConfig.config
      );
   }

   override async build() {
      const entities = transformObject(this.config.entities ?? {}, (entityConfig, name) => {
         return AppData.constructEntity(name, entityConfig);
      });

      const _entity = (_e: Entity | string): Entity => {
         const name = typeof _e === "string" ? _e : _e.name;
         const entity = entities[name];
         if (entity) return entity;
         throw new Error(`Entity "${name}" not found`);
      };

      const relations = transformObject(this.config.relations ?? {}, (relation) =>
         AppData.constructRelation(relation, _entity)
      );

      const indices = transformObject(this.config.indices ?? {}, (index, name) => {
         const entity = _entity(index.entity)!;
         const fields = index.fields.map((f) => entity.field(f)!);
         return new EntityIndex(entity, fields, index.unique, name);
      });

      for (const entity of Object.values(entities)) {
         this.ctx.em.addEntity(entity);
      }

      for (const relation of Object.values(relations)) {
         this.ctx.em.addRelation(relation);
      }

      for (const index of Object.values(indices)) {
         this.ctx.em.addIndex(index);
      }

      this.ctx.server.route(
         this.basepath,
         new DataController(this.ctx, this.config).getController()
      );
      this.ctx.guard.registerPermissions(Object.values(DataPermissions));

      this.setBuilt();
   }

   getSchema() {
      return dataConfigSchema;
   }

   get em(): EntityManager<DB> {
      this.throwIfNotBuilt();
      return this.ctx.em;
   }

   private get basepath() {
      return this.config.basepath ?? "/api/data";
   }

   override getOverwritePaths() {
      return [
         /^entities\..*\.config$/,
         /^entities\..*\.fields\..*\.config$/
         ///^entities\..*\.fields\..*\.config\.schema$/
      ];
   }

   /*registerController(server: AppServer) {
      console.log("adding data controller to", this.basepath);
      server.add(this.basepath, new DataController(this.em));
   }*/

   override toJSON(secrets?: boolean): AppDataConfig {
      return {
         ...this.config,
         ...this.em.toJSON()
      };
   }
}
