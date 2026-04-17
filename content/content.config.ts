import { defineContentConfig, defineCollection, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    topics: defineCollection({
      type: 'page',
      source: 'topics/*.md',
      schema: z.object({
        id: z.string(),
        order: z.string(),
        title: z.string(),
        subtitle: z.string(),
        topic: z.string(),
        difficulty: z.enum(['intro', 'intermediate', 'advanced']).default('intermediate'),
        estimatedReadMinutes: z.number().default(20),
        hero: z.boolean().default(false),
        primitives: z.array(z.string()).default([]),
        citations: z.array(z.object({
          book: z.string(),
          chapters: z.string(),
          topic: z.string()
        })).default([]),
        tags: z.array(z.string()).default([]),
        updatedAt: z.string()
      })
    })
  }
})
