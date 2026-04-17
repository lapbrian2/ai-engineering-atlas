# Books Index — Research Notes

Generated 2026-04-17. Companion to `books-index.json`.

## Source quality per book

| Book | ID | Source | ToC quality | Pages | Confidence |
|---|---|---|---|---|---|
| AI Engineering (Huyen 2025) | `huyen-aie` | Full `ToC.md` + `chapter-summaries.md` in repo | Complete, verbatim | Verified page numbers from publisher ToC | High |
| Prompt Engineering for Generative AI (Phoenix/Taylor) | `phoenix-taylor-prompt` | O'Reilly listing + Jason2Brownlee catalog + `BrightPool/prompt-engineering-for-generative-ai-examples` repo | Chapter titles only (10 ch.) | No pages verifiable | Medium |
| LLM Engineer's Handbook (Iusztin/Labonne) | `iusztin-labonne-handbook` | Packt repo README + project structure (DDD layout, 12 chapters referenced) | Repo-structure inferred; chapter 2, 10, 11 explicitly named in README | No pages | Medium |
| Designing Machine Learning Systems (Huyen 2022) | `huyen-dmls` | Full `summary.md` (11 chapter summaries) in repo | Complete prose summaries | No pages | High |
| Build LLM from Scratch (Raschka) | `raschka-from-scratch` | Full README chapter table + per-chapter bonus content list | Complete chapter titles + bonus topics | No pages | High |
| Building LLMs for Production (Bouchard/Peters) | `bouchard-production` | O'Reilly listing + Towards AI marketing + search-result chapter breakdown | 12 chapter titles verified (I–XII) | No pages | Medium-high |
| Hands-On LLMs (Alammar/Grootendorst) | `alammar-grootendorst-hands-on` | Full README chapter list (12 ch. notebooks) | Complete chapter titles | No pages | High |
| Prompt Engineering for LLMs (Berryman/Ziegler) | `berryman-ziegler-prompt-llms` | O'Reilly + awesome-llm-books catalog + GitHub blog author piece | 11 chapter titles verified | No pages | Medium |
| AI Engineering Bible (Caldwell) | `caldwell-bible` | Amazon description only; no ToC, no repo | **Description only** — no chapter structure available | No pages | **Low** |

## Repo URL corrections

Three repo URLs in the task brief return 404. Resolved as follows:

