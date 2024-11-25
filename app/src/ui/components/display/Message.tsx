import { Empty, type EmptyProps } from "./Empty";

const NotFound = (props: Partial<EmptyProps>) => <Empty title="Not Found" {...props} />;

export const Message = {
   NotFound
};
