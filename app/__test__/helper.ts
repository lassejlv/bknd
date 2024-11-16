import { unlink } from "node:fs/promises";
import type { SqliteDatabase } from "kysely";
import Database from "libsql";
import { SqliteLocalConnection } from "../src/data";

export function getDummyDatabase(memory: boolean = true): {
   dummyDb: SqliteDatabase;
   afterAllCleanup: () => Promise<boolean>;
} {
   const DB_NAME = memory ? ":memory:" : `${Math.random().toString(36).substring(7)}.db`;
   const dummyDb = new Database(DB_NAME);

   return {
      dummyDb,
      afterAllCleanup: async () => {
         if (!memory) await unlink(DB_NAME);
         return true;
      }
   };
}

export function getDummyConnection(memory: boolean = true) {
   const { dummyDb, afterAllCleanup } = getDummyDatabase(memory);
   const dummyConnection = new SqliteLocalConnection(dummyDb);

   return {
      dummyConnection,
      afterAllCleanup
   };
}

export function getLocalLibsqlConnection() {
   return { url: "http://127.0.0.1:8080" };
}

type ConsoleSeverity = "log" | "warn" | "error";
const _oldConsoles = {
   log: console.log,
   warn: console.warn,
   error: console.error
};

export function disableConsoleLog(severities: ConsoleSeverity[] = ["log"]) {
   severities.forEach((severity) => {
      console[severity] = () => null;
   });
}

export function enableConsoleLog() {
   Object.entries(_oldConsoles).forEach(([severity, fn]) => {
      console[severity as ConsoleSeverity] = fn;
   });
}