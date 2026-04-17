---
id: dataset-engineering
order: 06
title: Dataset Engineering
subtitle: Quality, coverage, synthesis, deduplication — from raw corpus to training-ready
topic: dataset-engineering
difficulty: intermediate
estimatedReadMinutes: 14
hero: false
primitives: [quality-scorer, synthesis-demo]
citations:
  - { book: huyen-aie, chapters: "Ch. 8", topic: "data curation + synthesis" }
  - { book: huyen-dmls, chapters: "Ch. 4", topic: "data engineering fundamentals" }
  - { book: iusztin-labonne-handbook, chapters: "data pipeline chapters", topic: "production data pipelines" }
tags: [data, curation, synthesis, deduplication]
updatedAt: 2026-04-17
---

## The unsexy work that decides everything

Most of the public drama around model quality happens at the edges — a new architecture, a bigger cluster, a cleverer loss. The actual axis of variation between a model that works and a model that embarrasses you is almost always the data. Everyone who has shipped a fine-tune or trained a base model converges on the same uncomfortable position: dataset engineering is the highest-leverage work in the pipeline, and it is also the least glamorous [note: Huyen AIE Ch. 8].

The reason is mechanical. A language model is a compression of its training distribution. Whatever patterns live in the data — including the wrong ones, the duplicated ones, the subtly biased ones — get faithfully learned. The model cannot know something that was not in its training set, and it cannot avoid a bias that was. Architecture and optimization are the machinery; data is the substance being compressed. Swap the architecture for a similar-capacity one and you get a similar model. Swap the data for a better-curated corpus and the model changes qualitatively [note: Huyen DMLS Ch. 4].

This matters at every tier of the stack. Pretraining corpora determine base-model capability and vocabulary coverage. Instruction-tuning data determines how the model behaves when asked. Preference data determines what it considers a good answer. Evaluation data determines whether you know any of it worked. At every stage, data quality sets the ceiling; everything downstream — better prompts, more retrieval, longer context — is navigation under that ceiling.

