---
id: evaluation
order: 03
title: Evaluation
subtitle: From perplexity to AI-as-judge — benchmarks, comparative eval, and pipelines you can trust
topic: evaluation
difficulty: intermediate
estimatedReadMinutes: 47
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

Foundation models break every part of that loop. Outputs are open-ended, which means a correct answer can be written a thousand ways and a wrong one can look almost identical to a right one. There is often no single ground truth — "write a helpful response" does not have a unique target the way "classify this tumor" does. Tasks are specified in natural language, so the prompt itself becomes part of the evaluation surface and small changes to phrasing can move scores meaningfully[^1]. The test distribution that matters is whatever your users actually send, which is not whatever was in the benchmark the model was scored on.

The data problem compounds everything else. Public benchmarks leak into pretraining corpora because they live on the public web, which means a model can score well on a benchmark it has effectively memorized. This is called contamination, and it is the reason why a new benchmark's credibility has a half-life measured in months, not years[^1]. Leaderboards get gamed — not always maliciously, but because teams optimize against the visible metric and the metric slowly stops measuring the underlying capability. Benchmark saturation — where frontier models all score above 90 percent — means the benchmark has lost its ability to discriminate, regardless of what capability it was designed to test.

There is a deeper asymmetry, too. In classical supervised learning, the loss you train against is close to the loss you care about at inference time. A classifier trained with cross-entropy on labeled images is scored with accuracy on labeled images; the gap between training objective and evaluation metric is narrow, and progress on one usually tracks progress on the other. Foundation models break that alignment. The model is trained to predict the next token on a massive corpus. You want it to answer customer questions, write code that compiles, summarize long documents faithfully, or drive an agent that takes correct actions in a software environment. There is no law of nature that says a model with lower next-token loss will be better at any of those things. Empirically it often is, because language modeling is a remarkably general objective, but the relationship is loose enough that you cannot evaluate a production system by looking at training loss.

So the goal of evaluation changes. You are no longer asking "what is this model's score?" You are asking "does this system, on my workload, produce outputs my users will trust?" The first is a number. The second is a pipeline. The rest of this topic is about building that pipeline without fooling yourself along the way.

A note on vocabulary before we go further. The word "evaluation" gets used for at least three different things in this literature, and mixing them up is the most common way people get confused. Capability evaluation asks whether a model can do a task at all — this is what public benchmarks like MMLU and HumanEval try to measure. System evaluation asks whether your composed system — prompts, retrieval, tools, guardrails, model calls in sequence — produces the outputs you want on the workload you have. Production evaluation asks whether the system is still doing that a week, a month, or a quarter after you shipped it. The metrics and instruments are different for each. Capability eval happens once per model version. System eval runs on every deployment. Production eval runs continuously. A team that can only do one of the three has a brittle pipeline.

## Worked example: building an eval harness for a customer-support classifier

Before we catalog metrics, let's build one. The running example throughout this topic is a customer-support intent classifier. The system takes an inbound customer message and routes it to one of eight intent buckets: billing, account, technical, shipping, returns, product-question, complaint, other. Each ticket also gets a priority score from 1 to 5 and, optionally, a short suggested reply draft. The model is a general-purpose LLM accessed via API. The prompt is a system message that lists the intents with one-line descriptions and asks for JSON output. There is no fine-tuning — the whole system is prompt plus schema plus model.

This example is deliberately modest. Classification is easier to evaluate than open-ended generation, which lets us show the full pipeline without the metrics fighting us. But the shape of the pipeline — dataset, offline metrics, regression tests, canary, production monitoring — transfers directly to harder systems later.

**Step one: define what success means before writing any code.** Before instrumenting anything, write down what the system needs to do for the business. For the classifier: route 95 percent of tickets to the correct intent, never misroute a complaint as product-question, keep priority-5 tickets (urgent) at sub-2-minute routing latency. These become the top-level objectives. Every metric you design must ladder up to one of them. A metric that does not connect to an objective is an indulgence — fun to compute, but you will not do anything with it.

**Step two: construct the eval set.** Pull 1,000 real tickets from the last 90 days of production traffic. Sample stratified by intent, not uniformly — if complaints are 3 percent of traffic but must never be misrouted, oversample them to 15 percent of the eval set so you have enough signal. Within each intent, stratify by source channel (email, chat, form) and by message length (short, medium, long). Have two human annotators label each ticket independently. Where they disagree, a third annotator adjudicates and the disagreement gets logged — high-disagreement tickets are interesting because they often reveal ambiguity in your taxonomy.

Split the 1,000 tickets into three sets. 200 go in a development set that you can iterate prompts against. 200 go in a validation set that you look at only occasionally, to guard against overfitting the dev set. 600 go in a held-out test set that you look at exactly twice per quarter — once before shipping a change, once after. The held-out set is the only metric anyone outside the team is allowed to hear about. If you run it weekly, it stops being held out.

**Step three: write the offline harness.** The harness is a script that takes a version tag (a git SHA or a prompt hash), runs the classifier over the eval set, and writes the outputs plus the ground-truth labels plus every intermediate signal (the raw model response, the parsed intent, the confidence if you can extract it, the latency, the token counts, any tool calls, any errors) to a structured log. Results for every version go to the same store, so you can query "what changed between v23 and v24?" and get a row-level diff.

The harness computes four kinds of metrics. Component metrics: intent accuracy, priority mean-absolute-error, reply-draft AI-judge score. Slice metrics: the same metrics broken down by intent, by channel, by length bucket, by customer tier. Safety metrics: complaint-misroute rate, PII-leak rate in drafts, refusal rate on legitimate questions. Cost and latency metrics: p50 and p95 end-to-end latency, dollars per 1,000 tickets. None of these are optional. If you only track one number, you will ship a change that improves it while degrading something you care about more.

**Step four: turn the harness into a gate.** Wire the harness into CI. Every pull request that touches the prompt, the schema, the model version, or any downstream transform runs the harness on the dev set. If intent accuracy drops more than 1 point, or complaint-misroute rate moves at all, or p95 latency crosses the threshold, the PR is blocked. The gate can be overridden, but the override has to be logged with a reason. This is the single most important artifact in the pipeline — without it, every deploy is a coin flip.

**Step five: shadow eval in production.** Route a small fraction of real traffic — start at 1 percent — through a second instance of the new system, in parallel with the current one. Do not use the shadow system's output for anything. Log both outputs, compute agreement rate, and flag high-disagreement cases for human review. Shadow eval catches distribution shifts that the static eval set missed. A prompt change that scored 96 percent on the held-out set can fall to 82 percent in shadow because the held-out set was older than you thought, or because there has been a product launch that changed the topic distribution.

