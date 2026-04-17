---
id: finetuning
order: 05
title: Finetuning
subtitle: When to, when not to. LoRA math, quantization, multi-task merging — with the memory budget
topic: finetuning
difficulty: advanced
estimatedReadMinutes: 48
hero: false
primitives:
  - memory-calculator
  - lora-rank-viz
citations:
  - { book: huyen-aie, chapters: "Ch. 7", topic: "finetuning fundamentals" }
  - { book: raschka-from-scratch, chapters: "Appendix + fine-tuning chapters", topic: "code-level finetuning" }
  - { book: hands-on-llms, chapters: "fine-tuning chapters", topic: "practical finetuning" }
  - { book: iusztin-labonne-handbook, chapters: "training/deployment", topic: "production fine-tunes" }
tags: [finetuning, lora, qlora, quantization, peft]
updatedAt: 2026-04-17
---

Finetuning is the most misunderstood lever in the AI engineering stack. Teams reach for it because it feels like "real ML work" — and end up spending weeks on a training run that a better prompt and a retrieval pipeline would have solved in an afternoon. The honest default is the opposite of the instinct: **don't finetune unless you've exhausted prompting and retrieval first**[^1].

This topic is the map of when the exception is justified, what it actually costs in GPU memory, and how modern parameter-efficient methods (LoRA, QLoRA) reshape that cost curve. It walks a single concrete example — adapting a 7B base model to summarize legal documents — from the decision of whether to finetune at all, through the memory math, through LoRA rank selection and QLoRA quantization, through data preparation and training tactics, through post-training alignment and finally model merging. Along the way it names the failure modes that kill real projects: catastrophic forgetting, overfitting on thin data, reward hacking, mode collapse.

The structure is deliberately linear. The decision section comes first because most readers should stop there and go build a better RAG system instead. The memory section comes next because without a clear-eyed view of the accounting identity that governs GPU RAM, no amount of PEFT cleverness makes sense. Only then do LoRA, QLoRA, and the rest of the PEFT family earn their place.

## Running example: a legal-summarization finetune

To keep the rest of this topic from drifting into abstractions, every decision below will be grounded in one concrete scenario. A mid-size firm wants to produce five-paragraph executive summaries of long civil filings — pleadings, motions, briefs — in a specific voice with a specific structural template. They have roughly 3,000 historical `(filing, human-written summary)` pairs curated by paralegals over the last two years, plus access to a 7B open-weights base model. They have a single workstation with one 24 GB GPU (a consumer RTX 4090 or equivalent) and a budget for maybe one cloud-GPU training run per month. The summaries must follow their house format rigidly and cannot hallucinate case citations.

This scenario is representative for two reasons. First, it clearly mixes the two things finetuning and RAG are good at: *behavior* (the five-paragraph structural format, the firm's voice, the citation discipline) and *knowledge* (the specific filing the summary is about, relevant statutes, local rules). Second, it is the kind of project that constantly fails in practice for the same handful of reasons — too small a dataset to generalize, catastrophic forgetting of general legal reasoning, memorization of training filings, or model merging that blows up capability when the LoRA is combined with a safety adapter. The rest of this topic keeps returning to this scenario and naming the concrete decision the team would make at each step.

The decomposition that will drive everything downstream:

- The *format* — five paragraphs, ordered facts → procedural posture → arguments → relief → disposition — is behavior. Finetunable.
- The *voice* — measured, non-adversarial, domain-appropriate — is behavior. Finetunable.
- The *citation discipline* — never invent a citation, always ground in the filing — is partly behavior (refusing to fabricate) and partly knowledge (knowing which cites exist). The refusal is finetunable; the cite-grounding is retrieval.
- The *actual case facts* — what the motion says, who the parties are, what relief is sought — is knowledge. Retrieval.

So the shape of the eventual solution is *not* pure finetune or pure RAG. It is a LoRA adapter on the 7B base for format/voice/discipline, with a RAG pipeline that injects the current filing (and potentially local rules) into every prompt. This is almost always the answer, and it is the answer for this scenario too.

A few additional constraints worth flagging up front, because they shape every later decision:

- **Regulated output.** The firm's partners must be able to defend every summary against the underlying filing. The model cannot introduce claims not in the source, and it cannot miss a dispositive fact. This rules out "creative paraphrase" behavior that general chat models default to, and it raises the bar on test-set construction — the test cannot just be "do the summaries read well," it must be "is every factual claim verifiable against the source."
- **Latency sensitivity.** Paralegals produce 50–200 summaries per day across the firm. Per-summary latency of 30 seconds is tolerable; 5 minutes is not. This pushes toward self-hosted inference on a small model rather than API calls to a larger general one, which in turn makes the finetune economically attractive even before quality considerations.
- **Security.** Filings contain privileged work product. A cloud API route is possible but requires data-handling agreements; self-hosting on firm infrastructure sidesteps the issue entirely. This again pushes toward a smaller, self-hosted, finetuned model.
- **Explainability.** When a partner questions a summary, the team must be able to point to which sentence in the filing justifies which claim in the summary. This is a retrieval-and-citation problem, not a finetuning problem — but it shapes the prompt template, because the finetuned model must be trained to emit summaries with explicit grounding references, not free-form paraphrases.

Each of these constraints will cash out in a concrete engineering decision later in the topic. The goal of introducing them here is to make clear that "we want to finetune" is the tail end of a much longer reasoning chain. Teams that skip that chain and jump straight to training almost always re-discover one of these constraints three weeks into the project, at which point the initial plan is wrong and has to be rebuilt.

## When to finetune, when NOT to

The RAG-first rule exists because the economics are brutal. A finetune has fixed cost (training compute, engineer time, eval infrastructure), ongoing cost (data drift, retraining cadence, hosting a custom checkpoint), and switching cost (you're now off the foundation model's upgrade train). A prompt change has none of that[^1].

Finetune when you hit one of these walls:

- **Behavior can't be prompted.** The model follows a specific output format, tone, or policy that's too long or too finicky to fit in every prompt. You've tried few-shot with 8+ examples and it still drifts. The legal-summarization house format is exactly this kind of thing — you can get the model 70 percent of the way there with a system prompt and three in-context examples, but the last 30 percent of structural consistency never comes without training.
- **Latency or cost is the bottleneck.** A smaller finetuned model matches the quality of a larger general model at a fraction of the per-token cost. This is the most defensible reason to finetune in production[^1]. A finetuned 7B can often match a prompted 70B on a narrow task, which is a ~10x cost savings that compounds every request.
- **Domain vocabulary is out of distribution.** Medical, legal, or internal-jargon-heavy inputs where tokenization and base priors are genuinely wrong — not just unfamiliar.
- **You need reliable structured output.** Constrained decoding plus a finetune on your schema beats prompting for complex JSON/XML under load.

Do NOT finetune for:

- **Factual knowledge updates.** New facts, changing documents, per-customer data — all of this belongs in retrieval. Training bakes knowledge in at a snapshot; your users' world keeps moving[^1].
- **"The model needs to know our product."** It doesn't. Put the product docs in RAG.
- **One-off format requirements you haven't actually tried prompting for.** Write the prompt first.

::callout{type="warning"}
**The RAG-first rule is not about purity, it's about ownership cost.** Every finetuned checkpoint you ship is a model you now maintain forever. Prompts and retrieval indexes are cheap to iterate; weights are not.
::

Huyen's framing: finetuning changes **behavior**, retrieval provides **knowledge**[^1]. If you can't cleanly say which side your problem falls on, it's almost always knowledge, and retrieval is the answer.

### A concrete decision tree

The legal-summarization team, before writing a single line of training code, should walk the following decision tree. It is the one you should walk for any candidate finetune.

1. **Have you tried a clear, well-structured prompt with few-shot examples?** If no, stop. Go do that. Budget at least a full day of prompt iteration with real examples before considering finetuning. For the legal team, this means writing a system prompt that specifies the five-paragraph format explicitly, including eight to twelve diverse training summaries inline, and measuring quality with a small eval set.
2. **Does adding RAG fix the remaining gap?** If the failures are "it doesn't know about this specific case," "it gets statute numbers wrong," "it misses relevant procedural history" — all knowledge failures — then the answer is better retrieval, not finetuning. Measure this: build the smallest plausible RAG pipeline (document embedding, top-k retrieval, context injection) and rerun the eval. If prompting + RAG hits target quality, ship that and stop.
3. **What's the residual gap?** If prompting + RAG gets you to 80 percent but you need 95 percent, now you have a real finetuning candidate — but only if the residual gap is in *behavior* (format consistency, voice, refusal discipline, structural reliability), not *knowledge* (getting the facts right about a specific document).
4. **Do you have enough data?** The practical floor is around 1,000 high-quality examples for behavior finetuning; the legal team's 3,000 is comfortably over that but not a lot. If you have 100 examples, you do not have enough data to finetune — you have enough examples to turn into a few-shot prompt bank.
5. **Is the behavior stable over time?** Finetuning bakes a snapshot. If the house format changes every quarter, every retrain costs. For the legal team, the summary format has been stable for two years, so this is fine.
6. **Can you afford the ongoing cost?** Every finetuned checkpoint is a model you now maintain. Plan for retraining every 3–6 months at minimum as base models improve and your data grows.

Only after all six questions come back in favor of finetuning should any training code be written.

### The break-even math

The economic argument for finetuning usually looks like this. Suppose prompted inference on a large general model costs $X per million tokens and a finetuned smaller model costs $Y per million tokens, with $Y ≪ $X$. The finetune costs $T$ dollars in training plus some engineer time. The break-even point is when the cumulative token-cost savings exceed $T$.

Concretely, for the legal team: suppose prompted inference on a strong 70B general model through an API costs roughly 10x more per token than self-hosted inference on a finetuned 7B. If the team processes 500k tokens per day in summaries (100 filings a day at 5k tokens each input plus roughly 1k tokens output), that's 15M tokens per month. If the per-token savings is $0.01 per 1k tokens (ballpark — don't trust a specific number without pricing your own provider and hosting stack), the monthly savings is $150. A finetune that costs $500 in cloud GPU plus an engineer-week pays back in under a year on the variable costs alone, before counting latency or SLA improvements.

