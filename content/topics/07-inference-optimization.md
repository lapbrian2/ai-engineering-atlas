---
id: inference-optimization
order: 07
title: Inference Optimization
subtitle: Quantization, batching, KV cache, speculative decoding — the latency-quality-cost trilemma
topic: inference-optimization
difficulty: advanced
estimatedReadMinutes: 28
hero: false
primitives: [pareto-chart, quantization-calc]
citations:
  - { book: huyen-aie, chapters: "Ch. 9", topic: "inference optimization" }
  - { book: iusztin-labonne-handbook, chapters: "inference + deployment", topic: "production inference" }
  - { book: bouchard-production, chapters: "deployment chapters", topic: "production optimization" }
tags: [inference, quantization, kv-cache, speculative-decoding, throughput]
updatedAt: 2026-04-17
---

Training is where the model is built. Inference is where it pays for itself — or doesn't. For most production LLM systems the economics are inverted from the classical ML intuition: training happens once, inference happens forever, and the cumulative cost of serving dwarfs the one-time cost of training within weeks of launch [note: Huyen AIE Ch. 9]. This topic is about the systems-level techniques that decide whether a model you've trained can actually be served at the latency, throughput, and unit economics your product requires.

The underlying tension never goes away: you can trade quality for latency, latency for throughput, and all of them for cost, but you cannot improve all four simultaneously without a genuine algorithmic win. Inference optimization is the craft of knowing which axis to compress on, for which workload, using which lever.

## Inference economics

Inference cost is not a single number. It is the product of a model (weights, architecture, context length), a workload (token distribution, concurrency, tail behavior), and a serving stack (hardware, scheduler, kernels). Changing any of the three changes the bill.

Three separate questions every serving system must answer [note: Huyen AIE Ch. 9]:

- **How fast does a single request feel?** This is the latency axis — the user-perceived wait from send to complete.
- **How many requests can the cluster handle per second?** This is the throughput axis — the capacity the hardware actually delivers under load.
- **What does a million tokens cost?** This is the unit-economics axis — the price at which the product stays viable.

