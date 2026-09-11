import { FieldMapper, FieldMapping } from "./field-mapper.js";
import { InspectedField } from "./form-inspector.js";
import { FormFieldType } from "./task-planner.js";

export type FieldMappingResolution =
  | {
      status: "MATCH";
      mapping: FieldMapping;
    }
  | {
      status: "AMBIGUOUS";
      candidates: FieldMapping[];
      reason: string;
    }
  | {
      status: "LOW_CONFIDENCE";
      candidates: FieldMapping[];
      reason: string;
    }
  | {
      status: "NOT_FOUND";
      candidates: [];
      reason: string;
    };

export interface FieldMappingResolverOptions {
  minimumConfidence?: number;
  ambiguityScoreDelta?: number;
}

export class FieldMappingResolver {
  private readonly minimumConfidence: number;
  private readonly ambiguityScoreDelta: number;

  constructor(
    private readonly mapper: FieldMapper,
    options: FieldMappingResolverOptions = {},
  ) {
    this.minimumConfidence = options.minimumConfidence ?? 80;

    this.ambiguityScoreDelta = options.ambiguityScoreDelta ?? 10;
  }

  resolve(
    type: FormFieldType,
    fields: InspectedField[],
    usedFieldIndexes: Set<number> = new Set(),
  ): FieldMappingResolution {
    const mappings = this.mapper
      .mapFields(fields)
      .filter(
        (mapping) =>
          mapping.mappedType === type &&
          !usedFieldIndexes.has(mapping.field.index),
      )
      .sort((a, b) => b.confidence - a.confidence);

    if (mappings.length === 0) {
      return {
        status: "NOT_FOUND",
        candidates: [],
        reason: `Tidak ditemukan field yang dapat di-map sebagai ${type}.`,
      };
    }

    const best = mappings[0];

    if (best.confidence < this.minimumConfidence) {
      return {
        status: "LOW_CONFIDENCE",
        candidates: mappings,
        reason: `Candidate terbaik untuk ${type} hanya memiliki confidence ${best.confidence}, di bawah minimum ${this.minimumConfidence}.`,
      };
    }

    const ambiguousCandidates = mappings.filter(
      (mapping) =>
        mapping.confidence >= this.minimumConfidence &&
        best.confidence - mapping.confidence <= this.ambiguityScoreDelta,
    );

    if (ambiguousCandidates.length > 1) {
      return {
        status: "AMBIGUOUS",
        candidates: ambiguousCandidates,
        reason: `Ditemukan ${ambiguousCandidates.length} candidate yang terlalu mirip untuk ${type}.`,
      };
    }

    return {
      status: "MATCH",
      mapping: best,
    };
  }
}
