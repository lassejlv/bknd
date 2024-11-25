import { IconFingerprint } from "@tabler/icons-react";
import { TbSettings } from "react-icons/tb";
import { useBknd } from "ui/client";
import { IconButton } from "ui/components/buttons/IconButton";
import { Empty } from "ui/components/display/Empty";
import { Link } from "ui/components/wouter/Link";
import { useBrowserTitle } from "ui/hooks/use-browser-title";
import * as AppShell from "ui/layouts/AppShell/AppShell";
import { routes, useNavigate } from "ui/lib/routes";

export function AuthRoot({ children }) {
   const { app, config } = useBknd();
   const users_entity = config.auth.entity_name;

   return (
      <>
         <AppShell.Sidebar>
            <AppShell.SectionHeader
               right={
                  <Link href={app.getSettingsPath(["auth"])}>
                     <IconButton Icon={TbSettings} />
                  </Link>
               }
            >
               Auth
            </AppShell.SectionHeader>
            <AppShell.Scrollable initialOffset={96}>
               <div className="flex flex-col flex-grow p-3 gap-3">
                  <nav className="flex flex-col flex-1 gap-1">
                     <AppShell.SidebarLink as={Link} href={"/"}>
                        Overview
                     </AppShell.SidebarLink>
                     <AppShell.SidebarLink
                        as={Link}
                        href={app.getAbsolutePath("/data/" + routes.data.entity.list(users_entity))}
                        disabled={!config.auth.enabled}
                     >
                        Users
                     </AppShell.SidebarLink>
                     <AppShell.SidebarLink
                        as={Link}
                        href={routes.auth.roles.list()}
                        disabled={!config.auth.enabled}
                     >
                        Roles & Permissions
                     </AppShell.SidebarLink>
                     <AppShell.SidebarLink as={Link} href={routes.auth.strategies()} disabled>
                        Strategies
                     </AppShell.SidebarLink>
                     {/*<AppShell.SidebarLink as={Link} href={routes.auth.settings()}>*/}
                     <AppShell.SidebarLink as={Link} href={app.getSettingsPath(["auth"])}>
                        Settings
                     </AppShell.SidebarLink>
                  </nav>
               </div>
            </AppShell.Scrollable>
         </AppShell.Sidebar>
         <AppShell.Main>{children}</AppShell.Main>
      </>
   );
}

export function AuthEmpty() {
   useBrowserTitle(["Auth"]);
   return <Empty Icon={IconFingerprint} title="Not implemented yet" />;
}
