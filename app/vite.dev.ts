import { serveStatic } from "@hono/node-server/serve-static";
import { createClient } from "@libsql/client/node";
import { App } from "./src";
import { LibsqlConnection } from "./src/data";
import { StorageLocalAdapter } from "./src/media/storage/adapters/StorageLocalAdapter";
import { registries } from "./src/modules/registries";

registries.media.add("local", {
   cls: StorageLocalAdapter,
   schema: StorageLocalAdapter.prototype.getSchema()
});

const credentials = {
   url: import.meta.env.VITE_DB_URL!,
   authToken: import.meta.env.VITE_DB_TOKEN!
};
if (!credentials.url) {
   throw new Error("Missing VITE_DB_URL env variable. Add it to .env file");
}

const connection = new LibsqlConnection(createClient(credentials));

export default {
   async fetch(request: Request) {
      const app = App.create({ connection });

      app.emgr.on(
         "app-built",
         async () => {
            app.registerAdminController({ forceDev: true });
            app.module.server.client.get("/assets/*", serveStatic({ root: "./" }));
         },
         "sync"
      );
      await app.build();

      return app.fetch(request);
   }
};
