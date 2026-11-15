# Software licences and dependency inventory

This inventory accompanies field 8 of the submission. The UI table is generated from `ui/package-lock.json` and includes optional platform packages. Each package keeps its own licence; the project's Apache-2.0 licence does not apply to them.

## UI: complete locked dependency graph

Lockfile SHA-256: `76d3197fa4838dc6d9e88c6508094abd57af3eeda645172b94d2f25ed26d671f`. 122 package entries; none lacks a declared licence.

| Package | Locked version | Declared licence | Role |
|---|---|---|---|
| `@emnapi/core` | `2.0.0-beta.2` | MIT | Build/test |
| `@emnapi/runtime` | `2.0.0-beta.2` | MIT | Build/test |
| `@emnapi/wasi-threads` | `2.2.0` | MIT | Build/test |
| `@mapbox/jsonlint-lines-primitives` | `2.0.3` | MIT | Runtime dependency graph |
| `@mapbox/point-geometry` | `1.1.0` | ISC | Runtime dependency graph |
| `@mapbox/tiny-sdf` | `2.3.0` | BSD-2-Clause | Runtime dependency graph |
| `@mapbox/unitbezier` | `1.0.0` | BSD-2-Clause | Runtime dependency graph |
| `@mapbox/vector-tile` | `3.0.0` | BSD-3-Clause | Runtime dependency graph |
| `@maplibre/geojson-vt` | `6.3.1` | ISC | Runtime dependency graph |
| `@maplibre/maplibre-gl-style-spec` | `26.7.0` | ISC | Runtime dependency graph |
| `@maplibre/mlt` | `1.3.0` | (MIT OR Apache-2.0) | Runtime dependency graph |
| `@maplibre/vt-pbf` | `4.3.3` | MIT | Runtime dependency graph |
| `@napi-rs/wasm-runtime` | `1.2.6` | MIT | Build/test |
| `@oxc-project/types` | `0.156.0` | MIT | Build/test |
| `@oxlint/binding-android-arm-eabi` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-android-arm64` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-darwin-arm64` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-darwin-x64` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-freebsd-x64` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-linux-arm-gnueabihf` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-linux-arm-musleabihf` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-linux-arm64-gnu` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-linux-arm64-musl` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-linux-ppc64-gnu` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-linux-riscv64-gnu` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-linux-riscv64-musl` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-linux-s390x-gnu` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-linux-x64-gnu` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-linux-x64-musl` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-openharmony-arm64` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-win32-arm64-msvc` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-win32-ia32-msvc` | `1.93.0` | MIT | Build/test |
| `@oxlint/binding-win32-x64-msvc` | `1.93.0` | MIT | Build/test |
| `@rolldown/binding-android-arm-eabi` | `1.2.19` | MIT | Build/test |
| `@rolldown/binding-android-arm64` | `1.2.19` | MIT | Build/test |
| `@rolldown/binding-darwin-arm64` | `1.2.19` | MIT | Build/test |
| `@rolldown/binding-darwin-x64` | `1.2.19` | MIT | Build/test |
| `@rolldown/binding-freebsd-x64` | `1.2.19` | MIT | Build/test |
| `@rolldown/binding-linux-arm-gnueabihf` | `1.2.19` | MIT | Build/test |
| `@rolldown/binding-linux-arm64-gnu` | `1.2.19` | MIT | Build/test |
| `@rolldown/binding-linux-arm64-musl` | `1.2.19` | MIT | Build/test |
| `@rolldown/binding-linux-ppc64-gnu` | `1.2.19` | MIT | Build/test |
| `@rolldown/binding-linux-s390x-gnu` | `1.2.19` | MIT | Build/test |
| `@rolldown/binding-linux-x64-gnu` | `1.2.19` | MIT | Build/test |
| `@rolldown/binding-linux-x64-musl` | `1.2.19` | MIT | Build/test |
| `@rolldown/binding-openharmony-arm64` | `1.2.19` | MIT | Build/test |
| `@rolldown/binding-wasm32-wasi` | `1.2.19` | MIT | Build/test |
| `@rolldown/binding-win32-arm64-msvc` | `1.2.19` | MIT | Build/test |
| `@rolldown/binding-win32-x64-msvc` | `1.2.19` | MIT | Build/test |
| `@rolldown/pluginutils` | `1.1.1` | MIT | Build/test |
| `@tybys/wasm-util` | `0.10.4` | MIT | Build/test |
| `@types/geojson` | `7946.0.16` | MIT | Runtime dependency graph |
| `@types/node` | `24.19.2` | MIT | Build/test |
| `@types/react` | `19.3.0` | MIT | Build/test |
| `@types/react-dom` | `19.3.0` | MIT | Build/test |
| `@typescript/typescript-aix-ppc64` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-darwin-arm64` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-darwin-x64` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-freebsd-arm64` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-freebsd-x64` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-linux-arm` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-linux-arm64` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-linux-loong64` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-linux-mips64el` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-linux-ppc64` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-linux-riscv64` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-linux-s390x` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-linux-x64` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-netbsd-arm64` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-netbsd-x64` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-openbsd-arm64` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-openbsd-x64` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-sunos-x64` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-win32-arm64` | `7.0.2` | Apache-2.0 | Build/test |
| `@typescript/typescript-win32-x64` | `7.0.2` | Apache-2.0 | Build/test |
| `@vitejs/plugin-react` | `6.3.0` | MIT | Build/test |
| `bidi-js` | `1.1.0` | MIT | Runtime dependency graph |
| `csstype` | `3.2.3` | MIT | Build/test |
| `detect-libc` | `2.1.2` | Apache-2.0 | Build/test |
| `earcut` | `3.2.4` | ISC | Runtime dependency graph |
| `fdir` | `6.5.0` | MIT | Build/test |
| `fsevents` | `2.3.3` | MIT | Build/test |
| `gl-matrix` | `3.4.4` | MIT | Runtime dependency graph |
| `json-stringify-pretty-compact` | `4.0.0` | MIT | Runtime dependency graph |
| `kdbush` | `4.1.0` | ISC | Runtime dependency graph |
| `lightningcss` | `1.33.0` | MPL-2.0 | Build/test |
| `lightningcss-android-arm64` | `1.33.0` | MPL-2.0 | Build/test |
| `lightningcss-darwin-arm64` | `1.33.0` | MPL-2.0 | Build/test |
| `lightningcss-darwin-x64` | `1.33.0` | MPL-2.0 | Build/test |
| `lightningcss-freebsd-x64` | `1.33.0` | MPL-2.0 | Build/test |
| `lightningcss-linux-arm-gnueabihf` | `1.33.0` | MPL-2.0 | Build/test |
| `lightningcss-linux-arm64-gnu` | `1.33.0` | MPL-2.0 | Build/test |
| `lightningcss-linux-arm64-musl` | `1.33.0` | MPL-2.0 | Build/test |
| `lightningcss-linux-x64-gnu` | `1.33.0` | MPL-2.0 | Build/test |
| `lightningcss-linux-x64-musl` | `1.33.0` | MPL-2.0 | Build/test |
| `lightningcss-win32-arm64-msvc` | `1.33.0` | MPL-2.0 | Build/test |
| `lightningcss-win32-x64-msvc` | `1.33.0` | MPL-2.0 | Build/test |
| `maplibre-gl` | `6.18.0` | BSD-3-Clause | Runtime dependency graph |
| `minimist` | `1.2.8` | MIT | Runtime dependency graph |
| `murmurhash-js` | `1.0.0` | MIT | Runtime dependency graph |
| `nanoid` | `3.3.20` | MIT | Build/test |
| `oxlint` | `1.93.0` | MIT | Build/test |
| `pbf` | `5.1.2` | BSD-3-Clause | Runtime dependency graph |
| `picocolors` | `1.1.1` | ISC | Build/test |
| `picomatch` | `4.0.7` | MIT | Build/test |
| `postcss` | `8.5.33` | MIT | Build/test |
| `potpack` | `2.1.0` | ISC | Runtime dependency graph |
| `protocol-buffers-schema` | `3.6.1` | MIT | Runtime dependency graph |
| `quickselect` | `3.0.0` | ISC | Runtime dependency graph |
| `react` | `19.3.1` | MIT | Runtime dependency graph |
| `react-dom` | `19.3.1` | MIT | Runtime dependency graph |
| `require-from-string` | `2.0.2` | MIT | Runtime dependency graph |
| `resolve-protobuf-schema` | `2.1.0` | MIT | Runtime dependency graph |
| `rolldown` | `1.2.19` | MIT | Build/test |
| `scheduler` | `0.28.0` | MIT | Runtime dependency graph |
| `source-map-js` | `1.2.2` | BSD-3-Clause | Build/test |
| `tinyglobby` | `0.2.17` | MIT | Build/test |
| `tinyqueue` | `3.0.0` | ISC | Runtime dependency graph |
| `tslib` | `2.9.1` | 0BSD | Build/test |
| `typescript` | `7.0.2` | Apache-2.0 | Build/test |
| `undici-types` | `7.24.6` | MIT | Build/test |
| `vite` | `8.3.8` | MIT | Build/test |

All listed licence identifiers are OSI-approved, including MPL-2.0, ISC and 0BSD.

## Backend and test tools

| Component | Version | Licence evidence |
|---|---|---|
| .NET / ASP.NET Core | Target framework net10.0 | MIT; [runtime](https://github.com/dotnet/runtime/blob/main/LICENSE.TXT), [ASP.NET Core](https://github.com/dotnet/aspnetcore/blob/main/LICENSE.txt) |
| Microsoft.AspNetCore.OpenApi | 10.0.12 | MIT; direct project reference |
| PureHDF | 2.2.0 | MIT; NuGet v3 catalog `licenseExpression`, checked 15 November 2026 |
| Microsoft.AspNetCore.Mvc.Testing | 10.0.* | MIT; floating version is not a frozen resolved version |
| Microsoft.NET.Test.Sdk | 18.0.1 | MIT; [VSTest](https://github.com/microsoft/vstest/blob/main/LICENSE) |
| xunit | 2.9.3 | Apache-2.0; [tagged source licence](https://github.com/xunit/xunit/blob/v2-2.9.3/license.txt) |
| xunit.runner.visualstudio | 3.1.5 | Apache-2.0; [source licence](https://github.com/xunit/visualstudio.xunit/blob/main/License.txt) |

Transitive NuGet packages of these references are restored from nuget.org under their own licences.

## Presentation, video and tooling

| Component | Role | Licence |
|---|---|---|
| Overpass | Presentation fonts | SIL Open Font License 1.1; [text](../presentation/assets/fonts/Overpass-OFL.txt), [provenance](../presentation/assets/fonts/sources.json) |
| Fira Sans | Presentation fonts | SIL Open Font License 1.1; [text](../presentation/assets/fonts/FiraSans-OFL.txt) |
| FFmpeg, Chrome / Chromium, Node.js, Python, PowerPoint | Video processing, screen capture, slide export | Used as tools only; no binaries are distributed with the project |

The website publishes the licence and notice texts of its dependencies in [`third-party-notices.txt`](../../ui/public/third-party-notices.txt).
