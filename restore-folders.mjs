// GitHub's web upload can't take folders, so files were uploaded flat with "__" standing in for
// "/" (e.g. "lib__race__handlers.ts" -> "lib/race/handlers.ts"). This runs automatically before
// every build (npm "prebuild"/"predev") and moves each file back into its folder.
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";

let moved = 0;
for (const name of readdirSync(".")) {
  if (!name.includes("__") || name.startsWith(".")) continue;
  const target = name.split("__").join("/");
  mkdirSync(dirname(target), { recursive: true });
  renameSync(name, join(".", target));
  moved++;
}
console.log(`restore-folders: moved ${moved} file(s) into their folders`);
