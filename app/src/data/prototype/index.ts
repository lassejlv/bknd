import {
   BooleanField,
   type BooleanFieldConfig,
   DateField,
   type DateFieldConfig,
   Entity,
   type EntityConfig,
   EnumField,
   type EnumFieldConfig,
   type Field,
   JsonField,
   type JsonFieldConfig,
   JsonSchemaField,
   type JsonSchemaFieldConfig,
   ManyToManyRelation,
   type ManyToManyRelationConfig,
   ManyToOneRelation,
   type ManyToOneRelationConfig,
   NumberField,
   type NumberFieldConfig,
   OneToOneRelation,
   type OneToOneRelationConfig,
   PolymorphicRelation,
   type PolymorphicRelationConfig,
   type TEntityType,
   TextField,
   type TextFieldConfig
} from "data";
import type { Generated } from "kysely";
import { MediaField, type MediaFieldConfig, type MediaItem } from "media/MediaField";

type Options<Config = any> = {
   entity: { name: string; fields: Record<string, Field<any, any, any>> };
   field_name: string;
   config: Config;
   is_required: boolean;
};

const FieldMap = {
   text: (o: Options) => new TextField(o.field_name, { ...o.config, required: o.is_required }),
   number: (o: Options) => new NumberField(o.field_name, { ...o.config, required: o.is_required }),
   date: (o: Options) => new DateField(o.field_name, { ...o.config, required: o.is_required }),
   datetime: (o: Options) => new DateField(o.field_name, { ...o.config, required: o.is_required }),
   boolean: (o: Options) =>
      new BooleanField(o.field_name, { ...o.config, required: o.is_required }),
   enumm: (o: Options) => new EnumField(o.field_name, { ...o.config, required: o.is_required }),
   json: (o: Options) => new JsonField(o.field_name, { ...o.config, required: o.is_required }),
   jsonSchema: (o: Options) =>
      new JsonSchemaField(o.field_name, { ...o.config, required: o.is_required }),
   media: (o: Options) =>
      new MediaField(o.field_name, { ...o.config, entity: o.entity.name, required: o.is_required }),
   medium: (o: Options) =>
      new MediaField(o.field_name, { ...o.config, entity: o.entity.name, required: o.is_required })
} as const;
type TFieldType = keyof typeof FieldMap;

export function text(
   config?: Omit<TextFieldConfig, "required">
): TextField<false> & { required: () => TextField<true> } {
   return new FieldPrototype("text", config, false) as any;
}
export function number(
   config?: Omit<NumberFieldConfig, "required">
): NumberField<false> & { required: () => NumberField<true> } {
   return new FieldPrototype("number", config, false) as any;
}
export function date(
   config?: Omit<DateFieldConfig, "required" | "type">
): DateField<false> & { required: () => DateField<true> } {
   return new FieldPrototype("date", { ...config, type: "date" }, false) as any;
}
export function datetime(
   config?: Omit<DateFieldConfig, "required" | "type">
): DateField<false> & { required: () => DateField<true> } {
   return new FieldPrototype("date", { ...config, type: "datetime" }, false) as any;
}
export function week(
   config?: Omit<DateFieldConfig, "required" | "type">
): DateField<false> & { required: () => DateField<true> } {
   return new FieldPrototype("date", { ...config, type: "week" }, false) as any;
}
export function boolean(
   config?: Omit<BooleanFieldConfig, "required">
): BooleanField<false> & { required: () => BooleanField<true> } {
   return new FieldPrototype("boolean", config, false) as any;
}
export function enumm<TypeOverride = string>(
   config?: Omit<EnumFieldConfig, "required" | "options"> & {
      enum: string[] | { label: string; value: string }[];
   }
): EnumField<false, TypeOverride> & {
   required: () => EnumField<true, TypeOverride>;
} {
   const type = typeof config?.enum?.[0] !== "string" ? "objects" : "strings";
   const actual_config = {
      options: {
         type,
         values: config?.enum ?? []
      }
   };
   return new FieldPrototype("enumm", actual_config, false) as any;
}
export function json<TypeOverride = object>(
   config?: Omit<JsonFieldConfig, "required">
): JsonField<false, TypeOverride> & { required: () => JsonField<true, TypeOverride> } {
   return new FieldPrototype("json", config, false) as any;
}
export function jsonSchema<TypeOverride = object>(
   config?: Omit<JsonSchemaFieldConfig, "required">
): JsonField<false, TypeOverride> & { required: () => JsonSchemaField<true, TypeOverride> } {
   return new FieldPrototype("jsonSchema", config, false) as any;
}
export function media(config?: Omit<MediaFieldConfig, "entity">): MediaField<false> {
   return new FieldPrototype("media", config, false) as any;
}
export function medium(
   config?: Omit<MediaFieldConfig, "required" | "entity" | "max_items">
): MediaField<false, MediaItem> {
   return new FieldPrototype("media", { ...config, max_items: 1 }, false) as any;
}
export function make<Actual extends Field<any, any>>(name: string, field: Actual): Actual {
   if (field instanceof FieldPrototype) {
      return field.make(name) as Actual;
   }
   throw new Error("Invalid field");
}

