---
id: foundation-models
order: 01
title: Understanding Foundation Models
subtitle: Training data, architecture, post-training, sampling — and how a transformer becomes a product
topic: foundation-models
difficulty: intermediate
estimatedReadMinutes: 13
hero: true
primitives:
  - tokenizer
  - attention-heatmap
  - temperature-sampler
citations:
  - { book: huyen-aie, chapters: "Ch. 2", topic: "foundation model fundamentals" }
  - { book: raschka-from-scratch, chapters: "Ch. 1-4", topic: "attention and transformer internals" }
  - { book: hands-on-llms, chapters: "Ch. 1-3", topic: "tokenization, embeddings, architecture" }
tags: [foundation-models, transformer, attention, sampling, tokenization]
updatedAt: 2026-04-17
---

## What a foundation model actually is

The phrase "foundation model" is doing a lot of work. Stanford's CRFM coined it to name a specific phenomenon: a single model, trained once on broad data at scale, that can be adapted to a wide range of downstream tasks without retraining from zero [note: Bommasani et al. 2021, "On the Opportunities and Risks of Foundation Models"]. The emphasis is adaptation, not omniscience. You take a pretrained base, then you point it at a task through prompting, fine-tuning, retrieval, or tool use.

The name is deliberately architecture-agnostic. A foundation model can be a decoder-only transformer like the GPT family, an encoder-decoder like T5, or a multimodal model that takes images and text. What makes it a foundation model is the combination of three properties: it was trained on a broad distribution of data, its training objective was general (typically next-token prediction for language), and it can be adapted to many downstream tasks [note: Huyen AIE Ch. 2].

The practical consequence for engineers is that you almost never train one. You inherit a model with characteristics shaped by choices someone else made — what data went in, how it was filtered, what post-training did, what sampling it exposes. Those choices determine what the model is good at, where it fails, and how much of its behavior you can change from the outside. Understanding the layers below the API surface is how you avoid blaming the model for problems that live in your prompt, and how you avoid blaming your prompt for problems that live in the pretraining [note: Huyen AIE Ch. 2].

::callout{type="info"}
A foundation model is not a finished product. It is an adaptable substrate. Most of your engineering work sits on top of it — the prompt, the retrieval layer, the evaluation harness, the output validators.
::

## Training data

A language model learns the distribution of its training data. This is not a metaphor — it is the literal objective. Everything the model does downstream is a consequence of what went in, how much of it there was, and how it was weighted. If you want to predict what a model will be good at, the training corpus is the first thing to look at [note: Huyen AIE Ch. 2].

Modern foundation model corpora are web-scale in the most literal sense: filtered snapshots of Common Crawl, supplemented with curated sources like books, code repositories, academic papers, and reference material. The rough order of magnitude has moved from hundreds of billions of tokens in GPT-3 era models [note: Brown et al. 2020, "Language Models are Few-Shot Learners"] to trillions of tokens in frontier systems today. Exact counts for closed models are rarely published; treat public numbers as estimates.

Three properties of the data matter more than raw size:

**Language mix.** Most large corpora are English-dominant by a wide margin. A model trained on 90% English will perform noticeably worse on low-resource languages, and it will transfer stylistic and cultural priors from English text into multilingual outputs. If your product serves a non-English market, the language distribution of the base model is a first-order concern.

**Domain coverage.** Code-heavy pretraining produces models that are good at code. Models trained with large fractions of academic text are better at formal reasoning tasks. Models trained on dialogue data are better conversationalists. "Capability" is not a generic quantity; it is shaped by what fraction of the corpus resembles your task [note: Hands-On LLMs Ch. 1].

**Quality filtering.** Deduplication, toxicity filtering, and quality classifiers change what the model learns. There is an active, unresolved debate about how aggressively to filter — too little and the model memorizes boilerplate and absorbs low-quality patterns; too much and you strip out useful diversity or bias the model toward a narrow register. Different labs make different choices, and those choices are visible in model behavior even when architecture and size are comparable [note: Huyen AIE Ch. 2].