**Step six: canary rollout with online metrics.** Once the shadow looks good, promote the new system to 5 percent of live traffic, then 25, then 100 over a few days. At each stage, watch the online metrics: routing override rate (how often a human reroutes after the model picks), complaint-escalation time, customer satisfaction (CSAT) tagged by first-touch-resolution, and operator time per ticket. Online metrics are noisier and slower than offline metrics, but they are the only measurements that reflect real value. The offline-online gap — where offline numbers improve but online numbers do not — is common and informative. Close the gap before you call a change a win.

**Step seven: continuous monitoring and drift detection.** After full rollout, the harness keeps running. Once a day, re-run the held-out test set against the current live prompt and model. Once a week, sample 100 new production tickets and have a human annotator label them to keep the eval distribution fresh. Track drift in the input distribution (token-length histogram, intent balance, channel mix) and in the output distribution (how often the model picks "other", refusal rate, verbosity of drafts). Drift detection is the early warning system for everything else going wrong.

The rest of this topic zooms in on each of these steps in detail. Keep the classifier in mind as the running example. Almost everything that follows is a technique you would use on its harness.

## Language modeling metrics

Before any task-level metric, there is the metric the model was trained against: how well it predicts the next token. This is the only metric that is defined directly on the model's objective function, which makes it the purest signal you can get about whether the model has learned the distribution of the data.

Cross-entropy loss, averaged over tokens in a held-out corpus, measures how surprised the model is by the real next token. Lower is better. The formal definition is the expected value of negative log probability: for a sequence of tokens `x_1, ..., x_N`, cross-entropy is `H = -(1/N) * sum_i log p(x_i | x_{<i})`. The logarithm is usually base 2 (giving cross-entropy in bits) or base e (giving cross-entropy in nats); the convention matters when comparing across papers, so check which one a paper is using before you quote the number. Perplexity is the exponential of cross-entropy. If cross-entropy is computed in bits, perplexity is `2^H`; if in nats, `e^H`. A model with perplexity 10 is, loosely, "as uncertain as if it were choosing uniformly between 10 possibilities at each step"[^1].

Bits-per-byte normalizes cross-entropy by the number of bytes in the text, not the number of tokens: `bpb = (total nats across corpus) / (ln(2) * total bytes)`, or equivalently `cross-entropy-in-bits-per-token * tokens / bytes`. This lets you compare models that use different tokenizers, which you cannot do directly with perplexity. Without that normalization, a model with a more efficient tokenizer looks better purely because it spends fewer tokens per byte, not because it predicts better. If model A uses a BPE tokenizer with an average of 4 bytes per token and model B uses a character-level tokenizer with 1 byte per token, their per-token perplexities are not on the same scale. Bits-per-byte puts them back on one.

Let's run the numbers on a concrete example. Suppose you are evaluating a base model on a 10-million-byte held-out corpus. Your tokenizer produces 2.5 million tokens for that corpus, an average of 4 bytes per token. After running the model, the total negative log-likelihood of all tokens is 3.75 million nats. Cross-entropy per token is `3.75e6 / 2.5e6 = 1.5` nats, or `1.5 / ln(2) = 2.16` bits. Perplexity is `e^1.5 = 4.48` — the model is about as uncertain on this corpus as if it were choosing between four and five equally likely tokens at each step. Bits-per-byte is `3.75e6 / (ln(2) * 10e6) = 0.541` bits per byte. That last number is the one to quote if you are comparing against a model with a different tokenizer.

Two entropy concepts clarify what these metrics mean. True entropy is the information content of the data distribution itself — a lower bound on how well any model can predict it. If the data distribution has entropy `H(D) = 2` bits per character, no model, no matter how powerful, can achieve cross-entropy below 2. Your model's cross-entropy is always at least as high as the true entropy. The gap between them — the Kullback-Leibler divergence between model and data — is the room left for improvement. This is why perplexity numbers eventually stop going down: you approach the data entropy as a floor, and further training produces diminishing returns. Knowing there is a floor also tells you when a surprising jump in perplexity probably means something is wrong with your eval set or tokenizer, not with the model.

These metrics are useful for base models, continued pretraining, and domain adaptation. If you pretrain a model on medical text and perplexity on medical text drops, you have learned something real. If you compare two candidate pretraining runs on the same held-out corpus with the same tokenizer, the lower-perplexity model is the better language model of that corpus. This is also how you detect training-loss anomalies — sudden spikes or plateaus in cross-entropy flag distribution shifts or data quality issues before they show up downstream[^2].

Where these metrics mislead is on chat and instruction-tuned models. After RLHF or DPO, the model's output distribution is deliberately pushed away from the pretraining distribution toward responses humans prefer. A fine-tuned chat model will have worse perplexity on generic web text than its base model — not because it got worse, but because it got better at something the metric does not measure. Perplexity tells you how well the model predicts text. It does not tell you whether the model's answer is correct, useful, safe, or preferred by a human. For anything past base-model evaluation, you need different instruments.

A practical corollary: when you see a paper reporting perplexity as the headline metric for a chat model, be skeptical. The researchers either chose the wrong instrument or chose it because it flattered their result. Ask what task-level metrics were measured. If the answer is "none," treat the perplexity number as a compile check — it tells you the model trained to convergence, and little more.

<MetricCalculator />

## Exact-match evaluation

When the task has a single correct answer or a well-defined reference output, you can evaluate directly. This is the cheapest, most reliable, and most limited class of metrics.

Functional correctness is the gold standard where it applies. For code, you run the generated program against unit tests and measure pass rate — HumanEval and MBPP work this way[^3][^4]. For math, you parse the final answer and check it. For SQL, you execute the query against a test database and compare result sets. The property that makes these metrics trustworthy is that they measure whether the output does the thing, not whether it looks like the thing. A model that writes ugly code that passes all tests beats a model that writes elegant code that fails one. The canonical metric here is pass@k — the probability that at least one of k sampled solutions passes all the tests. Pass@1 measures reliability on a single attempt; pass@100 measures the outer envelope of what the model can do when you can afford to sample and filter.

When you cannot run the output, you fall back on similarity to a reference. This is where the lexical-overlap metrics live. They are all attempts to approximate "is the output close enough to the reference that we'd accept it?" — a question none of them answer well on their own, but each of which answers it well enough in specific settings to be useful.

