import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts/patch-apple-authentication.mjs');
const temporaryRoots: string[] = [];
const names = ['AppleAuthenticationModule.swift', 'AppleAuthenticationRequest.swift', 'AppleAuthenticationExceptions.swift'] as const;

// Exact Swift files from the published 8.0.8 npm tarball, gzip/base64 to keep
// this offline fixture small. No install, network, or shared node_modules writes.
// SHA256 assertions below bind the decoded bytes to the audited publication.
const fixturePayloads: Record<typeof names[number], string> = {
  'AppleAuthenticationModule.swift': 'H4sIAAAAAAACA71WS4/bNhC+61dM3IsEuMpdQOp67RjwobuLddIeE1kc7bKhSZWkvHGD/e8ZinrQsrxBUKAniTPfNy8Oh+SHSmkLy9o+obS8yC1Xcof6yAs0Effa918r9YditUCzUhqjSKCFQiNzlFw84FF9Qfb+SMvb/IDwDmaOkuZVJXDLVmPkLIqqei94ASWXuYBC5MbA0qHPA/FOM/Bf+BYBdMRaFsCQ+NwB4wR+/a2FrXtpQwBwMcVNRBMuZknUgJroTXw9qxa3NCdZbMh743bGzfKYc5Hvya7TzJLWKYBGW2sJVtfYSF4mDWj8p0ZjezLEqnIak00V5MGj7zxkDpVWB26oQvf+JwEuW/fX2YOH9idJK9Sl0ocWQFFoNBVpcA6otdKDWQBegtt/L//Wi6ELJtX4NxY2bgBJr38BFAavEIwSR4w7pwEpCr/TFXxEO3TYzuYWg2LWBvWWZbCzmsvHVwvmkmo7lpRHzlBTJy93roZK83+bEjZV3a47QNx2BYyZ6WVUMVX4owtnnYEPy0VYnIPm8Cms9du38BdCkUvgj5KOHtB2tpXPTbMY+GCcAQeWysIeQXIRGsolC+iH/ASqKGoNSooTPFObTNvjBj6TwY2qJfscXdu6URof1FbasTBJpnZz2EjXgbnd1EK48+b3r2xXGXTyOXjczp5EIN4MwkUzDPyOn29vwKStDVaL1KoJSzRWFgtIac7ktbCtoWOuQRJupWg6Sjc1yNY9aqPk7Zl4aI5zeOqW95rG1FcXRes2kF5n7epyguWl06xHTgOsnco9qRdOcw6cMYFj0iCdZpX5gYvTmDVIr2TFiy9yxOlk0cXW2eZMThV70+njrst6RmouNzw6H9Ih1rVNXFJ/Z6NYk7Bt/+T4HE/M2JvaWiVTg6IcroL2cpl1atpmY2Z9e9DQqOLZvlF9OFVt6x/JwxwsrTO46XWLJJwPrjIOQck1H9ethkbFVkbhvHam0gbwpgWGY3jQeuVYJRGZ+VgxNw3eDffZ+XyeSKUpdJiL8Uf2ZtBeZtPtlf+6fJ6fuMXLdDzgTYe8SOjM0H9PqVBaon7IGa9NmFMoz2Ct6HmCZ0k1/kIUOQyXY3d30rXWmjMfnvNuyJ0zc2G2biCrJy7YtrylnJDFk0P2jsqda3u3N+5pR2OxK9etsrxsW3dFTUonoJ12ac6Yx9OZ6t26vp6HK7rplc7gl+43Zpz5p9Nw/cWfsiQZWLKZ569frOnFQyyMdLCl9u6tkQV3XTLOW1U/lbbGgzrijzL/f3Jo8/idEAV9/aN3qr4gA8vZWXrdFDIo/WP21Teu8/gSfQfpV9gPFgwAAA==',
  'AppleAuthenticationRequest.swift': 'H4sIAAAAAAACA7VXTW/bOBC961cQPkmAq96Fpl7DabFB0SaIk+2hmwMjjhI2NKmSlFN3kf++Q4rUlz+aw+4pJvnmcTh888TwTa20JcvGPoK0vKSWK7kGveUlmIS3qx9+1uqzYo0As1IakuTtW7IkBixRFalBMi4fiIYfDRhrSGOAEatwwlIuCRJvSIPcwv0kJRXinpZPhBv/G1iypTqyXEeSM7IG+25Z1wLGuQXE+zRLkopLKkgpqDHkOLQgX9aX99+htHOyXDuI0vyXR6yUtFphEvpKg8HIbhZ+2iutttwldSLsHAQ8UAvkn4QQu6uBCk4NmeZhaiUN4KG+LeXuT2oe6b2AguDg7mScz38VK3ZG0sPEizleUQm1m1tk5M178pfiLEFq4e7Iz5viRIkuWwgGuLuIV1SczmcR4BRBfUWK48VauIy45DZ9fUqZryxBsYkqD2FYCNUl/OJIq0aWKCFdKb0J8Wl/ij/AlLR2Gj15ntFWZV/0+DPxq0wFWFtc6g5wwVqtgEb45Pj+hBfnEYCy7YNDy2DQhCYvNaCq4lGyJASFgDz8BbYuVQ2uIFbviPGDj1ptLqQ1schTcHaM6xIL6FMOdCqOA+M+YRexlyB6gO6vyQ8nCGNd2/QQP55gpJLlEOPHcaux7PYL36+ldDgfLaYg38I+d9lBykVeHzMFv5/TyZFAFm0hoAIMbfO6NcWJaYb1iQnmHHtb29RRZMmxHEeqN0FfL6haWz52Uh1pepFKLuYEtFbYvWbRm0d2CI6HQHxLGxsOT/J5ef2pIG9+741dg9Ij11O+xjzmhHG2UhvsEwtfuX0c4cbcezSxtV3TYWsx5wH45Tgbh+WDJVeWw5286kBJ38etDxcnjD9UdlY1QnyhG5gVROIfdyIlMcTcqHNeom119Is8YrN5jIYN5QJDhyg/1yFcq00AbqpbR2MRtzixRlk3BpHjiRvlOn0YPV7vU/ENO9nJz3WIyX0zh2bU0hu1thp1PtpmD9zvxD3I7m7UE8hTHCNgq+W7tm966ce7mjtRZ6PFIPSka1UBFC/vUK9OO1XDRm0hdOrwo/Tfav6Db1nfuAXxg6hsXnkltj19NujtCXnL0H3B1EPuoenMq3ucLqlQWMAK8nfqQblQWCr+C9g5flE1by1jFk1jai/RVD4qvZ9Cy5hFtwJhoMtqQhSKfCufpHqWnVelMfj/vMPX+Nypp2P/OBmAlrJEnhRtm7xKBv5Ft1xf7VGEij00VDN//c9cMvWMNbi9cPcZbCjH9yZ2Sf4Eu68tYFTuCttJtJcyu5XuZepe7yFhr4je0chGMXTHeygpusrvtsEnvlRIsUUdOd7Z8Mbw34NGy5Cyr/dL8i+AKsJbjgwAAA==',
  'AppleAuthenticationExceptions.swift': 'H4sIAAAAAAACA7WUQW7bMBBF9zrFINnYi2bZhdEaNQynySItELe7AgVBjupBJZIdUnLaIkCv0ev1JKVEWZYSWQ4QZyVB1J//+DlDyq1hD4vCb1B7ksKT0WvkkiS6hOLq6s6aG6OKDN3SMCZJSlpkIDPhHFzrUmSk1tJYXN1JtFWFGbxHjUyy/fLmWvs5/E4ATInMpBBKwcAoXPX72jPpb/U6wFlTExbWZgiiBweucprBl4kVLPLpWZDcJ/eDUB8tci06NZj/aRFMOgxodq5HIG/xR4HOL4WWmKHqMLavT+X6tEEoHDLIphgEoprLMP2KWMJ7zK0fy+sWnTXa4XNR+sYc9xmeEqkMbEIDNUFy4zgW0Afjr4RWJ4homGsrnP7356+HTXQZY7kUdHKO5mAgrWsfSSJ0a+gu6UOQL5MGNWHQ3mgM6bP+rs1Wv2QikBqueqaIVk2VMagb4eWmPqasUKiWjKqaT5E9D5Ncm1IeHSosbFxAtjZ7tkLL6ofodGl40d3nitnw5Ctg9ZzBYv14dQqv5g9Q3ZaCdxRdSBOYq69SOISLJqJZTczoC9aHDmoybVW7S2NI9uh26uiof2v05IdulI5ct3M9ZDww9R1t7Iwh3YMJ7ft1pueA59B81TXOKQVpchuq82T+9vW+bn6o24YsjrdmdEOtKA0v73ZdrzAVReaffLRV//0HOe7Fh94HAAA=',
};
const originalHashes: Record<typeof names[number], string> = {
  'AppleAuthenticationModule.swift': 'fe13b0edb16f34b8d9bfce15379b08838ae0b30c365d6ee8531a4308f29e31cb',
  'AppleAuthenticationRequest.swift': '97e44eb0ee52be91312dcd424e0acc23c79bd7f2c45e18957b5f39b527dd92bc',
  'AppleAuthenticationExceptions.swift': '17faf8fce85a14b006746fc2a6efebd8fbde130f7e349032fd26648b3434118a',
};
const originals = Object.fromEntries(names.map((name) => [
  name, gunzipSync(Buffer.from(fixturePayloads[name], 'base64')).toString('utf8'),
])) as Record<typeof names[number], string>;