One consequence worth internalizing: cutoff dates matter. A model's knowledge of the world ends roughly when its pretraining data was collected. Anything after that — new APIs, new events, new facts — has to come in through the prompt, retrieval, or tools.

<TokenizerPrimitive/>

## Architecture essentials

Almost every current-generation foundation model for language is a decoder-only transformer. The transformer block has been remarkably stable since 2017, and while the details have evolved, the skeleton has not [note: Vaswani et al. 2017, "Attention Is All You Need"; Raschka, Build a Large Language Model From Scratch, Ch. 3-4].

A single transformer block does roughly this:

```text
x_in
  │
  ▼
┌──────────────┐
│  LayerNorm   │   (pre-norm variant)
└──────────────┘
  │
  ▼
┌──────────────────────┐
│  Multi-head attention│   (Q, K, V projections, softmax, output proj)
└──────────────────────┘
  │
  ▼   ── residual ──►  +  x_in
  │
  ▼
┌──────────────┐
│  LayerNorm   │
└──────────────┘
  │
  ▼
┌──────────────┐
│  Feed-forward│   (usually 2 linear layers with a nonlinearity)
└──────────────┘
  │
  ▼   ── residual ──►  +
  │
  ▼
x_out
```

Stack a few dozen of these blocks, wrap them with a token embedding at the input and a linear projection to vocabulary at the output, and you have the core of a modern LLM [note: Raschka, Ch. 4].

### Self-attention

Attention is the mechanism that lets a token's representation depend on the other tokens in the context. Each token projects into three vectors — query (Q), key (K), and value (V). The output for a given token is a weighted sum of the V vectors, where the weights come from the softmax of the dot product between the token's Q and every other token's K, scaled by the square root of the key dimension [note: Vaswani et al. 2017].

The scaling factor is not cosmetic. Without it, dot products grow with dimensionality, which pushes the softmax into saturated regions where gradients vanish. Dividing by √d_k keeps the pre-softmax scores in a numerically reasonable range [note: Vaswani et al. 2017; Raschka Ch. 3].

Causal masking — zeroing out attention from a token to future positions — is what makes a decoder "decoder-only." It enforces the autoregressive property: the representation at position *t* only depends on positions ≤ *t*.

### Multi-head attention

Instead of one attention computation at the full model dimension, multi-head attention splits the Q, K, V projections into multiple heads that attend in parallel subspaces, then concatenates and reprojects the results. The intuition in the original paper was that different heads can learn to track different kinds of relationships (syntactic, semantic, positional) without interfering with each other [note: Vaswani et al. 2017]. In practice, interpretability work has shown that heads often specialize, though the picture is messier than a clean "head = feature" mapping [note: Hands-On LLMs Ch. 3].

### Feed-forward network and residuals

After attention, each token's representation passes through a position-wise feed-forward network — typically two linear layers with a nonlinearity between them, expanding to roughly 4× the model dimension in the middle. The FFN is where a large fraction of the parameter count lives.

Residual connections around both the attention and FFN sub-blocks are load-bearing. They give gradients a clean path backward through the stack, which is what makes deep transformers trainable at all [note: Vaswani et al. 2017].

### Pre-norm vs post-norm

The original transformer applied LayerNorm after each sub-block ("post-norm"). Modern models almost universally apply it before ("pre-norm"), because pre-norm is more stable to train at large depths. The tradeoff is subtle — post-norm has slightly better asymptotic performance in some settings, but the training stability of pre-norm is worth it at scale [note: Raschka Ch. 4; Hands-On LLMs Ch. 3]. This is one of those places where textbooks disagree on emphasis; treat pre-norm as the current default.

### Positional encodings

Self-attention is permutation-invariant by construction. The model has to be told where each token sits in the sequence, and there are several competing approaches:

- **Sinusoidal (original)** — fixed position vectors added to token embeddings [note: Vaswani et al. 2017].
- **Learned absolute** — trainable position embeddings, used in GPT-2.
- **RoPE (Rotary Position Embedding)** — rotates Q and K vectors by a position-dependent angle; widely used in recent models because it handles relative positions cleanly and generalizes better to longer contexts [note: Hands-On LLMs Ch. 3].
- **ALiBi (Attention with Linear Biases)** — adds a static, position-dependent bias to attention scores; good extrapolation to longer sequences than seen in training.

