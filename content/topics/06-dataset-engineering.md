---
id: dataset-engineering
order: 06
title: Dataset Engineering
subtitle: Quality, coverage, synthesis, deduplication — from raw corpus to training-ready
topic: dataset-engineering
difficulty: intermediate
estimatedReadMinutes: 42
hero: false
primitives: [quality-scorer, synthesis-demo]
citations:
  - { book: huyen-aie, chapters: "Ch. 8", topic: "data curation + synthesis" }
  - { book: huyen-dmls, chapters: "Ch. 4", topic: "data engineering fundamentals" }
  - { book: iusztin-labonne-handbook, chapters: "data pipeline chapters", topic: "production data pipelines" }
  - { book: hands-on-llms, chapters: "fine-tuning chapters", topic: "instruction and preference data" }
tags: [data, curation, synthesis, deduplication]
updatedAt: 2026-04-17
---

## The unsexy work that decides everything

Most of the public drama around model quality happens at the edges — a new architecture, a bigger cluster, a cleverer loss. The actual axis of variation between a model that works and a model that embarrasses you is almost always the data. Everyone who has shipped a fine-tune or trained a base model converges on the same uncomfortable position: dataset engineering is the highest-leverage work in the pipeline, and it is also the least glamorous[^1].

The reason is mechanical. A language model is a compression of its training distribution. Whatever patterns live in the data — including the wrong ones, the duplicated ones, the subtly biased ones — get faithfully learned. The model cannot know something that was not in its training set, and it cannot avoid a bias that was. Architecture and optimization are the machinery; data is the substance being compressed. Swap the architecture for a similar-capacity one and you get a similar model. Swap the data for a better-curated corpus and the model changes qualitatively[^2].

This matters at every tier of the stack. Pretraining corpora determine base-model capability and vocabulary coverage. Instruction-tuning data determines how the model behaves when asked. Preference data determines what it considers a good answer. Evaluation data determines whether you know any of it worked. At every stage, data quality sets the ceiling; everything downstream — better prompts, more retrieval, longer context — is navigation under that ceiling.

The work itself is unglamorous: reading raw rows, spot-checking dedupe output, writing filters, labeling edge cases, auditing distributions that look fine until they do not. There is no single dashboard that tells you the data is good. But the teams that ship reliable systems are the ones who treat data as a first-class engineering artifact with its own tests, versioning, and owners — not as a bucket of files upstream of the "real" work[^3].

### The running example: a tax-advice assistant

The rest of this topic uses a single worked example to make the abstractions concrete. The task: curate an instruction dataset for a domain-specific tax-advice assistant, targeting U.S. federal individual-income-tax questions for the 2025 filing year. The model is a mid-sized open base (think 7–13B parameter class, specifics not the point). The target user is a taxpayer with a messy return — multiple W-2s, a side business, a rental, ambiguous deductions, a state residency change mid-year. The assistant must answer with a precise-but-cautious voice, cite the relevant form or publication when applicable, decline out-of-scope or advisory-prohibited questions, and never invent a number.

This example is useful because the failure modes are expensive and legible. A pretraining dataset can absorb some slop and still produce a general-purpose chat model; a tax assistant that hallucinates a deduction amount is wrong in a way the user and the IRS both notice. Coverage failures have signatures — the model confidently answers a question about a form it has never seen. Quality failures have signatures — the model copies a tone from unmoderated forum threads. Synthesis failures have signatures — the model confidently extends a teacher's hallucinations.

The scope is deliberately narrow. Not tax planning, not multi-year strategy, not entity selection for small businesses, not international income, not state and local returns — all of which a real tax professional handles, and all of which multiply the data problem by an order of magnitude each. The assistant's job is to help a reasonably diligent filer get the federal individual return right. Everything outside that lane is a decline case. Narrow scope is a dataset decision before it is a product decision: a narrow assistant with a tight training distribution outperforms a broad assistant with a thin one, and the data discipline that produces the narrow one is a template for the broader one later.

Everything below returns to this example. When a heuristic feels abstract, the tax case is the ground.

## Quality vs quantity — the Chinchilla-era reframe

For years the operating assumption was "more tokens is more better." That assumption broke in 2022 with the Chinchilla scaling analysis, which demonstrated that many then-current large models were substantially undertrained for their parameter count — and that compute-optimal training requires scaling model size and data size roughly in proportion, not just stacking parameters on a fixed corpus[^4]. The implication was not "data is infinite, use it all." It was that the token budget matters, and every token you spend on junk is a token you could have spent on signal.

The post-Chinchilla lesson was sharpened by what came after. Open reproductions like RedPajama, RefinedWeb, and the Dolma corpus showed that careful filtering of large web crawls — deduplication, quality classifiers, language identification, removal of near-templated boilerplate — produced training sets that punched above their raw token count. The work of the LLaMA-era teams publicly emphasized the same point: heavy filtering of Common Crawl beats raw Common Crawl at the same token budget[^5]. The question shifted from "how much data can we get" to "how much of this data is worth training on."

For fine-tuning, the reframe is starker. The LIMA hypothesis — "Less Is More for Alignment" — is the explicit statement of what practitioners had been observing: a 65B base model fine-tuned on a thousand carefully curated prompt-response pairs produced strong instruction-following behavior, with the claim that most of what alignment fine-tuning does is surface capabilities already present in the base[^6]. The mechanism is unsurprising once you state it: fine-tuning faithfully teaches the pattern in the data, including "be sloppy" or "hallucinate confidently" if those patterns are present. A thousand clean examples teach a clean policy; fifty thousand noisy ones teach a noisy policy.

This does not mean a thousand examples is the right number for every problem. It means the scaling intuition that carries over from pretraining — more is more — does not carry over to fine-tuning, and the default assumption should be inverted. Start small, measure, add only what measurably helps. For the tax assistant, this implies two to five thousand carefully written worked cases plus refusal/out-of-scope examples is a more sensible starting budget than fifty thousand scraped Q&A pairs.

<QualityScorer/>

The operating rule that falls out: **optimize tokens × quality, not tokens alone.** Measure your pipeline by what fraction of accepted tokens are actually informative, not by the size of the raw dump you started with. Quantity still matters — under-data a model and it underperforms — but once you are above a reasonable floor, the marginal return on filtering is higher than the marginal return on more scraping[^1].

