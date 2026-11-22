import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts/patch-apple-authentication.mjs');
const preflightScript = path.join(root, 'scripts/check-apple-auth-integration.mjs');
const temporaryRoots: string[] = [];
const names = ['AppleAuthenticationModule.swift', 'AppleAuthenticationRequest.swift', 'AppleAuthenticationExceptions.swift'] as const;

// Exact Swift files from the published 57.0.2 npm tarball (byte-identical to 8.0.8), gzip/base64 to keep
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

// Exact Core 57.0.26 APIs from the independently integrity-checked publication.
const coreFixturePayloads: Record<string, string> = {
  'Core/Functions/AsyncFunctionDefinition.swift': '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',
  'Core/Exceptions/Exception.swift': 'H4sIAAAAAAACA9VWy27jNhTd+ytu042VcexBgHYhIHVTewqkxaBAMsVsAjQ0dW0TYUiBpOzxFN32A/qJ/ZJeXsqSLCtFZ1kgMczXOee+PZvBwpYHpzbbANdvr6+vSoceTYBvv3kLd6aofHAK/RRutQa+5iHecDsspqORLdGA1MJ7ePdJYhmUNTlBFli8c866CSy2Qhmx0tic0x6h2pcHQjabhTU7dEHRjePBElfVZuD0J7ETD9KpMnzYOrsXvPl9ZeQW5TMW8ICmiJvw+wiAlWnx+QA74cCIF8whYcJN/WVcoCe4FX2lM9TrqaePbESvZ5eX9Hl80N6DsEWyX3hrwK55hUe7pvHF5ezIHWnTzYY46gKQbOR9ApnP4aIyBa6VIQvS/Qu69kdHxQdiseR7ZYD+JDkX9lt0eEoPe+FBEkKIkTmTkgDyNky/8EaH5rZWlhjOrIOPW4KqjMcw4aOneO8JFLEKLSsdiWHtCOBUV/Q90ddpEletPI2hZo05c3TUfEjVK16fwEbtSBgZz6JSrPjoCYLlTWVUUEKrz+hoLQIE8YweRCvmzLbExtbhpxJltI3QpCVb2EZBUig1nSoiPmH5asUWDhl3f5IH815sKfqi0uFcphRlqKjaWFKphWSquPjPSXAFH4UznOELQSWsAlijD7BXYWurAMJtqheqd/9VI7usVlpJVjNeK92tm6/j+m45AU3pmsOvd9QoaDeuJrCmSkz137lf72V17scCm9a5fNPPxZotfh4Z+sgNXovWpg8hGqX7J3WhHc+4sLomdlvDBDrp027Kbm4mpAn831wTjXjVNx2z2ztcuDdcJE1HmsH72/ufc8qrtsmPun2m66uThscyqN1hfBIXP7rjDOAYZEMcZ8PjlEtUnshYxLz/dHjGjM5Gw0DE2VtGirBsz8apI0y4chaJmPljztC8ogAI7TEblDE80U5sYZDlgJbkw9hL+ldI5sVj8l0Oj7XADMbUOR7HKZOmMWOyvFnGpMmyC4Z0SM3FDFja5/kXm4Or6sBR6LilLRgODf37Xm/qeJoRqRn5hNc9orZFbah0akcQnNUDEn8bLtRG52lqNHJ/sFaT11Kk4Oq7ro+5W8dXD1gKJwJNrOhf8/effwFjFrA65BB954lHbmvp8a0U9KUBiLOo/TXU9XXXA2/6bG8geR7m6WR6Fu+8OWj2skH2tjYTPSXkU7vHU61A+qUneWavaA7sEQymGVc6u4tTbSXk8164wsepVwpKWaVVOER8H8fgiy0qHceopswrDsAuUmH6BQafmXNmzTz/YjhtJQ/RYnmCW0/Z1/DqJP4H91RdtRELAAA=',
  'Utilities/Utilities.swift': 'H4sIAAAAAAACA8VYYXPbuBH9rl+xcdpGSi06TSdpqyZRfE4y9fQSp7Zz+XBzE8HkysKZAjgAKUXtpb+9bwGSImU51861U08yEonFYvft7tuFjo7oxBYbp68XJT1+9PjxuHDs2ZT09MkjOjVZ5Uun2Sd0nOcUxDyJhFtxlgwGRw8fDuj1Z06rkj2VC6ZrvWJDF2s9LynNra8ckzIZ6TnpEhLOrv1hkJy9u3jtnHUz0p48l2RNR0Oz+t5qUzKERIksW1ihjcqJZVn2Og5qTTKgywWe8Y99walWeb6hyvO8ymkO2bOrH0+ejV9E44JaWxxSEJ3rNEivFxytEFkyzBncspSqMl3EE310wtDVpu8mjn94NAhqxbx5ZVJylfmoy0XXk2fnL4afoqr6zYT6vh7Sp0bnhIajGjQav6DzUeNsfJzSPwZEmQ0fJGuVg/lu0+wfjrDwpTY/CnVPniZF+ML0HF7WVgyDxCgIh7PiFlE0+FKH/MSaFTvkQkSgAcZ2guotdisJOcMcBbyYFghizhnNnV1uUU5tthe8rUU1XhMKjyPxvV4KTiG3cq6tgCfxU/kpMjPlotRIrB5AjdrMLpU2EzrIeJXw58ImS5tVOfuDw2DUhB4dSv64UzO3E/o+6CA6MGrJB5N4TiIPh82K7GpX5KFdWbL36nq7mPFVdf2Kfep0sDDI/RDCNWgNbTxpLA74H9Hb4/O/TmhMH86/9XVAjkkK1VzTGulGxpqxygvAXS3Z6ZQql4+9mjOlC+VUCpQ9qTS1LpM9iNv5mxP6/Z/++DTUEOq7K7gM7LBQKxZJhBFQ5TrVJeqlYJeCLsZsxNss1g8gQ8EbsQ84LgtrIOLJIuJOksKE4jOZUEgv7BJFmAqusWvOTrYmPKeDcfLpn5Oj6f3vf3h571e/eTAcPfzt4Z+fH7T+z1rxCy7BKcaXyqRwxJoSURY/UeHUhcUHUulCEg8W25G5OSsvrMRUKIcvc1Li0r9pM6yA2V2jkt7ZSWUQ9mFXYLg15RRpuU/raFQ7fB4ypMu53QTYDUvHx1CUCqxsbNlz2GzERdG3EzfkX8ZzbSAHzutlSmTbDsWqqrTxVLEFLsr5neP31Xlt7Otg6weXXwRHUPQAYELxKdR8/BpJLxR89C6+BtiQT1QmJ7/vqBRdAsotLCd3xW3UqcDuEdPEcZGrFF/P0rRyDqvsh3YOCvn14ydgDTlHHg5GW6pccHrjpTDq9N+JF/BTNNd5hL1QiN5QvnXCaatAo+TTBS95tA9D7d9ABcB7DwWATvT0sPvG2jwAd10pl3Xhkx0AT3b8d9AjzkEgPcadK7zqcxt8HEYfJ11LRtMkuknPn5PRueDYdzWNvefSwttaA61UXnHPX6jfJkpIJHkTm8V9tVI6V1c5D/XZBf3uD4f0cFQbDHrtWDYiXxWFlU7X5L2UAyROtvURullUFFTgNODZ9S+YF1txwGaPDU9v2dA5AfzjuWYrC2JzVVoGK+5m8ajmDUrSW4BZmcpXQBC2+b6Daw1WnMMWkABUOU7B630/tpbseDRNRGY6/aqzd/iEphwcfxLckjRymGTgpfDSmmFUDf1trz5y242QWPmVSm+CBVJF+JSJS1IJzs2182XS8SYYlyyUf+9AaZ+HB0cHo7pFT/fq2Lojf5NfAsegV30iertQJONjmcDP0zAzw1hgUhc/KAbztPdoIrK2VrEDBP4I3LFeaIx67eCKbo2IOlYl2Lt9ttdG/x0vuruFPLfVKU91Hd4LdQh4xOLJV0FqOO8vnIPUMYTC0thw4LH0CTSQIr7j0GGgxz1Ae1GlGoNB4IOzJTJQRrY0EidaTqluQoJjUziIhBDRq7S3uRJZGD6my7NXZxP0xaVdBWysdP94EFpQuCfMQVLWRSQyRjlccQlqiT0zipqa1zeEWZDzHa6NHr2zJh7N2QcjY9V3yj3D/8tNwS8m9BIsJbbjnAtMOVLjIchmu21YhX0j+OMa8qoVSJZgXClB4v2Fhh085/Mk4lDnc280/1bf4G4122fjbHZIV4BuYfNMus6a1Y2gwqGRycQO2OpRPVUFEiGMBgBLRrZa26C91jWtiT/LMNdEqNWXkb36EbFEfHM951IvOaEP21HB15tUGFdnDVSzQb0P1Oas99uzJSmubAUxJxc1Sdob5iJ0SfHE81KZUkar/3M6fIQ1nZSY0LHZnAWf/sPsCG7dTpHpnTky/fkkuTV7IRbLiw2MctbYyuebM/MWA/OxYPPsnH2Vl5PWVLm7tnfTl63czjU1bNq5q4Z3zXXtcgFKyhLtRUN8uH2HbbUnkfBOG3hqA3YuS7LllfaF3HX/VjFoXm53iYdrQ44/UUyo3dovl5+BYRbKpjuKbdO17sgQbX/BcMFXXP0kzVMlrRvjn+N6UaxF9GN0UG7S8DzS2883Hb13TMp3mBkxrMPVC9L/IjK9Xxd+aQSOgWCe16QPVq9KnetyEzyWdz7AiCrQ8BdX+sLS23hNlxayFMyVv6lvFkV1haspxRGJPgRVGpLiQjiNtr9dKKAdmvRMCABPaGmzMCxAEVGrCqFJI/7ogG8w7LW9fd+82aKxZ06d1FN9Ow50ir45L864gXXK7zSvYW7pBCA3jAed9t/unHpX0UDqPsJrvYybI/rpJ/larvC9Hm2EZtJWqwx+p8eF3PNjh/UY8XFfv+HNR20yu8ZdyNodAwe1qsjNMuTUvybihtDVvD1mmrQSfVWHdG/PXqTlNwz8kGRL7T03qSl/Pdv37K0Fv9Sf2yA16/dlGosQLVW6BQaD2OtV+FXQVtexLzSp+cC3qQ/ylaYy2w0PWi5qKC3HBjiueAzV1sehW+UaA9js3cXOjvA72i09Sd/wdxdfj444diuD4CN67nzQACEN4V+ndxk9AxYAAA==',
};
const coreHashes: Record<string, string> = {
  'Core/Functions/AsyncFunctionDefinition.swift': '8fa2ce2108df97f352a6f9c624cd1e2555862a14324db46f4144429d6b3b4387',
  'Core/Exceptions/Exception.swift': 'a2c5ecb174606a77357ba33fb66fa4015a88daeaae1b72d90488693589ac28d3',
  'Utilities/Utilities.swift': '115312ddb3a4219b48ba5ae68a714481ae89a3c7ced6cf600f46de2b5a86e76e',
};
const coreOriginals: Record<string, string> = Object.fromEntries(Object.entries(coreFixturePayloads).map(([file, payload]) => [
  file, gunzipSync(Buffer.from(payload, 'base64')).toString('utf8'),
]));

