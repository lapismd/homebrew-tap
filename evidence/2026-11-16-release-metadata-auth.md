# Authenticate canonical release metadata

Homebrew update PR #11 run `43809436113`, Linux x64 job `133107883966`,
passes the existing stable installation journey, then fails at `Verify published
preview` before preview installation: `Unable to read desktop release: HTTP 403`.
The verifier made its GitHub API request anonymously. ARM64 and macOS jobs pass;
no archive/hash or installed preview regression is established by this failure.
The failed invocation remains retained rather than relabelled as a pass.

Exact regression before implementation:

```sh
node --test --test-name-pattern='scoped API authentication' tests/release-auth.test.mjs
```

Both stable and preview cases fail with the same HTTP 403: zero pass/two fail.
After the source change, that exact command passes two/zero. The complete
`npm test` passes 25/25, including fatal authenticated failures without retry;
`npm run check` passes all syntax and generated-cask checks. Formatting of the
changed sources, workflow and contract passes before commit.

`readPublishedManifest` accepts an optional read token. Its CLI and preview
verifier explicitly pass `GH_TOKEN`/`GITHUB_TOKEN`; native CI supplies its
existing contents-read workflow token to the metadata step. Only fixed canonical
GitHub release/tag API calls receive it. Those requests set `redirect: error`.
Manifest and archive requests remain public with no authorization header.
Channel, tag/source, canonical URL, size and SHA-256 validation remain strict.
The tests check both channels, annotated tags, unauthenticated downloads and no
retry/fallback after an authenticated 403. No token is stored or logged.

This source PR does not edit a generated cask, manifest, release tag or asset.
Hosted checks and all three native installer jobs must qualify the source fix.
PR #11 must then incorporate the checked main fix and pass a fresh complete
run before merging its two generated files. The official public-cask main run
remains a separate final delivery boundary. Desktop's published candidate and
its immutable bytes are unchanged.
