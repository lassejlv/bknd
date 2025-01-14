import { serve } from "bknd/adapter/cloudflare";

import manifest from "__STATIC_CONTENT_MANIFEST";

export default serve(
   {
      app: (env: Env) => ({
         connection: {
            type: "libsql",
            config: {
               url: "http://localhost:8080"
            }
         }
      }),
      onBuilt: async (app) => {
         app.modules.server.get("/hello", (c) => c.json({ hello: "world" }));
      }
   },
   manifest
);
