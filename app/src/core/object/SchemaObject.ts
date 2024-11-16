import { cloneDeep, get, has, mergeWith, omit, set } from "lodash-es";
import {
   Default,
   type Static,
   type TObject,
   getFullPathKeys,
   mark,
   parse,
   stripMark
} from "../utils";

export type SchemaObjectOptions<Schema extends TObject> = {
   onUpdate?: (config: Static<Schema>) => void | Promise<void>;
   restrictPaths?: string[];
   overwritePaths?: (RegExp | string)[];
   forceParse?: boolean;
};

export class SchemaObject<Schema extends TObject> {
   private readonly _default: Partial<Static<Schema>>;
   private _value: Static<Schema>;
   private _config: Static<Schema>;
   private _restriction_bypass: boolean = false;

   constructor(
      private _schema: Schema,
      initial?: Partial<Static<Schema>>,
      private options?: SchemaObjectOptions<Schema>
   ) {
      this._default = Default(_schema, {} as any) as any;
      this._value = initial
         ? parse(_schema, cloneDeep(initial as any), {
              forceParse: this.isForceParse(),
              skipMark: this.isForceParse()
           })
         : this._default;
      this._config = Object.freeze(this._value);
   }

   protected isForceParse(): boolean {
      return this.options?.forceParse ?? true;
   }

   default(): Static<Schema> {
      return this._default;
   }

   get(options?: { stripMark?: boolean }): Static<Schema> {
      if (options?.stripMark) {
         return stripMark(this._config);
      }

      return this._config;
   }

   async set(config: Static<Schema>, noEmit?: boolean): Promise<Static<Schema>> {
      const valid = parse(this._schema, cloneDeep(config) as any, {
         forceParse: true,
         skipMark: this.isForceParse()
      });
      this._value = valid;
      this._config = Object.freeze(valid);

      if (noEmit !== true) {
         await this.options?.onUpdate?.(this._config);
      }

      return this._config;
   }

   bypass() {
      this._restriction_bypass = true;
      return this;
   }

   throwIfRestricted(object: object): void;
   throwIfRestricted(path: string): void;
   throwIfRestricted(pathOrObject: string | object): void {
      // only bypass once
      if (this._restriction_bypass) {
         this._restriction_bypass = false;
         return;
      }

      const paths = this.options?.restrictPaths ?? [];
      if (Array.isArray(paths) && paths.length > 0) {
         for (const path of paths) {
            const restricted =
               typeof pathOrObject === "string"
                  ? pathOrObject.startsWith(path)
                  : has(pathOrObject, path);

            if (restricted) {
               throw new Error(`Path "${path}" is restricted`);
            }
         }
      }

      return;
   }

   async patch(path: string, value: any): Promise<[Partial<Static<Schema>>, Static<Schema>]> {
      const current = cloneDeep(this._config);
      const partial = path.length > 0 ? (set({}, path, value) as Partial<Static<Schema>>) : value;

      this.throwIfRestricted(partial);
      //console.log(getFullPathKeys(value).map((k) => path + "." + k));

      // overwrite arrays and primitives, only deep merge objects
      // @ts-ignore
      const config = mergeWith(current, partial, (objValue, srcValue) => {
         if (Array.isArray(objValue) && Array.isArray(srcValue)) {
            return srcValue;
         }
      });

      //console.log("overwritePaths", this.options?.overwritePaths);
      if (this.options?.overwritePaths) {
         const keys = getFullPathKeys(value).map((k) => path + "." + k);
         const overwritePaths = keys.filter((k) => {
            return this.options?.overwritePaths?.some((p) => {
               if (typeof p === "string") {
                  return k === p;
               } else {
                  return p.test(k);
               }
            });
         });
         //console.log("overwritePaths", keys, overwritePaths);

         if (overwritePaths.length > 0) {
            // filter out less specific paths (but only if more than 1)
            const specific =
               overwritePaths.length > 1
                  ? overwritePaths.filter((k) =>
                       overwritePaths.some((k2) => {
                          console.log("keep?", { k, k2 }, k2 !== k && k2.startsWith(k));
                          return k2 !== k && k2.startsWith(k);
                       })
                    )
                  : overwritePaths;
            //console.log("specific", specific);

            for (const p of specific) {
               set(config, p, get(partial, p));
            }
         }
      }

      //console.log("patch", { path, value, partial, config, current });

      const newConfig = await this.set(config);
      return [partial, newConfig];
   }

   async overwrite(path: string, value: any): Promise<[Partial<Static<Schema>>, Static<Schema>]> {
      const current = cloneDeep(this._config);
      const partial = path.length > 0 ? (set({}, path, value) as Partial<Static<Schema>>) : value;

      this.throwIfRestricted(partial);
      //console.log(getFullPathKeys(value).map((k) => path + "." + k));

      // overwrite arrays and primitives, only deep merge objects
      // @ts-ignore
      const config = set(current, path, value);

      //console.log("overwrite", { path, value, partial, config, current });

      const newConfig = await this.set(config);
      return [partial, newConfig];
   }

   has(path: string): boolean {
      const p = path.split(".");
      if (p.length > 1) {
         const parent = p.slice(0, -1).join(".");
         if (!has(this._config, parent)) {
            console.log("parent", parent, JSON.stringify(this._config, null, 2));
            throw new Error(`Parent path "${parent}" does not exist`);
         }
      }

      return has(this._config, path);
   }

   async remove(path: string): Promise<[Partial<Static<Schema>>, Static<Schema>]> {
      this.throwIfRestricted(path);

      if (!this.has(path)) {
         throw new Error(`Path "${path}" does not exist`);
      }

      const current = cloneDeep(this._config);
      const removed = get(current, path) as Partial<Static<Schema>>;
      const config = omit(current, path);
      const newConfig = await this.set(config);
      return [removed, newConfig];
   }
}