For the tax example: the "raw dump" would be forum answers, blog posts, IRS publications, tax-prep-software help articles, and whatever volunteer preparer guides are findable. The "filtered" set is what survives after dedup, source-quality filtering (IRS publications and authoritative preparer guides weight higher than forum threads), temporal filtering (pre-2024 answers are often wrong because tax law changes annually), and hand review of a sample. The filtered set will be a small fraction of the raw pull. That is the point.

## Data quality dimensions — what "good" actually means

"Quality" is a portmanteau. To operate on it you have to decompose it into dimensions that can each be measured — imperfectly, but measured. Six dimensions cover most of the real failure modes.

**Correctness.** Is the content factually accurate? For instruction data, does the response actually answer the question, and is that answer right? For pretraining, is the document meaningfully true or at least internally coherent? Measurement is expensive — usually requires an expert reviewer for a sampled subset, or an AI judge pinned against a rubric with spot-check validation. For the tax assistant, correctness is checkable against IRS publications and the tax code; for a sampled 100 examples, a CPA or EA can score each pass/fail and produce a correctness percentage. The heuristic floor: accept the dataset only when sampled correctness exceeds some threshold you set in advance (say, 95% for safety-critical domains). Below that, the data is teaching wrong answers faster than it teaches right ones.

**Coverage.** Does the dataset span the distribution of inputs the model will actually see? A tax assistant trained only on single-W-2 wage-earner questions will collapse on rental income. Coverage is measured by slicing: build a taxonomy of the input distribution (in tax: income types, deduction categories, filing statuses, life events, form numbers) and count examples per slice. Underrepresented slices will underperform; the audit is the count, the fix is targeted collection.

