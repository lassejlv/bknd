import type {
   Context,
   Env,
   Input,
   MiddlewareHandler,
   TypedResponse,
   ValidationTargets,
} from "hono";
import { validator } from "hono/validator";
import type { ZodError, ZodSchema, z } from "zod";

export type Hook<T, E extends Env, P extends string, O = {}> = (
   result: { success: true; data: T } | { success: false; error: ZodError; data: T },
   c: Context<E, P>,
) => Response | void | TypedResponse<O> | Promise<Response | void | TypedResponse<O>>;

type HasUndefined<T> = undefined extends T ? true : false;

export const zValidator = <
   T extends ZodSchema,
   Target extends keyof ValidationTargets,
   E extends Env,
   P extends string,
   In = z.input<T>,
   Out = z.output<T>,
   I extends Input = {
      in: HasUndefined<In> extends true
         ? {
              [K in Target]?: K extends "json"
                 ? In
                 : HasUndefined<keyof ValidationTargets[K]> extends true
                   ? { [K2 in keyof In]?: ValidationTargets[K][K2] }
                   : { [K2 in keyof In]: ValidationTargets[K][K2] };
           }
         : {
              [K in Target]: K extends "json"
                 ? In
                 : HasUndefined<keyof ValidationTargets[K]> extends true
                   ? { [K2 in keyof In]?: ValidationTargets[K][K2] }
                   : { [K2 in keyof In]: ValidationTargets[K][K2] };
           };
      out: { [K in Target]: Out };
   },
   V extends I = I,
>(
   target: Target,
   schema: T,
   preprocess?: (target: string, value: In, c: Context<E, P>) => V, // <-- added
   hook?: Hook<z.infer<T>, E, P>,
): MiddlewareHandler<E, P, V> =>
   // @ts-expect-error not typed well
   validator(target, async (value, c) => {
      // added: preprocess value first if given
      const _value = preprocess ? preprocess(target, value, c) : (value as any);
      const result = await schema.safeParseAsync(_value);

      if (hook) {
         const hookResult = await hook({ data: value, ...result }, c);
         if (hookResult) {
            if (hookResult instanceof Response) {
               return hookResult;
            }

            if ("response" in hookResult) {
               return hookResult.response;
            }
         }
      }

      if (!result.success) {
         return c.json(result, 400);
      }

      return result.data as z.infer<T>;
   });
