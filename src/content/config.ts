import { defineCollection, z } from 'astro:content';

const teamsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    name:         z.string(),
    urlSlug:      z.string(),    // used for /teams/[urlSlug] routing
    manager:      z.string(),
    managerRole:  z.string().default('Manager'),
    emoji:        z.string().default('⚽'),
    primaryColor: z.string().default('#00e676'),
    founded:      z.number().optional(),
    homeCity:     z.string().optional(),
    description:  z.string(),
    wins:         z.number().default(0),
    draws:        z.number().default(0),
    losses:       z.number().default(0),
    goalsFor:     z.number().default(0),
    goalsAgainst: z.number().default(0),
    points:       z.number().default(0),
  }),
});

const playersCollection = defineCollection({
  type: 'content',
  schema: z.object({
    name:        z.string(),
    team:        z.string(),      // team urlSlug reference e.g. "yanited"
    teamName:    z.string(),
    position:    z.string(),
    nationality: z.string().default('England'),
    goals:       z.number().default(0),
    assists:     z.number().default(0),
    appearances: z.number().default(0),
    number:      z.number().optional(),
    initials:    z.string().optional(),
  }),
});

const newsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title:    z.string(),
    date:     z.date(),
    category: z.string(),
    excerpt:  z.string(),
    author:   z.string().default('Baller League UK'),
    featured: z.boolean().default(false),
  }),
});

export const collections = {
  teams:   teamsCollection,
  players: playersCollection,
  news:    newsCollection,
};
