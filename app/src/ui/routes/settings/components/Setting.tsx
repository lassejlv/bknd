import { useHotkeys } from "@mantine/hooks";
import { type TObject, ucFirst } from "core/utils";
import { omit } from "lodash-es";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { TbSettings } from "react-icons/tb";
import { useAuth } from "ui";
import { Link, Route, useLocation } from "wouter";
import { useBknd } from "../../../client/BkndProvider";
import { Button } from "../../../components/buttons/Button";
import { IconButton } from "../../../components/buttons/IconButton";
import { Empty } from "../../../components/display/Empty";
import {
   JsonSchemaForm,
   type JsonSchemaFormRef
} from "../../../components/form/json-schema/JsonSchemaForm";
import { Dropdown } from "../../../components/overlay/Dropdown";
import { DataTable } from "../../../components/table/DataTable";
import { useEvent } from "../../../hooks/use-event";
import * as AppShell from "../../../layouts/AppShell/AppShell";
import { SectionHeaderTabs } from "../../../layouts/AppShell/AppShell";
import { Breadcrumbs } from "../../../layouts/AppShell/Breadcrumbs";
import { extractSchema } from "../utils/schema";
import { SettingNewModal, type SettingsNewModalProps } from "./SettingNewModal";
import { SettingSchemaModal, type SettingsSchemaModalRef } from "./SettingSchemaModal";

export type SettingProps<
   Schema extends TObject = TObject,
   Props = Schema extends TObject<infer TProperties> ? TProperties : any
> = {
   schema: Schema;
   config: any;
   prefix?: string;
   path?: string[];
   uiSchema?: any;
   options?: {
      allowDelete?: (config: any) => boolean;
      allowEdit?: (config: any) => boolean;
      showAlert?: (config: any) => string | ReactNode | undefined;
   };
   properties?: {
      [key in keyof Partial<Props>]: {
         extract?: boolean;
         hide?: boolean;
         new?: Pick<SettingsNewModalProps, "schema" | "generateKey" | "uiSchema" | "anyOfValues">;
         tableValues?: (config: any) => Record<string, any>[];
      };
   };
};