The traps are predictable. Teams optimize for one axis in a benchmark and discover the other two collapsed in production. A model served with batch size 1 has excellent latency and terrible throughput; the same model at batch size 64 inverts the story. The latency-quality-cost trilemma is not a slogan — it is a description of what happens every time you move a slider [note: Iusztin & Labonne, LLM Engineer's Handbook, inference chapters].

A practical framing worth internalizing: **latency is a product requirement, throughput is a capacity requirement, cost is a business requirement, and quality is the constraint that bounds all three**. Optimization is the negotiation between them.

<ParetoChart/>

## Inference performance metrics

You cannot optimize what you cannot measure, and "latency" alone is too coarse to be useful. Modern serving is measured against a specific vocabulary [note: Huyen AIE Ch. 9; Iusztin & Labonne, inference chapters].

- **Time to first token (TTFT)** — the wall-clock delay from request submission to the first output token. Dominated by the **prefill** phase, where the model processes all input tokens in parallel. TTFT scales roughly with input length and is what users feel as "is it thinking?"
- **Inter-token latency (ITL)** — the time between consecutive generated tokens during the **decode** phase. Decode is sequential by nature: each token depends on the previous one. ITL is what users feel as the stream's pace.
- **Tokens per second per user** — the streaming speed a single concurrent user observes. Roughly `1 / ITL`. This is the number that determines whether streaming feels fast or sluggish.
- **Throughput (tokens/sec, cluster-wide)** — aggregate generation rate across all concurrent requests. This is what the serving cluster delivers, not what any individual user sees.
- **P50 / P95 / P99 latency** — the percentile cuts. Tail latency is what kills product experience; a P99 that's 10x P50 means one in a hundred users has a visibly broken session.

Prefill and decode have genuinely different cost profiles. Prefill is compute-bound — it processes the entire prompt in one shot and can saturate GPU matrix units. Decode is memory-bandwidth-bound — it generates one token at a time, reading the full KV cache and weights on every step. This asymmetry is the reason modern serving stacks treat the two phases separately and is the foundation for techniques like chunked prefill and disaggregated serving [note: Huyen AIE Ch. 9].

A blunt but useful heuristic: if you care about TTFT, you are prefill-constrained. If you care about ITL and throughput, you are decode-constrained. Most production workloads are the latter, which is why most of the techniques below target decode.

## Hardware landscape

Inference performance is ultimately bounded by hardware, and two numbers matter more than any spec sheet headline: **memory capacity** (how large a model plus KV cache you can hold) and **memory bandwidth** (how fast the accelerator can stream those tensors to the compute units).

Decode-heavy workloads are memory-bandwidth-bound almost by definition: each token generation requires reading the model weights and the entire KV cache from HBM, performing a relatively small amount of compute, and writing back. When arithmetic intensity is low, compute units sit idle waiting for memory; in that regime, **bandwidth, not FLOPs, is the ceiling** [note: Huyen AIE Ch. 9].

The main accelerator families in production LLM serving:

- **NVIDIA GPUs** — A100 (Ampere) and H100 (Hopper) dominate training and inference. H100 adds native FP8 support via its Transformer Engine, which matters for post-training quantization pipelines. Both live in the data center; consumer cards (RTX 40-series) are viable for smaller models and development.
- **Google TPUs** — v4/v5 used heavily internally and via GCP, with large on-chip memory and tight integration to JAX/PyTorch XLA stacks.
- **AWS Trainium and Inferentia** — Amazon's inference-optimized silicon accessible via EC2 and SageMaker, aimed at cost-per-token at scale.

Every other axis — interconnect (NVLink, InfiniBand), host memory, disk — matters for distributed serving and model loading, not steady-state throughput. The constraint that actually limits a well-tuned serving stack is HBM bandwidth, and that is the one to check first when planning hardware [note: Huyen AIE Ch. 9; Iusztin & Labonne].

## Model-level optimization

Model-level optimizations change the weights or the computation graph itself. They apply once and affect every subsequent request. Four families matter: quantization, distillation, pruning, and inference-time use of adapters.

### Quantization

Quantization maps high-precision weights (FP16/BF16) to lower-bit formats — INT8, INT4, or custom 4-bit types — trading some representational precision for smaller memory footprint and higher effective bandwidth. For decode-bound inference, this is often the single highest-leverage intervention because it simultaneously reduces the memory the weights consume and increases the effective token rate per unit of bandwidth [note: Huyen AIE Ch. 9].

The relevant families:

- **GPTQ** (Frantar et al. 2022) — one-shot post-training quantization using approximate second-order information to minimize reconstruction error layer-by-layer [note: Frantar et al. 2022, GPTQ paper]. A standard 4-bit PTQ baseline for open-weight LLMs.
- **AWQ (Activation-aware Weight Quantization)** (Lin et al. 2023) — protects the weights corresponding to high-magnitude activations, based on the observation that a small salient fraction of weights dominate quantization error [note: Lin et al. 2023, AWQ paper].
- **SmoothQuant** (Xiao et al. 2022) — migrates quantization difficulty from activations to weights via an offline mathematically equivalent transform, enabling INT8 for both weights and activations [note: Xiao et al. 2022, SmoothQuant paper].
- **FP8** — 8-bit floating point formats (E4M3, E5M2) supported natively on H100 and newer accelerators, increasingly adopted in production inference pipelines for the quality-to-speed tradeoff they offer [note: Huyen AIE Ch. 9 on emerging low-precision formats].

<QuantizationCalc/>

The quantization choice is workload-dependent. Weight-only quantization (GPTQ, AWQ) reduces memory footprint and helps decode-bound workloads the most. Weight+activation quantization (SmoothQuant, FP8) is required to accelerate prefill meaningfully because prefill arithmetic is itself the bottleneck there.

::callout{type="warning"}
**Quantization quality depends on the model, calibration data, and task — do not trust benchmark numbers from a different model.** A method that preserves quality on one architecture can silently regress on another. Run your own eval on your own data before shipping a quantized model, every time [note: Huyen AIE Ch. 9].
::

### Distillation, pruning, LoRA at inference

- **Distillation** — train a smaller "student" model to mimic a larger "teacher." The resulting student is cheaper to serve and often recovers most of the teacher's quality on the distilled task. Used extensively in production where the deployed model is a task-specific distillate of a much larger frontier model [note: Huyen AIE Ch. 9].
- **Pruning** — remove weights or structured blocks that contribute little to outputs. Structured pruning (heads, layers, channels) yields real speedups; unstructured sparsity is harder to accelerate on standard GPUs without specialized kernels.
- **LoRA adapters at inference** — two options. **Merge** the adapter into the base weights for zero added latency, producing a task-specific checkpoint. Or **keep adapters separate** and serve multiple adapters against a shared base model, swapping per-request. The latter enables multi-tenant serving from a single loaded base, at the cost of managing adapter routing and the small overhead of the extra matmul.

The unifying principle: every model-level optimization spends quality (or training-time work) to buy inference efficiency. Measure the quality cost on *your* eval, not the published benchmark.

## Inference-service optimization

Service-level optimizations leave the model weights untouched and instead change how requests are scheduled, how state is reused, and how generation is parallelized. These are, collectively, where the last five years of serving-system research has landed most of its wins.

### Batching

A single decode step underutilizes modern GPUs — one token of generation does not come close to saturating the matrix units. Batching amortizes the cost of reading weights across multiple requests [note: Huyen AIE Ch. 9; Iusztin & Labonne].

- **Static batching** — form a batch, run it to completion, form the next batch. Simple. Terrible for LLM serving because requests finish at different times: a batch waits on its slowest member while faster requests sit idle. Under mixed-length workloads this is catastrophic.
- **Continuous batching** (also called *in-flight batching* or *iteration-level scheduling*) — batch at the token level rather than the request level. Each iteration, completed sequences leave the batch and new requests join. Introduced in the Orca paper (Yu et al. 2022) [note: Yu et al. 2022, Orca paper, OSDI]. This is the technique that made modern high-throughput LLM serving practical; it is now standard in production serving frameworks.

Continuous batching is the default and the reason most contemporary throughput numbers look radically better than naive-batching baselines from earlier literature.

### KV cache and PagedAttention

Transformer decoding generates one token at a time, and each step's attention computation needs the keys and values from every previous position. Recomputing them is catastrophically wasteful — instead, they are stored and reused: the **KV cache** [note: Huyen AIE Ch. 9].

The KV cache scales as `batch_size × num_layers × 2 × num_heads × head_dim × sequence_length`. At long contexts and high concurrency, this number rivals or exceeds the weight footprint itself. That makes KV cache memory management — not compute — the practical ceiling on concurrent users per GPU.

Naive contiguous allocation of KV cache leads to heavy fragmentation: each request needs a worst-case-sized contiguous slab, most of which goes unused, and the cluster runs out of memory before it runs out of compute. **PagedAttention** (Kwon et al. 2023), the technique introduced with vLLM, borrows the virtual memory paging idea from operating systems [note: Kwon et al. 2023, vLLM / PagedAttention paper, SOSP]. KV cache is stored in fixed-size blocks that need not be contiguous in physical memory; attention kernels are rewritten to read from the block table. This nearly eliminates fragmentation and enables aggressive memory sharing across concurrent requests [note: Kwon et al. 2023].

Closely related is **FlashAttention** (Dao et al. 2022), which rewrites the attention computation itself to be IO-aware — tiling, recomputation, and careful use of SRAM to minimize reads and writes to HBM [note: Dao et al. 2022, FlashAttention paper]. FlashAttention changes the wall-clock time of attention without changing its mathematical result; it is a kernel-level optimization that became foundational to both training and inference.

### Speculative decoding

Decode is sequential: token N+1 depends on token N. That serial dependency is the headline reason decode runs far below peak FLOPs. **Speculative decoding** breaks the dependency by using a small, fast *draft model* to propose several tokens ahead, which the large *target model* then verifies in parallel in a single forward pass [note: Leviathan et al. 2023; Chen et al. 2023]. Accepted drafts commit; rejections fall back to the target model's own next token. The sampling distribution is preserved exactly when the verification is done correctly — it is a lossless speedup, not an approximation [note: Leviathan et al. 2023, speculative decoding paper; Chen et al. 2023, accelerating LLM inference with speculative sampling].

The technique only helps when the draft model agrees with the target model often enough that the amortized cost of drafting + verifying is lower than pure target-model decoding. That condition is workload-dependent, which is why published speedup ratios vary across models and tasks and should not be quoted out of context.

### Chunked prefill

Prefill and decode have opposing profiles — prefill is compute-dense, decode is memory-bandwidth-bound — so running them together naively wastes one or the other. **Chunked prefill** splits long prompts into smaller chunks and interleaves them with decode steps, keeping both the compute units and the memory pipeline busy [note: Huyen AIE Ch. 9]. It improves TTFT for long-context requests and smooths interference between ongoing decode streams, at the cost of scheduler complexity.

## Serving frameworks

Several open-source frameworks implement the techniques above as end-to-end serving stacks. Each bundles its own mix of continuous batching, paged KV cache, quantization support, and scheduling policy.

- **vLLM** — introduced PagedAttention and continuous batching as a unified serving system [note: Kwon et al. 2023, vLLM paper]. Widely used as a reference implementation.
- **TGI (Text Generation Inference)** — Hugging Face's production serving stack, integrated with the Hub ecosystem and supporting multiple quantization backends.
- **SGLang** — emphasizes structured-generation and prompt-reuse primitives alongside continuous batching and paged KV cache.

These are reference points, not endorsements. The right framework for a given workload depends on model family, quantization needs, multi-tenancy requirements, and operational preferences. Benchmark on your own traffic before committing — published throughput comparisons shift with every release and rarely capture the workload you actually have.

## The pareto frontier

The techniques in this topic do not stack additively. Pushing every slider to maximum produces a model that is fast, cheap, and bad. The production craft is choosing a **point on the pareto frontier** that fits the product: the combination of quantization level, batch policy, model size, and hardware where marginal quality loss is no longer worth the efficiency gain [note: Huyen AIE Ch. 9; Iusztin & Labonne].

Some durable heuristics for navigating the frontier:

- **Start with the unquantized baseline on your eval.** You cannot measure the cost of any optimization without this number. Most teams skip it and then cannot tell whether their production model is fine or quietly broken.
- **Apply optimizations in order of reversibility.** Scheduler changes (continuous batching, paged KV cache) are free quality-wise and should be on by default. Weight-only quantization is next and usually low-cost on quality. Aggressive activation quantization and distillation come last because they are the hardest to undo.
- **Match the optimization to the bottleneck.** Decode-bound workloads benefit most from weight quantization, KV cache efficiency, and speculative decoding. Prefill-bound workloads benefit from activation quantization, FlashAttention, and chunked prefill. Applying the wrong lever wastes engineering time.
- **Measure on your traffic.** Published benchmark throughput rarely translates. Token distributions, concurrency patterns, and tail behavior are specific to your workload.

::callout{type="warning"}
**Throughput optimization without a quality regression test is a trap.** Continuous batching, quantization, and speculative decoding all preserve quality *when correctly implemented*. Implementation bugs, calibration drift, and draft-target mismatch silently degrade outputs. Always re-run your eval after any inference-stack change.
::

The discipline is the same as the rest of the stack: define the eval, hold quality fixed, push the other knobs until they stop helping, and keep the comparison honest.

## What's next

This topic covered what happens inside a single serving node. Getting from "my model runs fast on one GPU" to "my application serves reliably at scale" introduces a different class of problems: request routing, caching strategies, multi-model orchestration, failover, and the operational surfaces that decide whether an inference stack survives contact with real traffic.

- **System Architecture** — the layer above the serving node: gateways, routers, caches, circuit breakers, and the patterns that make AI-enabled applications composable and resilient.
- **Production** — the operational discipline of running what you've built: observability, guardrails, cost control, incident response, and the discipline that separates demos from durable systems.
