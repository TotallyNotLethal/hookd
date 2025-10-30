import { z } from 'zod';

import type { EnvironmentSnapshot } from './environmentTypes';
import type { ForecastBundle } from './forecastTypes';

export const CATCH_VISIBILITIES = ['public', 'water', 'private'] as const;

export type CatchVisibility = (typeof CATCH_VISIBILITIES)[number];

export const catchLocationSchema = z
  .object({
    waterbody: z
      .string()
      .trim()
      .min(1, 'Waterbody is required')
      .max(200, 'Waterbody must be 200 characters or fewer'),
    latitude: z
      .number({ invalid_type_error: 'Latitude must be a number' })
      .gte(-90)
      .lte(90)
      .optional(),
    longitude: z
      .number({ invalid_type_error: 'Longitude must be a number' })
      .gte(-180)
      .lte(180)
      .optional(),
    description: z
      .string()
      .trim()
      .max(280, 'Location description must be 280 characters or fewer')
      .optional(),
  })
  .refine(
    (value) => {
      if (value.latitude == null && value.longitude == null) {
        return true;
      }
      return value.latitude != null && value.longitude != null;
    },
    {
      message: 'Latitude and longitude must both be provided when sharing coordinates.',
      path: ['latitude'],
    },
  );

export const catchGearSchema = z.object({
  rod: z
    .string()
    .trim()
    .max(120, 'Rod description must be 120 characters or fewer')
    .optional(),
  reel: z
    .string()
    .trim()
    .max(120, 'Reel description must be 120 characters or fewer')
    .optional(),
  line: z
    .string()
    .trim()
    .max(120, 'Line description must be 120 characters or fewer')
    .optional(),
  lure: z
    .string()
    .trim()
    .max(120, 'Lure description must be 120 characters or fewer')
    .optional(),
  bait: z
    .string()
    .trim()
    .max(120, 'Bait description must be 120 characters or fewer')
    .optional(),
  presentation: z
    .string()
    .trim()
    .max(200, 'Presentation notes must be 200 characters or fewer')
    .optional(),
  notes: z
    .string()
    .trim()
    .max(400, 'Gear notes must be 400 characters or fewer')
    .optional(),
});

export const catchMeasurementsSchema = z
  .object({
    lengthInches: z
      .number({ invalid_type_error: 'Length must be a number' })
      .positive('Length must be positive')
      .max(400, 'Length must be realistic')
      .optional(),
    weightPounds: z
      .number({ invalid_type_error: 'Weight must be a number' })
      .positive('Weight must be positive')
      .max(400, 'Weight must be realistic')
      .optional(),
    girthInches: z
      .number({ invalid_type_error: 'Girth must be a number' })
      .positive('Girth must be positive')
      .max(400, 'Girth must be realistic')
      .optional(),
  })
  .superRefine((value, ctx) => {
    const nonNull = [value.lengthInches, value.weightPounds, value.girthInches].some((entry) => entry != null);
    if (!nonNull) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one measurement (length, weight, or girth).',
        path: ['lengthInches'],
      });
    }
  });

export const catchSharingSchema = z.object({
  visibility: z.enum(CATCH_VISIBILITIES, {
    required_error: 'Privacy level is required.',
    invalid_type_error: 'Privacy level is invalid.',
  }),
  shareWithCommunity: z.boolean().default(true),
  shareLocationCoordinates: z.boolean().default(false),
});

export const catchBaseSchema = z.object({
  species: z
    .string({ required_error: 'Species is required.' })
    .trim()
    .min(1, 'Species is required')
    .max(120, 'Species must be 120 characters or fewer'),
  caughtAt: z
    .string({ required_error: 'Capture time is required.' })
    .datetime({ offset: true, message: 'Capture time must be an ISO timestamp.' }),
  notes: z
    .string()
    .trim()
    .max(2000, 'Notes must be 2000 characters or fewer')
    .optional(),
  location: catchLocationSchema,
  gear: catchGearSchema.partial().default({}),
  measurements: catchMeasurementsSchema.optional(),
  sharing: catchSharingSchema,
  environmentSnapshot: z.custom<EnvironmentSnapshot>().optional(),
  forecastSnapshot: z.custom<ForecastBundle>().optional(),
});

export type CatchInput = z.infer<typeof catchBaseSchema>;

export const catchCreateSchema = catchBaseSchema.superRefine((value, ctx) => {
  if (value.sharing.shareLocationCoordinates && value.location.latitude == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Coordinate sharing enabled but coordinates missing.',
      path: ['location'],
    });
  }
});

export const catchUpdateSchema = catchBaseSchema
  .partial()
  .extend({ id: z.string().min(1) })
  .superRefine((value, ctx) => {
    if (!value.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Catch id is required for updates.',
        path: ['id'],
      });
    }
    if (value.caughtAt != null) {
      const candidate = new Date(value.caughtAt);
      if (Number.isNaN(candidate.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Capture time must be a valid ISO timestamp.',
          path: ['caughtAt'],
        });
      }
    }
  });

export type CatchUpdateInput = z.infer<typeof catchUpdateSchema>;

export type CatchRecord = CatchInput & {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export type CatchFilters = {
  visibility?: CatchVisibility;
  from?: Date;
  to?: Date;
  limit?: number;
};

export type CatchListResult = {
  entries: CatchRecord[];
};

export function validateCatchInput(payload: unknown): CatchInput {
  return catchCreateSchema.parse(payload);
}

export function validateCatchUpdate(payload: unknown): CatchUpdateInput {
  return catchUpdateSchema.parse(payload);
}

export function sanitizeMeasurements(
  measurements: CatchInput['measurements'],
): CatchRecord['measurements'] | undefined {
  if (!measurements) return undefined;
  const filtered: Record<string, number> = {};
  for (const [key, value] of Object.entries(measurements)) {
    if (value != null && Number.isFinite(value)) {
      filtered[key] = value;
    }
  }
  return Object.keys(filtered).length ? (filtered as CatchRecord['measurements']) : undefined;
}

export function sanitizeGear(gear: CatchInput['gear']): CatchRecord['gear'] | undefined {
  if (!gear) return undefined;
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(gear)) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        filtered[key] = trimmed;
      }
    }
  }
  return Object.keys(filtered).length ? (filtered as CatchRecord['gear']) : undefined;
}
