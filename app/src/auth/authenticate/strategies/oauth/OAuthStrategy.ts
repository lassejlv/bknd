import type { AuthAction, Authenticator, Strategy } from "auth";
import { Exception } from "core";
import { type Static, StringEnum, type TSchema, Type, filterKeys, parse } from "core/utils";
import { type Context, Hono } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import * as oauth from "oauth4webapi";
import * as issuers from "./issuers";

type ConfiguredIssuers = keyof typeof issuers;
type SupportedTypes = "oauth2" | "oidc";

type RequireKeys<T extends object, K extends keyof T> = Required<Pick<T, K>> & Omit<T, K>;

const schemaProvided = Type.Object(
   {
      //type: StringEnum(["oidc", "oauth2"] as const, { default: "oidc" }),
      name: StringEnum(Object.keys(issuers) as ConfiguredIssuers[]),
      client: Type.Object(
         {
            client_id: Type.String(),
            client_secret: Type.String()
         },
         {
            additionalProperties: false
         }
      )
   },
   { title: "OAuth" }
);
type ProvidedOAuthConfig = Static<typeof schemaProvided>;

export type CustomOAuthConfig = {
   type: SupportedTypes;
   name: string;
} & IssuerConfig & {
      client: RequireKeys<
         oauth.Client,
         "client_id" | "client_secret" | "token_endpoint_auth_method"
      >;
   };

type OAuthConfig = ProvidedOAuthConfig | CustomOAuthConfig;

export type UserProfile = {
   sub: string;
   email: string;
   [key: string]: any;
};

export type IssuerConfig<UserInfo = any> = {
   type: SupportedTypes;
   client: RequireKeys<oauth.Client, "token_endpoint_auth_method">;
   as: oauth.AuthorizationServer & {
      scope_separator?: string;
   };
   profile: (
      info: UserInfo,
      config: Omit<IssuerConfig, "profile">,
      tokenResponse: any
   ) => Promise<UserProfile>;
};

export class OAuthCallbackException extends Exception {
   override name = "OAuthCallbackException";

   constructor(
      public error: any,
      public step: string
   ) {
      super("OAuthCallbackException on " + step);
   }
}

export class OAuthStrategy implements Strategy {
   constructor(private _config: OAuthConfig) {}

   get config() {
      return this._config;
   }

   getIssuerConfig(): IssuerConfig {
      return issuers[this.config.name];
   }

   async getConfig(): Promise<
      IssuerConfig & {
         client: {
            client_id: string;
            client_secret: string;
         };
      }
   > {
      const info = this.getIssuerConfig();

      if (info.type === "oidc") {
         const issuer = new URL(info.as.issuer);
         const request = await oauth.discoveryRequest(issuer);
         info.as = await oauth.processDiscoveryResponse(issuer, request);
      }

      return {
         ...info,
         type: info.type,
         client: {
            ...info.client,
            ...this._config.client
         }
      };
   }

   async getCodeChallenge(as: oauth.AuthorizationServer, state: string, method: "S256" = "S256") {
      const challenge_supported = as.code_challenge_methods_supported?.includes(method);
      let challenge: string | undefined;
      let challenge_method: string | undefined;
      if (challenge_supported) {
         challenge = await oauth.calculatePKCECodeChallenge(state);
         challenge_method = method;
      }

      return { challenge_supported, challenge, challenge_method };
   }

