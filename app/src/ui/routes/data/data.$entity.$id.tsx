import { encodeSearch, ucFirst } from "core/utils";
import type { Entity, EntityData } from "data";
import type { EntityRelation } from "data";
import { Fragment, memo, useState } from "react";
import { TbArrowLeft, TbDots } from "react-icons/tb";
import { useBkndData } from "ui/client/schema/data/use-bknd-data";
import { EntityForm } from "ui/modules/data/components/EntityForm";
import { EntityTable2 } from "ui/modules/data/components/EntityTable2";
import { useEntityForm } from "ui/modules/data/hooks/useEntityForm";
import { useClient } from "../../client";
import { useBknd } from "../../client";
import { Button } from "../../components/buttons/Button";
import { IconButton } from "../../components/buttons/IconButton";
import { Dropdown } from "../../components/overlay/Dropdown";
import { useEntity } from "../../container";
import { useBrowserTitle } from "../../hooks/use-browser-title";
import * as AppShell from "../../layouts/AppShell/AppShell";
import { SectionHeaderLink } from "../../layouts/AppShell/AppShell";
import { Breadcrumbs2 } from "../../layouts/AppShell/Breadcrumbs2";
import { routes, useNavigate } from "../../lib/routes";
import { bkndModals } from "../../modals";

export function DataEntityUpdate({ params }) {
   const { $data, relations } = useBkndData();
   const entity = $data.entity(params.entity as string)!;
   const entityId = Number.parseInt(params.id as string);
   const [error, setError] = useState<string | null>(null);
   const [navigate] = useNavigate();
   useBrowserTitle(["Data", entity.label, `#${entityId}`]);
   const targetRelations = relations.listableRelationsOf(entity);
   //console.log("targetRelations", targetRelations, relations.relationsOf(entity));
   // filter out polymorphic for now
   //.filter((r) => r.type() !== "poly");
   const local_relation_refs = relations
      .sourceRelationsOf(entity)
      ?.map((r) => r.other(entity).reference);

   const container = useEntity(entity.name, entityId, {
      fetch: {
         query: {
            with: local_relation_refs
         }
      }
   });

   function goBack(state?: Record<string, any>) {
      window.history.go(-1);
   }

   async function onSubmitted(changeSet?: EntityData) {
      console.log("update:changeSet", changeSet);
      //return;
      if (!changeSet) {
         goBack();
         return;
      }

      const res = await container.actions.update(changeSet);
      console.log("update:res", res);
      if (res.data?.error) {
         setError(res.data.error);
      } else {
         error && setError(null);
         goBack();
      }
   }

   async function handleDelete() {
      if (confirm("Are you sure to delete?")) {
         const res = await container.actions.remove();
         if (res.error) {
            setError(res.error);
         } else {
            error && setError(null);
            goBack();
         }
      }
   }

   const { Form, handleSubmit } = useEntityForm({
      action: "update",
      entity,
      initialData: container.data,
      onSubmitted
   });
   //console.log("form.data", Form.state.values, container.data);

   const makeKey = (key: string | number = "") =>
      `${params.entity.name}_${entityId}_${String(key)}`;

   const fieldsDisabled =
      container.raw.fetch?.isLoading ||
      container.status.fetch.isUpdating ||
      Form.state.isSubmitting;

   return (
      <Fragment key={makeKey()}>
         <AppShell.SectionHeader
            right={
               <>
                  <Dropdown
                     position="bottom-end"
                     items={[
                        {
                           label: "Inspect",
                           onClick: () => {
                              bkndModals.open("debug", {
                                 data: {
                                    data: container.data as any,
                                    entity: entity.toJSON(),
                                    schema: entity.toSchema(true),
                                    form: Form.state.values,
                                    state: Form.state
                                 }
                              });
                           }
                        },
                        {
                           label: "Settings",
                           onClick: () =>
                              navigate(routes.settings.path(["data", "entities", entity.name]), {
                                 absolute: true
                              })
                        },
                        {
                           label: "Delete",
                           onClick: handleDelete,
                           destructive: true,
                           disabled: fieldsDisabled
                        }
                     ]}
                  >
                     <IconButton Icon={TbDots} />
                  </Dropdown>
                  <Form.Subscribe
                     selector={(state) => [state.canSubmit, state.isSubmitting]}
                     children={([canSubmit, isSubmitting]) => (
                        <Button
                           type="button"
                           onClick={Form.handleSubmit}
                           variant="primary"
                           tabIndex={entity.fields.length + 1}
                           disabled={!canSubmit || isSubmitting || fieldsDisabled}
                        >
                           Update
                        </Button>
                     )}
                  />
               </>
            }
            className="pl-3"
         >
            <Breadcrumbs2
               path={[
                  { label: entity.label, href: routes.data.entity.list(entity.name) },
                  { label: `Edit #${entityId}` }
               ]}
            />
         </AppShell.SectionHeader>
         <AppShell.Scrollable>
            {error && (
               <div className="flex flex-row dark:bg-red-950 bg-red-100 p-4">
                  <b className="mr-2">Update failed: </b> {error}
               </div>
            )}
            <EntityForm
               entity={entity}
               entityId={entityId}
               handleSubmit={handleSubmit}
               fieldsDisabled={fieldsDisabled}
               data={container.data ?? undefined}
               Form={Form}
               action="update"
               className="flex flex-grow flex-col gap-3 p-3"
            />
            {targetRelations.length > 0 ? (
               <EntityDetailRelations id={entityId} entity={entity} relations={targetRelations} />
            ) : null}
         </AppShell.Scrollable>
      </Fragment>
   );
}