function fixture(appleVersion = '57.0.2', coreVersion = '57.0.26') {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'hy3n-apple-native-test-'));
  temporaryRoots.push(project);
  const packageRoot = path.join(project, 'node_modules/expo-apple-authentication');
  fs.mkdirSync(path.join(project, 'scripts'), { recursive: true });
  fs.copyFileSync(script, path.join(project, 'scripts/patch-apple-authentication.mjs'));
  fs.copyFileSync(preflightScript, path.join(project, 'scripts/check-apple-auth-integration.mjs'));
  fs.mkdirSync(path.join(packageRoot, 'ios'), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'expo-apple-authentication', version: appleVersion }));
  const coreRoot = path.join(project, 'node_modules/expo-modules-core');
  fs.mkdirSync(coreRoot, { recursive: true });
  fs.writeFileSync(path.join(coreRoot, 'package.json'), JSON.stringify({ name: 'expo-modules-core', version: coreVersion }));
  for (const [file, source] of Object.entries(coreOriginals)) {
    const target = path.join(coreRoot, 'ios', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  }
  for (const name of names) fs.writeFileSync(path.join(packageRoot, 'ios', name), originals[name]);
  return project;
}

function sourcePath(project: string, name: typeof names[number]) {
  return path.join(project, 'node_modules/expo-apple-authentication/ios', name);
}
function sources(project: string) {
  return Object.fromEntries(names.map((name) => [name, fs.readFileSync(sourcePath(project, name), 'utf8')])) as typeof originals;
}
function run(project: string, entry = 'patch-apple-authentication.mjs') {
  return spawnSync(process.execPath, [path.join(project, 'scripts', entry)], {
    cwd: project, encoding: 'utf8', timeout: 10_000,
  });
}