The work itself is unglamorous: reading raw rows, spot-checking dedupe output, writing filters, labeling edge cases, auditing distributions that look fine until they do not. There is no single dashboard that tells you the data is good. But the teams that ship reliable systems are the ones who treat data as a first-class engineering artifact with its own tests, versioning, and owners — not as a bucket of files upstream of the "real" work [note: Iusztin & Labonne, LLM Engineer's Handbook].

## Quality vs quantity — the Chinchilla-era reframe

For years the operating assumption was "more tokens is more better." That assumption broke in 2022 with the Chinchilla scaling analysis, which demonstrated that many then-current large models were substantially undertrained for their parameter count — and that compute-optimal training requires scaling model size and data size roughly in proportion, not just stacking parameters on a fixed corpus [note: Hoffmann et al. 2022, "Training Compute-Optimal Large Language Models" / Chinchilla paper]. The implication was not "data is infinite, use it all." It was that the token budget matters, and every token you spend on junk is a token you could have spent on signal.

The post-Chinchilla lesson was sharpened by what came after. Open reproductions like RedPajama, RefinedWeb, and the Dolma corpus showed that careful filtering of large web crawls — deduplication, quality classifiers, language identification, removal of near-templated boilerplate — produced training sets that punched above their raw token count. The work of the LLaMA-era teams publicly emphasized the same point: heavy filtering of Common Crawl beats raw Common Crawl at the same token budget [note: Penedo et al. 2023, RefinedWeb; Together/RedPajama technical reports]. The question shifted from "how much data can we get" to "how much of this data is worth training on."

For fine-tuning, the reframe is starker. A growing body of practical experience — and some published evidence — points toward small, carefully curated instruction sets outperforming much larger scraped ones at the same compute budget [note: Hands-On LLMs, fine-tuning chapters; Huyen AIE Ch. 8]. The mechanism is unsurprising once you state it: fine-tuning faithfully teaches the pattern in the data, including "be sloppy" or "hallucinate confidently" if those patterns are present. A thousand clean examples teach a clean policy; fifty thousand noisy ones teach a noisy policy.

<QualityScorer/>

The operating rule that falls out: **optimize tokens × quality, not tokens alone.** Measure your pipeline by what fraction of accepted tokens are actually informative, not by the size of the raw dump you started with. Quantity still matters — under-data a model and it underperforms — but once you are above a reasonable floor, the marginal return on filtering is higher than the marginal return on more scraping [note: Huyen AIE Ch. 8].

## Coverage + distribution — what your data should represent

A well-sized, high-quality dataset can still fail if its distribution does not match the problem. Coverage is the distinct axis from quality, and it gets less attention because it is harder to measure.

The question to answer before you collect anything: what is the distribution of inputs your model will actually see in production, and does your training data plausibly span it? For a base model, the implicit target is "the distribution of text on the internet, weighted by usefulness." For an instruction-tuned model, it is the distribution of tasks users will send. For a domain model, it is the distribution of documents and queries in that domain. Mismatches between training and serving distributions are where models silently underperform [note: Huyen DMLS Ch. 4].

Concrete axes to audit:

- **Topic / domain.** Is the mix of topics in your data representative of the mix you will be asked about? A code model trained overwhelmingly on Python will handle Python well and struggle elsewhere.
- **Language and locale.** Multilingual coverage does not come for free. A model trained on 95% English data will produce worse outputs in every other language, regardless of how well the tokenizer handles them [note: Huyen AIE Ch. 8].
- **Task format.** For instruction data, the distribution of task types — classification, extraction, summarization, open-ended generation, code — shapes which behaviors the model can do reliably.
- **Difficulty.** Too many trivial examples teach the model to handle trivial queries. Too many hard ones and it never learns the easy ground truth.
- **Source provenance.** Whose text is this? Web forums, academic papers, customer support transcripts, and product documentation produce different behaviors. Source mix is a tuning parameter, not an accident [note: Iusztin & Labonne].

The standard diagnostic is slicing: compute your model's evaluation metrics by slice (language, topic, task type, difficulty bin) and look for the slices that underperform the aggregate. An aggregate metric of "82%" can hide a 40% slice that represents your most valuable customer segment [note: Huyen DMLS Ch. 4]. Coverage gaps surface in slices before they surface anywhere else.

One pragmatic heuristic: **if you can sample 50 random inputs from your production traffic and 50 random inputs from your training set, and a reviewer cannot tell which is which, your distribution is probably close enough.** If the two piles look obviously different, you have a coverage problem masquerading as a quality problem.

## Data acquisition + annotation — buy, scrape, curate, label

Training-ready data comes from four sources, often mixed.

**Public web crawls.** Common Crawl and its derivatives are the starting point for most open base-model training. Raw Common Crawl is mostly unusable — heavy boilerplate, duplication, SEO spam, and low-quality pages dominate. Production-grade base-model corpora layer filtering on top: language ID, quality classification, deduplication, URL-level filtering of known-bad domains, and content-level filtering against heuristics (word ratios, repetition rates, symbol density). RefinedWeb and RedPajama are the public reference points for how aggressive this filtering has to be to produce training-grade data from raw web [note: Penedo et al. 2023, RefinedWeb; Together Computer RedPajama technical reports].

**Licensed datasets.** Code repositories, books corpora, scientific papers, dialogue datasets — often bought, licensed, or contributed. Quality tends to be higher per token than raw web, but licensing, attribution, and re-distribution constraints matter more and belong in the metadata from day one [note: Huyen AIE Ch. 8].

**Domain-specific scraping and curation.** For a vertical model — legal, medical, code — targeted ingestion from authoritative sources beats generic web crawl. The curation work lives upstream of the filter: pick sources carefully, handle the domain-specific structure (PDFs with layout, code with file trees, legal documents with citation graphs), and preserve metadata that downstream filtering and retrieval can use [note: Iusztin & Labonne, LLM Engineer's Handbook].

**Human annotation.** For supervised fine-tuning, preference data, and evals, humans label. Annotation quality is a full engineering discipline: clear guidelines, calibration rounds, inter-annotator agreement as a quality signal, disagreement adjudication, continuous review of edge cases [note: Huyen DMLS Ch. 4]. A badly specified annotation task produces noisy labels and, through fine-tuning, a noisy model. The standard failure mode is rushing to volume before the guideline is stable — every label written against a draft guideline becomes debt when the guideline changes.

Across all four sources, the unglamorous constants are metadata (source, license, timestamp, quality score, dedup cluster), versioning (you cannot reproduce a training run without pinning the data revision), and audit trails (who approved this source, who labeled this example, when did the filter change). Datasets that lack this scaffolding become frozen — nobody wants to touch them because nobody is sure what will break.

## Deduplication — exact, near, and semantic

Duplicate and near-duplicate data is the single most studied quality problem in pretraining corpora. The strongest public evidence that it matters comes from Lee et al. (2022), "Deduplicating Training Data Makes Language Models Better," which documented that large web corpora contain substantial duplication and that training on deduplicated data improves language modeling and reduces memorization of training examples [note: Lee et al. 2022, "Deduplicating Training Data Makes Language Models Better"]. Nearly every subsequent large-scale corpus paper treats dedup as a non-optional step [note: Penedo et al. 2023, RefinedWeb; Together RedPajama].

Dedup happens at three levels, each with different tooling and different failure modes.

**Exact dedup** removes byte-for-byte duplicates. Cheapest and most reliable: hash every document (or every chunk), bucket by hash, keep one per bucket. Handles the easy case — the same page crawled twice, the same PDF ingested from two sources — but misses everything with trivial variation.

**Near-duplicate dedup** catches documents that differ by whitespace, headers, timestamps, tracking parameters, or small edits. The standard machinery is MinHash with Locality-Sensitive Hashing (LSH): represent each document as a set of shingles (overlapping n-grams), compress those sets to MinHash signatures that approximate Jaccard similarity, and use LSH to find candidate pairs in sublinear time [note: Lee et al. 2022 uses this approach; standard technique from Broder 1997]. Tune the similarity threshold against spot checks — too aggressive and you remove legitimate variations, too loose and boilerplate slips through.

**Semantic dedup** catches paraphrases and near-paraphrases that share meaning but not n-grams. Embed documents with a sentence encoder, cluster by cosine similarity, and collapse clusters. This is more expensive and harder to tune, and it can over-remove legitimately similar but distinct content (two different tutorials on the same topic). Practical guidance: use it after exact and near-dup have already run, and on content where paraphrase duplication is a known problem — marketing pages, news aggregators, answer sites scraping each other [note: Iusztin & Labonne].

Two auxiliary points worth internalizing. First, **dedupe against your eval set, not just within your training set.** Overlap between training and eval is the most common source of inflated benchmark scores, and it is trivially detectable with the same MinHash tooling [note: Lee et al. 2022]. Second, **dedupe is lossy — keep the mapping.** You want to know, for any retained document, how many duplicates collapsed into it and from which sources. That metadata matters for weighting, for legal traceability, and for debugging distribution surprises downstream.

## Data synthesis — why it's exploding, and the risks

Synthetic data — training data generated by another model — went from a curiosity to a default in the span of the 2023–2025 cycle. The driver is simple: strong base models can generate training examples faster, cheaper, and often more consistently than human annotators can [note: Huyen AIE Ch. 8]. The cost of a labeled example collapsed, and the bottleneck shifted from "can we afford to label this" to "can we generate, filter, and validate without introducing artifacts the model will learn from."

The lineage worth knowing starts with **Self-Instruct** (Wang et al. 2022): seed a language model with a small set of human-written tasks, prompt it to generate new tasks and responses, filter the output, and fine-tune on the filtered set [note: Wang et al. 2022, "Self-Instruct: Aligning Language Models with Self-Generated Instructions"]. The Alpaca follow-up applied this template with GPT-style teacher models and demonstrated that instruction-following behavior could be transferred cheaply [note: Taori et al. 2023, Stanford Alpaca]. The general pattern — generate with a strong model, filter, fine-tune a smaller one — is now standard across open and closed labs.

Several common shapes of synthesis in 2025–2026 practice:

- **Teacher-student distillation.** A strong model generates responses to a prompt set; a smaller model is fine-tuned on those responses. Effective for transferring behavior and format; the student is capped by the teacher [note: Huyen AIE Ch. 8; Hands-On LLMs fine-tuning chapters].
- **Self-play and iterative refinement.** A model critiques and revises its own outputs, and the cleaned outputs become training data. Works when the model's critique is stronger than its generation, which is not always the case.
- **Rubric-driven generation.** Generate candidates, score them against an explicit rubric (human or AI-judge), keep high-scoring outputs. The rubric is doing most of the work; the generation is the cheap part.
- **Evolution / instruction complexification.** Take a seed of real instructions and iteratively rewrite them to be harder, more diverse, or more specific (the WizardLM-style pattern). Trades seed diversity for generated depth.
- **Preference synthesis.** Generate pairs of responses, ask a judge model (or a rubric) to pick the better one, use the pairs for DPO-style training [note: Huyen AIE Ch. 8].

The risks are specific and underrated. **Model collapse** is the failure mode where training a generation of models primarily on the prior generation's synthetic output degrades the data distribution over time — tails of the distribution get clipped, rare patterns disappear, and subsequent models become progressively less diverse [note: Shumailov et al. 2023, "The Curse of Recursion: Training on Generated Data Makes Models Forget"]. The fix is not "never use synthetic data"; it is "always anchor synthetic data with real data" and monitor diversity metrics over training generations.

**Teacher artifacts** are the second risk. Whatever weird tic the teacher model has — an overused phrase, a misformatted JSON key, a consistent factual error — propagates to everything trained on its output. Filtering against the teacher's own known failure modes is necessary; evaluating the student on a held-out real-data benchmark is non-negotiable [note: Huyen AIE Ch. 8].

**Filtering matters more than generation.** The meaningful engineering work in synthetic data pipelines is rarely the prompt that generates; it is the filter that accepts. Cheap generation and strict filters beat clever generation with loose filters. The filter should be at least as good as the model you are training, or you are teaching it the filter's blind spots.

::callout{type="warning"}
**Do not train on synthetic data you cannot evaluate.** If your only quality signal is "the teacher thinks this is good," you are training the student to mimic the teacher's self-assessment — not to be correct. Anchor every synthesis pipeline to a real-data eval set the teacher has not seen.
::

<SynthesisDemo/>

## Inspection, cleaning, formatting — the pipeline

The day-to-day of dataset engineering is a pipeline of small, composable steps, each of which can silently break the run downstream. The shape is stable across projects:

1. **Ingest with metadata.** Every record gets source, timestamp, license, and a stable ID before anything else touches it. If you cannot trace a training example back to its source, you cannot debug what it taught [note: Iusztin & Labonne].
2. **Language + format ID.** Drop records that fail language identification for the target languages, or are not in the expected format (e.g., text where you expected code, HTML where you expected plain text).
3. **Quality filtering.** Heuristic filters (length, symbol ratios, repetition, boilerplate detection) first, then learned quality classifiers where available. Order matters: cheap filters up front save compute on expensive ones [note: Huyen AIE Ch. 8].
4. **Dedup.** Exact, then near-dup, then (optionally) semantic. Dedup against eval sets, not only within training.
5. **Safety + PII filtering.** Remove regulated content, PII, and known-unsafe material. This is not the same filter as quality — a perfectly well-written paragraph can still need to be removed.
6. **Format normalization.** Training formats (for instruction data, preference data, DPO pairs) have specific shapes. Normalize once, at the end of the pipeline, with validation that rejects malformed records rather than silently coercing them.
7. **Spot check, always.** Sample 50–100 examples at random from the final training set and read them. This catches pipeline bugs that pass every automated check. If you cannot make yourself do this, the pipeline is not ready to train against.

Each stage belongs in version control as code, not as a notebook. Each record's journey through the pipeline belongs in lineage metadata, not as a final dump. Datasets that lack this scaffolding become unmaintainable — training runs become irreproducible, and post-hoc investigations become archaeology.

::callout{type="warning"}
**Read your data.** Every failed finetune that made it to production was accompanied by engineers who trusted their pipeline over their eyes. Open the actual files. Scroll through actual examples. If you are not surprised at least once, you are not looking closely enough.
::

## What's next

Dataset engineering sets the ceiling that **Finetuning** operates against — the previous topic's mechanics only pay off when the data underneath them is good. And everything in this pipeline — quality filtering, dedup thresholds, synthesis rubrics — is only as trustworthy as the measurement you attach to it, which is why **Evaluation** is not downstream of data work but woven through it. The honest loop is the same at every scale: curate, train, measure, find the data failures the model exposed, fix the data, repeat.
