import { getHotkeyHandler, useHotkeys } from "@mantine/hooks";
import type { FieldApi } from "@tanstack/react-form";
import { ucFirst } from "core/utils";
import type { EntityData, RelationField } from "data";
import { useEffect, useRef, useState } from "react";
import { TbEye } from "react-icons/tb";
import { Button } from "ui";
import { useBknd, useClient } from "ui/client";
import * as Formy from "ui/components/form/Formy";
import { Popover } from "ui/components/overlay/Popover";
import { useEntities } from "ui/container";
import { routes } from "ui/lib/routes";
import { EntityTable2 } from "ui/modules/data/components/EntityTable2";
import { useLocation } from "wouter";

// @todo: allow clear if not required
export function EntityRelationalFormField({
   fieldApi,
   field,
   data,
   disabled,
   tabIndex
}: {
   fieldApi: FieldApi<any, any>;
   field: RelationField;
   data?: EntityData;
   disabled?: boolean;
   tabIndex?: number;
}) {
   const { app } = useBknd();
   const entity = app.entity(field.target())!;
   const [query, setQuery] = useState<any>({ limit: 10, page: 1, perPage: 10 });
   const [location, navigate] = useLocation();
   const ref = useRef<any>(null);
   const client = useClient();
   const container = useEntities(
      field.target(),
      {
         limit: query.limit,
         offset: (query.page - 1) * query.limit,
         select: entity.getSelect(undefined, "table")
      },
      { enabled: true }
   );
   const [_value, _setValue] = useState<{ id: number | undefined; [key: string]: any }>();

   const referenceField = data?.[field.reference()];
   const relationalField = data?.[field.name];

   useEffect(() => {
      _setValue(data?.[field.reference()]);
   }, [referenceField]);

   useEffect(() => {
      (async () => {
         const rel_value = field.target();
         if (!rel_value || !relationalField) return;

         console.log("-- need to fetch", field.target(), relationalField);
         const fetched = await client.api.data.readOne(field.target(), relationalField);
         if (fetched.res.ok && fetched.data) {
            _setValue(fetched.data as any);
         }
         console.log("-- fetched", fetched);

         console.log("relation", {
            referenceField,
            relationalField,
            data,
            field,
            entity
         });
      })();
   }, [relationalField]);

   /*const initialValue: { id: number | undefined; [key: string]: any } = data?.[
      field.reference()
   ] ?? {
      id: data?.[field.name],
   };*/

   function handleViewItem(e: React.MouseEvent<HTMLButtonElement>) {
      e.preventDefault();
      e.stopPropagation();
      console.log("yo");
      if (_value) {
         navigate(routes.data.entity.edit(entity.name, _value.id as any));
      }
   }

   /*console.log(
      "relationfield:data",
      { _value, initialValue },
      data,
      field.reference(),
      entity,
      //container.entity,
      //data[field.reference()],
      data?.[field.name],
      field,
   );*/

   // fix missing value on fields that are required
   useEffect(() => {
      if (field.isRequired() && !fieldApi.state.value) {
         fieldApi.setValue(container.data?.[0]?.id);
      }
   }, [container.data]);

   return (
      <Formy.Group>
         <Formy.Label htmlFor={fieldApi.name}>{field.getLabel()}</Formy.Label>
         <div
            data-disabled={!Array.isArray(container.data) || disabled ? 1 : undefined}
            className="data-[disabled]:opacity-70 data-[disabled]:pointer-events-none"
         >
            <Popover
               backdrop
               className=""
               target={({ toggle }) => (
                  <PopoverTable
                     container={container}
                     entity={entity}
                     query={query}
                     toggle={toggle}
                     onClickRow={(row) => {
                        fieldApi.setValue(row.id);
                        _setValue(row as any);
                        toggle();
                     }}
                     onClickPage={(page) => {
                        console.log("setting page", page);
                        setQuery((prev) => ({ ...prev, page }));
                     }}
                  />
               )}
            >
               <div
                  ref={ref}
                  className="bg-muted/40 w-full h-11 focus:bg-muted rounded-md items-center px-2.5 outline-none focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-transparent transition-all disabled:bg-muted/50 disabled:text-primary/50 cursor-pointer active:bg-muted/80 hover:bg-muted/60 flex flex-row gap-2"
                  tabIndex={tabIndex}
                  onKeyDown={getHotkeyHandler([
                     [
                        "Enter",
                        () => {
                           ref.current?.click();
                        }
                     ]
                  ])}
               >
                  {_value ? (
                     <>
                        <div className="flex bg-primary/10 px-2 leading-none py-1.5 rounded-lg font-mono text-sm">
                           {ucFirst(entity.name)}
                        </div>
                        <div className="flex flex-row gap-3 overflow-clip w-1 flex-grow">
                           {_value &&
                              Object.entries(_value).map(([key, value]) => {
                                 const field = entity.getField(key)!;
                                 if (field.isHidden("table")) return null;

                                 const _value = field.getValue(value, "table");
                                 return (
                                    <div
                                       key={key}
                                       className="flex flex-row gap-1 items-center flex-nowrap"
                                    >
                                       <span className="opacity-60 text-nowrap">
                                          {field.getLabel()}:
                                       </span>{" "}
                                       {_value !== null && typeof value !== "undefined" ? (
                                          <span className="text-nowrap truncate">{_value}</span>
                                       ) : (
                                          <span className="opacity-30 text-nowrap font-mono mt-0.5">
                                             null
                                          </span>
                                       )}
                                    </div>
                                 );
                              })}
                        </div>
                        <Button IconLeft={TbEye} onClick={handleViewItem} size="small">
                           View
                        </Button>
                     </>
                  ) : (
                     <div className="pl-2">- Select -</div>
                  )}
               </div>
            </Popover>
         </div>
         <Formy.Input
            type="hidden"
            name={fieldApi.name}
            id={fieldApi.name}
            value={fieldApi.state.value ?? ""}
            onChange={console.log}
            tabIndex={-1}
         />
      </Formy.Group>
   );
}

const PopoverTable = ({ container, entity, query, toggle, onClickRow, onClickPage }) => {
   function handleNext() {
      if (query.limit * query.page < container.meta?.count) {
         onClickPage(query.page + 1);
      }
   }

   function handlePrev() {
      if (query.page > 1) {
         onClickPage(query.page - 1);
      }
   }

   useHotkeys([
      ["ArrowRight", handleNext],
      ["ArrowLeft", handlePrev],
      ["Escape", toggle]
   ]);

   return (
      <div>
         <EntityTable2
            classNames={{ value: "line-clamp-1 truncate max-w-52 text-nowrap" }}
            data={container.data ?? []}
            entity={entity}
            select={entity.getSelect(undefined, "table")}
            total={container.meta?.count}
            page={query.page}
            onClickRow={onClickRow}
            onClickPage={onClickPage}
         />
      </div>
   );
};
