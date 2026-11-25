// SHIM: remove in Phase 8
// The content-template store and prompts live in @ats/org/server (Phase 4,
// map §4 L2). This shim keeps the app's templates.functions.ts imports on the
// exact old surface.
export type { TemplateKind, ResolvedTemplate } from "@ats/org/server";
export {
  TEMPLATE_KINDS,
  TEMPLATE_PLACEHOLDERS,
  TEMPLATE_EXTRACTION_HINT,
  LinkedinPostTemplateConfig,
  JdTemplateConfig,
  JobCardZone,
  JobCardTemplateConfig,
  OfferLetterTemplateConfig,
  resolveTemplate,
  findTemplateByName,
  pickTemplate,
  buildTemplateSystemPrompt,
  stripUnreplacedPlaceholders,
} from "@ats/org/server";
