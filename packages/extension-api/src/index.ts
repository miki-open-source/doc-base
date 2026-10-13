import type {
  Diagnostic,
  DocumentRecord,
  PresenterValue,
} from "@doc-base/schema";
export type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;
export type ReadonlyDocumentV1 = DeepReadonly<Omit<DocumentRecord, "ast">>;
export interface ReadonlyRelationshipV1 {
  readonly from: string;
  readonly to: string;
  readonly type: string;
  readonly label?: string;
}
export interface ReadonlyPublicConfigV1 {
  readonly schemaVersion: 1;
  readonly site: Readonly<{
    title: string;
    baseUrl: string;
    defaultAudience?: string;
  }>;
}
export type ResolveResultV1 =
  | { ok: true; document: ReadonlyDocumentV1; fragment?: string }
  | { ok: false; candidates: readonly string[] };
export interface ValidationContextV1 {
  readonly documents: readonly ReadonlyDocumentV1[];
  readonly relationships: readonly ReadonlyRelationshipV1[];
  readonly audiences: readonly string[];
  readonly config: ReadonlyPublicConfigV1;
  resolve(ref: string, fromDocumentKey: string): ResolveResultV1;
}
export type ExtensionDiagnosticV1 = Omit<
  Diagnostic,
  "code" | "severity" | "suppressible"
> & { code?: `DBX${number}`; severity?: Diagnostic["severity"] };
export interface ValidationRuleV1 {
  code: `DBX${number}`;
  defaultSeverity: Diagnostic["severity"];
  description: string;
  run(
    context: Readonly<ValidationContextV1>,
  ):
    | Iterable<ExtensionDiagnosticV1>
    | AsyncIterable<ExtensionDiagnosticV1>
    | Promise<Iterable<ExtensionDiagnosticV1>>;
}
export interface ReadonlyMetadataContextV1 {
  readonly document: ReadonlyDocumentV1;
  readonly audience: string | null;
}
export interface MetadataPresenterV1 {
  key: string;
  label: string;
  placement: "header" | "footer" | "sidebar";
  present(
    value: unknown,
    context: ReadonlyMetadataContextV1,
  ): PresenterValue | null;
}
export interface ExtensionSetupApiV1 {
  validation: { registerRule(rule: ValidationRuleV1): void };
  metadata: { registerPresenter(presenter: MetadataPresenterV1): void };
}
export interface DocBaseExtensionV1<TOptions = unknown> {
  apiVersion: "1";
  name: string;
  optionsSchema?: Record<string, unknown>;
  setup(api: ExtensionSetupApiV1, options: TOptions): void | Promise<void>;
}
export function defineExtension<T>(
  extension: DocBaseExtensionV1<T>,
): DocBaseExtensionV1<T> {
  return extension;
}
