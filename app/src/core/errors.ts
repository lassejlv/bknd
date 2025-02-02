export class Exception extends Error {
   code = 400;
   override name = "Exception";

   constructor(message: string, code?: number) {
      super(message);
      if (code) {
         this.code = code;
      }
   }

   toJSON() {
      return {
         error: this.message,
         type: this.name
         //message: this.message
      };
   }
}

export class BkndError extends Error {
   constructor(
      message: string,
      public details?: Record<string, any>,
      public type?: string
   ) {
      super(message);
   }

   toJSON() {
      return {
         type: this.type ?? "unknown",
         message: this.message,
         details: this.details
      };
   }
}