function verify(project: string) {
  return spawnSync(process.execPath, ['--input-type=module', '-e',
    'import { verifyAppleAuthentication } from "./scripts/patch-apple-authentication.mjs"; await verifyAppleAuthentication();'], {
    cwd: project, encoding: 'utf8', timeout: 10_000,
  });
}
function coreSources(project: string) {
  return Object.fromEntries(Object.keys(coreOriginals).map((file) => [file,
    fs.readFileSync(path.join(project, 'node_modules/expo-modules-core/ios', file), 'utf8'),
  ]));
}
function preflightFixture(project: string, options: { expoVersion?: string; appleRange?: string; cryptoVersion?: string; config?: unknown; autolinking?: unknown } = {}) {
  const writeJSON = (target: string, value: unknown) => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value));
  };
  writeJSON(path.join(project, 'package.json'), { dependencies: {
    'expo-apple-authentication': '~57.0.2', 'expo-crypto': '~57.0.4',
  } });
  const expoRoot = path.join(project, 'node_modules/expo');
  writeJSON(path.join(expoRoot, 'package.json'), {
    name: 'expo', version: options.expoVersion ?? '57.0.33', dependencies: { 'expo-modules-core': '~57.0.26' },
  });
  writeJSON(path.join(expoRoot, 'bundledNativeModules.json'), {
    'expo-apple-authentication': options.appleRange ?? '~57.0.2',
    'expo-crypto': '~57.0.4', 'expo-modules-core': '~57.0.26',
  });
  writeJSON(path.join(project, 'node_modules/expo-crypto/package.json'), {
    name: 'expo-crypto', version: options.cryptoVersion ?? '57.0.4',
  });
  writeJSON(path.join(project, 'config.json'), options.config ?? {
    ios: { supportsTablet: true, usesAppleSignIn: true,
      entitlements: { 'com.apple.developer.applesignin': ['Default'] } },
    plugins: ['expo-apple-authentication', ['expo-build-properties', { ios: { enableSceneSupport: true } }]],
  });
  writeJSON(path.join(project, 'autolinking.json'), options.autolinking ?? { modules: [{
    packageName: 'expo-apple-authentication', packageVersion: '57.0.2',
    modules: ['AppleAuthenticationModule'], swiftModuleNames: ['ExpoAppleAuthentication'],
    pods: [{ podName: 'ExpoAppleAuthentication' }],
  }] });
  // Stub only the two allowed source introspection commands. This tests preflight
  // control flow, not the actual Expo CLI/autolinker or a generated native provider.
  fs.mkdirSync(path.join(expoRoot, 'bin'), { recursive: true });
  for (const [entry, args, output] of [
    ['cli', ['config', '--type', 'public', '--json'], 'config.json'],
    ['autolinking', ['resolve', '--platform', 'ios', '--json'], 'autolinking.json'],
  ] as const) {
    fs.writeFileSync(path.join(expoRoot, 'bin', entry), `
const fs = require('node:fs');
if (JSON.stringify(process.argv.slice(2)) !== ${JSON.stringify(JSON.stringify(args))}) throw new Error('Unexpected Expo command');
fs.appendFileSync('commands.log', ${JSON.stringify(entry + '\n')});
process.stdout.write(fs.readFileSync(${JSON.stringify(output)}, 'utf8'));
`);
  }
}

