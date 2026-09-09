declare module "iban" {
  export function isValid(iban: string): boolean;
  export function isValidBBAN(countryCode: string, bban: string): boolean;
  export function printFormat(iban: string, separator?: string): string;
  export function electronicFormat(iban: string): string;
  export function toBBAN(iban: string, separator?: string): string;
  export function fromBBAN(countryCode: string, bban: string): string;
  export const countries: Record<string, unknown>;
}
