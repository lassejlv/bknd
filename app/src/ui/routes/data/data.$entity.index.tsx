import { Type } from "core/utils";
import { querySchema } from "data";
import { TbDots } from "react-icons/tb";
import { useBkndData } from "ui/client/schema/data/use-bknd-data";
import { Empty } from "ui/components/display/Empty";
import { Message } from "ui/components/display/Message";
import { EntityTable2 } from "ui/modules/data/components/EntityTable2";
import { useBknd } from "../../client";
import { Button } from "../../components/buttons/Button";
import { IconButton } from "../../components/buttons/IconButton";
import { Dropdown } from "../../components/overlay/Dropdown";
import { EntitiesContainer } from "../../container";
import { useBrowserTitle } from "../../hooks/use-browser-title";
import { useSearch } from "../../hooks/use-search";
import * as AppShell from "../../layouts/AppShell/AppShell";
import { routes, useNavigate } from "../../lib/routes";

// @todo: migrate to Typebox
const searchSchema = Type.Composite(
   [
      Type.Pick(querySchema, ["select", "where", "sort"]),
      Type.Object({
         page: Type.Optional(Type.Number({ default: 1 })),
         perPage: Type.Optional(Type.Number({ default: 10 }))
      })
   ],
   { additionalProperties: false }
);

export function DataEntityList({ params }) {
   const { $data, relations } = useBkndData();
   const entity = $data.entity(params.entity as string);
   const [navigate] = useNavigate();
   const search = useSearch(searchSchema, {
      select: entity?.getSelect(undefined, "table") ?? [],
      sort: entity?.getDefaultSort()
   });
   console.log("search", search.value);
   useBrowserTitle(["Data", entity?.label ?? params.entity]);
   const PER_PAGE_OPTIONS = [5, 10, 25];

   //console.log("search", search.value);

   function handleClickRow(row: Record<string, any>) {
      if (entity) navigate(routes.data.entity.edit(entity.name, row.id));
   }

   function handleClickPage(page: number) {
      search.set("page", page);
   }

   function handleSortClick(name: string) {
      const sort = search.value.sort!;
      const newSort = { by: name, dir: sort.by === name && sort.dir === "asc" ? "desc" : "asc" };

      // // @ts-expect-error - somehow all search keys are optional
      console.log("new sort", newSort);
      search.set("sort", newSort as any);
   }

   function handleClickPerPage(perPage: number) {
      // @todo: also reset page to 1
      search.set("perPage", perPage);
   }

   if (!entity) {
      return <Message.NotFound description={`Entity "${params.entity}" doesn't exist.`} />;
   }

   return (
      <>
         <AppShell.SectionHeader
            right={
               <>
                  <Dropdown
                     items={[
                        {
                           label: "Settings",
                           onClick: () =>
                              navigate(routes.settings.path(["data", "entities", entity.name]), {
                                 absolute: true
                              })
                        }
                     ]}
                     position="bottom-end"
                  >
                     <IconButton Icon={TbDots} />
                  </Dropdown>
                  <Button
                     onClick={() => {
                        navigate(routes.data.entity.create(entity.name));
                     }}
                     variant="primary"
                  >
                     Create new
                  </Button>
               </>
            }
         >
            {entity.label}
         </AppShell.SectionHeader>
         <AppShell.Scrollable key={entity.name}>
            <div className="flex flex-col flex-grow p-3 gap-3">
               {/*<div className="w-64">
                  <SearchInput placeholder={`Filter ${entity.label}`} />
               </div>*/}

               <EntitiesContainer
                  entity={entity.name}
                  query={{
                     select: search.value.select,
                     limit: search.value.perPage,
                     offset: (search.value.page - 1) * search.value.perPage,
                     sort: search.value.sort
                  }}
               >
                  {(params) => {
                     if (params.status.fetch.isLoading) {
                        return null;
                     }

                     const isUpdating = params.status.fetch.isUpdating;

                     return (
                        <div
                           data-updating={isUpdating ? 1 : undefined}
                           className="data-[updating]:opacity-50 transition-opacity pb-10"
                        >
                           <EntityTable2
                              data={params.data ?? []}
                              entity={entity}
                              select={search.value.select}
                              onClickRow={handleClickRow}
                              page={search.value.page}
                              sort={search.value.sort}
                              onClickSort={handleSortClick}
                              perPage={search.value.perPage}
                              perPageOptions={PER_PAGE_OPTIONS}
                              total={params.meta?.count}
                              onClickPage={handleClickPage}
                              onClickPerPage={handleClickPerPage}
                           />
                        </div>
                     );
                  }}
               </EntitiesContainer>
            </div>
         </AppShell.Scrollable>
      </>
   );
}
