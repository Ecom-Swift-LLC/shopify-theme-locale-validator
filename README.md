# shopify-theme-locale-validator

A zero-dependency CLI that checks a Shopify theme's `locales/*.json` files for the mistakes
that slip past a visual QA pass: a translation that's missing a key entirely, a pluralization
group missing its mandatory `other` form, a translated string that silently dropped a
`{{ count }}` or `{{ product_title }}` placeholder, a copy-pasted JSON key that quietly
overwrote itself, and a `| t` / `t:` reference in your Liquid that points at a key which was
never defined.

**Try it on your own store first:** [run the free audit](https://audit.ecomswiftllc.com/?utm_source=github&utm_medium=repo&utm_campaign=shopify-theme-locale-validator) — it checks SEO, speed, CRO and AI-visibility signals on a live store in about a minute.

## Example output

Run against the `sample-theme/` fixture in this repo (which plants one of each issue on purpose):

```
$ stlv check sample-theme

Theme locale check — sample-theme

storefront namespace: default=en.default.json locales=[de, en, fr] keys=7
schema namespace: default=en.default.schema.json locales=[en, fr] keys=5
Usage scan: 6 theme file(s) scanned, 1 undefined-key use(s), 3 possibly-unused key(s)

[ERROR] "products.pric.from_price_html" is used with the `t` filter at snippets/price.liquid:7 but is not defined in en.default.json
[ERROR] "products.stock_notice" is a pluralization group in the default locale but a plain string in de
[ERROR] locales/fr.json: duplicate key "placeholder" at "general.search.placeholder" (line 5) — the earlier value is silently discarded
[ERROR] Pluralization group at "products.stock_notice" in fr has no "other" form — CLDR requires "other" in every language
[ERROR] "cart.added_notice" in fr is missing placeholder(s) {{ product_title }} present in the default locale ("Added {{ product_title }} to your cart")
[ERROR] "customers.orders.order_count" exists in the default locale but is missing from fr
[ERROR] "sections.hero.settings.heading.label" exists in the default locale but is missing from fr
[WARN ] "cart.old_checkout_button" exists in fr but not in the default locale (stale or renamed key?)
[INFO ] "general.newsletter.success" is defined in en.default.json but no static reference to it was found (may be built dynamically — see "What it does NOT do")
[INFO ] "products.price.from_price_html" is defined in en.default.json but no static reference to it was found (may be built dynamically — see "What it does NOT do")
[INFO ] "sections.announcement_bar.name" is defined in en.default.schema.json but no static reference to it was found (may be built dynamically — see "What it does NOT do")

7 error(s), 1 warning(s), 3 info
```

Every one of those is planted intentionally — see `sample-theme/locales/fr.json` and
`sample-theme/snippets/price.liquid` to see exactly what triggers each line, side by side
with the rule that caught it.

## Features

- **Two namespaces, correctly separated.** Shopify themes carry *storefront* strings
  (`locales/en.default.json`, rendered with `{{ 'key' | t }}`) and *schema/editor* strings
  (`locales/en.default.schema.json`, referenced with `"t:key"` inside `{% schema %}` tags) as
  two independent sets. stlv checks each against its own default, never cross-contaminating
  the two.
- **Missing and stale keys**, per non-default locale, against whichever file is the single
  `*.default.json` / `*.default.schema.json`.
- **Pluralization correctness.** Recognizes Shopify's documented CLDR pattern
  (`{ "one": "...", "other": "..." }` and friends) and requires every language's pluralized
  key to define `other`, per the CLDR rule that holds for every locale including the default.
- **Placeholder parity.** Extracts the `{{ variable }}` tokens from the default string (or
  each plural form) and flags a translation that dropped one — the easiest-to-miss, most
  common real translation bug, because the string still "looks fine" to a translator who
  doesn't speak Liquid.
- **Duplicate-key detection that `JSON.parse` can't give you.** A locale file with the same
  key twice is valid JSON — `JSON.parse` just keeps the last value and tells you nothing. stlv
  ships its own JSON parser that tracks every key as it's read and reports duplicates with
  the line number of the one that got silently discarded.
- **Cross-references your actual Liquid.** Scans every `.liquid`/`.json` file outside
  `locales/` for `'key' | t` and `"t:key"` references, flags a reference to a key that doesn't
  exist (the single most common real bug — a typo in a translation key, which Liquid will not
  error on, it'll just render the raw key string to a customer), and reports likely-unused
  keys as low-confidence informational findings.
- **No network calls, ever.** Works fully offline — useful in a CI runner with no outbound
  internet, which `shopify theme check`'s schema-reference checks currently require (see
  "vs. `shopify theme check`" below).
- **Exit codes a CI pipeline can use.** `0` clean, `1` on any error (or any warning with
  `--strict`), `2` on a tool-level problem (bad path, no `locales/` directory).

## Installation

```bash
git clone https://github.com/Ecom-Swift-LLC/shopify-theme-locale-validator.git
cd shopify-theme-locale-validator
npm link   # or: node bin/stlv.js check <theme-dir>
```

No dependencies to install — it's plain Node.js (18+), nothing else.

## Usage

```bash
stlv check                        # validate ./locales against the current directory
stlv check path/to/theme          # validate a specific theme directory
stlv check path/to/theme --json   # machine-readable report (for CI, or piping into jq)
stlv check path/to/theme --strict # also exit non-zero on warnings, not just errors
stlv check path/to/theme --no-usage-scan
                                   # skip scanning Liquid files for key usage (faster; drops
                                   # the undefined-key-used and unused-key checks entirely)
```

In CI (GitHub Actions example):

```yaml
- name: Check theme locales
  run: npx --yes github:Ecom-Swift-LLC/shopify-theme-locale-validator check . --strict
```

## What it does NOT do

- **It is not a Liquid interpreter.** A key assembled at runtime —
  `{{ 'blocks.' | append: block.type | append: '.title' | t }}` — can't be resolved by a
  static regex scan. Such a key will never show up as "used", so its "possibly unused"
  finding is a false positive. That's exactly why unused-key findings are reported as `INFO`,
  never as an error that fails a build.
- **It does not validate Liquid syntax, theme structure, or non-locale schema correctness.**
  For that, run `shopify theme check` — see the comparison below.
- **It does not translate anything or suggest translated text.** It only checks structural
  and mechanical consistency between the locale files you already have.
- **It does not catch grammatically or culturally wrong translations.** A translator who
  keeps every key and every placeholder but mistranslates the actual meaning will pass every
  check here — this tool checks structure, not meaning.
- **It does not fetch or validate against Shopify's remote JSON schemas.** Everything runs
  from the files on disk; see below for why that's actually the point.

### vs. `shopify theme check`

Shopify's own `shopify theme check` already ships a `MatchingTranslations` check and a
`TranslationKeyExists` check, and they **do** catch some of the same mistakes — running it
against this repo's own `sample-theme/` fixture confirms it independently flags the planted
duplicate key, the missing `fr` key, the stale `cart.old_checkout_button`, the `de` type
mismatch, and the `price.liquid` typo. If you already run `theme check` in CI, you are not
starting from zero.

What stlv adds on top:

- **Placeholder (`{{ count }}`) parity** — `theme check` does not check this at all, and a
  translation that drops a placeholder renders broken text to a real customer, silently.
- **The CLDR "other" form requirement**, reported explicitly for every pluralized key.
- **No network dependency.** `theme check`'s `ValidJSON` and `ValidSchema` checks resolve
  Shopify's remote theme schema files (e.g.
  `raw.githubusercontent.com/Shopify/theme-liquid-docs`) over the network; in this repo's own
  sandboxed build environment, with no outbound internet access, those two checks failed with
  a fetch error on every single locale and schema file in `sample-theme/` — not because the
  files were wrong, but because the check itself couldn't run. stlv's locale checks need
  nothing but the files already on disk, so they run the same way in an air-gapped CI runner,
  a pre-commit hook, or a laptop on a plane.
