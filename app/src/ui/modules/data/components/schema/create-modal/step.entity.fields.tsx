import { typeboxResolver } from "@hookform/resolvers/typebox";
import { type TAppDataEntityFields, entitiesSchema } from "data/data-schema";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { MantineSelect } from "ui/components/form/hook-form-mantine/MantineSelect";
import { useEvent } from "ui/hooks/use-event";
import {
   EntityFieldsForm,
   type EntityFieldsFormRef
} from "ui/routes/data/forms/entity.fields.form";
import { ModalBody, ModalFooter, type TCreateModalSchema, useStepContext } from "./CreateModal";

const schema = entitiesSchema;

export function StepEntityFields() {
   const { nextStep, stepBack, state, setState } = useStepContext<TCreateModalSchema>();
   const entity = state.entities?.create?.[0]!;
   const defaultFields = { id: { type: "primary", name: "id" } } as const;
   const ref = useRef<EntityFieldsFormRef>(null);
   const {
      control,
      formState: { isValid, errors },
      getValues,
      handleSubmit,
      watch,
      register,
      setValue
   } = useForm({
      mode: "onTouched",
      resolver: typeboxResolver(schema),
      defaultValues: {
         ...entity,
         fields: defaultFields,
         config: {
            sort_field: "id",
            sort_dir: "asc"
         }
      }
   });

   const values = watch();

   const updateListener = useEvent((data: TAppDataEntityFields) => {
      console.log("updateListener", data);
      setValue("fields", data as any);
   });

   function handleNext() {
      if (isValid && ref.current?.isValid()) {
         setState((prev) => {
            const entity = prev.entities?.create?.[0];
            if (!entity) return prev;

            return {
               ...prev,
               entities: {
                  create: [getValues() as any]
               }
            };
         });

         nextStep("create")();
      } else {
         console.warn("not valid");
      }
   }

   return (
      <form onSubmit={handleSubmit(handleNext)}>
         <ModalBody>
            <div className="flex flex-col gap-6">
               <div className="flex flex-col gap-3">
                  <p>
                     Add fields to <strong>{entity.name}</strong>:
                  </p>
                  <div className="flex flex-col gap-1">
                     <EntityFieldsForm ref={ref} fields={defaultFields} onChange={updateListener} />
                  </div>
               </div>
               <div className="flex flex-col gap-3">
                  <p>How should it be sorted by default?</p>
                  <div className="flex flex-row gap-2">
                     <MantineSelect
                        label="Field"
                        data={Object.keys(values.fields).filter((name) => name.length > 0)}
                        placeholder="Select field"
                        name="config.sort_field"
                        allowDeselect={false}
                        control={control}
                     />
                     <MantineSelect
                        label="Direction"
                        data={["asc", "desc"]}
                        defaultValue="asc"
                        placeholder="Select direction"
                        name="config.sort_dir"
                        allowDeselect={false}
                        control={control}
                     />
                  </div>
               </div>
               <div>
                  {Object.entries(errors).map(([key, value]) => (
                     <p key={key}>
                        {key}: {value.message}
                     </p>
                  ))}
               </div>
            </div>
         </ModalBody>
         <ModalFooter
            next={{
               disabled: !isValid,
               type: "submit"
               //onClick: handleNext
            }}
            prev={{ onClick: stepBack }}
            debug={{ state, values }}
         />
      </form>
   );
}