The literature has not settled on a single winner. RoPE is the most common choice in open frontier models as of writing, but the space is actively evolving — don't assume a paper's positional scheme is the one a deployed model uses.

<AttentionHeatmap/>

## Model size and scaling laws

Two papers define the shape of the conversation about scale.

Kaplan et al. 2020 established that language model loss follows smooth power laws in three variables: parameters, training tokens, and compute [note: Kaplan et al. 2020, "Scaling Laws for Neural Language Models"]. Double any one of them in isolation and loss drops predictably. The paper's guidance suggested that parameter count should grow faster than data.

Hoffmann et al. 2022 — the Chinchilla paper — revised this, arguing that for a fixed compute budget, most models of the era were significantly undertrained. Their finding: parameters and training tokens should scale roughly in proportion. A "compute-optimal" model at a given FLOP budget is smaller and trained on more data than Kaplan's scaling curves suggested [note: Hoffmann et al. 2022, "Training Compute-Optimal Large Language Models"].

This is why a 2026 7B-parameter model can outperform a 2020-era 175B model on many benchmarks: it's trained on far more tokens, with better data, and better post-training. Parameter count alone is a weak proxy for capability.

The "emergent abilities" claim — that certain capabilities appear suddenly at scale rather than improving smoothly — was a popular framing [note: Wei et al. 2022]. A subsequent critique argued that many apparent emergences are artifacts of discontinuous metrics (exact-match accuracy) rather than genuine phase transitions; under smoother metrics the same curves look smooth [note: Schaeffer et al. 2023, "Are Emergent Abilities of Large Language Models a Mirage?"]. The debate is not fully resolved, and it matters for how you reason about scaling — treat "it'll just emerge at the next size" as a hope, not a plan.

## Post-training

A raw pretrained model is a next-token predictor. It is not, out of the box, an assistant. It will cheerfully continue text, including continuing your instruction as if it were narration rather than following it. Post-training is what turns the base model into something that behaves like a product [note: Huyen AIE Ch. 2].

The modern post-training stack has evolved through three major phases:

**Supervised fine-tuning (SFT).** Train the base model on a curated set of instruction–response pairs. This teaches it the shape of a helpful response — format, length, tone, the convention of actually answering the question. SFT alone can take a base model a long way, but it has a ceiling: it can only teach patterns present in the training data [note: Huyen AIE Ch. 2; Hands-On LLMs Ch. 3].

**Reinforcement Learning from Human Feedback (RLHF).** Collect human preference judgments between pairs of model outputs, train a reward model to predict those preferences, then fine-tune the base model with reinforcement learning (typically PPO) against that reward [note: Ouyang et al. 2022, "Training language models to follow instructions with human feedback"]. RLHF is what made GPT-3.5-era models feel markedly more aligned with user intent than pure SFT models. It is also expensive, unstable, and introduces its own failure modes (reward hacking, sycophancy, mode collapse on certain response shapes).

**Direct Preference Optimization (DPO) and successors.** DPO reframes preference learning as a direct supervised objective, eliminating the separate reward model and the RL loop [note: Rafailov et al. 2023, "Direct Preference Optimization"]. It is simpler to implement, more stable, and has become the default in many open-weights pipelines. Variants (IPO, KTO, ORPO, and others) continue to appear.

Post-training is also where safety behavior is installed — refusals, guardrails, style constraints. This is why the same base architecture can feel completely different depending on which lab shipped it. When a model "won't do X," the reason usually lives in post-training, not in the weights laid down during pretraining.

## Sampling strategies

At inference, the model emits a distribution over the next token. Sampling is how you collapse that distribution into a choice. It is the last layer of behavior shaping between the weights and your user, and the settings you pick determine how deterministic, creative, or erratic the output feels [note: Huyen AIE Ch. 2].