function EntityDetailRelations({
   id,
   entity,
   relations
}: {
   id: number;
   entity: Entity;
   relations: EntityRelation[];
}) {
   const [selected, setSelected] = useState<EntityRelation>(
      // @ts-ignore
      relations.length > 0 ? relations[0] : undefined
   );

   function handleClick(relation: EntityRelation) {
      setSelected(relation);
   }

   if (relations.length === 0) {
      return null;
   }

   //console.log("selected", selected, relations[0].helper(entity.name).other.reference);

   return (
      <div className="flex flex-col max-w-full">
         <AppShell.SectionHeaderTabs
            title="Relations"
            items={relations.map((relation) => {
               const other = relation.other(entity);

               return {
                  as: "button",
                  type: "button",
                  label: ucFirst(other.reference),
                  onClick: () => handleClick(relation),
                  active: selected?.other(entity).reference === other.reference,
                  badge: relation.type()
               };
            })}
         />
         <div className="flex flex-grow flex-col gap-3 p-3">
            <EntityDetailInner id={id} entity={entity} relation={selected} />
         </div>
      </div>
   );
}

function EntityDetailInner({
   id,
   entity,
   relation
}: {
   id: number;
   entity: Entity;
   relation: EntityRelation;
}) {
   const other = relation.other(entity);
   const client = useClient();
   const [navigate] = useNavigate();

   const search = {
      select: other.entity.getSelect(undefined, "table"),
      limit: 10,
      offset: 0
   };
   const query = client
      .query()
      .data.entity(entity.name)
      .readManyByReference(id, other.reference, other.entity.name, search);

   function handleClickRow(row: Record<string, any>) {
      navigate(routes.data.entity.edit(other.entity.name, row.id));
   }

   function handleClickNew() {
      try {
         const ref = relation.getReferenceQuery(other.entity, id, other.reference);

         navigate(routes.data.entity.create(other.entity.name), {
            query: ref.where
         });
         //navigate(routes.data.entity.create(other.entity.name) + `?${query}`);
      } catch (e) {
         console.error("handleClickNew", e);
      }
   }

   if (query.isPending) {
      return null;
   }

   const isUpdating = query.isInitialLoading || query.isFetching;
   //console.log("query", query, search.select);

   return (
      <div
         data-updating={isUpdating ? 1 : undefined}
         className="transition-opacity data-[updating]:opacity-50"
      >
         <EntityTable2
            select={search.select}
            data={query.data?.data ?? []}
            entity={other.entity}
            onClickRow={handleClickRow}
            onClickNew={handleClickNew}
            page={1}
            /* @ts-ignore */
            total={query.data?.body?.meta?.count ?? 1}
            /*onClickPage={handleClickPage}*/
         />
      </div>
   );
}
