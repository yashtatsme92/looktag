# Phase 1 slice A — chrome preview notes

Screenshots not committed in this PR (GitHub MCP `push_files` is text-only; no local app preview run).

## Expected chrome

| Surface | Items |
| --- | --- |
| Phone tab bar | Looks · Create · You |
| Desktop masthead | Looks · Create · You |
| Removed from shopper shell | Rank, Houses, How-to |

`/rank` and `/houses` remain deep-linkable; Houses expansion is Phase 2 (#36).

## Tokens added

- `--space-thumb` (4.5rem)
- `--space-sheet-pad` (1rem) + `.sheet-footer-pad`
- `--target-min` (44px)
- `--keyboard-inset` default `0px` (viewport-lock still overrides)