   async request(options: { redirect_uri: string; state: string; scopes?: string[] }): Promise<{
      url: string;
      endpoint: string;
      params: Record<string, string>;
   }> {
      const { client, as } = await this.getConfig();

      const { challenge_supported, challenge, challenge_method } = await this.getCodeChallenge(
         as,
         options.state
      );

      if (!as.authorization_endpoint) {
         throw new Error("authorization_endpoint is not provided");
      }

      const scopes = options.scopes ?? as.scopes_supported;
      if (!Array.isArray(scopes) || scopes.length === 0) {
         throw new Error("No scopes provided");
      }

      if (scopes.every((scope) => !as.scopes_supported?.includes(scope))) {
         throw new Error("Invalid scopes provided");
      }

      const endpoint = as.authorization_endpoint!;
      const params: any = {
         client_id: client.client_id,
         redirect_uri: options.redirect_uri,
         response_type: "code",
         scope: scopes.join(as.scope_separator ?? " ")
      };
      if (challenge_supported) {
         params.code_challenge = challenge;
         params.code_challenge_method = challenge_method;
      } else {
         params.nonce = options.state;
      }

      return {
         url: new URL(endpoint) + "?" + new URLSearchParams(params).toString(),
         endpoint,
         params
      };
   }

   private async oidc(
      callbackParams: URL | URLSearchParams,
      options: { redirect_uri: string; state: string; scopes?: string[] }
   ) {
      const config = await this.getConfig();
      const { client, as, type } = config;
      //console.log("config", config);
      //console.log("callbackParams", callbackParams, options);
      const parameters = oauth.validateAuthResponse(
         as,
         client, // no client_secret required
         callbackParams,
         oauth.expectNoState
      );
      if (oauth.isOAuth2Error(parameters)) {
         //console.log("callback.error", parameters);
         throw new OAuthCallbackException(parameters, "validateAuthResponse");
      }
      /*console.log(
         "callback.parameters",
         JSON.stringify(Object.fromEntries(parameters.entries()), null, 2),
      );*/
      const response = await oauth.authorizationCodeGrantRequest(
         as,
         client,
         parameters,
         options.redirect_uri,
         options.state
      );
      //console.log("callback.response", response);

      const challenges = oauth.parseWwwAuthenticateChallenges(response);
      if (challenges) {
         for (const challenge of challenges) {
            //console.log("callback.challenge", challenge);
         }
         // @todo: Handle www-authenticate challenges as needed
         throw new OAuthCallbackException(challenges, "www-authenticate");
      }

      const { challenge_supported, challenge } = await this.getCodeChallenge(as, options.state);

      const expectedNonce = challenge_supported ? undefined : challenge;
      const result = await oauth.processAuthorizationCodeOpenIDResponse(
         as,
         client,
         response,
         expectedNonce
      );
      if (oauth.isOAuth2Error(result)) {
         //console.log("callback.error", result);
         // @todo: Handle OAuth 2.0 response body error
         throw new OAuthCallbackException(result, "processAuthorizationCodeOpenIDResponse");
      }

      //console.log("callback.result", result);

      const claims = oauth.getValidatedIdTokenClaims(result);
      //console.log("callback.IDTokenClaims", claims);

      const infoRequest = await oauth.userInfoRequest(as, client, result.access_token!);

      const resultUser = await oauth.processUserInfoResponse(as, client, claims.sub, infoRequest);
      //console.log("callback.resultUser", resultUser);

      return await config.profile(resultUser, config, claims); // @todo: check claims
   }

   private async oauth2(
      callbackParams: URL | URLSearchParams,
      options: { redirect_uri: string; state: string; scopes?: string[] }
   ) {
      const config = await this.getConfig();
      const { client, type, as, profile } = config;
      console.log("config", { client, as, type });
      console.log("callbackParams", callbackParams, options);
      const parameters = oauth.validateAuthResponse(
         as,
         client, // no client_secret required
         callbackParams,
         oauth.expectNoState
      );
      if (oauth.isOAuth2Error(parameters)) {
         console.log("callback.error", parameters);
         throw new OAuthCallbackException(parameters, "validateAuthResponse");
      }
      console.log(
         "callback.parameters",
         JSON.stringify(Object.fromEntries(parameters.entries()), null, 2)
      );
      const response = await oauth.authorizationCodeGrantRequest(
         as,
         client,
         parameters,
         options.redirect_uri,
         options.state
      );

      const challenges = oauth.parseWwwAuthenticateChallenges(response);
      if (challenges) {
         for (const challenge of challenges) {
            //console.log("callback.challenge", challenge);
         }
         // @todo: Handle www-authenticate challenges as needed
         throw new OAuthCallbackException(challenges, "www-authenticate");
      }

      // slack does not return valid "token_type"...
      const copy = response.clone();
      let result: any = {};
      try {
         result = await oauth.processAuthorizationCodeOAuth2Response(as, client, response);
         if (oauth.isOAuth2Error(result)) {
            console.log("error", result);
            throw new Error(); // Handle OAuth 2.0 response body error
         }
      } catch (e) {
         result = (await copy.json()) as any;
         console.log("failed", result);
      }

      const res2 = await oauth.userInfoRequest(as, client, result.access_token!);
      const user = await res2.json();
      console.log("res2", res2, user);

      console.log("result", result);
      return await config.profile(user, config, result);
   }

