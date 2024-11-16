import type { MediaFieldSchema } from "media/AppMedia";
import type { FileState } from "./components/dropzone/Dropzone";

export function mediaItemToFileState(
   item: MediaFieldSchema,
   options: {
      overrides?: Partial<FileState>;
      baseUrl?: string;
   } = { overrides: {}, baseUrl: "" }
): FileState {
   return {
      body: `${options.baseUrl}/api/media/file/${item.path}`,
      path: item.path,
      name: item.path,
      size: item.size ?? 0,
      type: item.mime_type ?? "",
      state: "uploaded",
      progress: 0,
      ...options.overrides
   };
}

export function mediaItemsToFileStates(
   items: MediaFieldSchema[],
   options: {
      overrides?: Partial<FileState>;
      baseUrl?: string;
   } = { overrides: {}, baseUrl: "" }
): FileState[] {
   return items.map((item) => mediaItemToFileState(item, options));
}