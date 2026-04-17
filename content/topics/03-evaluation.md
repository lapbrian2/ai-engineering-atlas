---
id: evaluation
order: 03
title: Evaluation
subtitle: From perplexity to AI-as-judge — benchmarks, comparative eval, and pipelines you can trust
topic: evaluation
difficulty: intermediate
estimatedReadMinutes: 12
hero: false
primitives:
  - metric-calculator
  - judge-comparator
citations:
  - { book: huyen-aie, chapters: "Ch. 3-4", topic: "eval methodology" }
  - { book: iusztin-labonne-handbook, chapters: "monitoring + eval", topic: "production eval" }
tags: [evaluation, benchmarks, ai-as-judge, metrics]
updatedAt: 2026-04-17
---

## Why evaluation is harder for foundation models

Classical ML evaluation has a reassuring shape. You hold out a labeled test set, run the model on it, compute accuracy or F1 or RMSE against the ground truth, and compare to a baseline. The metric is the metric. The set is the set. You have a number you can trust, or at least argue about.

Foundation models break every part of that loop. Outputs are open-ended, which means a correct answer can be written a thousand ways and a wrong one can look almost identical to a right one. There is often no single ground truth — "write a helpful response" does not have a unique target the way "classify this tumor" does. Tasks are specified in natural language, so the prompt itself becomes part of the evaluation surface and small changes to phrasing can move scores meaningfully [note: Huyen AIE Ch. 3]. The test distribution that matters is whatever your users actually send, which is not whatever was in the benchmark the model was scored on.

The data problem compounds everything else. Public benchmarks leak into pretraining corpora because they live on the public web, which means a model can score well on a benchmark it has effectively memorized. This is called contamination, and it is the reason why a new benchmark's credibility has a half-life measured in months, not years [note: Huyen AIE Ch. 3]. Leaderboards get gamed — not always maliciously, but because teams optimize against the visible metric and the metric slowly stops measuring the underlying capability. Benchmark saturation — where frontier models all score above 90 percent — means the benchmark has lost its ability to discriminate, regardless of what capability it was designed to test.

So the goal of evaluation changes. You are no longer asking "what is this model's score?" You are asking "does this system, on my workload, produce outputs my users will trust?" The first is a number. The second is a pipeline. The rest of this topic is about building that pipeline without fooling yourself along the way.

## Language modeling metrics

Before any task-level metric, there is the metric the model was trained against: how well it predicts the next token. This is the only metric that is defined directly on the model's objective function, which makes it the purest signal you can get about whether the model has learned the distribution of the data.

Cross-entropy loss, averaged over tokens in a held-out corpus, measures how surprised the model is by the real next token. Lower is better. Perplexity is the exponential of cross-entropy — a model with perplexity 10 is, loosely, "as uncertain as if it were choosing uniformly between 10 possibilities at each step" [note: Huyen AIE Ch. 3]. Bits-per-byte normalizes cross-entropy by the number of bytes in the text, which lets you compare models that use different tokenizers. Without that normalization, a model with a more efficient tokenizer looks better purely because it spends fewer tokens per byte, not because it predicts better.

These metrics are useful for base models, continued pretraining, and domain adaptation. If you pretrain a model on medical text and perplexity on medical text drops, you have learned something real. If you compare two candidate pretraining runs on the same held-out corpus with the same tokenizer, the lower-perplexity model is the better language model of that corpus. This is also how you detect training-loss anomalies — sudden spikes or plateaus in cross-entropy flag distribution shifts or data quality issues before they show up downstream [note: Iusztin-Labonne production eval].

Where these metrics mislead is on chat and instruction-tuned models. After RLHF or DPO, the model's output distribution is deliberately pushed away from the pretraining distribution toward responses humans prefer. A fine-tuned chat model will have worse perplexity on generic web text than its base model — not because it got worse, but because it got better at something the metric does not measure. Perplexity tells you how well the model predicts text. It does not tell you whether the model's answer is correct, useful, safe, or preferred by a human. For anything past base-model evaluation, you need different instruments.

<MetricCalculator/>

## Exact-match evaluation

When the task has a single correct answer or a well-defined reference output, you can evaluate directly. This is the cheapest, most reliable, and most limited class of metrics.

Functional correctness is the gold standard where it applies. For code, you run the generated program against unit tests and measure pass rate — HumanEval and MBPP work this way [note: Huyen AIE Ch. 4]. For math, you parse the final answer and check it. For SQL, you execute the query against a test database and compare result sets. The property that makes these metrics trustworthy is that they measure whether the output does the thing, not whether it looks like the thing. A model that writes ugly code that passes all tests beats a model that writes elegant code that fails one.

