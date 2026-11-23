import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function repair(packageName, publicationDefaults) {
  const packageRoot = join(root, "node_modules", packageName);
  const configPath = join(packageRoot, "expo-module.config.json");
  const packageJsonPath = join(packageRoot, "package.json");

  try {
    const config = await readJson(configPath);
    const packageJson = await readJson(packageJsonPath);
    const android = config.android;
    if (!android?.modules?.length) return;

    const publication = android.publication ?? {};
    const next = {
      ...config,
      android: {
        ...android,
        publication: {
          groupId: publication.groupId ?? publicationDefaults.groupId,
          artifactId: publication.artifactId ?? publicationDefaults.artifactId,
          version: publication.version ?? packageJson.version,
          repository: publication.repository ?? "local-maven-repo",
        },
      },
    };

    if (JSON.stringify(config) !== JSON.stringify(next)) {
      await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`);
      console.log(`[HY3N] Repaired ${packageName} Android publication metadata.`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

await repair("expo-live-activity", {
  groupId: "host.exp.exponent",
  artifactId: "expo.modules.liveactivity",
});
await repair("expo-crypto", {
  groupId: "host.exp.exponent",
  artifactId: "expo.modules.crypto",
});