function fixture(appleVersion = '8.0.8', coreVersion = '3.0.30') {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'hy3n-apple-native-test-'));
  temporaryRoots.push(project);
  const packageRoot = path.join(project, 'node_modules/expo-apple-authentication');
  fs.mkdirSync(path.join(project, 'scripts'), { recursive: true });
  fs.copyFileSync(script, path.join(project, 'scripts/patch-apple-authentication.mjs'));
  fs.mkdirSync(path.join(packageRoot, 'ios'), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'expo-apple-authentication', version: appleVersion }));
  const coreRoot = path.join(project, 'node_modules/expo-modules-core');
  fs.mkdirSync(coreRoot, { recursive: true });
  fs.writeFileSync(path.join(coreRoot, 'package.json'), JSON.stringify({ name: 'expo-modules-core', version: coreVersion }));
  for (const name of names) fs.writeFileSync(path.join(packageRoot, 'ios', name), originals[name]);
  return project;
}

function sourcePath(project: string, name: typeof names[number]) {
  return path.join(project, 'node_modules/expo-apple-authentication/ios', name);
}
function sources(project: string) {
  return Object.fromEntries(names.map((name) => [name, fs.readFileSync(sourcePath(project, name), 'utf8')])) as typeof originals;
}
function run(project: string) {
  return spawnSync(process.execPath, [path.join(project, 'scripts/patch-apple-authentication.mjs')], {
    cwd: project, encoding: 'utf8', timeout: 10_000,
  });
}

