import { FormFieldType } from "./task-planner.js";
import { InspectedField } from "./form-inspector.js";

export interface FieldMapping {
  field: InspectedField;
  mappedType: FormFieldType;
  confidence: number;
  reason: string;
}

export class FieldMapper {
  mapField(field: InspectedField): FieldMapping | null {
    const searchableText = this.normalizeText(
      [
        field.label,
        field.name,
        field.id,
        field.placeholder,
        field.ariaLabel,
        field.type,
      ]
        .filter(Boolean)
        .join(" "),
    );

    if (!searchableText) {
      return null;
    }

    const twitterScore = this.scoreTwitterField(searchableText);
    const walletScore = this.scoreWalletField(searchableText);
    const emailScore = this.scoreEmailField(searchableText);
    const discordScore = this.scoreDiscordField(searchableText);
    const telegramScore = this.scoreTelegramField(searchableText);
    const tweetUrlScore = this.scoreTweetUrlField(searchableText);

    const candidates: Array<{
      type: FormFieldType;
      score: number;
      reason: string;
    }> = [
      {
        type: "TWITTER_HANDLE",
        score: twitterScore,
        reason: "Field mengandung indikator username/handle X/Twitter.",
      },
      {
        type: "WALLET_ADDRESS",
        score: walletScore,
        reason: "Field mengandung indikator wallet/EVM address.",
      },
      {
        type: "EMAIL",
        score: emailScore,
        reason: "Field mengandung indikator email.",
      },
      {
        type: "DISCORD",
        score: discordScore,
        reason: "Field mengandung indikator Discord.",
      },
      {
        type: "TELEGRAM",
        score: telegramScore,
        reason: "Field mengandung indikator Telegram.",
      },
      {
        type: "OWN_TWEET_URL",
        score: tweetUrlScore,
        reason: "Field mengandung indikator tweet/post URL.",
      },
    ];

    candidates.sort((a, b) => b.score - a.score);

    const best = candidates[0];

    if (!best || best.score <= 0) {
      return null;
    }

    return {
      field,
      mappedType: best.type,
      confidence: best.score,
      reason: best.reason,
    };
  }

  mapFields(fields: InspectedField[]): FieldMapping[] {
    return fields
      .map((field) => this.mapField(field))
      .filter((mapping): mapping is FieldMapping => mapping !== null);
  }

  private scoreTwitterField(text: string): number {
    if (
      this.containsAny(text, [
        "twitter username",
        "twitter handle",
        "twitter username",
        "x username",
        "x handle",
        "x account",
        "twitter account",
      ])
    ) {
      return 100;
    }

    if (
      this.containsAny(text, ["twitter", "twitter username", "twitter handle"])
    ) {
      return 90;
    }

    if (
      this.containsAny(text, ["username", "handle", "x username", "x handle"])
    ) {
      return 60;
    }

    return 0;
  }

  private scoreWalletField(text: string): number {
    if (
      this.containsAny(text, [
        "wallet address",
        "evm address",
        "ethereum address",
        "eth address",
        "crypto wallet",
      ])
    ) {
      return 100;
    }

    if (this.containsAny(text, ["wallet"])) {
      return 90;
    }

    if (
      this.containsAny(text, [
        "ethereum",
        "evm",
        "0x address",
        "blockchain address",
      ])
    ) {
      return 70;
    }

    return 0;
  }

  private scoreEmailField(text: string): number {
    if (this.containsAny(text, ["email address", "e-mail address"])) {
      return 100;
    }

    if (this.containsAny(text, ["email", "e-mail"])) {
      return 90;
    }

    return 0;
  }

  private scoreDiscordField(text: string): number {
    if (
      this.containsAny(text, [
        "discord username",
        "discord id",
        "discord handle",
      ])
    ) {
      return 100;
    }

    if (this.containsAny(text, ["discord"])) {
      return 90;
    }

    return 0;
  }

  private scoreTelegramField(text: string): number {
    if (
      this.containsAny(text, [
        "telegram username",
        "telegram id",
        "telegram handle",
      ])
    ) {
      return 100;
    }

    if (this.containsAny(text, ["telegram"])) {
      return 90;
    }

    return 0;
  }

  private scoreTweetUrlField(text: string): number {
    if (
      this.containsAny(text, [
        "tweet url",
        "tweet link",
        "twitter post url",
        "twitter post link",
        "x post url",
        "x post link",
      ])
    ) {
      return 100;
    }

    if (
      this.containsAny(text, [
        "tweet",
        "tweet url",
        "tweet link",
        "post url",
        "post link",
        "x post",
      ])
    ) {
      return 80;
    }

    return 0;
  }

  private containsAny(text: string, keywords: string[]): boolean {
    return keywords.some((keyword) =>
      text.includes(this.normalizeText(keyword)),
    );
  }

  private normalizeText(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");
  }
}
