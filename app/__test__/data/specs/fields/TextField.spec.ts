import { describe, expect, test } from "bun:test";
import { TextField } from "../../../../src/data";
import { runBaseFieldTests, transformPersist } from "./inc";

describe("[data] TextField", async () => {
   test("transformPersist (config)", async () => {
      const field = new TextField("test", { minLength: 3, maxLength: 5 });

      expect(transformPersist(field, "a")).rejects.toThrow();
      expect(transformPersist(field, "abcdefghijklmn")).rejects.toThrow();
      expect(transformPersist(field, "abc")).resolves.toBe("abc");
   });

   runBaseFieldTests(TextField, { defaultValue: "abc", schemaType: "text" });
});