---
id: finetuning
order: 05
title: Finetuning
subtitle: When to, when not to. LoRA math, quantization, multi-task merging — with the memory budget
topic: finetuning
difficulty: advanced
estimatedReadMinutes: 12
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

Finetuning is the most misunderstood lever in the AI engineering stack. Teams reach for it because it feels like "real ML work" — and end up spending weeks on a training run that a better prompt and a retrieval pipeline would have solved in an afternoon. The honest default is the opposite of the instinct: **don't finetune unless you've exhausted prompting and retrieval first** [note: Huyen AIE Ch. 7].

This topic is the map of when the exception is justified, what it actually costs in GPU memory, and how modern parameter-efficient methods (LoRA, QLoRA) reshape that cost curve.

## When to finetune, when NOT to

The RAG-first rule exists because the economics are brutal. A finetune has fixed cost (training compute, engineer time, eval infrastructure), ongoing cost (data drift, retraining cadence, hosting a custom checkpoint), and switching cost (you're now off the foundation model's upgrade train). A prompt change has none of that [note: Huyen AIE Ch. 7].

Finetune when you hit one of these walls:

- **Behavior can't be prompted.** The model follows a specific output format, tone, or policy that's too long or too finicky to fit in every prompt. You've tried few-shot with 8+ examples and it still drifts.
- **Latency or cost is the bottleneck.** A smaller finetuned model matches the quality of a larger general model at a fraction of the per-token cost. This is the most defensible reason to finetune in production [note: Huyen AIE Ch. 7].
- **Domain vocabulary is out of distribution.** Medical, legal, or internal-jargon-heavy inputs where tokenization and base priors are genuinely wrong — not just unfamiliar.
- **You need reliable structured output.** Constrained decoding plus a finetune on your schema beats prompting for complex JSON/XML under load.

Do NOT finetune for:

- **Factual knowledge updates.** New facts, changing documents, per-customer data — all of this belongs in retrieval. Training bakes knowledge in at a snapshot; your users' world keeps moving [note: Huyen AIE Ch. 7].
- **"The model needs to know our product."** It doesn't. Put the product docs in RAG.
- **One-off format requirements you haven't actually tried prompting for.** Write the prompt first.

::callout{type="warning"}
**The RAG-first rule is not about purity, it's about ownership cost.** Every finetuned checkpoint you ship is a model you now maintain forever. Prompts and retrieval indexes are cheap to iterate; weights are not.
::

Huyen's framing: finetuning changes **behavior**, retrieval provides **knowledge** [note: Huyen AIE Ch. 7]. If you can't cleanly say which side your problem falls on, it's almost always knowledge, and retrieval is the answer.

## Finetuning vs RAG — the decision

A useful decomposition before you commit:

| Axis | Points to RAG | Points to finetune |
|------|---------------|--------------------|
| Information changes often | Yes | No |
| Users need citations / provenance | Yes | No |
| Problem is "how to respond" not "what to know" | No | Yes |
| Latency budget is tight and model is large | No | Yes |
| Small training set (<1k high-quality examples) | Yes | Risky |
| Must run on-device or air-gapped | Sometimes | Often yes |

The split Huyen draws is worth memorizing: **static knowledge goes in retrieval; style, format, and latency go in weights** [note: Huyen AIE Ch. 7].

