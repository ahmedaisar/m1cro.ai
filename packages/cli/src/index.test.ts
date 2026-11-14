import {describe,expect,it} from "vitest";
import {runCli} from "./index.js";
describe("CLI",()=>{
 it("prints help without requiring credentials",async()=>{
  const original=process.argv;
  expect(await runCli(["--help"])).toBe(0);
  process.argv=original;
 });
 it("rejects unknown CLI options",async()=>{
  expect(await runCli(["--not-an-option"])).toBe(2);
 });
 it("rejects invalid session identifiers before touching the filesystem",async()=>{
  expect(await runCli(["--session","../bad"])).toBe(2);
 });
});
