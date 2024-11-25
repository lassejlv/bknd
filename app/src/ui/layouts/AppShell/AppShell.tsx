import { useClickOutside, useDisclosure, useHotkeys, useViewportSize } from "@mantine/hooks";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { ucFirst } from "core/utils";
import { throttle } from "lodash-es";
import { type ComponentProps, createContext, useContext, useEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import { twMerge } from "tailwind-merge";
import { IconButton } from "ui/components/buttons/IconButton";
import { AppShellProvider, useAppShell } from "ui/layouts/AppShell/use-appshell";
import { Link } from "wouter";
import { useEvent } from "../../hooks/use-event";

export function Root({ children }) {
   return (
      <AppShellProvider>
         <div data-shell="root" className="flex flex-1 flex-col select-none h-dvh">
            {children}
         </div>
      </AppShellProvider>
   );
}

type NavLinkProps<E extends React.ElementType> = {
   Icon?: IconType;
   children: React.ReactNode;
   className?: string;
   to?: string; // @todo: workaround
   as?: E;
   disabled?: boolean;
};

export const NavLink = <E extends React.ElementType = "a">({
   children,
   as,
   className,
   Icon,
   disabled,
   ...otherProps
}: NavLinkProps<E> & Omit<React.ComponentProps<E>, keyof NavLinkProps<E>>) => {
   const Tag = as || "a";

   return (
      <Tag
         {...otherProps}
         className={twMerge(
            "px-6 py-2 [&.active]:bg-muted [&.active]:hover:bg-primary/15 hover:bg-primary/5 flex flex-row items-center rounded-full gap-2.5 link",
            disabled && "opacity-50 cursor-not-allowed",
            className
         )}
      >
         {Icon && <Icon size={18} />}
         {typeof children === "string" ? <span className="text-lg">{children}</span> : children}
      </Tag>
   );
};

export function Content({ children, center }: { children: React.ReactNode; center?: boolean }) {
   return (
      <main
         data-shell="content"
         className={twMerge(
            "flex flex-1 flex-row w-dvw h-full",
            center && "justify-center items-center"
         )}
      >
         {children}
      </main>
   );
}

export function Main({ children }) {
   return (
      <div data-shell="main" className="flex flex-col flex-grow w-1">
         {children}
      </div>
   );
}

export function Sidebar({ children }) {
   const ctx = useAppShell();

   const ref = useClickOutside(ctx.sidebar?.handler?.close);

   const onClickBackdrop = useEvent((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      ctx?.sidebar?.handler.close();
   });

   const onEscape = useEvent(() => {
      if (ctx?.sidebar?.open) {
         ctx?.sidebar?.handler.close();
      }
   });

   // @todo: potentially has to be added to the root, as modals could be opened
   useHotkeys([["Escape", onEscape]]);

   if (!ctx) {
      console.warn("AppShell.Sidebar: missing AppShellContext");
      return null;
   }

   return (
      <>
         <aside
            data-shell="sidebar"
            className="hidden md:flex flex-col basis-[350px] flex-shrink-0 flex-grow-0 h-full border-muted border-r bg-muted/10"
         >
            {children}
         </aside>
         <div
            data-open={ctx?.sidebar?.open}
            className="absolute w-full md:hidden data-[open=true]:translate-x-0 translate-x-[-100%] transition-transform z-10 backdrop-blur-sm"
            onClick={onClickBackdrop}
         >
            <aside
               /*ref={ref}*/
               data-shell="sidebar"
               className="flex-col w-[350px] flex-shrink-0 flex-grow-0 h-full border-muted border-r bg-background"
            >
               {children}
            </aside>
         </div>
      </>
   );
}

export function SectionHeaderTitle({ children, className, ...props }: ComponentProps<"h2">) {
   return (
      <h2
         {...props}
         className={twMerge("text-lg dark:font-bold font-semibold select-text", className)}
      >
         {children}
      </h2>
   );
}

export function SectionHeader({ children, right, className, scrollable, sticky }: any = {}) {
   return (
      <div
         className={twMerge(
            "flex flex-row h-14 flex-shrink-0 py-2 pl-5 pr-3 border-muted border-b items-center justify-between bg-muted/10",
            sticky && "sticky top-0 bottom-10 z-10",
            className
         )}
      >
         <div
            className={twMerge(
               "",
               scrollable && "overflow-x-scroll overflow-y-visible app-scrollbar"
            )}
         >
            {typeof children === "string" ? (
               <SectionHeaderTitle>{children}</SectionHeaderTitle>
            ) : (
               children
            )}
         </div>
         {right && !scrollable && <div className="flex flex-row gap-2.5">{right}</div>}
         {right && scrollable && (
            <div className="flex flex-row sticky z-10 right-0 h-full">
               <div className="h-full w-5 bg-gradient-to-l from-background" />
               <div className="flex flex-row gap-2.5 bg-background">{right}</div>
            </div>
         )}
      </div>
   );
}

type SidebarLinkProps<E extends React.ElementType> = {
   children: React.ReactNode;
   as?: E;
   to?: string; // @todo: workaround
   params?: Record<string, string>; // @todo: workaround
   disabled?: boolean;
};

export const SidebarLink = <E extends React.ElementType = "a">({
   children,
   as,
   className,
   disabled = false,
   ...otherProps
}: SidebarLinkProps<E> & Omit<React.ComponentProps<E>, keyof SidebarLinkProps<E>>) => {
   const Tag = as || "a";

   return (
      <Tag
         {...otherProps}
         className={twMerge(
            "flex flex-row px-4 py-2.5 items-center gap-2",
            !disabled &&
               "cursor-pointer rounded-md [&.active]:bg-primary/10 [&.active]:hover:bg-primary/15 [&.active]:font-medium hover:bg-primary/5 link",
            disabled && "opacity-50 cursor-not-allowed pointer-events-none",
            className
         )}
      >
         {children}
      </Tag>
   );
};

type SectionHeaderLinkProps<E extends React.ElementType> = {
   children: React.ReactNode;
   as?: E;
   to?: string; // @todo: workaround
   disabled?: boolean;
   active?: boolean;
   badge?: string | number;
};

export const SectionHeaderLink = <E extends React.ElementType = "a">({
   children,
   as,
   className,
   disabled = false,
   active = false,
   badge,
   ...props
}: SectionHeaderLinkProps<E> & Omit<React.ComponentProps<E>, keyof SectionHeaderLinkProps<E>>) => {
   const Tag = as || "a";

   return (
      <Tag
         {...props}
         className={twMerge(
            "hover:bg-primary/5 flex flex-row items-center justify-center gap-2.5 px-5 h-12 leading-none font-medium text-primary/80 rounded-tr-lg rounded-tl-lg",
            active
               ? "bg-background hover:bg-background text-primary border border-muted border-b-0"
               : "link",
            badge && "pr-4",
            className
         )}
      >
         {children}
         {badge ? (
            <span className="px-3 py-1 rounded-full font-mono bg-primary/5 text-sm leading-none">
               {badge}
            </span>
         ) : null}
      </Tag>
   );
};

export type SectionHeaderTabsProps = {
   title?: string;
   items?: (Omit<SectionHeaderLinkProps<any>, "children"> & {
      label: string;
   })[];
};
export const SectionHeaderTabs = ({ title, items }: SectionHeaderTabsProps) => {
   return (
      <SectionHeader className="mt-10 border-t pl-3 pb-0 items-end">
         <div className="flex flex-row items-center gap-6 -mb-px">
            {title && (
               <SectionHeaderTitle className="pl-2 hidden md:block">{title}</SectionHeaderTitle>
            )}
            <div className="flex flex-row items-center gap-3">
               {items?.map(({ label, ...item }, key) => (
                  <SectionHeaderLink key={key} {...item}>
                     {label}
                  </SectionHeaderLink>
               ))}
            </div>
         </div>
      </SectionHeader>
   );
};

export function Scrollable({
   children,
   initialOffset = 64
}: {
   children: React.ReactNode;
   initialOffset?: number;
}) {
   const scrollRef = useRef<React.ElementRef<"div">>(null);
   const [offset, setOffset] = useState(initialOffset);

   function updateHeaderHeight() {
      if (scrollRef.current) {
         setOffset(scrollRef.current.offsetTop);
      }
   }

   useEffect(updateHeaderHeight, []);

   if (typeof window !== "undefined") {
      window.addEventListener("resize", throttle(updateHeaderHeight, 500));
   }

   return (
      <ScrollArea.Root style={{ height: `calc(100dvh - ${offset}px` }} ref={scrollRef}>
         <ScrollArea.Viewport className="w-full h-full ">{children}</ScrollArea.Viewport>
         <ScrollArea.Scrollbar
            forceMount
            className="flex select-none touch-none bg-transparent w-0.5"
            orientation="vertical"
         >
            <ScrollArea.Thumb className="flex-1 bg-primary/50" />
         </ScrollArea.Scrollbar>
         <ScrollArea.Scrollbar
            forceMount
            className="flex select-none touch-none bg-muted flex-col h-0.5"
            orientation="horizontal"
         >
            <ScrollArea.Thumb className="flex-1 bg-primary/50 " />
         </ScrollArea.Scrollbar>
      </ScrollArea.Root>
   );
}

export const SectionHeaderAccordionItem = ({
   title,
   open,
   toggle,
   ActiveIcon = IconChevronUp,
   children,
   renderHeaderRight
}: {
   title: string;
   open: boolean;
   toggle: () => void;
   ActiveIcon?: any;
   children?: React.ReactNode;
   renderHeaderRight?: (props: { open: boolean }) => React.ReactNode;
}) => (
   <div
      style={{ minHeight: 49 }}
      className={twMerge(
         "flex flex-col flex-animate overflow-hidden",
         open
            ? "flex-open border-b border-b-muted"
            : "flex-initial cursor-pointer hover:bg-primary/5"
      )}
   >
      <div
         className={twMerge(
            "flex flex-row bg-muted/10 border-muted border-b h-14 py-4 pr-4 pl-2 items-center gap-2"
         )}
         onClick={toggle}
      >
         <IconButton Icon={open ? ActiveIcon : IconChevronDown} disabled={open} />
         <h2 className="text-lg dark:font-bold font-semibold select-text">{title}</h2>
         <div className="flex flex-grow" />
         {renderHeaderRight?.({ open })}
      </div>
      <div
         className={twMerge(
            "overflow-y-scroll transition-all",
            open ? " flex-grow" : "h-0 opacity-0"
         )}
      >
         {children}
      </div>
   </div>
);

export { Header } from "./Header";