Most production systems end up doing both. A common shape: a LoRA-adapted small model for tone and format consistency, with a RAG pipeline for the actual facts [note: Iusztin & Labonne, LLM Engineer's Handbook]. The finetune handles "how we talk"; retrieval handles "what's true right now."

A less discussed failure mode: teams finetune on top of RAG-retrieved context and expect the model to "learn to use retrieval better." It usually doesn't. What it learns is to memorize the specific passages in the training set. If you want better retrieval behavior, fix retrieval.

## Memory math

Why full fine-tuning a 7B model is a non-starter on a single consumer GPU — and why PEFT exists — reduces to one accounting identity.

During backprop, GPU memory holds four things:

1. **Model weights** — the parameters themselves.
2. **Gradients** — one per trainable parameter, same dtype as weights.
3. **Optimizer state** — Adam stores first and second moments (two extra tensors per parameter), typically in FP32.
4. **Activations** — intermediate tensors saved for the backward pass. Scales with batch size × sequence length × depth.

The common rule of thumb for **full fine-tuning with Adam in mixed precision** is that you need roughly **4x the model size in GPU memory**, before activations [note: Raschka, Build a Large Language Model From Scratch, appendix on fine-tuning; see also Huyen AIE Ch. 7 on training memory]. The breakdown:

- Weights (FP16): 2 bytes/param
- Gradients (FP16): 2 bytes/param
- Optimizer state, Adam m + v (FP32 each): 8 bytes/param
- Plus a master FP32 copy of weights in mixed precision: 4 bytes/param

That totals ~16 bytes/param. For a 7B model that's ~112 GB **before activations** — which is why full fine-tuning a 7B model does not fit on a single 80GB A100, let alone a 24GB consumer card. Activations can easily add tens of GB more depending on sequence length and batch size.

<MemoryCalculator />

The levers to shrink this bill:

- **Lower precision weights.** FP16/BF16 is already standard; INT8 and 4-bit (QLoRA) push further.
- **Optimizer state reduction.** 8-bit Adam, or paged optimizers that offload state to CPU.
- **Gradient checkpointing.** Recompute activations during backward instead of storing them. Trades compute for memory.
- **Freeze most of the model.** Only train a small adapter — this is what PEFT does.

The last one is the biggest lever by far, and the reason the rest of this topic exists.

## Parameter-efficient fine-tuning (PEFT)

The PEFT family rests on a simple observation: full fine-tuning updates billions of parameters, but the **effective change** — the direction the weights move — lies on a much lower-dimensional subspace. If you can parameterize just that subspace, you can get most of the quality for a fraction of the memory.

### LoRA

LoRA (Hu et al. 2021) freezes the base model weights `W` entirely and learns a low-rank update `ΔW = B·A`, where `A ∈ ℝ^(r×k)` and `B ∈ ℝ^(d×r)` with `r ≪ min(d, k)` [note: LoRA paper, Hu 2021]. The forward pass becomes:

```
h = Wx + BAx
```

`W` stays frozen; only `A` and `B` are trained. At inference time, `BA` can be merged back into `W` for zero added latency, or kept separate to swap adapters.

The theoretical justification is the **intrinsic low-rank hypothesis**: over-parameterized models adapted to a downstream task have low intrinsic dimensionality, so a low-rank update is sufficient [note: LoRA paper, Hu 2021, building on Aghajanyan et al. 2020].

<LoRARankViz/>

Key choices:

- **Rank r.** The Hu et al. paper showed that surprisingly small ranks (r = 4–8) work for many tasks [note: LoRA paper, Hu 2021]. Higher rank gives more capacity but more parameters. In practice, teams sweep r ∈ {4, 8, 16, 32, 64} and pick the smallest that hits target quality.
- **Which layers to adapt.** The original paper found attention projections (`W_q`, `W_v`) were the highest-leverage targets. Modern practice extends LoRA to all linear layers (attention + MLP) when memory permits [note: LoRA paper, Hu 2021; Hands-On LLMs fine-tuning chapters].
- **Alpha (scaling).** `ΔW` is scaled by `α/r`. A common heuristic is `α = 2r`, but this is tuning, not law.

The trainable-parameter reduction is dramatic — LoRA typically trains well under 1% of the base parameters. Memory for gradients and optimizer state scales with *trainable* parameters, which is where the savings compound.

### QLoRA

QLoRA (Dettmers et al. 2023) stacks two ideas: **4-bit NF4 quantization** of the frozen base model, plus LoRA adapters trained in higher precision on top [note: QLoRA paper, Dettmers 2023].

Three contributions worth knowing:

1. **NF4 (Normal Float 4)** — a 4-bit data type theoretically optimal for weights that are approximately normally distributed, which LLM weights roughly are [note: QLoRA paper, Dettmers 2023].
2. **Double quantization** — the quantization constants themselves get quantized, saving additional memory.
3. **Paged optimizers** — NVIDIA unified memory to page optimizer state between GPU and CPU on memory spikes.

The result: models that would require many GPUs for full fine-tuning fit on a single consumer card via QLoRA, with the adapter trained in BF16 while the frozen base sits in 4-bit. The Dettmers paper demonstrated that QLoRA preserves task performance relative to 16-bit full fine-tuning on the benchmarks they tested [note: QLoRA paper, Dettmers 2023].

### Other PEFT methods

- **Prefix / prompt tuning** — prepend learned vectors to the input. Very few parameters; generally weaker than LoRA.
- **IA3** — learns per-channel scaling vectors rather than low-rank updates. Extremely parameter-efficient but less flexible.
- **Adapters (Houlsby-style)** — insert small bottleneck MLPs between layers. Adds inference latency unless merged.

In 2026 practice, LoRA and QLoRA are the defaults; the others are niche unless you have a specific constraint [note: Hands-On LLMs fine-tuning chapters].

## Quantization fundamentals

Quantization maps floating-point weights to lower-bit integer or custom formats. The engineering tradeoff is always the same: memory and throughput vs. quality.

Formats in common use:

- **INT8** — 8-bit integer. Well-supported, small quality impact on most models, ~2x memory reduction from FP16.
- **INT4 / 4-bit integer** — more aggressive, requires careful calibration and often group-wise scaling.
- **FP4** — 4-bit floating point, preserves dynamic range better than INT4 for some distributions.
- **NF4** — the QLoRA format, designed for normally distributed weights [note: QLoRA paper, Dettmers 2023].

**Calibration datasets** matter for post-training quantization (PTQ). The calibration set is used to compute scaling factors per layer or channel; a mismatch between calibration data and deployment data is a common source of silent quality regression [note: Huyen AIE Ch. 7].

Two distinct use cases to keep separate:

- **Quantization for inference** — shrink the served model. Methods: GPTQ, AWQ, bitsandbytes.
- **Quantization for training** — shrink the frozen base during fine-tuning, as in QLoRA.

::callout{type="warning"}
**Don't report quantization quality loss as "about X%" without running your own eval.** Quality impact depends heavily on the model architecture, the quantization method, the calibration set, and the specific task. Published numbers from one model and one benchmark do not transfer.
::

## Model merging and multi-task

When you have multiple LoRA adapters for different tasks — or multiple fully fine-tuned checkpoints — you sometimes want a single model that does all of it. Model merging is the set of techniques for combining weights directly, without retraining.

- **SLERP (spherical linear interpolation)** — interpolates between two model weight sets along the great circle on a hypersphere. Simple and effective for two-way merges.
- **TIES-Merging** — resolves conflicts between multiple fine-tuned deltas by pruning low-magnitude changes and resolving sign conflicts.
- **DARE** — randomly drops some delta weights and rescales the rest; can be composed with TIES.

These are more art than science. There is no reliable theory predicting which merge recipe will work for which combination of checkpoints, and practitioners mostly sweep hyperparameters against evals [note: Iusztin & Labonne, LLM Engineer's Handbook]. Merging is useful when you already have the adapters and don't want to host N of them, but it's not a substitute for training a single model well.

## Finetuning tactics

A short list of things that routinely separate working finetunes from broken ones:

- **Data quality >> data quantity.** A few thousand carefully curated examples beat tens of thousands of scraped-and-filtered ones. The model will faithfully reproduce whatever pattern your data teaches — including the bad ones [note: Hands-On LLMs fine-tuning chapters].
- **Learning rate is the knob that matters most.** LoRA typically wants higher LRs than full fine-tuning (1e-4 to 5e-4 range is common); full fine-tuning usually sits one to two orders of magnitude lower. A cosine schedule with warmup is the dull default that works.
- **Catastrophic forgetting is real.** Fine-tuning on a narrow task can degrade general capabilities. Mitigations: mix in general instruction data, use LoRA (lower-capacity updates forget less), evaluate on a held-out general benchmark, not just your task.
- **Evaluate during training, not just after.** Run your task evals every N steps. Training loss going down while eval quality stays flat or regresses is the signal to stop — more steps will make it worse, not better.
- **One epoch is often enough.** Especially with LoRA on large models. Multiple epochs on small datasets memorize rather than generalize [note: Hands-On LLMs fine-tuning chapters].

::callout{type="warning"}
**Test the base model on your eval set before you start.** If you don't have a pre-finetune number, you can't tell whether your finetune helped, hurt, or did nothing. This is the most common missed step.
::

## Post-training: SFT → RLHF → DPO

The path from a pretrained base model to a usable assistant is usually three stages.

- **Supervised fine-tuning (SFT).** Train on `(prompt, ideal response)` pairs. This is standard finetuning and is the same machinery covered above. Good SFT data is the foundation of everything that follows [note: Huyen AIE Ch. 7].
- **RLHF (Reinforcement Learning from Human Feedback).** Train a reward model on human preference pairs `(prompt, chosen, rejected)`, then optimize the policy with PPO against that reward model [note: Ouyang et al. 2022, InstructGPT]. Produces strong alignment, but the pipeline is complex: a reward model, PPO, careful KL regularization, and a lot of tuning.
- **DPO (Direct Preference Optimization).** Reformulates the RLHF objective so you can optimize directly on preference pairs with a closed-form loss — no separate reward model, no RL [note: DPO paper, Rafailov 2023]. Simpler, more stable, and competitive with PPO-RLHF on many benchmarks.

DPO has largely replaced RLHF for teams that don't have a dedicated RLHF infrastructure, precisely because it collapses the complex RL loop into a single training run that looks a lot like SFT [note: DPO paper, Rafailov 2023]. The field has moved: if you're starting fresh in 2026 and need alignment on preferences, DPO (or one of its descendants — IPO, KTO, ORPO) is the reasonable default, and PPO-based RLHF is the specialist choice when you need its specific properties.

A practical point worth stating plainly: most product teams doing "alignment" work are doing SFT and then maybe DPO. Pure RLHF remains an unusual commitment.

## What's next

This topic covered the decision to finetune and the mechanics once you've decided. The quality of the result is bounded by two things it assumes: the data you train on, and how fast you can serve what you ship.

- **Dataset Engineering** — where training data actually comes from, how to curate and filter it, synthetic data generation, and why this is the highest-leverage engineering work in the whole pipeline.
- **Inference Optimization** — once you have your finetuned checkpoint, how to serve it: quantization for deployment, batching, KV cache, speculative decoding, and the systems work that turns a trained model into a production service.