   async callback(
      callbackParams: URL | URLSearchParams,
      options: { redirect_uri: string; state: string; scopes?: string[] }
   ): Promise<UserProfile> {
      const type = this.getIssuerConfig().type;

      console.log("type", type);
      switch (type) {
         case "oidc":
            return await this.oidc(callbackParams, options);
         case "oauth2":
            return await this.oauth2(callbackParams, options);
         default:
            throw new Error("Unsupported type");
      }
   }

   getController(auth: Authenticator): Hono<any> {
      const hono = new Hono();
      const secret = "secret";
      const cookie_name = "_challenge";

      const setState = async (
         c: Context,
         config: { state: string; action: AuthAction; redirect?: string }
      ): Promise<void> => {
         await setSignedCookie(c, cookie_name, JSON.stringify(config), secret, {
            secure: true,
            httpOnly: true,
            sameSite: "Lax",
            maxAge: 60 * 5 // 5 minutes
         });
      };

      const getState = async (
         c: Context
      ): Promise<{ state: string; action: AuthAction; redirect?: string }> => {
         const state = await getSignedCookie(c, secret, cookie_name);
         try {
            return JSON.parse(state as string);
         } catch (e) {
            throw new Error("Invalid state");
         }
      };

      hono.get("/callback", async (c) => {
         const url = new URL(c.req.url);
         const params = new URLSearchParams(url.search);

         const state = await getState(c);
         console.log("url", url);

         const profile = await this.callback(params, {
            redirect_uri: url.origin + url.pathname,
            state: state.state
         });

         const { user, token } = await auth.resolve(state.action, this, profile.sub, profile);
         console.log("******** RESOLVED ********", { user, token });

         if (state.redirect) {
            console.log("redirect to", state.redirect + "?token=" + token);
            return c.redirect(state.redirect + "?token=" + token);
         }

         return c.json({ user, token });
      });

      hono.get("/:action", async (c) => {
         const action = c.req.param("action") as AuthAction;
         if (!["login", "register"].includes(action)) {
            return c.notFound();
         }

         const url = new URL(c.req.url);
         const path = url.pathname.replace(`/${action}`, "");
         const redirect_uri = url.origin + path + "/callback";
         const q_redirect = (c.req.query("redirect") as string) ?? undefined;

         const state = await oauth.generateRandomCodeVerifier();
         const response = await this.request({
            redirect_uri,
            state
         });
         //console.log("_state", state);

         await setState(c, { state, action, redirect: q_redirect });

         if (c.req.header("Accept") === "application/json") {
            return c.json({
               url: response.url,
               redirect_uri,
               challenge: state,
               params: response.params
            });
         }

         //return c.text(response.url);
         console.log("--redirecting to", response.url);

         return c.redirect(response.url);
      });

      return hono;
   }

   getType() {
      return "oauth";
   }

   getMode() {
      return "external" as const;
   }

   getName() {
      return this.config.name;
   }

   getSchema() {
      return schemaProvided;
   }

   toJSON(secrets?: boolean) {
      const config = secrets ? this.config : filterKeys(this.config, ["secret", "client_id"]);

      return {
         type: this.getType(),
         config: {
            type: this.getIssuerConfig().type,
            ...config
         }
      };
   }
}