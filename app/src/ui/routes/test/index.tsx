import AppShellAccordionsTest from "ui/routes/test/tests/appshell-accordions-test";
import SwaggerTest from "ui/routes/test/tests/swagger-test";
import { Route, useParams } from "wouter";
import { Empty } from "../../components/display/Empty";
import { Link } from "../../components/wouter/Link";
import { AppShell } from "../../layouts/AppShell";
import FlowCreateSchemaTest from "../../routes/test/tests/flow-create-schema-test";
import FlowFormTest from "../../routes/test/tests/flow-form-test";
import ModalTest from "../../routes/test/tests/modal-test";
import QueryJsonFormTest from "../../routes/test/tests/query-jsonform";
import DropdownTest from "./tests/dropdown-test";
import EntityFieldsForm from "./tests/entity-fields-form";
import FlowsTest from "./tests/flows-test";
import JsonFormTest from "./tests/jsonform-test";
import { LiquidJsTest } from "./tests/liquid-js-test";
import MantineTest from "./tests/mantine-test";
import ReactHookErrors from "./tests/react-hook-errors";
import ReactFlowTest from "./tests/reactflow-test";
import SchemaTest from "./tests/schema-test";
import SortableTest from "./tests/sortable-test";
import { SqlAiTest } from "./tests/sql-ai-test";

const tests = {
   DropdownTest,
   ModalTest,
   JsonFormTest,
   FlowFormTest,
   QueryJsonFormTest,
   FlowCreateSchemaTest,
   ReactFlowTest,
   SchemaTest,
   MantineTest,
   LiquidJsTest,
   SqlAiTest,
   SortableTest,
   ReactHookErrors,
   EntityFieldsForm,
   FlowsTest,
   AppShellAccordionsTest,
   SwaggerTest
} as const;

export default function TestRoutes() {
   return (
      <TestRoot>
         <Route path="/" component={() => <Empty title="Test" description="Select one." />} />
         <Route path="/:test" component={RenderTest} />
      </TestRoot>
   );
}

function RenderTest() {
   const params = useParams();
   if (!params.test || !(params.test in tests)) {
      return <Empty title="Test not found" />;
   }
   const Test = tests[params.test];
   return <Test />;
}

function TestRoot({ children }) {
   return (
      <>
         <AppShell.Sidebar>
            <AppShell.SectionHeader>Tests</AppShell.SectionHeader>
            <AppShell.Scrollable initialOffset={96}>
               <div className="flex flex-col flex-grow p-3 gap-3">
                  <nav className="flex flex-col flex-1 gap-1">
                     {Object.entries(tests).map(([key, Component]) => (
                        <AppShell.SidebarLink key={key} as={Link} href={`/${key}`}>
                           {key}
                        </AppShell.SidebarLink>
                     ))}
                  </nav>
               </div>
            </AppShell.Scrollable>
         </AppShell.Sidebar>
         <main className="flex flex-col flex-grow">{children}</main>
      </>
   );
}