**BLEU** (Bilingual Evaluation Understudy) was introduced for machine translation[^5]. It computes modified n-gram precision — the fraction of n-grams in the candidate that appear in the reference, with each reference n-gram usable only as many times as it appears (to prevent a candidate that repeats the word "the" from scoring perfectly). BLEU combines precisions at n=1 through n=4 as a geometric mean, then multiplies by a brevity penalty `BP = min(1, exp(1 - r/c))` where `r` is reference length and `c` is candidate length. The brevity penalty prevents the model from gaming the metric by producing very short outputs that contain only words that appear in the reference. The full formula: `BLEU = BP * exp(sum_{n=1..4} w_n * log p_n)`, with `w_n = 1/4` and `p_n` the modified precision at order n. BLEU outputs a number between 0 and 1, conventionally reported times 100.

BLEU works well when there is a canonical reference translation and the output space is relatively constrained — translation, grammatical error correction, formal rewrites. It fails when the output can legitimately differ in vocabulary from the reference (summarization with paraphrase, creative generation, open-ended QA). A candidate that says "the accident killed five" when the reference says "five died in the crash" scores poorly on BLEU despite being semantically identical.

**ROUGE** (Recall-Oriented Understudy for Gisting Evaluation) was built for summarization[^6]. Where BLEU prioritizes precision, ROUGE prioritizes recall. The main variants: ROUGE-N is n-gram recall (fraction of reference n-grams that appear in the candidate). ROUGE-L is longest common subsequence, treating the candidate and reference as ordered sequences of tokens and measuring the length of their LCS relative to the lengths of the two sequences, reported as an F1. ROUGE-W is a weighted version of ROUGE-L that rewards contiguous matches. ROUGE-S is skip-bigram, counting pairs of tokens that appear in the same order (not necessarily contiguously).

ROUGE-L is the most common variant in practice. It handles light paraphrasing better than ROUGE-N because the LCS does not require contiguity, but it still misses deep paraphrase (synonyms, rephrased syntactic structure). ROUGE fits summarization because coverage is the thing you want — did the summary capture the key points of the reference? — and fails for the same reason BLEU fails elsewhere: it is blind to semantics.

**METEOR** adds stemming, synonymy (via WordNet), and paraphrase matching on top of unigram recall and precision, producing better correlation with human judgment than BLEU or ROUGE on translation tasks. It is slower, language-dependent, and has fallen out of fashion as embedding-based metrics have improved, but it still shows up in some MT leaderboards.

**BERTScore** replaces surface-form matching with cosine similarity over contextual embeddings[^7]. For each token in the candidate, it finds the maximum cosine similarity with any token in the reference, using contextual embeddings from a pretrained model (BERT, RoBERTa, or similar). The token-level scores are aggregated into precision, recall, and F1. BERTScore catches semantic equivalence that n-gram metrics miss — "five died" and "five people were killed" score high because their token embeddings are similar in context. It is also more sensitive to semantic distortions that n-gram metrics happily ignore. The trade-off is that BERTScore requires a model, is slower, and is sensitive to which embedding model you use — scores are not comparable across different backbones, and the same pair of strings will score differently under BERT-base and RoBERTa-large.

When do you reach for each? **BLEU** is the right choice when (a) the task has a canonical reference, (b) you want fast, deterministic, per-sentence scores, and (c) you are comparing systems on the same test set over time. BLEU is a weak absolute metric — a BLEU of 40 is not "good," it's just a number — but it is a decent relative metric for tracking regressions when outputs are tightly constrained. **ROUGE** is the right choice for summarization regression testing and coverage analysis. It is not a good quality metric — a ROUGE-L of 0.35 tells you almost nothing about whether your summaries are useful — but a sudden drop from 0.35 to 0.28 is a signal worth investigating. **BERTScore** is the right choice when legitimate rephrasing matters and you can afford a model in the loop. It correlates better with human judgment than BLEU or ROUGE on most tasks[^7], but it is not a replacement for human or AI-as-judge evaluation on open-ended generation.

None of these metrics tell you whether the output is correct — they tell you how close it is to a reference you happened to choose. For open-ended tasks with many valid answers, that similarity number can be almost disconnected from quality. Treat lexical-overlap metrics as regression guards, not quality signals. A change that moves BLEU from 32.4 to 32.1 probably didn't change anything; a change that moves it from 32.4 to 28.0 changed something, and you should find out what.

::callout{type="warning"}
Reporting a single BLEU or ROUGE score as evidence that "model A is better than model B" is one of the most common abuses of these metrics. Both metrics have known blind spots — paraphrase, synonymy, style — that can make a worse model score higher. Use them inside a battery of metrics, not as a headline claim.
::

<MetricCalculator />

## AI as a judge

Once outputs are open-ended and there is no unique reference, human evaluation becomes the only source of ground truth — and human evaluation is slow, expensive, and inconsistent. AI-as-judge is the workaround: use a strong language model to score or compare outputs, then spot-check against humans to validate the judge[^1][^8].

The judge is given the input, one or more candidate outputs, and a rubric. It produces a score (pointwise) or a preference (pairwise). This lets you evaluate thousands of outputs in minutes instead of days, run regressions on every deployment, and operate at a cost-per-eval low enough to use in automated pipelines. For many production systems this is the only feasible way to get a quality signal on the full traffic distribution rather than a hand-annotated sample.

### Prompt design for judges

The judge's prompt is not a small detail — it is the entire instrument. Four properties distinguish a good judge prompt from a bad one.

**A concrete rubric.** "Which response is better?" is a bad prompt. "Rate each response from 1 to 5 on factual accuracy (does every claim match the reference document?), completeness (does it address every part of the question?), and tone (is it professional and direct?). Then give an overall rating." is a better prompt. The best judge prompts read like annotation guidelines for a human rater, because that is what they are. If you cannot write a rubric specific enough that two humans would agree, no amount of prompt engineering on the LLM side will produce stable scores.

**Concrete examples.** Include at least one high-scoring and one low-scoring example in the prompt, with the rubric applied and the score justified. This is few-shot calibration. Without it, the judge's internal anchor for "5" drifts between calls, and you get noise dressed up as signal. With it, the anchor is fixed to examples you chose.

**Structured output.** Ask for JSON with specific fields — `{ "accuracy": 4, "completeness": 5, "tone": 3, "overall": 4, "reasoning": "..." }`. Free-text scoring is harder to parse, easier to drift, and impossible to aggregate. Structured output also makes it trivial to compute per-dimension statistics, which surfaces which dimension is actually driving the overall score.

