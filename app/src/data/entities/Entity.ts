import { config } from "core";
import {
   type Static,
   StringEnum,
   Type,
   parse,
   snakeToPascalWithSpaces,
   transformObject
} from "core/utils";
import { type Field, PrimaryField, type TActionContext, type TRenderContext } from "../fields";

// @todo: entity must be migrated to typebox
export const entityConfigSchema = Type.Object(
   {
      name: Type.Optional(Type.String()),
      name_singular: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      sort_field: Type.Optional(Type.String({ default: config.data.default_primary_field })),
      sort_dir: Type.Optional(StringEnum(["asc", "desc"], { default: "asc" }))
   },
   {
      additionalProperties: false
   }
);

export type EntityConfig = Static<typeof entityConfigSchema>;

export type EntityData = Record<string, any>;
export type EntityJSON = ReturnType<Entity["toJSON"]>;

/**
 * regular: normal defined entity
 * system: generated by the system, e.g. "users" from auth
 * generated: result of a relation, e.g. many-to-many relation's connection entity
 */
export const entityTypes = ["regular", "system", "generated"] as const;
export type TEntityType = (typeof entityTypes)[number];

/**
 * @todo: add check for adding fields (primary and relation not allowed)
 * @todo: add option to disallow api deletes (or api actions in general)
 */
export class Entity<
   EntityName extends string = string,
   Fields extends Record<string, Field<any, any, any>> = Record<string, Field<any, any, any>>
> {
   readonly #_name!: EntityName;
   readonly #_fields!: Fields; // only for types

   readonly name: string;
   readonly fields: Field[];
   readonly config: EntityConfig;
   protected data: EntityData[] | undefined;
   readonly type: TEntityType = "regular";

   constructor(name: string, fields?: Field[], config?: EntityConfig, type?: TEntityType) {
      if (typeof name !== "string" || name.length === 0) {
         throw new Error("Entity name must be a non-empty string");
      }

      this.name = name;
      this.config = parse(entityConfigSchema, config || {}) as EntityConfig;

      // add id field if not given
      // @todo: add test
      const primary_count = fields?.filter((field) => field instanceof PrimaryField).length ?? 0;
      if (primary_count > 1) {
         throw new Error(`Entity "${name}" has more than one primary field`);
      }
      this.fields = primary_count === 1 ? [] : [new PrimaryField()];

      if (fields) {
         fields.forEach((field) => this.addField(field));
      }

      if (type) this.type = type;
   }

   static create(args: {
      name: string;
      fields?: Field[];
      config?: EntityConfig;
      type?: TEntityType;
   }) {
      return new Entity(args.name, args.fields, args.config, args.type);
   }

   // @todo: add test
   getType(): TEntityType {
      return this.type;
   }

   getSelect(alias?: string, context?: TActionContext | TRenderContext): string[] {
      return this.getFields()
         .filter((field) => !field.isHidden(context ?? "read"))
         .map((field) => (alias ? `${alias}.${field.name} as ${field.name}` : field.name));
   }

   getDefaultSort() {
      return {
         by: this.config.sort_field,
         dir: this.config.sort_dir
      };
   }

   getAliasedSelectFrom(
      select: string[],
      _alias?: string,
      context?: TActionContext | TRenderContext
   ): string[] {
      const alias = _alias ?? this.name;
      return this.getFields()
         .filter(
            (field) =>
               !field.isVirtual() &&
               !field.isHidden(context ?? "read") &&
               select.includes(field.name)
         )
         .map((field) => (alias ? `${alias}.${field.name} as ${field.name}` : field.name));
   }

   getFillableFields(context?: TActionContext, include_virtual?: boolean): Field[] {
      return this.getFields(include_virtual).filter((field) => field.isFillable(context));
   }

   getRequiredFields(): Field[] {
      return this.getFields().filter((field) => field.isRequired());
   }

   getDefaultObject(): EntityData {
      return this.getFields().reduce((acc, field) => {
         if (field.hasDefault()) {
            acc[field.name] = field.getDefault();
         }
         return acc;
      }, {} as EntityData);
   }

   getField(name: string): Field | undefined {
      return this.fields.find((field) => field.name === name);
   }

   __experimental_replaceField(name: string, field: Field) {
      const index = this.fields.findIndex((f) => f.name === name);
      if (index === -1) {
         throw new Error(`Field "${name}" not found on entity "${this.name}"`);
      }

      this.fields[index] = field;
   }

   getPrimaryField(): PrimaryField {
      return this.fields[0] as PrimaryField;
   }

   id(): PrimaryField {
      return this.getPrimaryField();
   }

   get label(): string {
      return snakeToPascalWithSpaces(this.config.name ?? this.name);
   }

   field(name: string): Field | undefined {
      return this.getField(name);
   }

   getFields(include_virtual: boolean = false): Field[] {
      if (include_virtual) return this.fields;
      return this.fields.filter((f) => !f.isVirtual());
   }

   addField(field: Field) {
      const existing = this.getField(field.name);
      // make unique name check
      if (existing) {
         // @todo: for now adding a graceful method
         if (JSON.stringify(existing) === JSON.stringify(field)) {
            /*console.warn(
               `Field "${field.name}" already exists on entity "${this.name}", but it's the same, so skipping.`,
            );*/
            return;
         }

         throw new Error(`Field "${field.name}" already exists on entity "${this.name}"`);
      }

      this.fields.push(field);
   }

   __setData(data: EntityData[]) {
      this.data = data;
   }

   isValidData(data: EntityData, context: TActionContext, explain?: boolean): boolean {
      const fields = this.getFillableFields(context, false);
      //const fields = this.fields;
      //console.log("data", data);
      for (const field of fields) {
         if (!field.isValid(data[field.name], context)) {
            console.log("Entity.isValidData:invalid", context, field.name, data[field.name]);
            if (explain) {
               throw new Error(`Field "${field.name}" has invalid data: "${data[field.name]}"`);
            }

            return false;
         }
      }

      return true;
   }

   toSchema(clean?: boolean): object {
      const fields = Object.fromEntries(this.fields.map((field) => [field.name, field]));
      const schema = Type.Object(
         transformObject(fields, (field) => ({
            title: field.config.label,
            $comment: field.config.description,
            $field: field.type,
            readOnly: !field.isFillable("update") ? true : undefined,
            writeOnly: !field.isFillable("create") ? true : undefined,
            ...field.toJsonSchema()
         }))
      );

      return clean ? JSON.parse(JSON.stringify(schema)) : schema;
   }

   toJSON() {
      return {
         //name: this.name,
         type: this.type,
         //fields: transformObject(this.fields, (field) => field.toJSON()),
         fields: Object.fromEntries(this.fields.map((field) => [field.name, field.toJSON()])),
         config: this.config
      };
   }
}