**Freshness.** Is the content current enough for the task? For tax, freshness is non-negotiable — the 2024 standard deduction is not the 2025 standard deduction, the 2022 IRA contribution limit is not the 2025 limit. For a general-purpose assistant, freshness tolerance is wider. Measurement: timestamp each source, compute the age distribution, and gate on domain-specific rules (tax content older than the current filing year's guidance is presumptively wrong).

**Balance.** Is the distribution across slices proportional to production need, not just to what was easy to collect? A tax dataset that is 60% wage-earner basics and 2% self-employment is wildly imbalanced for a production assistant where self-employment questions are disproportionately the ones that send people to a preparer. Measurement: per-slice example counts against a declared target distribution. The fix is not to delete overrepresented slices but to weight them at training time or targeted-collect the underrepresented ones.

**Deduplication rate.** What fraction of the corpus is exact, near, or semantic duplicates of other documents in the same corpus (and against held-out evals)? High duplication rates inflate apparent size while teaching the model a narrower distribution than it seems. Measurement is the dedup pipeline's own output — the ratio of documents removed to documents retained, broken down by dedup type (exact, near, semantic).

**Attribution.** Can every document be traced to a source with a known license and a known collection timestamp? Missing attribution is a ticking compliance problem and a debugging dead end: a surprise behavior in the model cannot be traced back to the source that taught it. Measurement is binary per record (attributed / not attributed) and aggregate by percentage.

For the tax assistant, a concrete quality scorecard looks like: correctness (expert-graded sample ≥ 95%), coverage (every major form and income type has ≥ 50 examples), freshness (all content dated ≥ current filing year's published guidance, with explicit tags on time-sensitive numbers), balance (distribution audited against a production taxonomy), dedup rate (exact + near-dup removed, semantic dedup applied), attribution (100% of records tagged with source, license, timestamp). A single number fails to capture this. A scorecard does.

A seventh dimension worth tracking in practice, even though it is harder to name cleanly, is **consistency**. Does the dataset agree with itself? When two examples cover the same fact, do they give the same answer? Inconsistency is the most silently corrosive quality failure — the model learns that "the answer depends," which is true in some domains and fatal in others. For the tax assistant: if three examples describe the 2025 standard deduction for single filers and two of them give the wrong number, the model has no way to choose, and the production behavior will be unreliable specifically on the things that are supposed to be deterministic. Consistency is measured by sampling claim-pairs across the dataset and checking for contradictions — an expensive but occasionally necessary audit, especially after a synthesis run or a large import.

Each of these dimensions interacts. Aggressive freshness filtering (dropping all pre-2024 content) can create coverage gaps in rare-form coverage, because older guidance is where the rare forms were best documented. Heavy dedup can collapse what looked like diversity into a smaller, less balanced distribution. Strict attribution requirements can exclude valuable but poorly sourced content. The scorecard's purpose is not to maximize each dimension independently; it is to surface the tradeoffs so you are making them deliberately instead of inheriting them.

::callout{type="warning"}
**A single quality metric will always deceive you.** Aggregate "quality scores" from AI judges or heuristics hide which dimension is failing. Report the scorecard, not the average. If you must have one number, make it the worst-dimension minimum, not the mean.
::

## Deduplication — exact, near, and semantic, with the math

Duplicate and near-duplicate data is the single most studied quality problem in pretraining corpora. The strongest public evidence that it matters comes from Lee et al. (2022), "Deduplicating Training Data Makes Language Models Better," which documented that large web corpora contain substantial duplication, and that training on deduplicated data improves language modeling and reduces memorization of training examples[^7]. Nearly every subsequent large-scale corpus paper treats dedup as a non-optional step[^5]. The point is not only quality — it is also that duplicated content is overrepresented in the training signal, bending the model's distribution toward whatever happens to be replicated most.

Dedup happens at three levels, each with different tooling and different failure modes.

### Exact dedup

Hash every document (or chunk), bucket by hash, keep one per bucket. Use a modern cryptographic hash (SHA-256) or a non-cryptographic hash fast enough to run on terabytes (xxHash). This handles the easy case — the same page crawled twice, the same PDF ingested from two sources — but misses everything with trivial variation. Run it first because it is O(N) in pipeline cost and eliminates the dumbest duplicates cheaply. In the tax corpus, exact dedup catches the same IRS publication downloaded from two mirrors, the same Q&A copied across scraper runs, and canonicalized whitespace-normalized variants if you normalize before hashing.

### Near-duplicate dedup with MinHash/LSH

Near-dup catches documents that differ by whitespace, headers, timestamps, tracking parameters, or small edits. The standard machinery is MinHash with Locality-Sensitive Hashing (LSH)[^8]. The shape of the math is worth internalizing because the parameters you tune map directly to it.

Represent each document as a set of **shingles** — overlapping n-grams of words or characters. For n=5 word shingles, the sentence "the quick brown fox jumps over the lazy dog" becomes {"the quick brown fox jumps", "quick brown fox jumps over", ...}. Two documents that share most of their content share most of their shingle set; two documents with the same topic but different wording share less. The similarity of two sets A and B is the **Jaccard similarity**:

```
J(A, B) = |A ∩ B| / |A ∪ B|
```

Computing Jaccard directly on shingle sets is expensive for large corpora — quadratic pair comparisons, each one traversing two large sets. MinHash compresses the set down to a fixed-length signature while preserving the estimator. For each of K hash functions h₁…h_K, compute min_{x ∈ A} h_k(x) — the minimum hash value over all shingles. The MinHash signature is the K-length vector of those minima. The key property: the probability that the two signatures agree at a given position is exactly J(A, B). So the fraction of positions where signatures agree is an unbiased estimator of Jaccard similarity, with variance shrinking as K grows. K=128 or K=256 signatures are typical for corpus-scale work; K=1024 for more precision at higher cost.

Even with signatures, pairwise comparison is still quadratic. LSH fixes that. Split the K-position signature into b **bands** of r rows each (K = b × r). Hash each band to a bucket. Two documents become **candidates** if they collide in at least one band. The probability that two documents with true Jaccard s collide in at least one band is:

```
P(candidate | s) = 1 - (1 - s^r)^b
```

This S-curve has a steep transition — a "threshold" — near s ≈ (1/b)^(1/r). Tune b and r to move the threshold. Common web-corpus defaults target a threshold near Jaccard 0.7–0.85; the tax corpus might tune lower (0.6) because near-duplicates with minor edits are more likely legitimate republications of the same IRS guidance and you want to catch them even when they have been reworded mildly.

Lee et al. used 5-gram MinHash with LSH and reported that removing near-duplicates substantially reduced the training corpus while improving downstream perplexity and reducing verbatim memorization[^7]. The lesson for the tax assistant: shingle at n=5 or n=8, compute K=128 MinHashes, LSH-bucket with a threshold around 0.7, review a sample of "removed" documents to check you are not over-collapsing legitimate variation (the same answer written by two independent authors should probably survive).

A worked numerical example makes the tuning concrete. Suppose K=128 signatures split into b=16 bands of r=8 rows each. The band-collision threshold sits near (1/16)^(1/8) ≈ 0.74. Two documents with true Jaccard 0.9 collide in at least one band with probability 1 − (1 − 0.9^8)^16 ≈ 1.0 (essentially certain). Two documents with Jaccard 0.5 collide with probability 1 − (1 − 0.5^8)^16 ≈ 0.06 (rare). Two documents with Jaccard 0.3 collide with probability ≈ 0.002 (effectively zero). The S-curve is sharp: small changes in the true similarity produce large changes in the collision probability. Moving to b=32 bands of r=4 rows shifts the threshold down to (1/32)^(1/4) ≈ 0.42, catching more near-duplicates at the cost of more false positives that you have to resolve with a secondary exact-Jaccard check on candidate pairs. Moving to b=8 bands of r=16 rows shifts the threshold up to (1/8)^(1/16) ≈ 0.88, conservative and fast but missing real near-duplicates with moderate edits.

The practical workflow: pick a target Jaccard threshold based on what "near-duplicate" means for your domain, tune (b, r) so the S-curve crosses 50% collision probability near that threshold, verify with a held-out pair-labeled sample, and tighten or loosen from there. For the tax corpus, a threshold around 0.6–0.7 makes sense because near-duplicates in tax content are typically paraphrased IRS guidance or lightly edited preparer articles covering the same rule — legitimate collapse targets that still differ enough in wording to confuse a stricter threshold.

### Semantic dedup with embedding cosine

Semantic dedup catches paraphrases and near-paraphrases that share meaning but not n-grams. Embed documents with a sentence encoder, cluster by cosine similarity, collapse clusters. This is more expensive than MinHash — forward passes through an encoder for every document — and harder to tune because the cosine threshold above which two documents are "the same" depends on encoder and content type. Practical guidance: use it after exact and near-dup have already run, on content where paraphrase duplication is a known problem — marketing pages, news aggregators, answer sites scraping each other, and (for tax) third-party articles that all paraphrase the same IRS publication[^3].

When to reach for each depth. Exact dedup is mandatory; there is no domain where keeping byte-for-byte duplicates helps. Near-duplicate dedup is mandatory for any corpus with scraped or aggregated content; it is optional for tightly curated human-written corpora where near-duplicates are unlikely by construction, but even there a pass catches accidental re-imports. Semantic dedup is the specialist tool: use it when your content has a high rate of independent paraphrase (news, tax articles summarizing the same guidance, help-desk content scraping each other), skip it when your content is naturally diverse (dialogue, code, distinct user-written questions). The common failure is skipping near-dup because you ran semantic dedup and assuming it covered the easier case; semantic dedup with a threshold calibrated to catch paraphrase will often miss trivial whitespace duplicates that exact or MinHash would catch cheaply. Run them in order, cheapest first, each one's output feeding the next.

Two auxiliary points worth internalizing. First, **dedupe against your eval set, not just within your training set.** Overlap between training and eval is the most common source of inflated benchmark scores, and it is trivially detectable with the same MinHash tooling[^7]. Run every training document through a MinHash join against your eval set and drop any training document with Jaccard > some threshold against any eval document. For the tax assistant, this means every scenario you plan to test on — "taxpayer with one W-2 and a rental" — must be MinHash-checked against the training corpus, and variants generated for training should be structurally different from the eval variants.

Second, **dedupe is lossy — keep the mapping.** You want to know, for any retained document, how many duplicates collapsed into it and from which sources. That metadata matters for weighting (a document that collapsed 500 duplicates might deserve more weight at training time, or might be a spam cluster you should drop entirely), for legal traceability, and for debugging distribution surprises downstream.

## Coverage + distribution — what your data should represent

A well-sized, high-quality dataset can still fail if its distribution does not match the problem. Coverage is the distinct axis from quality, and it gets less attention because it is harder to measure.

The question to answer before you collect anything: what is the distribution of inputs your model will actually see in production, and does your training data plausibly span it? For a base model, the implicit target is "the distribution of text on the internet, weighted by usefulness." For an instruction-tuned model, it is the distribution of tasks users will send. For a domain model, it is the distribution of documents and queries in that domain. Mismatches between training and serving distributions are where models silently underperform[^2].

Concrete axes to audit:

- **Topic / domain.** Is the mix of topics in your data representative of the mix you will be asked about? For the tax assistant, "topic" means income type, deduction, credit, filing status, life event, form number. The target distribution is not "uniform across forms" — it is whatever the production user distribution looks like, which in tax is heavily skewed toward a few common forms (1040, W-2, 1099-NEC, Schedule C, Schedule E) and a long tail of specialty forms (8606, 5329, 8880, 2555). The training distribution should broadly track the production one, with enough long-tail coverage that obscure questions do not collapse entirely.
- **Language and locale.** Multilingual coverage does not come for free. A model trained on 95% English data will produce worse outputs in every other language, regardless of how well the tokenizer handles them[^1]. For the tax example, the scope is U.S. federal filings and the language is English. A decision to exclude Spanish is a decision; a decision to include it requires parallel coverage.
- **Task format.** For instruction data, the distribution of task types — classification, extraction, summarization, open-ended generation, code — shapes which behaviors the model can do reliably. The tax assistant's task-format mix is not random: factual Q&A (most), step-by-step walkthroughs (common), document-grounded extraction (important, when the user uploads a form), refusal / deferral (essential for out-of-scope and advisory-prohibited questions), disambiguating clarification (the user's question is underspecified — "am I self-employed" requires several follow-ups).
- **Difficulty.** Too many trivial examples teach the model to handle trivial queries. Too many hard ones and it never learns the easy ground truth. In tax, "difficulty" stratifies by scenario complexity: single-W-2 wage earner (easy), multiple incomes + standard deduction (medium), self-employment + rental + state change (hard), estate/trust/AMT (expert). The training distribution should probably overweight medium-difficulty cases relative to raw incidence, because they teach the decomposition skill and are where users most often need help.
- **Source provenance.** Whose text is this? Web forums, academic papers, customer support transcripts, and product documentation produce different behaviors. Source mix is a tuning parameter, not an accident[^3]. For the tax assistant, authoritative sources (IRS publications, official preparer guides, well-maintained CPA/EA-authored content) weight differently than forum threads; forum threads are useful for question phrasing and user framing but not for ground-truth answers.

The standard diagnostic is **slicing**: compute your model's evaluation metrics by slice (language, topic, task type, difficulty bin, source) and look for the slices that underperform the aggregate. An aggregate metric of "82%" can hide a 40% slice that represents your most valuable customer segment[^2]. Coverage gaps surface in slices before they surface anywhere else. The tax assistant's slice audit should include at least: per-form accuracy, per-income-type accuracy, per-filing-status accuracy, per-difficulty-tier accuracy, and refusal-rate on out-of-scope questions. Any slice significantly worse than the aggregate is a data problem before it is a model problem.

One pragmatic heuristic: **if you can sample 50 random inputs from your production traffic and 50 random inputs from your training set, and a reviewer cannot tell which is which, your distribution is probably close enough.** If the two piles look obviously different, you have a coverage problem masquerading as a quality problem.

A second heuristic specific to long-tail underrepresentation: **count the rare things explicitly**. For each "rare" category (in tax: Form 8606 for backdoor Roth conversions, Form 5329 for early-withdrawal penalties, Schedule E for rental), set a floor on training-example count independent of the natural frequency. Rare-but-important categories need to be oversampled during collection; natural frequency will never give them enough signal.

**Class imbalance** is the same problem in a different frame. When the task has discrete categories (for tax, things like "deductible vs. not deductible," "subject to SE tax vs. not," "refundable credit vs. nonrefundable," "required filer vs. not"), the dataset's label distribution often does not match the production incidence, and neither matches what the model needs to learn well. A wage-earner-dominated dataset teaches the model that "deductible" is rare and "not deductible" is common; this is fine until a user asks about a deduction the model has seen only a dozen times, and the model under-confidently or incorrectly resolves it. The remedies are familiar from classical ML: targeted collection to fill minority classes, resampling during training (weighted loss or oversampling of minority classes), and per-class evaluation that catches the asymmetric failures aggregate accuracy hides. The tax assistant's slice audit explicitly reports per-category precision and recall; a 98% aggregate with a 60% recall on "deductible" is a deployable-looking number hiding an undeployable model.

**Slicing audits** are the operational form of coverage review. The audit is a notebook or dashboard that computes, for every slice dimension (form, income type, filing status, difficulty, source, length bucket, task format), per-slice metrics including count, expert-graded correctness on a sample, production-incidence estimate, and the ratio of training count to production incidence. The underrepresented slices — high incidence, low count — are the collection priorities. The overrepresented slices — low incidence, high count — are down-weighting or pruning candidates. This is not a one-time review; it is a recurring ritual, ideally automated, run every time the dataset bumps a version.

## Data acquisition + annotation — buy, scrape, curate, label

Training-ready data comes from four sources, often mixed.

**Public web crawls.** Common Crawl and its derivatives are the starting point for most open base-model training. Raw Common Crawl is mostly unusable — heavy boilerplate, duplication, SEO spam, and low-quality pages dominate. Production-grade base-model corpora layer filtering on top: language ID, quality classification, deduplication, URL-level filtering of known-bad domains, and content-level filtering against heuristics (word ratios, repetition rates, symbol density). RefinedWeb (2023) reported that a carefully filtered web-only corpus was competitive with curated book/paper mixes at large training scales, and FineWeb (2024) extended the approach with classifier-driven quality scoring at larger scale. RedPajama-v2 is the public reference for an aggressively deduplicated, quality-scored web corpus with released per-document metadata[^5]. For the tax assistant, raw Common Crawl would be the wrong primary source — the signal-to-noise is too low, and filtering for "tax-relevant and correct" is much harder than targeted ingestion. Crawls are a supplement for question-phrasing diversity and user-side framing, not a core source of answer text.

**Licensed datasets.** Code repositories, books corpora, scientific papers, dialogue datasets — often bought, licensed, or contributed. Quality tends to be higher per token than raw web, but licensing, attribution, and re-distribution constraints matter more and belong in the metadata from day one[^1]. For the tax assistant, the analog is licensed preparer guides and paid CPE material. Track the license per document; train only on what the license permits and exclude records you cannot redistribute in derivative form, even if training on them is permissible under a narrow reading.

**Domain-specific scraping and curation.** For a vertical model — legal, medical, code, tax — targeted ingestion from authoritative sources beats generic web crawl. The curation work lives upstream of the filter: pick sources carefully, handle the domain-specific structure (PDFs with layout, code with file trees, legal documents with citation graphs), and preserve metadata that downstream filtering and retrieval can use[^3]. For tax: scrape the full IRS publication set, parse form instructions with structure preserved (line numbers, section headings, worksheet structure), ingest the tax code sections most commonly cited in guidance, and collect a handful of well-maintained third-party guides with permission. Scraping ethics matter — honor `robots.txt`, respect rate limits, track terms-of-service constraints, and avoid content whose license prohibits training use. The engineering-ethics line is not purely legal; a dataset with murky provenance is a liability even when no lawsuit materializes.

**Human annotation.** For supervised fine-tuning, preference data, and evals, humans label. Annotation quality is a full engineering discipline, and the tax example makes the discipline concrete because the labelers matter: most of the training labels for a tax assistant should come from CPAs, EAs, or equivalently credentialed preparers, not generalists. The pipeline:

- **Guidelines.** A written document that specifies, for each task type, what a correct answer looks like, what edge cases exist, how to handle ambiguity, and what "decline" looks like. Guidelines are not optional and they are never stable on first draft. Expect at least two revision rounds before production labeling begins.
- **Calibration rounds.** Before volume labeling, every labeler completes a small pilot set (say, 30–50 examples) where their labels are compared against a gold-standard set produced by senior reviewers. Disagreements are discussed and the guideline is updated to resolve ambiguity. The purpose is not to grade the labeler; it is to surface where the guideline is underspecified.
- **Active learning.** Rather than labeling uniformly at random, prioritize examples where the current model is most uncertain or most likely to be wrong. A cheap way: train a weak baseline on what you have, run it over a candidate pool, send the highest-disagreement or lowest-confidence examples to labelers first. This compresses the label budget onto the examples that will move the model most.
- **Inter-annotator agreement.** On a subset of examples (say, 10–15% overlap), send the same input to two labelers and compute agreement. For classification-style tasks use Cohen's κ; for free-form labels use qualitative adjudication. Low agreement is a guideline problem, not a labeler problem.
- **Disagreement adjudication.** Examples where labelers disagree go to a senior reviewer, who decides and — critically — writes an update to the guideline if the disagreement surfaces a missing rule. Adjudication without guideline feedback is debt-generating.
- **Continuous review.** Sample a small fraction (say, 2–5%) of production labels and quality-check them ongoing. Labeler drift is real — the first week's labels differ from the fifth week's unless the system actively corrects.

Across all four sources, the unglamorous constants are metadata (source, license, timestamp, quality score, dedup cluster, annotator ID, label version), versioning (you cannot reproduce a training run without pinning the data revision), and audit trails (who approved this source, who labeled this example, when did the filter change). Datasets that lack this scaffolding become frozen — nobody wants to touch them because nobody is sure what will break.

A note on scraping ethics worth making explicit for the tax case. Tax content is not a neutral corpus. IRS publications are in the public domain and freely ingestable. Preparer guides and CPE material are usually copyrighted and licensed per-seat, not per-model-training; ingesting them without a license that explicitly permits training use is a legal and reputational problem regardless of whether a rights-holder ever notices. Forum threads and answer sites have their own terms of service that frequently prohibit scraping for training, and community-contributed answers may carry independent copyright from the author. The engineering default should be: if the source's license does not explicitly permit training use, either obtain one or exclude the source. "We weren't caught" is not a quality strategy. This is not the only consideration — there are legitimate debates about fair use, transformative use, and derivative-work analysis in model training — but treating license status as a metadata field and filtering against it at ingestion time prevents the worst class of retrospective surprises.

## Synthetic data — why it's exploding, and the risks

Synthetic data — training data generated by another model — went from a curiosity to a default in the span of the 2023–2025 cycle. The driver is simple: strong base models can generate training examples faster, cheaper, and often more consistently than human annotators can[^1]. The cost of a labeled example collapsed, and the bottleneck shifted from "can we afford to label this" to "can we generate, filter, and validate without introducing artifacts the model will learn from."

The lineage worth knowing starts with **Self-Instruct** (Wang et al. 2022): seed a language model with a small set of human-written tasks, prompt it to generate new tasks and responses, filter the output, and fine-tune on the filtered set[^9]. The Alpaca follow-up (Taori et al. 2023) applied this template with GPT-style teacher models and demonstrated that instruction-following behavior could be transferred cheaply using roughly 52,000 generated instructions[^10]. **WizardLM's Evol-Instruct** (Xu et al. 2023) extended this by iteratively rewriting seed instructions along complexity axes — deepening (add constraints), breadth (change topic), concretizing (make specific) — producing a training set whose difficulty distribution was deliberately steered rather than inherited from the seed[^11]. The general pattern — generate with a strong model, filter, fine-tune a smaller one — is now standard across open and closed labs.

Several common shapes of synthesis in 2025–2026 practice:

- **Teacher-student distillation.** A strong model generates responses to a prompt set; a smaller model is fine-tuned on those responses. Effective for transferring behavior and format; the student is capped by the teacher[^1]. For the tax assistant, a strong general model can draft responses to a curated scenario set; a CPA reviews and edits a sample; the student learns the teacher-plus-edits policy.
- **Self-play and iterative refinement.** A model critiques and revises its own outputs, and the cleaned outputs become training data. Works when the model's critique is stronger than its generation, which is not always the case.
- **Rubric-driven generation.** Generate candidates, score them against an explicit rubric (human or AI-judge), keep high-scoring outputs. The rubric is doing most of the work; the generation is the cheap part.
- **Evolution / instruction complexification.** Take a seed of real instructions and iteratively rewrite them to be harder, more diverse, or more specific (the WizardLM-style pattern). Trades seed diversity for generated depth[^11].
- **Preference synthesis.** Generate pairs of responses, ask a judge model (or a rubric) to pick the better one, use the pairs for DPO-style training[^1].

### Preserving diversity and the collapse risk

The risks are specific and underrated. **Model collapse** is the failure mode where training a generation of models primarily on the prior generation's synthetic output degrades the data distribution over time — tails of the distribution get clipped, rare patterns disappear, and subsequent models become progressively less diverse[^12]. Shumailov et al. (2023) showed the effect analytically and empirically: each round of synthetic-only training narrows the distribution, first dropping the rare tail, then the moderate middle, converging toward a degenerate output. The fix is not "never use synthetic data"; it is "always anchor synthetic data with real data" and monitor diversity metrics over training generations.

Concrete tactics to preserve diversity in synthesis:

- **Anchor on real seeds.** Every synthetic batch starts from real human-written instructions or real user queries, not from the previous synthetic batch. This bounds drift.
- **Measure distribution shift.** After generating a synthetic batch, compute distribution statistics (per-topic count, per-task-format count, per-difficulty tier) and compare against the seed distribution. Drift is a signal to regenerate or rebalance.
- **Track n-gram diversity.** Compute type-token ratio, per-response n-gram entropy, and unique-phrase rates across the synthetic set. Collapsing synthesis pipelines show a characteristic phrase-repetition signature — the teacher's tics get amplified.
- **Hold out real-data evals.** The eval set must contain real examples (or at minimum, real-distribution examples not produced by any teacher in the pipeline). A synthesis pipeline scored only against other synthetic data tells you nothing about real-world performance.

**Teacher artifacts** are the second risk. Whatever weird tic the teacher model has — an overused phrase, a misformatted JSON key, a consistent factual error — propagates to everything trained on its output. Filtering against the teacher's own known failure modes is necessary; evaluating the student on a held-out real-data benchmark is non-negotiable[^1]. For the tax assistant, a specific failure mode: the teacher hallucinates a dollar amount (a deduction cap, a contribution limit) with high confidence. The student learns to hallucinate confidently. The fix is to verify every quantitative claim in a generated response against an authoritative source before accepting the example, either through a second-model verifier pinned to retrieved IRS text or through human review for quantitative fields.

**Filtering matters more than generation.** The meaningful engineering work in synthetic data pipelines is rarely the prompt that generates; it is the filter that accepts. Cheap generation and strict filters beat clever generation with loose filters. The filter should be at least as good as the model you are training, or you are teaching it the filter's blind spots.

### AI-powered synthesis: prompt templates and verification

For the tax assistant, a synthesis pipeline might look like:

1. **Seed set.** 500–1000 real user questions (anonymized from production traffic, or from a pilot beta, or collected by targeted interviews). Every seed is tagged with a taxonomy label (income type, form, difficulty).
2. **Prompt template for generation.** The teacher is prompted with the seed question, the relevant IRS publication excerpt (retrieved by a simple keyword or embedding lookup), a persona constraint ("respond as a careful tax preparer who cites sources and declines advisory-prohibited questions"), and a format constraint (JSON with fields: answer, cited_sources, confidence, out_of_scope_flag).
3. **Per-example verification.** Every generated response is passed through a verifier pass: a second model call (or a human, for a sample) that checks whether every quantitative claim and every cited publication is correct against retrieved authoritative text. Failed verification → discard.
4. **Coverage audit.** After generation, per-slice counts are checked against the target distribution. Slices below their floor get additional seed-driven generation targeted at the gap.
5. **Quality filtering.** A rubric-driven quality score (is the answer responsive? is the tone calibrated? does it cite? does it decline when it should?) is applied. The rubric is the same one used to grade the final model; if you cannot write the rubric clearly, you are not ready to synthesize.
6. **Human spot check.** A CPA or EA reviews a random sample of 50–100 generated examples and grades pass/fail. If the pass rate is below threshold (say, 90%), the pipeline is rejected and the prompt, retrieval, or filter is fixed before regenerating.

The last step is the one most often skipped and the one that catches the failure modes the automated pipeline missed. Skipping it is the single most common way a synthesis pipeline ships a silent bias.

A second pattern worth internalizing: **synthesize the hard cases, not the easy ones**. The natural distribution of questions a model can answer will skew toward easy ones — factual recall, routine scenarios, straightforward decompositions. Synthesis multiplies what is easy to generate, which means a naive pipeline fills the dataset with more of what the model already handles and less of what it struggles with. The fix is to prioritize synthesis at the boundaries: questions where the base model is uncertain, scenarios that combine two or more axes (income + filing status + life event), edge cases documented in the guidelines but rare in natural data, and adversarial cases written by reviewers to probe known weaknesses. For the tax assistant, this is the difference between "one more wage-earner question" and "a taxpayer with mid-year marriage, partial self-employment, a 1099-K for a side hobby, and a state residency change" — the latter exercises decomposition, disambiguation, and the refusal policy simultaneously, and produces a training example that teaches more per token.

A third pattern: **track the teacher-to-seed ratio**. If every seed produces ten generated examples, you are diluting the seed's real-world signal by 10×; more generated examples do not magically get you more real-world fidelity. Keep the ratio in sight, and be willing to accept a smaller dataset with more real anchoring than a larger one that is mostly teacher imagination. The LIMA result is in part a result about this ratio — a thousand examples with a real-world distribution beat a hundred thousand with a synthetic one[^6].

::callout{type="warning"}
**Do not train on synthetic data you cannot evaluate.** If your only quality signal is "the teacher thinks this is good," you are training the student to mimic the teacher's self-assessment — not to be correct. Anchor every synthesis pipeline to a real-data eval set the teacher has not seen.
::

<SynthesisDemo/>

## Data contamination — benchmark leakage and how to detect it

Contamination is the failure mode where your evaluation set — the thing you use to measure progress — has leaked into your training set. The symptom is inflated benchmark scores that do not translate into real-world performance. The cause is almost always accidental: an eval dataset was scraped from a public source, the same source was scraped into training, and nothing in the pipeline was checking.

Detection has three standard tools.

**Exact-match check.** Trivial and cheap. Hash every eval document (or a canonical form of it) and check for matches in the training hash set. Catches the easy case where an eval example was copied verbatim.

**N-gram overlap.** For each eval document, extract k-grams (typical k=8 to 13 tokens). For each k-gram, check whether it appears anywhere in the training set. The fraction of eval k-grams with training matches is the contamination rate. A threshold: an eval document with more than a small fraction (say, 20–30%) of its k-grams matching training is likely contaminated. This is the same machinery Lee et al. used to document duplication; the same tooling surfaces training/eval overlap[^7].

**Embedding-based dedup against evals.** Embed every eval document, embed every training document, flag any pair above a cosine threshold. Catches paraphrased contamination — an eval question rewritten slightly in training. More expensive, more sensitive, harder to tune; run after exact and n-gram checks.

For the tax assistant, the explicit test: every scenario in the eval set is MinHash-joined against the training set; any training document with Jaccard > 0.5 against any eval document is dropped; every generated synthetic example is also checked against the eval set (synthesis pipelines are a common contamination vector because the teacher's training data may include benchmark sets the student is being evaluated on).

One additional discipline: **eval sets deserve their own version control and access controls**. Treat them like secrets. If everyone on the team can see the eval set and pipelines can pull it into training by accident, contamination becomes a matter of time. A separate repository, read-scoped access, and a no-train-set-ingestion policy on the eval storage is cheap insurance.

## Preference data — how to source pairs for RLHF/DPO

Preference data is its own animal. Where supervised instruction data says "given this prompt, produce this response," preference data says "given this prompt, response A is preferred to response B." It is the substrate for RLHF and DPO (and related methods), and the quality of the preference labels determines what the model learns to prefer.

### Sourcing pairs

Four common sources, usually mixed:

- **Multi-response sampling from a single model.** Generate K candidates (temperature > 0) per prompt, have a rater (human or model) rank them. Cheap, but the pair diversity is bounded by the generating model's distribution — all K candidates share a family of failure modes.
- **Multi-response sampling from different models.** Generate candidates from two or more models (e.g., the current policy vs. a stronger teacher vs. an older checkpoint), have a rater pick the winner. More diverse pairs, but risks teaching stylistic preference (preferring the teacher's style regardless of correctness).
- **Curated contrasts.** Human-authored pairs where one response is deliberately correct and one is deliberately a specific failure mode (wrong facts, wrong tone, wrong format, unsafe). Most expensive per pair, highest signal-per-pair, especially for safety-critical preferences. For the tax assistant, this is the shape of preference pairs most likely to teach refusals and calibrated uncertainty.
- **Implicit preferences from production.** User edits, regenerations, thumbs-up/down — treated as weak preference signals. High volume, noisy; useful as a supplement, not a foundation.

### The quality bar

Preference labels are noisier than supervised labels because "preferred" is subjective even when the rater is skilled. Tactics to raise the quality bar:

- **Rubric before rating.** Raters score on an explicit rubric (correctness, completeness, tone, citation, refusal) rather than a holistic preference. The rubric makes disagreements surface-able and tractable.
- **Ties are allowed.** Force-ranking every pair creates noise when responses are genuinely comparable. Let raters say "tie" and exclude those pairs from training (or include them with a specific tie token in methods that support it).
- **Inter-rater agreement targets.** Compute agreement on a subset of pairs. Target Cohen's κ ≥ 0.6 for domain-critical preference labels; lower than 0.4 means the rubric or the rater pool is broken.
- **Adjudication on disagreements.** The same discipline as supervised annotation: disagreements get a senior review, and unresolved ambiguity triggers a rubric update.
- **Sample review by domain experts.** A CPA sampling 50 preference pairs for the tax assistant catches raters who picked the wrong answer because it sounded more confident. Confident-wrong vs. cautious-right is exactly the preference the model must learn; getting it backwards here is a direct cost.

### The structural traps

- **Length bias.** Raters often prefer longer responses regardless of quality. Train rewards on length-controlled pairs or explicitly regularize against length during training.
- **Teacher-flavor bias.** If one response in every pair came from the teacher and the other from the policy, the rater picks up stylistic cues ("this one sounds like the teacher — must be better"). Randomize which side is which and de-identify sources in the rater UI.
- **Safety pairs are different.** A refusal-vs.-completion pair for an out-of-scope tax question is not a preference for "better phrasing" — it is a preference for a different action. These pairs are high signal but should be oversampled and tagged separately.

The scorecard for preference data mirrors the one for supervised data: correctness (spot-checked), coverage (across all task types the model will face), freshness (current guidance), balance (all preference types represented, not just "longer is better"), dedup (same pair not duplicated across rounds), attribution (rater ID, rubric version, rating timestamp).

One additional note on preference-pair construction for domain assistants. The easy trap is generating two candidates with the same model, same temperature, and same prompt, asking a judge to pick the better one, and treating the result as a preference signal. When both candidates come from the same distribution, the preference signal is mostly stylistic — the judge picks one on essentially arbitrary grounds, and the model learns to prefer whatever surface features correlate with the judge's arbitrary choice. A more informative setup: generate candidates that differ in some structured way — one cites, one does not; one declines, one attempts; one uses the current-year figure, one uses last year's — so that the preference label is carrying a substantive distinction the model can learn. The preference set becomes a curated library of contrasts, not a random pair pile. For the tax assistant, the highest-value preference pairs are the ones where one response is subtly wrong (wrong year, wrong form, wrong cap) and the other is correct; these are hard to generate at scale without domain experts, which is why they are high signal.

## Processing pipeline — inspect, dedupe, clean, format, shard, tokenize, verify

The day-to-day of dataset engineering is a pipeline of small, composable steps, each of which can silently break the run downstream. The shape is stable across projects:

1. **Inspect with metadata.** Every record gets source, timestamp, license, and a stable ID before anything else touches it. If you cannot trace a training example back to its source, you cannot debug what it taught[^3]. Read a hundred raw records before you write a single filter — the pipeline you imagine is not the one the data needs.
2. **Language + format ID.** Drop records that fail language identification for the target languages, or are not in the expected format (e.g., text where you expected code, HTML where you expected plain text). For the tax assistant, this catches documents that were scraped as HTML and never text-extracted, or PDFs whose OCR produced garbage.
3. **Dedupe.** Exact first, then near-dup via MinHash/LSH, then (optionally) semantic. Dedupe against eval sets, not only within training. Keep the dedup mapping — which duplicates collapsed into which retained document, so debugging is possible downstream.
4. **Clean.** Heuristic filters (length, symbol ratios, repetition, boilerplate detection), then learned quality classifiers where available. Order matters: cheap filters up front save compute on expensive ones[^1]. For tax documents, this includes stripping scraped-page boilerplate, dropping documents with too-low text-to-markup ratios, and handling PDFs where the extracted text is structurally broken.
5. **Safety + PII filtering.** Remove regulated content, PII, and known-unsafe material. This is not the same filter as quality — a perfectly well-written paragraph can still need to be removed. For tax data, this is acute: scrape-sourced content may contain real taxpayer names, SSNs, or EINs that were accidentally published. Regex SSN filters, NER-based name redaction, and a hand-review pass on the output are all necessary.
6. **Format.** Training formats (for instruction data, preference data, DPO pairs) have specific shapes — chat templates, system prompts, multi-turn structure, preference-pair schemas. Normalize once, at the end of the pipeline, with validation that rejects malformed records rather than silently coercing them. A schema validator that fails loudly on the first malformed record saves a full training run.
7. **Shard.** Split the final dataset into training shards (typical size: 1–10 GB per shard, depending on loader and storage) with deterministic shard assignment. Deterministic assignment means a rerun produces the same shard boundaries, which matters for reproducibility.
8. **Tokenize.** Apply the target tokenizer offline and cache the tokenized output. Online tokenization during training wastes CPU; more importantly, it hides tokenization-related bugs (truncation, special-token handling, length overflow) until they surface as training loss anomalies. Verify tokenizer version pinning — a silent tokenizer upgrade between training and serving is a rare but catastrophic failure mode.
9. **Verify.** Sample 50–100 examples at random from the final tokenized set and detokenize them. Read them. Spot-check that special tokens, chat-template boundaries, and long-example truncation behave as expected. If you cannot make yourself do this, the pipeline is not ready to train against.

Each stage belongs in version control as code, not as a notebook. Each record's journey through the pipeline belongs in lineage metadata, not as a final dump. Datasets that lack this scaffolding become unmaintainable — training runs become irreproducible, and post-hoc investigations become archaeology.

::callout{type="warning"}
**Read your data.** Every failed finetune that made it to production was accompanied by engineers who trusted their pipeline over their eyes. Open the actual files. Scroll through actual examples. If you are not surprised at least once, you are not looking closely enough.
::

## Data versioning, lineage, and reproducibility

Training is reproducible only when the data is pinned. "Pinned" is a higher bar than most teams initially enforce. A minimal discipline:

**Dataset revisions are first-class artifacts.** Every training run records not just "used the tax_instruction_dataset," but "used tax_instruction_dataset@v2.3.1, hash abc123…". The hash is computed over the sorted list of record IDs and their content hashes, so any silent change is detected. DVC, LakeFS, HuggingFace Datasets revisions, or a simple content-hashed blob-store layout all work — the point is that the dataset version is a primary key, not a label.

**Every record carries lineage.** Source URL or document ID, collection timestamp, license, annotator ID (if applicable), dedup cluster membership, which filters it passed through, which synthesis template (if synthetic), which verification pass (if verified). This is more metadata than most teams start with; it is roughly the minimum required to debug a training run three months later.

**Pipeline code is versioned alongside the data.** Filters, templates, rubrics, prompts — all in a repository, all tagged to the dataset version they produced. A dataset version that cannot be regenerated from its pipeline version is not reproducible; it is merely recorded.

**Eval sets are separately versioned and change slowly.** Eval drift — the eval set changing between training runs — makes comparison impossible. Lock eval sets; when they must change, produce a new version and track both. The tax assistant's eval set is versioned by filing year and revision within the year; a new filing year is a new eval, old runs stay comparable within their old eval.

**Documented splits.** Train, validation, test splits are deterministic and documented — typically by record ID hash modulo some scheme. No "accidentally changed the random seed" drift between runs.

**Audit on every change.** A dataset bump is a reviewable artifact: what was added, what was removed, what changed in the filters, what the updated scorecard looks like. "Dataset v2.3.1 → v2.3.2: +1200 self-employment scenarios, +400 Schedule E cases, updated refusal template for advisory-prohibited questions, reran dedup against v2.3.1 eval set — 3 contamination matches removed." That paragraph lives in the commit message or the release note; without it, the dataset's history is unreadable.

::callout{type="warning"}
**A dataset you cannot reproduce is a dataset you cannot debug.** If a model behavior surprises you and the only explanation path is "something in the data did it," you have already lost. Build reproducibility into the pipeline from day one, not as a future refactor.
::

## What's next

Dataset engineering sets the ceiling that **Finetuning** operates against — the previous topic's mechanics only pay off when the data underneath them is good. And everything in this pipeline — quality filtering, dedup thresholds, synthesis rubrics — is only as trustworthy as the measurement you attach to it, which is why **Evaluation** is not downstream of data work but woven through it. The honest loop is the same at every scale: curate, train, measure, find the data failures the model exposed, fix the data, repeat.

The tax assistant will not be finished when the model ships. It will be finished when the dataset pipeline is healthy enough that next year's filing season is a data-update release, not a rebuild. That is the bar.

## Sources

[^1]: Chip Huyen, *AI Engineering* (O'Reilly, 2024), Ch. 8 — "Data Engineering and Dataset Engineering."
[^2]: Chip Huyen, *Designing Machine Learning Systems* (O'Reilly, 2022), Ch. 4 — "Training Data."
[^3]: Paul Iusztin and Maxime Labonne, *LLM Engineer's Handbook* (Packt, 2024) — data pipeline and curation chapters.
[^4]: Hoffmann et al., "Training Compute-Optimal Large Language Models" (2022) — the Chinchilla scaling analysis.
[^5]: Penedo et al., "The RefinedWeb Dataset for Falcon LLM" (2023); Together Computer, RedPajama-v1 and RedPajama-v2 technical reports; HuggingFace FineWeb technical report (2024).
[^6]: Zhou et al., "LIMA: Less Is More for Alignment" (2023) — the explicit statement of the small-high-quality fine-tuning hypothesis.
[^7]: Lee et al., "Deduplicating Training Data Makes Language Models Better" (2022).
[^8]: Broder, "On the resemblance and containment of documents" (1997) — the original MinHash formulation and LSH machinery that Lee et al. and subsequent corpus papers build on.
[^9]: Wang et al., "Self-Instruct: Aligning Language Models with Self-Generated Instructions" (2022).
[^10]: Taori et al., "Stanford Alpaca: An Instruction-following LLaMA Model" (2023).
[^11]: Xu et al., "WizardLM: Empowering Large Language Models to Follow Complex Instructions" (2023) — Evol-Instruct.
[^12]: Shumailov et al., "The Curse of Recursion: Training on Generated Data Makes Models Forget" (2023) — the model collapse analysis.
[^13]: Jay Alammar and Maarten Grootendorst, *Hands-On Large Language Models* (O'Reilly, 2024) — fine-tuning and preference-data chapters.