afterEach(() => {
  for (const directory of temporaryRoots.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('SDK54 Apple authentication native safety backport (offline source fixtures)', () => {
  it('uses the exact independently hashed published 8.0.8 Swift fixture bytes', () => {
    for (const name of names) {
      expect(createHash('sha256').update(originals[name]).digest('hex')).toBe(originalHashes[name]);
    }
  });

  it('patches on the host used for installs and is byte/mtime idempotent', () => {
    const project = fixture();
    const first = run(project);
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain('Patched 3 audited Swift files');
    const patched = sources(project);
    const mtimes = names.map((name) => fs.statSync(sourcePath(project, name)).mtimeMs);
    const second = run(project);
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain('already applied');
    expect(sources(project)).toEqual(patched);
    expect(names.map((name) => fs.statSync(sourcePath(project, name)).mtimeMs)).toEqual(mtimes);
    expect(fs.readdirSync(path.dirname(sourcePath(project, names[0]))).sort()).toEqual([...names].sort());
  });

  it('checks and retains the foreground window on main before creating or starting a controller', () => {
    const project = fixture();
    expect(run(project).status).toBe(0);
    const patched = sources(project);
    const module = patched['AppleAuthenticationModule.swift'];
    const request = patched['AppleAuthenticationRequest.swift'];
    const exceptions = patched['AppleAuthenticationExceptions.swift'];
    expect(module).toContain('}.runOnQueue(.main)');
    expect(module).toContain('promise.reject(error)');
    expect(request).toContain('guard Thread.isMainThread, let window = Self.foregroundKeyWindow() else');
    expect(request).toContain('throw WindowUnavailableException()');
    expect(request).toContain('self.callback?(nil, error as? Exception)');
    const retained = request.indexOf('presentationAnchorWindow = window');
    expect(retained).toBeGreaterThan(request.indexOf('guard Thread.isMainThread'));
    expect(retained).toBeLessThan(request.indexOf('ASAuthorizationController(authorizationRequests:'));
    expect(retained).toBeLessThan(request.indexOf('authController?.performRequests()'));
    expect(request).toContain('application.connectedScenes.compactMap { $0 as? UIWindowScene }');
    expect(request).toContain('.filter { $0.activationState == .foregroundActive }');
    expect(request).toContain('.first { $0.isKeyWindow && !$0.isHidden }');
    expect(request).toContain('if !scenes.isEmpty');
    expect(request).toContain('guard application.applicationState == .active');
    expect(request).not.toContain('Utilities.keyWindow');
    expect(request).not.toContain('UIApplication.shared.keyWindow');
    expect(request).not.toContain('DispatchQueue.main.async');
    expect(request).not.toMatch(/fatalError\(|precondition\(|presentationAnchorWindow!|presentationAnchorWindow = nil/);
    const delegate = request.slice(request.indexOf('  func presentationAnchor(for controller:'));
    expect(delegate).toContain('return presentationAnchorWindow ?? UIWindow()');
    expect(delegate).not.toMatch(/throw|foregroundKeyWindow\(|connectedScenes|keyWindow/);
    expect(exceptions).toContain('final class WindowUnavailableException: Exception');
    expect(exceptions).toContain("Couldn't present the Sign in with Apple sheet because no active window is available");
  });

  it.each(['8.0.7', '8.0.9', '58.0.2'])('rejects unexpected Apple version %s without changing any file', (version) => {
    const project = fixture(version);
    const before = sources(project);
    const result = run(project);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unsupported expo-apple-authentication');
    expect(sources(project)).toEqual(before);
  });

  it('rejects a different Core version without changing any file', () => {
    const project = fixture('8.0.8', '3.0.29');
    const result = run(project);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unsupported expo-modules-core');
    expect(sources(project)).toEqual(originals);
  });

  it('validates all targets before writes, rejecting drift even in the last target', () => {
    const project = fixture();
    fs.appendFileSync(sourcePath(project, names[2]), '// unexpected upstream/local source\n');
    const before = sources(project);
    const result = run(project);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Incompatible source');
    expect(sources(project)).toEqual(before);
  });

  it('rejects altered already-patched source instead of trusting patch markers', () => {
    const project = fixture();
    expect(run(project).status).toBe(0);
    const requestPath = sourcePath(project, names[1]);
    fs.writeFileSync(requestPath, fs.readFileSync(requestPath, 'utf8').replace('.foregroundActive', '.background'));
    const before = sources(project);
    expect(run(project).status).toBe(1);
    expect(sources(project)).toEqual(before);
  });

  it('can complete an interrupted patch with a mixture of exact original and exact patched files', () => {
    const project = fixture();
    expect(run(project).status).toBe(0);
    const patched = sources(project);
    fs.writeFileSync(sourcePath(project, names[1]), originals[names[1]]);
    const result = run(project);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Patched 1 audited Swift files');
    expect(sources(project)).toEqual(patched);
  });

  it('refuses a shared node_modules symlink and leaves its source unchanged', () => {
    const project = fixture();
    const shared = fixture();
    const before = sources(shared);
    fs.rmSync(path.join(project, 'node_modules'), { recursive: true });
    fs.symlinkSync(path.join(shared, 'node_modules'), path.join(project, 'node_modules'), 'dir');
    const result = run(project);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Shared dependencies must not be patched');
    expect(sources(shared)).toEqual(before);
  });

  it('allows an external read-only Core overlay without changing Core metadata', () => {
    const project = fixture();
    const external = fixture();
    const core = path.join(external, 'node_modules/expo-modules-core');
    const metadataPath = path.join(core, 'package.json');
    const before = fs.readFileSync(metadataPath, 'utf8');
    fs.rmSync(path.join(project, 'node_modules/expo-modules-core'), { recursive: true });
    fs.symlinkSync(core, path.join(project, 'node_modules/expo-modules-core'), 'dir');
    const result = run(project);
    expect(result.status, result.stderr).toBe(0);
    expect(fs.readFileSync(metadataPath, 'utf8')).toBe(before);
  });

  it('refuses an escaping Swift-file symlink before writing any other target', () => {
    const project = fixture();
    const external = fixture();
    const target = sourcePath(project, names[2]);
    const externalFile = sourcePath(external, names[2]);
    fs.rmSync(target);
    fs.symlinkSync(externalFile, target);
    const before = sources(project);
    const result = run(project);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Shared dependencies must not be patched');
    expect(sources(project)).toEqual(before);
    expect(sources(external)).toEqual(originals);
  });

  it('fails closed for a missing required package', () => {
    const project = fixture();
    fs.rmSync(path.join(project, 'node_modules/expo-modules-core'), { recursive: true });
    expect(run(project).status).toBe(1);
    expect(sources(project)).toEqual(originals);
  });
});