**Greedy decoding.** Always pick the highest-probability token. Fully deterministic. Produces output that is often repetitive and bland, because the model's single most likely continuation is usually a safe, common phrase. Good for tasks where you want the most probable answer and nothing else — classification, extraction, structured output.

**Temperature.** A scalar applied to the logits before softmax: lower temperatures sharpen the distribution (closer to greedy), higher temperatures flatten it (more randomness). Temperature 0 is effectively greedy; temperature 1 samples from the raw distribution; temperature > 1 adds noise [note: Huyen AIE Ch. 2; Hands-On LLMs Ch. 3].

**Top-k.** Keep only the *k* highest-probability tokens, renormalize, sample from that restricted set. Simple and bounded, but the right *k* is context-dependent — a fixed cutoff that's generous on a high-entropy next token is way too permissive on a low-entropy one.

**Top-p (nucleus sampling).** Keep the smallest set of tokens whose cumulative probability exceeds *p*, then sample from that set [note: Holtzman et al. 2019, "The Curious Case of Neural Text Degeneration"]. Adaptive to the shape of the distribution: narrow when the model is confident, wide when it isn't. Usually the default in production APIs, often combined with temperature.

**Min-p.** A more recent alternative that sets a dynamic floor as a fraction of the top token's probability. Intuition: allow anything that's within a relative margin of the most likely choice. Proponents argue it's more robust than top-p at high temperatures. Less battle-tested than top-p; worth knowing about, not yet a default.

**Repetition and presence penalties.** Scalars that reduce the probability of tokens that have already appeared, either recently or at all. Useful for generation tasks where models tend to loop; can hurt when repetition is correct (code, structured data, lists with necessary repeats).

Concretely, the same prompt with different sampling behaves very differently:

```text
Prompt: "Write one sentence about the ocean."

temp=0.0, top_p=1.0  →  "The ocean is vast and mysterious, covering more than seventy
                         percent of the Earth's surface."
temp=0.7, top_p=0.9  →  "Waves unfurl against the shore in quiet, repeating arcs
                         that carry the weight of the open sea."
temp=1.2, top_p=0.95 →  "Somewhere past the breakers, a column of light falls
                         through plankton and nothing observes it fall."
```

All three are plausible continuations. None is the "correct" one — they sit in different regions of the same distribution.

<TemperatureSampler/>

::callout{type="info"}
Sampling parameters are a product decision, not a default. Classification: temperature 0. Creative generation: temperature ≥ 0.7 with top-p. Structured output with retries: low temperature, no top-p exotica. Pick deliberately.
::

## The probabilistic nature of AI

This is the piece that most often trips engineers coming from deterministic systems. A model with temperature > 0 will give different outputs for the same prompt. That is not a bug, not a caching problem, not a sign of something broken. It is the mechanism working as designed [note: Huyen AIE Ch. 2].

The engineering implications compound:

- **Evaluation needs statistics, not single runs.** One pass over a test set with temperature > 0 tells you almost nothing. You need multiple runs, variance estimates, and metrics that are robust to that variance.
- **Retries are a legitimate pattern.** If a model fails a structured-output constraint at temperature 0.3, retrying may succeed. This is not hiding bugs; it is using the distribution responsibly.
- **Structured output needs validators, not hope.** JSON mode, schema enforcement, and function calling push the distribution toward valid shapes, but the only way to guarantee a valid output is to validate and reject.
- **Determinism is available if you need it.** Temperature 0 is close to deterministic; setting a fixed random seed (where the provider exposes it) gets you closer. Know which parts of your pipeline need determinism and which benefit from variance.

The mental model to hold: the model is not computing an answer. It is sampling from a distribution conditioned on your input. Your job as an engineer is to shape the distribution through training, prompting, and retrieval, then collapse it safely through sampling and validation.

## What's next

With the base layer in place, the next topics tighten the loop between model and product. **Prompt Engineering** covers how to shape the input distribution deliberately. **Evaluation** covers how to measure output quality when every run gives a different answer. Both assume the mechanics described here — read them as what you do *with* a foundation model, once you understand what it is.
