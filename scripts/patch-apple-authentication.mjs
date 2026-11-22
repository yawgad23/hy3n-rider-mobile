import { createHash } from "node:crypto";
import { readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const prefix = "[HY3N Apple authentication]";

// Audited publication: https://registry.npmjs.org/expo-apple-authentication/-/expo-apple-authentication-8.0.8.tgz
// Backports the request queue, retained anchor, and WindowUnavailableException from:
// https://registry.npmjs.org/expo-apple-authentication/-/expo-apple-authentication-58.0.2.tgz
// Core 3.0.30 has runOnQueue and Exception, but DOES NOT have Utilities.keyWindow():
// https://registry.npmjs.org/expo-modules-core/-/expo-modules-core-3.0.30.tgz
// Use local UIKit scene selection, not an invented Core API. Keep the legacy-window
// path for SDK54 apps without a UIScene lifecycle; never use it for a background scene.
// Do not skip on Linux/Android: postinstall must also prepare later iOS builds.
const patches = [
  {
    file: "AppleAuthenticationModule.swift",
    originalHash: "fe13b0edb16f34b8d9bfce15379b08838ae0b30c365d6ee8531a4308f29e31cb",
    edits: [
      {
        before: '      }\n    }\n\n    AsyncFunction("getCredentialStateAsync")',
        after: '      }\n    }.runOnQueue(.main)\n\n    AsyncFunction("getCredentialStateAsync")',
      },
    ],
  },
  {
    file: "AppleAuthenticationRequest.swift",
    originalHash: "97e44eb0ee52be91312dcd424e0acc23c79bd7f2c45e18957b5f39b527dd92bc",
    edits: [
      {
        before: "import AuthenticationServices\nimport ExpoModulesCore\n",
        after: "import AuthenticationServices\nimport ExpoModulesCore\nimport UIKit\n",
      },
      {
        before: "  var authController: ASAuthorizationController?\n",
        after: `  var authController: ASAuthorizationController?
  // Retain the checked window for the entire request. The synchronous delegate must
  // not look it up again after a scene/key-window change, or throw/fatalError.
  private var presentationAnchorWindow: UIWindow?

  private static func foregroundKeyWindow() -> UIWindow? {
    let application = UIApplication.shared
    let scenes = application.connectedScenes.compactMap { $0 as? UIWindowScene }
    if !scenes.isEmpty {
      return scenes
        .filter { $0.activationState == .foregroundActive }
        .flatMap { $0.windows }
        .first { $0.isKeyWindow && !$0.isHidden }
    }
    // SDK54 also supports a legacy AppDelegate without connected window scenes.
    // Only that lifecycle may fall back to application windows, and only when active.
    guard application.applicationState == .active else {
      return nil
    }
    return application.windows.first { $0.isKeyWindow && !$0.isHidden }
  }
`,
      },
      {
        before: "    do {\n      let appleIdProvider = ASAuthorizationAppleIDProvider()",
        after: `    do {
      // requestAsync runs on .main. Fail without touching UIKit if called otherwise.
      // No async hop between checking/retaining this anchor and starting the request.
      guard Thread.isMainThread, let window = Self.foregroundKeyWindow() else {
        throw WindowUnavailableException()
      }
      presentationAnchorWindow = window

      let appleIdProvider = ASAuthorizationAppleIDProvider()`,
      },
      {
        before: `    guard let window = UIApplication.shared.keyWindow else {
      fatalError("Unable to present authentication modal because UIApplication.shared.keyWindow is not available")
    }
    return window`,
        after: `    // Match the upstream non-trapping fallback. Every started request already
    // retains a valid anchor; do not clear it in callbacks or re-query UIKit here.
    return presentationAnchorWindow ?? UIWindow()`,
      },
    ],
  },
  {
    file: "AppleAuthenticationExceptions.swift",
    originalHash: "17faf8fce85a14b006746fc2a6efebd8fbde130f7e349032fd26648b3434118a",
    edits: [
      {
        before: "func exceptionForAuthorizationError(_ error: ASAuthorizationError) -> Exception {",
        after: `final class WindowUnavailableException: Exception {
  override var reason: String {
    "Couldn't present the Sign in with Apple sheet because no active window is available"
  }
}

func exceptionForAuthorizationError(_ error: ASAuthorizationError) -> Exception {`,
      },
    ],
  },
];

function hash(source) {
  return createHash("sha256").update(source).digest("hex");
}

function replaceOnce(source, before, after, file) {
  const index = source.indexOf(before);
  if (index < 0 || source.indexOf(before, index + before.length) !== -1) {
    throw new Error(`Incompatible source in ${file}; expected exactly one audited patch anchor.`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

function transform(source, patch, reverse = false) {
  const edits = reverse ? [...patch.edits].reverse() : patch.edits;
  return edits.reduce(
    (text, edit) => replaceOnce(text, reverse ? edit.after : edit.before, reverse ? edit.before : edit.after, patch.file),
    source,
  );
}

function prepare(source, patch) {
  if (hash(source) === patch.originalHash) {
    return transform(source, patch);
  }
  // Only our exact patch is idempotent: reversing it must recover the entire
  // byte-for-byte published file. A marker/comment alone never authorizes a write.
  try {
    const original = transform(source, patch, true);
    if (hash(original) === patch.originalHash && transform(original, patch) === source) {
      return source;
    }
  } catch {
    // Report the same actionable failure for both drifted and partly edited files.
  }
  throw new Error(`Incompatible source in ${patch.file}; refusing to patch anything. Reinstall the audited 8.0.8 publication or review this backport.`);
}

function assertWithin(parent, target, label) {
  const location = relative(parent, target);
  if (location === ".." || location.startsWith("../") || location.startsWith("..\\") || isAbsolute(location)) {
    throw new Error(`Refusing ${label} outside this project/package: ${target}. Shared dependencies must not be patched.`);
  }
}

async function auditedPackage(projectRoot, name, expectedVersion, writable = false) {
  const packageRoot = await realpath(join(projectRoot, "node_modules", name));
  // Only Apple sources are written. Core may be an external read-only symlink
  // in an isolated validation overlay; its version is still checked exactly.
  if (writable) assertWithin(projectRoot, packageRoot, name);
  const metadataPath = await realpath(join(packageRoot, "package.json"));
  assertWithin(packageRoot, metadataPath, `${name} metadata`);
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  if (metadata.name !== name || metadata.version !== expectedVersion) {
    throw new Error(`Unsupported ${name} ${metadata.version ?? "unknown"}; this backport only supports ${name} ${expectedVersion}. Refusing to patch anything.`);
  }
  return packageRoot;
}

export async function patchAppleAuthentication(projectRoot = root) {
  projectRoot = await realpath(projectRoot);
  const packageRoot = await auditedPackage(projectRoot, "expo-apple-authentication", "8.0.8", true);
  await auditedPackage(projectRoot, "expo-modules-core", "3.0.30");

  // Read and validate EVERY target before writing ANY target. Fully patched files
  // are accepted individually, allowing a rerun after an interrupted filesystem write.
  const plans = [];
  for (const patch of patches) {
    const path = await realpath(join(packageRoot, "ios", patch.file));
    assertWithin(packageRoot, path, patch.file);
    const source = await readFile(path, "utf8");
    plans.push({ path, source, next: prepare(source, patch) });
  }
  let changed = 0;
  for (const plan of plans) {
    if (plan.source === plan.next) continue;
    // Rename instead of overwriting a possible pnpm-store hardlink in place.
    const temporary = `${plan.path}.hy3n-apple-${process.pid}.tmp`;
    try {
      await writeFile(temporary, plan.next, { flag: "wx" });
      await rename(temporary, plan.path);
    } finally {
      await rm(temporary, { force: true });
    }
    changed += 1;
  }
  console.log(`${prefix} ${changed ? `Patched ${changed} audited Swift files` : "Audited backport already applied"} (8.0.8 / Core 3.0.30).`);
  return changed;
}

// Importing the function has no filesystem side effects. The CLI has no override
// that silently relaxes version/source/path checks, and missing packages fail closed.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  patchAppleAuthentication().catch((error) => {
    console.error(`${prefix} ${error.message}`);
    process.exitCode = 1;
  });
}
