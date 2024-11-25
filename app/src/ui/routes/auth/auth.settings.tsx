import { cloneDeep, omit } from "lodash-es";
import { useEffect, useRef } from "react";
import { useBknd } from "ui/client";
import { useBkndAuth } from "ui/client/schema/auth/use-bknd-auth";
import { useBkndData } from "ui/client/schema/data/use-bknd-data";
import { Button } from "ui/components/buttons/Button";
import { Alert } from "ui/components/display/Alert";
import {
   JsonSchemaForm,
   type JsonSchemaFormRef
} from "ui/components/form/json-schema/JsonSchemaForm";
import * as AppShell from "ui/layouts/AppShell/AppShell";
import { useNavigate } from "ui/lib/routes";
import { extractSchema } from "../settings/utils/schema";

// @todo: improve the inline editing expierence, for now redirect to settings
export function AuthSettingsList() {
   const { app } = useBknd();
   const [navigate] = useNavigate();
   useEffect(() => {
      navigate(app.getSettingsPath(["auth"]));
   }, []);

   return null;

   /*useBknd({ withSecrets: true });
   return <AuthSettingsListInternal />;*/
}

const uiSchema = {
   jwt: {
      fields: {
         "ui:options": {
            orderable: false
         }
      }
   }
};

function AuthSettingsListInternal() {
   const $auth = useBkndAuth();
   const { entities } = useBkndData();
   const formRef = useRef<JsonSchemaFormRef>(null);
   const config = $auth.config;
   const schema = cloneDeep(omit($auth.schema, ["title"]));
   const [generalSchema, generalConfig, extracted] = extractSchema(schema as any, config, [
      "jwt",
      "roles",
      "guard",
      "strategies"
   ]);
   try {
      const user_entity = config.entity_name ?? "users";
      const user_fields = Object.entries(entities[user_entity]?.fields ?? {})
         .map(([name, field]) => (!field.config?.virtual ? name : undefined))
         .filter(Boolean);

      if (user_fields) {
         console.log("user_fields", user_fields);
         extracted.jwt.schema.properties.fields.items.enum = user_fields;
         extracted.jwt.schema.properties.fields.uniqueItems = true;
         uiSchema.jwt.fields["ui:widget"] = "checkboxes";
      } else {
         uiSchema.jwt.fields["ui:widget"] = "hidden";
      }
   } catch (e) {
      console.error(e);
   }

   async function handleSubmit() {
      console.log(formRef.current?.validateForm(), formRef.current?.formData());
   }

   return (
      <>
         <AppShell.SectionHeader
            right={
               <Button variant="primary" onClick={handleSubmit}>
                  Update
               </Button>
            }
         >
            Settings
         </AppShell.SectionHeader>
         <AppShell.Scrollable>
            <Alert.Warning
               visible={!config.enabled}
               title="Auth not enabled"
               message="Enable it by toggling the switch below. Please also make sure set a secure secret to sign JWT tokens."
            />
            <div className="flex flex-col flex-grow px-5 py-4 gap-8">
               <div>
                  <JsonSchemaForm
                     schema={generalSchema}
                     className="legacy hide-required-mark fieldset-alternative mute-root"
                  />
               </div>

               <div className="flex flex-col gap-3">
                  <h3 className="font-bold">JWT Settings</h3>
                  <JsonSchemaForm
                     ref={formRef}
                     schema={extracted.jwt.schema}
                     uiSchema={uiSchema.jwt}
                     className="legacy hide-required-mark fieldset-alternative mute-root"
                  />
               </div>
            </div>
         </AppShell.Scrollable>
      </>
   );
}

function AuthJwtSettings() {}
