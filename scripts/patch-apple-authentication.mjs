import { createHash } from "node:crypto";
import { readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const prefix = "[HY3N Apple authentication]";

// Audited publication: https://registry.npmjs.org/expo-apple-authentication/-/expo-apple-authentication-57.0.2.tgz
// These three Swift files are byte-identical to 8.0.8: SDK57 still needs this backport.
// Backports the request queue, retained anchor, and WindowUnavailableException from:
// https://registry.npmjs.org/expo-apple-authentication/-/expo-apple-authentication-58.0.2.tgz
// Core 57.0.26 has runOnQueue and Exception, but DOES NOT have Utilities.keyWindow():
// https://registry.npmjs.org/expo-modules-core/-/expo-modules-core-57.0.26.tgz
// Use local UIKit scene selection, not an invented Core API. The legacy-window
// fallback is only for a lifecycle with no connected scenes; never a background scene.
// Do not skip on Linux/Android: postinstall must also prepare later iOS builds.
const appleVersion = "57.0.2";
const coreVersion = "57.0.26";
// Bind the Core APIs used by this backport to the reviewed publication, not just
// editable package metadata. Core is always read-only, including external overlays.
const coreSources = [
  { file: "Core/Functions/AsyncFunctionDefinition.swift", originalHash: "8fa2ce2108df97f352a6f9c624cd1e2555862a14324db46f4144429d6b3b4387" },
  { file: "Core/Exceptions/Exception.swift", originalHash: "a2c5ecb174606a77357ba33fb66fa4015a88daeaae1b72d90488693589ac28d3" },
  { file: "Utilities/Utilities.swift", originalHash: "115312ddb3a4219b48ba5ae68a714481ae89a3c7ced6cf600f46de2b5a86e76e" },
];
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
    // SDK57 can still use an AppDelegate without opt-in connected window scenes.
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
        after: `final class WindowUnavailableException: Exception, @unchecked Sendable {
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
  throw new Error(`Incompatible source in ${patch.file}; refusing to patch anything. Reinstall the audited ${appleVersion} publication or review this backport.`);
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
  // in an isolated validation overlay; its version and audited APIs are checked.
  if (writable) assertWithin(projectRoot, packageRoot, name);
  const metadataPath = await realpath(join(packageRoot, "package.json"));
  assertWithin(packageRoot, metadataPath, `${name} metadata`);
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  if (metadata.name !== name || metadata.version !== expectedVersion) {
    throw new Error(`Unsupported ${name} ${metadata.version ?? "unknown"}; this backport only supports ${name} ${expectedVersion}. Refusing to patch anything.`);
  }
  return packageRoot;
}

async function auditSources(projectRoot, writable) {
  projectRoot = await realpath(projectRoot);
  const packageRoot = await auditedPackage(projectRoot, "expo-apple-authentication", appleVersion, writable);
  const coreRoot = await auditedPackage(projectRoot, "expo-modules-core", coreVersion);
  for (const source of coreSources) {
    const path = await realpath(join(coreRoot, "ios", source.file));
    assertWithin(coreRoot, path, `Core ${source.file}`);
    if (hash(await readFile(path, "utf8")) !== source.originalHash) {
      throw new Error(`Incompatible source in Core ${source.file}; refusing to patch anything. Reinstall the audited Core ${coreVersion} publication.`);
    }
  }
  // Read and validate EVERY target before writing ANY target. Fully patched files
  // are accepted individually, allowing a rerun after an interrupted filesystem write.
  const plans = [];
  for (const patch of patches) {
    const path = await realpath(join(packageRoot, "ios", patch.file));
    assertWithin(packageRoot, path, patch.file);
    const source = await readFile(path, "utf8");
    plans.push({ path, source, next: prepare(source, patch) });
  }
  return plans;
}

export async function verifyAppleAuthentication(projectRoot = root) {
  const plans = await auditSources(projectRoot, false);
  if (plans.some((plan) => plan.source !== plan.next)) {
    throw new Error("Apple native safety backport is missing or incomplete; run the audited postinstall patch in project-local dependencies before building.");
  }
  return { appleVersion, coreVersion };
}

export async function patchAppleAuthentication(projectRoot = root) {
  const plans = await auditSources(projectRoot, true);
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
  console.log(`${prefix} ${changed ? `Patched ${changed} audited Swift files` : "Audited backport already applied"} (${appleVersion} / Core ${coreVersion}).`);
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