- **A single, focused report** for exactly this problem, instead of filtering it out of a
  full theme-check run that also covers performance, accessibility and dead-code checks.

Run both. They check different things.

## FAQ

**Does this work with a brand-new theme that has no translations yet, just `en.default.json`?**
Yes — with only one locale file, there's nothing to compare against, so stlv just checks that
single file's own JSON validity, duplicate keys, and pluralization structure, plus the usage
scan if enabled.

**What about regional variants like `pt-BR.json` or `zh-CN.json`?**
Supported — the filename classifier accepts a 2-3 letter language code with an optional
region/script subtag, matching Shopify's own locale file naming.

**My schema locale file doesn't have a matching default — is that an error?**
Yes. Shopify requires exactly one `*.default.schema.json`, same rule as the storefront
namespace's `*.default.json`. If you only have `en.schema.json` instead of
`en.default.schema.json`, stlv reports `no-default-locale` for the schema namespace.

**Can I use this outside a Shopify theme?**
The namespace rules (storefront vs. schema, the default-file requirement, the CLDR
pluralization pattern) are Shopify-specific, so no — it's built for `locales/` inside a theme.

---

A clean `stlv check` means your translations are structurally sound — it says nothing about
whether the store itself converts, loads fast, or shows up right in AI shopping surfaces. If
you've fixed everything this flags and want to know what's actually costing you sales, the
[free audit](https://audit.ecomswiftllc.com/?utm_source=github&utm_medium=repo&utm_campaign=shopify-theme-locale-validator) covers that in the same report.

## Related Shopify tools

Also from Ecom Swift LLC:

- [shopify-section-schema-validator](https://github.com/Ecom-Swift-LLC/shopify-section-schema-validator) — validates `{% schema %}` JSON itself (ids, limits, select/range rules); this repo validates the *translations* that schema references, a different file entirely.
- [shopify-liquid-linter](https://github.com/Ecom-Swift-LLC/shopify-liquid-linter) — alt text and deprecated-tag checks across `.liquid` files.
- [shopify-theme-performance-auditor](https://github.com/Ecom-Swift-LLC/shopify-theme-performance-auditor) — theme asset/performance auditing.
- [shopify-accessible-components](https://github.com/Ecom-Swift-LLC/shopify-accessible-components) — WCAG-conscious drop-in Liquid components.
- [shopify-theme-deploy-action](https://github.com/Ecom-Swift-LLC/shopify-theme-deploy-action) — a GitHub Action for theme CI/CD; wire `stlv check . --strict` in alongside it.

**Building a multi-language store and want more than a lint check?** The same audit that
powers our paid work also scores [AI-shopping readiness](https://github.com/Ecom-Swift-LLC/shopify-ai-shopping-readiness) and general store health — worth a look once your locales
pass clean.

## Contributing

Issues and PRs welcome — especially real-world locale mistakes this tool missed. Run the
suite with `npm test` (plain `node --test`, no test framework dependency) before opening a
PR.

## Roadmap

- `--fix` for the mechanical cases (stripping a confirmed-stale extra key, for example)
- A GitHub Action wrapper, matching the pattern in `shopify-theme-deploy-action`
- Optional detection of HTML-unsafe interpolation (`{{ }}` vs. the `t` filter's `html:` mode)

## License

MIT © Ecom Swift LLC — see [LICENSE](LICENSE).

## Need help?

We build Shopify themes, storefronts and automation for a living. If a locale check here
turned up something you'd rather have fixed than DIY, or you want a second pair of eyes on
your theme generally:

- **Free store audit** (SEO + speed + CRO + AI visibility, one report): [audit.ecomswiftllc.com](https://audit.ecomswiftllc.com/?utm_source=github&utm_medium=repo&utm_campaign=shopify-theme-locale-validator)
- **More free tools**: [ecomswiftllc.com/free-tools](https://www.ecomswiftllc.com/free-tools)
- **Shopify Partner Directory**: [shopify.com/partners/directory/partner/waowy](https://www.shopify.com/partners/directory/partner/waowy)
- **Website**: [ecomswiftllc.com](https://www.ecomswiftllc.com)

---

Built because we kept finding exactly this class of bug in client themes right before an
international launch — a dropped `{{ count }}`, a half-translated locale file nobody caught
until a French customer saw raw placeholder text. Free and complete, no catch.