**Chain-of-thought judging.** Ask the judge to explain its reasoning before assigning the score. Zheng et al.[^8] showed that CoT judging improves agreement with human ratings substantially, especially on reasoning-heavy tasks. The mechanism is not mysterious: forcing the judge to articulate what it is evaluating changes what it actually evaluates. Put the reasoning field before the score in the JSON, so the judge's first tokens reason about the answer rather than committing to a score it will then justify.

### Known failure modes

AI-as-judge has well-documented failure modes. You will trip over all of them if you are not looking.

**Position bias.** Judges prefer the answer that appears first, second, or in a specific slot, regardless of quality. Zheng et al.[^8] measured position bias in GPT-4 on MT-Bench pairs and found a systematic preference for the first response in a non-trivial fraction of pairs where two outputs were of comparable quality. The standard mitigation is to run each pair twice with swapped positions and only count agreements — if the judge picks A when A is first and picks A when A is second, that's a real preference; if it picks "whichever is first," that's a position-biased non-signal. Pairs where the judge changes its mind on swap are reported as ties.

**Verbosity bias (sometimes called length bias).** Judges systematically prefer longer, more elaborate answers even when the shorter answer is correct and the longer one pads with filler. Long answers look more thorough; thorough looks more correct. The effect is strong enough that a meaningful fraction of apparent quality differences in pointwise judging can be explained by length alone. Mitigations: include length constraints in the rubric ("penalize unnecessary verbosity"), normalize for length in the aggregation, or compare only outputs truncated to similar lengths.

**Self-preference.** When the judge and the candidate are the same model family, the judge tends to rate its own family higher. This is particularly damaging in model comparisons because it can make a newer version of the judge's own family look better than it is. Partial mitigation: cross-family judging (use a Claude-family judge to score a GPT-family system, and vice versa, and report both). Full mitigation requires periodic human validation.

**Style-over-substance bias.** Judges penalize informal tone, list formatting without rationale, or voice that deviates from a generic "polished assistant" register, even when the substance is correct. If your product voice is not generic, your judge will punish you for following your brand.

**Chain-of-thought contagion.** If the judge sees the answer's chain of thought before the final answer, it uses the reasoning as evidence of correctness rather than checking the final answer directly. For systems that include CoT in their output, either strip the CoT before sending to the judge, or instruct the judge explicitly that CoT is not evidence of correctness.

### Mitigation techniques

Beyond the per-bias mitigations above, three techniques raise the ceiling on AI-as-judge reliability.

**Pairwise with swap.** Instead of asking "rate this output 1-5," ask "which of these two outputs is better?" and run every pair twice with positions swapped. Pairwise preferences are more consistent than pointwise ratings (both for humans and for AI judges), and the swap control catches position bias directly. Aggregate into win rates, not raw scores. This is what Chatbot Arena does and what MT-Bench recommends[^8][^9].

**Rubric decomposition.** Instead of asking for one overall score, ask for scores on specific dimensions — factual accuracy, completeness, tone, safety — and aggregate. This forces the judge to actually evaluate each dimension separately, and it gives you a diagnostic: when the overall score drops, you can tell whether it was accuracy, completeness, or something else. It also reduces verbosity bias — if you ask for "completeness" as its own score, length is actually relevant to that dimension, which means it gets discounted on the others.

**Chain-of-thought with reasoning-first output.** Structure the JSON so the `reasoning` field comes before any score. The judge generates its reasoning first, the scores second, and the reasoning actually constrains the score rather than rationalizing it. Put the prompt's rubric examples in the same structure.

### Calibrating against humans

None of these mitigations matter if you do not validate the judge against humans. The calibration procedure:

1. Build a calibration set of 100-300 outputs spanning the quality range. Cover hard cases — edge cases, ambiguous prompts, known failure modes.
2. Have 2-3 human annotators label each output using the same rubric the judge uses. Compute inter-annotator agreement. If humans cannot agree with each other, the task is too subjective and no judge will fix it — revise the rubric.
3. Run the judge on the calibration set. Compute agreement between judge and humans — Cohen's kappa for categorical ratings, Spearman rank correlation for ordinal ratings, agreement rate on pairwise preferences.
4. Report both aggregate agreement and agreement by slice (by prompt category, by output quality tier). An 80 percent overall agreement can hide 50 percent agreement on the most important slice.
5. Recalibrate quarterly or when anything upstream changes — new judge model, new prompt, new task distribution.

When AI-as-judge works well, the judge agrees with humans on at least the direction of preferences, even if exact scores differ. Zheng et al.[^8] reported GPT-4 agreement with human experts on MT-Bench at levels comparable to human-human agreement. If your judge and humans agree 80-plus percent of the time on pairwise preferences, the judge is a usable instrument for relative comparisons — not an oracle, but a signal. If agreement is low, the rubric is underspecified or the task is too subjective for the judge, and no amount of prompt engineering will make the scores meaningful.

::callout{type="warning"}
If you evaluate your own model with a judge from the same family, your scores are optimistic. Cross-family judging (for example, evaluating a Claude-based system with a GPT judge and vice versa) is a partial mitigation. Full mitigation requires periodic human validation against a held-out sample.
::

Use AI-as-judge for relative comparisons between system versions, for flagging regressions in CI, and for scaling spot-checks across large output volumes. Do not use it as the final word on absolute quality or for anything load-bearing (safety reviews, legal signoff, clinical decisions) without humans in the loop.

<JudgeComparator />

## Comparative evaluation

When you cannot score an output in isolation but you can tell which of two outputs is better, comparative evaluation lets you build a ranking from pairwise preferences. Humans are far more consistent at "which is better" than at "score this from 1 to 10," and the same is true of AI judges[^1][^8].

### The Bradley-Terry model

The Bradley-Terry model assigns each item (model, prompt, system) a latent skill parameter and computes the probability that item i beats item j as a function of their skills. The canonical form: `P(i beats j) = exp(s_i) / (exp(s_i) + exp(s_j))` where `s_i` and `s_j` are the latent skills. Equivalently, `P(i beats j) = 1 / (1 + exp(s_j - s_i))` — a logistic function of the skill difference. The parameters are fit by maximum likelihood from a collection of observed pairwise outcomes.

This is the statistical foundation underneath almost all modern comparative eval, including Chatbot Arena[^9]. It assumes transitivity on average (if A usually beats B and B usually beats C, then A usually beats C), which is a reasonable assumption for models on aggregate but can break for specific prompts. The model is a summary statistic, not a full description of pairwise structure.

Confidence intervals on Bradley-Terry skills come from bootstrapping the matchup set or from the Fisher information matrix. The width of the interval scales roughly with `1/sqrt(n)` where n is the number of matchups involving that model, which has implications for sample complexity we'll return to below.

### Elo updates