But flip the example. If the team only summarizes five filings a day, the monthly token volume is 750k tokens, monthly savings are maybe $7.50, and the finetune never pays back. The RAG + prompt route is correct.

The point is not to trust any specific number but to do the math *before* training, not after.

## Finetuning vs RAG vs prompt engineering — the decision

A useful decomposition before you commit:

| Axis | Points to prompt | Points to RAG | Points to finetune |
|------|-----------------|---------------|--------------------|
| Information changes often | Sometimes | Yes | No |
| Users need citations / provenance | No | Yes | No |
| Problem is "how to respond" not "what to know" | Partial | No | Yes |
| Latency budget is tight and model is large | No | No | Yes |
| Small training set (<1k high-quality examples) | Yes | Yes | Risky |
| Must run on-device or air-gapped | Sometimes | Sometimes | Often yes |
| Behavior is stable over 6+ months | Doesn't matter | Doesn't matter | Yes |
| You have 3+ months to iterate and maintain | Not required | Minor | Yes |

The split Huyen draws is worth memorizing: **static knowledge goes in retrieval; style, format, and latency go in weights**[^1]. Prompt engineering covers the short tail of both — when either the knowledge or the behavior is small enough to fit in-context.

Most production systems end up doing both. A common shape: a LoRA-adapted small model for tone and format consistency, with a RAG pipeline for the actual facts[^4]. The finetune handles "how we talk"; retrieval handles "what's true right now."

A less discussed failure mode: teams finetune on top of RAG-retrieved context and expect the model to "learn to use retrieval better." It usually doesn't. What it learns is to memorize the specific passages in the training set. If you want better retrieval behavior, fix retrieval.

Another failure mode worth naming: teams use finetuning as a substitute for *writing a clear prompt*. They have a vague spec, try a mediocre prompt, see mediocre output, and jump to training as if training will infer the spec from examples. It will, sort of — but it will also infer all the noise and inconsistency in your examples. A clean prompt with a clean few-shot bank reveals the true capability of the base model, which is the baseline every finetune must improve on.

## Memory math

Why full fine-tuning a 7B model is a non-starter on a single consumer GPU — and why PEFT exists — reduces to one accounting identity.

During backprop, GPU memory holds four things:

1. **Model weights** — the parameters themselves.
2. **Gradients** — one per trainable parameter, same dtype as weights.
3. **Optimizer state** — Adam stores first and second moments (two extra tensors per parameter), typically in FP32.
4. **Activations** — intermediate tensors saved for the backward pass. Scales with batch size × sequence length × depth.

The common rule of thumb for **full fine-tuning with Adam in mixed precision** is that you need roughly **4x the model size in GPU memory**, before activations[^2]. The breakdown:

- Weights (FP16): 2 bytes/param
- Gradients (FP16): 2 bytes/param
- Optimizer state, Adam m + v (FP32 each): 8 bytes/param
- Plus a master FP32 copy of weights in mixed precision: 4 bytes/param

That totals ~16 bytes/param. For a 7B model that's ~112 GB **before activations** — which is why full fine-tuning a 7B model does not fit on a single 80GB A100, let alone a 24GB consumer card. Activations can easily add tens of GB more depending on sequence length and batch size.

The per-component walk for a 7 billion parameter model:

- Weights in FP16: 7e9 × 2 bytes = 14 GB.
- Gradients in FP16: 7e9 × 2 bytes = 14 GB.
- Adam first moment `m` in FP32: 7e9 × 4 bytes = 28 GB.
- Adam second moment `v` in FP32: 7e9 × 4 bytes = 28 GB.
- FP32 master weights (required in mixed-precision training to maintain numerical stability of the optimizer update): 7e9 × 4 bytes = 28 GB.

Summing: 14 + 14 + 28 + 28 + 28 = 112 GB. Add activations — which depend on batch size, sequence length, and the number of hidden states retained for backward — and you are comfortably in 140–180 GB territory for any non-trivial batch.

The legal-summarization team's 24 GB card can fit a 7B model's weights in BF16 with room to spare (14 GB). It cannot fit gradients, let alone the Adam state. So the team has three options: shrink the model, shrink the optimizer state, or shrink the trainable-parameter count. PEFT — specifically LoRA and QLoRA — takes the third route hard and partially the first. This is why PEFT exists.

<MemoryCalculator />

The levers to shrink this bill:

