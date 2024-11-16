import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import { AppQueryClient } from "./utils/AppQueryClient";

const ClientContext = createContext<{ baseUrl: string; client: AppQueryClient }>({
   baseUrl: undefined
} as any);

export const queryClient = new QueryClient({
   defaultOptions: {
      queries: {
         retry: false,
         refetchOnWindowFocus: false
      }
   }
});

export const ClientProvider = ({ children, baseUrl }: { children?: any; baseUrl?: string }) => {
   const [actualBaseUrl, setActualBaseUrl] = useState<string | null>(null);

   try {
      const _ctx_baseUrl = useBaseUrl();
      if (_ctx_baseUrl) {
         console.warn("wrapped many times");
         setActualBaseUrl(_ctx_baseUrl);
      }
   } catch (e) {
      console.error("error", e);
   }

   useEffect(() => {
      // Only set base URL if running on the client side
      if (typeof window !== "undefined") {
         setActualBaseUrl(baseUrl || window.location.origin);
      }
   }, [baseUrl]);

   if (!actualBaseUrl) {
      // Optionally, return a fallback during SSR rendering
      return null; // or a loader/spinner if desired
   }

   console.log("client provider11 with", { baseUrl, fallback: actualBaseUrl });
   const client = createClient(actualBaseUrl);

   return (
      <QueryClientProvider client={queryClient}>
         <ClientContext.Provider value={{ baseUrl: actualBaseUrl, client }}>
            {children}
         </ClientContext.Provider>
      </QueryClientProvider>
   );
};

export function createClient(baseUrl: string = window.location.origin) {
   return new AppQueryClient(baseUrl);
}

export function createOrUseClient(baseUrl: string = window.location.origin) {
   const context = useContext(ClientContext);
   if (!context) {
      console.warn("createOrUseClient returned a new client");
      return createClient(baseUrl);
   }

   return context.client;
}

export const useClient = () => {
   const context = useContext(ClientContext);
   if (!context) {
      throw new Error("useClient must be used within a ClientProvider");
   }

   console.log("useClient", context.baseUrl);
   return context.client;
};

export const useBaseUrl = () => {
   const context = useContext(ClientContext);
   return context.baseUrl;
};