Elo, the rating system familiar from chess, is effectively an online approximation to Bradley-Terry. Each player has a rating. When player A with rating `R_A` plays player B with rating `R_B`, the expected score for A is `E_A = 1 / (1 + 10^((R_B - R_A) / 400))` — a logistic function, same shape as Bradley-Terry, just with a base-10 log and a scale factor that makes the numbers land in a human-readable range. After the game, ratings update: `R_A' = R_A + K * (S_A - E_A)` where `S_A` is 1 for a win, 0 for a loss, 0.5 for a tie, and K is the learning rate (32 for beginners, 16 for experts in FIDE chess, usually something like 4-8 in LLM arenas after enough games have been played).

The useful property of Elo is that it's online — you can update ratings in real time as matchups come in, without refitting anything. The trade-off is that Elo can be sensitive to the order of matchups (early games weigh more than they should if K is too high, less than they should if K is too low), and it assumes stationarity. If models actually change over time (for example, because you're updating a judge or the user population is shifting), Elo will lag the change.

A numeric example. Suppose model A has Elo 1200 and model B has Elo 1300. Expected score for A is `1 / (1 + 10^(100/400)) = 1 / (1 + 10^0.25) = 1 / (1 + 1.78) = 0.36`. If A wins, with K=16, A's new rating is `1200 + 16 * (1 - 0.36) = 1200 + 10.24 = 1210.24`. B's new rating is `1300 - 16 * (1 - 0.36) = 1289.76`. One upset win moved A up by about 10 points and B down by about 10. If A keeps winning, the gap closes quickly; if A loses the next one, much of the gain is reversed. This self-correcting property is why Elo converges.

### Chatbot Arena mechanics

Chatbot Arena[^9] runs this loop on open-web traffic. Users type a prompt, see two anonymous model outputs side by side, vote on which is better (or tie, or both bad), and the system updates Elo ratings and maintains a Bradley-Terry leaderboard. The setup is elegant — it bypasses the benchmark contamination problem (users write novel prompts), sidesteps the rubric problem (users define quality by preference), and generates volume quickly because voting takes seconds.

The gotchas are real. Sparse matchups: some model pairs get compared a handful of times, which makes the rating for those pairs noisy. Non-transitive preferences: you can observe A beats B, B beats C, C beats A in finite samples, especially when models are close in quality. Annotator drift: human preferences change over time as the user population shifts — Arena ratings can move without any model actually changing. Task skew: Arena traffic skews toward certain prompt types (coding, creative writing, casual chat) and under-represents others (long-form analysis, adversarial red-team prompts).

The biggest confound is what "better" means. A single user's preference conflates correctness, style, verbosity, and instruction-following. A model that writes more fluent prose wins against a model that answers more accurately but tersely, on some prompts — and this effect dominates enough of the signal that Arena rankings don't always predict performance on capability benchmarks. Treat Arena Elo as "which model do users find more pleasant in short interactions" rather than "which model is more capable."

### Pairwise sample complexity

How many matchups do you need to distinguish two models with a given true skill gap? The statistics are standard. If the true win rate of A over B is `p`, and you want a confidence interval of width `w` at 95 percent confidence, you need roughly `n = (1.96)^2 * p * (1 - p) / (w/2)^2` matchups. For `p = 0.55` (a 10-point Elo gap) and `w = 0.05`, you need about 380 matchups. For `p = 0.52` (a 4-point Elo gap), you need about 2,400.

Two consequences. First, small Elo gaps require enormous matchup volume to be statistically real, which is why Arena leaderboards near the top move in gaps of 3-10 points that may or may not reflect actual capability differences. Second, if you are running your own pairwise eval to compare two versions of a system, plan for at least 200-500 matchups before trusting a verdict — and more if the versions are close. Report the confidence interval, not just the win rate. A win rate of 0.58 with a CI of [0.52, 0.64] is a result; a win rate of 0.58 with a CI of [0.45, 0.70] is noise.

Comparative eval is most trustworthy when you scope it narrowly — compare two systems on a fixed prompt distribution that matches your use case, collect enough matchups to get confidence intervals, and report both the aggregate and the breakdown by prompt category. Treat a single headline Elo number with the same skepticism you treat a single accuracy number on a generic benchmark.

## Benchmark literacy

Reading evaluation tables in papers and on leaderboards is a skill, not a passive activity. A few benchmarks you will encounter constantly, and what they actually measure:

**MMLU** (Massive Multitask Language Understanding) is a multiple-choice benchmark spanning 57 subjects, from elementary mathematics to professional law and medicine[^10]. It tests broad knowledge recall and basic reasoning. Known issues include label errors in the original dataset, contamination (the test set is on the public web and very likely in many pretraining corpora), and saturation at the frontier — the top models cluster tightly near the ceiling, which makes MMLU a poor instrument for distinguishing among them. MMLU-Pro is a harder reworked version designed to push the ceiling back up, but the same contamination dynamics will catch up to it.

**HumanEval** is a set of 164 Python programming problems with hidden unit tests[^3]. A solution passes if it passes all tests. Pass-at-k is the metric — probability that at least one of k samples passes. It measures basic code generation but is small, heavily memorized by frontier models, and covers a narrow slice of real programming work (short functions, clear specs, pure logic, no external APIs). A model that "solves" HumanEval has demonstrated that it can produce syntactically valid Python for undergraduate-level problems, nothing more.

**GSM8K** is 8,500 grade-school math word problems with step-by-step solutions[^11]. It tests multi-step arithmetic reasoning under natural-language framing. Contamination has become a serious concern — the dataset is widely distributed and has almost certainly leaked into recent pretraining corpora. Many evaluations now pair it with GSM8K-Symbolic or similar variants that change surface details (names, numbers) to defeat memorization, and the gap between original-GSM8K performance and symbolic-variant performance is a useful contamination signal.

**GPQA** is a set of graduate-level science multiple-choice questions in biology, physics, and chemistry, designed to be hard to Google and to reward genuine reasoning over retrieval[^12]. Questions were written by domain experts and validated by other experts who had time to search the web; the "diamond" subset retains only questions that expert annotators got right and non-experts (with search) got wrong. It is less saturated than MMLU at the frontier, which is part of why it shows up in recent evals as a discriminator among top models.

**SWE-bench** measures whether a model, given a real GitHub issue and the corresponding repository, can produce a patch that makes the hidden test suite pass[^13]. Tasks are drawn from real Python repositories on GitHub, with issues and gold patches extracted from the commit history. This is a different shape of benchmark — agentic, tool-using, multi-file, long-horizon — and much harder to saturate than single-shot benchmarks. SWE-bench-verified is a hand-validated subset that filters out broken tasks and underspecified issues, and is the version most frequently reported for frontier models.

