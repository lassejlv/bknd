import type { ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";

export type AlertProps = ComponentPropsWithoutRef<"div"> & {
   className?: string;
   visible?: boolean;
   title?: string;
   message?: string;
};

const Base: React.FC<AlertProps> = ({ visible = true, title, message, className, ...props }) =>
   visible ? (
      <div
         {...props}
         className={twMerge("flex flex-row dark:bg-amber-300/20 bg-amber-200 p-4", className)}
      >
         <div>
            {title && <b className="mr-2">{title}:</b>}
            {message}
         </div>
      </div>
   ) : null;

const Warning: React.FC<AlertProps> = (props) => (
   <Base {...props} className="dark:bg-amber-300/20 bg-amber-200" />
);

const Exception: React.FC<AlertProps> = (props) => (
   <Base {...props} className="dark:bg-red-950 bg-red-100" />
);

export const Alert = {
   Warning,
   Exception
};
