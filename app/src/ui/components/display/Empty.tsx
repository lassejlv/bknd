import { Button } from "../buttons/Button";

export type EmptyProps = {
   Icon?: any;
   title?: string;
   description?: string;
   buttonText?: string;
   buttonOnClick?: () => void;
};
export const Empty: React.FC<EmptyProps> = ({
   Icon = undefined,
   title = undefined,
   description = "Check back later my friend.",
   buttonText,
   buttonOnClick
}) => (
   <div className="flex flex-col h-full w-full justify-center items-center">
      <div className="flex flex-col gap-3 items-center max-w-80">
         {Icon && <Icon size={48} className="opacity-50" stroke={1} />}
         <div className="flex flex-col gap-1">
            {title && <h3 className="text-center text-lg font-bold">{title}</h3>}
            <p className="text-center text-primary/60">{description}</p>
         </div>
         {buttonText && (
            <div className="mt-1.5">
               <Button variant="primary" onClick={buttonOnClick}>
                  {buttonText}
               </Button>
            </div>
         )}
      </div>
   </div>
);