### How to read an eval table

When you read an eval table, do five things.

**One: check the protocol.** Zero-shot, few-shot, chain-of-thought, agentic — the same benchmark under different protocols produces very different numbers. A model scoring 45 percent zero-shot on GSM8K and 85 percent with chain-of-thought is telling you mostly about prompting, not about the model. Papers that report the impressive number without saying which protocol it came from are not worth trusting.

**Two: check what "pass" means.** Strict exact-match? Any valid answer? Partial credit? A looser definition makes numbers go up without any capability change.

**Three: check the sample.** Full test set? A subset? Random or stratified? Results on a 50-item stratified subset can differ meaningfully from results on a 1,000-item full test set.

**Four: look for contamination analysis.** Serious papers discuss it explicitly — they check n-gram overlap with pretraining data, they test on held-out subsets, they report performance on variants. The absence of contamination analysis in a paper reporting near-ceiling performance on a well-known benchmark is a tell.

**Five: ask whether the benchmark matches your workload.** A model that leads on GSM8K may not lead on whatever math your users actually ask. A model that leads on HumanEval may be worse at modifying an existing codebase, which is what you actually do with code assistants. Public benchmarks measure one thing per benchmark; your workload is a distribution; the two rarely line up.

::callout{type="warning"}
A benchmark score on a contaminated test set is an upper bound on the model's real capability, not an estimate. Treat any score near the ceiling on a widely-used public benchmark as "at least this good under ideal memorization conditions" — not as a guarantee for your workload.
::

### Benchmark saturation and the half-life problem

Every useful benchmark gets saturated. The lifecycle is predictable: a new benchmark is published, frontier models score 40 percent, the benchmark is taken seriously, labs optimize against it, scores climb to 70 percent, then 85, then 95, and by the time the top is reached the benchmark has stopped discriminating. This is not cheating — it is Goodhart's Law applied to evaluation. When a measure becomes a target, it stops being a measure.