afterEach(() => {
  for (const directory of temporaryRoots.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('SDK57 Apple authentication native safety backport (offline source fixtures)', () => {
  it('uses the exact independently hashed published 57.0.2 Swift fixture bytes', () => {
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
    expect(exceptions).toContain('final class WindowUnavailableException: Exception, @unchecked Sendable');
    expect(request).toContain('request.nonce = options.nonce');
    expect(request).toContain('pendingRequests.insert(self)');
    expect(request).toContain('pendingRequests.remove(self)');
    expect(exceptions).toContain("Couldn't present the Sign in with Apple sheet because no active window is available");
  });

  it.each(['8.0.8', '57.0.1', '57.0.3', '58.0.2'])('rejects unexpected Apple version %s without changing any file', (version) => {
    const project = fixture(version);
    const before = sources(project);
    const result = run(project);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unsupported expo-apple-authentication');
    expect(sources(project)).toEqual(before);
  });

  it('rejects a different Core version without changing any file', () => {
    const project = fixture('57.0.2', '57.0.25');
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

// Expo executable output is stubbed below; only source/preflight logic is exercised.
describe('SDK57 Core audit and Apple preflight boundaries (offline)', () => {

  it('binds the Core queue, Exception and Utilities fixture bytes to published 57.0.26', () => {
    for (const [file, source] of Object.entries(coreOriginals)) {
      expect(createHash('sha256').update(source).digest('hex')).toBe(coreHashes[file]);
    }
    const queue = coreOriginals['Core/Functions/AsyncFunctionDefinition.swift'];
    expect(queue).toContain('public func runOnQueue(_ queue: DispatchQueue?) -> Self');
    expect(queue).toContain('queue ?? defaultQueue');
    expect(queue).toContain('supportsAsyncScheduling');
    expect(coreOriginals['Core/Exceptions/Exception.swift']).toContain('@unchecked Sendable');
    expect(coreOriginals['Utilities/Utilities.swift']).not.toMatch(/func keyWindow\(/);
  });

  it.each(Object.keys(coreOriginals))('rejects drift in reviewed Core %s before any Apple write', (file) => {
    const project = fixture();
    fs.appendFileSync(path.join(project, 'node_modules/expo-modules-core/ios', file), '// altered Core API\n');
    const before = coreSources(project);
    const result = run(project);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Incompatible source in Core');
    expect(sources(project)).toEqual(originals);
    expect(coreSources(project)).toEqual(before);
  });

  it.each(['3.0.30', '57.0.27'])('rejects unreviewed Core version %s even when APIs match', (version) => {
    const project = fixture('57.0.2', version);
    expect(run(project).status).toBe(1);
    expect(sources(project)).toEqual(originals);
  });

  it('read-only verification rejects original or incomplete source without writing it', () => {
    const project = fixture();
    expect(verify(project).status).toBe(1);
    expect(sources(project)).toEqual(originals);
    expect(run(project).status).toBe(0);
    const patched = sources(project);
    const mtimes = names.map((name) => fs.statSync(sourcePath(project, name)).mtimeMs);
    expect(verify(project).status).toBe(0);
    expect(sources(project)).toEqual(patched);
    expect(names.map((name) => fs.statSync(sourcePath(project, name)).mtimeMs)).toEqual(mtimes);
    fs.writeFileSync(sourcePath(project, names[0]), originals[names[0]]);
    const incomplete = sources(project);
    expect(verify(project).status).toBe(1);
    expect(sources(project)).toEqual(incomplete);
  });

  it('read-only verification can audit a shared dependency overlay but patching cannot', () => {
    const project = fixture();
    const shared = fixture();
    expect(run(shared).status).toBe(0);
    const before = sources(shared);
    fs.rmSync(path.join(project, 'node_modules'), { recursive: true });
    fs.symlinkSync(path.join(shared, 'node_modules'), path.join(project, 'node_modules'), 'dir');
    expect(verify(project).status).toBe(0);
    expect(run(project).status).toBe(1);
    expect(sources(shared)).toEqual(before);
  });

  it('SDK57 preflight accepts audited sources and capability/scene/autolinking output without generating native files', () => {
    const project = fixture();
    expect(run(project).status).toBe(0);
    const before = sources(project);
    preflightFixture(project);
    const result = run(project, 'check-apple-auth-integration.mjs');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('SDK 57 Apple 57.0.2 / Core 57.0.26');
    expect(result.stdout).toContain('not compilation, binary or device verification');
    expect(fs.readFileSync(path.join(project, 'commands.log'), 'utf8')).toBe('cli\nautolinking\n');
    expect(sources(project)).toEqual(before);
    expect(fs.existsSync(path.join(project, 'ios'))).toBe(false);
    expect(fs.existsSync(path.join(project, 'android'))).toBe(false);
  });

  it('preflight rejects unpatched sources before invoking the config CLI or autolinker', () => {
    const project = fixture();
    preflightFixture(project);
    const result = run(project, 'check-apple-auth-integration.mjs');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing or incomplete');
    expect(fs.existsSync(path.join(project, 'commands.log'))).toBe(false);
    expect(sources(project)).toEqual(originals);
  });

  it.each([
    [{ expoVersion: '54.0.37' }, 'not the reviewed SDK'],
    [{ appleRange: '~58.0.2' }, 'catalog range'],
    [{ cryptoVersion: '15.0.9' }, 'incompatible with ~57.0.4'],
  ])('preflight rejects incompatible installed/catalog metadata before CLI execution: %j', (options, error) => {
    const project = fixture();
    preflightFixture(project, options);
    const result = run(project, 'check-apple-auth-integration.mjs');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(error);
    expect(fs.existsSync(path.join(project, 'commands.log'))).toBe(false);
    expect(sources(project)).toEqual(originals);
  });

  it.each([
    [{ newArchEnabled: false }, 'obsolete newArchEnabled'],
    [{ newArchEnabled: true }, 'obsolete newArchEnabled'],
    [{ ios: { supportsTablet: false } }, 'iPhone/iPad'],
    [{ ios: { supportsTablet: true, usesAppleSignIn: false } }, 'usesAppleSignIn'],
    [{ plugins: ['expo-apple-authentication', ['expo-build-properties', { ios: { enableSceneSupport: false } }]] }, 'enableSceneSupport'],
    [{ plugins: [['expo-build-properties', { ios: { enableSceneSupport: true } }]] }, 'config plugin'],
  ])('preflight rejects missing capability, obsolete architecture or scene safeguards: %j', (overrides, error) => {
    const project = fixture();
    expect(run(project).status).toBe(0);
    preflightFixture(project);
    const configPath = path.join(project, 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    fs.writeFileSync(configPath, JSON.stringify({ ...config, ...overrides }));
    const result = run(project, 'check-apple-auth-integration.mjs');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(error);
    expect(fs.readFileSync(path.join(project, 'commands.log'), 'utf8')).toBe('cli\n');
  });

  it.each([
    [{ modules: [] }, 'different Apple package version'],
    [{ modules: [{ packageName: 'expo-apple-authentication', packageVersion: '57.0.2', modules: [], pods: [] }] }, 'not discoverable'],
  ])('preflight rejects incomplete source autolinking: %j', (autolinking, error) => {
    const project = fixture();
    expect(run(project).status).toBe(0);
    preflightFixture(project, { autolinking });
    const result = run(project, 'check-apple-auth-integration.mjs');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(error);
  });

});