- **`m-p-p-t/prompt-engineering-for-generative-ai`** → does not exist. Actual repo is **`BrightPool/prompt-engineering-for-generative-ai-examples`** (example code for the Phoenix/Taylor book, confirmed against O'Reilly listing).
- **`jberryman/prompt-engineering-for-llms`** → does not exist. Berryman's book has **no public companion repo**. Set `repo: null` with explanatory note.
- **`Thomas-Caldwell/AI-Engineering-Bible`** → does not exist. Caldwell's book has **no public companion repo**. Set `repo: null` with explanatory note.

The `louisfb01/start-llms` repo for "Building LLMs for Production" is a **learning-path curation by the book's author**, not a chapter-aligned code repo. Bouchard uses it to point readers at external resources. Retained as `repo` with a clarifying note because the brief specified that URL.

## Concepts mapped: 40 total

Spanning 9 topics: `foundation-models` (5), `prompting` (3), `evaluation` (5), `rag` (5), `agents` (4), `finetuning` (4), `data` (3), `inference` (3), `production` (6). One concept (`hallucinations`) slotted under `evaluation` since books treat it as a quality axis.

Every concept from the brief's required list is mapped. Not expanded further — the current 40 give good shape to the cross-book comparison without overfitting to Huyen's ToC.

## Coverage patterns

**Best-covered across the corpus** (depth ≥2 in 6+ books):
- RAG Architecture, Embeddings, Vector Search, Agents & ReAct, Tool Use, Finetuning (when to), LoRA & QLoRA, Zero/Few-Shot Prompting

**Thinly covered** (depth ≥2 in ≤2 books):
- Speculative Decoding (Huyen-AIE only — `2`)
- Model Merging (Huyen-AIE foundational; Labonne partial)
- Positional Encoding (Raschka foundational; Alammar substantive)
- Gateway & Caching (Huyen-AIE only substantive)
- Model Routing (Huyen-AIE only substantive)

**Huyen's AIE dominates** in architecture/ops chapters (9, 10): inference optimization, gateway, caching, routing, user feedback. This is the book's structural edge over the others.

## Well-covered books

- **Huyen-AIE** — covers ~all 40 concepts at depth ≥1; foundational (3) on 20+ concepts. Strongest single reference.
- **Raschka from-scratch** — deepest on architecture mechanics (attention, transformer, positional encoding, KV cache) via code-from-scratch. Zero coverage on production/prompting/agents.
- **Hands-On LLMs** — strongest on tokens/embeddings visualization, fine-tuning, RAG practicals. Missing production architecture.
- **Bouchard Production** — well-balanced on RAG (two chapters), fine-tuning (LoRA, RLHF), deployment/quantization.
- **Berryman/Ziegler** — exceptional on prompting internals (CoT, ReAct, tool use, hallucinations) but narrow scope — no fine-tuning, no inference ops.

## Under-covered books

- **Caldwell — AI Engineering Bible**: no public chapter structure. All 40 entries marked with `chapter: "Unknown"`, `pages: null`, and conservative depth (mostly `1`, bumping to `2` where the genre strongly suggests coverage e.g. RAG, quantization, monitoring). **Every row flagged `(genre-inferred)`**. Recommend human review against a physical copy before using Caldwell rows as citations.
- **Huyen DMLS (2022)**: predates LLM era. Treated as background reference — strong on data/monitoring/infra, but `0` on most LLM-specific concepts (attention, sampling, RAG, agents, LoRA, quantization). Leaving depth=0 rather than inflating.
- **Iusztin/Labonne Handbook**: book text not directly accessible; inferred from repo structure (DDD architecture, Qdrant, Opik, AWS SageMaker) + chapter 2/10/11 README references. Chapter number labels are approximate ("Ch. on ...") rather than precise.
- **Phoenix/Taylor**: only chapter titles — no subsection detail. Depth estimates default to `2` where the chapter title clearly maps to the concept, `1` for adjacent coverage.

## Key uncertainties flagged for human review

1. **Page numbers exist only for Huyen-AIE.** All other books have `pages: null`. The Atlas UI should handle this gracefully (show chapter label only when pages missing).
2. **Caldwell depth ratings are genre-inferred and low-confidence.** Consider dropping Caldwell from the corpus, or replacing with a book that has a public ToC, unless Brian has a physical copy to verify.
3. **Iusztin/Labonne chapter references are labels, not numbers.** Need to verify against the published book for precise chapter boundaries (the repo organizes by code modules, not chapter 1-12).
4. **"Model Merging" depth for Iusztin/Labonne** rated `2` speculatively — Labonne's mergekit work is well-known, but without book access I can't confirm it's covered. Flag for verification.
5. **Bouchard chapter numbering uses Roman numerals (I–XII) per the book itself.** Kept that convention in entries.
6. **Hands-On LLMs and some Raschka rows attribute content from bonus/companion material** (e.g. Raschka's "reasoning-from-scratch" repo). Noted in the `note` field but bear in mind these may not appear in the print edition.
7. **No ISBNs are included** — added `amazon` URLs which contain ASIN/ISBN. Can extract into an explicit `isbn` field later if the UI needs it.

## Suggested next steps

- Extract ToC PDF from Huyen-DMLS repo (`ToC.pdf`, 51KB) to add page numbers for that book.
- If Brian has physical copies of Bouchard, Iusztin/Labonne, Berryman/Ziegler, Phoenix/Taylor, or Caldwell → do one pass to add page numbers + correct any misplaced depth ratings.
- Consider dropping Caldwell unless verification is possible; its rows are the weakest data in the corpus.
- Consider adding: Sanyal/Patel *"LLMs in Production"* (Manning 2024) or Labonne *"Hands-On LLMs Course"* if a broader net is wanted.