- **Lower precision weights.** FP16/BF16 is already standard; INT8 and 4-bit (QLoRA) push further. Going from FP16 to INT4 for the frozen base weights alone takes the 7B from 14 GB to roughly 3.5 GB — enough headroom that the rest of the training state can fit on consumer hardware.
- **Optimizer state reduction.** 8-bit Adam (bitsandbytes) stores `m` and `v` in 8 bits, roughly halving optimizer memory. Paged optimizers push further by offloading state to CPU on memory spikes.
- **Gradient checkpointing.** Recompute activations during backward instead of storing them. Trades compute for memory — typically 30 percent slower training for much less activation memory.
- **Freeze most of the model.** Only train a small adapter — this is what PEFT does. Because gradients and optimizer state scale with *trainable* parameters, freezing 99 percent of the model cuts the gradient and optimizer footprint by 100x, which is the core of why QLoRA collapses the 112 GB number into something that fits on a single consumer GPU.

Quantifying the QLoRA collapse for the 7B legal model:

- Frozen base weights in 4-bit NF4: 7e9 × 0.5 bytes = 3.5 GB.
- Quantization constants (with double quantization) add roughly another 0.1–0.3 GB depending on block size — small but nonzero.
- LoRA adapter parameters (rank 16 on all attention projections + MLP, roughly 0.5–1 percent of base): ~35–70M trainable parameters.
- Adapter weights in BF16: ~0.07–0.14 GB.
- Adapter gradients in BF16: another ~0.07–0.14 GB.
- Adapter optimizer state (paged 8-bit Adam): ~0.14–0.28 GB.
- Activations with gradient checkpointing and a reasonable batch size: typically 4–10 GB.

Total: roughly 8–15 GB, comfortably under 24 GB. That is the essential magic of QLoRA: the base model's parameter count stops dominating the memory bill once the weights are in 4 bits and the optimizer state is scoped to only the adapter.

The last lever is the biggest one by far, and the reason the rest of this topic exists.

## Parameter-efficient fine-tuning (PEFT)

The PEFT family rests on a simple observation: full fine-tuning updates billions of parameters, but the **effective change** — the direction the weights move — lies on a much lower-dimensional subspace. If you can parameterize just that subspace, you can get most of the quality for a fraction of the memory.

### LoRA

LoRA (Hu et al. 2021) freezes the base model weights `W` entirely and learns a low-rank update `ΔW = B·A`, where `A ∈ ℝ^(r×k)` and `B ∈ ℝ^(d×r)` with `r ≪ min(d, k)`[^3]. The forward pass becomes:

```
h = Wx + BAx
```

`W` stays frozen; only `A` and `B` are trained. At inference time, `BA` can be merged back into `W` for zero added latency, or kept separate to swap adapters.

The theoretical justification is the **intrinsic low-rank hypothesis**: over-parameterized models adapted to a downstream task have low intrinsic dimensionality, so a low-rank update is sufficient[^3]. The implication is not "the model is low-rank" but "the *delta* from base to task-specialist is low-rank," which is a weaker and empirically well-supported claim.

The parameter savings are dramatic. For a single attention projection matrix at hidden dimension `d = 4096`, a full update has `d^2 = 16.8M` parameters. A rank-8 LoRA update has `2 × r × d = 65,536` parameters — a 256x reduction. Across all the attention projections in a 7B model, LoRA at rank 8 might train well under 1 percent of base parameters while matching full-finetune quality on the behaviors PEFT targets.

<LoRARankViz />

Key choices, in the order they actually matter:

- **Rank r.** The Hu et al. paper showed that surprisingly small ranks (r = 4–8) work for many tasks[^3]. Higher rank gives more capacity but more parameters. In practice, teams sweep r ∈ {4, 8, 16, 32, 64} and pick the smallest that hits target quality. The intuition: small rank = narrow subspace = less capacity to shift behavior, but also less capacity to overfit on small datasets. For the legal-summarization team with 3,000 examples, rank 8 or 16 is a sensible starting point; rank 64 risks overfit. Rank 4 is a useful sanity check — if rank 4 gets close to rank 32, the residual capacity isn't doing meaningful work and you can prefer the smaller adapter.
- **Which layers to adapt.** The original paper found attention projections (`W_q`, `W_v`) were the highest-leverage targets[^3]. Modern practice extends LoRA to all linear layers (attention Q/K/V/O plus MLP up/down/gate) when memory permits[^5]. The Q/V-only recipe is a memory-conscious default that still captures most of the effect; all-linear is the "use everything" recipe and tends to hit slightly higher peak quality at the cost of more trainable parameters. For the legal team, starting with Q/V at rank 16 is sensible; moving to all-linear at rank 8 trades breadth for depth with similar total parameters.
- **Alpha (scaling).** `ΔW` is scaled by `α/r` at the forward pass. A common heuristic is `α = 2r` (so the effective scaling is 2) but this is tuning, not law. Practitioners sometimes fix `α = 16` or `α = 32` and sweep `r` — this keeps the scaling implicitly coupled to rank, which empirically reduces the need to retune the learning rate when changing rank.
- **Learning rate.** LoRA's adapter tends to want a higher learning rate than full fine-tuning (1e-4 to 5e-4 is common) because the adapter parameters start at zero (via `B = 0`, `A` Gaussian) and need to move further relative to initialization. Full fine-tuning usually sits one to two orders of magnitude lower (1e-5 to 5e-5). If you use a fixed alpha and sweep rank, remember that effectively scaling `α/r` changes the effective step size at rank boundaries — you may need to bump LR when `r` grows.

The trainable-parameter reduction is dramatic — LoRA typically trains well under 1% of the base parameters. Memory for gradients and optimizer state scales with *trainable* parameters, which is where the savings compound.

A practical pattern worth naming: the team can *train* multiple task-specific LoRAs against a single frozen base, then serve them as swappable adapters. For the legal team, this could eventually mean one LoRA for civil summaries, another for criminal, another for appellate, all on the same base 7B. Adapter storage is small — tens of megabytes each — and at inference the serving framework picks the right adapter for the request type.

### QLoRA

QLoRA (Dettmers et al. 2023) stacks two ideas: **4-bit NF4 quantization** of the frozen base model, plus LoRA adapters trained in higher precision on top[^6].

Three contributions worth knowing:

1. **NF4 (Normal Float 4)** — a 4-bit data type theoretically optimal for weights that are approximately normally distributed, which LLM weights roughly are[^6]. Rather than spacing quantization levels uniformly (INT4) or on a floating-point grid (FP4), NF4 spaces them so that each bucket holds roughly equal probability mass under a standard normal — more resolution where weights actually cluster, less where they don't. This is why NF4 preserves model quality better than naive INT4 at the same 4-bit budget.
2. **Double quantization** — the quantization constants themselves get quantized, saving additional memory. Each block of weights has a scale factor; in NF4 the block size is 64 by default, so there's one FP32 scale per 64 weights. Double quantization stores these scales themselves in 8-bit blocks with a second-level FP32 scale per 256 first-level scales, saving roughly 0.5 bit per weight on average. Not huge, but compounding.
3. **Paged optimizers** — NVIDIA unified memory to page optimizer state between GPU and CPU on memory spikes. When gradient checkpointing causes transient spikes in optimizer memory, the driver transparently pages the quiescent portions to CPU RAM and pulls them back on demand. This prevents OOM crashes during brief peaks without permanently moving state off-GPU.