When you cannot run the output, you fall back on similarity to a reference. BLEU — originally built for machine translation — measures n-gram overlap between candidate and reference, with a brevity penalty. ROUGE, common in summarization, measures recall of n-grams and longest common subsequence. METEOR adds stemming, synonymy, and paraphrase matching. BERTScore replaces surface-form matching with cosine similarity over contextual embeddings, which catches semantic equivalence that surface n-grams miss [note: Huyen AIE Ch. 4].

Each is useful where it fits. BLEU and ROUGE are fast, deterministic, and well-understood — fine for regression testing against a fixed reference. BERTScore is more permissive of legitimate rephrasing but requires a model and is sensitive to which embedding model you use. None of them tell you whether the output is correct — they tell you how close it is to a reference you happened to choose. For open-ended tasks with many valid answers, that similarity number can be almost disconnected from quality.

## AI as a judge

Once outputs are open-ended and there is no unique reference, human evaluation becomes the only source of ground truth — and human evaluation is slow, expensive, and inconsistent. AI-as-judge is the workaround: use a strong language model to score or compare outputs, then spot-check against humans to validate the judge [note: Huyen AIE Ch. 3].

The judge is given the input, one or more candidate outputs, and a rubric. It produces a score (pointwise) or a preference (pairwise). This lets you evaluate thousands of outputs in minutes instead of days, run regressions on every deployment, and operate at a cost-per-eval low enough to use in automated pipelines. For many production systems this is the only feasible way to get a quality signal on the full traffic distribution rather than a hand-annotated sample.

It also has well-documented failure modes. Position bias: judges prefer the answer that appears first (or, in some models, second) regardless of quality. The standard mitigation is to run each pair twice with swapped positions and only count agreements [note: Huyen AIE Ch. 3]. Verbosity bias: judges systematically prefer longer, more elaborate answers even when the shorter answer is correct and the longer one pads with filler. Length bias is related — response length is correlated with perceived quality even when you control for content. Self-preference: when the judge and the candidate are the same model family, the judge tends to rate its own family higher. This is particularly damaging in model comparisons because it can make a newer version of the judge's own family look better than it is.

::callout{type="warning"}
If you evaluate your own model with a judge from the same family, your scores are optimistic. Cross-family judging (for example, evaluating a Claude-based system with a GPT judge and vice versa) is a partial mitigation. Full mitigation requires periodic human validation against a held-out sample.
::

When AI-as-judge works well, the judge agrees with humans on at least the direction of preferences, even if exact scores differ. You establish this by annotating a calibration set, running the judge on it, and measuring rank correlation or agreement rate. If the judge and humans agree 80-plus percent of the time on pairwise preferences, the judge is a usable instrument for relative comparisons — not an oracle, but a signal. If agreement is low, the rubric is underspecified or the task is too subjective for the judge, and no amount of prompt engineering will make the scores meaningful [note: Huyen AIE Ch. 3].

Use AI-as-judge for relative comparisons between system versions, for flagging regressions in CI, and for scaling spot-checks across large output volumes. Do not use it as the final word on absolute quality or for anything load-bearing (safety reviews, legal signoff, clinical decisions) without humans in the loop.

<JudgeComparator/>

## Comparative evaluation

When you cannot score an output in isolation but you can tell which of two outputs is better, comparative evaluation lets you build a ranking from pairwise preferences. Humans are far more consistent at "which is better" than at "score this from 1 to 10," and the same is true of AI judges [note: Huyen AIE Ch. 3].

The mechanics borrow from sports ranking. Bradley-Terry models fit a latent skill parameter per model from a set of pairwise win/loss outcomes. Elo, familiar from chess, updates each model's rating after each matchup based on the expected versus observed result. Chatbot Arena uses this directly — users are shown two anonymous model outputs for the same prompt, pick a winner, and Elo scores update in real time across the fleet of models [note: Huyen AIE Ch. 3].

The hard parts are statistical. Pairwise preferences are not transitive in practice — you can observe A beats B, B beats C, C beats A in finite samples, especially when the models are close in quality. Sparse matchups mean some model pairs are compared only a handful of times, which makes the rating for those pairs noisy. Annotator drift — human or AI preferences changing over time as the population of prompts shifts — can move ratings without any model actually changing. And aggregate ratings hide distribution: a model that is great on creative writing and mediocre on code can tie a model that is the opposite, with neither rating telling you which one you should use for your workload.

