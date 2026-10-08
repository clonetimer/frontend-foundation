export type UiText =
  | string
  | {
      key: string;
      defaultMessage: string;
    };

export interface TextResolver {
  resolve(text: UiText): string;
}

export function resolveDefaultText(text: UiText): string {
  return typeof text === 'string' ? text : text.defaultMessage;
}
