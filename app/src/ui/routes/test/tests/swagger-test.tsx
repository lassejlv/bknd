import { useEffect } from "react";
import { Scrollable } from "ui/layouts/AppShell/AppShell";

function SwaggerUI() {
   useEffect(() => {
      // Create a script element to load the Swagger UI bundle
      const script = document.createElement("script");
      script.src = "https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js";
      script.crossOrigin = "anonymous";
      script.async = true;

      // Append the script to the body and set up Swagger UI once loaded
      script.onload = () => {
         // @ts-ignore
         if (window.SwaggerUIBundle) {
            // @ts-ignore
            window.ui = window.SwaggerUIBundle({
               url: "/api/system/openapi.json",
               dom_id: "#swagger-ui"
            });
         }
      };

      document.body.appendChild(script);

      // Cleanup script on unmount
      return () => {
         document.body.removeChild(script);
      };
   }, []);

   return (
      <>
         <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
         <Scrollable>
            <div id="swagger-ui" />
         </Scrollable>
      </>
   );
}

export default SwaggerUI;