Comparative eval is most trustworthy when you scope it narrowly — compare two systems on a fixed prompt distribution that matches your use case, collect enough matchups to get confidence intervals, and report both the aggregate and the breakdown by prompt category. Treat a single headline Elo number with the same skepticism you treat a single accuracy number on a generic benchmark.

## Benchmark literacy

Reading evaluation tables in papers and on leaderboards is a skill, not a passive activity. A few benchmarks you will encounter constantly, and what they actually measure:

**MMLU** (Massive Multitask Language Understanding) is a multiple-choice benchmark spanning 57 subjects, from elementary mathematics to professional law and medicine. It tests broad knowledge recall and basic reasoning. Known issues include label errors in the original dataset, contamination (the test set is on the public web), and saturation at the frontier [note: Huyen AIE Ch. 4]. MMLU-Pro is a harder reworked version designed to push the ceiling back up.

**HumanEval** is a set of Python programming problems with hidden unit tests. A solution passes if it passes all tests. It measures basic code generation but is small, heavily memorized by frontier models, and covers a narrow slice of real programming work. Pass-at-k is the metric — probability that at least one of k samples passes.

**GSM8K** is grade-school math word problems. It tests multi-step arithmetic reasoning under natural-language framing. Contamination has become a serious concern, and many evaluations now pair it with GSM8K-Symbolic or similar variants that change surface details to defeat memorization [note: Huyen AIE Ch. 4].

**GPQA** is graduate-level science multiple-choice questions, designed to be hard to Google and to reward genuine reasoning over retrieval. It is less saturated than MMLU at the frontier, which is part of why it shows up in recent evals.

**SWE-bench** measures whether a model, given a real GitHub issue and the corresponding repository, can produce a patch that makes the hidden test suite pass. This is a different shape of benchmark — agentic, tool-using, multi-file — and much harder to saturate than single-shot benchmarks.

When you read an eval table, do four things. One: check whether the evaluation is zero-shot, few-shot, or agentic — the same benchmark with different protocols produces very different numbers. Two: check what "pass" means — strict exact match, any valid answer, partial credit. Three: look for contamination analysis in the appendix; serious papers discuss it, and its absence is a tell. Four: ask whether the benchmark's distribution matches your workload. A model that leads on GSM8K may not lead on whatever math your users actually ask [note: Huyen AIE Ch. 4].

::callout{type="warning"}
A benchmark score on a contaminated test set is an upper bound on the model's real capability, not an estimate. Treat any score near the ceiling on a widely-used public benchmark as "at least this good under ideal memorization conditions" — not as a guarantee for your workload.
::

## Designing your eval pipeline

Evaluation is not a metric, it is a pipeline. Huyen breaks the work into three steps, and the steps are the same whether you are evaluating a prompt, a RAG system, or a full agent [note: Huyen AIE Ch. 4].

**Evaluate all components, not just end-to-end.** A RAG system is a retriever, a reranker, and a generator. If end-to-end answers are wrong, you cannot tell whether retrieval missed the right chunk, the reranker pushed it out of the top-k, or the generator ignored good context. Instrument each component separately. For retrieval, recall-at-k against a labeled question-to-chunk mapping. For reranking, precision-at-k. For generation, answer quality conditional on retrieved context. End-to-end metrics tell you whether something is broken; component metrics tell you what.

**Write evaluation guidelines before writing prompts.** The guideline is the rubric your judges — human or AI — use to score outputs. It should be specific enough that two competent annotators looking at the same output agree on the score most of the time. Ambiguous guidelines produce noisy scores, and noisy scores are indistinguishable from a noisy model. Iterate on the guideline with real examples until inter-annotator agreement is acceptable, then freeze it [note: Huyen AIE Ch. 4].

**Build evaluation data that reflects your workload.** Public benchmarks measure general capability. Your eval set measures fitness for your problem. Sample from real traffic where you can, synthesize additional cases to cover edge conditions and known failure modes, and keep a slice held out entirely from any prompt engineering or fine-tuning you do. The held-out slice is the only honest signal you have about whether changes to the system are real improvements or overfitting to your dev set [note: Iusztin-Labonne production eval].

The pipeline runs on every deployment. Regression is the default behavior of prompt and model changes — guardrails catch it only if the eval is automated and blocking. Make the eval a gate, not a report.

## What's next

Evaluation is the instrument you use to make everything else trustworthy. The next two topics build on it: **RAG and Agents** composes retrieval, tools, and generation into systems whose correctness depends on the component-level evals described here, and **Production** covers the observability, monitoring, and human-in-the-loop patterns that keep evaluation honest once the system is serving real traffic.