The result: models that would require many GPUs for full fine-tuning fit on a single consumer card via QLoRA, with the adapter trained in BF16 while the frozen base sits in 4-bit. The Dettmers paper demonstrated that QLoRA preserves task performance relative to 16-bit full fine-tuning on the benchmarks they tested[^6] — concretely, they finetuned 33B and 65B models on a single 48 GB GPU and 65B on a 24 GB GPU, recovering full-finetune-level quality on MMLU within the error bars of the eval. The paper's "Guanaco" family, trained via QLoRA, reached competitive scores on Vicuna benchmarks at a fraction of the compute of comparable RLHF pipelines.

For the legal team this is the enabling technology. Full-finetuning 7B on their 24 GB card is flat impossible; LoRA in BF16 is marginal (the frozen base eats 14 GB and adapter state plus activations can push close); QLoRA with 4-bit base drops the frozen weight footprint to ~3.5 GB and leaves comfortable headroom for adapter training at rank 16–32 with decent batch size and sequence length.

### Other PEFT methods

- **Prefix / prompt tuning** (Li & Liang 2021, Lester et al. 2021) — prepend learned vectors to the input at each layer (prefix tuning) or just the embedding layer (prompt tuning)[^7]. Very few trainable parameters (often well under 0.1 percent of base); generally weaker than LoRA on complex tasks but competitive on simpler classification or style transfer when the base model is large (100B+). Prompt tuning specifically scales well with base model size — the gap to full fine-tuning closes as the base grows, which is why it's still relevant in the frontier-scale regime. For mid-size models in the 7–70B range, LoRA beats it on most behavior tasks.
- **IA3** (Liu et al. 2022) — Infused Adapter by Inhibiting and Amplifying Inner Activations[^8]. Rather than learning low-rank updates, IA3 learns per-channel scaling vectors on keys, values, and intermediate MLP activations. Extremely parameter-efficient (roughly 3x fewer parameters than LoRA at equivalent ranks) and competitive on T0-style multi-task benchmarks. Less flexible than LoRA for deep behavioral shifts, since multiplicative scaling can't add new directions to the weight matrix, only attenuate or amplify existing ones. Worth considering when adapter size or latency matters more than expressiveness.
- **Adapters (Houlsby-style)** — insert small bottleneck MLPs between transformer layers. Historical predecessor to LoRA; adds inference latency unless merged. Mostly superseded by LoRA for generative LLM finetuning.

In 2026 practice, LoRA and QLoRA are the defaults; the others are niche unless you have a specific constraint[^5]. IA3 is the interesting exception — it is the right choice when you need to ship dozens of micro-adapters and adapter size truly dominates the budget. Prompt tuning is the right choice only on very large frozen models where the scaling advantage pays off.

**When each wins, in one sentence each:**

- LoRA: your default for mid-size models, behavior finetuning, and moderate data (1k–100k examples).
- QLoRA: LoRA when you are GPU-poor and need to fit the base model in 4-bit.
- IA3: you need the smallest possible adapter and the task doesn't need new directions in weight space.
- Prefix tuning: you're on a frontier-scale base and want to preserve full weight invariance.
- Prompt tuning: same as prefix, but simpler, and only at very large base sizes.

## Quantization fundamentals

Quantization maps floating-point weights to lower-bit integer or custom formats. The engineering tradeoff is always the same: memory and throughput vs. quality.

### Formats in common use

- **INT8** — 8-bit integer. Well-supported, small quality impact on most models, ~2x memory reduction from FP16. Typically stored with a per-tensor or per-channel scale and (optionally) zero-point, following the formula `x_quant = round(x / scale) + zero_point`, with dequantization `x = (x_quant - zero_point) * scale`. Symmetric quantization (zero-point fixed at 0) is simpler and faster but wastes range if the distribution isn't zero-centered; asymmetric (non-zero zero-point) uses range better at modest cost. Activations commonly use asymmetric; weights commonly use symmetric.
- **INT4 / 4-bit integer** — more aggressive, requires careful calibration and often group-wise scaling. A naive per-tensor INT4 scale loses too much resolution; group-wise scales (typically one scale per 128 or 64 weights) preserve local precision at the cost of some storage overhead.
- **FP4** — 4-bit floating point. Preserves dynamic range better than INT4 for some distributions because the floating-point grid has denser resolution near zero (where most weight mass sits).
- **NF4** — the QLoRA format, designed for normally distributed weights[^6]. Spacing is chosen so each bucket holds equal probability mass under a standard normal. Outperforms both INT4 and FP4 on LLM weights at the same 4-bit budget.

### Bit packing and storage layout

At 4 bits per weight, two weights fit in one byte. Quantized weight tensors are therefore stored packed — the low nibble holds one weight, the high nibble holds the next. Dequantization involves a shift and mask per pair. GPU kernels (bitsandbytes, GPTQ inference kernels) fuse this with the matmul so there is no explicit dequantization pass.

Group-wise quantization adds overhead: one FP16 or FP32 scale per group of (say) 128 weights. At a 4-bit payload this is ~0.25 bits of scale per weight on average. Double quantization (NF4-style) compresses these scales themselves to recover some of that overhead.

Zero-points are a separate overhead: for asymmetric schemes, one integer zero-point per group. In practice many LLM quantization recipes use symmetric quantization specifically to skip the zero-point and reduce group overhead, accepting the range inefficiency as the price.

### Calibration datasets

Calibration datasets matter for post-training quantization (PTQ). The calibration set is used to compute scaling factors per layer or channel; a mismatch between calibration data and deployment data is a common source of silent quality regression[^1].

A typical calibration set is a few hundred to a few thousand representative samples — not a training set, not a full eval set, just enough to estimate activation statistics accurately. The legal-summarization team, when they eventually quantize their finetuned model for deployment, should calibrate on actual filings from their domain, not on generic web text. Calibrating on C4 and deploying on legal documents is the recipe for unexplained quality loss on deployment that no one can pin down.

### GPTQ vs AWQ vs SmoothQuant

Three common PTQ methods worth distinguishing:

- **GPTQ** (Frantar et al. 2022) — approximate second-order quantization method that minimizes output error of each weight matrix using a small calibration set[^9]. Quantizes layers one at a time; within a layer, updates unquantized weights to compensate for rounding error in already-quantized weights. Delivers strong 4-bit quality on LLMs at modest calibration-time cost.
- **AWQ** (Lin et al. 2023) — Activation-aware Weight Quantization[^10]. Observation: a small fraction of weight channels (those corresponding to large-magnitude activations) matter disproportionately to output quality. AWQ scales weights before quantization to protect these "salient" channels, then quantizes the scaled weights. Fast and strong; tends to preserve quality better than GPTQ at very low bit widths.
- **SmoothQuant** (Xiao et al. 2023) — targets the *activations* problem, not just weights[^11]. LLM activations have outlier channels that make low-bit activation quantization brittle. SmoothQuant migrates the quantization difficulty from activations to weights via a per-channel rescaling that flattens activation outliers while leaving the product invariant. Enables joint W8A8 (8-bit weights, 8-bit activations) at near-FP16 quality.

For the legal team's deployment pipeline after finetuning, a reasonable default is: quantize the merged model with AWQ or GPTQ at 4-bit for weight memory savings, keep activations in FP16 at serve time. If they need to push activations to 8-bit for throughput, SmoothQuant is the right tool.

Two distinct use cases to keep separate:

- **Quantization for inference** — shrink the served model. Methods: GPTQ, AWQ, bitsandbytes.
- **Quantization for training** — shrink the frozen base during fine-tuning, as in QLoRA.

::callout{type="warning"}
**Don't report quantization quality loss as "about X%" without running your own eval.** Quality impact depends heavily on the model architecture, the quantization method, the calibration set, and the specific task. Published numbers from one model and one benchmark do not transfer. Always calibrate on your domain and eval on your task.
::

## Data preparation

Data quality is the single largest determinant of finetune success. The hyperparameters matter, but they matter second.

### How much is enough?

The practical floors, by task type:

- **Style / voice / format finetuning:** 500–2,000 curated high-quality examples is typically enough to substantially shift behavior. The legal team's 3,000 examples is more than adequate if quality is high.
- **Domain adaptation without format change:** 5,000–50,000 examples, because the signal per example is lower (you're spreading the adaptation across many concepts).
- **Instruction following from a base model:** 10,000–100,000+ for robust general instruction following. For a narrow instruction-following target, much less.
- **DPO / preference alignment:** 5,000–50,000 preference pairs, depending on signal-to-noise. Smaller sets can work if preferences are strong and clean.

These are ballpark. The defining feature is always quality, not quantity.

### Quality over quantity

Concrete ways this plays out:

- **One bad example can poison many good ones.** A model that sees even 5 percent of training examples with (say) a different formatting convention will produce drift and inconsistency in production. The legal team should not mix three different paralegal styles into training without first normalizing them.
- **Curate before generate.** Better to hand-pick 500 excellent examples than accept 5,000 mediocre ones. If you have 3,000 historical examples, rank them for quality and train on the top 1,500 — quality signal is worth more than volume.
- **Diversity matters more than count past the floor.** Beyond the minimum, diversity of inputs (different filing types, different complexities, different party configurations) matters more than raw example count.
- **Bad data teaches confidently.** The model will faithfully reproduce whatever pattern your data teaches — including the bad ones[^5]. It has no sense that a malformed example is malformed. It just fits.

### Instruction templates

Every supervised finetune needs a consistent template. Common shapes:

- **Chat-style:** `<|user|>{input}<|assistant|>{output}` — standard for chat-tuned models, plays well with existing chat wrappers.
- **Alpaca-style:** `### Instruction:\n{input}\n### Response:\n{output}` — simple, widely used, documented behavior.
- **Model-specific:** many base models have a preferred template from their pretraining or prior instruction tuning (Llama's `[INST]`, Mistral's special tokens). Using the "native" template usually helps.

Rules:

- **Pick one template. Use it everywhere — training, eval, inference.** Template drift between training and inference is a silent quality killer.
- **Respect special tokens.** If the base model has `<|system|>`, `<|user|>`, `<|assistant|>` tokens baked in, use them. Adding your own markers on top typically hurts.
- **Loss mask the prompt.** Compute loss only on the response tokens, not the prompt tokens. Otherwise the model spends capacity on memorizing your instruction phrasing, which is wasted and can cause overfit to the prompt specifically.

### Contamination checks

Two kinds of contamination to guard against:

1. **Eval contamination:** your training set overlaps with your eval set. Check by hashing normalized input strings between the two. If 1 percent overlap is tolerable for your task, define that threshold explicitly and enforce it.
2. **Benchmark contamination:** your training data contains canonical benchmark items (MMLU, HellaSwag, etc.). This inflates reported scores without improving real capability. If you care about benchmark numbers, check and scrub.

For the legal team, the primary risk is case-document contamination — specifically, filings that were later summarized as training examples being present in test retrieval. The test set for eval should be temporally held out (filings from a period not in training), not a random split.

## Training tactics

A short list of things that routinely separate working finetunes from broken ones.

### Learning rate and schedule

LoRA typically wants higher LRs than full fine-tuning (1e-4 to 5e-4 range is common); full fine-tuning usually sits one to two orders of magnitude lower (1e-5 to 5e-5). A cosine schedule with warmup is the dull default that works — warm up over 1–3 percent of total steps to prevent early divergence from Adam moment estimates, then cosine-decay to 0 or 10 percent of peak over the remaining steps.

Warmup matters more than it looks. Adam's first-step updates can be large before the moment estimates stabilize, and for a LoRA adapter starting from near-zero this can kick the adapter into a bad basin. 100 warmup steps is cheap insurance.

### Gradient clipping

Clip gradient norm to 1.0 as a default. Mixed-precision training plus unnormalized loss spikes can produce rare but catastrophic gradient explosions; clipping prevents these from blowing up the adapter weights. Clipping at 1.0 is conservative but rarely hurts final quality; go to 0.5 if the training is unstable.

### Mixed precision

BF16 is the modern default for training. FP16 requires loss scaling (a multiplier applied during backward to keep small gradients from underflowing to zero) and adds a small amount of tuning fragility; BF16's wider dynamic range eliminates the need for loss scaling and makes training more robust. On any Ampere-or-newer GPU, use BF16 unless you have a specific reason not to.

### Epochs

One epoch is often enough, especially with LoRA on large models. Multiple epochs on small datasets memorize rather than generalize[^5]. For the legal team's 3,000 examples, one or two epochs is correct; five epochs will start memorizing specific filings.

Rule of thumb: if your training loss continues dropping steeply but eval loss flattens or rises, you're past the useful point. Stop there.

### DeepSpeed and FSDP

When a model doesn't fit on one GPU even with PEFT, two frameworks help:

- **DeepSpeed ZeRO** (Rajbhandari et al. 2020) — shards optimizer state (ZeRO-1), gradients (ZeRO-2), and/or parameters (ZeRO-3) across GPUs. ZeRO-3 is the full parameter sharding mode; it enables training arbitrarily large models on enough GPUs but adds communication overhead.
- **FSDP (Fully Sharded Data Parallel)** — PyTorch-native equivalent to ZeRO-3. Similar model, slightly different integration story.

For the legal team, neither is needed — a single GPU with QLoRA suffices. These matter when moving to 70B or larger, or when doing full finetuning on multiple nodes.

### Monitoring loss curves

Things to watch on the live curves during training:

- **Training loss dropping, eval loss flat or rising:** overfitting. Stop.
- **Training loss jagged with big spikes:** learning rate too high, or a bad batch. Lower LR or fix the data.
- **Eval loss improves then degrades then improves again:** usually noisy eval with small eval set. Add more eval examples.
- **Train and eval tracking closely:** under-training. You can probably train longer safely.
- **Loss becomes NaN:** usually fp16 issue. Switch to bf16 or check for degenerate data.

### Eval during training, not after

Run your task evals every N steps — for small-to-medium runs, every 100–500 steps is reasonable. Training loss going down while eval quality stays flat or regresses is the signal to stop — more steps will make it worse, not better.

For the legal team: hold out 100 filings as a final test set and another 100 as a during-training dev set. Run structured evals (format compliance, paragraph count, no-invented-citations) every 200 steps. The eval doesn't need to be LLM-judge-heavy; rule-based checks on format and citations catch most of the failure modes cheaply.

::callout{type="warning"}
**Test the base model on your eval set before you start.** If you don't have a pre-finetune number, you can't tell whether your finetune helped, hurt, or did nothing. This is the most common missed step. Run the full eval on the untrained base with the same prompt template you plan to use at inference.
::

## Eval during training

A real eval-during-training harness has three tiers.

1. **Held-out loss.** Cheap, computed every step-block. Not the same as capability but a useful leading indicator. Rising held-out loss is always bad.
2. **Task-specific structured evals.** For the legal team: paragraph count equal to five, no-hallucinated-citations check (regex each generated citation against the source filing), format adherence. These are rule-based, fast, and highly diagnostic. Run every 100–500 steps.
3. **Capability regression evals.** A small general-capability suite (MMLU subset, a few reasoning tasks, a small instruction-following benchmark) to catch catastrophic forgetting. Run at milestones — every 1,000 steps or at the end of each epoch. If general capability drops more than a small percentage, mix in more diverse instruction data or reduce LoRA capacity.

The legal team should not ship a model that, while hitting format perfectly on their eval, has degraded significantly on generic reasoning. A format-perfect model that can't follow a clarifying question is not a usable product.

## Model merging and multi-task

When you have multiple LoRA adapters for different tasks — or multiple fully fine-tuned checkpoints — you sometimes want a single model that does all of it. Model merging is the set of techniques for combining weights directly, without retraining.

- **SLERP (spherical linear interpolation)** — interpolates between two model weight sets along the great circle on a hypersphere. Simple and effective for two-way merges. The intuition: linear interpolation in weight space often produces degraded intermediate points because the loss landscape is curved; SLERP interpolates along the manifold more gracefully. Works best when the two models are both derived from the same base (fine-tunes of the same checkpoint).
- **TIES-Merging** (Yadav et al. 2023) — resolves conflicts between multiple fine-tuned deltas by **T**rim (prune low-magnitude delta weights), **E**lect (resolve sign conflicts across tasks by majority), and **S**um (combine the surviving deltas)[^12]. Handles 3+ adapters much better than SLERP's naive averaging.
- **DARE** (Drop And REscale) — randomly drops some delta weights and rescales the rest; can be composed with TIES. The intuition is that much of the delta signal is redundant, so dropping a fraction and rescaling the rest preserves the task signal while reducing conflicts across merged tasks.

These are more art than science. There is no reliable theory predicting which merge recipe will work for which combination of checkpoints, and practitioners mostly sweep hyperparameters against evals[^4]. Merging is useful when you already have the adapters and don't want to host N of them, but it's not a substitute for training a single model well.

For the legal team, merging becomes relevant only if they eventually have multiple LoRAs (civil, criminal, appellate) and want a single serving model. If they get there, TIES is the sensible default recipe; sweep the trim threshold on a combined eval set.

A warning worth stating: merging can collapse behavior in non-obvious ways. A merged model can regress on *both* source tasks if the deltas conflict in important directions. Always eval the merged model on each source task's eval set, not just a combined set.

## Post-training: SFT → RLHF → DPO → KTO/ORPO

The path from a pretrained base model to a usable assistant is usually three or four stages.

### SFT

**Supervised fine-tuning (SFT).** Train on `(prompt, ideal response)` pairs. This is standard finetuning and is the same machinery covered above. Good SFT data is the foundation of everything that follows[^1]. SFT handles "teach the model the format, voice, and basic instruction-following behavior." It does not handle "teach the model which of two answers is better" — that's preference territory.

For the legal team, SFT is where the story ends for the first production version. They have `(filing, summary)` pairs; they train a LoRA via SFT; they ship. Preference optimization is a later upgrade path if and only if they collect preference data as part of their production feedback loop.

### RLHF

**RLHF (Reinforcement Learning from Human Feedback).** Train a reward model on human preference pairs `(prompt, chosen, rejected)`, then optimize the policy with PPO against that reward model[^13]. Produces strong alignment, but the pipeline is complex: a reward model, PPO, careful KL regularization, and a lot of tuning.

RLHF's strength is that the reward model can express gradients the SFT data can't — preferences between subtly different outputs. Its weakness is operational complexity: you're maintaining two models (reward + policy), an RL loop, and the associated sampling infrastructure. Teams that don't have a dedicated alignment engineer usually struggle with this.

### DPO

**DPO (Direct Preference Optimization).** Reformulates the RLHF objective so you can optimize directly on preference pairs with a closed-form loss — no separate reward model, no RL[^14]. Simpler, more stable, and competitive with PPO-RLHF on many benchmarks.

The DPO loss looks like a binary classification between chosen and rejected completions, scaled by a KL regularization term that keeps the policy near the SFT reference. Practically: you take your SFT checkpoint, your preference dataset, and run a single additional training pass with a specific loss function. That's it. No reward model, no rollout loop, no PPO tuning.

DPO has largely replaced RLHF for teams that don't have a dedicated RLHF infrastructure, precisely because it collapses the complex RL loop into a single training run that looks a lot like SFT[^14]. The field has moved: if you're starting fresh in 2026 and need alignment on preferences, DPO (or one of its descendants — IPO, KTO, ORPO) is the reasonable default, and PPO-based RLHF is the specialist choice when you need its specific properties.

**Practical DPO tuning notes:**

- The `beta` hyperparameter controls how strongly the policy is regularized toward the SFT reference. Small beta (0.01–0.1) lets the policy move far from the reference and can cause reward hacking or drift; large beta (0.5–1.0) hugs the reference too tightly and the preference signal has limited effect. Common starting points land around 0.1–0.3.
- The learning rate is typically much lower than SFT — 1e-6 to 5e-6 is a common range. DPO is a refinement of an already-trained model; big LR steps destabilize it.
- Preference data quality matters more than in SFT. Noisy preferences (rater disagreement, inconsistent criteria) produce a loss surface with exploitable local minima. Clean the data hard before running DPO.
- Watch for "length bias." DPO (and RLHF) will often discover that longer answers are preferred on average and start producing verbose filler. Monitor output length distribution and penalize length explicitly if needed.
- Keep the SFT reference frozen and available at inference/eval time. The DPO loss depends on the log-ratio between current policy and SFT reference; if your checkpointing loses the reference, you cannot compute the loss correctly for downstream refinements.

### KTO

**KTO (Kahneman-Tversky Optimization)** (Ethayarajh et al. 2024) — reformulates preference optimization using prospect-theory-inspired losses that don't require *paired* preference data[^15]. Instead of `(chosen, rejected)` pairs, KTO works with `(prompt, response, binary-thumbs-up-or-down)` signals. This matters because collecting paired preferences is expensive; collecting thumbs-up/thumbs-down is cheap and often already captured in product telemetry.

When to use KTO: you have unpaired preference signals (user thumbs, report-this-response flags, acceptance/rejection of suggestions) and want to tune behavior without a dedicated pairwise labeling effort. The legal team, if they have paralegals marking summaries as good/bad/revise, can use KTO directly on that signal without pairing.

### ORPO

**ORPO (Odds Ratio Preference Optimization)** (Hong et al. 2024) — collapses SFT and preference optimization into a single training pass using an odds-ratio loss term[^16]. Instead of SFT-then-DPO, ORPO trains the model to both fit chosen completions and push away from rejected ones simultaneously.

When to use ORPO: you want to compress the post-training pipeline, you have preference data from the start, and you're willing to sacrifice some tunability for simpler infrastructure. It's a reasonable single-stage alternative when the paired preference data is already in hand.

### A practical point

Most product teams doing "alignment" work are doing SFT and then maybe DPO. Pure RLHF remains an unusual commitment. KTO is increasingly the right choice when preference data is unpaired binary feedback. ORPO is the right choice when you want a single training pass and have paired preferences up front.

For the legal team: start with SFT. If quality gates hold, ship. If there are persistent "wrong but plausible" failure modes that SFT can't fix (e.g., the model sometimes produces correctly-formatted but semantically weak summaries), add DPO as a second stage using paralegal pairs of good vs revised summaries. Don't go further without a clear reason.

## Failure modes

A catalog of the ways real finetuning projects die, and how to recognize each.

### Catastrophic forgetting

**Symptom:** model is excellent on the training task, markedly worse on general capability (basic reasoning, instruction following outside the training domain, common-sense questions).

**Cause:** training concentrates gradient on a narrow distribution; weights drift away from the general-purpose optima they started in.

**Mitigation:**
- Mix in general instruction data (10–20 percent of each batch) to keep gradients pointed toward general competence.
- Use LoRA rather than full finetune — lower-capacity updates forget less.
- Freeze more of the base: lower LoRA rank, fewer adapted layers, or lower LoRA alpha.
- Evaluate on a general-capability suite at each checkpoint; stop before the general score degrades below your acceptable floor.

The legal team's risk here: if they train only on legal summaries, the model may forget how to answer a paralegal's free-text clarifying question. If they plan to use the model interactively, they must mix in some general instruction data.

### Overfitting

**Symptom:** training loss still dropping, eval loss flat or rising. Quality on held-out cases degrades even as training-set fit improves.

**Cause:** model memorizing the training set rather than generalizing the underlying behavior.

**Mitigation:**
- Fewer epochs. One epoch is often enough for LoRA on decent-sized datasets.
- More data. If you only have 500 examples, overfitting is nearly inevitable past epoch 2.
- Lower capacity. Drop LoRA rank, drop alpha, drop the set of adapted layers.
- Regularization. Dropout on the LoRA output (some frameworks expose this), weight decay.

### Mode collapse

**Symptom:** model produces near-identical outputs for very different inputs. Output length, phrasing, and structure collapse toward a single mode.

**Cause:** thin, repetitive training data; overfitting to a particular output template; excessive alignment pressure (DPO/RLHF can amplify this).

**Mitigation:**
- Audit training data for diversity. Cluster outputs by length, phrasing, structure; if the modes are thin, you need more varied training examples.
- Reduce KL divergence weight in DPO/RLHF; too strong a pull toward preference-majority answers can collapse variety.
- Use eval that explicitly measures output diversity, not just quality.

### Spec hacking / reward hacking

**Symptom:** in RLHF or DPO, the model finds a way to maximize the reward or preference score without actually doing the intended task — verbose filler, flattery, format-gaming.

**Cause:** reward model or preference signal has an unintended optimum that's easier to hit than the real task.

**Mitigation:**
- Audit reward model outputs on adversarial cases (empty responses, repetitive responses, flattery-heavy responses). If the reward model rates these highly, it's broken.
- Use KL regularization to keep the policy near the SFT reference, limiting how far the model can drift into exploitation.
- In DPO, keep the preference data clean. Noisy preferences produce exploitable loss surfaces.

### Prompt-template drift

**Symptom:** model performs well in training-time eval but poorly in production, and no one can figure out why.

**Cause:** training-time prompt template and inference-time prompt template differ by even a whitespace character or a missing special token. The model is extremely sensitive to this, because the template is the primary cue for which "mode" it's in.

**Mitigation:**
- Single source of truth for the template in training code and inference code. Extract to a shared module; import it everywhere.
- Sanity-check production: tokenize a production prompt and compare token IDs to a training prompt. Any difference is the bug.

### Quantization-induced drift at deployment

**Symptom:** model looks good at training in BF16, regresses on deployment in INT4.

**Cause:** quantization isn't free; some tasks are more sensitive than others, and calibration quality matters.

**Mitigation:**
- Calibrate quantization on your actual domain, not on C4 or a random sample.
- Eval the quantized model on your task, not just perplexity.
- If the drift is significant, try a different quantization method (NF4 vs INT4 vs GPTQ vs AWQ) or a higher bit width (INT8 instead of INT4).

### Data leakage in eval

**Symptom:** incredible eval scores during development, disappointing production performance.

**Cause:** eval set overlaps training set. Could be direct duplication, could be near-duplicates, could be synthetic data augmentation that crossed the split.

**Mitigation:**
- Temporal split rather than random split for any domain with time structure (the legal team's filings).
- Hash-based deduplication at the document level between train and eval.
- Periodic audit: sample 50 eval items and check for near-duplicates in training.

### Silent regression on a subset

**Symptom:** aggregate eval metric improves but a specific subgroup (e.g., short filings, a particular case type) regresses significantly. The aggregate hides the regression.

**Cause:** training data distribution doesn't match the subgroup, or the subgroup's behavior is dominated by a minority of training examples.

**Mitigation:**
- Break eval metrics by subgroup. Always report per-slice numbers, not just aggregates.
- Stratify training data collection across the subgroups you care about.

### Over-reliance on LLM-judge evals

**Symptom:** LLM-judge scores improve monotonically across training runs, but paralegals or end users rate later runs about the same as earlier ones — or worse.

**Cause:** LLM-judge models have preferences that only partially overlap with the true target quality. Common divergences: judges prefer longer answers, judges prefer answers with hedged confidence language, judges reward surface features (headers, bullet points) over substance.

**Mitigation:**
- Anchor any LLM-judge harness with a small rubric-scored human-rated subset. If the human-rated subset and the LLM-judge disagree on the ranking of models, trust the humans.
- Use LLM-judge for rapid development iteration; use human review for final ship decisions.
- Run the judge with multiple prompt variants and take the median score. Judge noise is large.
- Never use the same model family as judge and candidate. A Claude-judged Claude fine-tune has correlated preferences and inflated scores.

### Adapter drift on repeated fine-tuning rounds

**Symptom:** each successive fine-tuning round (SFT → DPO → further SFT with new data) reduces quality on tasks the prior round handled well.

**Cause:** sequential fine-tuning accumulates drift. Each round optimizes against a partial objective, and capabilities not rewarded in the current round can erode.

**Mitigation:**
- Maintain a "continual eval" set that spans all previous rounds' targets. Run it on every new checkpoint.
- Consider re-mixing old data into new training rounds (replay buffer pattern) to prevent full forgetting.
- Use model merging (TIES, SLERP) to combine round-specific adapters rather than training sequentially when the rounds target different capabilities.

### Hidden compute-quality tradeoffs

**Symptom:** the team shipped a finetune that beats the baseline in offline eval, but production quality is worse than the baseline after adjusting for latency.

**Cause:** finetuning often trades off against latency or throughput. A rank-64 all-linear LoRA may be 3x slower at inference than rank-8 Q/V-only; if the team didn't measure inference cost alongside quality, they can ship a model that's nominally better but practically worse.

**Mitigation:**
- Always eval quality and latency together. Report the Pareto frontier (quality vs cost) across candidates.
- Merge LoRA back into base weights before deployment to avoid the runtime cost of a separate adapter path. This is free and should be the default unless you need hot-swappable adapters.
- If quantization is on the deployment path, run the final quality eval on the quantized-and-merged artifact, not on the BF16 adapter. That's the model users will actually see.

## Putting it together: the legal team's plan

To close the loop on the running example, here's the concrete plan the legal-summarization team should execute.

1. **Baseline.** Run the untouched 7B base model on 100 held-out filings with a clean system-prompt-plus-few-shot template. Measure: format compliance, citation accuracy (regex-based), five-paragraph count, paralegal rating of a 25-item sample. This is the number to beat.
2. **Prompt + RAG baseline.** Add a minimal RAG pipeline that retrieves relevant local rules and statutes. Re-run baseline. If this closes the gap, ship it and stop.
3. **Data curation.** Rank 3,000 historical `(filing, summary)` pairs by quality. Take the top 1,500. Normalize format aggressively — any summary that doesn't follow the five-paragraph structure is either fixed or dropped.
4. **Train/dev/test split.** Temporal split: oldest 80 percent for training, middle 10 percent for dev, newest 10 percent for test. Never touch the test set until the end.
5. **QLoRA training.** NF4 quantization of the 7B base; LoRA adapter at rank 16 on Q/V/O (start conservative, escalate to all-linear if needed); alpha 32; LR 2e-4 with cosine decay and 100-step warmup; gradient checkpointing on; BF16 adapter; paged 8-bit Adam; batch size that fits in 24 GB (probably 1–4 with gradient accumulation to effective 16–32).
6. **Monitoring.** Hold-out loss every 50 steps; structured evals (format, citations, paragraph count) every 200 steps; small general-capability eval every 1,000 steps. Stop training if eval structured metric plateaus for 500 steps or general capability regresses significantly.
7. **Test.** Run the final checkpoint on the untouched test set. If it beats the prompt+RAG baseline by a meaningful margin, ship. If not, investigate: data quality, rank, duration, or the premise that finetuning was the right lever.
8. **Deployment.** Merge the LoRA back into the base (for single-adapter deployments this keeps inference latency clean); quantize with AWQ or GPTQ at 4-bit if deployment memory is tight; calibrate quantization on a sample of real filings.
9. **Feedback loop.** Capture paralegal thumbs-up/thumbs-down on production summaries. Once there are 5,000+ binary signals, consider a KTO pass to refine behavior against real preferences.

The plan above is not special. It is what any competent team would do — but the walk through the decision tree, the memory math, and the LoRA/QLoRA choices makes every step defensible rather than cargo-culted. That's the difference between a finetune that ships and one that burns a month of compute for no measurable gain.

## What's next

This topic covered the decision to finetune and the mechanics once you've decided. The quality of the result is bounded by two things it assumes: the data you train on, and how fast you can serve what you ship.

- **Dataset Engineering** — where training data actually comes from, how to curate and filter it, synthetic data generation, and why this is the highest-leverage engineering work in the whole pipeline.
- **Inference Optimization** — once you have your finetuned checkpoint, how to serve it: quantization for deployment, batching, KV cache, speculative decoding, and the systems work that turns a trained model into a production service.

## Sources

[^1]: Chip Huyen, *AI Engineering*, Chapter 7 — finetuning fundamentals, when-to-finetune framing, knowledge-vs-behavior split, RAG-first rule, calibration dataset importance.

[^2]: Sebastian Raschka, *Build a Large Language Model From Scratch*, appendix on fine-tuning — training memory breakdown (weights + gradients + optimizer state + master copy ≈ 16 bytes/param in mixed precision with Adam). See also Chip Huyen, *AI Engineering*, Chapter 7 on training memory.

[^3]: Edward J. Hu, Yelong Shen, Phillip Wallis, Zeyuan Allen-Zhu, Yuanzhi Li, Shean Wang, Lu Wang, Weizhu Chen. *LoRA: Low-Rank Adaptation of Large Language Models*, 2021. arXiv:2106.09685. Intrinsic low-rank hypothesis grounded in prior work by Armen Aghajanyan, Luke Zettlemoyer, Sonal Gupta, *Intrinsic Dimensionality Explains the Effectiveness of Language Model Fine-Tuning*, 2020.

[^4]: Paul Iusztin and Maxime Labonne, *LLM Engineer's Handbook* — production fine-tune patterns, combined LoRA + RAG architectures, model merging as a practical tool.

[^5]: Jay Alammar and Maarten Grootendorst, *Hands-On Large Language Models* — practical finetuning chapters covering LoRA in practice, all-linear adaptation, data-quality-over-quantity, epoch count heuristics.

[^6]: Tim Dettmers, Artidoro Pagnoni, Ari Holtzman, Luke Zettlemoyer. *QLoRA: Efficient Finetuning of Quantized LLMs*, 2023. arXiv:2305.14314. 4-bit NF4 quantization, double quantization, paged optimizers; demonstrates recovery of 16-bit full-finetune task performance on their evaluated benchmarks.

[^7]: Xiang Lisa Li and Percy Liang. *Prefix-Tuning: Optimizing Continuous Prompts for Generation*, 2021. arXiv:2101.00190. Prompt-tuning scaling behavior covered in Brian Lester, Rami Al-Rfou, Noah Constant. *The Power of Scale for Parameter-Efficient Prompt Tuning*, 2021. arXiv:2104.08691.

[^8]: Haokun Liu, Derek Tam, Mohammed Muqeeth, Jay Mohta, Tenghao Huang, Mohit Bansal, Colin Raffel. *Few-Shot Parameter-Efficient Fine-Tuning is Better and Cheaper than In-Context Learning*, 2022. arXiv:2205.05638. IA3 method.

[^9]: Elias Frantar, Saleh Ashkboos, Torsten Hoefler, Dan Alistarh. *GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers*, 2022. arXiv:2210.17323.

[^10]: Ji Lin, Jiaming Tang, Haotian Tang, Shang Yang, Xingyu Dang, Chuang Gan, Song Han. *AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration*, 2023. arXiv:2306.00978.

[^11]: Guangxuan Xiao, Ji Lin, Mickael Seznec, Hao Wu, Julien Demouth, Song Han. *SmoothQuant: Accurate and Efficient Post-Training Quantization for Large Language Models*, 2023. arXiv:2211.10438.

[^12]: Prateek Yadav, Derek Tam, Leshem Choshen, Colin Raffel, Mohit Bansal. *TIES-Merging: Resolving Interference When Merging Models*, 2023. arXiv:2306.01708.

[^13]: Long Ouyang, Jeff Wu, Xu Jiang, Diogo Almeida, Carroll L. Wainwright, Pamela Mishkin, Chong Zhang, Sandhini Agarwal, Katarina Slama, Alex Ray, John Schulman, Jacob Hilton, Fraser Kelton, Luke Miller, Maddie Simens, Amanda Askell, Peter Welinder, Paul Christiano, Jan Leike, Ryan Lowe. *Training language models to follow instructions with human feedback*, 2022. arXiv:2203.02155 (InstructGPT).

[^14]: Rafael Rafailov, Archit Sharma, Eric Mitchell, Stefano Ermon, Christopher D. Manning, Chelsea Finn. *Direct Preference Optimization: Your Language Model is Secretly a Reward Model*, 2023. arXiv:2305.18290.

[^15]: Kawin Ethayarajh, Winnie Xu, Niklas Muennighoff, Dan Jurafsky, Douwe Kiela. *KTO: Model Alignment as Prospect Theoretic Optimization*, 2024. arXiv:2402.01306.

[^16]: Jiwoo Hong, Noah Lee, James Thorne. *ORPO: Monolithic Preference Optimization without Reference Model*, 2024. arXiv:2403.07691.