The half-life of a public benchmark — the time from publication to saturation at the frontier — has been compressing as scaling laws play out. Benchmarks that took five years to saturate in 2019 saturate in under a year today. The implication for practitioners is that the useful frontier benchmarks next year are probably not the useful frontier benchmarks this year. Keep a running list, watch for new releases (GPQA, SWE-bench, ARC-AGI, Humanity's Last Exam), and assume that any benchmark your executive team has heard of is probably saturated.

The private-eval-set response to saturation is the correct one. Build an eval set for your workload that is not on the public web, not in any training corpus, and not shared with anyone outside your team. Run it on every model that ships. The private eval is the only benchmark whose half-life you control.

## Designing your eval pipeline

Evaluation is not a metric, it is a pipeline. Huyen breaks the work into three steps, and the steps are the same whether you are evaluating a prompt, a RAG system, or a full agent[^2].

### Evaluate components, not just end-to-end

A RAG system is a retriever, a reranker, and a generator. If end-to-end answers are wrong, you cannot tell whether retrieval missed the right chunk, the reranker pushed it out of the top-k, or the generator ignored good context. Instrument each component separately. For retrieval, recall-at-k against a labeled question-to-chunk mapping — can the retriever find the right passage in the top 10, the top 50? For reranking, precision-at-k — of the reranker's top-k, how many are actually relevant? For generation, answer quality conditional on retrieved context — when the context is right, does the generator use it correctly?

End-to-end metrics tell you whether something is broken; component metrics tell you what. A 5-point drop in end-to-end accuracy with all components otherwise stable points to the generator. A 5-point drop with retrieval recall falling in parallel points upstream. Without component instrumentation, you run bisections by intuition, which is slow and error-prone.

The same logic applies to agents, which we return to in the next section.

### Write evaluation guidelines before writing prompts

The guideline is the rubric your judges — human or AI — use to score outputs. It should be specific enough that two competent annotators looking at the same output agree on the score most of the time. Ambiguous guidelines produce noisy scores, and noisy scores are indistinguishable from a noisy model. Iterate on the guideline with real examples until inter-annotator agreement is acceptable, then freeze it[^2].

A useful sequence: draft the rubric, run it against 50 outputs with two annotators, compute agreement, look at the disagreements and revise the rubric to resolve them, repeat until agreement stabilizes. Only then do you start using the rubric for actual evaluation. Skipping this step is the single most common reason eval pipelines fail — people build elaborate judge infrastructure on top of a rubric that two humans cannot agree on, and then spend weeks trying to figure out why their numbers are noisy.

### Eval set construction

Your eval set is the workload your system has to succeed on. Treat it as seriously as the system itself.

**Source real traffic where possible.** Nothing substitutes for actual inputs from actual users. Sample from production logs, with appropriate PII handling. A synthetic-only eval set is almost always weaker than one anchored in real traffic, because synthetic data reflects your assumptions about the workload rather than the workload itself.

**Supplement with synthetic cases for coverage.** Real traffic under-represents edge cases by definition — rare failure modes, adversarial inputs, out-of-distribution queries. Generate synthetic cases to fill these gaps. A reasonable mix: 70 percent real, 20 percent synthetic for edge cases, 10 percent adversarial/red-team.

**Stratify the sampling.** If your workload has 80 percent common queries and 20 percent complex queries, but the complex ones are where the model fails, a proportional sample will be dominated by easy cases and the hard ones won't drive the metric. Oversample the hard slices and report slice-level metrics separately. This is how you notice that overall accuracy is fine while accuracy on priority-5 tickets is dropping.

**Hold out a slice entirely.** Keep a test set you never look at except at decision points. The held-out slice is the only honest signal you have about whether changes to the system are real improvements or overfitting to your dev set[^14]. Quarterly cadence is a good default — any shorter and you start unconsciously optimizing against it, any longer and you miss regressions.

**Version your eval set.** Track which cases were added when, which were retired, who labeled them, and what the inter-annotator agreement was at the time of labeling. An eval set is a living artifact, and the changes to it are load-bearing — if you compare v23 scores against v24 scores on different eval sets, you've learned nothing. Make the set versioning explicit.

### Offline vs online evaluation

Offline evaluation runs against a fixed eval set under controlled conditions. Fast, reproducible, cheap — the main mode for prompt iteration and CI regression checks. Limitation: offline scores are computed on yesterday's workload with yesterday's distribution.

Online evaluation runs against live traffic. Slower to compute, noisier, sometimes much more expensive, but the only evaluation that reflects what is actually happening in production. Online metrics include user-level signals (override rate, satisfaction, dwell time), business metrics (task-completion rate, revenue impact), and operational metrics (latency, cost, error rate).

The offline-online gap — where offline numbers improve but online numbers do not — is common and informative. It usually means the offline eval set has drifted from the live distribution, or the metric you are optimizing does not capture what users actually care about. Close the gap by periodically re-sampling the eval set from live traffic and by aligning offline metrics with online ones whenever possible.

### Shadow evaluation and regression sets

Shadow eval runs a new system in parallel with the current one, against real traffic, without using its output. It catches the things that offline eval misses: distribution shifts, prompt edge cases you didn't think of, integration bugs. Run at 1-5 percent of traffic for a few days before promoting anything to users.

Regression sets are static collections of cases that used to fail and now pass. Every time you fix a bug, add the failing input to the regression set. Every deployment runs against it. This prevents regression loops where a fix in v23 is undone by an unrelated change in v24. The regression set grows monotonically over the life of the system and becomes one of your most valuable engineering artifacts — a compressed institutional memory of everything you've gotten wrong.

::callout{type="warning"}
A regression set that never grows is a pipeline that doesn't have CI gating. If your evaluation pipeline has been running for six months and the regression set has 40 cases, either you have had no bugs (unlikely) or you have had bugs and didn't turn them into regression guards (likely).
::

The pipeline runs on every deployment. Regression is the default behavior of prompt and model changes — guardrails catch it only if the eval is automated and blocking. Make the eval a gate, not a report.

## Production evaluation

Shipping a model is not the end of evaluation. It is the point at which your metrics need to work against adversaries, non-stationarity, and a much larger sample than any offline set can carry.

### Canary and live A/B

The canary pattern is simple: when promoting a new version, route it to a small fraction of traffic first (1-5 percent), watch online metrics for a defined period (hours to days, depending on traffic volume), and either promote or roll back based on the signal. The canary is not a final test — it is a tripwire. It catches things that kill the product before everyone sees them.

Live A/B tests go further. Hold out a control cohort running the old version, expose a treatment cohort to the new one, and measure outcome differences with proper statistical controls. A/B on LLM systems is harder than on conventional product features because the thing you are changing (the model or prompt) affects every interaction the user has with the product, not a single feature. Randomization has to be at the user level, not the session level, or cross-session memory effects contaminate the result. Experiment durations have to be long enough to capture weekly seasonality and repeat-user effects, which often means two to four weeks minimum — short enough to be useful, long enough to be trusted.

Power analysis matters. If your online metric has 15 percent noise and you want to detect a 2 percent change with 80 percent power, you need a specific sample size — often more users than a small product has in a week. Compute this upfront or you will run experiments that cannot reach a conclusion.

### Drift detection

The input distribution and the output distribution of your system will both change over time, and you need instruments to notice. Input drift: a marketing campaign brings in users asking about a product you don't support well. A seasonal shift brings in more refund questions. A partner integration changes the format of incoming messages. The system's training or prompt tuning was done on yesterday's distribution, and today's distribution no longer matches.

Track input-side features: token-length histogram, topic distribution (via a classifier), language mix, channel mix, new-user ratio. Alert when any feature moves more than a defined amount from the baseline. Kolmogorov-Smirnov tests for continuous features and chi-squared tests for categorical ones give you a principled way to detect distribution shifts, though in practice most teams start with simpler threshold alerts and upgrade later.

Output drift: refusal rate starts climbing. Verbosity increases. Confidence scores cluster near thresholds. The model starts picking "other" more often on a classifier. Any of these is a signal that something has changed — either upstream (input drift), in the model itself (if the provider pushed a silent update), or in the downstream environment (a new prompt feature that interacts badly with the model).

### User feedback as signal

Users give you feedback whether you ask for it or not. Explicit signals: thumbs-up/down on responses, star ratings, free-text comments, report-this-response buttons. Implicit signals: whether the user copies the answer, whether they ask a follow-up that reformulates the question (a sign the first answer missed), whether they abandon the session, whether they pay again next month.

The right pipeline pulls all of this into the eval system. Thumbs-down responses get sampled into a triage queue. Recurring failure patterns become test cases. High-friction sessions get annotated and added to the regression set. The feedback loop from user → log → eval set → prompt change → deploy is the loop that makes the system get better instead of drift downward.

Be careful with one thing: user feedback is not unbiased. Users complain more than they praise, specific topics attract more vocal feedback than others, and a small number of power users can dominate the signal. Stratify feedback analysis the same way you stratify offline eval — by intent, by user tier, by session length — or you'll chase a minority's complaints and miss the silent majority's drift.

### The offline-online gap

Almost every production LLM team I've seen has an offline-online gap. Offline metrics say the new prompt is 4 points better; online metrics show no change, or a small decline. The gap has several sources: offline eval sets drift from live distribution, offline metrics don't capture things users care about (latency, tone, verbosity), the judge in offline eval is biased in ways the user isn't, or the online metric is noisy enough that the real improvement is buried.

Close the gap in two directions. One: refresh the eval set monthly by sampling new production traffic and replacing stale cases. Two: add offline metrics that approximate online ones — an AI-judge-based "would a user re-ask this?" score for answer-quality, a latency budget check, a verbosity percentile. When offline and online move together, your pipeline is calibrated. When they don't, the gap is telling you what your offline metrics are missing.

::callout{type="warning"}
A prompt change that looks like a win offline but doesn't move online metrics is not automatically a win. Treat it as a puzzle. Either your offline eval is measuring the wrong thing, or the online signal is too noisy to detect the improvement. Both require fixing — not ignoring.
::

## Evaluating agents

Agents introduce an evaluation problem that static benchmarks barely touch: their outputs are not answers, they are trajectories. An agent processes a task by planning, calling tools, observing results, revising, and eventually producing a final output. Evaluating only the final output misses most of what made the trajectory good or bad.

### End-to-end evaluation

The simplest thing is to score the final output against the task. Did the agent solve the issue? Did it book the flight? Did it produce a working patch? SWE-bench works this way[^13] — the only metric is whether the final patch makes the test suite pass. This has the virtue of being objective: if the tests pass, the agent succeeded, regardless of how ugly the trajectory was.

End-to-end eval is the right primary metric for agents. It measures the thing you care about. But it is insufficient on its own because it conflates a huge number of possible failure modes and gives you no signal for where to improve. An agent with 30 percent task success on SWE-bench is telling you the ceiling; it is not telling you whether the problem is planning, tool use, reasoning about errors, or code generation. You need per-step metrics for the improvement loop.

### Per-step evaluation

Per-step metrics instrument each component of the trajectory. For an agent that plans, calls tools, and generates code, useful per-step metrics include:

**Plan quality.** Did the agent propose a plan that could have worked if executed correctly? Measure by having an AI judge (or a human annotator for calibration) score plans against the task, independently of whether execution succeeded.

**Tool call correctness.** For each tool call, was the tool choice appropriate? Were the arguments correct? If the tool returned an error, did the agent recover? Tool-call accuracy breaks down into: (a) did the agent pick the right tool, (b) did it pass valid arguments, (c) did it interpret the result correctly.

**Error recovery.** When a tool fails, does the agent diagnose and retry, or does it escalate or give up? Measure retry success rate and time-to-recovery.

**Efficiency.** How many steps did the agent take? How many tool calls? Did it re-read the same file three times? Step efficiency is a proxy for whether the agent's reasoning is getting lost or circling.

**Final output quality.** Conditional on the plan being reasonable and the tool calls being correct, is the final output correct? This is the last-mile metric that tells you whether the agent's synthesis step is working.

A trajectory with a great plan, correct tool calls, and a wrong final output tells you the synthesis step is broken. A trajectory with a bad plan but correct recovery tells you the agent is compensating for planning weakness with reactive behavior — valuable, but fragile. You cannot see these patterns in end-to-end metrics alone.

### Trajectory-level aggregation

With per-step metrics in hand, aggregate them to the trajectory and to the task. For a trajectory of N steps, you can compute step-level accuracy, weighted step accuracy (weighting critical steps higher), and min-step accuracy (the worst step, which often predicts trajectory outcome). At the task level, bucket trajectories into success, partial-success, and failure, and for failures, run a root-cause attribution: which step was the proximate cause?

Root-cause attribution is the core diagnostic of agent eval. When a task fails, you want to know: was it a bad plan, a tool error that the agent failed to recover from, a synthesis mistake, or a hallucinated constraint that the agent invented? A healthy agent system has a root-cause distribution you understand and can target for improvement. An unhealthy one has root causes all over the map, which usually means the agent is making novel mistakes faster than you can fix them — a sign that the task is too far outside the system's competence.

### Environments and simulators

Evaluating agents often requires an environment — a sandboxed system where the agent can call tools, observe results, and have its actions be reversible. SWE-bench uses Docker containers per task. Tool-use benchmarks use stubbed APIs or real APIs with rate limits. Web-agent benchmarks use headless browsers against mocked or real websites.

Environment fidelity matters. A toy environment with unrealistic tools produces agent behavior that doesn't transfer. An overly-realistic environment with flaky dependencies produces noise that swamps the agent signal. The right level of fidelity is one where environment bugs are rare enough that they don't dominate the failure distribution but realistic enough that the agent is doing real work.

### Cost and latency in agent eval

Agents burn tokens. A long trajectory can cost 50-100x what a single-shot response costs, and latency scales with step count. Any agent eval that ignores cost and latency is reporting half the story. Track dollars per successful task and p95 time per task alongside success rate. A 5-point gain in success rate that triples cost may or may not be a win depending on the use case. For background automation (overnight triage, bulk processing), cost matters more than latency. For user-facing agents (support, coding assistants), latency dominates.

## What's next

Evaluation is the instrument you use to make everything else trustworthy. The next two topics build on it: **RAG and Agents** composes retrieval, tools, and generation into systems whose correctness depends on the component-level evals described here, and **Production** covers the observability, monitoring, and human-in-the-loop patterns that keep evaluation honest once the system is serving real traffic.

## Sources

[^1]: Huyen, Chip. *AI Engineering: Building Applications with Foundation Models.* O'Reilly, 2024. Chapter 3, "Evaluation Methodology," covers perplexity, exact-match metrics, AI-as-judge bias taxonomy, and comparative evaluation.

[^2]: Iusztin, Paul, and Maxime Labonne. *The LLM Engineer's Handbook.* Packt, 2024. Production evaluation, monitoring, and drift detection patterns from the production-ML perspective.

[^3]: Chen, Mark et al. "Evaluating Large Language Models Trained on Code." arXiv:2107.03374, 2021. Introduces HumanEval and pass@k metric.

[^4]: Austin, Jacob et al. "Program Synthesis with Large Language Models." arXiv:2108.07732, 2021. Introduces MBPP (Mostly Basic Python Problems).

[^5]: Papineni, Kishore, Salim Roukos, Todd Ward, and Wei-Jing Zhu. "BLEU: a Method for Automatic Evaluation of Machine Translation." ACL 2002. Original BLEU paper with n-gram precision and brevity penalty.

[^6]: Lin, Chin-Yew. "ROUGE: A Package for Automatic Evaluation of Summaries." ACL Workshop on Text Summarization Branches Out, 2004. Original ROUGE paper with N-gram recall and longest-common-subsequence variants.

[^7]: Zhang, Tianyi, Varsha Kishore, Felix Wu, Kilian Q. Weinberger, and Yoav Artzi. "BERTScore: Evaluating Text Generation with BERT." ICLR 2020. Embedding-based similarity metric.

[^8]: Zheng, Lianmin et al. "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena." NeurIPS 2023 Datasets and Benchmarks. The canonical paper on AI-as-judge calibration, position bias, verbosity bias, and agreement with human raters.

[^9]: Chiang, Wei-Lin et al. "Chatbot Arena: An Open Platform for Evaluating LLMs by Human Preference." arXiv:2403.04132, 2024. Bradley-Terry and Elo mechanics applied to open-web LLM matchups.

[^10]: Hendrycks, Dan et al. "Measuring Massive Multitask Language Understanding." ICLR 2021. MMLU benchmark spanning 57 subjects.

[^11]: Cobbe, Karl et al. "Training Verifiers to Solve Math Word Problems." arXiv:2110.14168, 2021. Introduces GSM8K, 8.5k grade-school math word problems.

[^12]: Rein, David et al. "GPQA: A Graduate-Level Google-Proof Q&A Benchmark." COLM 2024. Expert-validated graduate-level science questions designed to resist retrieval.

[^13]: Jimenez, Carlos E. et al. "SWE-bench: Can Language Models Resolve Real-World GitHub Issues?" ICLR 2024. Agentic benchmark using real GitHub issues and hidden test suites.

[^14]: Iusztin, Paul, and Maxime Labonne. *The LLM Engineer's Handbook.* Packt, 2024. Held-out-set discipline and eval-set versioning in production pipelines. Additional context from Ofir Press et al.'s *Hands-On Large Language Models* on production eval orchestration.
