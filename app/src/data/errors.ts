import { Exception } from "core";
import type { TypeInvalidError } from "core/utils";
import type { Entity } from "./entities";
import type { Field } from "./fields";

export class UnableToConnectException extends Exception {
   override name = "UnableToConnectException";
   override code = 500;
}

export class InvalidSearchParamsException extends Exception {
   override name = "InvalidSearchParamsException";
   override code = 422;
}

export class TransformRetrieveFailedException extends Exception {
   override name = "TransformRetrieveFailedException";
   override code = 422;
}

export class TransformPersistFailedException extends Exception {
   override name = "TransformPersistFailedException";
   override code = 422;

   static invalidType(property: string, expected: string, given: any) {
      const givenValue = typeof given === "object" ? JSON.stringify(given) : given;
      const message =
         `Property "${property}" must be of type "${expected}", ` +
         `"${givenValue}" of type "${typeof given}" given.`;
      return new TransformPersistFailedException(message);
   }

   static required(property: string) {
      return new TransformPersistFailedException(`Property "${property}" is required`);
   }
}

export class InvalidFieldConfigException extends Exception {
   override name = "InvalidFieldConfigException";
   override code = 400;

   constructor(
      field: Field<any, any, any>,
      public given: any,
      error: TypeInvalidError
   ) {
      console.error("InvalidFieldConfigException", {
         given,
         error: error.firstToString()
      });
      super(`Invalid Field config given for field "${field.name}": ${error.firstToString()}`);
   }
}

export class EntityNotDefinedException extends Exception {
   override name = "EntityNotDefinedException";
   override code = 400;

   constructor(entity?: Entity | string) {
      if (!entity) {
         super("Cannot find an entity that is undefined");
      } else {
         super(`Entity "${typeof entity !== "string" ? entity.name : entity}" not defined`);
      }
   }
}

export class EntityNotFoundException extends Exception {
   override name = "EntityNotFoundException";
   override code = 404;

   constructor(entity: Entity | string, id: any) {
      super(
         `Entity "${typeof entity !== "string" ? entity.name : entity}" with id "${id}" not found`
      );
   }
}