export function Setting<Schema extends TObject = any>({
   schema,
   uiSchema,
   config,
   prefix = "/",
   options,
   path = [],
   properties
}: SettingProps<Schema>) {
   const [submitting, setSubmitting] = useState(false);
   const { actions } = useBknd();
   const formRef = useRef<JsonSchemaFormRef>(null);
   const schemaLocalModalRef = useRef<SettingsSchemaModalRef>(null);
   const schemaModalRef = useRef<SettingsSchemaModalRef>(null);

   const [editing, setEditing] = useState(false);
   useHotkeys([
      [
         "mod+s",
         (e) => {
            e.preventDefault();
            onSave();
            return false;
         }
      ],
      [
         "e",
         () => {
            if (!editing) {
               onToggleEdit();
            }
         }
      ],
      [
         "Escape",
         () => {
            if (editing) {
               onToggleEdit();
            }
         }
      ]
   ]);

   const exclude = useMemo(
      () =>
         properties
            ? Object.entries(properties)
                 .filter(([, value]) => value.hide || value.extract)
                 .map(([key]) => key)
            : [],
      [properties]
   );

   const goBack = useEvent((replace?: boolean) => {
      const backHref = window.location.href.split("/").slice(0, -1).join("/");
      if (replace) {
         window.location.replace(backHref);
      } else {
         window.history.back();
      }
      return;
   });

   const deleteAllowed = options?.allowDelete?.(config) ?? true;
   const editAllowed = options?.allowEdit?.(config) ?? true;
   const showAlert = options?.showAlert?.(config) ?? undefined;

   console.log("--setting", { schema, config, prefix, path, exclude });
   const [reducedSchema, reducedConfig, extracted] = extractSchema(schema, config, exclude);
   console.log({ reducedSchema, reducedConfig, extracted });

   const extractedKeys = Object.keys(extracted);
   const selectedSubKey =
      extractedKeys.find((key) => window.location.pathname.endsWith(key)) ?? extractedKeys[0];

   const onToggleEdit = useEvent(() => {
      if (!editAllowed) return;

      setEditing((prev) => !prev);
      //formRef.current?.cancel();
   });

   const onSave = useEvent(async () => {
      if (!editAllowed || !editing) return;

      if (formRef.current?.validateForm()) {
         setSubmitting(true);
         const data = formRef.current?.formData();
         const [module, ...restOfPath] = path;
         let success: boolean;

         console.log("save:data", { module, restOfPath }, data);
         if (restOfPath.length > 0) {
            // patch
            console.log("-> patch", { module, path: restOfPath.join(".") }, data);
            success = await actions.patch(module as any, restOfPath.join("."), data);
         } else {
            // set
            console.log("-> set", { module }, data);
            success = await actions.set(module as any, data, true);
         }

         console.log("save:success", success);
         if (success) {
            //window.location.reload();
         } else {
            setSubmitting(false);
         }
      }
   });

   const handleDelete = useEvent(async () => {
      if (!deleteAllowed) return;

      const [module, ...restOfPath] = path;

      if (window.confirm(`Are you sure you want to delete ${path.join(".")}`)) {
         if (await actions.remove(module as any, restOfPath.join("."))) {
            goBack(true);
         }
      }
   });

   if (!config) {
      return (
         <Empty
            title="Not found"
            description={`Configuration at path ${path.join(".")} doesn't exist.`}
            buttonText="Go back"
         />
      );
   }

   return (
      <>
         <AppShell.SectionHeader
            className={path.length > 1 ? "pl-3" : ""}
            scrollable
            right={
               <>
                  <Dropdown
                     items={[
                        {
                           label: "Inspect local schema",
                           onClick: () => {
                              schemaLocalModalRef.current?.open();
                           }
                        },
                        {
                           label: "Inspect schema",
                           onClick: () => {
                              schemaModalRef.current?.open();
                           }
                        },
                        deleteAllowed && {
                           label: "Delete",
                           destructive: true,
                           onClick: handleDelete
                        }
                     ]}
                     position="bottom-end"
                  >
                     <IconButton Icon={TbSettings} />
                  </Dropdown>
                  <Button onClick={onToggleEdit} disabled={!editAllowed}>
                     {editing ? "Cancel" : "Edit"}
                  </Button>
                  {editing && (
                     <Button
                        variant="primary"
                        onClick={onSave}
                        disabled={submitting || !editAllowed}
                     >
                        {submitting ? "Save..." : "Save"}
                     </Button>
                  )}
               </>
            }
         >
            <Breadcrumbs path={path} />
         </AppShell.SectionHeader>
         <AppShell.Scrollable key={path.join("-")}>
            {showAlert && (
               <div className="flex flex-row dark:bg-amber-300/20 bg-amber-200 p-4">
                  {showAlert}
               </div>
            )}

            <div className="flex flex-col flex-grow p-3 gap-3">
               <JsonSchemaForm
                  ref={formRef}
                  readonly={!editing}
                  schema={omit(reducedSchema, ["title"])}
                  formData={reducedConfig}
                  uiSchema={uiSchema}
                  onChange={console.log}
                  className="legacy hide-required-mark fieldset-alternative mute-root"
               />
            </div>

            {extractedKeys.length > 0 && (
               <div className="flex flex-col max-w-full">
                  <AppShell.SectionHeaderTabs
                     items={extractedKeys.map((sub) => ({
                        as: Link,
                        label: ucFirst(sub),
                        href: `${prefix}/${sub}`.replace(/\/+/g, "/"),
                        active: selectedSubKey === sub,
                        badge: Object.keys(extracted[sub]?.config ?? {}).length
                     }))}
                  />
                  <div className="flex flex-grow flex-col gap-3 p-3">
                     <Route
                        path="/:prop?"
                        component={({ params }) => {
                           const [, navigate] = useLocation();
                           const key = (params.prop ?? selectedSubKey) as string;
                           const localConfig = extracted[key]?.config ?? {};
                           const values = properties?.[key]?.tableValues
                              ? properties?.[key]?.tableValues(localConfig)
                              : Object.entries(localConfig).map(([key, value]) => {
                                   if (!value || typeof value !== "object") {
                                      return {
                                         key,
                                         value
                                      };
                                   }

                                   const fistValueKey = Object.keys(value)[0]!;
                                   const firstValueKeyValue = value[fistValueKey];
                                   const _value = omit(value as any, [fistValueKey]);
                                   return {
                                      key,
                                      [fistValueKey]: firstValueKeyValue,
                                      value: _value
                                   };
                                });
                           const newSetting = properties?.[key]?.new;

                           if (!key) {
                              return (
                                 <div className="h-80 flex justify-center align-center">
                                    <Empty
                                       title="No sub-setting selected"
                                       description="Select one from the tab bar"
                                    />
                                 </div>
                              );
                           }

                           return (
                              <>
                                 {newSetting && (
                                    <SettingNewModal
                                       schema={newSetting.schema}
                                       uiSchema={newSetting.uiSchema}
                                       anyOfValues={newSetting.anyOfValues}
                                       prefixPath={`/${key}/`}
                                       path={[...path, key]}
                                       generateKey={newSetting.generateKey}
                                    />
                                 )}
                                 <DataTable
                                    data={values}
                                    onClickRow={(row) => {
                                       const firstKeyValue = Object.values(row)[0];
                                       navigate(`/${key}/${firstKeyValue}`);
                                    }}
                                 />
                              </>
                           );
                        }}
                     />
                  </div>
               </div>
            )}
         </AppShell.Scrollable>

         <SettingSchemaModal
            ref={schemaLocalModalRef}
            title={path.join(".")}
            tabs={[
               {
                  title: "Schema",
                  json: reducedSchema
               },
               {
                  title: "Config",
                  json: reducedConfig
               }
            ]}
         />
         <SettingSchemaModal
            ref={schemaModalRef}
            title={path.join(".")}
            tabs={[
               {
                  title: "Schema",
                  json: schema
               },
               {
                  title: "Config",
                  json: config
               }
            ]}
         />
      </>
   );
}