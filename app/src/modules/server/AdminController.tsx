/** @jsxImportSource hono/jsx */

import type { App } from "App";
import { type ClassController, isDebug } from "core";
import { addFlashMessage } from "core/server/flash";
import { Hono } from "hono";
import { html } from "hono/html";
import { Fragment } from "hono/jsx";
import * as SystemPermissions from "modules/permissions";

const htmlBkndContextReplace = "<!-- BKND_CONTEXT -->";

export type AdminControllerOptions = {
   html?: string;
   forceDev?: boolean;
};

export class AdminController implements ClassController {
   constructor(
      private readonly app: App,
      private options: AdminControllerOptions = {}
   ) {}

   get ctx() {
      return this.app.modules.ctx();
   }

   private withBasePath(route: string = "") {
      return (this.app.modules.configs().server.admin.basepath + route).replace(/\/+$/, "/");
   }

   getController(): Hono<any> {
      const auth = this.app.module.auth;
      const configs = this.app.modules.configs();
      // if auth is not enabled, authenticator is undefined
      const auth_enabled = configs.auth.enabled;
      const hono = new Hono<{
         Variables: {
            html: string;
         };
      }>().basePath(this.withBasePath());
      const authRoutes = {
         root: "/",
         success: configs.auth.cookie.pathSuccess ?? "/",
         loggedOut: configs.auth.cookie.pathLoggedOut ?? "/",
         login: "/auth/login",
         logout: "/auth/logout"
      };

      hono.use("*", async (c, next) => {
         const obj = {
            user: auth.authenticator?.getUser(),
            logout_route: this.withBasePath(authRoutes.logout)
         };
         const html = await this.getHtml(obj);
         if (!html) {
            console.warn("Couldn't generate HTML for admin UI");
            // re-casting to void as a return is not required
            return c.notFound() as unknown as void;
         }
         c.set("html", html);

         // refresh cookie if needed
         await auth.authenticator?.requestCookieRefresh(c);
         await next();
      });

      if (auth_enabled) {
         hono.get(authRoutes.login, async (c) => {
            if (
               this.app.module.auth.authenticator?.isUserLoggedIn() &&
               this.ctx.guard.granted(SystemPermissions.accessAdmin)
            ) {
               return c.redirect(authRoutes.success);
            }

            const html = c.get("html");
            return c.html(html);
         });

         hono.get(authRoutes.logout, async (c) => {
            await auth.authenticator?.logout(c);
            return c.redirect(authRoutes.loggedOut);
         });
      }

      hono.get("*", async (c) => {
         if (!this.ctx.guard.granted(SystemPermissions.accessAdmin)) {
            await addFlashMessage(c, "You are not authorized to access the Admin UI", "error");
            return c.redirect(authRoutes.login);
         }

         const html = c.get("html");
         return c.html(html);
      });

      return hono;
   }

   private async getHtml(obj: any = {}) {
      const bknd_context = `window.__BKND__ = JSON.parse('${JSON.stringify(obj)}');`;

      if (this.options.html) {
         if (this.options.html.includes(htmlBkndContextReplace)) {
            return this.options.html.replace(htmlBkndContextReplace, bknd_context);
         }

         console.warn(
            `Custom HTML needs to include '${htmlBkndContextReplace}' to inject BKND context`
         );
         return this.options.html as string;
      }

      const configs = this.app.modules.configs();
      const isProd = !isDebug() && !this.options.forceDev;

      const assets = {
         js: "main.js",
         css: "styles.css"
      };

      if (isProd) {
         try {
            // @ts-ignore
            const manifest = await import("bknd/dist/manifest.json", {
               assert: { type: "json" }
            }).then((m) => m.default);
            assets.js = manifest["src/ui/main.tsx"].name;
            assets.css = manifest["src/ui/main.css"].name;
         } catch (e) {
            console.error("Error loading manifest", e);
         }
      }

      return (
         <Fragment>
            {/* dnd complains otherwise */}
            {html`<!DOCTYPE html>`}
            <html lang="en" class={configs.server.admin.color_scheme ?? "light"}>
               <head>
                  <meta charset="UTF-8" />
                  <meta
                     name="viewport"
                     content="width=device-width, initial-scale=1, maximum-scale=1"
                  />
                  <title>BKND</title>
                  {isProd ? (
                     <Fragment>
                        <script type="module" CrossOrigin src={"/" + assets?.js} />
                        <link rel="stylesheet" crossOrigin href={"/" + assets?.css} />
                     </Fragment>
                  ) : (
                     <Fragment>
                        <script
                           type="module"
                           dangerouslySetInnerHTML={{
                              __html: `import RefreshRuntime from "/@react-refresh"
                              RefreshRuntime.injectIntoGlobalHook(window)
                              window.$RefreshReg$ = () => {}
                              window.$RefreshSig$ = () => (type) => type
                              window.__vite_plugin_react_preamble_installed__ = true`
                           }}
                        />
                        <script type="module" src={"/@vite/client"} />
                     </Fragment>
                  )}
               </head>
               <body>
                  <div id="app" />
                  <script
                     dangerouslySetInnerHTML={{
                        __html: bknd_context
                     }}
                  />
                  {!isProd && <script type="module" src="/src/ui/main.tsx" />}
               </body>
            </html>
         </Fragment>
      );
   }
}
