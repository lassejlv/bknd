/** @jsxImportSource hono/jsx */

import type { App } from "App";
import { type ClassController, isDebug } from "core";
import { addFlashMessage } from "core/server/flash";
import { Hono } from "hono";
import { html } from "hono/html";
import { Fragment } from "hono/jsx";
import * as SystemPermissions from "modules/permissions";
import type { Manifest } from "vite";

const viteInject = `
import RefreshRuntime from "/@react-refresh"
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
`;

export type AdminControllerOptions = {
   html?: string;
   viteManifest?: Manifest;
};

const authRoutes = {
   root: "/",
   login: "/auth/login",
   logout: "/auth/logout"
};

export class AdminController implements ClassController {
   constructor(
      private readonly app: App,
      private options: AdminControllerOptions = {}
   ) {}

   get ctx() {
      return this.app.modules.ctx();
   }

   getController(): Hono<any> {
      const auth = this.app.module.auth;
      const configs = this.app.modules.configs();
      // if auth is not enabled, authenticator is undefined
      const auth_enabled = configs.auth.enabled;
      const basepath = (String(configs.server.admin.basepath) + "/").replace(/\/+$/, "/");
      const hono = new Hono<{
         Variables: {
            html: string;
         };
      }>().basePath(basepath);

      hono.use("*", async (c, next) => {
         const obj = { user: auth.authenticator?.getUser() };
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
               return c.redirect(authRoutes.root);
            }

            const html = c.get("html");
            return c.html(html);
         });

         hono.get(authRoutes.logout, async (c) => {
            await auth.authenticator?.logout(c);
            return c.redirect(authRoutes.login);
         });
      }

      hono.get("*", async (c) => {
         console.log("admin", c.req.url);
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
      if (this.options.html) {
         // @todo: add __BKND__ global
         return this.options.html as string;
      }

      const configs = this.app.modules.configs();

      // @todo: implement guard redirect once cookie sessions arrive

      const isProd = !isDebug();
      let script: string | undefined;
      let css: string[] = [];

      if (isProd) {
         const manifest: Manifest = this.options.viteManifest
            ? this.options.viteManifest
            : isProd
              ? // @ts-ignore cases issues when building types
                await import("bknd/dist/manifest.json", { assert: { type: "json" } }).then(
                   (m) => m.default
                )
              : {};
         //console.log("manifest", manifest, manifest["index.html"]);
         const entry = Object.values(manifest).find((f: any) => f.isEntry === true);
         if (!entry) {
            // do something smart
            return;
         }

         script = "/" + entry.file;
         css = entry.css?.map((c: string) => "/" + c) ?? [];
      }

      return (
         <Fragment>
            {/* dnd complains otherwise */}
            {html`<!doctype html>`}
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
                        <script type="module" CrossOrigin src={script} />
                        {css.map((c) => (
                           <link rel="stylesheet" CrossOrigin href={c} key={c} />
                        ))}
                     </Fragment>
                  ) : (
                     <Fragment>
                        <script type="module" dangerouslySetInnerHTML={{ __html: viteInject }} />
                        <script type="module" src={"/@vite/client"} />
                     </Fragment>
                  )}
               </head>
               <body>
                  <div id="app" />
                  <script
                     dangerouslySetInnerHTML={{
                        __html: `window.__BKND__ = JSON.parse('${JSON.stringify(obj)}');`
                     }}
                  />
                  {!isProd && <script type="module" src="/src/ui/main.tsx" />}
               </body>
            </html>
         </Fragment>
      );
   }
}