export class FieldPrototype {
   constructor(
      public type: TFieldType,
      public config: any,
      public is_required: boolean
   ) {}

   required() {
      this.is_required = true;
      return this;
   }

   getField(o: Options): Field {
      if (!FieldMap[this.type]) {
         throw new Error(`Unknown field type: ${this.type}`);
      }
      try {
         return FieldMap[this.type](o) as unknown as Field;
      } catch (e) {
         throw new Error(`Faild to construct field "${this.type}": ${e}`);
      }
   }

   make(field_name: string): Field {
      if (!FieldMap[this.type]) {
         throw new Error(`Unknown field type: ${this.type}`);
      }
      try {
         return FieldMap[this.type]({
            entity: { name: "unknown", fields: {} },
            field_name,
            config: this.config,
            is_required: this.is_required
         }) as unknown as Field;
      } catch (e) {
         throw new Error(`Faild to construct field "${this.type}": ${e}`);
      }
   }
}

//type Entity<Fields extends Record<string, Field<any, any>> = {}> = { name: string; fields: Fields };

export function entity<
   EntityName extends string,
   Fields extends Record<string, Field<any, any, any>>
>(
   name: EntityName,
   fields: Fields,
   config?: EntityConfig,
   type?: TEntityType
): Entity<EntityName, Fields> {
   const _fields: Field[] = [];
   for (const [field_name, field] of Object.entries(fields)) {
      const f = field as unknown as FieldPrototype;
      const o: Options = {
         entity: { name, fields },
         field_name,
         config: f.config,
         is_required: f.is_required
      };
      _fields.push(f.getField(o));
   }
   return new Entity(name, _fields, config, type);
}

export function relation<Local extends Entity>(local: Local) {
   return {
      manyToOne: <Foreign extends Entity>(foreign: Foreign, config?: ManyToOneRelationConfig) => {
         return new ManyToOneRelation(local, foreign, config);
      },
      oneToOne: <Foreign extends Entity>(foreign: Foreign, config?: OneToOneRelationConfig) => {
         return new OneToOneRelation(local, foreign, config);
      },
      manyToMany: <Foreign extends Entity>(
         foreign: Foreign,
         config?: ManyToManyRelationConfig,
         additionalFields?: Record<string, Field<any, any, any>>
      ) => {
         const add_fields: Field[] = [];
         if (additionalFields) {
            const fields = additionalFields!;
            const _fields: Field[] = [];
            const entity_name =
               config?.connectionTable ?? ManyToManyRelation.defaultConnectionTable(local, foreign);
            for (const [field_name, field] of Object.entries(additionalFields)) {
               const f = field as unknown as FieldPrototype;
               const o: Options = {
                  entity: { name: entity_name, fields },
                  field_name,
                  config: f.config,
                  is_required: f.is_required
               };
               _fields.push(f.getField(o));
            }
            add_fields.push(_fields as any);
         }

         return new ManyToManyRelation(local, foreign, config as any, add_fields);
      },
      polyToOne: <Foreign extends Entity>(
         foreign: Foreign,
         config?: Omit<PolymorphicRelationConfig, "targetCardinality">
      ) => {
         return new PolymorphicRelation(local, foreign, { ...config, targetCardinality: 1 });
      },
      polyToMany: <Foreign extends Entity>(
         foreign: Foreign,
         config?: PolymorphicRelationConfig
      ) => {
         return new PolymorphicRelation(local, foreign, config);
      }
   };
}

type InferEntityFields<T> = T extends Entity<infer _N, infer Fields>
   ? {
        [K in keyof Fields]: Fields[K] extends { _type: infer Type; _required: infer Required }
           ? Required extends true
              ? Type
              : Type | undefined
           : never;
     }
   : never;

export type InferFields<Fields> = Fields extends Record<string, Field<any, any, any>>
   ? {
        [K in keyof Fields]: Fields[K] extends { _type: infer Type; _required: infer Required }
           ? Required extends true
              ? Type
              : Type | undefined
           : never;
     }
   : never;

type Prettify<T> = {
   [K in keyof T]: T[K];
};
export type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};

// from https://github.com/type-challenges/type-challenges/issues/28200
type Merge<T> = {
   [K in keyof T]: T[K];
};
type OptionalUndefined<
   T,
   Props extends keyof T = keyof T,
   OptionsProps extends keyof T = Props extends keyof T
      ? undefined extends T[Props]
         ? Props
         : never
      : never
> = Merge<
   {
      [K in OptionsProps]?: T[K];
   } & {
      [K in Exclude<keyof T, OptionsProps>]: T[K];
   }
>;

type InferField<Field> = Field extends { _type: infer Type; _required: infer Required }
   ? Required extends true
      ? Type
      : Type | undefined
   : never;

export type InsertSchema<T> = Simplify<OptionalUndefined<InferEntityFields<T>>>;
export type Schema<T> = { id: Generated<number> } & InsertSchema<T>;
export type FieldSchema<T> = Simplify<OptionalUndefined<InferFields<T>>>;